/**
 * tRPC client for the Wave 80 new-features router (served at /api/trpc5).
 * Built via the shared factory in trpc.ts.
 */
import type { Wave80Router } from "../../../server/wave80Router";
import { createPaygateTrpc } from "./trpc";

const { trpc: trpc5, TrpcContext: TrpcContext5 } = createPaygateTrpc<Wave80Router>();
export { trpc5, TrpcContext5 };
