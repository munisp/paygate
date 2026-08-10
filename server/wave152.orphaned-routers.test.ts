/**
 * Wave 152 — Orphaned Router Wiring Tests
 *
 * Verifies that all 8 new merchant pages created in Wave 152 are:
 * 1. Present in the filesystem
 * 2. Registered in App.tsx with correct routes
 * 3. Added to Layout.tsx navigation
 * 4. Calling the correct tRPC router namespaces
 * 5. Have proper loading and error handling
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const PAGES = path.join(ROOT, "client/src/pages");
const APP_TSX = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf8");
const LAYOUT_TSX = fs.readFileSync(path.join(ROOT, "client/src/components/Layout.tsx"), "utf8");

const wave152Pages = [
  {
    file: "RedEnvelopes.tsx",
    route: "/red-envelopes",
    navLabel: "Red Envelopes",
    trpcNamespace: "trpc.redEnvelopes.",
    procedures: ["list", "create", "stats"],
  },
  {
    file: "SuperAgentManagement.tsx",
    route: "/super-agent-management",
    navLabel: "Super Agent Mgmt",
    trpcNamespace: "trpc.superAgentV2Mgmt.",
    procedures: ["listNetworks", "addSubAgent", "suspend", "reactivate", "listSessions", "sendMessage"],
  },
  {
    file: "SettlementSLA.tsx",
    route: "/settlement-sla",
    navLabel: "Settlement SLA",
    trpcNamespace: "trpc.settlementSLA.",
    procedures: ["breaches", "acknowledge"],
  },
  {
    file: "DataExport.tsx",
    route: "/data-export",
    navLabel: "Data Export",
    trpcNamespace: "trpc.export.",
    procedures: ["transactions", "monthlyStatement"],
  },
  {
    file: "OnboardingStatus.tsx",
    route: "/onboarding-status",
    navLabel: "Onboarding Status",
    trpcNamespace: "trpc.onboardingGate.",
    procedures: ["checkReady", "markGoLive"],
  },
  {
    file: "ClaimDocuments.tsx",
    route: "/claim-documents",
    navLabel: "Claim Documents",
    trpcNamespace: "trpc.claimDocuments.",
    procedures: ["listDocuments", "uploadDocument"],
  },
  {
    file: "CorridorLiveStats.tsx",
    route: "/corridor-live",
    navLabel: "Corridor Live Stats",
    trpcNamespace: "trpc.corridorLive.",
    procedures: ["getLiveStats", "setFxMarkup", "toggleCorridor"],
  },
  {
    file: "PortfolioRebalancing.tsx",
    route: "/portfolio-rebalancing",
    navLabel: "Portfolio Rebalancing",
    trpcNamespace: "trpc.portfolioRebalancingEnhanced.",
    procedures: ["getOrders", "cancelOrder"],
  },
];

describe("Wave 152 — Orphaned Router Wiring", () => {
  for (const page of wave152Pages) {
    const filePath = path.join(PAGES, page.file);
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

    describe(`${page.file}`, () => {
      it("exists in filesystem", () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it("is registered in App.tsx with correct route", () => {
        expect(APP_TSX).toContain(page.route);
      });

      it("appears in Layout.tsx navigation", () => {
        expect(LAYOUT_TSX).toContain(page.navLabel);
      });

      it("calls the correct tRPC namespace", () => {
        expect(content).toContain(page.trpcNamespace);
      });

      it("has loading state", () => {
        const hasLoading = content.includes("isLoading") || content.includes("isPending");
        expect(hasLoading).toBe(true);
      });

      it("has error handling", () => {
        const hasError = content.includes("isError") || content.includes("onError") || content.includes("error");
        expect(hasError).toBe(true);
      });

      it("has toast notifications for mutations", () => {
        // Only check if the page has mutations
        if (content.includes("useMutation")) {
          expect(content).toContain("toast.");
        }
      });

      for (const proc of page.procedures) {
        it(`calls procedure: ${proc}`, () => {
          expect(content).toContain(proc);
        });
      }
    });
  }

  describe("CorridorLiveStats enhanced features", () => {
    const filePath = path.join(PAGES, "CorridorLiveStats.tsx");
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

    it("also calls corridorLiveEnhanced.setDailyLimit", () => {
      expect(content).toContain("trpc.corridorLiveEnhanced.");
      expect(content).toContain("setDailyLimit");
    });

    it("auto-refreshes every 30 seconds", () => {
      expect(content).toContain("refetchInterval");
      expect(content).toContain("30_000");
    });
  });

  describe("Server router procedures exist", () => {
    const routerFile = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf8");
    const wave89File = fs.readFileSync(path.join(ROOT, "server/wave89Router.ts"), "utf8");
    const wave124File = fs.readFileSync(path.join(ROOT, "server/routers/wave124.ts"), "utf8");
    const wave88File = fs.readFileSync(path.join(ROOT, "server/wave88Router.ts"), "utf8");
    const crud120bFile = fs.readFileSync(path.join(ROOT, "server/routers/crud120b.ts"), "utf8");

    it("redEnvelopes router is in appRouter", () => {
      expect(routerFile).toContain("redEnvelopes: redEnvelopesRouter");
    });

    it("redEnvelopes router has list, create, stats", () => {
      expect(wave124File).toContain("list: protectedProcedure");
      expect(wave124File).toContain("create: protectedProcedure");
      expect(wave124File).toContain("stats: protectedProcedure");
    });

    it("superAgentV2Mgmt router is in appRouter", () => {
      expect(routerFile).toContain("superAgentV2Mgmt: superAgentV2MgmtRouter");
    });

    it("superAgentV2Router has all 6 procedures", () => {
      expect(crud120bFile).toContain("listNetworks: protectedProcedure");
      expect(crud120bFile).toContain("addSubAgent: protectedProcedure");
      expect(crud120bFile).toContain("suspend: protectedProcedure");
      expect(crud120bFile).toContain("reactivate: protectedProcedure");
      expect(crud120bFile).toContain("listSessions: protectedProcedure");
      expect(crud120bFile).toContain("sendMessage: protectedProcedure");
    });

    it("settlementSLA router is in appRouter", () => {
      expect(routerFile).toContain("settlementSLA: settlementSLARouter");
    });

    it("export router is in appRouter", () => {
      expect(routerFile).toContain("export: exportRouter");
    });

    it("onboardingGate router is in appRouter", () => {
      expect(routerFile).toContain("onboardingGate: onboardingGateRouter");
    });

    it("claimDocuments router is in appRouter", () => {
      expect(routerFile).toContain("claimDocuments: claimDocumentsRouter");
    });

    it("claimDocuments router has uploadDocument and listDocuments", () => {
      expect(wave88File).toContain("uploadDocument: protectedProcedure");
      expect(wave88File).toContain("listDocuments: protectedProcedure");
    });

    it("corridorLive router is in appRouter", () => {
      expect(routerFile).toContain("corridorLive: corridorLiveStatsRouter");
    });

    it("corridorLive router has getLiveStats, setFxMarkup, toggleCorridor", () => {
      expect(wave88File).toContain("getLiveStats: protectedProcedure");
      expect(wave88File).toContain("setFxMarkup: protectedProcedure");
      expect(wave88File).toContain("toggleCorridor: protectedProcedure");
    });

    it("corridorLiveEnhanced router is in appRouter", () => {
      expect(routerFile).toContain("corridorLiveEnhanced: corridorLiveStatsEnhancedRouter");
    });

    it("corridorLiveEnhanced has toggle and setDailyLimit", () => {
      expect(wave89File).toContain("toggle: protectedProcedure");
      expect(wave89File).toContain("setDailyLimit: protectedProcedure");
    });

    it("portfolioRebalancingEnhanced router is in appRouter", () => {
      expect(routerFile).toContain("portfolioRebalancingEnhanced: portfolioRebalancingEnhancedRouter");
    });

    it("portfolioRebalancingEnhanced has getOrders and cancelOrder", () => {
      expect(wave89File).toContain("getOrders: protectedProcedure");
      expect(wave89File).toContain("cancelOrder: protectedProcedure");
    });
  });

  describe("Layout.tsx navigation completeness", () => {
    it("has Corridor Live Stats in FX section", () => {
      expect(LAYOUT_TSX).toContain('path: "/corridor-live"');
    });

    it("has Red Envelopes in Loyalty section", () => {
      expect(LAYOUT_TSX).toContain('path: "/red-envelopes"');
    });

    it("has Super Agent Mgmt in Agent section", () => {
      expect(LAYOUT_TSX).toContain('path: "/super-agent-management"');
    });

    it("has Settlement SLA in Operations section", () => {
      expect(LAYOUT_TSX).toContain('path: "/settlement-sla"');
    });

    it("has Data Export in Operations section", () => {
      expect(LAYOUT_TSX).toContain('path: "/data-export"');
    });

    it("has Onboarding Status in Operations section", () => {
      expect(LAYOUT_TSX).toContain('path: "/onboarding-status"');
    });

    it("has Claim Documents in Wealth section", () => {
      expect(LAYOUT_TSX).toContain('path: "/claim-documents"');
    });

    it("has Portfolio Rebalancing in Wealth section", () => {
      expect(LAYOUT_TSX).toContain('path: "/portfolio-rebalancing"');
    });
  });
});
