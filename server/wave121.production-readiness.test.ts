/**
 * Wave 121 Production Readiness Tests
 * Covers: FeeSchedules, ChargebackCases, FraudRules, KYBVerifications,
 *         InvoiceFinancingV2, LoyaltyV3, TenantProvisioning (Temporal),
 *         AuditLogViewer (OpenSearch), PWA routes, Flutter/RN parity
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const r = (p: string) => join(ROOT, p);

// ─── 1. wave121 router file exists and has correct namespaces ────────────────
describe("Wave 121 Router", () => {
  const routerPath = r("server/routers/wave121.ts");
  const content = existsSync(routerPath) ? readFileSync(routerPath, "utf8") : "";

  it("wave121.ts file exists", () => {
    expect(existsSync(routerPath)).toBe(true);
  });

  it("exports feeSchedulesRouter", () => {
    expect(content).toMatch(/feeSchedulesRouter/);
  });

  it("exports chargebackMgmtRouter", () => {
    expect(content).toMatch(/chargebackMgmtRouter/);
  });

  it("exports fraudRulesRouter", () => {
    expect(content).toMatch(/fraudRulesRouter/);
  });

  it("exports kybMgmtRouter", () => {
    expect(content).toMatch(/kybMgmtRouter/);
  });

  it("exports invoiceFinV2Router", () => {
    expect(content).toMatch(/invoiceFinV2Router/);
  });

  it("exports loyaltyV3Router", () => {
    expect(content).toMatch(/loyaltyV3Router/);
  });

  it("exports tenantProvisionRouter", () => {
    expect(content).toMatch(/tenantProvisionRouter/);
  });

  it("exports openSearchAuditRouter", () => {
    expect(content).toMatch(/openSearchAuditRouter/);
  });

  it("uses provisionTenantViaMiddleware for Temporal wiring", () => {
    expect(content).toMatch(/provisionTenantViaMiddleware/);
  });

  it("uses searchAuditTrailViaOpenSearch for OpenSearch wiring", () => {
    expect(content).toMatch(/searchAuditTrailViaOpenSearch|indexAuditEvent/);
  });
});

// ─── 2. wave121 is registered in appRouter ──────────────────────────────────
describe("Wave 121 Router Registration", () => {
  const routersPath = r("server/routers.ts");
  const content = existsSync(routersPath) ? readFileSync(routersPath, "utf8") : "";

  it("imports wave121 router", () => {
    expect(content).toMatch(/wave121/);
  });

  it("registers feeSchedules namespace", () => {
    expect(content).toMatch(/feeSchedules:/);
  });

  it("registers chargebackMgmt namespace", () => {
    expect(content).toMatch(/chargebackMgmt:/);
  });

  it("registers fraudRules namespace", () => {
    expect(content).toMatch(/fraudRules:/);
  });

  it("registers kybMgmt namespace", () => {
    expect(content).toMatch(/kybMgmt:/);
  });

  it("registers invoiceFinV2 namespace", () => {
    expect(content).toMatch(/invoiceFinV2:/);
  });

  it("registers loyaltyV3 namespace", () => {
    expect(content).toMatch(/loyaltyV3:/);
  });

  it("registers tenantProvision namespace", () => {
    expect(content).toMatch(/tenantProvision:/);
  });

  it("registers openSearchAudit namespace", () => {
    expect(content).toMatch(/openSearchAudit:/);
  });
});

// ─── 3. PWA pages exist ──────────────────────────────────────────────────────
describe("Wave 121 PWA Pages", () => {
  const pages = [
    "FeeSchedules",
    "ChargebackCases",
    "FraudRules",
    "KYBVerifications",
    "InvoiceFinancing",
    "LoyaltyV3",
    "TenantProvisioning",
    "AuditLogViewer",
  ];

  for (const page of pages) {
    it(`${page}.tsx exists`, () => {
      expect(existsSync(r(`client/src/pages/${page}.tsx`))).toBe(true);
    });
  }
});

// ─── 4. PWA pages are registered in App.tsx ─────────────────────────────────
describe("Wave 121 App.tsx Routes", () => {
  const appPath = r("client/src/App.tsx");
  const content = existsSync(appPath) ? readFileSync(appPath, "utf8") : "";

  it("registers /fee-schedules route", () => {
    expect(content).toMatch(/fee-schedules/);
  });

  it("registers /chargeback-cases route", () => {
    expect(content).toMatch(/chargeback-cases/);
  });

  it("registers /fraud-rules route", () => {
    expect(content).toMatch(/fraud-rules/);
  });

  it("registers /kyb-verifications route", () => {
    expect(content).toMatch(/kyb-verifications/);
  });

  it("registers /invoice-financing route", () => {
    expect(content).toMatch(/invoice-financing/);
  });

  it("registers /loyalty-v3 route", () => {
    expect(content).toMatch(/loyalty-v3/);
  });

  it("registers /admin/tenant-provisioning route", () => {
    expect(content).toMatch(/tenant-provisioning/);
  });

  it("registers /audit-log route", () => {
    expect(content).toMatch(/audit-log/);
  });
});

// ─── 5. Layout.tsx has nav items for new pages ───────────────────────────────
describe("Wave 121 Layout Nav Items", () => {
  const layoutPath = r("client/src/components/Layout.tsx");
  const content = existsSync(layoutPath) ? readFileSync(layoutPath, "utf8") : "";

  it("has Fee Schedules nav item", () => {
    expect(content).toMatch(/fee-schedules/);
  });

  it("has Chargeback Cases nav item", () => {
    expect(content).toMatch(/chargeback-cases/);
  });

  it("has Fraud Rules nav item", () => {
    expect(content).toMatch(/fraud-rules/);
  });

  it("has KYB Verifications nav item", () => {
    expect(content).toMatch(/kyb-verifications/);
  });

  it("has Invoice Financing nav item", () => {
    expect(content).toMatch(/invoice-financing/);
  });

  it("has Tenant Provisioning nav item", () => {
    expect(content).toMatch(/tenant-provisioning/);
  });
});

// ─── 6. AuditLogViewer uses OpenSearch ───────────────────────────────────────
describe("AuditLogViewer OpenSearch Integration", () => {
  const viewerPath = r("client/src/pages/AuditLogViewer.tsx");
  const content = existsSync(viewerPath) ? readFileSync(viewerPath, "utf8") : "";

  it("AuditLogViewer.tsx exists", () => {
    expect(existsSync(viewerPath)).toBe(true);
  });

  it("has date-range filters", () => {
    expect(content).toMatch(/dateFrom|date-from|DateFrom/);
  });

  it("has actor search filter", () => {
    expect(content).toMatch(/actorId|actor_id|Actor/);
  });

  it("has action-type facet", () => {
    expect(content).toMatch(/actionType|action_type|ActionType/);
  });

  it("has resource-type facet", () => {
    expect(content).toMatch(/resourceType|resource_type|ResourceType/);
  });

  it("has OpenSearch toggle", () => {
    expect(content).toMatch(/useOpenSearch|openSearch|OpenSearch/);
  });

  it("has export CSV functionality", () => {
    expect(content).toMatch(/csv|CSV|Export/i);
  });

  it("has pagination", () => {
    expect(content).toMatch(/page|pagination|Pagination/i);
  });
});

// ─── 7. TenantProvisioning uses Temporal ─────────────────────────────────────
describe("TenantProvisioning Temporal Integration", () => {
  const provPath = r("client/src/pages/TenantProvisioning.tsx");
  const content = existsSync(provPath) ? readFileSync(provPath, "utf8") : "";

  it("TenantProvisioning.tsx exists", () => {
    expect(existsSync(provPath)).toBe(true);
  });

  it("calls tenantProvision tRPC procedure", () => {
    expect(content).toMatch(/tenantProvision/);
  });

  it("has multi-step wizard UI", () => {
    expect(content).toMatch(/step|Step|wizard|Wizard/i);
  });

  it("shows workflow status/progress", () => {
    expect(content).toMatch(/status|Status|progress|Progress/i);
  });
});

// ─── 8. Flutter parity screens exist ─────────────────────────────────────────
describe("Wave 121 Flutter Parity", () => {
  const flutterScreens = [
    "fee_schedules/fee_schedules_screen.dart",
    "chargeback_cases/chargeback_cases_screen.dart",
    "fraud_rules/fraud_rules_screen.dart",
    "kyb_verifications/kyb_verifications_screen.dart",
    "invoice_financing/invoice_financing_screen.dart",
    "loyalty_v3/loyalty_v3_screen.dart",
    "tenant_provisioning/tenant_provisioning_screen.dart",
    "audit_log_viewer/audit_log_viewer_screen.dart",
  ];

  for (const screen of flutterScreens) {
    it(`Flutter ${screen} exists`, () => {
      expect(existsSync(r(`mobile/flutter/lib/screens/${screen}`))).toBe(true);
    });
  }

  it("Flutter app.dart registers all Wave 121 routes", () => {
    const appDart = readFileSync(r("mobile/flutter/lib/app.dart"), "utf8");
    expect(appDart).toMatch(/fee-schedules/);
    expect(appDart).toMatch(/chargeback-cases/);
    expect(appDart).toMatch(/fraud-rules/);
    expect(appDart).toMatch(/kyb-verifications/);
    expect(appDart).toMatch(/invoice-financing/);
    expect(appDart).toMatch(/loyalty-v3/);
    expect(appDart).toMatch(/audit-log/);
  });
});

// ─── 9. React Native parity screens exist ────────────────────────────────────
describe("Wave 121 React Native Parity", () => {
  const rnScreens = [
    "FeeSchedulesScreen.tsx",
    "ChargebackCasesScreen.tsx",
    "FraudRulesScreen.tsx",
    "KYBVerificationsScreen.tsx",
    "InvoiceFinancingScreen.tsx",
    "LoyaltyV3Screen.tsx",
    "TenantProvisioningScreen.tsx",
    "AuditLogViewerScreen.tsx",
  ];

  for (const screen of rnScreens) {
    it(`React Native ${screen} exists`, () => {
      expect(existsSync(r(`mobile/react-native/src/screens/${screen}`))).toBe(true);
    });
  }
});

// ─── 10. middlewareBridge has Wave 121 functions ──────────────────────────────
describe("Wave 121 Middleware Bridge Functions", () => {
  const bridgePath = r("server/middlewareBridge.ts");
  const content = existsSync(bridgePath) ? readFileSync(bridgePath, "utf8") : "";

  it("has provisionTenantViaMiddleware", () => {
    expect(content).toMatch(/provisionTenantViaMiddleware/);
  });

  it("has searchAuditTrailViaOpenSearch or indexAuditEventViaOpenSearch", () => {
    expect(content).toMatch(/searchAuditTrailViaOpenSearch|indexAuditEventViaOpenSearch/);
  });
});

// ─── 11. Schema has required tables ──────────────────────────────────────────
describe("Wave 121 Schema Coverage", () => {
  const schemaPath = r("drizzle/schema.ts");
  const content = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : "";

  it("has chargebacks table", () => {
    expect(content).toMatch(/chargebacks/);
  });

  it("has fraudAlerts table", () => {
    expect(content).toMatch(/fraudAlerts/);
  });

  it("has kybVerifications table", () => {
    expect(content).toMatch(/kybVerifications/);
  });

  it("has loyaltyV3Programs table", () => {
    expect(content).toMatch(/loyaltyV3Programs/);
  });

  it("has invoiceFinancingV2Applications table", () => {
    expect(content).toMatch(/invoiceFinancingV2Applications/);
  });
});
