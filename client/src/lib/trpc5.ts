/**
 * trpc5.ts — tRPC client for Wave 80 new features router (/api/trpc5)
 */
import { createTRPCReact } from "@trpc/react-query";
import type { Wave80Router } from "../../../server/wave80Router";
export const trpc5 = createTRPCReact<Wave80Router>();
