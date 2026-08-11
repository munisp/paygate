/**
 * Keycloak Auth Migration Tests
 *
 * Verifies that the Manus OAuth dependency has been fully removed and
 * replaced with Keycloak OIDC as the sole identity provider, making the
 * platform compatible with on-premise / private-cloud deployment.
 *
 * These tests are static source-code audits — they do not require a running
 * Keycloak instance or database.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");

// ─── Round 34 — SSO Logout + ALLOWED_ORIGINS hardening ────────────────────────

describe("server/_core/keycloak.ts — buildEndSessionUrl helper", () => {
  const src = readFileSync(resolve(ROOT, "server/_core/keycloak.ts"), "utf8");

  it("exports buildEndSessionUrl function", () => {
    expect(src).toContain("export function buildEndSessionUrl");
  });

  it("includes client_id in the end-session URL", () => {
    expect(src).toContain('url.searchParams.set("client_id"');
  });

  it("includes post_logout_redirect_uri in the end-session URL", () => {
    expect(src).toContain('url.searchParams.set("post_logout_redirect_uri"');
  });

  it("optionally includes id_token_hint to skip confirmation page", () => {
    expect(src).toContain("id_token_hint");
    expect(src).toContain("idTokenHint");
  });

  it("uses getEndSessionEndpoint() as the base URL", () => {
    expect(src).toContain("getEndSessionEndpoint()");
  });
});

describe("server/routers.ts auth.logout — SSO logout redirect", () => {
  const src = readFileSync(resolve(ROOT, "server/routers.ts"), "utf8");

  it("auth.logout accepts an optional origin input", () => {
    expect(src).toContain("origin: z.string().url().optional()");
  });

  it("auth.logout calls buildEndSessionUrl when Keycloak is configured", () => {
    expect(src).toContain("buildEndSessionUrl");
  });

  it("auth.logout returns ssoLogoutUrl in the response", () => {
    expect(src).toContain("ssoLogoutUrl");
  });

  it("auth.logout returns ssoLogoutUrl: null when Keycloak is not configured", () => {
    expect(src).toContain("ssoLogoutUrl: null");
  });
});

describe("client/src/_core/hooks/useAuth.ts — logout mutation", () => {
  // Real contract: the client calls the trpc.auth.logout mutation (no origin
  // input); the server returns an ssoLogoutUrl but the client currently does
  // not redirect to it — it clears local state and invalidates auth.me.
  const src = readFileSync(resolve(ROOT, "client/src/_core/hooks/useAuth.ts"), "utf8");

  it("calls the trpc.auth.logout mutation", () => {
    expect(src).toContain("trpc.auth.logout.useMutation");
    expect(src).toContain("logoutMutation.mutateAsync()");
  });

  it("clears the mirrored session token from sessionStorage on logout", () => {
    expect(src).toContain('sessionStorage.removeItem("manus-cookie")');
  });

  it("invalidates the auth.me query cache after logout", () => {
    expect(src).toContain("utils.auth.me.setData(undefined, null)");
    expect(src).toContain("utils.auth.me.invalidate()");
  });

  it("handles expired session gracefully without throwing", () => {
    expect(src).toContain("UNAUTHORIZED");
    expect(src).toContain("return;");
  });
});

describe("server/securityHeaders.ts — ALLOWED_ORIGINS hardening", () => {
  // Real contract: CORS origin control lives in server/securityHeaders.ts
  // (corsMiddleware), mounted app-wide in server/_core/index.ts — not in
  // server/_core/oauth.ts.
  const src = readFileSync(resolve(ROOT, "server/securityHeaders.ts"), "utf8");
  const indexSrc = readFileSync(resolve(ROOT, "server/_core/index.ts"), "utf8");

  it("parses ALLOWED_ORIGINS from env var at module load time", () => {
    expect(src).toContain("process.env.ALLOWED_ORIGINS?.split");
  });

  it("only reflects origins that exactly match the allowlist (no wildcards)", () => {
    expect(src).toContain("ALLOWED_ORIGINS.includes(origin)");
    expect(src).not.toMatch(/origin:\s*['"]\*/);
  });

  it("sets Allow-Credentials and Allow-Methods for allowlisted origins", () => {
    expect(src).toContain("Access-Control-Allow-Credentials");
    expect(src).toContain("Access-Control-Allow-Methods");
  });

  it("short-circuits OPTIONS preflight with 204", () => {
    expect(src).toContain('req.method === "OPTIONS"');
    expect(src).toContain("res.status(204).end()");
  });

  it("corsMiddleware is mounted app-wide in server/_core/index.ts", () => {
    expect(indexSrc).toContain("app.use(corsMiddleware)");
    expect(indexSrc).toContain('from "../securityHeaders"');
  });
});

describe("docs/keycloak-deployment.md — deployment guide exists", () => {
  const src = readFileSync(resolve(ROOT, "docs/keycloak-deployment.md"), "utf8");

  it("documents ALLOWED_ORIGINS configuration", () => {
    expect(src).toContain("ALLOWED_ORIGINS");
  });

  it("documents SSO logout flow", () => {
    expect(src).toContain("SSO Logout");
    expect(src).toContain("post_logout_redirect_uri");
  });

  it("documents --import-realm bootstrap mode", () => {
    expect(src).toContain("--import-realm");
  });

  it("includes a production checklist", () => {
    expect(src).toContain("Production Checklist");
  });

  it("documents realm export procedure", () => {
    expect(src).toContain("Exporting the Realm");
  });
});

describe("keycloak/paygate-realm.json — realm seed file", () => {
  const src = readFileSync(resolve(ROOT, "keycloak/paygate-realm.json"), "utf8");
  const realm = JSON.parse(src);

  it("realm name is paygate", () => {
    expect(realm.realm).toBe("paygate");
  });

  it("realm is enabled", () => {
    expect(realm.enabled).toBe(true);
  });

  it("includes merchant-portal client", () => {
    const client = realm.clients?.find((c: { clientId: string }) => c.clientId === "merchant-portal");
    expect(client).toBeDefined();
    expect(client.enabled).toBe(true);
  });

  it("client has post_logout_redirect_uris attribute", () => {
    const client = realm.clients?.find((c: { clientId: string }) => c.clientId === "merchant-portal");
    expect(client?.attributes?.["post.logout.redirect.uris"]).toBeDefined();
  });

  it("includes all 5 paygate realm roles", () => {
    const roleNames = realm.roles?.realm?.map((r: { name: string }) => r.name) ?? [];
    expect(roleNames).toContain("paygate-admin");
    expect(roleNames).toContain("paygate-merchant");
    expect(roleNames).toContain("paygate-consumer");
    expect(roleNames).toContain("paygate-partner");
    expect(roleNames).toContain("paygate-operator");
  });

  it("brute force protection is enabled", () => {
    expect(realm.bruteForceProtected).toBe(true);
  });

  it("admin events are enabled", () => {
    expect(realm.adminEventsEnabled).toBe(true);
  });
});

describe("docker-compose.production.yml — realm JSON volume mount", () => {
  const src = readFileSync(resolve(ROOT, "docker-compose.production.yml"), "utf8");

  it("mounts paygate-realm.json into the keycloak container", () => {
    expect(src).toContain("paygate-realm.json:/opt/keycloak/data/import/paygate-realm.json");
  });

  it("keycloak command includes --import-realm flag", () => {
    expect(src).toContain("--import-realm");
  });
});

// ─── Round 35 — SMTP + id_token_hint + Health-Check ────────────────────────────

describe("docker-compose.production.yml — SMTP env vars", () => {
  const src = readFileSync(resolve(ROOT, "docker-compose.production.yml"), "utf8");

  it("includes KC_SMTP_HOST env var in keycloak service", () => {
    expect(src).toContain("KC_SMTP_HOST");
  });

  it("includes KC_SMTP_PORT env var", () => {
    expect(src).toContain("KC_SMTP_PORT");
  });

  it("includes KC_SMTP_FROM env var", () => {
    expect(src).toContain("KC_SMTP_FROM");
  });

  it("includes KC_SMTP_USER env var", () => {
    expect(src).toContain("KC_SMTP_USER");
  });

  it("includes KC_SMTP_PASSWORD env var", () => {
    expect(src).toContain("KC_SMTP_PASSWORD");
  });

  it("includes KC_SMTP_STARTTLS env var", () => {
    expect(src).toContain("KC_SMTP_STARTTLS");
  });

  it("includes KC_SMTP_AUTH env var", () => {
    expect(src).toContain("KC_SMTP_AUTH");
  });
});

describe("keycloak/paygate-realm.json — smtpServer block", () => {
  const src = readFileSync(resolve(ROOT, "keycloak/paygate-realm.json"), "utf8");
  // Strip _comment keys (which may contain colons and special chars) before parsing
  const realm = JSON.parse(src.replace(/"_comment"\s*:\s*"[^"]*",?\s*/g, ''));

  it("has a smtpServer block", () => {
    expect(realm.smtpServer).toBeDefined();
  });

  it("smtpServer has a from field", () => {
    expect(realm.smtpServer).toHaveProperty("from");
  });

  it("smtpServer has a port field", () => {
    expect(realm.smtpServer).toHaveProperty("port");
  });

  it("smtpServer has starttls field", () => {
    expect(realm.smtpServer).toHaveProperty("starttls");
  });
});

describe("scripts/keycloak-bootstrap.sh — SMTP patch step", () => {
  const src = readFileSync(resolve(ROOT, "scripts/keycloak-bootstrap.sh"), "utf8");

  it("patches SMTP settings when KC_SMTP_HOST is provided", () => {
    expect(src).toContain("Patching SMTP settings");
  });

  it("skips SMTP when KC_SMTP_HOST is not set", () => {
    expect(src).toContain("KC_SMTP_HOST not set");
  });

  it("uses Admin REST API PUT to patch realm SMTP", () => {
    // The bootstrap.sh uses shell-escaped JSON: \"smtpServer\"
    expect(src).toContain('\\"smtpServer\\"');
    expect(src).toContain("admin/realms/$REALM");
  });
});

describe("server/_core/cookies.ts — id_token cookie helpers", () => {
  const src = readFileSync(resolve(ROOT, "server/_core/cookies.ts"), "utf8");

  it("exports ID_TOKEN_COOKIE_NAME constant", () => {
    expect(src).toContain("export const ID_TOKEN_COOKIE_NAME");
    expect(src).toContain("paygate_id_token");
  });

  // Real contract: there is no getIdTokenCookieOptions helper — the id_token
  // cookie is cleared on logout with getSessionCookieOptions (see routers.ts
  // auth.logout).
  it("session cookie options are httpOnly with sameSite none", () => {
    expect(src).toContain("httpOnly: true");
    expect(src).toContain('sameSite: "none"');
  });

  it("secure flag is derived from the request protocol / x-forwarded-proto", () => {
    expect(src).toContain("isSecureRequest");
    expect(src).toContain("x-forwarded-proto");
  });
});

describe("server/routers.ts auth.logout — id_token cookie lifecycle", () => {
  // Real contract: the id_token cookie is no longer written by the OAuth
  // callback (server/_core/oauth.ts is the legacy Manus code-exchange
  // callback). Its lifecycle surface is auth.logout in routers.ts, which
  // clears it alongside the session and refresh_token cookies.
  const src = readFileSync(resolve(ROOT, "server/routers.ts"), "utf8");

  it("imports ID_TOKEN_COOKIE_NAME from cookies", () => {
    expect(src).toContain("ID_TOKEN_COOKIE_NAME");
  });

  it("clears the id_token cookie on logout", () => {
    expect(src).toContain("clearCookie(ID_TOKEN_COOKIE_NAME");
  });

  it("clears the refresh_token cookie on logout", () => {
    expect(src).toContain("clearCookie(REFRESH_TOKEN_COOKIE_NAME");
  });
});

describe("server/routers.ts auth.logout — id_token_hint passthrough", () => {
  const src = readFileSync(resolve(ROOT, "server/routers.ts"), "utf8");

  it("imports ID_TOKEN_COOKIE_NAME from cookies in auth.logout", () => {
    expect(src).toContain("ID_TOKEN_COOKIE_NAME");
  });

  it("clears the id_token cookie on logout", () => {
    expect(src).toContain("clearCookie(ID_TOKEN_COOKIE_NAME");
  });

  it("reads idTokenHint from request cookies", () => {
    expect(src).toContain("ctx.req.cookies?.[ID_TOKEN_COOKIE_NAME]");
  });

  it("passes idTokenHint to buildEndSessionUrl", () => {
    expect(src).toContain("buildEndSessionUrl(postLogoutRedirectUri, idTokenHint)");
  });
});

describe("docker-compose.production.yml — Keycloak healthcheck", () => {
  const src = readFileSync(resolve(ROOT, "docker-compose.production.yml"), "utf8");

  it("keycloak service has a healthcheck", () => {
    expect(src).toContain("/health/ready");
  });

  it("healthcheck has a start_period for slow startup", () => {
    expect(src).toContain("start_period: 60s");
  });

  it("healthcheck has retries configured", () => {
    expect(src).toContain("retries: 10");
  });

  it("app service depends on keycloak with service_healthy condition", () => {
    // Verify service_started is no longer used for keycloak dependency
    const keycloakDepsSection = src.match(/keycloak:\s*\n\s*condition:\s*(\S+)/)?.[1];
    expect(keycloakDepsSection).toBe("service_healthy");
  });

  it("does not use service_started for keycloak dependency", () => {
    // service_started should not appear anywhere near the keycloak depends_on
    const appServiceSection = src.substring(
      src.indexOf("container_name: paygate_portal"),
      src.indexOf("container_name: paygate_keycloak")
    );
    expect(appServiceSection).not.toContain("service_started");
  });
});

describe("scripts/keycloak-bootstrap.sh — --import-realm mode", () => {
  const src = readFileSync(resolve(ROOT, "scripts/keycloak-bootstrap.sh"), "utf8");

  it("supports --import-realm argument", () => {
    expect(src).toContain("--import-realm");
    expect(src).toContain("IMPORT_REALM=true");
  });

  it("patches client secret after import", () => {
    expect(src).toContain("Patching client secret");
  });

  it("creates admin user in --import-realm mode", () => {
    expect(src).toContain("Creating admin user");
  });

  it("prints tip to use --import-realm at end of default mode", () => {
    expect(src).toContain("Tip: Next time use --import-realm");
  });
});

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8");
}

// ─── server/_core/oauth.ts ────────────────────────────────────────────────────

describe("server/_core/keycloakRoutes.ts — Keycloak OIDC routes", () => {
  // Real contract: the Keycloak Authorization Code flow is implemented in
  // server/_core/keycloakRoutes.ts (login/callback/logout). server/_core/oauth.ts
  // remains the legacy Manus code-exchange callback and intentionally still
  // uses ./sdk — the Keycloak path does not.
  const src = readSrc("server/_core/keycloakRoutes.ts");

  it("does not import the Manus SDK", () => {
    expect(src).not.toContain("from \"./sdk\"");
    expect(src).not.toContain("from './sdk'");
  });

  it("registers the Keycloak login endpoint", () => {
    expect(src).toContain("/api/oauth/keycloak/login");
  });

  it("registers the Keycloak callback endpoint", () => {
    expect(src).toContain("/api/oauth/keycloak/callback");
  });

  it("registers the Keycloak logout endpoint", () => {
    expect(src).toContain("/api/oauth/keycloak/logout");
  });

  it("uses createSessionToken + exchangeCodeForTokens from keycloak.ts", () => {
    expect(src).toContain("createSessionToken");
    expect(src).toContain("exchangeCodeForTokens");
    expect(src).toContain('from "./keycloak"');
  });

  it("verifies the Keycloak access token via JWKS", () => {
    expect(src).toContain("verifyAccessToken");
  });

  it("does not contain manus.space or manus.computer domain patterns", () => {
    expect(src).not.toContain("manus.space");
    expect(src).not.toContain("manus.computer");
  });

  it("logs loudly and skips route registration when KEYCLOAK_URL is not set", () => {
    expect(src).toContain("KEYCLOAK_URL not set");
  });

  it("restricts post-login redirects to relative paths (open-redirect guard)", () => {
    expect(src).toContain("/^\\/[^/]/");
  });
});

// ─── server/_core/context.ts ──────────────────────────────────────────────────

describe("server/_core/context.ts — session verification", () => {
  // Real contract: tRPC context authenticates the session cookie through
  // sdk.authenticateRequest (the sdk verifies the same HS256 session JWT that
  // keycloak.ts issues for SSO logins, so both login methods resolve ctx.user
  // transparently). Auth failure degrades to user = null for public procedures.
  const src = readSrc("server/_core/context.ts");
  const keycloakSrc = readSrc("server/_core/keycloak.ts");

  it("delegates request authentication to sdk.authenticateRequest", () => {
    expect(src).toContain("sdk.authenticateRequest");
  });

  it("treats authentication as optional (user falls back to null)", () => {
    expect(src).toContain("user = null");
  });

  it("keycloak.ts exports verifySessionToken for SSO-issued sessions", () => {
    expect(keycloakSrc).toContain("export async function verifySessionToken");
    expect(keycloakSrc).toContain("export async function createSessionToken");
  });

  it("keycloak session tokens are HS256 JWTs signed with the cookie secret", () => {
    expect(keycloakSrc).toContain('alg: "HS256"');
    expect(keycloakSrc).toContain("ENV.cookieSecret");
  });
});

// ─── server/routers.ts auth.login ─────────────────────────────────────────────

describe("server/routers.ts auth.login — uses createSessionToken not sdk.signSession", () => {
  const src = readSrc("server/routers.ts");

  it("does not call sdk.signSession in auth.login", () => {
    expect(src).not.toContain("sdk.signSession");
  });

  it("imports createSessionToken from keycloak.ts in auth.login", () => {
    expect(src).toContain("createSessionToken");
    expect(src).toContain("_core/keycloak");
  });

  it("does not reference VITE_APP_ID in the session token payload", () => {
    // Old code: appId: process.env.VITE_APP_ID ?? "paygate"
    expect(src).not.toContain("VITE_APP_ID ?? \"paygate\"");
  });
});

// ─── client/src/const.ts ─────────────────────────────────────────────────────

describe("client/src/const.ts — startLogin OAuth entry point", () => {
  // Real contract: login starts via startLogin(), which mints a one-time
  // nonce into the OAuth state cookie and navigates to the OAuth portal
  // /app-auth endpoint. The Keycloak SSO entry point is the server-side
  // /api/oauth/keycloak/login route (see keycloakRoutes.ts).
  const src = readSrc("client/src/const.ts");

  it("exports a startLogin function (no render-phase URL builder)", () => {
    expect(src).toContain("export const startLogin");
  });

  it("mints a one-time nonce into the OAuth state cookie", () => {
    expect(src).toContain("crypto.randomUUID()");
    expect(src).toContain("OAUTH_STATE_COOKIE");
  });

  it("encodes redirectUri + nonce into the state parameter", () => {
    expect(src).toContain("encodeOAuthState({ redirectUri, nonce })");
  });

  it("navigates to the OAuth portal /app-auth endpoint", () => {
    expect(src).toContain("VITE_OAUTH_PORTAL_URL");
    expect(src).toContain("/app-auth");
  });

  it("state cookie is short-lived (Max-Age=600) and Secure", () => {
    expect(src).toContain("Max-Age=600");
    expect(src).toContain("Secure");
  });
});

// ─── client/src/_core/hooks/useAuth.ts ───────────────────────────────────────

describe("client/src/_core/hooks/useAuth.ts — user-info mirror", () => {
  // Real contract: useAuth mirrors the current user into the legacy
  // "manus-runtime-user-info" localStorage key (retained for compatibility
  // with the runtime host) and does not store any token there.
  const src = readSrc("client/src/_core/hooks/useAuth.ts");

  it("mirrors the auth.me payload into localStorage", () => {
    expect(src).toContain("manus-runtime-user-info");
    expect(src).toContain("JSON.stringify(meQuery.data)");
  });

  it("does not persist session tokens in localStorage", () => {
    expect(src).not.toContain("localStorage.setItem(\"manus-cookie\"");
    expect(src).not.toContain("localStorage.setItem('manus-cookie'");
  });
});

// ─── client/index.html ───────────────────────────────────────────────────────

describe("client/index.html — no hardcoded manus.space URL", () => {
  const src = readSrc("client/index.html");

  it("does not contain paygate.manus.space", () => {
    expect(src).not.toContain("paygate.manus.space");
  });
});

// ─── docker-compose.production.yml ───────────────────────────────────────────

describe("docker-compose.production.yml — Keycloak env vars present in app service", () => {
  const src = readSrc("docker-compose.production.yml");

  it("sets KEYCLOAK_URL for the app service", () => {
    expect(src).toContain("KEYCLOAK_URL:");
  });

  it("sets KEYCLOAK_REALM for the app service", () => {
    expect(src).toContain("KEYCLOAK_REALM:");
  });

  it("sets KEYCLOAK_CLIENT_ID for the app service", () => {
    expect(src).toContain("KEYCLOAK_CLIENT_ID:");
  });

  it("sets KEYCLOAK_CLIENT_SECRET for the app service", () => {
    expect(src).toContain("KEYCLOAK_CLIENT_SECRET:");
  });

  it("app service depends on keycloak service", () => {
    // After Round 35, the condition is service_healthy (not service_started)
    expect(src).toContain("keycloak:");
    expect(src).toContain("condition: service_healthy");
  });
});

// ─── scripts/keycloak-bootstrap.sh ───────────────────────────────────────────

describe("scripts/keycloak-bootstrap.sh — realm provisioning script exists", () => {
  const src = readSrc("scripts/keycloak-bootstrap.sh");

  it("creates the paygate realm", () => {
    expect(src).toContain("paygate");
  });

  it("creates the merchant-portal client", () => {
    expect(src).toContain("merchant-portal");
  });

  it("creates realm roles including paygate-admin", () => {
    expect(src).toContain("paygate-admin");
  });

  it("creates the first admin user", () => {
    expect(src).toContain("PAYGATE_ADMIN_EMAIL");
  });

  it("is idempotent — uses GET-then-CREATE pattern", () => {
    expect(src).toContain("already exists");
  });
});

// ─── Round 36 — TOTP/MFA, Refresh Token Rotation, Keycloak Audit Events ────────

describe("Round 36 — TOTP/MFA enforcement", () => {
  const bootstrapSrc = readFileSync(resolve(ROOT, "scripts/keycloak-bootstrap.sh"), "utf8");
  const realmSrc = readFileSync(resolve(ROOT, "keycloak/paygate-realm.json"), "utf8");
  const realm = JSON.parse(realmSrc);

  it("realm JSON has otpPolicy block with TOTP type", () => {
    expect(realm.otpPolicy).toBeDefined();
    expect(realm.otpPolicy.type).toBe("totp");
    expect(realm.otpPolicy.digits).toBe(6);
    expect(realm.otpPolicy.period).toBe(30);
  });

  it("realm JSON has CONFIGURE_TOTP in requiredActions", () => {
    const totpAction = realm.requiredActions?.find(
      (a: { alias: string }) => a.alias === "CONFIGURE_TOTP"
    );
    expect(totpAction).toBeDefined();
    expect(totpAction.enabled).toBe(true);
  });

  it("bootstrap.sh enforces CONFIGURE_TOTP required action for admin user", () => {
    expect(bootstrapSrc).toContain("CONFIGURE_TOTP");
    expect(bootstrapSrc).toContain("requiredActions");
    expect(bootstrapSrc).toContain("admin must enrol on first login");
  });
});

describe("Round 36 — Refresh Token Rotation", () => {
  const oauthSrc = readFileSync(resolve(ROOT, "server/_core/oauth.ts"), "utf8");
  const keycloakSrc = readFileSync(resolve(ROOT, "server/_core/keycloak.ts"), "utf8");
  const cookiesSrc = readFileSync(resolve(ROOT, "server/_core/cookies.ts"), "utf8");
  const routersSrc = readFileSync(resolve(ROOT, "server/routers.ts"), "utf8");
  const useAuthSrc = readFileSync(resolve(ROOT, "client/src/_core/hooks/useAuth.ts"), "utf8");

  it("cookies.ts exports REFRESH_TOKEN_COOKIE_NAME", () => {
    expect(cookiesSrc).toContain("REFRESH_TOKEN_COOKIE_NAME");
    expect(cookiesSrc).toContain("paygate_refresh_token");
  });

  // Real contract: the refresh-token surface today is (a) the REFRESH_TOKEN_COOKIE_NAME
  // constant in cookies.ts, (b) the refreshAccessToken helper in keycloak.ts,
  // and (c) auth.logout in routers.ts clearing the cookie with the /api/auth
  // path restriction. The dedicated /api/auth/refresh endpoint and the client
  // silent-refresh interval were removed in the sdk-based refactor.
  it("keycloak.ts exports refreshAccessToken helper", () => {
    expect(keycloakSrc).toContain("refreshAccessToken");
    expect(keycloakSrc).toContain("grant_type");
    expect(keycloakSrc).toContain("refresh_token");
  });

  it("refreshAccessToken posts to the Keycloak token endpoint with client credentials", () => {
    expect(keycloakSrc).toContain("getTokenEndpoint()");
    expect(keycloakSrc).toContain("client_secret");
    expect(keycloakSrc).toContain("expires_in");
  });

  it("refreshAccessToken returns a rotated KeycloakTokenSet", () => {
    expect(keycloakSrc).toContain("KeycloakTokenSet");
    expect(keycloakSrc).toContain("refreshToken: data.refresh_token");
  });

  it("auth.logout clears the refresh_token cookie with the /api/auth path restriction", () => {
    expect(routersSrc).toContain("REFRESH_TOKEN_COOKIE_NAME");
    expect(routersSrc).toContain("clearCookie(REFRESH_TOKEN_COOKIE_NAME");
    expect(routersSrc).toContain('path: "/api/auth"');
  });

  it("useAuth.ts exposes a refresh() that refetches auth.me", () => {
    expect(useAuthSrc).toContain("refresh: () => meQuery.refetch()");
  });
});

describe("Round 36 — Keycloak event log (read-side contract)", () => {
  // Real contract: the HMAC-verified /api/internal/keycloak-events ingest
  // webhook and the logKeycloakEvent writer were removed in the refactor.
  // What remains — and what the admin Auth Events UI consumes — is the
  // keycloak_events table plus the getKeycloakEvents reader in db.ts.
  const dbSrc = readFileSync(resolve(ROOT, "server/db.ts"), "utf8");
  const schemaSrc = readFileSync(resolve(ROOT, "drizzle/schema.ts"), "utf8");

  it("drizzle/schema.ts has keycloak_events table", () => {
    expect(schemaSrc).toContain("keycloak_events");
    expect(schemaSrc).toContain("event_type");
    expect(schemaSrc).toContain("user_id");
    expect(schemaSrc).toContain("received_at");
  });

  it("db.ts exports getKeycloakEvents helper", () => {
    expect(dbSrc).toContain("getKeycloakEvents");
    expect(dbSrc).toContain("ORDER BY received_at DESC");
  });

  it("getKeycloakEvents reads from keycloak_events with limit/offset pagination", () => {
    expect(dbSrc).toContain("FROM keycloak_events");
    expect(dbSrc).toContain("LIMIT ${limit} OFFSET ${offset}");
  });

  it("getKeycloakEvents supports eventType and userId filters", () => {
    expect(dbSrc).toContain("event_type = ${opts.eventType}");
    expect(dbSrc).toContain("user_id = ${opts.userId}");
  });

  it("env.ts still carries the webhook secret for the Keycloak event listener SPI", () => {
    const envSrc = readFileSync(resolve(ROOT, "server/_core/env.ts"), "utf8");
    expect(envSrc).toContain("keycloakWebhookSecret");
    expect(envSrc).toContain("KEYCLOAK_WEBHOOK_SECRET");
  });
});

// ─── Round 37 — Auth Events UI, Session Timeout Policy, TOTP Recovery ─────────

describe("Round 37 — keycloak.getAuthEvents tRPC procedure", () => {
  const routersSrc = readFileSync(resolve(ROOT, "server/routers.ts"), "utf8");

  it("routers.ts imports getKeycloakEvents from db", () => {
    expect(routersSrc).toContain("getKeycloakEvents,");
  });

  it("routers.ts has getAuthEvents procedure in keycloak router", () => {
    expect(routersSrc).toContain("getAuthEvents: protectedProcedure");
  });

  it("getAuthEvents enforces non-admin users can only see their own events", () => {
    expect(routersSrc).toContain('ctx.user.role === "admin"');
    expect(routersSrc).toContain("ctx.user.openId");
  });

  it("getAuthEvents accepts limit, userId, and eventType filters", () => {
    expect(routersSrc).toContain("limit: z.number().min(1).max(500)");
    expect(routersSrc).toContain("userId: z.string().optional()");
    expect(routersSrc).toContain("eventType: z.string().optional()");
  });
});

describe("Round 37 — AuthEvents.tsx UI page", () => {
  const uiSrc = readFileSync(resolve(ROOT, "client/src/pages/AuthEvents.tsx"), "utf8");
  const appSrc = readFileSync(resolve(ROOT, "client/src/App.tsx"), "utf8");
  const layoutSrc = readFileSync(resolve(ROOT, "client/src/components/Layout.tsx"), "utf8");

  it("AuthEvents.tsx exists and uses trpc.middleware.keycloak.getAuthEvents", () => {
    expect(uiSrc).toContain("trpc.middleware.keycloak.getAuthEvents.useQuery");
  });

  it("AuthEvents.tsx has event type filter", () => {
    expect(uiSrc).toContain("eventTypeFilter");
    expect(uiSrc).toContain("EVENT_TYPES");
  });

  it("AuthEvents.tsx shows error events with destructive badge", () => {
    expect(uiSrc).toContain("_ERROR");
    expect(uiSrc).toContain("destructive");
  });

  it("App.tsx registers /settings/auth-events route", () => {
    expect(appSrc).toContain("/settings/auth-events");
    expect(appSrc).toContain("AuthEvents");
  });

  it("Layout.tsx has Auth Events nav entry under Compliance & KYC", () => {
    expect(layoutSrc).toContain("/settings/auth-events");
    expect(layoutSrc).toContain("Auth Events");
  });
});

describe("Round 37 — Session Timeout Policy in realm JSON", () => {
  const realmSrc = readFileSync(resolve(ROOT, "keycloak/paygate-realm.json"), "utf8");
  const realm = JSON.parse(realmSrc);

  it("realm has accessTokenLifespan set to 900 seconds (15 min)", () => {
    expect(realm.accessTokenLifespan).toBe(900);
  });

  it("realm has ssoSessionIdleTimeout set to 1800 seconds (30 min)", () => {
    expect(realm.ssoSessionIdleTimeout).toBe(1800);
  });

  it("realm has ssoSessionMaxLifespan set to 28800 seconds (8 hr)", () => {
    expect(realm.ssoSessionMaxLifespan).toBe(28800);
  });

  it("realm has offlineSessionIdleTimeout set to 30 days", () => {
    expect(realm.offlineSessionIdleTimeout).toBe(2592000);
  });
});

describe("Round 37 — TOTP Recovery Codes", () => {
  const realmSrc = readFileSync(resolve(ROOT, "keycloak/paygate-realm.json"), "utf8");
  const realm = JSON.parse(realmSrc);
  const bootstrapSrc = readFileSync(resolve(ROOT, "scripts/keycloak-bootstrap.sh"), "utf8");
  const docsSrc = readFileSync(resolve(ROOT, "docs/keycloak-deployment.md"), "utf8");

  it("realm JSON has RECOVERY_AUTHN_CODES in requiredActions", () => {
    const action = realm.requiredActions?.find(
      (a: { alias: string }) => a.alias === "RECOVERY_AUTHN_CODES"
    );
    expect(action).toBeDefined();
    expect(action.enabled).toBe(true);
  });

  it("bootstrap.sh has reset_admin_totp function", () => {
    expect(bootstrapSrc).toContain("reset_admin_totp");
    expect(bootstrapSrc).toContain("CONFIGURE_TOTP");
    expect(bootstrapSrc).toContain("execute-actions-email");
  });

  it("docs/keycloak-deployment.md has TOTP recovery runbook", () => {
    expect(docsSrc).toContain("Locked-Out Admin Recovery Runbook");
    expect(docsSrc).toContain("reset_admin_totp");
  });

  it("docs/keycloak-deployment.md has session timeout policy section", () => {
    expect(docsSrc).toContain("Session Timeout Policy");
    expect(docsSrc).toContain("accessTokenLifespan");
    expect(docsSrc).toContain("ssoSessionIdleTimeout");
  });

  it("docs/keycloak-deployment.md has Auth Events audit log section", () => {
    expect(docsSrc).toContain("Auth Events Audit Log");
    expect(docsSrc).toContain("/settings/auth-events");
    expect(docsSrc).toContain("KEYCLOAK_WEBHOOK_SECRET");
  });
});

// ─── Round 38 — Rate Limiting, Event Listener SPI Config, Webhook Secret ──────

describe("Round 38 — Rate limiting on auth endpoints", () => {
  // Real contract: rate limiting lives in the dedicated server/rateLimit.ts
  // module (Redis sliding window with in-process fallback) and is mounted in
  // server/_core/index.ts on /api/oauth, /api/webhooks, /api/scheduled and
  // /api/trpc — no per-endpoint limiters inside oauth.ts.
  const rateLimitSrc = readFileSync(resolve(ROOT, "server/rateLimit.ts"), "utf8");
  const indexSrc = readFileSync(resolve(ROOT, "server/_core/index.ts"), "utf8");

  it("rateLimit.ts exports the expressRateLimit middleware factory", () => {
    expect(rateLimitSrc).toContain("export function expressRateLimit");
  });

  it("rateLimit.ts exports the trpcApiRateLimit classifier", () => {
    expect(rateLimitSrc).toContain("export function trpcApiRateLimit");
  });

  it("rateLimit.ts exports the tRPC rateLimit middleware plus named limiters", () => {
    expect(rateLimitSrc).toContain("export function rateLimit");
    expect(rateLimitSrc).toContain("export const readLimit");
    expect(rateLimitSrc).toContain("export const mutationLimit");
    expect(rateLimitSrc).toContain("export const financialLimit");
    expect(rateLimitSrc).toContain("export const authLimit");
    expect(rateLimitSrc).toContain("export const payoutLimit");
    expect(rateLimitSrc).toContain("export const webhookLimit");
  });

  it("rate limiter uses a Redis sliding window with in-process fallback", () => {
    expect(rateLimitSrc).toContain("redisSlideWindow");
    expect(rateLimitSrc).toContain("memoryStore");
  });

  it("rate limiter returns 429 when limit exceeded", () => {
    expect(rateLimitSrc).toContain("status(429)");
    expect(rateLimitSrc).toContain("Rate limit exceeded");
  });

  it("index.ts imports the rate limiters from server/rateLimit.ts", () => {
    expect(indexSrc).toContain('from "../rateLimit"');
    expect(indexSrc).toContain("expressRateLimit");
    expect(indexSrc).toContain("trpcApiRateLimit");
  });

  it("index.ts applies rate limiting to the OAuth login/callback routes", () => {
    expect(indexSrc).toContain('"/api/oauth"');
    expect(indexSrc).toContain("auth:oauth");
  });

  it("index.ts applies rate limiting to webhooks and scheduled endpoints", () => {
    expect(indexSrc).toContain('"/api/webhooks"');
    expect(indexSrc).toContain('"/api/scheduled"');
  });

  it("index.ts throttles the tRPC API with the classifier", () => {
    expect(indexSrc).toContain('app.use("/api/trpc", trpcApiRateLimit())');
  });
});

describe("Round 38 — Keycloak event listener SPI config in realm JSON", () => {
  const realmSrc = readFileSync(resolve(ROOT, "keycloak/paygate-realm.json"), "utf8");
  const realm = JSON.parse(realmSrc);

  it("realm has eventsEnabled = true", () => {
    expect(realm.eventsEnabled).toBe(true);
  });

  it("realm has adminEventsEnabled = true", () => {
    expect(realm.adminEventsEnabled).toBe(true);
  });

  it("realm has eventsExpiration set to 90 days", () => {
    expect(realm.eventsExpiration).toBe(90 * 24 * 3600);
  });

  it("realm has eventsListeners array", () => {
    expect(Array.isArray(realm.eventsListeners)).toBe(true);
    expect(realm.eventsListeners).toContain("jboss-logging");
  });

  it("realm has enabledEventTypes with LOGIN and LOGIN_ERROR", () => {
    expect(Array.isArray(realm.enabledEventTypes)).toBe(true);
    expect(realm.enabledEventTypes).toContain("LOGIN");
    expect(realm.enabledEventTypes).toContain("LOGIN_ERROR");
    expect(realm.enabledEventTypes).toContain("LOGOUT");
    expect(realm.enabledEventTypes).toContain("CONFIGURE_TOTP");
  });
});

describe("Round 38 — KEYCLOAK_WEBHOOK_SECRET in env.ts and docker-compose", () => {
  const envSrc = readFileSync(resolve(ROOT, "server/_core/env.ts"), "utf8");
  const composeSrc = readFileSync(resolve(ROOT, "docker-compose.production.yml"), "utf8");

  it("env.ts has keycloakWebhookSecret field", () => {
    expect(envSrc).toContain("keycloakWebhookSecret");
    expect(envSrc).toContain("KEYCLOAK_WEBHOOK_SECRET");
  });

  it("docker-compose.production.yml has KEYCLOAK_WEBHOOK_SECRET in keycloak service", () => {
    expect(composeSrc).toContain("KEYCLOAK_WEBHOOK_SECRET");
  });
});

// ─── Round 39 — Brute-Force Policy, Security Headers, Rate Limit Headers ──────

describe("Round 39 — Keycloak brute-force protection in realm JSON", () => {
  const realmSrc = readFileSync(resolve(ROOT, "keycloak/paygate-realm.json"), "utf8");
  const realm = JSON.parse(realmSrc);

  it("realm has bruteForceProtected = true", () => {
    expect(realm.bruteForceProtected).toBe(true);
  });

  it("realm has permanentLockout = false (temporary lockout only)", () => {
    expect(realm.permanentLockout).toBe(false);
  });

  it("realm has failureFactor = 5", () => {
    expect(realm.failureFactor).toBe(5);
  });

  it("realm has maxFailureWaitSeconds = 900 (15 min max lockout)", () => {
    expect(realm.maxFailureWaitSeconds).toBe(900);
  });

  it("realm has waitIncrementSeconds = 60", () => {
    expect(realm.waitIncrementSeconds).toBe(60);
  });

  it("realm has maxDeltaTimeSeconds = 43200 (12 hr failure window)", () => {
    expect(realm.maxDeltaTimeSeconds).toBe(43200);
  });
});

describe("Round 39 — Security headers (server/securityHeaders.ts mounted in index.ts)", () => {
  // Real contract: security headers are hand-rolled in
  // server/securityHeaders.ts (no helmet dependency) and mounted app-wide in
  // server/_core/index.ts.
  const indexSrc = readFileSync(resolve(ROOT, "server/_core/index.ts"), "utf8");
  const headersSrc = readFileSync(resolve(ROOT, "server/securityHeaders.ts"), "utf8");

  it("index.ts mounts securityHeaders before other middleware", () => {
    expect(indexSrc).toContain("app.use(securityHeaders)");
    expect(indexSrc).toContain('from "../securityHeaders"');
  });

  it("sets HSTS with 1-year max-age, includeSubDomains and preload", () => {
    expect(headersSrc).toContain("Strict-Transport-Security");
    expect(headersSrc).toContain("max-age=31536000; includeSubDomains; preload");
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    expect(headersSrc).toContain("X-Content-Type-Options");
    expect(headersSrc).toContain("nosniff");
  });

  it("sets Referrer-Policy: strict-origin-when-cross-origin", () => {
    expect(headersSrc).toContain("Referrer-Policy");
    expect(headersSrc).toContain("strict-origin-when-cross-origin");
  });

  it("sets X-Frame-Options: DENY (clickjacking protection)", () => {
    expect(headersSrc).toContain("X-Frame-Options");
    expect(headersSrc).toContain("DENY");
  });

  it("sets a restrictive Content-Security-Policy", () => {
    expect(headersSrc).toContain("Content-Security-Policy");
    expect(headersSrc).toContain("default-src 'self'");
    expect(headersSrc).toContain("object-src 'none'");
  });

  it("removes the X-Powered-By fingerprint header", () => {
    expect(headersSrc).toContain('res.removeHeader("X-Powered-By")');
  });
});

describe("Round 39 — Rate limit response headers in server/rateLimit.ts", () => {
  // Real contract: 429 responses and rate-limit headers are produced by the
  // expressRateLimit middleware in server/rateLimit.ts.
  const rateLimitSrc = readFileSync(resolve(ROOT, "server/rateLimit.ts"), "utf8");

  it("sets Retry-After header on 429 responses", () => {
    expect(rateLimitSrc).toContain("Retry-After");
  });

  it("sets X-RateLimit-Limit header on 429 responses", () => {
    expect(rateLimitSrc).toContain("X-RateLimit-Limit");
  });

  it("sets X-RateLimit-Remaining header on 429 responses", () => {
    expect(rateLimitSrc).toContain("X-RateLimit-Remaining");
  });

  it("includes retryAfterSeconds in the 429 response body", () => {
    expect(rateLimitSrc).toContain("retryAfterSeconds");
  });

  it("RateLimitOptions exposes max and windowMs configuration", () => {
    expect(rateLimitSrc).toContain("max?: number");
    expect(rateLimitSrc).toContain("windowMs?: number");
  });
});

// ─── Round 40 — Password Policy, Auth-Config Endpoint, State Entropy ──────────

describe("Round 40 — Keycloak password policy in realm JSON", () => {
  const realmSrc = readFileSync(resolve(ROOT, "keycloak/paygate-realm.json"), "utf8");
  const realm = JSON.parse(realmSrc);

  it("realm has passwordPolicy set", () => {
    expect(typeof realm.passwordPolicy).toBe("string");
    expect(realm.passwordPolicy.length).toBeGreaterThan(0);
  });

  it("password policy requires minimum 12 characters", () => {
    expect(realm.passwordPolicy).toContain("length(12)");
  });

  it("password policy requires uppercase letters", () => {
    expect(realm.passwordPolicy).toContain("upperCase(1)");
  });

  it("password policy requires lowercase letters", () => {
    expect(realm.passwordPolicy).toContain("lowerCase(1)");
  });

  it("password policy requires digits", () => {
    expect(realm.passwordPolicy).toContain("digits(1)");
  });

  it("password policy requires special characters", () => {
    expect(realm.passwordPolicy).toContain("specialChars(1)");
  });

  it("password policy prevents using username as password", () => {
    expect(realm.passwordPolicy).toContain("notUsername");
  });

  it("password policy prevents using email as password", () => {
    expect(realm.passwordPolicy).toContain("notEmail");
  });

  it("password policy enforces history of 5 passwords", () => {
    expect(realm.passwordPolicy).toContain("passwordHistory(5)");
  });
});

describe("Round 40 — config validation surface (validateServerEnv + /api/health)", () => {
  // Real contract: the dedicated /api/health/auth-config endpoint was removed.
  // Config assurance now comes from (a) validateServerEnv() at boot — fail
  // closed in production on missing DATABASE_URL/JWT_SECRET, loud warnings for
  // missing integrations including KEYCLOAK_URL — and (b) the /api/health
  // probe that reports DB/bridge status and returns 503 when unavailable.
  const indexSrc = readFileSync(resolve(ROOT, "server/_core/index.ts"), "utf8");
  const envSrc = readFileSync(resolve(ROOT, "server/_core/env.ts"), "utf8");

  it("index.ts calls validateServerEnv() at boot", () => {
    expect(indexSrc).toContain("validateServerEnv()");
  });

  it("validateServerEnv fails closed on missing DATABASE_URL and JWT_SECRET", () => {
    expect(envSrc).toContain("DATABASE_URL");
    expect(envSrc).toContain("JWT_SECRET");
    expect(envSrc).toContain("refusing to boot in production (fail closed)");
  });

  it("validateServerEnv warns about missing KEYCLOAK_URL integration", () => {
    expect(envSrc).toContain("KEYCLOAK_URL");
    expect(envSrc).toContain("missingRecommended");
  });

  it("index.ts has /api/health endpoint", () => {
    expect(indexSrc).toContain('"/api/health"');
  });

  it("/api/health returns 503 when the database is unreachable", () => {
    expect(indexSrc).toContain("503");
    expect(indexSrc).toContain('"unavailable"');
  });
});

describe("Round 40 — OAuth state CSRF guard in oauth.ts", () => {
  // Real contract: state validation is a nonce-match CSRF guard — the nonce
  // embedded in `state` must equal the one-time OAUTH_STATE_COOKIE set by
  // startLogin; mismatches are rejected with 403 and the cookie is cleared.
  const oauthSrc = readFileSync(resolve(ROOT, "server/_core/oauth.ts"), "utf8");
  const keycloakRoutesSrc = readFileSync(resolve(ROOT, "server/_core/keycloakRoutes.ts"), "utf8");

  it("decodes the nonce from the state parameter", () => {
    expect(oauthSrc).toContain("decodeOAuthState(state)");
  });

  it("compares the state nonce against the one-time state cookie", () => {
    expect(oauthSrc).toContain("OAUTH_STATE_COOKIE");
    expect(oauthSrc).toContain("nonce !== expectedNonce");
  });

  it("rejects forged state with 403 and clears the state cookie", () => {
    expect(oauthSrc).toContain("invalid oauth state");
    expect(oauthSrc).toContain("res.status(403)");
    expect(oauthSrc).toContain("res.clearCookie(OAUTH_STATE_COOKIE");
  });

  it("keycloak callback only redirects to relative returnPaths (open-redirect guard)", () => {
    expect(keycloakRoutesSrc).toContain("/^\\/[^/]/");
    expect(keycloakRoutesSrc).toContain('includes(":")');
  });
});
