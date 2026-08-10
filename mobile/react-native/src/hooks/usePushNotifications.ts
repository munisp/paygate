/**
 * usePushNotifications — Expo Push Notification Integration
 *
 * Handles:
 *  1. Requesting OS permission for push notifications
 *  2. Obtaining the Expo Push Token (or FCM token on Android)
 *  3. Registering the token with the PayGate backend via tRPC
 *  4. Listening for foreground notifications (show in-app toast)
 *  5. Listening for notification taps (deep-link navigation)
 *  6. Deregistering on logout
 *
 * Usage:
 *   Call `usePushNotifications()` once in the root layout after auth.
 */
import { useEffect, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useNotificationStore } from "@/stores/notificationStore";

// ─── Notification handler (foreground) ───────────────────────────────────────
// Show banner + play sound even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Android channel ──────────────────────────────────────────────────────────
async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("paygate-transactions", {
    name: "Transactions",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#6366F1",
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("paygate-fraud", {
    name: "Fraud Alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lightColor: "#EF4444",
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("paygate-general", {
    name: "General",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
  });
}

// ─── Token registration ───────────────────────────────────────────────────────
async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("[Push] Skipping push registration — not a physical device");
    return null;
  }

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[Push] Permission denied");
    return null;
  }

  try {
    // Use FCM token on Android, Expo token on iOS (works with both FCM and APNs)
    if (Platform.OS === "android") {
      const { data } = await Notifications.getDevicePushTokenAsync();
      return data;
    }

    // iOS — get Expo push token (proxied through Expo's push service)
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn("[Push] No EAS project ID found — using device token directly");
      const { data } = await Notifications.getDevicePushTokenAsync();
      return data;
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    console.error("[Push] Failed to get push token:", err);
    return null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const router = useRouter();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const registerMutation = trpc.pushTokens.register.useMutation();

  const register = useCallback(async () => {
    const token = await registerForPushNotifications();
    if (!token) return;

    const platform: "fcm" | "apns" =
      Platform.OS === "android" ? "fcm" : "apns";

    const deviceId = Constants.deviceId ?? Constants.sessionId ?? "unknown";

    try {
      await registerMutation.mutateAsync({
        token,
        platform,
        deviceId,
        appVersion: Constants.expoConfig?.version ?? "1.0.0",
      });
      console.log("[Push] Token registered successfully");
    } catch (err) {
      console.warn("[Push] Token registration failed:", err);
    }
  }, [registerMutation]);

  useEffect(() => {
    register();

    // ── Foreground notification received ──────────────────────────────────────
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { title, body, data } = notification.request.content;
        // Add to in-app notification store so the feed updates instantly
        addNotification({
          id: data?.notificationId ?? Date.now(),
          type: (data?.type as string) ?? "system",
          title: title ?? "PayGate",
          body: body ?? "",
          isRead: false,
          priority: (data?.priority as any) ?? "medium",
          actionUrl: (data?.actionUrl as string) ?? null,
          metadata: data ? JSON.stringify(data) : null,
          entityId: (data?.entityId as string) ?? null,
          entityType: (data?.entityType as string) ?? null,
          createdAt: new Date(),
        });
      }
    );

    // ── Notification tap (background / killed) ────────────────────────────────
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        const actionUrl = data?.actionUrl as string | undefined;
        if (actionUrl) {
          // Deep-link into the app
          router.push(actionUrl as any);
        } else {
          // Default: open notifications tab
          router.push("/(tabs)/notifications");
        }
      }
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [register, addNotification, router]);

  return { register };
}
