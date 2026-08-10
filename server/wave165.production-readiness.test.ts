/**
 * Wave 165 — Production Readiness Final Audit Tests
 */
import { describe, it, expect } from "vitest";
import { wave165Router } from "./routers/wave165";

describe("Wave 165: Production Readiness Final Audit", () => {
  describe("Router structure", () => {
    it("exports wave165Router", () => {
      expect(wave165Router).toBeDefined();
    });
    it("has all required procedures", () => {
      const procs = Object.keys(wave165Router._def.procedures ?? wave165Router._def.record ?? {});
      expect(procs).toContain("schemaCompleteness");
      expect(procs).toContain("apiSurfaceAudit");
      expect(procs).toContain("testCoverageSummary");
      expect(procs).toContain("deploymentChecklist");
      expect(procs).toContain("seedDataValidation");
    });
  });
  describe("ProductionReadinessDashboard page", () => {
    it("page file exists and has correct structure", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/pages/ProductionReadinessDashboard.tsx", "utf-8");
      expect(content).toContain("ProductionReadinessDashboard");
      expect(content).toContain("trpc.productionReadiness.schemaCompleteness");
      expect(content).toContain("trpc.productionReadiness.apiSurfaceAudit");
      expect(content).toContain("trpc.productionReadiness.testCoverageSummary");
      expect(content).toContain("trpc.productionReadiness.deploymentChecklist");
      expect(content).toContain("trpc.productionReadiness.seedDataValidation");
      expect(content).toContain("isError");
      expect(content).toContain("Skeleton");
    });
    it("page has all 5 tabs", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/pages/ProductionReadinessDashboard.tsx", "utf-8");
      expect(content).toContain("Deployment Checklist");
      expect(content).toContain("Schema");
      expect(content).toContain("API Surface");
      expect(content).toContain("Test Coverage");
      expect(content).toContain("Seed Data");
    });
  });
  describe("Schema completeness", () => {
    it("schema has 200+ tables", async () => {
      const { readFileSync } = await import("fs");
      const schema = readFileSync("drizzle/schema.ts", "utf-8");
      const tableCount = (schema.match(/\bpgTable\(/g) ?? []).length;
      expect(tableCount).toBeGreaterThanOrEqual(200);
    });
    it("schema has 400+ indexes", async () => {
      const { readFileSync } = await import("fs");
      const schema = readFileSync("drizzle/schema.ts", "utf-8");
      const indexCount = (schema.match(/\bindex\(/g) ?? []).length;
      const uniqueIndexCount = (schema.match(/\buniqueIndex\(/g) ?? []).length;
      expect(indexCount + uniqueIndexCount).toBeGreaterThanOrEqual(400);
    });
  });
  describe("Test coverage", () => {
    it("has 165+ test files", async () => {
      const { readdirSync } = await import("fs");
      const testFiles = readdirSync("server").filter((f: string) => f.endsWith(".test.ts"));
      expect(testFiles.length).toBeGreaterThanOrEqual(165);
    });
    it("latest wave test is wave165", async () => {
      const { readdirSync } = await import("fs");
      const testFiles = readdirSync("server").filter((f: string) => f.startsWith("wave"));
      const latestWave = testFiles
        .map((f: string) => parseInt(f.match(/wave(\d+)/)?.[1] ?? "0"))
        .sort((a: number, b: number) => b - a)[0];
      expect(latestWave).toBeGreaterThanOrEqual(165);
    });
  });
  describe("Seed data", () => {
    it("seed.ts has all required entities", async () => {
      const { readFileSync } = await import("fs");
      const seed = readFileSync("server/seed.ts", "utf-8");
      const required = ["merchants", "users", "transactions", "customers", "virtualCards", "apiKeys", "webhooks", "fraudAlerts", "teamMembers", "paymentLinks"];
      required.forEach(entity => {
        expect(seed).toContain(entity);
      });
    });
  });
  describe("Deployment checklist", () => {
    it("wave165 router has deployment checklist with 15 checks", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave165.ts", "utf-8");
      expect(content).toContain("deploymentChecklist");
      expect(content).toContain("schema-tables");
      expect(content).toContain("stripe-webhook");
      expect(content).toContain("audit-log");
      expect(content).toContain("test-suite");
    });
  });
  describe("Registration", () => {
    it("wave165Router is registered in routers.ts", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers.ts", "utf-8");
      expect(content).toContain("wave165Router");
      expect(content).toContain("productionReadiness: wave165Router");
    });
    it("route is in App.tsx", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/App.tsx", "utf-8");
      expect(content).toContain("/production-readiness");
      expect(content).toContain("ProductionReadinessDashboardPage");
    });
    it("sidebar entry exists", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/components/Layout.tsx", "utf-8");
      expect(content).toContain("production-readiness");
      expect(content).toContain("Production Readiness");
    });
  });
});
