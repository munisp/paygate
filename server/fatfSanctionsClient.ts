/**
 * fatfSanctionsClient.ts
 * ======================
 * Node caller for the Python fatf-sanctions-sync service (FATF / UN / OFAC
 * sanctions list sync + hot lookups), reached through the go-bridge proxy
 * routes added in wave-7:
 *
 *   GET {MIDDLEWARE_BRIDGE_URL}/v1/sanctions/lookup/name?name=...
 *   GET {MIDDLEWARE_BRIDGE_URL}/v1/sanctions/lookup/jurisdiction?country_code=...
 *   GET {MIDDLEWARE_BRIDGE_URL}/v1/sanctions/status
 *
 * Auth: X-Internal-Key = MIDDLEWARE_INTERNAL_KEY (bridge authMiddleware).
 *
 * Degradation contract: helpers return null when the bridge/service is
 * unreachable — never throw. A null means "screening not performed"; callers
 * must log that explicitly. A non-null `matched: true` is a definitive list
 * hit and must be treated as fail-closed (block / escalate).
 */

const BRIDGE_URL = () => (process.env.MIDDLEWARE_BRIDGE_URL ?? "").replace(/\/+$/, "");
const BRIDGE_KEY = () => process.env.MIDDLEWARE_INTERNAL_KEY ?? "";
const TIMEOUT_MS = parseInt(process.env.FATF_SYNC_TIMEOUT_MS ?? "5000");

export interface SanctionsNameMatch {
  matched: boolean;
  name: string;
  risk_level: string | null;
  source: string | null;
}

export interface SanctionsJurisdictionMatch {
  matched: boolean;
  country_code: string;
  risk_level: string;
  reason: string | null;
}

async function getSanctions(path: string): Promise<any | null> {
  const base = BRIDGE_URL();
  if (!base || !BRIDGE_KEY()) return null;
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: { "X-Internal-Key": BRIDGE_KEY() },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

/**
 * Look up a person/business name against the synced UN/OFAC sanctions lists.
 * Returns null when screening could not be performed.
 */
export async function lookupSanctionsName(name: string): Promise<SanctionsNameMatch | null> {
  if (!name || name.trim().length < 3) return null;
  const resp = await getSanctions(`/v1/sanctions/lookup/name?name=${encodeURIComponent(name.trim())}`);
  if (resp == null || typeof resp.matched !== "boolean") return null;
  return resp as SanctionsNameMatch;
}

/**
 * Check whether a country is on the FATF high-risk / grey list.
 * Returns null when screening could not be performed.
 */
export async function lookupSanctionsJurisdiction(countryCode: string): Promise<SanctionsJurisdictionMatch | null> {
  if (!countryCode || countryCode.trim().length < 2) return null;
  const resp = await getSanctions(
    `/v1/sanctions/lookup/jurisdiction?country_code=${encodeURIComponent(countryCode.trim().toUpperCase())}`,
  );
  if (resp == null || typeof resp.matched !== "boolean") return null;
  return resp as SanctionsJurisdictionMatch;
}
