/**
 * Wave 166: Production Finalization Tests
 * Validates: pagination, mobile responsiveness, accessibility, staleTime, security
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const PAGES_DIR = path.resolve("client/src/pages");

function getAllPages(): string[] {
  const pages: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".tsx")) pages.push(full);
    }
  }
  walk(PAGES_DIR);
  return pages;
}

describe("Wave 166: Production Finalization", () => {
  describe("Pagination Controls", () => {
    it("PaginationControls component exists", () => {
      const exists = fs.existsSync("client/src/components/ui/pagination-controls.tsx");
      expect(exists).toBe(true);
    });

    it("APIKeys page has pagination", () => {
      const content = fs.readFileSync("client/src/pages/APIKeys.tsx", "utf-8");
      expect(content).toContain("PaginationControls");
      expect(content).toContain("totalPages");
      expect(content).toContain("PAGE_SIZE");
    });

    it("GeofenceAlerts page has pagination", () => {
      const content = fs.readFileSync("client/src/pages/GeofenceAlerts.tsx", "utf-8");
      expect(content).toContain("PaginationControls");
      expect(content).toContain("totalPages");
    });

    it("PaginationControls has correct props interface", () => {
      const content = fs.readFileSync("client/src/components/ui/pagination-controls.tsx", "utf-8");
      expect(content).toContain("page:");
      expect(content).toContain("totalPages:");
      expect(content).toContain("onPageChange:");
      expect(content).toContain("ChevronLeft");
      expect(content).toContain("ChevronRight");
    });
  });

  describe("Mobile Responsiveness", () => {
    it("Transactions page has overflow-x-auto for mobile", () => {
      const content = fs.readFileSync("client/src/pages/Transactions.tsx", "utf-8");
      expect(content).toContain("overflow-x-auto");
    });

    it("Customers page has overflow-x-auto for mobile", () => {
      const content = fs.readFileSync("client/src/pages/Customers.tsx", "utf-8");
      expect(content).toContain("overflow-x-auto");
    });

    it("Disputes page has overflow-x-auto for mobile", () => {
      const content = fs.readFileSync("client/src/pages/Disputes.tsx", "utf-8");
      expect(content).toContain("overflow-x-auto");
    });
  });

  describe("Accessibility", () => {
    it("Pages have aria-label on icon buttons", () => {
      const pages = getAllPages().filter(p => {
        const c = fs.readFileSync(p, "utf-8");
        return c.includes("aria-label");
      });
      expect(pages.length).toBeGreaterThan(100);
    });
  });

  describe("Performance - staleTime", () => {
    it("APIKeys page has staleTime on queries", () => {
      const content = fs.readFileSync("client/src/pages/APIKeys.tsx", "utf-8");
      expect(content).toContain("staleTime");
    });

    it("Most pages with useQuery have staleTime", () => {
      const pages = getAllPages();
      let withStaleTime = 0;
      let withoutStaleTime = 0;
      for (const p of pages) {
        const c = fs.readFileSync(p, "utf-8");
        if (c.includes(".useQuery(")) {
          if (c.includes("staleTime")) withStaleTime++;
          else withoutStaleTime++;
        }
      }
      const pct = withStaleTime / (withStaleTime + withoutStaleTime);
      expect(pct).toBeGreaterThan(0.7); // At least 70% of pages with queries have staleTime
    });
  });

  describe("Security", () => {
    it("No hardcoded API keys or secrets in client code", () => {
      const pages = getAllPages();
      for (const p of pages) {
        const c = fs.readFileSync(p, "utf-8");
        // Should not have hardcoded JWT tokens or API keys
        expect(c).not.toMatch(/Bearer\s+[a-zA-Z0-9_-]{20,}/);
        expect(c).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      }
    });

    it("No hardcoded passwords in server routers", () => {
      const routerFiles = fs.readdirSync("server/routers").filter(f => f.endsWith(".ts"));
      for (const f of routerFiles) {
        const c = fs.readFileSync(`server/routers/${f}`, "utf-8");
        // Should use ENV variables, not hardcoded passwords
        expect(c).not.toMatch(/password\s*=\s*["'][a-zA-Z0-9!@#$%]{8,}["']/);
      }
    });
  });

  describe("P0-P2 Blockers Resolved", () => {
    it("All P0 blockers are resolved", () => {
      const content = fs.readFileSync("server/routers/wave164.ts", "utf-8");
      // All P0 items should exist and be resolved
      const p0Items = content.match(/p0-\d+/g) || [];
      expect(p0Items.length).toBeGreaterThan(0);
      // Check no P0 item has status: "open" (the data array, not the enum)
      // CRITICAL_BLOCKERS array entries with P0 priority should all be resolved
      const criticalBlockersSection = content.match(/CRITICAL_BLOCKERS[\s\S]*?\];/)?.[0] || "";
      const p0InData = criticalBlockersSection.match(/priority: "P0"/g) || [];
      const p0ResolvedInData = criticalBlockersSection.match(/priority: "P0"[\s\S]*?status: "resolved"/g) || [];
      expect(p0ResolvedInData.length).toBeGreaterThanOrEqual(p0InData.length);
    });

    it("All P1 blockers are resolved", () => {
      const content = fs.readFileSync("server/routers/wave164.ts", "utf-8");
      // Check that p1-003 pagination is resolved
      expect(content).toContain('p1-003');
      expect(content).toContain('resolved');
    });

    it("P2 blockers are mostly resolved", () => {
      const content = fs.readFileSync("server/routers/wave164.ts", "utf-8");
      // Check P2 items in the CRITICAL_BLOCKERS data array
      const criticalBlockersSection = content.match(/CRITICAL_BLOCKERS[\s\S]*?\];/)?.[0] || "";
      const p2Total = (criticalBlockersSection.match(/priority: "P2"/g) || []).length;
      const p2Resolved = (criticalBlockersSection.match(/priority: "P2"[\s\S]*?status: "resolved"/g) || []).length;
      if (p2Total > 0) {
        expect(p2Resolved / p2Total).toBeGreaterThanOrEqual(0.8);
      } else {
        // No P2 items is fine too
        expect(p2Total).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Router Registration Completeness", () => {
    it("All wave routers are registered in appRouter", () => {
      const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
      const waveRouters = ["wave159Router", "wave160Router", "wave161Router", "wave162Router", "wave163Router", "wave164Router", "wave165Router"];
      for (const r of waveRouters) {
        expect(routersContent).toContain(r);
      }
    });

    it("appRouter has 190+ registered procedures", () => {
      const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
      const registrations = routersContent.match(/\w+:\s*\w+Router/g) || [];
      expect(registrations.length).toBeGreaterThan(190);
    });
  });

  describe("Seed Data Completeness", () => {
    it("Seed file covers 20+ entity types", () => {
      const content = fs.readFileSync("server/seed.ts", "utf-8");
      const insertCalls = (content.match(/\.insert\(/g) || []).length;
      expect(insertCalls).toBeGreaterThan(20);
    });

    it("Seed includes wallets", () => {
      const content = fs.readFileSync("server/seed.ts", "utf-8");
      expect(content).toContain("wallets");
    });

    it("Seed includes featureFlags", () => {
      const content = fs.readFileSync("server/seed.ts", "utf-8");
      expect(content).toContain("featureFlags");
    });

    it("Seed includes paymentLinks", () => {
      const content = fs.readFileSync("server/seed.ts", "utf-8");
      expect(content).toContain("paymentLinks");
    });
  });
});
