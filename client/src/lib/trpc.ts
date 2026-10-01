import { createTRPCReact } from "@trpc/react-query";
import type { AnyTRPCRouter } from "@trpc/server";
import React from "react";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

/**
 * Shared tRPC React client factory for auxiliary feature routers.
 * Each router gets its own React context so providers can be mounted
 * independently of the main client.
 */
export function createPaygateTrpc<TRouter extends AnyTRPCRouter>() {
  const TrpcContext = React.createContext<null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createTRPCReact<TRouter>({ context: TrpcContext as any });
  return { trpc: client, TrpcContext };
}
