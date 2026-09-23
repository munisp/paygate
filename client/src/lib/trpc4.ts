/**
 * tRPC client for the Wave 76 new-features router (served at /api/trpc4).
 * Built via the shared factory in trpc.ts.
 */
import type { newFeaturesRouter } from "../../../server/newFeaturesRouter";
import { createPaygateTrpc } from "./trpc";

const { trpc: trpc4, TrpcContext: TrpcContext4 } = createPaygateTrpc<typeof newFeaturesRouter>();
export { trpc4, TrpcContext4 };
