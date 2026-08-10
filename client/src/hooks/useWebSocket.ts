/**
 * useWebSocket.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Robust WebSocket hook with automatic fallback to long-polling.
 * Features:
 *   - Auto-reconnect with exponential backoff (max 30s)
 *   - Heartbeat/ping-pong to detect stale connections
 *   - Graceful degradation to polling when WS is unavailable
 *   - Message queue: messages sent while disconnected are replayed on reconnect
 *   - Typed message protocol with topic-based subscriptions
 *
 * Usage:
 *   const { send, subscribe, isConnected, connectionMode } = useWebSocket();
 *   const unsub = subscribe("transaction.created", (data) => { ... });
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ConnectionMode = "websocket" | "polling" | "disconnected";

export interface WsMessage {
  topic: string;
  data: unknown;
  id?: string;
  timestamp?: number;
}

type MessageHandler = (data: unknown) => void;

// ─── Constants ────────────────────────────────────────────────────────────────
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const POLLING_INTERVAL_MS = 5_000;
const MAX_QUEUE_SIZE = 50;

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWebSocket(wsUrl?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscribers = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const messageQueue = useRef<WsMessage[]>([]);
  const wsUnavailable = useRef(false);

  // Resolve WebSocket URL
  const getWsUrl = useCallback(() => {
    if (wsUrl) return wsUrl;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/ws`;
  }, [wsUrl]);

  // Dispatch a message to all subscribers for a topic
  const dispatch = useCallback((msg: WsMessage) => {
    const handlers = subscribers.current.get(msg.topic);
    if (handlers) {
      handlers.forEach((h) => {
        try { h(msg.data); } catch (e) { console.error("[ws] Handler error:", e); }
      });
    }
    // Also dispatch to wildcard subscribers
    const wildcards = subscribers.current.get("*");
    if (wildcards) {
      wildcards.forEach((h) => {
        try { h(msg); } catch (e) { console.error("[ws] Wildcard handler error:", e); }
      });
    }
  }, []);

  // Start heartbeat
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
        // Set timeout for pong response
        heartbeatTimeoutTimer.current = setTimeout(() => {
          console.warn("[ws] Heartbeat timeout — closing connection");
          wsRef.current?.close();
        }, HEARTBEAT_TIMEOUT_MS);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, []);

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) { clearInterval(heartbeatTimer.current); heartbeatTimer.current = null; }
    if (heartbeatTimeoutTimer.current) { clearTimeout(heartbeatTimeoutTimer.current); heartbeatTimeoutTimer.current = null; }
  }, []);

  // Start polling fallback
  const startPolling = useCallback(() => {
    if (pollingTimer.current) return;
    setConnectionMode("polling");
    pollingTimer.current = setInterval(async () => {
      try {
        const res = await fetch("/api/events/poll", {
          credentials: "include",
          signal: AbortSignal.timeout(4_000),
        });
        if (res.ok) {
          const events: WsMessage[] = await res.json();
          events.forEach(dispatch);
        }
      } catch {
        // polling failed — silently continue
      }
    }, POLLING_INTERVAL_MS);
  }, [dispatch]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingTimer.current) { clearInterval(pollingTimer.current); pollingTimer.current = null; }
  }, []);

  // Connect WebSocket
  const connect = useCallback(() => {
    if (wsUnavailable.current) {
      startPolling();
      return;
    }

    try {
      const url = getWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionMode("websocket");
        reconnectAttempts.current = 0;
        stopPolling();
        startHeartbeat();

        // Flush queued messages
        const queued = [...messageQueue.current];
        messageQueue.current = [];
        queued.forEach((msg) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") {
            // Clear heartbeat timeout
            if (heartbeatTimeoutTimer.current) {
              clearTimeout(heartbeatTimeoutTimer.current);
              heartbeatTimeoutTimer.current = null;
            }
            return;
          }
          if (msg.topic) dispatch(msg as WsMessage);
        } catch {
          console.warn("[ws] Failed to parse message:", event.data);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        stopHeartbeat();

        if (event.code === 1008 || event.code === 4001) {
          // Auth error — don't reconnect
          setConnectionMode("disconnected");
          return;
        }

        // Schedule reconnect with exponential backoff
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts.current),
          RECONNECT_MAX_MS
        );
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, delay);

        // Fall back to polling while reconnecting
        if (reconnectAttempts.current >= 3) {
          startPolling();
        }
      };

      ws.onerror = () => {
        // If initial connection fails, mark WS as unavailable
        if (reconnectAttempts.current === 0) {
          wsUnavailable.current = true;
          startPolling();
        }
      };
    } catch {
      wsUnavailable.current = true;
      startPolling();
    }
  }, [getWsUrl, dispatch, startHeartbeat, stopHeartbeat, startPolling, stopPolling]);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopHeartbeat();
      stopPolling();
      wsRef.current?.close(1000, "Component unmounted");
    };
  }, [connect, stopHeartbeat, stopPolling]);

  // Subscribe to a topic
  const subscribe = useCallback((topic: string, handler: MessageHandler): (() => void) => {
    if (!subscribers.current.has(topic)) {
      subscribers.current.set(topic, new Set());
    }
    subscribers.current.get(topic)!.add(handler);
    return () => {
      subscribers.current.get(topic)?.delete(handler);
    };
  }, []);

  // Send a message (queued if disconnected)
  const send = useCallback((topic: string, data: unknown): void => {
    const msg: WsMessage = { topic, data, id: Date.now().toString(), timestamp: Date.now() };
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // Queue for when connection is restored
      if (messageQueue.current.length < MAX_QUEUE_SIZE) {
        messageQueue.current.push(msg);
      }
    }
  }, []);

  return { isConnected, connectionMode, send, subscribe };
}

/**
 * Subscribe to a specific WebSocket topic with automatic cleanup.
 */
export function useWebSocketTopic(
  topic: string,
  handler: (data: unknown) => void,
  wsHook: ReturnType<typeof useWebSocket>
) {
  useEffect(() => {
    return wsHook.subscribe(topic, handler);
  }, [topic, handler, wsHook]);
}
