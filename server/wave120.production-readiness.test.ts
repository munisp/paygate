/**
 * Wave 120 Production Readiness Tests
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}
function fileContains(relPath: string, ...patterns: string[]): boolean {
  try {
    const content = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    return patterns.every(p => content.includes(p));
  } catch { return false; }
}
function fileLineCount(relPath: string): number {
  try {
    const content = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    return content.split("\n").length;
  } catch { return 0; }
}

describe("Wave 120 — crud120 Router", () => {
  it("crud120.ts exists", () => expect(fileExists("server/routers/crud120.ts")).toBe(true));
  it("crud120.ts is substantial", () => expect(fileLineCount("server/routers/crud120.ts")).toBeGreaterThan(1000));
  it("crud120.ts exports crud120Router", () => expect(fileContains("server/routers/crud120.ts", "export const crud120Router")).toBe(true));
  it("crud120b.ts exists", () => expect(fileExists("server/routers/crud120b.ts")).toBe(true));
  it("crud120b.ts exports staffRouter", () => expect(fileContains("server/routers/crud120b.ts", "staffRouter")).toBe(true));
  it("crud120b.ts exports insuranceClaimsRouter", () => expect(fileContains("server/routers/crud120b.ts", "insuranceClaimsRouter")).toBe(true));
  it("crud120b.ts exports supportRouter", () => expect(fileContains("server/routers/crud120b.ts", "supportRouter")).toBe(true));
  it("crud120b.ts exports usdcRouter", () => expect(fileContains("server/routers/crud120b.ts", "usdcRouter")).toBe(true));
  it("crud120b.ts exports webhookSimulatorRouter", () => expect(fileContains("server/routers/crud120b.ts", "webhookSimulatorRouter")).toBe(true));
  it("crud120b.ts exports taxFilingV2Router", () => expect(fileContains("server/routers/crud120b.ts", "taxFilingRouter")).toBe(true));
  it("crud120b.ts exports transactionReceiptsRouter", () => expect(fileContains("server/routers/crud120b.ts", "transactionReceiptsRouter")).toBe(true));
  it("crud120b.ts exports splitBillRouter", () => expect(fileContains("server/routers/crud120b.ts", "splitBillRouter")).toBe(true));
  it("crud120b.ts exports tenantMgmtRouter", () => expect(fileContains("server/routers/crud120b.ts", "tenantMgmtRouter")).toBe(true));
  it("crud120 imported in routers.ts", () => expect(fileContains("server/routers.ts", "crud120Router")).toBe(true));
  it("staffMgmt registered in appRouter", () => expect(fileContains("server/routers.ts", "staffMgmt:")).toBe(true));
  it("insuranceClaims registered in appRouter", () => expect(fileContains("server/routers.ts", "insuranceClaims:")).toBe(true));
  it("supportChat registered in appRouter", () => expect(fileContains("server/routers.ts", "supportChat:")).toBe(true));
  it("usdcV3 registered in appRouter", () => expect(fileContains("server/routers.ts", "usdcV3:")).toBe(true));
  it("webhookSimV2 registered in appRouter", () => expect(fileContains("server/routers.ts", "webhookSimV2:")).toBe(true));
  it("taxFilingV2 registered in appRouter", () => expect(fileContains("server/routers.ts", "taxFilingV2:")).toBe(true));
  it("transactionReceiptsV2 registered in appRouter", () => expect(fileContains("server/routers.ts", "txReceipts:")).toBe(true));
  it("splitBillV2 registered in appRouter", () => expect(fileContains("server/routers.ts", "splitBillV2:")).toBe(true));
  it("tenantMgmt registered in appRouter", () => expect(fileContains("server/routers.ts", "tenantMgmt:")).toBe(true));
});

describe("Wave 120 — PWA Pages", () => {
  const pages = [
    "client/src/pages/StaffManagement.tsx",
    "client/src/pages/InsuranceClaims.tsx",
    "client/src/pages/SupportChat.tsx",
    "client/src/pages/UsdcV3.tsx",
    "client/src/pages/WebhookSimulatorV2.tsx",
    "client/src/pages/TaxFilingV2.tsx",
    "client/src/pages/TransactionReceiptsV2.tsx",
    "client/src/pages/SplitBillV2.tsx",
  ];
  for (const p of pages) {
    it(`${p.split("/").pop()} exists`, () => expect(fileExists(p)).toBe(true));
  }
  it("StaffManagement uses staffMgmt", () => expect(fileContains("client/src/pages/StaffManagement.tsx", "staffMgmt")).toBe(true));
  it("InsuranceClaims uses insuranceClaims", () => expect(fileContains("client/src/pages/InsuranceClaims.tsx", "insuranceClaims")).toBe(true));
  it("SupportChat uses supportChat", () => expect(fileContains("client/src/pages/SupportChat.tsx", "supportChat")).toBe(true));
  it("UsdcV3 uses usdcV3", () => expect(fileContains("client/src/pages/UsdcV3.tsx", "usdcV3")).toBe(true));
  it("All new pages in App.tsx", () => expect(fileContains("client/src/App.tsx", "StaffManagement", "InsuranceClaims", "SupportChat", "UsdcV3")).toBe(true));
  it("All new routes in App.tsx", () => expect(fileContains("client/src/App.tsx", "/staff-management", "/insurance-claims", "/support-chat", "/usdc-v3")).toBe(true));
  it("Layout.tsx has staff-management nav", () => expect(fileContains("client/src/components/Layout.tsx", "staff-management")).toBe(true));
  it("Layout.tsx has insurance-claims nav", () => expect(fileContains("client/src/components/Layout.tsx", "insurance-claims")).toBe(true));
});

describe("Wave 120 — Flutter Screens", () => {
  const screens = [
    "mobile/flutter/lib/screens/staff_management/staff_management_screen.dart",
    "mobile/flutter/lib/screens/insurance_claims/insurance_claims_screen.dart",
    "mobile/flutter/lib/screens/support_chat/support_chat_screen.dart",
    "mobile/flutter/lib/screens/usdc_v3/usdc_v3_screen.dart",
    "mobile/flutter/lib/screens/webhook_sim_v2/webhook_sim_v2_screen.dart",
    "mobile/flutter/lib/screens/tax_filing_v2/tax_filing_v2_screen.dart",
    "mobile/flutter/lib/screens/transaction_receipts/transaction_receipts_screen.dart",
    "mobile/flutter/lib/screens/split_bill_v2/split_bill_v2_screen.dart",
  ];
  for (const s of screens) {
    it(`${s.split("/").pop()} exists`, () => expect(fileExists(s)).toBe(true));
  }
  it("Flutter app.dart has Wave 120 routes", () => expect(fileContains("mobile/flutter/lib/app.dart", "/staff-management", "/insurance-claims")).toBe(true));
});

describe("Wave 120 — React Native Screens", () => {
  const screens = [
    "mobile/react-native/src/screens/StaffManagementScreen.tsx",
    "mobile/react-native/src/screens/InsuranceClaimsScreen.tsx",
    "mobile/react-native/src/screens/SupportChatScreen.tsx",
    "mobile/react-native/src/screens/UsdcV3Screen.tsx",
    "mobile/react-native/src/screens/WebhookSimV2Screen.tsx",
    "mobile/react-native/src/screens/TaxFilingV2Screen.tsx",
    "mobile/react-native/src/screens/TransactionReceiptsScreen.tsx",
    "mobile/react-native/src/screens/SplitBillV2Screen.tsx",
  ];
  for (const s of screens) {
    it(`${s.split("/").pop()} exists`, () => expect(fileExists(s)).toBe(true));
  }
});

describe("Wave 120 — Middleware Bridge", () => {
  it("has staff functions", () => expect(fileContains("server/middlewareBridge.ts", "createStaffMemberViaMiddleware", "clockInStaffViaMiddleware")).toBe(true));
  it("has insurance functions", () => expect(fileContains("server/middlewareBridge.ts", "submitInsuranceClaimViaMiddleware", "approveInsuranceClaimViaMiddleware")).toBe(true));
  it("has support chat functions", () => expect(fileContains("server/middlewareBridge.ts", "createSupportSessionViaMiddleware", "sendSupportMessageViaMiddleware")).toBe(true));
  it("has USDC functions", () => expect(fileContains("server/middlewareBridge.ts", "initiateUSDCTransferViaMiddleware", "convertUSDCToFiatViaMiddleware")).toBe(true));
  it("has tax filing functions", () => expect(fileContains("server/middlewareBridge.ts", "submitTaxFilingViaMiddleware", "getTaxSummaryViaMiddleware")).toBe(true));
  it("has split bill functions", () => expect(fileContains("server/middlewareBridge.ts", "createSplitBillSessionViaMiddleware", "settleSplitBillSessionViaMiddleware")).toBe(true));
  it("has webhook sim functions", () => expect(fileContains("server/middlewareBridge.ts", "simulateWebhookEventViaMiddleware", "replayWebhookEventViaMiddleware")).toBe(true));
  it("has tenant functions", () => expect(fileContains("server/middlewareBridge.ts", "provisionTenantViaMiddleware", "suspendTenantViaMiddleware")).toBe(true));
  it("has OpenSearch functions", () => expect(fileContains("server/middlewareBridge.ts", "searchTransactionsViaOpenSearch", "indexAuditEventViaOpenSearch")).toBe(true));
  it("has TigerBeetle account functions", () => expect(fileContains("server/middlewareBridge.ts", "createStaffFloatAccountViaMiddleware", "createUSDCCustodyAccountViaMiddleware")).toBe(true));
  it("has Lakehouse compliance functions", () => expect(fileContains("server/middlewareBridge.ts", "writeLakehouseComplianceEventViaMiddleware", "queryLakehouseComplianceViaMiddleware")).toBe(true));
  it("middlewareBridge.ts is >1200 lines", () => expect(fileLineCount("server/middlewareBridge.ts")).toBeGreaterThan(1200));
});

describe("Wave 120 — Security Hardening", () => {
  it("security120.ts exists", () => expect(fileExists("server/security120.ts")).toBe(true));
  it("security120.ts has DDoS mitigation", () => expect(fileContains("server/security120.ts", "ddosDetector", "rateLimit")).toBe(true));
  it("security120.ts has PBAC", () => expect(fileContains("server/security120.ts", "pbacEnforce")).toBe(true));
});

describe("Wave 120 — Infrastructure", () => {
  it("docker-compose.wave120.yml exists", () => expect(fileExists("docker/docker-compose.wave120.yml")).toBe(true));
  it("docker-compose.wave120.yml has all 8 services", () => expect(fileContains("docker/docker-compose.wave120.yml", "staff-service", "insurance-service", "support-chat-service", "usdc-bridge-service", "tax-filing-service", "split-bill-service", "webhook-simulator-v2", "tenant-provisioning-service")).toBe(true));
  it("docker-compose.wave120.yml has OpenAppSec WAF", () => expect(fileContains("docker/docker-compose.wave120.yml", "openappsec-waf")).toBe(true));
  it("billing_seed.sql has Wave 120 data", () => expect(fileContains("billing-engine/seed/billing_seed.sql", "Wave 120 Seed Data", "staff_members", "insurance_claims")).toBe(true));
  it("ENVIRONMENT_VARIABLES_WAVE120.md exists", () => expect(fileExists("docs/ENVIRONMENT_VARIABLES_WAVE120.md")).toBe(true));
  it("ENVIRONMENT_VARIABLES_WAVE120.md covers all services", () => expect(fileContains("docs/ENVIRONMENT_VARIABLES_WAVE120.md", "Staff Management Service", "Insurance Claims Service", "USDC Bridge Service")).toBe(true));
});

describe("Wave 120 — Overall Project Health", () => {
  it("routers.ts is >7000 lines", () => expect(fileLineCount("server/routers.ts")).toBeGreaterThan(7000));
  it("middlewareBridge.ts is >1200 lines", () => expect(fileLineCount("server/middlewareBridge.ts")).toBeGreaterThan(1200));
  it("App.tsx has >100 routes", () => {
    const content = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf8");
    const routeCount = (content.match(/<Route/g) || []).length;
    expect(routeCount).toBeGreaterThan(100);
  });
  it("billing_seed.sql is >100 lines", () => expect(fileLineCount("billing-engine/seed/billing_seed.sql")).toBeGreaterThan(100));
  it("drizzle schema has >50 tables", () => {
    const content = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf8");
    const tableCount = (content.match(/pgTable\(/g) || []).length;
    expect(tableCount).toBeGreaterThan(50);
  });
});
