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

describe("client/src/_core/hooks/useAuth.ts — SSO logout redirect", () => {
  const src = readFileSync(resolve(ROOT, "client/src/_core/hooks/useAuth.ts"), "utf8");

  it("passes window.location.origin to logout mutation", () => {
    expect(src).toContain("origin: window.location.origin");
  });

  it("redirects to ssoLogoutUrl when returned by server", () => {
    expect(src).toContain("result?.ssoLogoutUrl");
    expect(src).toContain("window.location.href = result.ssoLogoutUrl");
  });

  it("handles expired session gracefully without throwing", () => {
    expect(src).toContain("UNAUTHORIZED");
    expect(src).toContain("return;");
  });
});

describe("server/_core/oauth.ts — ALLOWED_ORIGINS hardening", () => {
  const src = readFileSync(resolve(ROOT, "server/_core/oauth.ts"), "utf8");

  it("rejects wildcard entries in ALLOWED_ORIGINS", () => {
    expect(src).toContain("Wildcards are not permitted");
    expect(src).toContain('o !== "*" && o !== "**"');
  });

  it("rejects null/undefined/empty origin strings", () => {
    expect(src).toContain('rawOrigin === "null"');
    expect(src).toContain('rawOrigin === "undefined"');
  });

  it("in production mode, does not allow localhost fallback", () => {
    expect(src).toContain("IS_PRODUCTION");
    expect(src).toContain("if (IS_PRODUCTION) return false;");
  });

  it("logs allowed origins at startup", () => {
    expect(src).toContain("ALLOWED_ORIGINS:");
  });

  it("warns when ALLOWED_ORIGINS is empty in production", () => {
    expect(src).toContain("ALLOWED_ORIGINS is empty in production");
  });

  it("parses ALLOWED_ORIGINS from env var at module load time", () => {
    expect(src).toContain("parseAllowedOrigins()");
    expect(src).toContain("ALLOWED_ORIGINS_LIST");
  });

  it("warns about http:// origins in production", () => {
    expect(src).toContain("Consider switching to https://");
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
  });

  it("exports getIdTokenCookieOptions function", () => {
    expect(src).toContain("export function getIdTokenCookieOptions");
  });

  it("id_token cookie has httpOnly flag", () => {
    expect(src).toContain("httpOnly: true");
  });

  it("id_token cookie has a maxAge based on expiresInSeconds", () => {
    expect(src).toContain("maxAge: expiresInSeconds * 1000");
  });
});

describe("server/_core/oauth.ts — id_token cookie stored after callback", () => {
  const src = readFileSync(resolve(ROOT, "server/_core/oauth.ts"), "utf8");

  it("imports ID_TOKEN_COOKIE_NAME from cookies", () => {
    expect(src).toContain("ID_TOKEN_COOKIE_NAME");
  });

  it("imports getIdTokenCookieOptions from cookies", () => {
    expect(src).toContain("getIdTokenCookieOptions");
  });

  it("stores id_token in cookie after successful callback", () => {
    expect(src).toContain("res.cookie(ID_TOKEN_COOKIE_NAME, tokens.idToken");
  });

  it("uses tokens.expiresIn for cookie maxAge", () => {
    expect(src).toContain("tokens.expiresIn");
  });

  it("only sets id_token cookie when idToken is present", () => {
    expect(src).toContain("if (tokens.idToken)");
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

describe("server/_core/oauth.ts — Keycloak-only auth", () => {
  const src = readSrc("server/_core/oauth.ts");

  it("does not import the Manus SDK", () => {
    expect(src).not.toContain("from \"./sdk\"");
    expect(src).not.toContain("from './sdk'");
  });

  it("does not contain handleManusCallback", () => {
    expect(src).not.toContain("handleManusCallback");
  });

  it("does not call sdk.exchangeCodeForToken", () => {
    expect(src).not.toContain("sdk.exchangeCodeForToken");
  });

  it("does not call sdk.getUserInfo", () => {
    expect(src).not.toContain("sdk.getUserInfo");
  });

  it("registers the primary Keycloak login endpoint", () => {
    expect(src).toContain("/api/auth/keycloak/login");
  });

  it("registers the legacy Keycloak login path for backwards compat", () => {
    expect(src).toContain("/api/oauth/keycloak/login");
  });

  it("uses createSessionToken from keycloak.ts", () => {
    expect(src).toContain("createSessionToken");
    expect(src).toContain("from \"./keycloak\"");
  });

  it("does not contain manus.space or manus.computer domain patterns", () => {
    expect(src).not.toContain("manus.space");
    expect(src).not.toContain("manus.computer");
  });

  it("warns when KEYCLOAK_URL is not set instead of silently falling back", () => {
    expect(src).toContain("KEYCLOAK_URL is not set");
  });
});

// ─── server/_core/context.ts ──────────────────────────────────────────────────

describe("server/_core/context.ts — Keycloak-only session verification", () => {
  const src = readSrc("server/_core/context.ts");

  it("does not import the Manus SDK", () => {
    expect(src).not.toContain("from \"./sdk\"");
    expect(src).not.toContain("from './sdk'");
  });

  it("does not call sdk.authenticateRequest", () => {
    expect(src).not.toContain("sdk.authenticateRequest");
  });

  it("uses verifySessionToken from keycloak.ts", () => {
    expect(src).toContain("verifySessionToken");
    expect(src).toContain("from \"./keycloak\"");
  });

  it("does not branch on ENV.keycloakUrl (no Manus fallback)", () => {
    // Old code had: if (ENV.keycloakUrl) { ... } else { sdk.authenticateRequest }
    expect(src).not.toContain("sdk.authenticateRequest");
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

describe("client/src/const.ts — getLoginUrl always uses Keycloak", () => {
  const src = readSrc("client/src/const.ts");

  it("does not contain VITE_OAUTH_PORTAL_URL", () => {
    expect(src).not.toContain("VITE_OAUTH_PORTAL_URL");
  });

  it("does not contain VITE_APP_ID", () => {
    expect(src).not.toContain("VITE_APP_ID");
  });

  it("does not contain Manus OAuth /app-auth endpoint", () => {
    expect(src).not.toContain("/app-auth");
  });

  it("always points to /api/auth/keycloak/login", () => {
    expect(src).toContain("/api/auth/keycloak/login");
  });

  it("does not have a conditional Manus OAuth fallback", () => {
    expect(src).not.toContain("Manus OAuth fallback");
  });
});

// ─── client/src/_core/hooks/useAuth.ts ───────────────────────────────────────

describe("client/src/_core/hooks/useAuth.ts — no Manus-specific localStorage key", () => {
  const src = readSrc("client/src/_core/hooks/useAuth.ts");

  it("does not write to manus-runtime-user-info localStorage", () => {
    expect(src).not.toContain("manus-runtime-user-info");
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

  it("cookies.ts exports getRefreshTokenCookieOptions with path /api/auth", () => {
    expect(cookiesSrc).toContain("getRefreshTokenCookieOptions");
    expect(cookiesSrc).toContain('path: "/api/auth"');
  });

  it("keycloak.ts exports refreshAccessToken helper", () => {
    expect(keycloakSrc).toContain("refreshAccessToken");
    expect(keycloakSrc).toContain("grant_type");
    expect(keycloakSrc).toContain("refresh_token");
  });

  it("oauth.ts stores refresh_token cookie after OIDC callback", () => {
    expect(oauthSrc).toContain("REFRESH_TOKEN_COOKIE_NAME");
    expect(oauthSrc).toContain("tokens.refreshToken");
    expect(oauthSrc).toContain("getRefreshTokenCookieOptions");
  });

  it("oauth.ts registers /api/auth/refresh endpoint", () => {
    expect(oauthSrc).toContain("/api/auth/refresh");
    expect(oauthSrc).toContain("refreshAccessToken");
    expect(oauthSrc).toContain("expiresIn");
  });

  it("auth.logout clears the refresh_token cookie", () => {
    expect(routersSrc).toContain("REFRESH_TOKEN_COOKIE_NAME");
    expect(routersSrc).toContain("clearCookie(REFRESH_TOKEN_COOKIE_NAME");
  });

  it("useAuth.ts has silent refresh interval", () => {
    expect(useAuthSrc).toContain("silentRefresh");
    expect(useAuthSrc).toContain("/api/auth/refresh");
    expect(useAuthSrc).toContain("REFRESH_INTERVAL_MS");
  });

  it("useAuth.ts exposes silentRefresh in return value", () => {
    expect(useAuthSrc).toContain("silentRefresh,");
  });
});

describe("Round 36 — Keycloak Event Listener Webhook", () => {
  const oauthSrc = readFileSync(resolve(ROOT, "server/_core/oauth.ts"), "utf8");
  const dbSrc = readFileSync(resolve(ROOT, "server/db.ts"), "utf8");
  const schemaSrc = readFileSync(resolve(ROOT, "drizzle/schema.ts"), "utf8");

  it("drizzle/schema.ts has keycloak_events table", () => {
    expect(schemaSrc).toContain("keycloak_events");
    expect(schemaSrc).toContain("event_type");
    expect(schemaSrc).toContain("user_id");
    expect(schemaSrc).toContain("received_at");
  });

  it("db.ts exports logKeycloakEvent helper", () => {
    expect(dbSrc).toContain("logKeycloakEvent");
    expect(dbSrc).toContain("eventType");
    expect(dbSrc).toContain("keycloak_events");
  });

  it("db.ts exports getKeycloakEvents helper", () => {
    expect(dbSrc).toContain("getKeycloakEvents");
    expect(dbSrc).toContain("ORDER BY received_at DESC");
  });

  it("oauth.ts registers /api/internal/keycloak-events endpoint", () => {
    expect(oauthSrc).toContain("/api/internal/keycloak-events");
    expect(oauthSrc).toContain("logKeycloakEvent");
    expect(oauthSrc).toContain("logAuditEvent");
  });

  it("oauth.ts verifies HMAC signature on keycloak-events webhook", () => {
    expect(oauthSrc).toContain("KEYCLOAK_WEBHOOK_SECRET");
    expect(oauthSrc).toContain("x-keycloak-signature");
    expect(oauthSrc).toContain("timingSafeEqual");
    expect(oauthSrc).toContain("createHmac");
  });

  it("oauth.ts imports createHmac and timingSafeEqual from crypto", () => {
    expect(oauthSrc).toContain('from "crypto"');
    expect(oauthSrc).toContain("createHmac");
    expect(oauthSrc).toContain("timingSafeEqual");
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
  const oauthSrc = readFileSync(resolve(ROOT, "server/_core/oauth.ts"), "utf8");

  it("oauth.ts has RateLimiter class", () => {
    expect(oauthSrc).toContain("class RateLimiter");
    expect(oauthSrc).toContain("maxRequests");
    expect(oauthSrc).toContain("windowMs");
  });

  it("oauth.ts has rate limiters for login, callback, refresh, and webhook endpoints", () => {
    expect(oauthSrc).toContain("loginRateLimit");
    expect(oauthSrc).toContain("callbackRateLimit");
    expect(oauthSrc).toContain("refreshRateLimit");
    expect(oauthSrc).toContain("webhookRateLimit");
  });

  it("oauth.ts applies rate limiting to /api/auth/keycloak/login", () => {
    expect(oauthSrc).toContain('rateLimitMiddleware(loginRateLimit, "/api/auth/keycloak/login")');
  });

  it("oauth.ts applies rate limiting to /api/oauth/callback", () => {
    expect(oauthSrc).toContain('rateLimitMiddleware(callbackRateLimit, "/api/oauth/callback")');
  });

  it("oauth.ts applies rate limiting to /api/auth/refresh", () => {
    expect(oauthSrc).toContain('rateLimitMiddleware(refreshRateLimit, "/api/auth/refresh")');
  });

  it("oauth.ts applies rate limiting to /api/internal/keycloak-events", () => {
    expect(oauthSrc).toContain('rateLimitMiddleware(webhookRateLimit, "/api/internal/keycloak-events")');
  });

  it("rate limiter returns 429 when limit exceeded", () => {
    expect(oauthSrc).toContain("status(429)");
    expect(oauthSrc).toContain("Too many requests");
  });

  it("rate limiter uses X-Forwarded-For for IP detection behind reverse proxy", () => {
    expect(oauthSrc).toContain("x-forwarded-for");
    expect(oauthSrc).toContain("getClientIp");
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

describe("Round 39 — Security headers in server/_core/index.ts", () => {
  const indexSrc = readFileSync(resolve(ROOT, "server/_core/index.ts"), "utf8");

  it("index.ts has HSTS configuration in helmet", () => {
    expect(indexSrc).toContain("strictTransportSecurity");
    expect(indexSrc).toContain("maxAge: 31536000");
    expect(indexSrc).toContain("includeSubDomains: true");
    expect(indexSrc).toContain("preload: true");
  });

  it("index.ts has noSniff enabled in helmet", () => {
    expect(indexSrc).toContain("noSniff: true");
  });

  it("index.ts has referrerPolicy in helmet", () => {
    expect(indexSrc).toContain("referrerPolicy");
    expect(indexSrc).toContain("strict-origin-when-cross-origin");
  });

  it("index.ts has permittedCrossDomainPolicies in helmet", () => {
    expect(indexSrc).toContain("permittedCrossDomainPolicies");
    expect(indexSrc).toContain('"none"');
  });

  it("index.ts has frameguard deny in helmet (clickjacking protection)", () => {
    expect(indexSrc).toContain("frameguard");
    expect(indexSrc).toContain('"deny"');
  });

  it("index.ts has hidePoweredBy in helmet", () => {
    expect(indexSrc).toContain("hidePoweredBy: true");
  });

  it("index.ts disables HSTS in dev mode", () => {
    expect(indexSrc).toContain("strictTransportSecurity: isDev ? false");
  });
});

describe("Round 39 — Rate limit response headers in oauth.ts", () => {
  const oauthSrc = readFileSync(resolve(ROOT, "server/_core/oauth.ts"), "utf8");

  it("oauth.ts sets Retry-After header on 429 responses", () => {
    expect(oauthSrc).toContain("Retry-After");
  });

  it("oauth.ts sets X-RateLimit-Limit header on 429 responses", () => {
    expect(oauthSrc).toContain("X-RateLimit-Limit");
  });

  it("oauth.ts sets X-RateLimit-Remaining header on 429 responses", () => {
    expect(oauthSrc).toContain("X-RateLimit-Remaining");
  });

  it("oauth.ts sets X-RateLimit-Reset header on 429 responses", () => {
    expect(oauthSrc).toContain("X-RateLimit-Reset");
  });

  it("oauth.ts includes retryAfterSeconds in 429 response body", () => {
    expect(oauthSrc).toContain("retryAfterSeconds");
  });

  it("RateLimiter exposes maxRequests and windowMs as public fields", () => {
    expect(oauthSrc).toContain("readonly maxRequests: number");
    expect(oauthSrc).toContain("readonly windowMs: number");
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

describe("Round 40 — /api/health/auth-config endpoint in index.ts", () => {
  const indexSrc = readFileSync(resolve(ROOT, "server/_core/index.ts"), "utf8");

  it("index.ts has /api/health/auth-config endpoint", () => {
    expect(indexSrc).toContain('"/api/health/auth-config"');
  });

  it("auth-config endpoint checks KEYCLOAK_URL", () => {
    expect(indexSrc).toContain("KEYCLOAK_URL");
  });

  it("auth-config endpoint checks KEYCLOAK_CLIENT_SECRET", () => {
    expect(indexSrc).toContain("KEYCLOAK_CLIENT_SECRET");
  });

  it("auth-config endpoint checks JWT_SECRET", () => {
    expect(indexSrc).toContain("JWT_SECRET");
  });

  it("auth-config endpoint returns 503 when required vars are missing", () => {
    expect(indexSrc).toContain("503");
    expect(indexSrc).toContain("misconfigured");
  });

  it("auth-config endpoint returns checks object with all required fields", () => {
    expect(indexSrc).toContain("keycloakUrl:");
    expect(indexSrc).toContain("keycloakClientSecret:");
    expect(indexSrc).toContain("jwtSecret:");
    expect(indexSrc).toContain("allowedOrigins:");
    expect(indexSrc).toContain("webhookSecret:");
  });
});

describe("Round 40 — State parameter entropy validation in oauth.ts", () => {
  const oauthSrc = readFileSync(resolve(ROOT, "server/_core/oauth.ts"), "utf8");

  it("oauth.ts validates state parameter minimum length", () => {
    expect(oauthSrc).toContain("state.length < 12");
    expect(oauthSrc).toContain("Invalid state parameter");
  });

  it("oauth.ts validates state decodes to HTTP/HTTPS URI", () => {
    expect(oauthSrc).toContain('startsWith("http://")');
    expect(oauthSrc).toContain('startsWith("https://")');
  });

  it("oauth.ts logs warning on state forgery attempt", () => {
    expect(oauthSrc).toContain("possible forgery");
    expect(oauthSrc).toContain("possible open-redirect");
  });
});
