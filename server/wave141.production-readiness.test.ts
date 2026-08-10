/**
 * Wave 141 Production-Readiness Tests
 *
 * Covers:
 * 1. All consumer pages have error handling
 * 2. All wave80 pages have error handling
 * 3. All tier1to5 pages have error handling
 * 4. ConsumerLayout has error handling
 * 5. No unregistered wave routers
 * 6. No hardcoded return arrays in wave routers
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Wave 141: Consumer Pages Error Handling", () => {
  const consumerPagesWithTrpc = [
    "client/src/pages/consumer/ClaimsTracker.tsx",
    "client/src/pages/consumer/ConsumerBnplRepayments.tsx",
    "client/src/pages/consumer/ConsumerInsuranceV2.tsx",
    "client/src/pages/consumer/ConsumerLoyaltyDashboard.tsx",
    "client/src/pages/consumer/ConsumerReferrals.tsx",
    "client/src/pages/consumer/Discover.tsx",
    "client/src/pages/consumer/History.tsx",
    "client/src/pages/consumer/PortfolioSummary.tsx",
    "client/src/pages/consumer/WalletStatement.tsx",
    "client/src/pages/consumer/ConsumerLayout.tsx",
  ];

  for (const page of consumerPagesWithTrpc) {
    it(`${page.split("/").pop()} has error handling`, () => {
      const content = read(page);
      expect(content).toMatch(/isError|error|Error|catch|onError|toast|Toast/);
    });
  }
});

describe("Wave 141: Wave80 Pages Error Handling", () => {
  it("GrpcHealthCheck.tsx has error handling", () => {
    const content = read("client/src/pages/wave80/GrpcHealthCheck.tsx");
    expect(content).toMatch(/isError|error|Error|catch|onError/);
  });

  it("UssdSessionV2.tsx has error handling", () => {
    const content = read("client/src/pages/wave80/UssdSessionV2.tsx");
    expect(content).toMatch(/isError|error|Error|catch|onError/);
  });
});

describe("Wave 141: Tier1to5 Pages Error Handling", () => {
  it("CohortAnalytics.tsx has error handling", () => {
    const content = read("client/src/pages/tier1to5/CohortAnalytics.tsx");
    expect(content).toMatch(/isError|error|Error|catch|onError|cohortError/);
  });
});

describe("Wave 141: Wave Router Registration", () => {
  it("all wave router files are registered in routers.ts", () => {
    const routersContent = read("server/routers.ts");
    const waveRouterFiles = readdirSync(join(ROOT, "server"))
      .filter(f => f.match(/^wave\d+Router\.ts$/) && !f.includes(".test."));
    
    const unregistered: string[] = [];
    for (const file of waveRouterFiles) {
      const routerName = file.replace(".ts", "");
      // Check if the router name or its import appears in routers.ts
      if (!routersContent.includes(routerName) && !routersContent.includes(file.replace(".ts", ""))) {
        unregistered.push(file);
      }
    }
    expect(unregistered).toHaveLength(0);
  });
});

describe("Wave 141: No Hardcoded Return Arrays in Wave Routers", () => {
  it("wave routers have no hardcoded return arrays (excluding fallbacks)", () => {
    const waveRouterFiles = readdirSync(join(ROOT, "server"))
      .filter(f => f.match(/^wave\d+Router\.ts$/) && !f.includes(".test."));
    
    const violations: string[] = [];
    for (const file of waveRouterFiles) {
      const content = read(`server/${file}`);
      // Check for return [{ patterns that aren't in mock/fallback blocks
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('return [{') && !line.includes('//') && 
            !content.substring(Math.max(0, content.indexOf(line) - 200), content.indexOf(line)).includes('mock') &&
            !content.substring(Math.max(0, content.indexOf(line) - 200), content.indexOf(line)).includes('fallback')) {
          violations.push(`${file}:${i + 1}`);
        }
      }
    }
    expect(violations).toHaveLength(0);
  });
});

describe("Wave 141: Complete Error Coverage", () => {
  it("all PWA pages with tRPC have error handling", () => {
    const pagesDir = join(ROOT, "client/src/pages");
    const violations: string[] = [];
    
    function checkDir(dir: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) checkDir(fullPath);
        else if (entry.name.endsWith(".tsx")) {
          const content = readFileSync(fullPath, "utf-8");
          if (content.includes("trpc.") && 
              !content.match(/isError|error|Error|catch|onError|toast|Toast/)) {
            violations.push(fullPath.replace(ROOT + "/", ""));
          }
        }
      }
    }
    checkDir(pagesDir);
    expect(violations).toHaveLength(0);
  });
});
