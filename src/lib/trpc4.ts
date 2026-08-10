/**
 * trpc4.ts — tRPC client for Wave 76 new features router (/api/trpc4)
 */
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { newFeaturesRouter } from "../../server/newFeaturesRouter";

export const trpc4 = createTRPCReact<typeof newFeaturesRouter>();

export function createTrpc4Client() {
  return trpc4.createClient({
    links: [
      httpBatchLink({
        url: "/api/trpc4",
        transformer: superjson,
        fetch(input, init) {
          return globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
    ],
  });
}
