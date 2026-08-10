/**
 * Tests for Keycloak OIDC integration helpers.
 * Covers: URL construction, role extraction, session token round-trip.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock ENV before importing keycloak module ────────────────────────────────
vi.mock("./_core/env", () => ({
  ENV: {
    keycloakUrl: "https://auth.paygate.io",
    keycloakRealm: "paygate",
    keycloakClientId: "merchant-portal",
    keycloakClientSecret: "test-secret",
    cookieSecret: "test-cookie-secret-32-chars-long!!",
    appId: "paygate",
  },
}));

import {
  getKeycloakBaseUrl,
  getAuthorizationEndpoint,
  getJwksUri,
  getEndSessionEndpoint,
  buildAuthorizationUrl,
  extractRole,
  createSessionToken,
  verifySessionToken,
  type KeycloakClaims,
} from "./_core/keycloak";

describe("Keycloak URL helpers", () => {
  it("builds the correct base URL", () => {
    expect(getKeycloakBaseUrl()).toBe("https://auth.paygate.io/realms/paygate");
  });

  it("builds the authorization endpoint", () => {
    expect(getAuthorizationEndpoint()).toBe(
      "https://auth.paygate.io/realms/paygate/protocol/openid-connect/auth"
    );
  });

  it("builds the JWKS URI", () => {
    expect(getJwksUri()).toBe(
      "https://auth.paygate.io/realms/paygate/protocol/openid-connect/certs"
    );
  });

  it("builds the end-session endpoint", () => {
    expect(getEndSessionEndpoint()).toBe(
      "https://auth.paygate.io/realms/paygate/protocol/openid-connect/logout"
    );
  });
});

describe("buildAuthorizationUrl", () => {
  it("includes required OIDC parameters", () => {
    const url = new URL(buildAuthorizationUrl("https://merchant.paygate.io/api/oauth/callback", "abc123"));
    expect(url.searchParams.get("client_id")).toBe("merchant-portal");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://merchant.paygate.io/api/oauth/callback");
  });
});

describe("extractRole", () => {
  it("returns admin for paygate-admin realm role", () => {
    const claims: KeycloakClaims = {
      sub: "user-123",
      realm_access: { roles: ["paygate-admin", "offline_access"] },
    };
    expect(extractRole(claims)).toBe("admin");
  });

  it("returns admin for admin realm role", () => {
    const claims: KeycloakClaims = {
      sub: "user-456",
      realm_access: { roles: ["admin"] },
    };
    expect(extractRole(claims)).toBe("admin");
  });

  it("returns admin for client-level admin role", () => {
    const claims: KeycloakClaims = {
      sub: "user-789",
      resource_access: { "merchant-portal": { roles: ["admin"] } },
    };
    expect(extractRole(claims)).toBe("admin");
  });

  it("returns user for regular merchant", () => {
    const claims: KeycloakClaims = {
      sub: "user-000",
      realm_access: { roles: ["default-roles-paygate"] },
    };
    expect(extractRole(claims)).toBe("user");
  });

  it("returns user when no roles are present", () => {
    const claims: KeycloakClaims = { sub: "user-111" };
    expect(extractRole(claims)).toBe("user");
  });
});

describe("Session token round-trip", () => {
  it("creates and verifies a session token", async () => {
    const token = await createSessionToken("kc-sub-abc123", "Alice Merchant");
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // JWT structure

    const session = await verifySessionToken(token);
    expect(session).not.toBeNull();
    expect(session!.openId).toBe("kc-sub-abc123");
    expect(session!.name).toBe("Alice Merchant");
  });

  it("returns null for an invalid token", async () => {
    const result = await verifySessionToken("not.a.valid.jwt");
    expect(result).toBeNull();
  });

  it("returns null for undefined token", async () => {
    const result = await verifySessionToken(undefined);
    expect(result).toBeNull();
  });

  it("returns null for empty string token", async () => {
    const result = await verifySessionToken("");
    expect(result).toBeNull();
  });
});
