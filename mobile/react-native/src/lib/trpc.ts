import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

// Default API base URL — override via environment or EAS config
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://paygate.manus.space";

// Module-scope auth token cache. AuthContext keeps this in sync with
// expo-secure-store so the tRPC client (created once at app start) always
// reads the current token synchronously on every request.
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function createTRPCClient(getToken: () => string | null = getAuthToken) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL}/api/trpc`,
        transformer: superjson,
        headers() {
          const token = getToken();
          if (!token) {
            // Fail loud: never silently send an unauthenticated request —
            // that caused 401 retry storms. Queries are only mounted after
            // auth state is loaded, so a missing token here is a bug.
            throw new Error(
              "[trpc] Missing auth token — refusing to send unauthenticated request",
            );
          }
          return { Authorization: `Bearer ${token}` };
        },
      }),
    ],
  });
}
