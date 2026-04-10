/**
 * trpc5.ts — tRPC client for Wave 80 new features router (/api/trpc5)
 */
import { createTRPCReact } from "@trpc/react-query";
import React from "react";
import type { Wave80Router } from "../../../server/wave80Router";
export const TrpcContext5 = React.createContext<null>(null);
export const trpc5 = createTRPCReact<Wave80Router>({ context: TrpcContext5 as any });
