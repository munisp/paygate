/**
 * useRealtimeNotifications
 *
 * Connects to the server-sent events (SSE) endpoint at
 * /api/mobile/notifications/stream using a Bearer token.
 *
 * Because React Native's built-in fetch does not support streaming,
 * we use a manual XMLHttpRequest-based SSE polyfill that works on both
 * iOS and Android without any native modules.
 *
 * Events handled:
 *  - "connected"     → initial unread count
 *  - "notification"  → new notification pushed by server
 *  - "transaction"   → transaction status update
 *  - ": heartbeat"   → keep-alive (ignored)
 */

import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useNotificationStore } from "../stores/notificationStore";
import { API_BASE_URL } from "../lib/trpc";
import { useAuth } from "../contexts/AuthContext";

const SSE_URL = `${API_BASE_URL}/api/mobile/notifications/stream`;
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useRealtimeNotifications() {
  const { token } = useAuth();
  const { addNotification, setUnreadCount, setConnected } = useNotificationStore();
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const lastIndexRef = useRef(0);
  const isMountedRef = useRef(true);

  const parseSSEChunk = useCallback(
    (chunk: string) => {
      // SSE format: "event: <name>\ndata: <json>\n\n"
      const lines = chunk.split("\n");
      let eventName = "message";
      let dataStr = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventName = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataStr = line.slice(6).trim();
        }
      }

      if (!dataStr) return;

      try {
        const payload = JSON.parse(dataStr);

        if (eventName === "connected") {
          setConnected(true);
          if (typeof payload.unreadCount === "number") {
            setUnreadCount(payload.unreadCount);
          }
        } else if (eventName === "notification") {
          addNotification({
            id: payload.id,
            type: payload.type ?? "system",
            title: payload.title ?? "",
            body: payload.body ?? "",
            isRead: payload.isRead ?? false,
            priority: payload.priority ?? "medium",
            actionUrl: payload.actionUrl ?? null,
            metadata: payload.metadata ?? null,
            entityId: payload.entityId ?? null,
            entityType: payload.entityType ?? null,
            createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
          });
        } else if (eventName === "transaction") {
          // Transaction update — add as a payment notification
          addNotification({
            id: payload.notificationId ?? Date.now(),
            type: "payment",
            title: payload.title ?? `Transaction ${payload.status}`,
            body:
              payload.body ??
              `${payload.reference ?? ""} — ₦${((payload.amount ?? 0) / 100).toLocaleString()} ${payload.status}`,
            isRead: false,
            priority: payload.status === "failed" ? "high" : "medium",
            actionUrl: payload.transactionId
              ? `/transactions/${payload.transactionId}`
              : null,
            metadata: JSON.stringify(payload),
            entityId: payload.transactionId ?? null,
            entityType: "transaction",
            createdAt: new Date(),
          });
        }
      } catch {
        // Ignore malformed JSON
      }
    },
    [addNotification, setUnreadCount, setConnected]
  );

  const connect = useCallback(() => {
    if (!token || !isMountedRef.current) return;
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }

    const url = `${SSE_URL}?token=${encodeURIComponent(token)}`;
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    lastIndexRef.current = 0;

    xhr.open("GET", url, true);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        if (xhr.status === 200) {
          attemptRef.current = 0;
          setConnected(true);
        } else {
          setConnected(false);
          scheduleReconnect();
        }
      }

      if (xhr.readyState === XMLHttpRequest.LOADING) {
        const newText = xhr.responseText.slice(lastIndexRef.current);
        lastIndexRef.current = xhr.responseText.length;

        // Split on double newline (SSE message boundary)
        const messages = newText.split("\n\n");
        for (const msg of messages) {
          if (msg.trim()) parseSSEChunk(msg);
        }
      }

      if (xhr.readyState === XMLHttpRequest.DONE) {
        setConnected(false);
        if (isMountedRef.current) scheduleReconnect();
      }
    };

    xhr.onerror = () => {
      setConnected(false);
      if (isMountedRef.current) scheduleReconnect();
    };

    xhr.send();
  }, [token, parseSSEChunk, setConnected]);

  const scheduleReconnect = useCallback(() => {
    if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) return;
    attemptRef.current += 1;
    const delay = Math.min(RECONNECT_DELAY_MS * attemptRef.current, 60_000);
    reconnectTimer.current = setTimeout(() => {
      if (isMountedRef.current) connect();
    }, delay);
  }, [connect]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    isMountedRef.current = true;
    if (token) connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
      setConnected(false);
    };
  }, [token, connect, setConnected]);

  // Reconnect when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active" && token && isMountedRef.current) {
          attemptRef.current = 0;
          connect();
        } else if (nextState === "background") {
          if (xhrRef.current) {
            xhrRef.current.abort();
            xhrRef.current = null;
          }
          setConnected(false);
        }
      }
    );
    return () => subscription.remove();
  }, [token, connect, setConnected]);

  return {
    isConnected: useNotificationStore((s) => s.isConnected),
  };
}
