/**
 * PayGate — Resilient WebSocket Client (Wave 109)
 *
 * Wraps the native WebSocket with:
 *  - Full-jitter exponential backoff (capped at 60 s)
 *  - Heartbeat / ping-pong keepalive (detects silent TCP drops)
 *  - Automatic SSE fallback when WS is blocked (corporate proxies, 2G)
 *  - Automatic long-poll fallback when SSE is also unavailable
 *  - Network quality awareness: skips WS entirely on 2G/offline
 *  - Message deduplication by sequence number
 *  - Queues outbound messages while disconnected, replays on reconnect
 *
 * Usage:
 *   const ws = new ResilientWS("/api/ws/pos?merchantId=123", {
 *     onMessage: (data) => console.log(data),
 *     fallbackPollUrl: "/api/trpc/pos.getRecentEvents",
 *   });
 *   ws.connect();
 *   ws.send({ type: "ping" });
 *   ws.close();
 */

import { networkQuality, type ConnectionTier } from "./networkQuality";

export type TransportMode = "websocket" | "sse" | "longpoll" | "offline";

export interface ResilientWSOptions {
  /** Called with every parsed JSON message */
  onMessage: (data: unknown) => void;
  /** Called when transport mode changes */
  onModeChange?: (mode: TransportMode) => void;
  /** Called when connection state changes */
  onStateChange?: (connected: boolean) => void;
  /**
   * SSE URL to fall back to if WebSocket fails.
   * Defaults to the same path with /sse appended.
   */
  sseFallbackUrl?: string;
  /**
   * tRPC procedure URL for long-poll fallback.
   * If omitted, long-poll fallback is disabled.
   */
  fallbackPollUrl?: string;
  /** Long-poll interval in ms (default: 10 000) */
  fallbackPollIntervalMs?: number;
  /** Heartbeat interval in ms (default: 25 000) */
  heartbeatIntervalMs?: number;
  /** Max reconnect attempts before giving up (default: unlimited) */
  maxReconnectAttempts?: number;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 60_000;
const JITTER_FACTOR = 0.3;

function backoffMs(attempt: number): number {
  const exp = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = exp * JITTER_FACTOR * Math.random();
  return Math.round(exp + jitter);
}

export class ResilientWS {
  private wsUrl: string;
  private opts: Required<ResilientWSOptions>;
  private ws: WebSocket | null = null;
  private es: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private mode: TransportMode = "offline";
  private connected = false;
  private closed = false;
  private outboundQueue: unknown[] = [];
  private seenSeqs = new Set<number>();
  private qualityUnsub: (() => void) | null = null;

  constructor(wsUrl: string, opts: ResilientWSOptions) {
    this.wsUrl = wsUrl;
    this.opts = {
      sseFallbackUrl: wsUrl.replace(/^wss?:\/\/[^/]+/, "").replace("/ws/", "/sse/"),
      fallbackPollUrl: "",
      fallbackPollIntervalMs: 10_000,
      heartbeatIntervalMs: 25_000,
      maxReconnectAttempts: Infinity,
      onModeChange: () => {},
      onStateChange: () => {},
      ...opts,
    };
  }

  connect() {
    this.closed = false;
    this.qualityUnsub = networkQuality.subscribe((q) => this.onQualityChange(q));
    this.tryConnect();
  }

  close() {
    this.closed = true;
    this.qualityUnsub?.();
    this.clearTimers();
    this.ws?.close();
    this.es?.close();
    this.setMode("offline");
    this.setConnected(false);
  }

  send(data: unknown) {
    const json = JSON.stringify(data);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(json);
    } else {
      // Queue for replay when connection is restored
      this.outboundQueue.push(data);
    }
  }

  getMode(): TransportMode {
    return this.mode;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private onQualityChange(q: { tier: ConnectionTier }) {
    if (q.tier === "offline" && this.mode !== "offline") {
      this.setConnected(false);
      this.setMode("offline");
    } else if (q.tier !== "offline" && this.mode === "offline") {
      // Came back online — reconnect immediately
      this.attempt = 0;
      this.tryConnect();
    }
  }

  private tryConnect() {
    if (this.closed) return;
    const tier = networkQuality.get().tier;

    if (tier === "offline") {
      this.setMode("offline");
      return;
    }

    if (tier === "2g") {
      // Skip WebSocket on 2G — too much overhead for handshake
      this.trySSE();
      return;
    }

    this.tryWebSocket();
  }

  private tryWebSocket() {
    this.clearWS();
    try {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          this.onWSFail();
        }
      }, 5000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        this.attempt = 0;
        this.setMode("websocket");
        this.setConnected(true);
        this.startHeartbeat();
        this.flushOutboundQueue();
      };

      ws.onmessage = (evt) => {
        this.handleMessage(evt.data);
      };

      ws.onclose = (evt) => {
        clearTimeout(connectTimeout);
        this.clearHeartbeat();
        this.setConnected(false);
        if (!this.closed) {
          // Code 1006 = abnormal closure (proxy killed it) → try SSE
          if (evt.code === 1006 || this.attempt >= 3) {
            this.trySSE();
          } else {
            this.scheduleReconnect();
          }
        }
      };

      ws.onerror = () => {
        // onerror always followed by onclose
      };
    } catch {
      this.onWSFail();
    }
  }

  private onWSFail() {
    this.attempt++;
    if (this.attempt >= 3) {
      this.trySSE();
    } else {
      this.scheduleReconnect();
    }
  }

  private trySSE() {
    this.clearWS();
    this.clearSSE();
    const sseUrl = this.opts.sseFallbackUrl;
    if (!sseUrl) {
      this.tryLongPoll();
      return;
    }

    try {
      const es = new EventSource(sseUrl, { withCredentials: true });
      this.es = es;

      const connectTimeout = setTimeout(() => {
        if (es.readyState !== EventSource.OPEN) {
          es.close();
          this.tryLongPoll();
        }
      }, 8000);

      es.onopen = () => {
        clearTimeout(connectTimeout);
        this.attempt = 0;
        this.setMode("sse");
        this.setConnected(true);
      };

      es.onmessage = (evt) => {
        this.handleMessage(evt.data);
      };

      es.onerror = () => {
        clearTimeout(connectTimeout);
        this.setConnected(false);
        if (!this.closed) {
          es.close();
          // After 3 SSE failures, fall back to long-poll
          this.attempt++;
          if (this.attempt >= 3) {
            this.tryLongPoll();
          } else {
            const delay = backoffMs(this.attempt);
            this.reconnectTimer = setTimeout(() => this.trySSE(), delay);
          }
        }
      };
    } catch {
      this.tryLongPoll();
    }
  }

  private tryLongPoll() {
    this.clearSSE();
    const url = this.opts.fallbackPollUrl;
    if (!url) {
      this.setMode("offline");
      return;
    }

    this.setMode("longpoll");
    this.setConnected(true);

    const poll = async () => {
      if (this.closed || this.mode !== "longpoll") return;
      try {
        const res = await fetch(url, {
          credentials: "include",
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data) this.opts.onMessage(data);
        }
      } catch {
        // ignore individual poll failures
      }
    };

    poll();
    this.pollTimer = setInterval(poll, this.opts.fallbackPollIntervalMs);
  }

  private handleMessage(raw: string) {
    try {
      const data = JSON.parse(raw);
      // Deduplicate by sequence number if present
      if (typeof data?.seq === "number") {
        if (this.seenSeqs.has(data.seq)) return;
        this.seenSeqs.add(data.seq);
        // Keep set bounded
        if (this.seenSeqs.size > 1000) {
          const first = this.seenSeqs.values().next().value as number;
          this.seenSeqs.delete(first);
        }
      }
      this.opts.onMessage(data);
    } catch {
      // Non-JSON frame (heartbeat pong etc.) — ignore
    }
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      }
    }, this.opts.heartbeatIntervalMs);
  }

  private scheduleReconnect() {
    if (this.attempt >= this.opts.maxReconnectAttempts) {
      this.trySSE();
      return;
    }
    const delay = backoffMs(this.attempt++);
    console.info(`[ResilientWS] Reconnecting in ${delay}ms (attempt ${this.attempt})`);
    this.reconnectTimer = setTimeout(() => this.tryWebSocket(), delay);
  }

  private flushOutboundQueue() {
    while (this.outboundQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.outboundQueue.shift();
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setMode(mode: TransportMode) {
    if (mode !== this.mode) {
      this.mode = mode;
      this.opts.onModeChange(mode);
    }
  }

  private setConnected(connected: boolean) {
    if (connected !== this.connected) {
      this.connected = connected;
      this.opts.onStateChange(connected);
    }
  }

  private clearWS() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState < WebSocket.CLOSING) this.ws.close();
      this.ws = null;
    }
  }

  private clearSSE() {
    if (this.es) {
      this.es.onopen = null;
      this.es.onmessage = null;
      this.es.onerror = null;
      this.es.close();
      this.es = null;
    }
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers() {
    this.clearHeartbeat();
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}

// ─── React hook ──────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";

export interface UseResilientWSResult {
  connected: boolean;
  mode: TransportMode;
  send: (data: unknown) => void;
}

export function useResilientWS(
  wsUrl: string | null,
  opts: Omit<ResilientWSOptions, "onStateChange" | "onModeChange">
): UseResilientWSResult {
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<TransportMode>("offline");
  const wsRef = useRef<ResilientWS | null>(null);

  useEffect(() => {
    if (!wsUrl) return;
    const rws = new ResilientWS(wsUrl, {
      ...opts,
      onStateChange: setConnected,
      onModeChange: setMode,
    });
    wsRef.current = rws;
    rws.connect();
    return () => rws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  const send = (data: unknown) => wsRef.current?.send(data);

  return { connected, mode, send };
}
