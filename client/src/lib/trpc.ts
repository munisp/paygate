import { createTRPCReact } from "@trpc/react-query";
import React from "react";
import type { AppRouter } from "../../../server/routers";

// Each tRPC client MUST use its own React context to prevent the module-level
// TRPCContext singleton from being overwritten by the innermost provider.
export const TrpcMainContext = React.createContext<null>(null);
export const trpc = createTRPCReact<AppRouter>({ context: TrpcMainContext as any });
