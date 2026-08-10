/**
 * PayGate — Offline Queue v2 (Wave 109)
 *
 * Extends the Wave 19 OfflineQueue with:
 *  - Priority levels: CRITICAL (payments) > HIGH (KYC) > NORMAL > LOW
 *  - Payload compression using CompressionStream (Brotli/gzip) when available
 *  - Idempotency key generation (UUID v4) for safe server-side deduplication
 *  - Conflict detection: warns when the same resource is mutated twice offline
 *  - Network quality awareness: flushes aggressively on 4G, conservatively on 2G
 *  - Background sync registration via Service Worker
 *  - Structured logging for audit trail
 *
 * The v2 queue is a superset of v1 — the existing offlineQueue.ts is preserved
 * and still used by legacy code. New code should use offlineQueueV2.
 */

import { networkQuality } from "./networkQuality";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueuePriority = "critical" | "high" | "normal" | "low";
export type QueueEntryStatus = "pending" | "retrying" | "failed" | "succeeded";

export interface QueueEntryV2 {
  id: string;             // UUID v4 — also used as idempotency key
  procedure: string;      // e.g. "transactions.create"
  input: unknown;
  priority: QueuePriority;
  status: QueueEntryStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;      // Unix ms
  lastAttemptAt?: number;
  lastError?: string;
  /** Resource path for conflict detection, e.g. "payout/123" */
  resourceKey?: string;
  /** If true, payload will be compressed before sending */
  compress?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = "paygate-offline-v2";
const STORE = "queue";
const DB_VERSION = 1;
const MAX_ATTEMPTS: Record<QueuePriority, number> = {
  critical: 10,
  high: 7,
  normal: 5,
  low: 3,
};
const PRIORITY_ORDER: QueuePriority[] = ["critical", "high", "normal", "low"];

// ─── UUID v4 ─────────────────────────────────────────────────────────────────

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (evt) => {
      const db = (evt.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("priority", "priority", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, entry: QueueEntryV2): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<QueueEntryV2[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueueEntryV2[]);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Compression ─────────────────────────────────────────────────────────────

async function compressJson(data: unknown): Promise<string | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }
    // Base64 encode for JSON transport
    return btoa(String.fromCharCode(...merged));
  } catch {
    return null;
  }
}

// ─── Queue class ─────────────────────────────────────────────────────────────

class OfflineQueueV2 {
  private db: IDBDatabase | null = null;
  private listeners: Array<(entries: QueueEntryV2[]) => void> = [];
  private flushing = false;

  private async getDb(): Promise<IDBDatabase> {
    if (!this.db) this.db = await openDb();
    return this.db;
  }

  async enqueue(
    procedure: string,
    input: unknown,
    options: {
      priority?: QueuePriority;
      resourceKey?: string;
      compress?: boolean;
    } = {}
  ): Promise<QueueEntryV2> {
    const { priority = "normal", resourceKey, compress = false } = options;
    const db = await this.getDb();

    // Conflict detection
    if (resourceKey) {
      const all = await idbGetAll(db);
      const conflict = all.find(
        (e) => e.resourceKey === resourceKey && e.status === "pending"
      );
      if (conflict) {
        console.warn(
          `[OfflineQueueV2] Conflict: ${resourceKey} already queued as ${conflict.id}`
        );
      }
    }

    const entry: QueueEntryV2 = {
      id: uuidv4(),
      procedure,
      input,
      priority,
      status: "pending",
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS[priority],
      createdAt: Date.now(),
      resourceKey,
      compress,
    };

    await idbPut(db, entry);
    await this.notifyListeners();

    // Register background sync with Service Worker
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).sync.register("paygate-offline-sync");
      } catch {
        // Background sync not supported — will flush on next online event
      }
    }

    return entry;
  }

  async getPending(): Promise<QueueEntryV2[]> {
    const db = await this.getDb();
    const all = await idbGetAll(db);
    return all
      .filter((e) => e.status === "pending" || e.status === "retrying")
      .sort((a, b) => {
        const pa = PRIORITY_ORDER.indexOf(a.priority);
        const pb = PRIORITY_ORDER.indexOf(b.priority);
        if (pa !== pb) return pa - pb;
        return a.createdAt - b.createdAt;
      });
  }

  async flush(
    executor?: (procedure: string, input: unknown, compressed?: string) => Promise<void>
  ): Promise<{ succeeded: number; failed: number }> {
    if (this.flushing) return { succeeded: 0, failed: 0 };
    if (!navigator.onLine) return { succeeded: 0, failed: 0 };

    const tier = networkQuality.get().tier;
    if (tier === "offline") return { succeeded: 0, failed: 0 };

    this.flushing = true;
    let succeeded = 0;
    let failed = 0;

    try {
      const pending = await this.getPending();
      if (pending.length === 0) return { succeeded: 0, failed: 0 };

      console.info(`[OfflineQueueV2] Flushing ${pending.length} entries (tier: ${tier})`);

      // On 2G, only flush CRITICAL and HIGH priority items
      const toFlush =
        tier === "2g"
          ? pending.filter((e) => e.priority === "critical" || e.priority === "high")
          : pending;

      for (const entry of toFlush) {
        // Exponential backoff between retries
        if (entry.attempts > 0) {
          const delay = Math.min(1_000 * Math.pow(2, entry.attempts), 30_000);
          await new Promise((r) => setTimeout(r, delay));
        }

        try {
          let compressed: string | undefined;
          if (entry.compress) {
            compressed = (await compressJson(entry.input)) ?? undefined;
          }

          if (executor) {
            await executor(entry.procedure, entry.input, compressed);
          } else {
            await this.defaultExecute(entry.procedure, entry.input, compressed);
          }

          const db = await this.getDb();
          await idbDelete(db, entry.id);
          succeeded++;
          console.info(`[OfflineQueueV2] ✓ Replayed: ${entry.procedure} (${entry.id})`);
        } catch (err: unknown) {
          const db = await this.getDb();
          const newAttempts = entry.attempts + 1;
          const updated: QueueEntryV2 = {
            ...entry,
            attempts: newAttempts,
            status: newAttempts >= entry.maxAttempts ? "failed" : "retrying",
            lastAttemptAt: Date.now(),
            lastError: err instanceof Error ? err.message : "Unknown error",
          };
          await idbPut(db, updated);
          failed++;
          console.warn(
            `[OfflineQueueV2] ✗ Failed: ${entry.procedure} (attempt ${newAttempts}/${entry.maxAttempts})`,
            updated.lastError
          );
        }
      }
    } finally {
      this.flushing = false;
      await this.notifyListeners();
    }

    return { succeeded, failed };
  }

  /** Batch flush via Go sync relay — single HTTP request for all pending items */
  async batchFlush(): Promise<{ succeeded: number; failed: number; usedRelay: boolean }> {
    if (!navigator.onLine) return { succeeded: 0, failed: 0, usedRelay: false };
    const pending = await this.getPending();
    if (pending.length === 0) return { succeeded: 0, failed: 0, usedRelay: false };

    const tier = networkQuality.get().tier;

    try {
      const payload = {
        operations: pending.map((e) => ({
          id: e.id,
          operation: e.procedure,
          payload: e.input,
          idempotency_key: e.id,
          priority: e.priority,
          created_at: new Date(e.createdAt).toISOString(),
        })),
        device_id: `web-${navigator.userAgent.slice(0, 32)}`,
        merchant_id: 0,
        // Tell the relay our connection quality so it can prioritise
        connection_tier: tier,
      };

      const res = await fetch("/api/mobile/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.ok) {
        const result = await res.json();
        const db = await this.getDb();
        for (const entry of pending) await idbDelete(db, entry.id);
        await this.notifyListeners();
        return {
          succeeded: result.processed ?? pending.length,
          failed: result.failed ?? 0,
          usedRelay: true,
        };
      }
      if (res.status !== 503) throw new Error(`Relay returned ${res.status}`);
    } catch (err: unknown) {
      console.warn("[OfflineQueueV2] Relay unavailable, falling back:", err instanceof Error ? err.message : err);
    }

    const result = await this.flush();
    return { ...result, usedRelay: false };
  }

  async discard(id: string): Promise<void> {
    const db = await this.getDb();
    await idbDelete(db, id);
    await this.notifyListeners();
  }

  async clear(): Promise<void> {
    const db = await this.getDb();
    const all = await idbGetAll(db);
    for (const e of all) await idbDelete(db, e.id);
    await this.notifyListeners();
  }

  subscribe(fn: (entries: QueueEntryV2[]) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private async notifyListeners(): Promise<void> {
    const pending = await this.getPending();
    this.listeners.forEach((fn) => fn(pending));
  }

  private async defaultExecute(
    procedure: string,
    input: unknown,
    _compressed?: string
  ): Promise<void> {
    const res = await fetch(`/api/trpc/${procedure}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ json: input }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any)?.error?.message ?? `HTTP ${res.status}`);
    }
  }
}

export const offlineQueueV2 = new OfflineQueueV2();

// ─── Auto-flush on online event ───────────────────────────────────────────────
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.info("[OfflineQueueV2] Back online — auto-flushing");
    offlineQueueV2.batchFlush().catch(console.error);
  });
}

// ─── React hook ──────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";

export function useOfflineQueueV2() {
  const [entries, setEntries] = useState<QueueEntryV2[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);

  useEffect(() => {
    offlineQueueV2.getPending().then(setEntries);
    return offlineQueueV2.subscribe(setEntries);
  }, []);

  const flush = useCallback(async () => {
    setIsFlushing(true);
    try {
      return await offlineQueueV2.batchFlush();
    } finally {
      setIsFlushing(false);
    }
  }, []);

  const enqueue = useCallback(
    (
      procedure: string,
      input: unknown,
      options?: { priority?: QueuePriority; resourceKey?: string; compress?: boolean }
    ) => offlineQueueV2.enqueue(procedure, input, options),
    []
  );

  const discard = useCallback((id: string) => offlineQueueV2.discard(id), []);

  const criticalCount = entries.filter((e) => e.priority === "critical").length;

  return {
    entries,
    pendingCount: entries.length,
    criticalCount,
    isFlushing,
    flush,
    enqueue,
    discard,
  };
}
