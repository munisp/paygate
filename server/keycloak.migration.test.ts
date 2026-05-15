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
    expect(src).toContain("keycloak:\n        condition: service_started");
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
