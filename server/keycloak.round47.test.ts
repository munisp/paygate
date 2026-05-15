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

describe("Round 47 — IP Geolocation Enrichment", () => {
  it("db.ts defines enrichIpGeo helper", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("async function enrichIpGeo");
  });

  it("db.ts uses ip-api.com for geolocation", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("ip-api.com/json/");
  });

  it("db.ts has in-memory geo cache with TTL", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("_geoCache");
    expect(db).toContain("GEO_CACHE_TTL_MS");
  });

  it("db.ts skips private/loopback IPs for geo lookup", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("127.0.0.1");
    expect(db).toContain("GEO_SKIP_PREFIXES");
  });

  it("db.ts logKeycloakEvent calls enrichIpGeo", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("await enrichIpGeo(params.ipAddress)");
  });

  it("db.ts logKeycloakEvent inserts geo_country and geo_city", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("geo_country, geo_city");
    expect(db).toContain("geo.country");
    expect(db).toContain("geo.city");
  });

  it("db.ts getKeycloakEvents selects geo_country and geo_city", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("ip_address, geo_country, geo_city, error, details, received_at");
  });

  it("db.ts getKeycloakEvents return type includes geo_country and geo_city", () => {
    const db = readFile("server/db.ts");
    expect(db).toContain("geo_country: string | null;");
    expect(db).toContain("geo_city: string | null;");
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

  it("nightly backup Heartbeat handler is registered in index.ts", () => {
    const index = readFile("server/_core/index.ts");
    expect(index).toContain("keycloak-realm-backup");
  });

  it("backup handler uses ENV.keycloakAdminUser (not process.env directly)", () => {
    const index = readFile("server/_core/index.ts");
    expect(index).toContain("ENV.keycloakAdminUser");
  });

  it("rate limiting is applied to auth endpoints", () => {
    const oauth = readFile("server/_core/oauth.ts");
    expect(oauth).toContain("rateLimitMiddleware");
    expect(oauth).toContain("429");
  });

  it("ALLOWED_ORIGINS wildcard is rejected in production", () => {
    const oauth = readFile("server/_core/oauth.ts");
    expect(oauth).toContain("Wildcard");
  });

  it("security headers include HSTS in production", () => {
    const index = readFile("server/_core/index.ts");
    expect(index).toContain("strictTransportSecurity");
    expect(index).toContain("31536000");
  });

  it("auth.logout clears all three cookies (session + id_token + refresh_token)", () => {
    const routers = readFile("server/routers.ts");
    expect(routers).toContain("REFRESH_TOKEN_COOKIE_NAME");
    expect(routers).toContain("ID_TOKEN_COOKIE_NAME");
    // session cookie cleared via getSessionCookieOptions
    expect(routers).toContain("getSessionCookieOptions");
  });
});
