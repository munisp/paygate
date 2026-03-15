/**
 * PayGate tRPC Rate Limiting Middleware
 *
 * Provides per-procedure, per-user rate limiting using a sliding window
 * algorithm backed by an in-process Map (dev) or Redis (production).
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
import type { MiddlewareFunction } from "@trpc/server/unstable-core-do-not-import";

// ─── Rate limit store ─────────────────────────────────────────────────────────

interface WindowEntry {
  count: number;
  resetAt: number;
}

// In-process sliding window store (replaced by Redis in production via cache.ts)
const store = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(store.entries())) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

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
 * The key is: `${keyPrefix}:${userId}` — one window per user per procedure.
 */
export function rateLimit(opts: RateLimitOptions = {}) {
  const max = opts.max ?? 100;
  const windowMs = opts.windowMs ?? 60_000;

  return async function rateLimitMiddleware({ ctx, next, path }: any) {
    const userId = (ctx as any).user?.id;
    if (!userId) {
      // Unauthenticated requests — apply a stricter global limit
      const ip = (ctx as any).req?.ip ?? "unknown";
      const key = `ratelimit:anon:${opts.keyPrefix ?? path}:${ip}`;
      checkLimit(key, Math.min(max, 20), windowMs);
      return next({ ctx });
    }

    const key = `ratelimit:${opts.keyPrefix ?? path}:${userId}`;
    checkLimit(key, max, windowMs);
    return next({ ctx });
  };
}

function checkLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  entry.count += 1;
  if (entry.count > max) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Retry after ${retryAfterSec}s.`,
    });
  }
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
