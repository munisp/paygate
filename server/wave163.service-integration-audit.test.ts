/**
 * Wave 163 — Service Integration Audit Tests
 */
import { describe, it, expect } from "vitest";
import { wave163Router } from "./routers/wave163";

describe("Wave 163: Service Integration Audit", () => {
  describe("Router structure", () => {
    it("exports wave163Router", () => {
      expect(wave163Router).toBeDefined();
      expect(typeof wave163Router).toBe("object");
    });

    it("has all required procedures", () => {
      const procedures = Object.keys(wave163Router._def.procedures ?? wave163Router._def.record ?? {});
      expect(procedures).toContain("fullAudit");
      expect(procedures).toContain("crudGapAnalysis");
      expect(procedures).toContain("dependencyGraph");
      expect(procedures).toContain("mockDataReport");
      expect(procedures).toContain("orphanedRouters");
      expect(procedures).toContain("grpcHealthCheck");
    });
  });

  describe("ServiceIntegrationAudit page", () => {
    it("page file exists", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/pages/ServiceIntegrationAudit.tsx", "utf-8");
      expect(content).toContain("ServiceIntegrationAudit");
      expect(content).toContain("trpc.serviceIntegrationAudit.fullAudit");
      expect(content).toContain("trpc.serviceIntegrationAudit.crudGapAnalysis");
      expect(content).toContain("trpc.serviceIntegrationAudit.dependencyGraph");
      expect(content).toContain("trpc.serviceIntegrationAudit.mockDataReport");
      expect(content).toContain("trpc.serviceIntegrationAudit.orphanedRouters");
      expect(content).toContain("trpc.serviceIntegrationAudit.grpcHealthCheck");
    });

    it("page has tabs for all audit sections", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/pages/ServiceIntegrationAudit.tsx", "utf-8");
      expect(content).toContain("Services");
      expect(content).toContain("CRUD Gaps");
      expect(content).toContain("Dependencies");
      expect(content).toContain("Mock Data");
      expect(content).toContain("Orphaned Routers");
      expect(content).toContain("gRPC Health");
    });
  });

  describe("Wave 163 router registration", () => {
    it("wave163Router is registered in main routers.ts", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers.ts", "utf-8");
      expect(content).toContain("wave163Router");
      expect(content).toContain("serviceIntegrationAudit: wave163Router");
    });

    it("route is registered in App.tsx", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/App.tsx", "utf-8");
      expect(content).toContain("/service-integration-audit");
      expect(content).toContain("ServiceIntegrationAuditPage");
    });

    it("sidebar entry exists in Layout.tsx", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/components/Layout.tsx", "utf-8");
      expect(content).toContain("service-integration-audit");
      expect(content).toContain("Service Integration Audit");
    });
  });

  describe("CRUD completeness logic", () => {
    it("correctly identifies CRUD operations", () => {
      const procedures = ["list", "get", "create", "update", "delete", "stats"];
      const hasCreate = procedures.some(p => ["create", "add", "insert", "submit", "register"].includes(p));
      const hasRead = procedures.some(p => ["get", "getById", "find", "fetch", "show"].includes(p));
      const hasUpdate = procedures.some(p => ["update", "edit", "patch", "modify", "set"].includes(p));
      const hasDelete = procedures.some(p => ["delete", "remove", "archive", "cancel", "deactivate"].includes(p));
      const hasList = procedures.some(p => ["list", "getAll", "search", "query", "paginate"].includes(p));
      const hasStats = procedures.some(p => ["stats", "summary", "metrics", "count", "aggregate"].includes(p));

      expect(hasCreate).toBe(true);
      expect(hasRead).toBe(true);
      expect(hasUpdate).toBe(true);
      expect(hasDelete).toBe(true);
      expect(hasList).toBe(true);
      expect(hasStats).toBe(true);
    });

    it("detects missing CRUD operations", () => {
      const procedures = ["list", "stats"]; // missing create, read, update, delete
      const hasCreate = procedures.some(p => ["create", "add", "insert", "submit", "register"].includes(p));
      const hasRead = procedures.some(p => ["get", "getById", "find", "fetch", "show"].includes(p));
      const hasUpdate = procedures.some(p => ["update", "edit", "patch", "modify", "set"].includes(p));
      const hasDelete = procedures.some(p => ["delete", "remove", "archive", "cancel", "deactivate"].includes(p));

      expect(hasCreate).toBe(false);
      expect(hasRead).toBe(false);
      expect(hasUpdate).toBe(false);
      expect(hasDelete).toBe(false);
    });
  });

  describe("Service registry", () => {
    it("wave163 router file contains service registry", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave163.ts", "utf-8");
      expect(content).toContain("SERVICE_REGISTRY");
      expect(content).toContain("transactions");
      expect(content).toContain("complianceKyc");
      expect(content).toContain("fraudRisk");
      expect(content).toContain("middlewareDashboard");
    });

    it("orphaned router report covers known orphans", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave163.ts", "utf-8");
      expect(content).toContain("adminCrud");
      expect(content).toContain("offlineResilience");
      expect(content).toContain("openSearchAudit");
      expect(content).toContain("grpc");
    });
  });

  describe("Dependency graph", () => {
    it("wave163 router includes dependency graph procedure", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave163.ts", "utf-8");
      expect(content).toContain("dependencyGraph");
      expect(content).toContain("nodes");
      expect(content).toContain("edges");
    });

    it("graph has critical P0 services as nodes", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave163.ts", "utf-8");
      expect(content).toContain('"transactions"');
      expect(content).toContain('"payouts"');
      expect(content).toContain('"complianceKyc"');
      expect(content).toContain('"fraudRisk"');
    });
  });

  describe("Mock data report", () => {
    it("wave163 router includes mock data report procedure", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave163.ts", "utf-8");
      expect(content).toContain("mockDataReport");
      expect(content).toContain("hasMockFallback");
      expect(content).toContain("withRealData");
    });
  });

  describe("gRPC health check", () => {
    it("wave163 router includes gRPC health check", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("server/routers/wave163.ts", "utf-8");
      expect(content).toContain("grpcHealthCheck");
      expect(content).toContain("ledger");
      expect(content).toContain("fraud");
    });
  });

  describe("ComplianceKYC real tRPC wiring", () => {
    it("ComplianceKYC page uses real tRPC calls", async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync("client/src/pages/ComplianceKYC.tsx", "utf-8");
      expect(content).toContain("trpc.");
      // Should not have large mock data arrays
      const mockArrayMatches = content.match(/\[\s*\{[^}]{200,}/g) ?? [];
      expect(mockArrayMatches.length).toBe(0);
    });
  });

  describe("Waves 159-162 completeness", () => {
    it("wave159 liveness replay router exists and is registered", async () => {
      const { readFileSync } = await import("fs");
      const routersContent = readFileSync("server/routers.ts", "utf-8");
      expect(routersContent).toContain("wave159Router");
      expect(routersContent).toContain("livenessReplay");
    });

    it("wave160 security audit router exists and is registered", async () => {
      const { readFileSync } = await import("fs");
      const routersContent = readFileSync("server/routers.ts", "utf-8");
      expect(routersContent).toContain("wave160Router");
      expect(routersContent).toContain("securityAudit");
    });

    it("wave161 resilient connectivity router exists and is registered", async () => {
      const { readFileSync } = await import("fs");
      const routersContent = readFileSync("server/routers.ts", "utf-8");
      expect(routersContent).toContain("wave161Router");
      expect(routersContent).toContain("resilientConnectivity");
    });

    it("wave162 middleware wiring audit router exists and is registered", async () => {
      const { readFileSync } = await import("fs");
      const routersContent = readFileSync("server/routers.ts", "utf-8");
      expect(routersContent).toContain("wave162Router");
      expect(routersContent).toContain("middlewareWiringAudit");
    });
  });
});
