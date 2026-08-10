import { useEffect } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import { trpc, createTRPCClient } from "../src/lib/trpc";
import { usePushNotifications } from "../src/hooks/usePushNotifications";

SplashScreen.preventAutoHideAsync();

// Foreground notification handler — show banner even when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

/**
 * Registers the device for push notifications once the user is authenticated.
 * Must be rendered inside AuthProvider so it has access to the tRPC client
 * (which needs the auth token).
 */
function PushNotificationBridge() {
  const { token } = useAuth();
  // Only register when the user is logged in
  usePushNotifications();
  return null;
}

function RootLayoutNav() {
  const { token, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <>
      {/* Wire push notifications for authenticated users */}
      {token && <PushNotificationBridge />}
      <Stack screenOptions={{ headerShown: false }}>
        {!token ? (
          <Stack.Screen name="(auth)" />
        ) : (
          <Stack.Screen name="(tabs)" />
        )}
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const trpcClient = createTRPCClient(() => null); // token injected per-request via AuthContext

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <RootLayoutNav />
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
