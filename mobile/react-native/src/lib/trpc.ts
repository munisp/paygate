import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

// Default API base URL — override via environment or EAS config
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://paygate.manus.space";

export function createTRPCClient(getToken: () => string | null) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL}/api/trpc`,
        transformer: superjson,
        headers() {
          const token = getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
