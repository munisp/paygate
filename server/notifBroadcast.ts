/**
 * notifBroadcast.ts
 *
 * Module-level registry for the SSE notification broadcast function.
 * The Express server registers the broadcaster once on startup; routers
 * (adminRouter, etc.) can call broadcastNotification() from anywhere
 * without needing access to the app instance.
 */

type BroadcastFn = (merchantId: string, notification: unknown) => void;

let _broadcaster: BroadcastFn | null = null;

/**
 * Called once by the server after setting up the SSE notifClients map.
 */
export function registerNotifBroadcaster(fn: BroadcastFn): void {
  _broadcaster = fn;
}

/**
 * Broadcast a notification to all SSE clients connected for the given merchant.
 * Safe to call even before the broadcaster is registered (no-op).
 */
export function broadcastNotification(merchantId: string, notification: unknown): void {
  if (_broadcaster) {
    _broadcaster(merchantId, notification);
  }
}
