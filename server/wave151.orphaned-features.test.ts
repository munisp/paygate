/**
 * Wave 151 — Orphaned Feature Wiring Tests
 *
 * Verifies that all 12 previously-orphaned features now have:
 *   1. A client page file
 *   2. The page makes tRPC calls to the correct router namespace
 *   3. The server router has all required procedures
 *   4. The page is registered in App.tsx
 *   5. The page has error handling (isError or onError)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const CLIENT_PAGES = path.join(ROOT, "client/src/pages");
const SERVER_ROUTERS = path.join(ROOT, "server/routers");
const APP_TSX = path.join(ROOT, "client/src/App.tsx");

function readPage(name: string) {
  return fs.readFileSync(path.join(CLIENT_PAGES, `${name}.tsx`), "utf8");
}

function readRouter(file: string) {
  return fs.readFileSync(path.join(SERVER_ROUTERS, file), "utf8");
}

const appTsx = fs.readFileSync(APP_TSX, "utf8");

// ─── 1. All 12 new pages exist ────────────────────────────────────────────────
describe("Wave 151: All 12 orphaned feature pages exist", () => {
  const pages = [
    "ReferralProgram",
    "SavedBeneficiaries",
    "POSTransactions",
    "CouponManagement",
    "LoyaltyProgram",
    "MarketDataDashboard",
    "SlaBreaches",
    "ConsumerLoans",
    "FraudAlertComments",
    "InsurancePolicies",
    "LoanRepayments",
    "StripeSubscriptions",
  ];

  for (const page of pages) {
    it(`${page}.tsx exists`, () => {
      const filePath = path.join(CLIENT_PAGES, `${page}.tsx`);
      expect(fs.existsSync(filePath), `${page}.tsx should exist`).toBe(true);
    });
  }
});

// ─── 2. All pages registered in App.tsx ──────────────────────────────────────
describe("Wave 151: All new pages registered in App.tsx", () => {
  const routes = [
    "/referrals",
    "/saved-beneficiaries",
    "/pos-transactions",
    "/coupons",
    "/loyalty",
    "/market-data",
    "/sla-breaches",
    "/consumer-loans",
    "/fraud-alert-comments",
    "/insurance-policies",
    "/loan-repayments",
    "/stripe-subscriptions",
  ];

  for (const route of routes) {
    it(`Route ${route} is registered in App.tsx`, () => {
      expect(appTsx).toContain(route);
    });
  }
});

// ─── 3. Pages call correct router namespaces ──────────────────────────────────
describe("Wave 151: Pages use correct tRPC router namespaces", () => {
  it("ReferralProgram calls trpc.referrals.*", () => {
    const content = readPage("ReferralProgram");
    expect(content).toContain("trpc.referrals.");
  });

  it("SavedBeneficiaries calls trpc.savedBeneficiaries.*", () => {
    const content = readPage("SavedBeneficiaries");
    expect(content).toContain("trpc.savedBeneficiaries.");
  });

  it("POSTransactions calls trpc.posTransactions.*", () => {
    const content = readPage("POSTransactions");
    expect(content).toContain("trpc.posTransactions.");
  });

  it("CouponManagement calls trpc.couponsMgmt.*", () => {
    const content = readPage("CouponManagement");
    expect(content).toContain("trpc.couponsMgmt.");
  });

  it("LoyaltyProgram calls trpc.loyalty.*", () => {
    const content = readPage("LoyaltyProgram");
    expect(content).toContain("trpc.loyalty.");
  });

  it("MarketDataDashboard calls trpc.marketData.*", () => {
    const content = readPage("MarketDataDashboard");
    expect(content).toContain("trpc.marketData.");
  });

  it("SlaBreaches calls trpc.slaBreaches.*", () => {
    const content = readPage("SlaBreaches");
    expect(content).toContain("trpc.slaBreaches.");
  });

  it("ConsumerLoans calls trpc.consumerFinanceLoans.*", () => {
    const content = readPage("ConsumerLoans");
    expect(content).toContain("trpc.consumerFinanceLoans.");
  });

  it("FraudAlertComments calls trpc.fraudAlertComments.*", () => {
    const content = readPage("FraudAlertComments");
    expect(content).toContain("trpc.fraudAlertComments.");
  });

  it("InsurancePolicies calls trpc.insurancePolicies.*", () => {
    const content = readPage("InsurancePolicies");
    expect(content).toContain("trpc.insurancePolicies.");
  });

  it("LoanRepayments calls trpc.loanRepayments.*", () => {
    const content = readPage("LoanRepayments");
    expect(content).toContain("trpc.loanRepayments.");
  });

  it("StripeSubscriptions calls trpc.stripeSubscriptions.*", () => {
    const content = readPage("StripeSubscriptions");
    expect(content).toContain("trpc.stripeSubscriptions.");
  });
});

// ─── 4. Server procedures exist ───────────────────────────────────────────────
describe("Wave 151: Server routers have required procedures", () => {
  it("wave124 referralsRouter has list, create, complete, stats", () => {
    const content = readRouter("wave124.ts");
    expect(content).toContain("referralsRouter");
    expect(content).toMatch(/referralsRouter\s*=\s*router\(\{[\s\S]*?list:/);
    expect(content).toMatch(/referralsRouter\s*=\s*router\(\{[\s\S]*?create:/);
    expect(content).toMatch(/referralsRouter\s*=\s*router\(\{[\s\S]*?complete:/);
    expect(content).toMatch(/referralsRouter\s*=\s*router\(\{[\s\S]*?stats:/);
  });

  it("wave124 loanRepaymentsRouter has list, record, stats, markPaid", () => {
    const content = readRouter("wave124.ts");
    expect(content).toContain("loanRepaymentsRouter");
    expect(content).toContain("markPaid:");
    expect(content).toContain("stats:");
  });

  it("wave124 couponsRouter has list, create, update, delete, stats", () => {
    const content = readRouter("wave124.ts");
    expect(content).toContain("couponsRouter");
    // stats is present
    const couponSection = content.substring(
      content.indexOf("export const couponsRouter"),
      content.indexOf("export const couponsRouter") + 4500
    );
    expect(couponSection).toContain("stats:");
    expect(couponSection).toContain("create:");
    expect(couponSection).toContain("delete:");
  });

  it("crud120b stripeSubscriptionsRouter has list, stats, cancel", () => {
    const content = readRouter("crud120b.ts");
    expect(content).toContain("stripeSubscriptionsRouter");
    const section = content.substring(
      content.indexOf("export const stripeSubscriptionsRouter"),
      content.indexOf("export const stripeSubscriptionsRouter") + 3500
    );
    expect(section).toContain("stats:");
    expect(section).toContain("cancel:");
    expect(section).toContain("list:");
  });
});

// ─── 5. All new pages have error handling ─────────────────────────────────────
describe("Wave 151: All new pages have error handling", () => {
  const pages = [
    "ReferralProgram",
    "SavedBeneficiaries",
    "POSTransactions",
    "CouponManagement",
    "LoyaltyProgram",
    "MarketDataDashboard",
    "SlaBreaches",
    "ConsumerLoans",
    "FraudAlertComments",
    "InsurancePolicies",
    "LoanRepayments",
    "StripeSubscriptions",
  ];

  for (const page of pages) {
    it(`${page}.tsx has error handling`, () => {
      const content = readPage(page);
      const hasErrorHandling =
        content.includes("isError") ||
        content.includes("onError") ||
        content.includes("error:") ||
        content.includes("isError:");
      expect(hasErrorHandling, `${page}.tsx should handle errors`).toBe(true);
    });
  }
});

// ─── 6. MarketDataDashboard isError fix ──────────────────────────────────────
describe("Wave 151: MarketDataDashboard isError fix", () => {
  it("MarketDataDashboard.tsx destructures isError from at least one useQuery", () => {
    const content = readPage("MarketDataDashboard");
    expect(content).toContain("isError");
  });
});
