/**
 * tRPC client for the Tier 1–5 feature router (served at /api/trpc2).
 * Mirrors the setup in trpc.ts but points to the /api/trpc2 endpoint.
 */
import { createTRPCReact } from "@trpc/react-query";
import type { tier1to5Router } from "../../../server/tier1to5Router";

export const trpc2 = createTRPCReact<typeof tier1to5Router>();
