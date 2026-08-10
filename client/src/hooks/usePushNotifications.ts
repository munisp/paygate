/**
 * usePushNotifications — VAPID Web Push subscription hook
 *
 * Handles:
 *  1. Requesting browser notification permission
 *  2. Fetching the VAPID public key from the server
 *  3. Subscribing / unsubscribing via the PushManager
 *  4. Persisting the subscription in the backend via tRPC
 */
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export type PushPermission = "default" | "granted" | "denied";

export interface PushNotificationState {
  permission: PushPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const SUBSCRIPTION_KEY = "paygate_push_subscribed";

export function usePushNotifications(): PushNotificationState {
  const [permission, setPermission] = useState<PushPermission>(
    typeof Notification !== "undefined" ? (Notification.permission as PushPermission) : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(() => {
    try {
      return localStorage.getItem(SUBSCRIPTION_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  const { data: vapidData } = trpc.pushTokens.getVapidPublicKey.useQuery(undefined, {
    staleTime: Infinity,
  });

  const subscribeMutation = trpc.pushTokens.subscribeWebPush.useMutation();
  const unsubscribeMutation = trpc.pushTokens.unsubscribeWebPush.useMutation();

  // Sync subscription state with actual browser subscription on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        const subscribed = sub !== null;
        setIsSubscribed(subscribed);
        try {
          localStorage.setItem(SUBSCRIPTION_KEY, String(subscribed));
        } catch { /* ignore */ }
      });
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications are not supported in this browser.");
      return;
    }
    if (!vapidData?.publicKey) {
      toast.error("Push service not configured. Contact support.");
      return;
    }
    setIsLoading(true);
    try {
      // Request permission
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== "granted") {
        toast.error("Notification permission denied. Enable it in browser settings.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Subscribe via PushManager
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });
      const json = subscription.toJSON();
      await subscribeMutation.mutateAsync({
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
        deviceId: `browser-${navigator.userAgent.slice(0, 30)}`,
      });
      setIsSubscribed(true);
      localStorage.setItem(SUBSCRIPTION_KEY, "true");
      toast.success("Push notifications enabled! You'll receive real-time alerts.");
    } catch (err: any) {
      console.error("[usePushNotifications] subscribe error:", err);
      toast.error("Failed to enable push notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [vapidData, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeMutation.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      localStorage.setItem(SUBSCRIPTION_KEY, "false");
      toast.success("Push notifications disabled.");
    } catch (err: any) {
      console.error("[usePushNotifications] unsubscribe error:", err);
      toast.error("Failed to disable push notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [unsubscribeMutation]);

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
