/**
 * trpc4.ts — tRPC client for Wave 76 new features router (/api/trpc4)
 */
import { createTRPCReact } from "@trpc/react-query";
import React from "react";
import type { newFeaturesRouter } from "../../../server/newFeaturesRouter";
export const TrpcContext4 = React.createContext<null>(null);
export const trpc4 = createTRPCReact<typeof newFeaturesRouter>({ context: TrpcContext4 as any });
