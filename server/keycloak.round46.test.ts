import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");

describe("Round 46 — Anomaly Alerts, Session Management, Active Sessions UI", () => {
  describe("routers.ts — new keycloak procedures", () => {
    const routers = readFileSync(resolve(root, "server/routers.ts"), "utf-8");

    it("checkLoginAnomalies procedure is defined", () => {
      expect(routers).toContain("checkLoginAnomalies: protectedProcedure");
    });

    it("checkLoginAnomalies queries LOGIN_ERROR events", () => {
      expect(routers).toContain('eventType: "LOGIN_ERROR"');
    });

    it("checkLoginAnomalies calls notifyOwner when threshold exceeded", () => {
      expect(routers).toContain("notifyOwner");
      expect(routers).toContain("Auth Anomaly Detected");
    });

    it("listActiveSessions procedure is defined", () => {
      expect(routers).toContain("listActiveSessions: protectedProcedure");
    });

    it("listActiveSessions calls Keycloak Admin REST API", () => {
      expect(routers).toContain("/admin/realms/");
      expect(routers).toContain("/sessions");
    });

    it("forceLogoutSession procedure is defined", () => {
      expect(routers).toContain("forceLogoutSession: protectedProcedure");
    });

    it("forceLogoutSession uses DELETE method on Keycloak sessions endpoint", () => {
      expect(routers).toContain('method: "DELETE"');
      expect(routers).toContain("/sessions/${input.sessionId}");
    });

    it("all new procedures require admin role", () => {
      const adminChecks = routers.match(/ctx\.user\.role !== "admin"/g) ?? [];
      // At least 3 new admin checks (checkLoginAnomalies, listActiveSessions, forceLogoutSession)
      expect(adminChecks.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("ActiveSessions.tsx — UI page", () => {
    const page = readFileSync(resolve(root, "client/src/pages/ActiveSessions.tsx"), "utf-8");

    it("ActiveSessions page file exists", () => {
      expect(page.length).toBeGreaterThan(100);
    });

    it("uses trpc.middleware.keycloak.listActiveSessions", () => {
      expect(page).toContain("trpc.middleware.keycloak.listActiveSessions");
    });

    it("uses trpc.middleware.keycloak.forceLogoutSession", () => {
      expect(page).toContain("trpc.middleware.keycloak.forceLogoutSession");
    });

    it("uses trpc.middleware.keycloak.checkLoginAnomalies for anomaly banner", () => {
      expect(page).toContain("trpc.middleware.keycloak.checkLoginAnomalies");
    });

    it("shows anomaly alert banner when threshold exceeded", () => {
      expect(page).toContain("Login Anomaly Detected");
    });

    it("has force logout confirmation dialog", () => {
      expect(page).toContain("Force logout session?");
    });

    it("auto-refreshes every 30 seconds", () => {
      expect(page).toContain("refetchInterval: 30000");
    });
  });

  describe("App.tsx — ActiveSessions route registered", () => {
    const app = readFileSync(resolve(root, "client/src/App.tsx"), "utf-8");

    it("ActiveSessions is lazy-imported", () => {
      expect(app).toContain("import(\"./pages/ActiveSessions\")");
    });

    it("/settings/active-sessions route is registered", () => {
      expect(app).toContain("/settings/active-sessions");
    });
  });

  describe("Layout.tsx — Active Sessions nav entry", () => {
    const layout = readFileSync(resolve(root, "client/src/components/Layout.tsx"), "utf-8");

    it("Active Sessions nav item exists", () => {
      expect(layout).toContain("Active Sessions");
    });

    it("Active Sessions links to /settings/active-sessions", () => {
      expect(layout).toContain("/settings/active-sessions");
    });
  });
});
