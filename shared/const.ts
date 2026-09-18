export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// One-time nonce cookie that binds an OAuth login to the browser that started
// it. The `__Host-` prefix forces the cookie host-only (Secure, Path=/, no
// Domain), so a sibling *.manus.space site cannot plant a matching value in a
// victim's browser.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

// `state` carries the callback redirect URI (used at token exchange) plus the
// CSRF nonce. Defined here so the client encoder and server decoder never drift.
export type OAuthState = { redirectUri: string; nonce?: string };

export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    // Malformed base64 (e.g. attacker-supplied garbage). Return no nonce so the
    // callback's CSRF guard rejects it with 403 — never throw, since the caller
    // runs outside the request handler's try/catch.
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Legacy links: `state` was a bare base64(redirectUri) with no nonce.
  }
  return { redirectUri: decoded };
};

// ─── Platform constants ──────────────────────────────────────────────────────
// Shared payment/tax/loyalty constants (server + client safe — no secrets).

/** Currencies the platform accepts for collections and payouts. */
export const SUPPORTED_CURRENCIES = ["NGN", "USD", "GHS", "KES", "ZAR", "EGP", "XOF"] as const;

/** Minimum single payout (NGN). Mirrors payouts.create input min (100). */
export const PAYOUT_MIN_NGN = 100;
/** Maximum single payout (NGN) before enhanced review. */
export const PAYOUT_MAX_NGN = 50_000_000;
/** Single transaction limit (NGN) for standard merchant accounts. */
export const SINGLE_TXN_LIMIT_NGN = 10_000_000;
/** Standard payout/processing fee in basis points (50 bps = 0.5%). */
export const STANDARD_FEE_BPS = 50;

// ─── Nigerian tax rates ───────────────────────────────────────────────────────
/** Value-added tax. */
export const VAT_RATE = 0.075; // 7.5%
/** Withholding tax on dividends. */
export const WHT_DIVIDEND_RATE = 0.10; // 10%
/** Stamp duty rate on electronic transfers above the threshold. */
export const STAMP_DUTY_RATE = 0.001; // 0.1%
/** Stamp duty applies to transfers of at least ₦10,000. */
export const STAMP_DUTY_THRESHOLD_NGN = 10_000;

// ─── Loyalty & agent banking ──────────────────────────────────────────────────
/** Loyalty points earned per ₦1 spent. */
export const LOYALTY_POINTS_PER_NGN = 0.01;
/** Minimum agent float (NGN). */
export const AGENT_FLOAT_MIN_NGN = 10_000;
/** Maximum agent float (NGN). */
export const AGENT_FLOAT_MAX_NGN = 5_000_000;
/** Points required for the Gold loyalty tier. */
export const LOYALTY_TIER_GOLD_MIN = 50_000;

// ─── Middleware bridge defaults ───────────────────────────────────────────────
export const BRIDGE_ERR_MSG = "Middleware bridge unavailable";
export const BRIDGE_TIMEOUT_MS = 10_000;
