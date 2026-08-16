/**
 * NIBSS Router — top-level NIBSS identity services.
 *
 * Backing client: client/src/pages/SubMerchantOnboarding.tsx
 *   - nibss.verifyBvn({ bvn, firstName, lastName, dateOfBirth })
 *       → { verified, firstName?, lastName?, ... }
 *
 * Requests are routed through the middleware bridge (same bridgePost pattern
 * as wave162.nibss.nameEnquiry). FAILS LOUD (SERVICE_UNAVAILABLE) when the
 * bridge is unconfigured or unreachable — unless PAYGATE_SIMULATION_MODE=true,
 * in which case a clearly-labelled simulated payload is returned via
 * demoOrFail (which stamps source: "simulation", simulation: true).
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { demoOrFail } from "../_core/demoData";

const BRIDGE_URL = ENV.middlewareBridgeUrl ?? "";

async function bridgePost(path: string, body: unknown): Promise<any> {
  if (!BRIDGE_URL) return null;
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.middlewareInternalKey ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Normalise a live NIBSS BVN verification response into the client shape. */
function normaliseBvnResult(live: any, input: { bvn: string }) {
  const status = String(live.status ?? live.responseCode ?? "").toLowerCase();
  const verified =
    typeof live.verified === "boolean"
      ? live.verified
      : ["matched", "match", "success", "00", "ok"].includes(status);
  return {
    verified,
    bvn: input.bvn,
    firstName: live.firstName ?? live.first_name ?? null,
    lastName: live.lastName ?? live.last_name ?? null,
    dateOfBirth: live.dateOfBirth ?? live.date_of_birth ?? null,
    phoneNumber: live.phoneNumber ?? live.phone_number ?? null,
    matchScore:
      typeof live.matchScore === "number"
        ? live.matchScore
        : typeof live.match_score === "number"
          ? live.match_score
          : null,
    status: live.status ?? (verified ? "matched" : "not_found"),
    sessionId: live.sessionId ?? live.session_id ?? null,
    source: "live" as const,
    simulation: false as const,
  };
}

export const nibssRouter = router({
  verifyBvn: protectedProcedure
    .input(
      z.object({
        bvn: z
          .string()
          .regex(/^\d{11}$/, "BVN must be exactly 11 digits"),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        dateOfBirth: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const live = await bridgePost("/v1/nibss/bvn/verify", {
        bvn: input.bvn,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
      });
      if (live) return normaliseBvnResult(live, input);

      // Bridge unconfigured or unreachable. demoOrFail throws
      // SERVICE_UNAVAILABLE unless PAYGATE_SIMULATION_MODE=true; in simulation
      // mode it returns this clearly-labelled, non-real payload.
      return demoOrFail(
        {
          verified: true,
          bvn: input.bvn,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth ?? null,
          phoneNumber: null,
          matchScore: 1,
          status: "matched",
          sessionId: `sim_${Date.now()}`,
          message: BRIDGE_URL
            ? "SIMULATED — NIBSS bridge unreachable; no real BVN verification performed"
            : "SIMULATED — NIBSS bridge not configured; no real BVN verification performed",
        },
        "nibss.verifyBvn"
      );
    }),
});
