/**
 * tRPC client for the Tier 1–5 feature router (served at /api/trpc2).
 * Built via the shared factory in trpc.ts.
 */
import type { tier1to5Router } from "../../../server/tier1to5Router";
import { createPaygateTrpc } from "./trpc";

const { trpc: trpc2, TrpcContext: TrpcContext2 } = createPaygateTrpc<typeof tier1to5Router>();
export { trpc2, TrpcContext2 };
