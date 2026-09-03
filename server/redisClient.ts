/**
 * redisClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Redis client for PayGate caching, session management, and rate limiting.
 * Uses ioredis for Node.js. Falls back gracefully when REDIS_URL is not set.
 *
 * Use cases:
 *   - API response caching (merchant data, exchange rates)
 *   - Distributed rate limiting (per-IP, per-merchant)
 *   - Session token blacklisting (logout)
 *   - Idempotency key storage (payment deduplication)
 *   - Real-time leaderboards (top merchants by volume)
 *   - Pub/Sub for live dashboard updates
 */

import { ENV } from "./_core/env";

// ─── Lazy client ─────────────────────────────────────────────────────────────
let _redis: any = null;

export async function getRedis() {
  if (!ENV.redisUrl) return null;
  if (_redis) return _redis;
  try {
    const { default: Redis } = await import("ioredis" as any);
    _redis = new Redis(ENV.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 5_000,
    });
    await _redis.connect();
    _redis.on("error", (err: Error) => {
      console.warn("[redis] Connection error:", err.message);
    });
    return _redis;
  } catch {
    console.warn("[redis] ioredis not available or REDIS_URL not set — caching disabled");
    return null;
  }
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Get a cached value. Returns null if not found or Redis unavailable.
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with optional TTL (seconds).
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<boolean> {
  try {
    const redis = await getRedis();
    if (!redis) return false;
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<boolean> {
  try {
    const redis = await getRedis();
    if (!redis) return false;
    await redis.del(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache with auto-fetch: returns cached value or calls fetcher and caches result.
 */
export async function cacheOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const value = await fetcher();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

/**
 * Sliding window rate limiter.
 * Returns { allowed, remaining, resetAt }.
 */
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = await getRedis();
  if (!redis) return { allowed: true, remaining: maxRequests, resetAt: Date.now() + windowSeconds * 1000 };

  try {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const redisKey = `rl:${key}`;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
    pipeline.zcard(redisKey);
    pipeline.expire(redisKey, windowSeconds);
    const results = await pipeline.exec();

    const count = results?.[2]?.[1] as number ?? 0;
    const allowed = count <= maxRequests;
    return {
      allowed,
      remaining: Math.max(0, maxRequests - count),
      resetAt: now + windowSeconds * 1000,
    };
  } catch {
    return { allowed: true, remaining: maxRequests, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

// ─── Idempotency ─────────────────────────────────────────────────────────────

/**
 * Check and set an idempotency key (for payment deduplication).
 * Returns true if this is a new request, false if it's a duplicate.
 */
export async function checkIdempotency(
  key: string,
  ttlSeconds = 86_400 // 24 hours
): Promise<{ isNew: boolean; existingResult?: unknown }> {
  const redis = await getRedis();
  if (!redis) return { isNew: true };

  try {
    const existing = await redis.get(`idem:${key}`);
    if (existing) {
      return { isNew: false, existingResult: JSON.parse(existing) };
    }
    // Reserve the key (will be updated with result after processing)
    await redis.set(`idem:${key}`, JSON.stringify({ status: "processing" }), "EX", ttlSeconds);
    return { isNew: true };
  } catch {
    return { isNew: true };
  }
}

/**
 * Store the result of an idempotent operation.
 */
export async function storeIdempotencyResult(
  key: string,
  result: unknown,
  ttlSeconds = 86_400
): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.set(`idem:${key}`, JSON.stringify(result), "EX", ttlSeconds);
  } catch {}
}

// ─── Session blacklist ────────────────────────────────────────────────────────

/**
 * Blacklist a JWT token (on logout).
 */
export async function blacklistToken(jti: string, expiresAt: number): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  const ttl = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  if (ttl > 0) {
    // JWT revocation persistence must never fail silently — a lost blacklist
    // entry means a logged-out token stays valid.
    await redis.set(`blacklist:${jti}`, "1", "EX", ttl).catch((e: unknown) => {
      console.error("[redis] blacklistToken persistence FAILED — token NOT revoked:", e instanceof Error ? e.message : String(e));
    });
  }
}

/**
 * Check if a token is blacklisted.
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;
  try {
    const val = await redis.get(`blacklist:${jti}`);
    return val === "1";
  } catch {
    return false;
  }
}

// ─── Pub/Sub for live dashboard ───────────────────────────────────────────────

/**
 * Publish a real-time event to a channel.
 */
export async function publishLiveEvent(channel: string, data: unknown): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;
  try {
    await redis.publish(channel, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// ─── Cache key builders ───────────────────────────────────────────────────────
export const CACHE_KEYS = {
  merchantStats: (merchantId: string) => `merchant:${merchantId}:stats`,
  exchangeRate: (from: string, to: string) => `fx:${from}:${to}`,
  merchantProfile: (merchantId: string) => `merchant:${merchantId}:profile`,
  transactionSummary: (merchantId: string, period: string) => `tx:${merchantId}:${period}`,
  fraudScore: (txId: string) => `fraud:${txId}:score`,
};
