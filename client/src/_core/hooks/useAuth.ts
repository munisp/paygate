import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useRef } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/**
 * Silently refresh the portal session JWT via the /api/auth/refresh endpoint.
 *
 * The server reads the httpOnly refresh_token cookie, exchanges it with
 * Keycloak for a new access token, and re-issues the session JWT + id_token
 * cookies. Returns true on success, false if the refresh token is expired
 * (the user must re-authenticate).
 */
async function silentRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  // Track whether a silent refresh is already in flight to avoid double-calls
  const refreshingRef = useRef(false);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      // Pass the current origin so the server can build the correct
      // post_logout_redirect_uri for Keycloak's end-session endpoint.
      const result = await logoutMutation.mutateAsync({
        origin: window.location.origin,
      });

      // If Keycloak returned an SSO logout URL, redirect the browser there.
      // This terminates the Keycloak SSO session so the user must enter
      // credentials again on the next login (important for shared/kiosk machines).
      if (result?.ssoLogoutUrl) {
        window.location.href = result.ssoLogoutUrl;
        return; // navigation takes over; no further state updates needed
      }
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        // Session already expired — treat as successful logout
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  /**
   * Proactive silent refresh — called periodically while the user is
   * authenticated to keep the session alive without a visible re-login.
   *
   * Strategy: refresh 60 seconds before the Keycloak access token expires
   * (default 5 min = 300s → refresh at t=240s). We poll every 4 minutes
   * (240s) which is safe even if the tab is backgrounded.
   *
   * On failure (expired refresh token), the next tRPC query will return
   * UNAUTHORIZED and main.tsx's global error handler will redirect to login.
   */
  useEffect(() => {
    if (!meQuery.data) return; // only schedule when authenticated

    // Keycloak default access token lifetime is 300s; refresh at 240s
    const REFRESH_INTERVAL_MS = 240_000;

    const id = setInterval(async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const ok = await silentRefresh();
        if (ok) {
          // Re-fetch auth state so the UI reflects the refreshed session
          await utils.auth.me.invalidate();
        }
        // If !ok, the refresh token has expired. The next protected tRPC
        // call will return UNAUTHORIZED and the global error handler in
        // main.tsx will redirect to login — no extra action needed here.
      } finally {
        refreshingRef.current = false;
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [meQuery.data, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    silentRefresh,
    logout,
  };
}
