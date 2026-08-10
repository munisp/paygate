/**
 * Secrets validation test — Round 44
 * Verifies that KEYCLOAK_ADMIN_PASSWORD and KEYCLOAK_WEBHOOK_SECRET
 * are set in the environment and accessible via ENV object.
 */
import { describe, it, expect } from "vitest";

describe("Secrets validation — Keycloak admin and webhook secrets", () => {
  it("KEYCLOAK_ADMIN_PASSWORD is set and non-empty", () => {
    // In CI/sandbox the value is the placeholder; in production it will be the real value.
    // We only verify it is present (not empty string).
    const val = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "";
    expect(val.length).toBeGreaterThan(0);
  });

  it("KEYCLOAK_WEBHOOK_SECRET is set and non-empty", () => {
    const val = process.env.KEYCLOAK_WEBHOOK_SECRET ?? "";
    expect(val.length).toBeGreaterThan(0);
  });

  it("ENV object exposes keycloakAdminPassword from process.env", async () => {
    const { ENV } = await import("./_core/env");
    expect(typeof ENV.keycloakAdminPassword).toBe("string");
    expect(ENV.keycloakAdminPassword.length).toBeGreaterThan(0);
  });

  it("ENV object exposes keycloakWebhookSecret from process.env", async () => {
    const { ENV } = await import("./_core/env");
    expect(typeof ENV.keycloakWebhookSecret).toBe("string");
    expect(ENV.keycloakWebhookSecret.length).toBeGreaterThan(0);
  });
});
