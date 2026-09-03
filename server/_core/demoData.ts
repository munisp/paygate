import { TRPCError } from "@trpc/server";

export function isSimulationMode(): boolean {
  return process.env.PAYGATE_SIMULATION_MODE === "true";
}

/**
 * Fail loud unless PAYGATE_SIMULATION_MODE=true; then return labeled
 * simulation payload with WARN. Never fabricate data silently.
 */
export function demoOrFail<T extends Record<string, unknown>>(
  payload: T,
  label: string,
): T & { source: string; simulation: boolean } {
  if (!isSimulationMode()) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `SERVICE_UNAVAILABLE: ${label} backend unreachable and PAYGATE_SIMULATION_MODE is not enabled — refusing to fabricate demo data`,
    });
  }
  console.warn(
    `[SIMULATION] ${label} — PAYGATE_SIMULATION_MODE=true, returning demo data (NOT real)`,
  );
  return { ...payload, source: "simulation", simulation: true };
}

/**
 * Array variant of demoOrFail: fails loud unless PAYGATE_SIMULATION_MODE=true;
 * then labels each object element with { source: "simulation", simulation: true }
 * so array-shaped responses stay truthful without changing their shape.
 */
export function demoArrayOrFail<T>(payload: T[], label: string): T[] {
  if (!isSimulationMode()) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `SERVICE_UNAVAILABLE: ${label} backend unreachable and PAYGATE_SIMULATION_MODE is not enabled — refusing to fabricate demo data`,
    });
  }
  console.warn(
    `[SIMULATION] ${label} — PAYGATE_SIMULATION_MODE=true, returning demo data (NOT real)`,
  );
  return payload.map((item) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? { ...(item as Record<string, unknown>), source: "simulation", simulation: true }
      : item,
  ) as T[];
}
