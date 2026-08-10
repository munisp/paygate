/**
 * Round 48 — Geo-based anomaly alert, CSV export geo columns, trpc path fix
 *
 * Tests:
 * 1. getKnownCountriesForUser exported from server/db.ts
 * 2. Geo anomaly detection logic in server/_core/oauth.ts
 * 3. CSV export includes geo_country and geo_city columns
 * 4. ActiveSessions.tsx uses trpc.middleware.keycloak.* (not trpc.keycloak.*)
 * 5. AuthEvents.tsx uses trpc.middleware.keycloak.* (not trpc.keycloak.*)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");

describe("Round 48 — Geo Anomaly, CSV Geo Columns, tRPC Path Fix", () => {
  describe("server/db.ts — getKnownCountriesForUser", () => {
    const dbSrc = readFileSync(resolve(root, "server/db.ts"), "utf-8");

    it("exports getKnownCountriesForUser function", () => {
      expect(dbSrc).toContain("export async function getKnownCountriesForUser");
    });

    it("queries keycloak_events for distinct geo_country", () => {
      expect(dbSrc).toContain("SELECT DISTINCT geo_country");
      expect(dbSrc).toContain("FROM keycloak_events");
    });

    it("filters by user_id and event_type = LOGIN", () => {
      expect(dbSrc).toContain("user_id = ${userId}");
      expect(dbSrc).toContain("event_type = 'LOGIN'");
    });

    it("excludes the most recent N rows to avoid self-comparison", () => {
      expect(dbSrc).toContain("excludeLastN");
      expect(dbSrc).toContain("LIMIT ${excludeLastN}");
    });
  });

  describe("server/_core/oauth.ts — geo-based anomaly detection", () => {
    const oauthSrc = readFileSync(resolve(root, "server/_core/oauth.ts"), "utf-8");

    it("calls getKnownCountriesForUser on LOGIN events", () => {
      expect(oauthSrc).toContain("getKnownCountriesForUser");
    });

    it("only fires on LOGIN event type", () => {
      expect(oauthSrc).toContain('eventType === "LOGIN"');
    });

    it("sends notifyOwner when new country detected", () => {
      expect(oauthSrc).toContain("New Country Login Detected");
    });

    it("checks that new country is not in known countries list", () => {
      expect(oauthSrc).toContain("!knownCountries.includes(latestCountry)");
    });

    it("only alerts if user has prior logins (not first-ever login)", () => {
      expect(oauthSrc).toContain("knownCountries.length > 0");
    });
  });

  describe("server/routers.ts — exportAuthEvents CSV geo columns", () => {
    const routersSrc = readFileSync(resolve(root, "server/routers.ts"), "utf-8");

    it("CSV headers include geoCountry", () => {
      expect(routersSrc).toContain('"geoCountry"');
    });

    it("CSV headers include geoCity", () => {
      expect(routersSrc).toContain('"geoCity"');
    });

    it("CSV rows map geo_country field", () => {
      expect(routersSrc).toContain("e.geo_country");
    });

    it("CSV rows map geo_city field", () => {
      expect(routersSrc).toContain("e.geo_city");
    });
  });

  describe("client/src/pages/ActiveSessions.tsx — correct tRPC path", () => {
    const page = readFileSync(
      resolve(root, "client/src/pages/ActiveSessions.tsx"),
      "utf-8"
    );

    it("uses trpc.middleware.keycloak.listActiveSessions (not trpc.keycloak.*)", () => {
      expect(page).toContain("trpc.middleware.keycloak.listActiveSessions");
      expect(page).not.toContain("trpc.keycloak.listActiveSessions");
    });

    it("uses trpc.middleware.keycloak.forceLogoutSession (not trpc.keycloak.*)", () => {
      expect(page).toContain("trpc.middleware.keycloak.forceLogoutSession");
      expect(page).not.toContain("trpc.keycloak.forceLogoutSession");
    });

    it("uses trpc.middleware.keycloak.checkLoginAnomalies (not trpc.keycloak.*)", () => {
      expect(page).toContain("trpc.middleware.keycloak.checkLoginAnomalies");
      expect(page).not.toContain("trpc.keycloak.checkLoginAnomalies");
    });
  });

  describe("client/src/pages/AuthEvents.tsx — correct tRPC path", () => {
    const page = readFileSync(
      resolve(root, "client/src/pages/AuthEvents.tsx"),
      "utf-8"
    );

    it("uses trpc.middleware.keycloak.getAuthEvents (not trpc.keycloak.*)", () => {
      expect(page).toContain("trpc.middleware.keycloak.getAuthEvents");
      expect(page).not.toContain("trpc.keycloak.getAuthEvents");
    });

    it("uses trpc.middleware.keycloak.exportAuthEvents (not trpc.keycloak.*)", () => {
      expect(page).toContain("trpc.middleware.keycloak.exportAuthEvents");
      expect(page).not.toContain("trpc.keycloak.exportAuthEvents");
    });
  });
});
