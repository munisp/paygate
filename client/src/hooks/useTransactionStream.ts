import { useEffect, useRef, useCallback } from "react";

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
 * Automatically reconnects with exponential back-off on disconnect.
 */
export function useTransactionStream({ onTransaction, enabled = true }: Options) {
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;
    const es = new EventSource("/api/events/transactions", { withCredentials: true });
    esRef.current = es;

    es.addEventListener("transaction.created", (e: MessageEvent) => {
      try {
        const tx: StreamTransaction = JSON.parse(e.data);
        onTransaction(tx);
        retryRef.current = 0; // reset back-off on successful message
      } catch {
        // ignore malformed payloads
      }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Exponential back-off: 1s, 2s, 4s, 8s … capped at 30s
      const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30_000);
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };
  }, [enabled, onTransaction]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [connect]);
}
