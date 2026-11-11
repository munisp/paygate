/**
 * cryptoGuardClient.ts
 * ====================
 * Node caller for the Rust crypto-guard service (HMAC verification, nonce
 * generation, replay protection), reached through the go-bridge proxy routes
 * added in wave-7:
 *
 *   POST {MIDDLEWARE_BRIDGE_URL}/v1/crypto-guard/verify/hmac
 *   POST {MIDDLEWARE_BRIDGE_URL}/v1/crypto-guard/verify/webhook
 *   POST {MIDDLEWARE_BRIDGE_URL}/v1/crypto-guard/replay/check
 *   POST {MIDDLEWARE_BRIDGE_URL}/v1/crypto-guard/nonce/{generate,idempotency-key,payment,webhook,csrf}
 *
 * Auth: X-Internal-Key = MIDDLEWARE_INTERNAL_KEY (bridge authMiddleware).
 * The bridge in turn injects the upstream INTERNAL_API_KEY for crypto-guard's
 * own X-Internal-Key check (see go-bridge/internal/handlers/proxy.go).
 *
 * Degradation contract: every helper returns `null` when the bridge or
 * crypto-guard is unreachable / misconfigured so the caller can fall back to
 * its local constant-time implementation. Helpers never throw. crypto-guard
 * itself fails closed (503 when its Redis nonce store is unavailable), which
 * surfaces here as a null so the caller decides — replay-sensitive callers
 * should treat null as "cannot verify" and reject.
 */

const BRIDGE_URL = () => (process.env.MIDDLEWARE_BRIDGE_URL ?? "").replace(/\/+$/, "");
const BRIDGE_KEY = () => process.env.MIDDLEWARE_INTERNAL_KEY ?? "";
const TIMEOUT_MS = parseInt(process.env.CRYPTO_GUARD_TIMEOUT_MS ?? "5000");

async function postCryptoGuard(path: string, body: unknown): Promise<any | null> {
  const base = BRIDGE_URL();
  if (!base || !BRIDGE_KEY()) return null;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": BRIDGE_KEY(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

/**
 * Verify an HMAC signature via crypto-guard (POST /verify/hmac).
 *
 * @param secret    raw shared-secret string (hex-encoded for transport so the
 *                  Rust side hex-decodes back to the exact bytes)
 * @param payload   raw payload string (base64-encoded for transport)
 * @param signature hex signature as presented by the sender ("sha256=" prefix OK)
 * @param algorithm "sha256" (default) | "sha512"
 * @returns true/false on a definitive verdict, null when undetermined.
 */
export async function verifyHmacViaCryptoGuard(
  secret: string,
  payload: string,
  signature: string,
  algorithm: "sha256" | "sha512" = "sha256",
): Promise<boolean | null> {
  const resp = await postCryptoGuard("/v1/crypto-guard/verify/hmac", {
    key: Buffer.from(secret, "utf8").toString("hex"),
    payload: Buffer.from(payload, "utf8").toString("base64"),
    signature,
    algorithm,
  });
  if (resp == null || typeof resp.valid !== "boolean") return null;
  return resp.valid;
}

export interface ReplayCheckResult {
  isReplay: boolean;
  reason?: string;
}

/**
 * Check a nonce for replay via crypto-guard (POST /replay/check). Returns null
 * when the check could not be performed — callers MUST treat null as
 * fail-closed (reject) on payment/webhook nonce paths, mirroring
 * crypto-guard's own fail-closed contract.
 */
export async function checkReplayViaCryptoGuard(
  nonce: string,
  timestampSecs: number,
): Promise<ReplayCheckResult | null> {
  const resp = await postCryptoGuard("/v1/crypto-guard/replay/check", {
    nonce,
    timestamp_secs: timestampSecs,
  });
  if (resp == null || typeof resp.is_replay !== "boolean") return null;
  return { isReplay: resp.is_replay, reason: resp.reason ?? undefined };
}

export type NonceKind = "generate" | "idempotency-key" | "payment" | "webhook" | "csrf";

/**
 * Generate a nonce via crypto-guard (POST /nonce/{kind}). Returns null when
 * unavailable — callers fall back to node:crypto randomBytes.
 */
export async function generateNonceViaCryptoGuard(kind: NonceKind = "generate"): Promise<string | null> {
  const resp = await postCryptoGuard(`/v1/crypto-guard/nonce/${kind}`, {});
  if (resp == null || typeof resp.nonce !== "string") return null;
  return resp.nonce;
}
