/**
 * tRPC client for the Tier 6–8 feature router (served at /api/trpc3).
 * Mirrors the setup in trpc.ts but points to the /api/trpc3 endpoint.
 */
import { createTRPCReact } from "@trpc/react-query";
import React from "react";
import type { tier6to8Router } from "../../../server/tier6to8Router";
export const TrpcContext3 = React.createContext<null>(null);
export const trpc3 = createTRPCReact<typeof tier6to8Router>({ context: TrpcContext3 as any });
