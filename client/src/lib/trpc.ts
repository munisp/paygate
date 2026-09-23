import { createTRPCReact } from "@trpc/react-query";
import type { AnyTRPCRouter } from "@trpc/server";
import React from "react";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

/**
 * Shared tRPC React client factory for the auxiliary feature routers
 * (served at /api/trpc2 … /api/trpc5). Each router gets its own React
 * context so providers can be mounted independently of the main client.
 * Consolidates the boilerplate that used to be duplicated across
 * trpc2.ts … trpc5.ts.
 */
export function createPaygateTrpc<TRouter extends AnyTRPCRouter>() {
  const TrpcContext = React.createContext<null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createTRPCReact<TRouter>({ context: TrpcContext as any });
  return { trpc: client, TrpcContext };
}
