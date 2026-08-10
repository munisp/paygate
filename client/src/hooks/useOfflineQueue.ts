/**
 * PayGate Web — useOfflineQueue Hook (Wave 19)
 *
 * Provides React components with:
 *  - `pendingCount`: number of queued offline mutations
 *  - `entries`: full list of queued entries
 *  - `flush()`: manually trigger a replay attempt
 *  - `discard(id)`: remove a specific entry
 *  - `enqueue(procedure, input)`: add a mutation to the queue
 *
 * Usage in a mutation:
 *   const { enqueue } = useOfflineQueue();
 *   const createTx = trpc.transactions.createTest.useMutation({
 *     onError: (err, variables) => {
 *       if (!navigator.onLine) enqueue("transactions.createTest", variables);
 *     },
 *   });
 */
import { useState, useEffect, useCallback } from "react";
import { offlineQueue, type QueueEntry } from "@/lib/offlineQueue";

export function useOfflineQueue() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);

  useEffect(() => {
    // Load initial state
    offlineQueue.getPending().then(setEntries);

    // Subscribe to changes
    const unsubscribe = offlineQueue.subscribe(setEntries);
    return unsubscribe;
  }, []);

  const flush = useCallback(async () => {
    setIsFlushing(true);
    try {
      // Use batchFlush (Go sync relay) for 2G-optimised single-request replay
      // Falls back to individual tRPC calls if relay is unavailable
      return await offlineQueue.batchFlush();
    } finally {
      setIsFlushing(false);
    }
  }, []);

  const enqueue = useCallback(
    (procedure: string, input: unknown) => offlineQueue.enqueue(procedure, input),
    []
  );

  const discard = useCallback(
    (id: string) => offlineQueue.discard(id),
    []
  );

  return {
    entries,
    pendingCount: entries.length,
    isFlushing,
    flush,
    enqueue,
    discard,
  };
}
