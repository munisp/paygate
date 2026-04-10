/**
 * trpc4.ts — tRPC client for Wave 76 new features router (/api/trpc4)
 */
import { createTRPCReact } from "@trpc/react-query";
import type { newFeaturesRouter } from "../../../server/newFeaturesRouter";

export const trpc4 = createTRPCReact<typeof newFeaturesRouter>();
