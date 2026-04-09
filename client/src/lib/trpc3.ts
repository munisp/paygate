/**
 * tRPC client for the Tier 6–8 feature router (served at /api/trpc3).
 * Mirrors the setup in trpc.ts but points to the /api/trpc3 endpoint.
 */
import { createTRPCReact } from "@trpc/react-query";
import type { tier6to8Router } from "../../../server/tier6to8Router";

export const trpc3 = createTRPCReact<typeof tier6to8Router>();
