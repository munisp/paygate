/**
 * tRPC client for the Tier 6–8 feature router (served at /api/trpc3).
 * Built via the shared factory in trpc.ts.
 */
import type { tier6to8Router } from "../../../server/tier6to8Router";
import { createPaygateTrpc } from "./trpc";

const { trpc: trpc3, TrpcContext: TrpcContext3 } = createPaygateTrpc<typeof tier6to8Router>();
export { trpc3, TrpcContext3 };
