/**
 * PayGate tRPC Rate Limiting Middleware
 *
 * Provides per-procedure, per-user rate limiting using a Redis-backed
 * sliding window algorithm (ZADD + ZREMRANGEBYSCORE + ZCARD pipeline).
 * Falls back to an in-process Map when Redis is unavailable (fail-open).
 *
 * Usage in routers.ts:
 *   const rateLimitedProcedure = protectedProcedure.use(rateLimit({ max: 100, windowMs: 60_000 }));
 *
 * Or apply to a specific procedure:
 *   create: protectedProcedure
 *     .use(rateLimit({ max: 20, windowMs: 60_000 }))
 *     .input(schema)
 *     .mutation(...)
 */

import { TRPCError } from "@trpc/server";

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
  if (!redisUrl) return null;

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

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * rateLimit returns a tRPC middleware that enforces a sliding window rate limit.
 *
 * Key format: `${keyPrefix || path}:${userId || ip}`
 *
 * When Redis is available, uses a sorted-set sliding window (accurate across replicas).
 * When Redis is unavailable, falls back to an in-process counter (fail-open).
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

    try {
      const redis = await getRedisClient();

      let result: { count: number; allowed: boolean; ttlMs: number };
      if (redis) {
        result = await redisSlideWindow(redis, key, effectiveMax, windowMs);
      } else {
        result = memorySlideWindow(key, effectiveMax, windowMs);
      }

      if (!result.allowed) {
        const retryAfterSec = Math.ceil(result.ttlMs / 1000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Retry after ${retryAfterSec}s. (${result.count}/${effectiveMax} in ${windowMs / 1000}s window)`,
        });
      }
    } catch (err) {
      // Re-throw TRPCErrors (rate limit exceeded)
      if (err instanceof TRPCError) throw err;
      // For any other error (Redis pipeline failure, etc.) — fail-open
      console.warn("[rateLimit] Redis error — failing open:", (err as Error).message);
    }

    return next({ ctx });
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
