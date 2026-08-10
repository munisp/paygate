/**
 * Wave 164 — UI/UX Completeness Audit Tests
 */
import { describe, it, expect } from "vitest";
import { wave164Router } from "./routers/wave164";

describe("Wave 164: UI/UX Completeness Audit", () => {
  describe("Router structure", () => {
    it("exports wave164Router", () => {
      expect(wave164Router).toBeDefined();
    });
    it("has all required procedures", () => {
      const procs = Object.keys(wave164Router._def.procedures ?? wave164Router._def.record ?? {});
      expect(procs).toContain("criticalBlockers");
      expect(procs).toContain("uxPatternCompliance");
      expect(procs).toContain("waveCompletionTracker");
      expect(procs).toContain("productionReadinessScore");
    });
  });
  describe("UIUXAuditDashboard page", () => {
    it("page file exists and has correct structure", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/pages/UIUXAuditDashboard.tsx", "utf-8");
      expect(content).toContain("UIUXAuditDashboard");
      expect(content).toContain("trpc.uiUxAudit.criticalBlockers");
      expect(content).toContain("trpc.uiUxAudit.uxPatternCompliance");
      expect(content).toContain("trpc.uiUxAudit.waveCompletionTracker");
      expect(content).toContain("trpc.uiUxAudit.productionReadinessScore");
      expect(content).toContain("isError");
      expect(content).toContain("Skeleton");
    });
    it("page has tabs for all audit sections", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/pages/UIUXAuditDashboard.tsx", "utf-8");
      expect(content).toContain("Critical Blockers");
      expect(content).toContain("UX Patterns");
      expect(content).toContain("Wave Tracker");
      expect(content).toContain("Readiness Score");
    });
  });
  describe("Critical blockers registry", () => {
    it("contains P0, P1, P2 blockers", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave164.ts", "utf-8");
      expect(content).toContain('"P0"');
      expect(content).toContain('"P1"');
      expect(content).toContain('"P2"');
    });
    it("all P0 blockers are resolved", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave164.ts", "utf-8");
      // All P0 entries should have status: "resolved"
      const p0Entries = content.match(/priority: "P0"[\s\S]*?status: "(\w+)"/g) ?? [];
      p0Entries.forEach(entry => {
        expect(entry).toContain('status: "resolved"');
      });
    });
  });
  describe("Wave completion tracker", () => {
    it("tracks waves 159-165", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave164.ts", "utf-8");
      expect(content).toContain("wave: 159");
      expect(content).toContain("wave: 160");
      expect(content).toContain("wave: 161");
      expect(content).toContain("wave: 162");
      expect(content).toContain("wave: 163");
      expect(content).toContain("wave: 164");
      expect(content).toContain("wave: 165");
    });
  });
  describe("Registration", () => {
    it("wave164Router is registered in routers.ts", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers.ts", "utf-8");
      expect(content).toContain("wave164Router");
      expect(content).toContain("uiUxAudit: wave164Router");
    });
    it("route is in App.tsx", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/App.tsx", "utf-8");
      expect(content).toContain("/uiux-audit");
      expect(content).toContain("UIUXAuditDashboardPage");
    });
    it("sidebar entry exists", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/components/Layout.tsx", "utf-8");
      expect(content).toContain("uiux-audit");
      expect(content).toContain("UI/UX Audit Dashboard");
    });
  });
});
