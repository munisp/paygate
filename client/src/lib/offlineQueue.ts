/**
 * PayGate Web — Offline Request Queue (Wave 19)
 *
 * Stores failed tRPC mutations in IndexedDB and replays them when the
 * browser comes back online. Designed for low-connectivity environments
 * (2G, intermittent power) common in Nigeria.
 *
 * Architecture:
 *  - IndexedDB store "paygate_offline_queue" persists across page reloads
 *  - Each entry: { id, procedure, input, createdAt, attempts, status }
 *  - A single flush() call is triggered on window "online" event
 *  - Exponential backoff prevents hammering a weak connection
 *
 * Usage:
 *   import { offlineQueue } from "@/lib/offlineQueue";
 *   await offlineQueue.enqueue("transactions.createTest", { amount: 5000 });
 *   // On reconnect, flush() is called automatically
 */

export interface QueueEntry {
  id: string;
  procedure: string;
  input: unknown;
  createdAt: number;
  attempts: number;
  status: "pending" | "retrying" | "failed";
  lastError?: string;
}

const DB_NAME    = "paygate_offline";
const STORE_NAME = "queue";
const DB_VERSION = 1;
const MAX_ATTEMPTS = 5;

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, entry: QueueEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<QueueEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueueEntry[]);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── Queue class ──────────────────────────────────────────────────────────────

class OfflineQueue {
  private db: IDBDatabase | null = null;
  private flushing = false;
  private listeners: Array<(entries: QueueEntry[]) => void> = [];

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.flush());
    }
  }

  private async getDb(): Promise<IDBDatabase> {
    if (!this.db) this.db = await openDb();
    return this.db;
  }

  /** Persist a failed mutation for later replay. */
  async enqueue(procedure: string, input: unknown): Promise<string> {
    const entry: QueueEntry = {
      id: `oq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      procedure,
      input,
      createdAt: Date.now(),
      attempts: 0,
      status: "pending",
    };
    const db = await this.getDb();
    await idbPut(db, entry);
    this.notifyListeners();
    return entry.id;
  }

  /** Return all pending/retrying entries. */
  async getPending(): Promise<QueueEntry[]> {
    const db = await this.getDb();
    const all = await idbGetAll(db);
    return all.filter(e => e.status !== "failed" || e.attempts < MAX_ATTEMPTS);
  }

  /** Return count of pending entries (for badge display). */
  async pendingCount(): Promise<number> {
    const pending = await this.getPending();
    return pending.length;
  }

  /**
   * Replay all pending entries. Called automatically on "online" event.
   * Also callable manually (e.g., from a "Retry" button in the UI).
   */
  async flush(
    executor?: (procedure: string, input: unknown) => Promise<unknown>
  ): Promise<{ succeeded: number; failed: number }> {
    if (this.flushing || !navigator.onLine) return { succeeded: 0, failed: 0 };
    this.flushing = true;

    let succeeded = 0;
    let failed = 0;

    try {
      const pending = await this.getPending();
      if (pending.length === 0) return { succeeded: 0, failed: 0 };

      console.log(`[OfflineQueue] Flushing ${pending.length} queued requests`);

      for (const entry of pending) {
        const delay = Math.min(1_000 * Math.pow(2, entry.attempts), 30_000);
        if (entry.attempts > 0) await new Promise(r => setTimeout(r, delay));

        try {
          if (executor) {
            await executor(entry.procedure, entry.input);
          } else {
            // Default: call via tRPC REST bridge
            await this.defaultExecute(entry.procedure, entry.input);
          }
          const db = await this.getDb();
          await idbDelete(db, entry.id);
          succeeded++;
          console.log(`[OfflineQueue] Replayed: ${entry.procedure}`);
        } catch (err: any) {
          const db = await this.getDb();
          const updated: QueueEntry = {
            ...entry,
            attempts: entry.attempts + 1,
            status: entry.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "retrying",
            lastError: err?.message ?? "Unknown error",
          };
          await idbPut(db, updated);
          failed++;
          console.warn(`[OfflineQueue] Failed to replay ${entry.procedure}:`, err?.message);
        }
      }
    } finally {
      this.flushing = false;
      this.notifyListeners();
    }

    return { succeeded, failed };
  }

  /** Remove a specific entry (e.g., user dismisses it). */
  async discard(id: string): Promise<void> {
    const db = await this.getDb();
    await idbDelete(db, id);
    this.notifyListeners();
  }

  /** Clear all entries (e.g., on logout). */
  async clear(): Promise<void> {
    const db = await this.getDb();
    const all = await idbGetAll(db);
    for (const entry of all) await idbDelete(db, entry.id);
    this.notifyListeners();
  }

  /** Subscribe to queue changes (for React hooks). */
  subscribe(fn: (entries: QueueEntry[]) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private async notifyListeners(): Promise<void> {
    const pending = await this.getPending();
    this.listeners.forEach(fn => fn(pending));
  }

  private async defaultExecute(procedure: string, input: unknown): Promise<void> {
    // Call via the tRPC HTTP batch endpoint
    const [router, method] = procedure.split(".");
    const res = await fetch(`/api/trpc/${router}.${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ json: input }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
  }
}

export const offlineQueue = new OfflineQueue();
