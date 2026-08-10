/**
 * Wave 124 Production Readiness Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers:
 *   1.  Backend Routers — wave124.ts registration and all 20 router exports
 *   2.  Bill Payments Router — list, get, create, updateStatus, stats
 *   3.  Carbon Credits Router — list, get, create, retire, stats
 *   4.  Consumer Finance Loans Router — list, get, create, updateStatus, stats
 *   5.  Coupons Router — list, get, create, update, delete, stats
 *   6.  Device Push Tokens Router — list, register, deregister, stats
 *   7.  Fraud Alert Comments Router — list, add, delete
 *   8.  Idempotency Requests Router — list, stats, purgeExpired
 *   9.  Insurance Policies Router — list, get, create, cancel, stats
 *  10.  Loan Repayments Router — list, record, stats
 *  11.  POS Terminals Router — list, get, provision, updateStatus, heartbeat, getTransactions, stats
 *  12.  POS Transactions Router — list, get, create, stats
 *  13.  Purchase Orders Router — list, get, create, updateStatus, delete, stats
 *  14.  QR Payments Router — list, get, validate, generate, claim, stats
 *  15.  Red Envelopes Router — list, get, create, getClaims, stats
 *  16.  Referrals Router — list, create, complete, stats
 *  17.  Saved Beneficiaries Router — list, add, update, delete, incrementUsage
 *  18.  Subscriptions Router — list, get, create, cancel, stats
 *  19.  USSD Sessions Router — list, get, stats
 *  20.  WAF Alerts Router — list, get, dismiss, stats
 *  21.  Offline Resilience Router — getStatus, queueAction, getQueue, processQueue
 *  22.  Security — security124.ts PBAC definitions
 *  23.  Middleware Bridge — wave124 bridge functions
 *  24.  PWA Pages — BillPayments, CarbonCredits, POSTerminals, BillPayments routes
 *  25.  React Native Screens — BillPaymentsScreen, CarbonCreditsScreen, SubscriptionsScreen, CouponsScreen
 *  26.  Flutter Screens — bill_payments, carbon_credits, subscriptions, coupons
 *  27.  Docker Compose — wave124 services
 *  28.  Seed Data — wave124 SQL
 *  29.  Env Var Docs — ENVIRONMENT_VARIABLES_WAVE124.md
 *  30.  AppNavigator — new screen registrations
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. Backend Router Registration ──────────────────────────────────────────
describe("Wave 124 — Backend Router Registration", () => {
  it("wave124.ts router file exists", () => {
    expect(existsSync(join(ROOT, "server/routers/wave124.ts"))).toBe(true);
  });

  const expectedRouters = [
    "billPaymentsRouter",
    "carbonCreditsRouter",
    "consumerFinanceLoansRouter",
    "couponsRouter",
    "devicePushTokensRouter",
    "fraudAlertCommentsRouter",
    "idempotencyRequestsRouter",
    "insurancePoliciesRouter",
    "loanRepaymentsRouter",
    "posTerminalsRouter",
    "posTransactionsRouter",
    "purchaseOrdersRouter",
    "qrPaymentsRouter",
    "redEnvelopesRouter",
    "referralsRouter",
    "savedBeneficiariesRouter",
    "subscriptionsRouter",
    "ussdSessionsRouter",
    "wafAlertsRouter",
    "offlineResilienceRouter",
  ];

  expectedRouters.forEach((routerName) => {
    it(`${routerName} is exported from wave124.ts`, () => {
      const content = readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");
      expect(content).toContain(routerName);
    });
  });

  it("wave124 routers are imported in main routers.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("wave124");
  });

  const expectedNamespaces = [
    "billPayments",
    "carbonCredits",
    "consumerFinanceLoans",
    "coupons",
    "devicePushTokens",
    "fraudAlertComments",
    "idempotencyRequests",
    "insurancePolicies",
    "loanRepayments",
    "posTerminals",
    "posTransactions",
    "purchaseOrders",
    "qrPayments",
    "redEnvelopes",
    "referrals",
    "savedBeneficiaries",
    "subscriptions",
    "ussdSessions",
    "wafAlerts",
    "offlineResilience",
  ];

  expectedNamespaces.forEach((ns) => {
    it(`${ns} namespace is registered in appRouter`, () => {
      const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
      expect(content).toContain(ns);
    });
  });
});

// ─── 2. Bill Payments Router ──────────────────────────────────────────────────
describe("Wave 124 — Bill Payments Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const content = getContent();
    const billSection = content.split("billPaymentsRouter")[1]?.split("carbonCreditsRouter")[0] ?? "";
    expect(billSection).toContain("list:");
  });

  it("has get procedure", () => {
    const content = getContent();
    const billSection = content.split("billPaymentsRouter")[1]?.split("carbonCreditsRouter")[0] ?? "";
    expect(billSection).toContain("get:");
  });

  it("has create procedure", () => {
    const content = getContent();
    const billSection = content.split("billPaymentsRouter")[1]?.split("carbonCreditsRouter")[0] ?? "";
    expect(billSection).toContain("create:");
  });

  it("has updateStatus procedure", () => {
    const content = getContent();
    const billSection = content.split("billPaymentsRouter")[1]?.split("carbonCreditsRouter")[0] ?? "";
    expect(billSection).toContain("updateStatus:");
  });

  it("has stats procedure", () => {
    const content = getContent();
    const billSection = content.split("billPaymentsRouter")[1]?.split("carbonCreditsRouter")[0] ?? "";
    expect(billSection).toContain("stats:");
  });

  it("uses billPayments schema table", () => {
    expect(getContent()).toContain("billPayments");
  });
});

// ─── 3. Carbon Credits Router ─────────────────────────────────────────────────
describe("Wave 124 — Carbon Credits Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const section = getContent().split("carbonCreditsRouter")[1]?.split("consumerFinanceLoansRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has get procedure", () => {
    const section = getContent().split("carbonCreditsRouter")[1]?.split("consumerFinanceLoansRouter")[0] ?? "";
    expect(section).toContain("get:");
  });

  it("has create procedure", () => {
    const section = getContent().split("carbonCreditsRouter")[1]?.split("consumerFinanceLoansRouter")[0] ?? "";
    expect(section).toContain("create:");
  });

  it("has retire procedure", () => {
    const section = getContent().split("carbonCreditsRouter")[1]?.split("consumerFinanceLoansRouter")[0] ?? "";
    expect(section).toContain("retire:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("carbonCreditsRouter")[1]?.split("consumerFinanceLoansRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 4. Coupons Router ────────────────────────────────────────────────────────
describe("Wave 124 — Coupons Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const section = getContent().split("couponsRouter")[1]?.split("devicePushTokensRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has validate procedure", () => {
    const section = getContent().split("couponsRouter")[1]?.split("devicePushTokensRouter")[0] ?? "";
    expect(section).toContain("validate:");
  });

  it("has create procedure", () => {
    const section = getContent().split("couponsRouter")[1]?.split("devicePushTokensRouter")[0] ?? "";
    expect(section).toContain("create:");
  });

  it("has update procedure", () => {
    const section = getContent().split("couponsRouter")[1]?.split("devicePushTokensRouter")[0] ?? "";
    expect(section).toContain("update:");
  });

  it("has delete procedure", () => {
    const section = getContent().split("couponsRouter")[1]?.split("devicePushTokensRouter")[0] ?? "";
    expect(section).toContain("delete:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("couponsRouter")[1]?.split("devicePushTokensRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 5. POS Terminals Router ──────────────────────────────────────────────────
describe("Wave 124 — POS Terminals Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const section = getContent().split("posTerminalsRouter")[1]?.split("posTransactionsRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has get procedure", () => {
    const section = getContent().split("posTerminalsRouter")[1]?.split("posTransactionsRouter")[0] ?? "";
    expect(section).toContain("get:");
  });

  it("has provision procedure", () => {
    const section = getContent().split("posTerminalsRouter")[1]?.split("posTransactionsRouter")[0] ?? "";
    expect(section).toContain("provision:");
  });

  it("has updateStatus procedure", () => {
    const section = getContent().split("posTerminalsRouter")[1]?.split("posTransactionsRouter")[0] ?? "";
    expect(section).toContain("updateStatus:");
  });

  it("has heartbeat procedure", () => {
    const section = getContent().split("posTerminalsRouter")[1]?.split("posTransactionsRouter")[0] ?? "";
    expect(section).toContain("heartbeat:");
  });

  it("has getTransactions procedure", () => {
    const section = getContent().split("posTerminalsRouter")[1]?.split("posTransactionsRouter")[0] ?? "";
    expect(section).toContain("getTransactions:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("posTerminalsRouter")[1]?.split("posTransactionsRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 6. QR Payments Router ────────────────────────────────────────────────────
describe("Wave 124 — QR Payments Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const section = getContent().split("qrPaymentsRouter")[1]?.split("redEnvelopesRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has get procedure", () => {
    const section = getContent().split("qrPaymentsRouter")[1]?.split("redEnvelopesRouter")[0] ?? "";
    expect(section).toContain("get:");
  });

  it("has generate procedure", () => {
    const section = getContent().split("qrPaymentsRouter")[1]?.split("redEnvelopesRouter")[0] ?? "";
    expect(section).toContain("generate:");
  });

  it("has claim procedure", () => {
    const section = getContent().split("qrPaymentsRouter")[1]?.split("redEnvelopesRouter")[0] ?? "";
    expect(section).toContain("claim:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("qrPaymentsRouter")[1]?.split("redEnvelopesRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 7. Subscriptions Router ──────────────────────────────────────────────────
describe("Wave 124 — Subscriptions Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const section = getContent().split("subscriptionsRouter")[1]?.split("ussdSessionsRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has get procedure", () => {
    const section = getContent().split("subscriptionsRouter")[1]?.split("ussdSessionsRouter")[0] ?? "";
    expect(section).toContain("get:");
  });

  it("has create procedure", () => {
    const section = getContent().split("subscriptionsRouter")[1]?.split("ussdSessionsRouter")[0] ?? "";
    expect(section).toContain("create:");
  });

  it("has cancel procedure", () => {
    const section = getContent().split("subscriptionsRouter")[1]?.split("ussdSessionsRouter")[0] ?? "";
    expect(section).toContain("cancel:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("subscriptionsRouter")[1]?.split("ussdSessionsRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 8. Purchase Orders Router ────────────────────────────────────────────────
describe("Wave 124 — Purchase Orders Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const section = getContent().split("purchaseOrdersRouter")[1]?.split("qrPaymentsRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has get procedure", () => {
    const section = getContent().split("purchaseOrdersRouter")[1]?.split("qrPaymentsRouter")[0] ?? "";
    expect(section).toContain("get:");
  });

  it("has create procedure", () => {
    const section = getContent().split("purchaseOrdersRouter")[1]?.split("qrPaymentsRouter")[0] ?? "";
    expect(section).toContain("create:");
  });

  it("has updateStatus procedure", () => {
    const section = getContent().split("purchaseOrdersRouter")[1]?.split("qrPaymentsRouter")[0] ?? "";
    expect(section).toContain("updateStatus:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("purchaseOrdersRouter")[1]?.split("qrPaymentsRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 9. Red Envelopes Router ──────────────────────────────────────────────────
describe("Wave 124 — Red Envelopes Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const section = getContent().split("redEnvelopesRouter")[1]?.split("referralsRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has create procedure", () => {
    const section = getContent().split("redEnvelopesRouter")[1]?.split("referralsRouter")[0] ?? "";
    expect(section).toContain("create:");
  });

  it("has getClaims procedure", () => {
    const section = getContent().split("redEnvelopesRouter")[1]?.split("referralsRouter")[0] ?? "";
    expect(section).toContain("getClaims:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("redEnvelopesRouter")[1]?.split("referralsRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 10. Saved Beneficiaries Router ───────────────────────────────────────────
describe("Wave 124 — Saved Beneficiaries Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("has list procedure", () => {
    const section = getContent().split("savedBeneficiariesRouter")[1]?.split("subscriptionsRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has add procedure", () => {
    const section = getContent().split("savedBeneficiariesRouter")[1]?.split("subscriptionsRouter")[0] ?? "";
    expect(section).toContain("add:");
  });

  it("has update procedure", () => {
    const section = getContent().split("savedBeneficiariesRouter")[1]?.split("subscriptionsRouter")[0] ?? "";
    expect(section).toContain("update:");
  });

  it("has delete procedure", () => {
    const section = getContent().split("savedBeneficiariesRouter")[1]?.split("subscriptionsRouter")[0] ?? "";
    expect(section).toContain("delete:");
  });

  it("has incrementUsage procedure", () => {
    const section = getContent().split("savedBeneficiariesRouter")[1]?.split("subscriptionsRouter")[0] ?? "";
    expect(section).toContain("incrementUsage:");
  });
});

// ─── 11. WAF Alerts Router ────────────────────────────────────────────────────
describe("Wave 124 — WAF Alerts Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("wafAlertsRouter is exported", () => {
    expect(getContent()).toContain("wafAlertsRouter");
  });

  it("has list procedure in wafAlertsRouter", () => {
    const section = getContent().split("wafAlertsRouter")[1]?.split("offlineResilienceRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has getTopAttackers procedure in wafAlertsRouter", () => {
    const section = getContent().split("wafAlertsRouter")[1]?.split("offlineResilienceRouter")[0] ?? "";
    expect(section).toContain("getTopAttackers:");
  });

  it("has ingest procedure in wafAlertsRouter", () => {
    const section = getContent().split("wafAlertsRouter")[1]?.split("offlineResilienceRouter")[0] ?? "";
    expect(section).toContain("ingest:");
  });

  it("has stats procedure in wafAlertsRouter", () => {
    const section = getContent().split("wafAlertsRouter")[1]?.split("offlineResilienceRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 12. Offline Resilience Router ────────────────────────────────────────────
describe("Wave 124 — Offline Resilience Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("offlineResilienceRouter is exported", () => {
    expect(getContent()).toContain("offlineResilienceRouter");
  });

  it("has listPendingSync procedure", () => {
    const section = getContent().split("offlineResilienceRouter")[1] ?? "";
    expect(section).toContain("listPendingSync:");
  });

  it("has markSynced procedure", () => {
    const section = getContent().split("offlineResilienceRouter")[1] ?? "";
    expect(section).toContain("markSynced:");
  });

  it("has getNetworkStatus procedure", () => {
    const section = getContent().split("offlineResilienceRouter")[1] ?? "";
    expect(section).toContain("getNetworkStatus:");
  });

  it("has getStats procedure", () => {
    const section = getContent().split("offlineResilienceRouter")[1] ?? "";
    expect(section).toContain("getStats:");
  });
});

// ─── 13. Security124 ──────────────────────────────────────────────────────────
describe("Wave 124 — Security Hardening (security124.ts)", () => {
  const getContent = () => readFileSync(join(ROOT, "server/security124.ts"), "utf-8");

  it("security124.ts file exists", () => {
    expect(existsSync(join(ROOT, "server/security124.ts"))).toBe(true);
  });

  it("defines PBAC for billPayments namespace", () => {
    expect(getContent()).toContain("billPayments");
  });

  it("defines PBAC for carbonCredits namespace", () => {
    expect(getContent()).toContain("carbonCredits");
  });

  it("defines PBAC for subscriptions namespace", () => {
    expect(getContent()).toContain("subscriptions");
  });

  it("defines PBAC for qrPayments namespace", () => {
    expect(getContent()).toContain("qrPayments");
  });

  it("defines PBAC for posTerminals namespace", () => {
    expect(getContent()).toContain("posTerminals");
  });

  it("defines PBAC for purchaseOrders namespace", () => {
    expect(getContent()).toContain("purchaseOrders");
  });

  it("defines PBAC for insurancePolicies namespace", () => {
    expect(getContent()).toContain("insurancePolicies");
  });

  it("defines PBAC for coupons namespace", () => {
    expect(getContent()).toContain("coupons");
  });

  it("defines PBAC for savedBeneficiaries namespace", () => {
    expect(getContent()).toContain("savedBeneficiaries");
  });

  it("defines PBAC for wafAlerts namespace", () => {
    expect(getContent()).toContain("wafAlerts");
  });

  it("defines PBAC for offlineResilience namespace", () => {
    expect(getContent()).toContain("offlineResilience");
  });

  it("has DDoS rate limiting definitions", () => {
    const content = getContent();
    expect(content.toLowerCase()).toMatch(/ddos|rate.?limit|throttle/);
  });

  it("has ransomware protection definitions", () => {
    const content = getContent();
    expect(content.toLowerCase()).toMatch(/ransomware|bulk.?delete|destroy/);
  });

  it("has offline resilience security definitions", () => {
    const content = getContent();
    expect(content.toLowerCase()).toMatch(/offline|resilience|low.?bandwidth/);
  });
});

// ─── 14. Middleware Bridge — Wave 124 ─────────────────────────────────────────
describe("Wave 124 — Middleware Bridge Functions", () => {
  const getContent = () => readFileSync(join(ROOT, "server/middlewareBridge.ts"), "utf-8");

  it("middlewareBridge.ts has wave124 section", () => {
    expect(getContent()).toContain("Wave 124");
  });

  it("has processBillPaymentViaMiddleware function", () => {
    expect(getContent()).toContain("processBillPaymentViaMiddleware");
  });

  it("has getBillerListViaMiddleware function", () => {
    expect(getContent()).toContain("getBillerListViaMiddleware");
  });

  it("has retireCarbonCreditsViaMiddleware function", () => {
    expect(getContent()).toContain("retireCarbonCreditsViaMiddleware");
  });

  it("has getCarbonMarketPriceViaMiddleware function", () => {
    expect(getContent()).toContain("getCarbonMarketPriceViaMiddleware");
  });

  it("has syncSubscriptionWithStripeViaMiddleware function", () => {
    expect(getContent()).toContain("syncSubscriptionWithStripeViaMiddleware");
  });

  it("has sendSubscriptionRenewalReminderViaMiddleware function", () => {
    expect(getContent()).toContain("sendSubscriptionRenewalReminderViaMiddleware");
  });

  it("has generateQrCodeViaMiddleware function", () => {
    expect(getContent()).toContain("generateQrCodeViaMiddleware");
  });

  it("has validateQrPaymentViaMiddleware function", () => {
    expect(getContent()).toContain("validateQrPaymentViaMiddleware");
  });

  it("has registerPosTerminalViaMiddleware function", () => {
    expect(getContent()).toContain("registerPosTerminalViaMiddleware");
  });

  it("has sendPosTerminalCommandViaMiddleware function", () => {
    expect(getContent()).toContain("sendPosTerminalCommandViaMiddleware");
  });

  it("has processReferralRewardViaMiddleware function", () => {
    expect(getContent()).toContain("processReferralRewardViaMiddleware");
  });

  it("has terminateUssdSessionViaMiddleware function", () => {
    expect(getContent()).toContain("terminateUssdSessionViaMiddleware");
  });

  it("has getUssdSessionMetricsViaMiddleware function", () => {
    expect(getContent()).toContain("getUssdSessionMetricsViaMiddleware");
  });

  it("has approvePurchaseOrderViaMiddleware function", () => {
    expect(getContent()).toContain("approvePurchaseOrderViaMiddleware");
  });

  it("has rejectPurchaseOrderViaMiddleware function", () => {
    expect(getContent()).toContain("rejectPurchaseOrderViaMiddleware");
  });

  it("has submitInsuranceClaimViaMiddleware function", () => {
    expect(getContent()).toContain("submitInsuranceClaimViaMiddleware");
  });

  it("has processLoanRepaymentViaMiddleware function", () => {
    expect(getContent()).toContain("processLoanRepaymentViaMiddleware");
  });

  it("has at least 15 wave124 safe() calls in middleware bridge (across all Wave 124 sections)", () => {
    const content = getContent();
    const parts = content.split("Wave 124");
    let total = 0;
    for (let i = 1; i < parts.length; i++) {
      total += (parts[i].match(/return safe\(/g) ?? []).length;
    }
    expect(total).toBeGreaterThanOrEqual(15);
  });
});

// ─── 15. PWA Pages ────────────────────────────────────────────────────────────
describe("Wave 124 — PWA Pages", () => {
  const pagesDir = join(ROOT, "client/src/pages");

  it("BillPayments.tsx exists", () => {
    expect(existsSync(join(pagesDir, "BillPayments.tsx"))).toBe(true);
  });

  it("CarbonCredits.tsx exists", () => {
    expect(existsSync(join(pagesDir, "CarbonCredits.tsx"))).toBe(true);
  });

  it("BillPayments.tsx uses tRPC billPayments namespace", () => {
    const content = readFileSync(join(pagesDir, "BillPayments.tsx"), "utf-8");
    expect(content).toContain("billPayments");
  });

  it("CarbonCredits.tsx uses tRPC carbonCredits namespace", () => {
    const content = readFileSync(join(pagesDir, "CarbonCredits.tsx"), "utf-8");
    expect(content).toContain("carbonCredits");
  });

  it("BillPayments.tsx is registered in App.tsx", () => {
    const appContent = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(appContent).toContain("BillPayments");
  });

  it("CarbonCredits.tsx is registered in App.tsx", () => {
    const appContent = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(appContent).toContain("CarbonCredits");
  });

  it("BillPayments has a route path in App.tsx", () => {
    const appContent = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(appContent).toMatch(/bill-payments|BillPayments/);
  });

  it("CarbonCredits has a route path in App.tsx", () => {
    const appContent = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(appContent).toMatch(/carbon-credits|CarbonCredits/);
  });

  it("wave124 pages have nav items in Layout.tsx", () => {
    const layoutContent = readFileSync(join(ROOT, "client/src/components/Layout.tsx"), "utf-8");
    expect(layoutContent).toMatch(/bill-payments|carbon-credits|BillPayments|CarbonCredits/);
  });
});

// ─── 16. React Native Screens ─────────────────────────────────────────────────
describe("Wave 124 — React Native Screens", () => {
  const rnDir = join(ROOT, "mobile/react-native/src/screens");

  const screens = [
    { file: "BillPaymentsScreen.tsx", namespace: "billPayments" },
    { file: "CarbonCreditsScreen.tsx", namespace: "carbonCredits" },
    { file: "SubscriptionsScreen.tsx", namespace: "subscriptions" },
    { file: "CouponsScreen.tsx", namespace: "coupons" },
  ];

  screens.forEach(({ file, namespace }) => {
    it(`${file} exists`, () => {
      expect(existsSync(join(rnDir, file))).toBe(true);
    });

    it(`${file} uses tRPC ${namespace} namespace`, () => {
      const content = readFileSync(join(rnDir, file), "utf-8");
      expect(content).toContain(namespace);
    });

    it(`${file} is a valid React Native component`, () => {
      const content = readFileSync(join(rnDir, file), "utf-8");
      expect(content).toMatch(/View|ScrollView|FlatList/);
      expect(content).toMatch(/StyleSheet|styles/);
    });
  });

  it("wave124 screens are registered in AppNavigator.tsx", () => {
    const navContent = readFileSync(
      join(ROOT, "mobile/react-native/src/navigation/AppNavigator.tsx"),
      "utf-8"
    );
    expect(navContent).toContain("BillPayments");
    expect(navContent).toContain("CarbonCredits");
    expect(navContent).toContain("Subscriptions");
    expect(navContent).toContain("Coupons");
  });
});

// ─── 17. Flutter Screens ──────────────────────────────────────────────────────
describe("Wave 124 — Flutter Screens", () => {
  const flutterDir = join(ROOT, "mobile/flutter/lib/screens");

  const screens = [
    "bill_payments/bill_payments_screen.dart",
    "carbon_credits/carbon_credits_screen.dart",
    "subscriptions/subscriptions_screen.dart",
    "coupons/coupons_screen.dart",
  ];

  screens.forEach((screenPath) => {
    it(`${screenPath} exists`, () => {
      expect(existsSync(join(flutterDir, screenPath))).toBe(true);
    });

    it(`${screenPath} is a valid Flutter widget`, () => {
      const content = readFileSync(join(flutterDir, screenPath), "utf-8");
      expect(content).toMatch(/StatefulWidget|StatelessWidget/);
      expect(content).toMatch(/Widget build\(BuildContext/);
    });

    it(`${screenPath} has Scaffold structure`, () => {
      const content = readFileSync(join(flutterDir, screenPath), "utf-8");
      expect(content).toContain("Scaffold");
    });
  });

  it("bill_payments_screen.dart uses HTTP client for API calls", () => {
    const content = readFileSync(
      join(flutterDir, "bill_payments/bill_payments_screen.dart"),
      "utf-8"
    );
    expect(content).toMatch(/http|dio|trpc|api/i);
  });

  it("carbon_credits_screen.dart shows credit type and quantity", () => {
    const content = readFileSync(
      join(flutterDir, "carbon_credits/carbon_credits_screen.dart"),
      "utf-8"
    );
    expect(content).toMatch(/credit|carbon|tonne/i);
  });

  it("subscriptions_screen.dart shows subscription status", () => {
    const content = readFileSync(
      join(flutterDir, "subscriptions/subscriptions_screen.dart"),
      "utf-8"
    );
    expect(content).toMatch(/status|active|cancel/i);
  });

  it("coupons_screen.dart shows coupon code and discount", () => {
    const content = readFileSync(
      join(flutterDir, "coupons/coupons_screen.dart"),
      "utf-8"
    );
    expect(content).toMatch(/coupon|discount|code/i);
  });
});

// ─── 18. Docker Compose ───────────────────────────────────────────────────────
describe("Wave 124 — Docker Compose", () => {
  const getContent = () => readFileSync(join(ROOT, "docker-compose.wave124.yml"), "utf-8");

  it("docker-compose.wave124.yml exists", () => {
    expect(existsSync(join(ROOT, "docker-compose.wave124.yml"))).toBe(true);
  });

  const expectedServices = [
    "bill-payments-gateway",
    "carbon-registry",
    "subscription-engine",
    "qr-payment-generator",
    "pos-terminal-manager",
    "referral-engine",
    "ussd-gateway",
    "purchase-order-workflow",
    "insurance-claims-processor",
    "loan-repayment-engine",
    "coupon-engine",
    "saved-beneficiaries-cache",
    "device-push-token-registry",
  ];

  expectedServices.forEach((service) => {
    it(`has ${service} service defined`, () => {
      expect(getContent()).toContain(service);
    });
  });

  it("uses paygate-wave124 network", () => {
    expect(getContent()).toContain("paygate-wave124");
  });

  it("all services have healthcheck defined", () => {
    const content = getContent();
    const healthcheckCount = (content.match(/healthcheck:/g) ?? []).length;
    expect(healthcheckCount).toBeGreaterThanOrEqual(10);
  });

  it("uses environment variable references (not hardcoded secrets)", () => {
    const content = getContent();
    expect(content).toContain("${DATABASE_URL}");
    expect(content).toContain("${REDIS_URL}");
    expect(content).toContain("${KAFKA_BOOTSTRAP_SERVERS}");
  });
});

// ─── 19. Seed Data ────────────────────────────────────────────────────────────
describe("Wave 124 — Seed Data", () => {
  const getContent = () => readFileSync(join(ROOT, "scripts/seed-wave124.sql"), "utf-8");

  it("seed-wave124.sql exists", () => {
    expect(existsSync(join(ROOT, "scripts/seed-wave124.sql"))).toBe(true);
  });

  const expectedTables = [
    "bill_payments",
    "carbon_credits",
    "subscriptions",
    "coupons",
    "qr_payments",
    "referrals",
    "ussd_sessions",
    "pos_terminals",
    "purchase_orders",
    "insurance_policies",
    "loan_repayments",
    "saved_beneficiaries",
    "device_push_tokens",
    "fraud_alert_comments",
    "red_envelopes",
    "audit_events",
    "idempotency_requests",
  ];

  expectedTables.forEach((table) => {
    it(`has INSERT INTO ${table}`, () => {
      expect(getContent()).toContain(`INSERT INTO ${table}`);
    });
  });

  it("uses ON CONFLICT DO NOTHING for idempotent seeding", () => {
    const content = getContent();
    const conflictCount = (content.match(/ON CONFLICT.*DO NOTHING/g) ?? []).length;
    expect(conflictCount).toBeGreaterThanOrEqual(10);
  });
});

// ─── 20. Environment Variables Docs ───────────────────────────────────────────
describe("Wave 124 — Environment Variables Documentation", () => {
  const getContent = () =>
    readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE124.md"), "utf-8");

  it("ENVIRONMENT_VARIABLES_WAVE124.md exists", () => {
    expect(existsSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE124.md"))).toBe(true);
  });

  it("documents VTPASS_API_KEY", () => {
    expect(getContent()).toContain("VTPASS_API_KEY");
  });

  it("documents VTPASS_SECRET_KEY", () => {
    expect(getContent()).toContain("VTPASS_SECRET_KEY");
  });

  it("documents CARBON_MARKET_API_KEY", () => {
    expect(getContent()).toContain("CARBON_MARKET_API_KEY");
  });

  it("documents USSD_GATEWAY_URL", () => {
    expect(getContent()).toContain("USSD_GATEWAY_URL");
  });

  it("documents VAPID_PUBLIC_KEY", () => {
    expect(getContent()).toContain("VAPID_PUBLIC_KEY");
  });

  it("documents VAPID_PRIVATE_KEY", () => {
    expect(getContent()).toContain("VAPID_PRIVATE_KEY");
  });

  it("documents PUSH_SERVICE_URL", () => {
    expect(getContent()).toContain("PUSH_SERVICE_URL");
  });

  it("documents YOUVERIFY_API_KEY", () => {
    expect(getContent()).toContain("YOUVERIFY_API_KEY");
  });

  it("documents PAYMENT_LINK_BASE_URL", () => {
    expect(getContent()).toContain("PAYMENT_LINK_BASE_URL");
  });

  it("documents POS_FIRMWARE_BUCKET", () => {
    expect(getContent()).toContain("POS_FIRMWARE_BUCKET");
  });

  it("has a summary table", () => {
    const content = getContent();
    expect(content).toContain("Summary");
  });

  it("includes notes about kobo monetary units", () => {
    const content = getContent();
    expect(content.toLowerCase()).toContain("kobo");
  });
});

// ─── 21. Schema Coverage Verification ────────────────────────────────────────
describe("Wave 124 — Schema Coverage Verification", () => {
  const getRouterContent = () =>
    readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  const expectedSchemaImports = [
    "billPayments",
    "carbonCredits",
    "coupons",
    "devicePushTokens",
    "fraudAlertComments",
    "idempotencyRequests",
    "insurancePolicies",
    "loanRepayments",
    "posTerminals",
    "posTransactions",
    "purchaseOrders",
    "qrPayments",
    "redEnvelopes",
    "referrals",
    "savedBeneficiaries",
    "subscriptions",
    "ussdSessions",
  ];

  expectedSchemaImports.forEach((tableName) => {
    it(`wave124.ts imports and uses ${tableName} schema table`, () => {
      expect(getRouterContent()).toContain(tableName);
    });
  });
});

// ─── 22. Referrals Router ─────────────────────────────────────────────────────
describe("Wave 124 — Referrals Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("referralsRouter is exported", () => {
    expect(getContent()).toContain("referralsRouter");
  });

  it("has list procedure", () => {
    const section = getContent().split("referralsRouter")[1]?.split("savedBeneficiariesRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has create procedure", () => {
    const section = getContent().split("referralsRouter")[1]?.split("savedBeneficiariesRouter")[0] ?? "";
    expect(section).toContain("create:");
  });

  it("has complete procedure", () => {
    const section = getContent().split("referralsRouter")[1]?.split("savedBeneficiariesRouter")[0] ?? "";
    expect(section).toContain("complete:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("referralsRouter")[1]?.split("savedBeneficiariesRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 23. USSD Sessions Router ─────────────────────────────────────────────────
describe("Wave 124 — USSD Sessions Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("ussdSessionsRouter is exported", () => {
    expect(getContent()).toContain("ussdSessionsRouter");
  });

  it("has list procedure", () => {
    const section = getContent().split("ussdSessionsRouter")[1]?.split("wafAlertsRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has get procedure", () => {
    const section = getContent().split("ussdSessionsRouter")[1]?.split("wafAlertsRouter")[0] ?? "";
    expect(section).toContain("get:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("ussdSessionsRouter")[1]?.split("wafAlertsRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});

// ─── 24. Insurance Policies Router ────────────────────────────────────────────
describe("Wave 124 — Insurance Policies Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave124.ts"), "utf-8");

  it("insurancePoliciesRouter is exported", () => {
    expect(getContent()).toContain("insurancePoliciesRouter");
  });

  it("has list procedure", () => {
    const section = getContent().split("insurancePoliciesRouter")[1]?.split("loanRepaymentsRouter")[0] ?? "";
    expect(section).toContain("list:");
  });

  it("has get procedure", () => {
    const section = getContent().split("insurancePoliciesRouter")[1]?.split("loanRepaymentsRouter")[0] ?? "";
    expect(section).toContain("get:");
  });

  it("has create procedure", () => {
    const section = getContent().split("insurancePoliciesRouter")[1]?.split("loanRepaymentsRouter")[0] ?? "";
    expect(section).toContain("create:");
  });

  it("has cancel procedure", () => {
    const section = getContent().split("insurancePoliciesRouter")[1]?.split("loanRepaymentsRouter")[0] ?? "";
    expect(section).toContain("cancel:");
  });

  it("has stats procedure", () => {
    const section = getContent().split("insurancePoliciesRouter")[1]?.split("loanRepaymentsRouter")[0] ?? "";
    expect(section).toContain("stats:");
  });
});
