/**
 * PayGate Rate Limiting Middleware
 *
 * Provides per-procedure/per-route, per-user rate limiting using a Redis-backed
 * sliding window algorithm (ZADD + ZREMRANGEBYSCORE + ZCARD pipeline).
 *
 * Store policy (FAIL CLOSED):
 *  - REDIS_URL set   → shared Redis sliding window (accurate across replicas).
 *  - REDIS_URL unset → in-process Map store with a loud WARN (per-replica only).
 *  - Redis errors    → fall back to the in-process counter (still throttled),
 *                      never fail open.
 *
 * Two integration surfaces:
 *  1. tRPC middleware: `procedure.use(rateLimit({ max, windowMs }))`
 *  2. Express middleware: `expressRateLimit({ max, windowMs })` and the
 *     pre-wired `trpcApiRateLimit()` classifier mounted on /api/trpc in
 *     server/_core/index.ts.
 */

import { TRPCError } from "@trpc/server";
import type { NextFunction, Request, RequestHandler, Response } from "express";

// ─── In-process fallback store ────────────────────────────────────────────────

interface WindowEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(memoryStore.entries())) {
    if (now > entry.resetAt) memoryStore.delete(key);
  }
}, 5 * 60 * 1000);

// ─── Redis sliding window ─────────────────────────────────────────────────────

/**
 * Implements a Redis sorted-set sliding window counter.
 * Each request is stored as a member with score = timestamp.
 * Old entries outside the window are pruned on every call.
 *
 * Returns { count, allowed } — count is the number of requests in the current window.
 */
async function redisSlideWindow(
  redisClient: any,
  key: string,
  max: number,
  windowMs: number,
): Promise<{ count: number; allowed: boolean; ttlMs: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const redisKey = `paygate:ratelimit:${key}`;

  // Pipeline: remove old, add new, count, expire
  const pipeline = redisClient.pipeline();
  pipeline.zremrangebyscore(redisKey, "-inf", windowStart);
  pipeline.zadd(redisKey, now, member);
  pipeline.zcard(redisKey);
  pipeline.pexpire(redisKey, windowMs);

  const results = await pipeline.exec();
  // results[2] is the ZCARD result: [error, count]
  const count: number = results?.[2]?.[1] ?? 1;
  const ttlMs = windowMs - (now - windowStart);

  return { count, allowed: count <= max, ttlMs };
}

// ─── In-process fallback ──────────────────────────────────────────────────────

function memorySlideWindow(
  key: string,
  max: number,
  windowMs: number,
): { count: number; allowed: boolean; ttlMs: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { count: 1, allowed: true, ttlMs: windowMs };
  }

  entry.count += 1;
  const ttlMs = entry.resetAt - now;
  return { count: entry.count, allowed: entry.count <= max, ttlMs };
}

// ─── Lazy Redis client ────────────────────────────────────────────────────────

let _redisClient: any = null;
let _redisAttempted = false;

async function getRedisClient(): Promise<any | null> {
  if (_redisAttempted) return _redisClient;
  _redisAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // FAIL CLOSED: keep throttling on the in-process store, but make the
    // degraded (per-replica, non-shared) posture impossible to miss.
    console.warn(
      "[rateLimit] WARNING: REDIS_URL is not set — using the in-process rate-limit store " +
      "(per-replica only, NOT cluster-accurate). Set REDIS_URL for shared sliding-window limiting."
    );
    return null;
  }

  try {
    const { default: Redis } = await import("ioredis" as any);
    _redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    _redisClient.on("error", () => {
      // Suppress — we fail-open below
    });
    await _redisClient.connect().catch(() => {
      _redisClient = null;
    });
  } catch {
    _redisClient = null;
  }

  return _redisClient;
}

// ─── Rate limit options ───────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. Default: 100 */
  max?: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
  /** Custom key prefix for namespacing. Default: procedure path */
  keyPrefix?: string;
}

// ─── Shared sliding-window core (FAIL CLOSED) ─────────────────────────────────

interface WindowResult {
  count: number;
  allowed: boolean;
  ttlMs: number;
}

/**
 * Consume one unit from the sliding window for `key`.
 *
 * Fail-closed: any Redis failure falls back to the in-process counter so the
 * caller is ALWAYS throttled — this function never "fails open".
 */
async function consume(key: string, max: number, windowMs: number): Promise<WindowResult> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      return await redisSlideWindow(redis, key, max, windowMs);
    }
  } catch (err) {
    console.warn(
      "[rateLimit] Redis error — falling back to in-process counter (fail-closed):",
      (err as Error).message
    );
  }
  return memorySlideWindow(key, max, windowMs);
}

// ─── tRPC middleware factory ──────────────────────────────────────────────────

/**
 * rateLimit returns a tRPC middleware that enforces a sliding window rate limit.
 *
 * Key format: `${keyPrefix || path}:${userId || ip}`
 *
 * When Redis is available, uses a sorted-set sliding window (accurate across replicas).
 * When Redis is unavailable or errors, falls back to an in-process counter (fail-closed).
 */
export function rateLimit(opts: RateLimitOptions = {}) {
  const max = opts.max ?? 100;
  const windowMs = opts.windowMs ?? 60_000;

  return async function rateLimitMiddleware({ ctx, next, path }: any) {
    const userId = (ctx as any).user?.id;
    const ip = (ctx as any).req?.ip ?? "unknown";
    const subject = userId ? `user:${userId}` : `anon:${ip}`;
    const effectiveMax = userId ? max : Math.min(max, 20);
    const key = `${opts.keyPrefix ?? path}:${subject}`;

    const result = await consume(key, effectiveMax, windowMs);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.ttlMs / 1000);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Retry after ${retryAfterSec}s. (${result.count}/${effectiveMax} in ${windowMs / 1000}s window)`,
      });
    }

    return next({ ctx });
  };
}

// ─── Express middleware factory ───────────────────────────────────────────────

/**
 * expressRateLimit returns an Express middleware enforcing the same sliding
 * window at the HTTP route layer. Requests are keyed by IP; requests that carry
 * credentials (session cookie or Bearer token) get the full budget, anonymous
 * requests are clamped to 20/min. Responds 429 with a Retry-After header.
 */
export function expressRateLimit(opts: RateLimitOptions = {}): RequestHandler {
  const max = opts.max ?? 100;
  const windowMs = opts.windowMs ?? 60_000;

  return async function expressRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const hasCredentials = Boolean(
      req.headers.cookie || req.headers.authorization?.startsWith("Bearer ")
    );
    const effectiveMax = hasCredentials ? max : Math.min(max, 20);
    const scope = opts.keyPrefix ?? `http:${req.method}:${req.baseUrl}${req.path}`;
    const key = `${scope}:${hasCredentials ? "auth" : "anon"}:${ip}`;

    const result = await consume(key, effectiveMax, windowMs);
    res.setHeader("X-RateLimit-Limit", String(effectiveMax));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, effectiveMax - result.count)));
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.ttlMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "Rate limit exceeded",
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }
    next();
  };
}

// ─── tRPC-over-HTTP classifier (mounted on /api/trpc) ─────────────────────────

/**
 * Procedure-path prefixes treated as money paths (financial bucket, 20/min):
 * payouts are further restricted to their own 10/min bucket below.
 */
const FINANCIAL_TRPC_PREFIXES = new Set([
  "payout", "payouts",
  "wallet", "wallets", "multiWallet",
  "ledger", "tigerbeetle",
  "settlement", "settlements",
  "transaction", "transactions", "tx",
  "billing", "billingExt", "portalBilling", "nexthubBilling",
  "chargeback", "chargebacks", "chargebackLifecycle",
  "dispute", "disputes",
  "transfer", "transfers",
  "fx", "crossborder", "corridor",
  "usdc", "crypto",
  "escrow", "bnpl", "sip",
  "mobileMoney", "mojaloop", "nip",
  "virtualCard", "virtualCards",
  "paymentLink", "paymentLinks",
  "terminal", "remittance",
]);

/** Payout initiation/approval gets the tightest bucket (10/min per subject). */
const PAYOUT_TRPC_PREFIXES = new Set(["payout", "payouts"]);

/** Export/report procedures (5/min — heavy queries). */
const EXPORT_TRPC_PREFIXES = new Set(["export", "reports", "regulatoryReports"]);

/** First path segment (procedure router name) of each procedure in a batch. */
function trpcProcedurePrefixes(req: Request): string[] {
  // After app.use("/api/trpc", …), req.path is "/<proc1>,<proc2>,…" (tRPC batch)
  // or "/<proc>". Each procedure is "<router>.<method>".
  const raw = req.path.replace(/^\/+/, "");
  if (!raw) return [];
  return raw
    .split(",")
    .map(p => p.split(".")[0]?.trim())
    .filter((p): p is string => Boolean(p));
}

/**
 * trpcApiRateLimit classifies every /api/trpc request and enforces the shared
 * buckets so no procedure is left unthrottled:
 *
 *   GET  (tRPC queries)                → read bucket        300 req/min
 *   POST with export procedure         → export bucket        5 req/min
 *   POST with payout procedure         → payout bucket       10 req/min
 *   POST with money-path procedure     → financial bucket    20 req/min
 *   POST anything else (mutations)     → mutation bucket    100 req/min
 *
 * Buckets are per-subject (IP) per-class — a client hammering one mutation
 * class cannot drain the budget of the others.
 */
export function trpcApiRateLimit(): RequestHandler {
  const buckets = {
    read: expressRateLimit({ max: 300, windowMs: 60_000, keyPrefix: "trpc:read" }),
    export: expressRateLimit({ max: 5, windowMs: 60_000, keyPrefix: "trpc:export" }),
    payout: expressRateLimit({ max: 10, windowMs: 60_000, keyPrefix: "trpc:payout" }),
    financial: expressRateLimit({ max: 20, windowMs: 60_000, keyPrefix: "trpc:financial" }),
    mutation: expressRateLimit({ max: 100, windowMs: 60_000, keyPrefix: "trpc:mutation" }),
  } as const;

  return function trpcApiRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    // tRPC mutations arrive as POST, queries as GET.
    if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH" && req.method !== "DELETE") {
      return buckets.read(req, res, next);
    }
    const prefixes = trpcProcedurePrefixes(req);
    if (prefixes.some(p => EXPORT_TRPC_PREFIXES.has(p))) return buckets.export(req, res, next);
    if (prefixes.some(p => PAYOUT_TRPC_PREFIXES.has(p))) return buckets.payout(req, res, next);
    if (prefixes.some(p => FINANCIAL_TRPC_PREFIXES.has(p))) return buckets.financial(req, res, next);
    return buckets.mutation(req, res, next);
  };
}

// ─── Pre-configured limiters ──────────────────────────────────────────────────

/** High-frequency read operations — 300 req/min */
export const readLimit = rateLimit({ max: 300, windowMs: 60_000 });

/** Standard mutations — 100 req/min */
export const mutationLimit = rateLimit({ max: 100, windowMs: 60_000 });

/** Sensitive financial operations — 20 req/min */
export const financialLimit = rateLimit({ max: 20, windowMs: 60_000 });

/** Authentication operations — 10 req/min */
export const authLimit = rateLimit({ max: 10, windowMs: 60_000 });

/** Export operations — 5 req/min */
export const exportLimit = rateLimit({ max: 5, windowMs: 60_000 });

/** Payout creation — 10 req/min */
export const payoutLimit = rateLimit({ max: 10, windowMs: 60_000, keyPrefix: "payout:create" });

/** Transaction creation — 100 req/min */
export const transactionLimit = rateLimit({ max: 100, windowMs: 60_000, keyPrefix: "tx:create" });

/** Webhook delivery — 50 req/min */
export const webhookLimit = rateLimit({ max: 50, windowMs: 60_000, keyPrefix: "webhook:deliver" });
