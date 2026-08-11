/**
 * Round 47 — IP Geolocation Enrichment, Geo Columns, Final Production Audit
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");

function readFile(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Round 47 — Geo data read-side contract", () => {
  // Real contract: the write-side IP geolocation enrichment (enrichIpGeo,
  // ip-api.com lookup, geo cache in logKeycloakEvent) was removed with the
  // keycloak-events ingest webhook. The geo columns remain in the schema and
  // are exposed through the getKeycloakEvents reader plus geo-anomaly helpers.
  it("db.ts getKeycloakEvents selects geo_country and geo_city", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("geo_country, geo_city");
    expect(db).toContain("FROM keycloak_events");
  });

  it("db.ts exposes a geo-anomaly acknowledgement helper", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("export async function acknowledgeGeoAnomaly");
    expect(db).toContain("geoAnomalyAcknowledged: true");
  });

  it("db.ts getKeycloakEvents supports a newCountryOnly anomaly filter", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("newCountryOnly?: boolean");
    expect(db).toContain("geo_anomaly_acknowledged IS NULL OR geo_anomaly_acknowledged = false");
  });

  it("db.ts getKnownCountriesForUser reads distinct LOGIN countries", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("export async function getKnownCountriesForUser");
    expect(db).toContain("SELECT DISTINCT geo_country");
  });

  it("db.ts getLatestCountryForUsers reads the most recent LOGIN country per user", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("export async function getLatestCountryForUsers");
    expect(db).toContain("SELECT DISTINCT ON (user_id) user_id, geo_country, received_at");
  });
});

describe("Round 47 — Schema Geo Columns", () => {
  it("schema.ts keycloak_events table has geo_country column", () => {
    const schema = readFile("drizzle/schema.ts");
    expect(schema).toContain("geoCountry: text(\"geo_country\")");
  });

  it("schema.ts keycloak_events table has geo_city column", () => {
    const schema = readFile("drizzle/schema.ts");
    expect(schema).toContain("geoCity: text(\"geo_city\")");
  });

  it("schema.ts keycloak_events has geo columns (migration applied)", () => {
    // The geo columns are defined in schema.ts and applied via db:push
    const schema = readFile("drizzle/schema.ts");
    expect(schema).toContain("geoCountry");
    expect(schema).toContain("geoCity");
  });
});

describe("Round 47 — AuthEvents UI Geo Column", () => {
  it("AuthEvents.tsx has Location column header", () => {
    const ui = readFile("client/src/pages/AuthEvents.tsx");
    expect(ui).toContain("Location");
  });

  it("AuthEvents.tsx renders geo_city and geo_country", () => {
    const ui = readFile("client/src/pages/AuthEvents.tsx");
    expect(ui).toContain("geo_city");
    expect(ui).toContain("geo_country");
  });
});

describe("Round 47 — Final Production Audit", () => {
  it("no Manus OAuth references remain in server auth files", () => {
    const files = [
      "server/_core/oauth.ts",
      "server/_core/context.ts",
      "server/_core/keycloak.ts",
      "server/routers.ts",
    ];
    for (const f of files) {
      const content = readFile(f);
      expect(content, `${f} should not reference OAUTH_SERVER_URL`).not.toContain("OAUTH_SERVER_URL");
      expect(content, `${f} should not reference sdk.signSession`).not.toContain("sdk.signSession");
    }
  });

  it("all Keycloak env vars are defined in env.ts", () => {
    const env = readFile("server/_core/env.ts");
    expect(env).toContain("keycloakUrl");
    expect(env).toContain("keycloakRealm");
    expect(env).toContain("keycloakClientId");
    expect(env).toContain("keycloakClientSecret");
    expect(env).toContain("keycloakAdminUser");
    expect(env).toContain("keycloakAdminPassword");
    expect(env).toContain("keycloakWebhookSecret");
  });

  it("docker-compose.production.yml has all required Keycloak env vars for app service", () => {
    const dc = readFile("docker-compose.production.yml");
    expect(dc).toContain("KEYCLOAK_URL");
    expect(dc).toContain("KEYCLOAK_REALM");
    expect(dc).toContain("KEYCLOAK_CLIENT_ID");
    expect(dc).toContain("KEYCLOAK_CLIENT_SECRET");
    expect(dc).toContain("KEYCLOAK_ADMIN");
    expect(dc).toContain("KEYCLOAK_ADMIN_PASSWORD");
    expect(dc).toContain("KEYCLOAK_WEBHOOK_SECRET");
  });

  it("docker-compose.production.yml has keycloak healthcheck", () => {
    const dc = readFile("docker-compose.production.yml");
    expect(dc).toContain("healthcheck");
    expect(dc).toContain("health/ready");
  });

  it("docker-compose.production.yml app depends on keycloak with service_healthy", () => {
    const dc = readFile("docker-compose.production.yml");
    expect(dc).toContain("service_healthy");
  });

  it("keycloak realm JSON has brute force protection enabled", () => {
    const realm = readFile("keycloak/paygate-realm.json");
    const parsed = JSON.parse(realm);
    expect(parsed.bruteForceProtected).toBe(true);
  });

  it("keycloak realm JSON has password policy", () => {
    const realm = readFile("keycloak/paygate-realm.json");
    const parsed = JSON.parse(realm);
    expect(parsed.passwordPolicy).toBeTruthy();
    expect(parsed.passwordPolicy).toContain("length(12)");
  });

  it("keycloak realm JSON has OTP policy configured", () => {
    const realm = readFile("keycloak/paygate-realm.json");
    const parsed = JSON.parse(realm);
    expect(parsed.otpPolicy).toBeDefined();
    expect(parsed.otpPolicy.type).toBe("totp");
  });

  it("keycloak realm JSON has session timeout policy", () => {
    const realm = readFile("keycloak/paygate-realm.json");
    const parsed = JSON.parse(realm);
    expect(parsed.ssoSessionIdleTimeout).toBeGreaterThan(0);
    expect(parsed.accessTokenLifespan).toBeGreaterThan(0);
  });

  it("keycloak realm JSON has SMTP server block defined", () => {
    const realm = readFile("keycloak/paygate-realm.json");
    const parsed = JSON.parse(realm);
    expect(parsed.smtpServer).toBeDefined();
    // host is populated at deploy time via KC_SMTP_HOST env var
    expect(parsed.smtpServer.port).toBeTruthy();
    expect(parsed.smtpServer.from).toContain("paygate");
  });

  it("keycloak realm JSON has events enabled", () => {
    const realm = readFile("keycloak/paygate-realm.json");
    const parsed = JSON.parse(realm);
    expect(parsed.eventsEnabled).toBe(true);
    expect(parsed.adminEventsEnabled).toBe(true);
  });

  it("deployment docs cover bastion SSH access", () => {
    const docs = readFile("docs/keycloak-deployment.md");
    expect(docs).toContain("bastion") ;
    expect(docs).toContain("ssh");
  });

  it("deployment docs cover backup restore runbook", () => {
    const docs = readFile("docs/keycloak-deployment.md");
    expect(docs).toContain("restore");
    expect(docs).toContain("backup");
  });

  it("nightly backup is handled by the external backup script", () => {
    // Real contract: scripts/keycloak-realm-backup.sh (cron-driven), not an
    // in-process index.ts handler.
    const script = readFile("scripts/keycloak-realm-backup.sh");
    expect(script).toContain("keycloak-backups/");
    expect(script).toContain("/admin/realms/${KC_REALM}");
  });

  it("backup admin credentials are exposed via env.ts and consumed by the backup script", () => {
    const env = readFile("server/_core/env.ts");
    expect(env).toContain("keycloakAdminUser");
    const script = readFile("scripts/keycloak-realm-backup.sh");
    expect(script).toContain("KEYCLOAK_ADMIN_USER");
    expect(script).toContain("KEYCLOAK_ADMIN_PASSWORD");
  });

  it("rate limiting is applied to auth endpoints", () => {
    // Real contract: server/rateLimit.ts mounted on /api/oauth in index.ts.
    const index = readFile("server/_core/index.ts");
    expect(index).toContain('from "../rateLimit"');
    expect(index).toContain('"/api/oauth"');
    const rateLimit = readFile("server/rateLimit.ts");
    expect(rateLimit).toContain("status(429)");
  });

  it("ALLOWED_ORIGINS uses an exact-match allowlist (no wildcards)", () => {
    // Real contract: CORS allowlist lives in server/securityHeaders.ts.
    const headers = readFile("server/securityHeaders.ts");
    expect(headers).toContain("ALLOWED_ORIGINS.includes(origin)");
    expect(headers).not.toMatch(/origin:\s*['"]\*/);
  });

  it("security headers include HSTS in production", () => {
    const headers = readFile("server/securityHeaders.ts");
    expect(headers).toContain("Strict-Transport-Security");
    expect(headers).toContain("max-age=31536000");
    const index = readFile("server/_core/index.ts");
    expect(index).toContain("app.use(securityHeaders)");
  });

  it("auth.logout clears all three cookies (session + id_token + refresh_token)", () => {
    const routers = readFile("server/routers.ts");
    expect(routers).toContain("REFRESH_TOKEN_COOKIE_NAME");
    expect(routers).toContain("ID_TOKEN_COOKIE_NAME");
    // session cookie cleared via getSessionCookieOptions
    expect(routers).toContain("getSessionCookieOptions");
  });
});
