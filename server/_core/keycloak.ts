/**
 * Keycloak OIDC integration for the PayGate Merchant Portal.
 *
 * Replaces Manus OAuth with Keycloak's standard Authorization Code flow.
 * Uses jose for RS256 JWT verification against Keycloak's JWKS endpoint.
 *
 * Environment variables required:
 *   KEYCLOAK_URL          — e.g. https://auth.paygate.io
 *   KEYCLOAK_REALM        — e.g. paygate
 *   KEYCLOAK_CLIENT_ID    — e.g. merchant-portal
 *   KEYCLOAK_CLIENT_SECRET — confidential client secret
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { ENV } from "./env";

// ─── Keycloak URL helpers ─────────────────────────────────────────────────────

export function getKeycloakBaseUrl(): string {
  return `${ENV.keycloakUrl}/realms/${ENV.keycloakRealm}`;
}

export function getAuthorizationEndpoint(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/auth`;
}

export function getTokenEndpoint(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/token`;
}

export function getJwksUri(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/certs`;
}

export function getEndSessionEndpoint(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/logout`;
}

export function getUserInfoEndpoint(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/userinfo`;
}

// ─── JWKS cache ──────────────────────────────────────────────────────────────
// createRemoteJWKSet caches the key set and refreshes on key rotation automatically.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(getJwksUri()));
  }
  return _jwks;
}

// ─── Authorization URL ───────────────────────────────────────────────────────

export function buildAuthorizationUrl(redirectUri: string, state: string): string {
  const url = new URL(getAuthorizationEndpoint());
  url.searchParams.set("client_id", ENV.keycloakClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  return url.toString();
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export interface KeycloakTokenSet {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<KeycloakTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.keycloakClientId,
    client_secret: ENV.keycloakClientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Keycloak] Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    idToken: data.id_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number,
  };
}

// ─── JWT verification ─────────────────────────────────────────────────────────

export interface KeycloakClaims {
  sub: string;           // Keycloak user UUID — used as openId
  email?: string;
  name?: string;
  preferred_username?: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
}

export async function verifyAccessToken(accessToken: string): Promise<KeycloakClaims> {
  const jwks = getJwks();
  const { payload } = await jwtVerify(accessToken, jwks, {
    issuer: getKeycloakBaseUrl(),
    audience: ENV.keycloakClientId,
  });
  return payload as unknown as KeycloakClaims;
}

/**
 * Extract the PayGate role from Keycloak realm roles.
 * Keycloak realm roles "paygate-admin" → "admin", anything else → "user".
 */
export function extractRole(claims: KeycloakClaims): "admin" | "user" {
  const realmRoles = claims.realm_access?.roles ?? [];
  const clientRoles = claims.resource_access?.[ENV.keycloakClientId]?.roles ?? [];
  const allRoles = [...realmRoles, ...clientRoles];
  return allRoles.includes("paygate-admin") || allRoles.includes("admin") ? "admin" : "user";
}

// ─── End-session URL builder ─────────────────────────────────────────────────

/**
 * Build the Keycloak end-session URL.
 *
 * Redirecting the browser here terminates the Keycloak SSO session so the
 * user must re-authenticate with credentials on the next login attempt.
 * Without this, the Keycloak session cookie persists and the user would be
 * silently re-authenticated on shared / kiosk machines.
 *
 * @param idTokenHint  The Keycloak id_token — if provided, Keycloak skips the
 *                     "do you want to log out?" confirmation page.
 * @param postLogoutRedirectUri  Where Keycloak should redirect after logout.
 *                               Must match a URI registered in the client config.
 */
export function buildEndSessionUrl(
  postLogoutRedirectUri: string,
  idTokenHint?: string
): string {
  const url = new URL(getEndSessionEndpoint());
  url.searchParams.set("client_id", ENV.keycloakClientId);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  if (idTokenHint) {
    url.searchParams.set("id_token_hint", idTokenHint);
  }
  return url.toString();
}

// ─── Refresh token exchange ──────────────────────────────────────────────────

/**
 * Exchange a Keycloak refresh_token for a new token set.
 *
 * Called by the /api/auth/refresh endpoint when the portal session JWT is
 * approaching expiry. Returns a fresh KeycloakTokenSet (new access_token,
 * id_token, and possibly a rotated refresh_token).
 *
 * Throws if the refresh_token is expired or revoked — the caller should
 * clear the session and redirect to login.
 */
export async function refreshAccessToken(refreshToken: string): Promise<KeycloakTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ENV.keycloakClientId,
    client_secret: ENV.keycloakClientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Keycloak] Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    idToken: data.id_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number,
  };
}

// ─── Session cookie helpers ───────────────────────────────────────────────────
// We continue to issue our own HS256 session cookie (same as before) so the
// rest of the application (protectedProcedure, ctx.user) is unchanged.
// The Keycloak access token is NOT stored in the cookie — only the internal
// session JWT is, which references the user's openId (= Keycloak sub).

import { SignJWT, jwtVerify as joseVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

function getSessionSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionToken(openId: string, name: string): Promise<string> {
  return new SignJWT({ openId, appId: "paygate-keycloak", name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(getSessionSecret());
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<{ openId: string; name: string } | null> {
  if (!token) return null;
  try {
    const secret = getSessionSecret();
    const { payload } = await joseVerify(token, secret, { algorithms: ["HS256"] });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || !openId) return null;
    return { openId, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
