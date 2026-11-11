/**
 * livenessSignalClient.ts
 * =======================
 * Node caller for the Rust liveness-signal-processor (LBP/FFT/colour/gradient
 * anti-spoof signal analysis), reached through the go-bridge proxy routes
 * added in wave-7:
 *
 *   POST {MIDDLEWARE_BRIDGE_URL}/v1/liveness/analyse        — single image
 *   POST {MIDDLEWARE_BRIDGE_URL}/v1/liveness/analyse/batch  — batch
 *   POST {MIDDLEWARE_BRIDGE_URL}/v1/liveness/calibrate      — recalibrate
 *
 * Auth: X-Internal-Key = MIDDLEWARE_INTERNAL_KEY (bridge authMiddleware).
 *
 * This service complements the Python liveness-detection gateway
 * (ENV.livenessGatewayUrl): the gateway owns the primary KYC liveness
 * decision; the signal processor is a second-opinion / fallback anti-spoof
 * signal path. All helpers return null when unreachable — never throw.
 */

const BRIDGE_URL = () => (process.env.MIDDLEWARE_BRIDGE_URL ?? "").replace(/\/+$/, "");
const BRIDGE_KEY = () => process.env.MIDDLEWARE_INTERNAL_KEY ?? "";
const TIMEOUT_MS = parseInt(process.env.LIVENESS_SIGNAL_TIMEOUT_MS ?? "8000");

export interface LivenessSignalResult {
  session_id: string;
  decision: "real" | "uncertain" | "spoof";
  confidence: number;
  spoof_type?: string | null;
  processing_ms?: number;
}

/**
 * Analyse a single selfie frame for spoof signals. Returns null when the
 * bridge/processor is unreachable so callers can degrade gracefully.
 */
export async function analyseLivenessSignal(
  imageBase64: string,
  sessionId?: string,
): Promise<LivenessSignalResult | null> {
  const base = BRIDGE_URL();
  if (!base || !BRIDGE_KEY()) return null;
  const res = await fetch(`${base}/v1/liveness/analyse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": BRIDGE_KEY(),
    },
    body: JSON.stringify({ image_b64: imageBase64, session_id: sessionId }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const body: any = await res.json().catch(() => null);
  if (!body || typeof body.decision !== "string") return null;
  return body as LivenessSignalResult;
}
