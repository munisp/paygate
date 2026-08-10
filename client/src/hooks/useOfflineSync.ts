/**
 * useOfflineSync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Offline resilience hook for PayGate Merchant Portal.
 * Provides:
 *   - Online/offline detection with reconnection events
 *   - Sync queue: mutations queued while offline, replayed when reconnected
 *   - Low-bandwidth detection (Network Information API)
 *   - Exponential backoff retry for failed mutations
 *   - Persistent queue via IndexedDB (survives page refresh)
 *
 * Usage:
 *   const { isOnline, isLowBandwidth, queueMutation, pendingCount } = useOfflineSync();
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface QueuedMutation {
  id: string;
  procedure: string;
  input: unknown;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

export interface OfflineSyncState {
  isOnline: boolean;
  isLowBandwidth: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────
const DB_NAME = "paygate-offline-sync";
const DB_VERSION = 1;
const STORE_NAME = "mutation-queue";

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(): Promise<QueuedMutation[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).index("timestamp").getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function dbPut(item: QueuedMutation): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

async function dbDelete(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

// ─── Network Information API ─────────────────────────────────────────────────
function getConnectionType(): { isLowBandwidth: boolean; effectiveType: string } {
  const nav = navigator as any;
  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (!conn) return { isLowBandwidth: false, effectiveType: "unknown" };
  const lowTypes = ["slow-2g", "2g"];
  return {
    isLowBandwidth: lowTypes.includes(conn.effectiveType) || conn.saveData === true,
    effectiveType: conn.effectiveType ?? "unknown",
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useOfflineSync(
  executor?: (mutation: QueuedMutation) => Promise<boolean>
) {
  const [state, setState] = useState<OfflineSyncState>({
    isOnline: navigator.onLine,
    isLowBandwidth: getConnectionType().isLowBandwidth,
    pendingCount: 0,
    isSyncing: false,
    lastSyncAt: null,
  });

  const executorRef = useRef(executor);
  executorRef.current = executor;
  const syncingRef = useRef(false);

  // Load initial queue count from IndexedDB
  useEffect(() => {
    dbGetAll().then((items) => {
      setState((s) => ({ ...s, pendingCount: items.length }));
    });
  }, []);

  // Online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setState((s) => ({ ...s, isOnline: true }));
      toast.success("Connection restored — syncing pending operations...");
      triggerSync();
    };

    const handleOffline = () => {
      setState((s) => ({ ...s, isOnline: false }));
      toast.warning("You are offline. Changes will be saved and synced when reconnected.");
    };

    const handleConnectionChange = () => {
      const { isLowBandwidth } = getConnectionType();
      setState((s) => ({ ...s, isLowBandwidth }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const nav = navigator as any;
    const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
    conn?.addEventListener("change", handleConnectionChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      conn?.removeEventListener("change", handleConnectionChange);
    };
  }, []);

  // Queue a mutation for offline execution
  const queueMutation = useCallback(async (
    procedure: string,
    input: unknown,
    maxRetries = 3
  ): Promise<void> => {
    const mutation: QueuedMutation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      procedure,
      input,
      timestamp: Date.now(),
      retries: 0,
      maxRetries,
    };

    await dbPut(mutation);
    setState((s) => ({ ...s, pendingCount: s.pendingCount + 1 }));

    if (navigator.onLine) {
      triggerSync();
    }
  }, []);

  // Sync all queued mutations
  const triggerSync = useCallback(async () => {
    if (syncingRef.current || !executorRef.current) return;
    syncingRef.current = true;
    setState((s) => ({ ...s, isSyncing: true }));

    try {
      const items = await dbGetAll();
      let successCount = 0;

      for (const item of items) {
        try {
          const success = await executorRef.current!(item);
          if (success) {
            await dbDelete(item.id);
            successCount++;
            setState((s) => ({ ...s, pendingCount: Math.max(0, s.pendingCount - 1) }));
          } else {
            // Increment retry count
            const updated = { ...item, retries: item.retries + 1 };
            if (updated.retries >= item.maxRetries) {
              await dbDelete(item.id);
              setState((s) => ({ ...s, pendingCount: Math.max(0, s.pendingCount - 1) }));
              toast.error(`Failed to sync operation: ${item.procedure}`);
            } else {
              await dbPut(updated);
              // Exponential backoff
              await new Promise((r) => setTimeout(r, Math.pow(2, updated.retries) * 1000));
            }
          }
        } catch {
          // Network error — stop syncing, will retry on next online event
          break;
        }
      }

      if (successCount > 0) {
        toast.success(`Synced ${successCount} pending operation${successCount > 1 ? "s" : ""}`);
      }

      setState((s) => ({ ...s, lastSyncAt: Date.now() }));
    } finally {
      syncingRef.current = false;
      setState((s) => ({ ...s, isSyncing: false }));
    }
  }, []);

  // Clear all queued mutations (use with caution)
  const clearQueue = useCallback(async () => {
    const items = await dbGetAll();
    await Promise.all(items.map((i) => dbDelete(i.id)));
    setState((s) => ({ ...s, pendingCount: 0 }));
  }, []);

  return {
    ...state,
    queueMutation,
    triggerSync,
    clearQueue,
  };
}

/**
 * Lightweight hook that only tracks online/offline status.
 * Use this in components that don't need the full sync queue.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return isOnline;
}

/**
 * Offline banner component data hook.
 * Returns banner visibility and connection quality info.
 */
export function useOfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLowBandwidth, setIsLowBandwidth] = useState(getConnectionType().isLowBandwidth);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    const nav = navigator as any;
    const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
    const handleChange = () => setIsLowBandwidth(getConnectionType().isLowBandwidth);
    conn?.addEventListener("change", handleChange);

    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      conn?.removeEventListener("change", handleChange);
    };
  }, []);

  return { isOnline, isLowBandwidth, showBanner: !isOnline || isLowBandwidth };
}
