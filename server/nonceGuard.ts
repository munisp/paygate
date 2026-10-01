/**
 * nonceGuard.ts — shared Redis-backed nonce claim + counter primitives.
 *
 * Wave-5 in-memory store fixes (audit M1): single-use nonces and fixed-window
 * security counters MUST be shared across replicas and MUST fail closed.
 *
 * Primitives:
 *  - claimNonce(scope, id, ttlMs)  → SET paygate:nonce:{scope}:{id} 1 NX PX ttlMs
 *      true  = first claim (caller may proceed)
 *      false = already claimed (replay / duplicate — reject)
 *  - bumpCounter(key, ttlMs)       → INCR paygate:ctr:{key} (+ PEXPIRE on first bump)
 *      Returns the fixed-window counter value.
 *
 * Store policy (FAIL CLOSED for nonce claims):
 *  - Redis available      → authoritative shared store.
 *  - Redis unavailable, NODE_ENV === 'production'
 *                         → throw (nonce claims) — a replay guard that cannot
 *                           verify must reject the operation, never permit it.
 *  - Redis unavailable, non-production
 *                         → in-process Map fallback (dev/test only) with a loud
 *                           warning; per-replica only.
 */

import { ENV } from "./_core/env";

// ─── Lazy shared Redis client ─────────────────────────────────────────────────
let _redis: any = null;
let _redisAttempted = false;

export async function getGuardRedis(): Promise<any | null> {
  if (_redisAttempted) return _redis;
  _redisAttempted = true;
  const redisUrl = (ENV as any).redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[nonceGuard] REDIS_URL is not set in production — nonce/replay guards cannot " +
        "verify shared state and will FAIL CLOSED (reject operations)."
      );
    } else {
      console.warn(
        "[nonceGuard] REDIS_URL is not set — using in-process fallback (dev/test only, " +
        "per-replica, NOT cluster-accurate)."
      );
    }
    return null;
  }
  try {
    const { default: Redis } = await import("ioredis" as any);
    _redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    _redis.on("error", () => { /* handled at call sites (fail-closed) */ });
    await _redis.connect().catch(() => { _redis = null; });
  } catch {
    _redis = null;
  }
  return _redis;
}

/** Test hook: inject or reset the Redis client. */
export function __setGuardRedisForTest(client: any | null): void {
  _redis = client;
  _redisAttempted = true;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// ─── In-process fallback (dev/test only) ─────────────────────────────────────
const memoryNonces = new Map<string, number>(); // key → expiresAt
const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

// Periodic cleanup of the dev fallback stores (unref'd so tests can exit).
const _cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of Array.from(memoryNonces.entries())) {
    if (now > exp) memoryNonces.delete(k);
  }
  for (const [k, v] of Array.from(memoryCounters.entries())) {
    if (now > v.expiresAt) memoryCounters.delete(k);
  }
}, 60_000);
if (typeof (_cleanup as any).unref === "function") (_cleanup as any).unref();

function memoryClaimNonce(key: string, ttlMs: number): boolean {
  const now = Date.now();
  const exp = memoryNonces.get(key);
  if (exp !== undefined && now <= exp) return false;
  memoryNonces.set(key, now + ttlMs);
  return true;
}

// ─── claimNonce ───────────────────────────────────────────────────────────────

/**
 * Atomically claim a single-use nonce.
 * Returns true if this is the FIRST claim of `id` within `ttlMs`.
 *
 * FAIL CLOSED: when Redis is unavailable in production this throws — the
 * caller must treat a thrown error as "operation rejected".
 */
export async function claimNonce(scope: string, id: string, ttlMs: number): Promise<boolean> {
  const key = `paygate:nonce:${scope}:${id}`;
  try {
    const redis = await getGuardRedis();
    if (redis) {
      // SET key 1 NX PX ttl → "OK" on first claim, null when already present.
      const res = await redis.set(key, "1", "PX", ttlMs, "NX");
      return res === "OK";
    }
  } catch (err) {
    if (isProduction()) {
      throw new Error(
        `[nonceGuard] Redis error claiming nonce ${scope}:${id} — rejecting operation (fail-closed): ` +
        (err instanceof Error ? err.message : String(err))
      );
    }
    console.warn("[nonceGuard] Redis error — in-process fallback (dev only):", (err as Error)?.message ?? err);
  }
  if (isProduction()) {
    throw new Error(
      `[nonceGuard] Redis unavailable in production — cannot verify nonce ${scope}:${id}; rejecting (fail-closed)`
    );
  }
  return memoryClaimNonce(key, ttlMs);
}

// ─── bumpCounter (fixed window) ───────────────────────────────────────────────

/**
 * Increment a fixed-window counter and return the new value.
 * Window starts on the first bump; key expires `ttlMs` after that.
 *
 * Fail-closed for security controls: Redis errors in production rethrow for
 * nonce-class scopes; for counter scopes we fall back to the in-process counter
 * so callers are still throttled (never fail open).
 */
export async function bumpCounter(scope: string, id: string, ttlMs: number): Promise<number> {
  const key = `paygate:ctr:${scope}:${id}`;
  try {
    const redis = await getGuardRedis();
    if (redis) {
      const count: number = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, ttlMs);
      return count;
    }
  } catch (err) {
    console.warn("[nonceGuard] Redis counter error — in-process fallback (still throttled):", (err as Error)?.message ?? err);
  }
  const now = Date.now();
  const entry = memoryCounters.get(key);
  if (!entry || now > entry.expiresAt) {
    memoryCounters.set(key, { count: 1, expiresAt: now + ttlMs });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/** Delete a counter/nonce (e.g. clear login attempts after success). */
export async function clearGuardKey(scope: string, id: string, kind: "nonce" | "ctr" = "ctr"): Promise<void> {
  const key = `paygate:${kind}:${scope}:${id}`;
  try {
    const redis = await getGuardRedis();
    if (redis) { await redis.del(key); return; }
  } catch { /* best effort */ }
  memoryNonces.delete(key);
  memoryCounters.delete(key);
}

/** Peek a fixed-window counter without incrementing (dev fallback aware). */
export async function peekCounter(scope: string, id: string): Promise<number> {
  const key = `paygate:ctr:${scope}:${id}`;
  try {
    const redis = await getGuardRedis();
    if (redis) return Number(await redis.get(key)) || 0;
  } catch { /* fall through */ }
  const entry = memoryCounters.get(key);
  if (!entry || Date.now() > entry.expiresAt) return 0;
  return entry.count;
}
