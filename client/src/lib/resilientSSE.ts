/**
 * PayGate — Resilient SSE Hook (Wave 109)
 *
 * Wraps EventSource with:
 *  - Full-jitter exponential backoff (capped at 60 s)
 *  - Automatic polling fallback when SSE is unavailable
 *  - Network quality awareness (disables SSE on 2G, uses polling)
 *  - Visibility API integration (pauses when tab is hidden)
 *  - Heartbeat timeout detection (reconnects if no event in N seconds)
 *
 * Used by: NotificationPanel, useTransactionStream, FraudAlertsDashboard,
 *          WAFAlertDashboard, ConsumerFinancialHub, NotificationsCenter
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { networkQuality, adaptiveInterval, type ConnectionTier } from "./networkQuality";

export interface ResilientSSEOptions<T> {
  /** SSE endpoint URL */
  url: string;
  /** Polling fallback URL (tRPC or REST) */
  pollUrl?: string;
  /** Base polling interval for 4G (ms). Scaled by adaptiveInterval() for slower tiers. */
  pollIntervalMs?: number;
  /** Called with each parsed SSE message */
  onMessage: (data: T) => void;
  /** Called when connection state changes */
  onConnected?: (connected: boolean) => void;
  /** Max seconds without a message before reconnecting (default: 60) */
  heartbeatTimeoutSec?: number;
  /** Whether to pause SSE when the tab is hidden (default: true) */
  pauseOnHidden?: boolean;
  /** Whether to start immediately (default: true) */
  enabled?: boolean;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;

function jitteredBackoff(attempt: number): number {
  const exp = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  return Math.round(exp * (0.7 + 0.6 * Math.random()));
}

export function useResilientSSE<T = unknown>(opts: ResilientSSEOptions<T>) {
  const {
    url,
    pollUrl,
    pollIntervalMs = 30_000,
    onMessage,
    onConnected,
    heartbeatTimeoutSec = 60,
    pauseOnHidden = true,
    enabled = true,
  } = opts;

  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<"sse" | "poll" | "offline">("offline");

  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const clearAll = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (heartbeatRef.current) { clearTimeout(heartbeatRef.current); heartbeatRef.current = null; }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
  }, []);

  const resetHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
    heartbeatRef.current = setTimeout(() => {
      console.warn(`[ResilientSSE] Heartbeat timeout on ${url} — reconnecting`);
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
      onConnected?.(false);
      // Reconnect immediately
      attemptRef.current = 0;
      startSSE();
    }, heartbeatTimeoutSec * 1000);
  }, [url, heartbeatTimeoutSec]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPoll = useCallback(() => {
    if (!pollUrl || pollRef.current) return;
    setMode("poll");
    setConnected(true);
    onConnected?.(true);

    const tier: ConnectionTier = networkQuality.get().tier;
    const interval = adaptiveInterval(pollIntervalMs, tier) || pollIntervalMs * 5;

    const doPoll = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(pollUrl, {
          credentials: "include",
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data) onMessageRef.current(data as T);
        }
      } catch {
        // ignore individual poll failures
      }
    };

    doPoll();
    pollRef.current = setInterval(doPoll, interval);
  }, [pollUrl, pollIntervalMs, onConnected]);

  const startSSE = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    const tier = networkQuality.get().tier;
    if (tier === "offline") {
      setMode("offline");
      setConnected(false);
      onConnected?.(false);
      return;
    }

    // On 2G, skip SSE and go straight to polling
    if (tier === "2g") {
      startPoll();
      return;
    }

    clearAll();

    try {
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      const connectTimeout = setTimeout(() => {
        if (es.readyState !== EventSource.OPEN) {
          es.close();
          esRef.current = null;
          attemptRef.current++;
          startPoll();
        }
      }, 8_000);

      es.onopen = () => {
        clearTimeout(connectTimeout);
        attemptRef.current = 0;
        setMode("sse");
        setConnected(true);
        onConnected?.(true);
        resetHeartbeat();
      };

      es.onmessage = (evt) => {
        resetHeartbeat();
        try {
          const data = JSON.parse(evt.data) as T;
          onMessageRef.current(data);
        } catch {
          // Non-JSON keep-alive comment — ignore
        }
      };

      es.onerror = () => {
        clearTimeout(connectTimeout);
        if (!mountedRef.current) return;
        es.close();
        esRef.current = null;
        setConnected(false);
        onConnected?.(false);

        attemptRef.current++;
        if (attemptRef.current >= 4) {
          // Persistent failure → fall back to polling
          startPoll();
        } else {
          const delay = jitteredBackoff(attemptRef.current);
          console.info(`[ResilientSSE] Reconnecting ${url} in ${delay}ms (attempt ${attemptRef.current})`);
          reconnectRef.current = setTimeout(startSSE, delay);
        }
      };
    } catch {
      startPoll();
    }
  }, [url, enabled, clearAll, resetHeartbeat, startPoll, onConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    startSSE();

    // Network quality changes
    const unsub = networkQuality.subscribe((q) => {
      if (!mountedRef.current) return;
      if (q.tier === "offline") {
        clearAll();
        setMode("offline");
        setConnected(false);
        onConnected?.(false);
      } else if (mode === "offline") {
        attemptRef.current = 0;
        startSSE();
      }
    });

    // Visibility API — pause when hidden, resume when visible
    const onVisibility = () => {
      if (!pauseOnHidden || !mountedRef.current) return;
      if (document.hidden) {
        clearAll();
        setConnected(false);
        onConnected?.(false);
      } else {
        attemptRef.current = 0;
        startSSE();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mountedRef.current = false;
      clearAll();
      unsub();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { connected, mode };
}
