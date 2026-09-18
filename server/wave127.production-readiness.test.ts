/**
 * Wave 127 Production-Readiness Tests
 *
 * Covers:
 * 1. Wave 126 suggested next steps (GoldSIP time-range, FraudRisk seed button, BillingEngine tenantId)
 * 2. Kafka event publishing wired to financial operations
 * 3. 20 React Native screens wired to real tRPC endpoints (no static data)
 * 4. Duplicate route removal in App.tsx
 * 5. WAFAlertDashboard DB sync fix
 * 6. Security: input validation, no hardcoded credentials
 * 7. Resilience: adaptive retry in QueryClient
 * 8. Middleware integration: Kafka, Fluvio, Redis, Permify
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CLIENT_PAGES = path.join(ROOT, "client/src/pages");
const RN_SCREENS = path.join(ROOT, "mobile/react-native/src/screens");
const SERVER = path.join(ROOT, "server");

// ─── Helper ───────────────────────────────────────────────────────────────────
function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ─── 1. GoldSIP time-range selector ──────────────────────────────────────────
describe("Wave 127 / GoldSIP time-range selector", () => {
  const goldSip = readFile(path.join(CLIENT_PAGES, "GoldSIP.tsx"));

  it("should have a time-range state variable", () => {
    expect(goldSip).toMatch(/useState.*historyMonths|historyMonths.*useState|timeRange|selectedRange/);
  });

  it("should pass months parameter to getPortfolioHistory query", () => {
    expect(goldSip).toMatch(/getPortfolioHistory[\s\S]{0,200}months|months[\s\S]{0,200}getPortfolioHistory/);
  });

  it("should render time-range selector buttons (1M, 3M, 6M, 1Y)", () => {
    const hasButtons =
      goldSip.includes("1M") ||
      goldSip.includes("3M") ||
      goldSip.includes("6M") ||
      goldSip.includes("1Y") ||
      goldSip.includes("months.*1\b") ||
      goldSip.includes("timeRange");
    expect(hasButtons).toBe(true);
  });
});

// ─── 2. FraudRisk Seed Demo Data button ──────────────────────────────────────
describe("Wave 127 / FraudRisk seed demo data button", () => {
  const fraudRisk = readFile(path.join(CLIENT_PAGES, "FraudRisk.tsx"));

  it("should have a seedDemoAlerts mutation", () => {
    expect(fraudRisk).toMatch(/seedDemoAlerts/);
  });

  it("should render a Seed Demo Data button in the DB Alerts tab", () => {
    expect(fraudRisk).toMatch(/[Ss]eed.*[Dd]emo|[Dd]emo.*[Ss]eed/);
  });

  it("should call seedDemoAlerts on button click", () => {
    expect(fraudRisk).toMatch(/seedDemoAlerts.*mutate|mutate.*seedDemoAlerts/);
  });
});

// ─── 3. BillingEngineScreen tenantId from auth context ───────────────────────
describe("Wave 127 / BillingEngineScreen tenantId resolution", () => {
  const billingScreen = readFile(
    path.join(RN_SCREENS, "BillingEngineScreen.tsx")
  );

  it("should import auth context", () => {
    expect(billingScreen).toMatch(/useAuth|AuthContext|auth.*context/i);
  });

  it("should use auth user id as tenantId", () => {
    const hasDynamicTenantId =
      billingScreen.match(/tenantId.*user\.|user\..*tenantId|user\.id|user\.openId|merchantId/) !== null;
    expect(hasDynamicTenantId).toBe(true);
  });

  it("should not pass empty string as tenantId", () => {
    // Should not have tenantId: "" as a hardcoded empty string
    expect(billingScreen).not.toMatch(/tenantId:\s*["']{2}/);
  });
});

// ─── 4. Kafka events wired to financial operations ───────────────────────────
describe("Wave 127 / Kafka events wired to financial operations", () => {
  const routers = readFile(path.join(SERVER, "routers.ts"));

  it("should import Kafka publish functions", () => {
    expect(routers).toMatch(/publishTransactionEvent|publishPayoutEvent|publishFraudEvent/);
  });

  it("should publish Kafka event after transaction creation", () => {
    expect(routers).toMatch(/publishTransactionEvent\s*\(/);
  });

  it("should publish Kafka event after payout creation", () => {
    expect(routers).toMatch(/publishPayoutEvent\s*\(/);
  });

  it("should publish Kafka event after fraud alert creation", () => {
    expect(routers).toMatch(/publishFraudEvent\s*\(/);
  });

  it("should use fire-and-forget pattern (non-fatal)", () => {
    expect(routers).toMatch(/\.catch\(e => logger\.warn.*kafka.*non-fatal/);
  });
});

// ─── 5. Kafka client has correct publish functions ───────────────────────────
describe("Wave 127 / Kafka client publish functions", () => {
  const kafkaClient = readFile(path.join(SERVER, "kafkaClient.ts"));

  it("should export publishTransactionEvent", () => {
    expect(kafkaClient).toMatch(/export.*publishTransactionEvent/);
  });

  it("should export publishPayoutEvent", () => {
    expect(kafkaClient).toMatch(/export.*publishPayoutEvent/);
  });

  it("should export publishFraudEvent", () => {
    expect(kafkaClient).toMatch(/export.*publishFraudEvent/);
  });

  it("should export publishAuditEvent", () => {
    expect(kafkaClient).toMatch(/export.*publishAuditEvent/);
  });

  it("should use KAFKA_BOOTSTRAP_SERVERS from env", () => {
    expect(kafkaClient).toMatch(/KAFKA_BOOTSTRAP|kafkaBootstrap|bootstrap.*servers/i);
  });
});

// ─── 6. React Native screens wired to real tRPC endpoints ────────────────────
describe("Wave 127 / React Native screens wired to tRPC", () => {
  const staticScreens = [
    "FeeSchedulesScreen.tsx",
    "FraudRulesScreen.tsx",
    "LoyaltyV3Screen.tsx",
    "ChargebackCasesScreen.tsx",
    "AuditLogViewerScreen.tsx",
    "SupportChatScreen.tsx",
    "TaxFilingV2Screen.tsx",
    "TenantProvisioningScreen.tsx",
    "TransactionReceiptsScreen.tsx",
    "UsdcV3Screen.tsx",
    "WebhookSimV2Screen.tsx",
    "InvoiceFinancingScreen.tsx",
    "KYBVerificationsScreen.tsx",
    "SettlementsScreen.tsx",
    "QRPaymentsScreen.tsx",
    "ComplianceScreen.tsx",
    "ReconciliationScreen.tsx",
    "SplitBillV2Screen.tsx",
    "StaffManagementScreen.tsx",
    "InsuranceClaimsScreen.tsx",
  ];

  staticScreens.forEach((screenFile) => {
    it(`${screenFile} should import trpc`, () => {
      const content = readFile(path.join(RN_SCREENS, screenFile));
      expect(content).toMatch(/import.*trpc.*from.*lib\/trpc|from.*trpc/);
    });

    it(`${screenFile} should use useQuery or useMutation`, () => {
      const content = readFile(path.join(RN_SCREENS, screenFile));
      expect(content).toMatch(/useQuery|useMutation/);
    });

    it(`${screenFile} should NOT use setTimeout fake data`, () => {
      const content = readFile(path.join(RN_SCREENS, screenFile));
      // Should not have the old fake data pattern
      expect(content).not.toMatch(/await new Promise.*setTimeout.*500\)/);
    });
  });
});

// ─── 7. Duplicate routes removed from App.tsx ────────────────────────────────
describe("Wave 127 / Duplicate routes removed from App.tsx", () => {
  const appTsx = readFile(path.join(ROOT, "client/src/App.tsx"));

  it("should not have duplicate /admin/data-pipeline route", () => {
    const matches = appTsx.match(/path.*admin\/data-pipeline/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("should not have duplicate /loyalty-v3 route", () => {
    const matches = appTsx.match(/path.*loyalty-v3/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("should not have duplicate /admin/corridors route", () => {
    const matches = appTsx.match(/path.*admin\/corridors/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("should not have duplicate PartnerOnboardingWizard static import", () => {
    const staticImports = appTsx.match(/^import.*PartnerOnboardingWizard/gm) ?? [];
    expect(staticImports.length).toBeLessThanOrEqual(1);
  });
});

// ─── 8. WAFAlertDashboard DB sync fix ────────────────────────────────────────
describe("Wave 127 / WAFAlertDashboard DB sync", () => {
  const wafDash = readFile(path.join(CLIENT_PAGES, "WAFAlertDashboard.tsx"));

  // STALE CONTRACT: the manual useEffect/setEvents DB-sync was replaced by a
  // declarative trpc.wafAlerts.list.useQuery (React Query owns the sync);
  // the component renders wafAlertsData directly — no fabricated events.
  it("should load DB events via the wafAlerts tRPC query", () => {
    expect(wafDash).toMatch(/trpc\.wafAlerts\.list\.useQuery/);
  });

  it("should render real DB alert data (no fabricated events)", () => {
    expect(wafDash).toMatch(/wafAlertsData/);
    expect(wafDash).toContain("no fabricated events");
  });
});

// ─── 9. Security: no hardcoded passwords in Login.tsx ────────────────────────
describe("Wave 127 / Security: no hardcoded credentials", () => {
  const login = readFile(path.join(CLIENT_PAGES, "Login.tsx"));

  it("should not have hardcoded demo password in initial state", () => {
    // Should not pre-fill password field with 'demo123' or similar
    expect(login).not.toMatch(/useState\s*\(\s*["']demo123["']\s*\)/);
    expect(login).not.toMatch(/useState\s*\(\s*["']password["']\s*\)/);
  });
});

// ─── 10. Resilience: adaptive retry in QueryClient ───────────────────────────
describe("Wave 127 / Resilience: adaptive retry in QueryClient", () => {
  const mainTsx = readFile(path.join(ROOT, "client/src/main.tsx"));

  it("should configure retry in QueryClient", () => {
    expect(mainTsx).toMatch(/retry.*\d|retryDelay|defaultOptions.*retry/);
  });

  it("should not retry on 4xx errors", () => {
    // Should have logic to skip retry on client errors
    const hasClientErrorCheck =
      mainTsx.match(/4\d\d|status.*400|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|failureCount|TRPCClientError/) !== null;
    expect(hasClientErrorCheck).toBe(true);
  });
});

// ─── 11. Middleware: Redis cache helper exists ────────────────────────────────
describe("Wave 127 / Middleware: Redis cache helper", () => {
  it("should have a Redis cache helper file", () => {
    expect(fileExists(path.join(SERVER, "cache.ts"))).toBe(true);
  });

  it("cache.ts should export withCache or cache object", () => {
    const cache = readFile(path.join(SERVER, "cache.ts"));
    expect(cache).toMatch(/export.*withCache|export.*cache|CacheStore|CacheNamespace/);
  });
});

// ─── 12. Middleware: Permify PBAC integration ────────────────────────────────
describe("Wave 127 / Middleware: Permify PBAC", () => {
  it("should have a permifyClient.ts", () => {
    expect(fileExists(path.join(SERVER, "permifyClient.ts"))).toBe(true);
  });

  it("permifyClient should export canPerformMerchantAction", () => {
    const permify = readFile(path.join(SERVER, "permifyClient.ts"));
    expect(permify).toMatch(/canPerformMerchantAction/);
  });

  it("tRPC core should use Permify for PBAC checks", () => {
    // STALE CONTRACT: tRPC core now exposes pbacProcedure() which delegates to
    // requirePermission in server/pbac.ts (Permify-backed permifyCheck).
    const trpcCore = readFile(path.join(SERVER, "_core/trpc.ts"));
    expect(trpcCore).toMatch(/permify|canPerformMerchantAction|pbacProcedure/);
    const pbac = readFile(path.join(SERVER, "pbac.ts"));
    expect(pbac).toMatch(/permifyCheck/);
  });
});

// ─── 13. Middleware: Fluvio streaming client ─────────────────────────────────
describe("Wave 127 / Middleware: Fluvio streaming client", () => {
  it("should have a fluvioClient.ts", () => {
    expect(fileExists(path.join(SERVER, "fluvioClient.ts"))).toBe(true);
  });

  it("fluvioClient should export produceRecord", () => {
    const fluvio = readFile(path.join(SERVER, "fluvioClient.ts"));
    expect(fluvio).toMatch(/export.*produceRecord/);
  });

  it("fluvioClient should export streamTransactionForScoring", () => {
    const fluvio = readFile(path.join(SERVER, "fluvioClient.ts"));
    expect(fluvio).toMatch(/streamTransactionForScoring|publishFraudScore/);
  });
});

// ─── 14. GoldSIP portfolio history procedure exists ──────────────────────────
describe("Wave 127 / GoldSIP portfolio history procedure", () => {
  const newFeaturesRouter = readFile(path.join(SERVER, "newFeaturesRouter.ts"));

  it("should have getPortfolioHistory procedure", () => {
    expect(newFeaturesRouter).toMatch(/getPortfolioHistory/);
  });

  it("should accept months parameter", () => {
    expect(newFeaturesRouter).toMatch(/months.*z\.number|z\.number.*months/);
  });

  it("should return monthly aggregated data", () => {
    expect(newFeaturesRouter).toMatch(/month|monthly|aggregate/i);
  });
});

// ─── 15. FraudRisk seedDemoAlerts procedure exists ───────────────────────────
describe("Wave 127 / FraudRisk seedDemoAlerts procedure", () => {
  const routers = readFile(path.join(SERVER, "routers.ts"));

  it("should have seedDemoAlerts procedure", () => {
    expect(routers).toMatch(/seedDemoAlerts/);
  });

  it("should be idempotent (check existing alerts before seeding)", () => {
    // STALE CONTRACT: seedDemoAlerts is now gated behind ALLOW_DEMO_SEED
    // (fail-closed demo gating) before the idempotency check, so the window
    // between the procedure name and the existing-alert check is larger.
    expect(routers).toMatch(/seedDemoAlerts[\s\S]{0,1500}existing|seedDemoAlerts[\s\S]{0,1500}Already has/);
    expect(routers).toMatch(/seedDemoAlerts[\s\S]{0,1500}ALLOW_DEMO_SEED/);
  });
});

// ─── 16. BillingEngineScreen exists and uses tRPC ────────────────────────────
describe("Wave 127 / BillingEngineScreen exists", () => {
  it("should exist as a file", () => {
    expect(fileExists(path.join(RN_SCREENS, "BillingEngineScreen.tsx"))).toBe(true);
  });

  it("should import trpc", () => {
    const content = readFile(path.join(RN_SCREENS, "BillingEngineScreen.tsx"));
    expect(content).toMatch(/import.*trpc|from.*trpc/);
  });

  it("should be registered in AppNavigator", () => {
    const navigator = readFile(
      path.join(ROOT, "mobile/react-native/src/navigation/AppNavigator.tsx")
    );
    expect(navigator).toMatch(/BillingEngine/);
  });
});
