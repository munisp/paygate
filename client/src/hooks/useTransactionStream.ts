import { useResilientSSE } from "@/lib/resilientSSE";

export type StreamTransaction = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  channel: string;
  customerEmail?: string | null;
  customerName?: string | null;
  description?: string | null;
  createdAt: string;
};

type Options = {
  onTransaction: (tx: StreamTransaction) => void;
  enabled?: boolean;
};

/**
 * Connects to /api/events/transactions (SSE) and calls onTransaction
 * whenever a new transaction.created event arrives.
 *
 * Uses useResilientSSE which provides:
 *   - Exponential back-off reconnect (1s → 60s with ±30% jitter)
 *   - Automatic polling fallback on persistent SSE failure (2G/EDGE)
 *   - Adaptive polling interval based on network quality tier
 *   - Heartbeat timeout detection (reconnects if silent >60s)
 *   - Tab-visibility pause to save battery on mobile devices
 */
export function useTransactionStream({ onTransaction, enabled = true }: Options) {
  const { connected, mode } = useResilientSSE<StreamTransaction>({
    url: "/api/events/transactions",
    pollUrl: "/api/trpc/transactions.list",
    pollIntervalMs: 15_000,
    enabled,
    onMessage: (data) => {
      try {
        const tx: StreamTransaction = typeof data === "string" ? JSON.parse(data) : data;
        onTransaction(tx);
      } catch {
        // ignore malformed payloads
      }
    },
    heartbeatTimeoutSec: 60,
    pauseOnHidden: true,
  });

  return { connected, mode };
}
