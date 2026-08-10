/**
 * PayGate Redis Cache Helper
 *
 * Provides a typed, namespace-aware cache layer backed by Redis.
 * Falls back to an in-process Map when REDIS_URL is not set (dev/test).
 *
 * Usage:
 *   import { cache } from "./cache";
 *   await cache.set("dashboard:overview", merchantId, data, 60);
 *   const hit = await cache.get("dashboard:overview", merchantId);
 *   await cache.del("dashboard:overview", merchantId);
 */

import { ENV } from "./_core/env";

// ─── TTL constants (seconds) ──────────────────────────────────────────────────
export const TTL = {
  /** Dashboard overview KPIs — refresh every 60s */
  DASHBOARD_OVERVIEW: 60,
  /** FX rates — refresh every 5 minutes */
  FX_RATES: 300,
  /** NIP account name lookup — 24h (changes rarely) */
  NIP_ACCOUNT: 86_400,
  /** Merchant profile — 5 minutes */
  MERCHANT_PROFILE: 300,
  /** Session token — 24h */
  SESSION: 86_400,
  /** Idempotency keys — 24h */
  IDEMPOTENCY: 86_400,
  /** Fraud score cache — 5 minutes */
  FRAUD_SCORE: 300,
} as const;

// ─── Cache namespace keys ─────────────────────────────────────────────────────
export type CacheNamespace =
  | "dashboard:overview"
  | "fx:rates"
  | "nip:account"
  | "merchant:profile"
  | "idempotency"
  | "fraud:score";

// ─── Cache interface ──────────────────────────────────────────────────────────
interface CacheStore {
  get(namespace: CacheNamespace, key: string): Promise<unknown | null>;
  set(namespace: CacheNamespace, key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(namespace: CacheNamespace, key: string): Promise<void>;
  flush(namespace: CacheNamespace): Promise<void>;
}

// ─── In-process fallback (dev/test) ──────────────────────────────────────────
class MemoryCache implements CacheStore {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  private makeKey(namespace: CacheNamespace, key: string) {
    return `paygate:${namespace}:${key}`;
  }

  async get(namespace: CacheNamespace, key: string): Promise<unknown | null> {
    const entry = this.store.get(this.makeKey(namespace, key));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(this.makeKey(namespace, key));
      return null;
    }
    return entry.value;
  }

  async set(namespace: CacheNamespace, key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(this.makeKey(namespace, key), {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(namespace: CacheNamespace, key: string): Promise<void> {
    this.store.delete(this.makeKey(namespace, key));
  }

  async flush(namespace: CacheNamespace): Promise<void> {
    const prefix = `paygate:${namespace}:`;
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }
}

// ─── Redis cache (production) ─────────────────────────────────────────────────
class RedisCache implements CacheStore {
  // Lazy-import ioredis to avoid hard dependency in dev
  private client: any = null;

  private async getClient() {
    if (this.client) return this.client;
    try {
      const { default: Redis } = await import("ioredis" as any);
        this.client = new Redis((ENV as any).REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        keyPrefix: "paygate:",
      });
      this.client.on("error", (err: Error) => {
        console.error("[redis] connection error:", err.message);
      });
    } catch (err) {
      console.error("[redis] ioredis not installed — falling back to memory cache");
      return null;
    }
    return this.client;
  }

  private makeKey(namespace: CacheNamespace, key: string) {
    return `${namespace}:${key}`;
  }

  async get(namespace: CacheNamespace, key: string): Promise<unknown | null> {
    const client = await this.getClient();
    if (!client) return null;
    const raw = await client.get(this.makeKey(namespace, key));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async set(namespace: CacheNamespace, key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    await client.setex(this.makeKey(namespace, key), ttlSeconds, JSON.stringify(value));
  }

  async del(namespace: CacheNamespace, key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    await client.del(this.makeKey(namespace, key));
  }

  async flush(namespace: CacheNamespace): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    const keys = await client.keys(`paygate:${namespace}:*`);
    if (keys.length > 0) await client.del(...keys);
  }
}

// ─── Export singleton ─────────────────────────────────────────────────────────
const redisUrl = (ENV as any).REDIS_URL;
export const cache: CacheStore = redisUrl
  ? new RedisCache()
  : new MemoryCache();

/**
 * withCache wraps an async factory function with cache-aside logic.
 *
 * @example
 * const overview = await withCache(
 *   "dashboard:overview", merchantId, TTL.DASHBOARD_OVERVIEW,
 *   () => getDashboardOverview(merchantId)
 * );
 */
export async function withCache<T>(
  namespace: CacheNamespace,
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>,
): Promise<T> {
  // Fail-open: if Redis is unavailable, skip cache and call factory directly
  try {
    const hit = await cache.get(namespace, key);
    if (hit !== null) return hit as T;
  } catch (err) {
    console.warn(`[cache] Redis unavailable for ${namespace}:${key} — falling through to factory:`, (err as Error).message);
    return factory();
  }
  const value = await factory();
  try {
    await cache.set(namespace, key, value, ttlSeconds);
  } catch (err) {
    console.warn(`[cache] Redis set failed for ${namespace}:${key} (non-fatal):`, (err as Error).message);
  }
  return value;
}
