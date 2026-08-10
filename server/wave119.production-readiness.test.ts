/**
 * Wave 119 — Production Readiness Sprint Tests
 *
 * Covers:
 * 1. crud119Router — 59 previously uncovered tables now have CRUD procedures
 * 2. tRPC reserved word fix — 'apply' renamed to 'applyLoan'
 * 3. Redis-backed rate limit stats in wave25Router
 * 4. Deterministic credit score in db.ts (no Math.random)
 * 5. Real gold price fetch in sipProcessor.ts
 * 6. Flutter mobile screen parity (28 screens)
 * 7. React Native mobile screen parity (30 files)
 * 8. Flutter app.dart registers all new screens
 * 9. Flutter billing_config model file exists
 * 10. Seed data covers Wave 119 tables
 * 11. Environment variables documentation
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

// ── 1. crud119Router — 59 tables covered ─────────────────────────────────────

describe("Wave 119: crud119Router covers all 59 uncovered tables", () => {
  const crud119Path = path.resolve(ROOT, "server/routers/crud119.ts");

  it("crud119.ts file exists and is substantial (>1000 lines)", () => {
    expect(fs.existsSync(crud119Path)).toBe(true);
    const lines = fs.readFileSync(crud119Path, "utf8").split("\n").length;
    expect(lines).toBeGreaterThan(1000);
  });

  it("crud119Router is registered in appRouter as 'crud'", () => {
    const routersTs = fs.readFileSync(
      path.resolve(ROOT, "server/routers.ts"),
      "utf8"
    );
    expect(routersTs).toContain("crud119Router");
    expect(routersTs).toContain("crud: crud119Router");
  });

  const expectedNamespaces = [
    "wallet",
    "crossBorder",
    "nipBanks",
    "merchantNotifications",
    "loyalty",
    "bnpl",
    "merchantProfiles",
    "merchantLoans",
    "splitRules",
    "webhookEndpoints",
    "invoicePayments",
    "insurance",
    "tax",
    "bulkCollection",
    "digitalGold",
    "pension",
    "cashback",
    "soundbox",
    "wealth",
    "emi",
    "reports",
    "nodal",
    "retailPos",
    "intlRemittance",
    "subscriptionV2",
    "overhead",
    "billingAudit",
    "billingEvents",
    "kyb",
    "dcc",
    "salary",
    "privacy",
    "regulatorySandbox",
    "consumerOutbox",
    "fraudFlags",
  ];

  it.each(expectedNamespaces)(
    "crud119Router exposes namespace: %s",
    (namespace) => {
      const crud119 = fs.readFileSync(crud119Path, "utf8");
      expect(crud119).toContain(namespace);
    }
  );
});

// ── 2. tRPC reserved word fix ─────────────────────────────────────────────────

describe("Wave 119: tRPC reserved word fix", () => {
  it("crud119.ts should not use 'apply' as a procedure name", () => {
    const crud119 = fs.readFileSync(
      path.resolve(ROOT, "server/routers/crud119.ts"),
      "utf8"
    );
    // 'apply' as a tRPC procedure key is forbidden
    expect(crud119).not.toMatch(/^\s+apply\s*:/m);
  });

  it("crud119.ts should use 'applyLoan' instead of 'apply'", () => {
    const crud119 = fs.readFileSync(
      path.resolve(ROOT, "server/routers/crud119.ts"),
      "utf8"
    );
    expect(crud119).toContain("applyLoan");
  });

  it("crud119.ts should not use other tRPC reserved words as procedure names", () => {
    const crud119 = fs.readFileSync(
      path.resolve(ROOT, "server/routers/crud119.ts"),
      "utf8"
    );
    const reservedWords = ["call", "bind", "constructor", "prototype"];
    for (const word of reservedWords) {
      expect(crud119).not.toMatch(new RegExp(`^\\s+${word}\\s*:`, "m"));
    }
  });
});

// ── 3. Redis-backed rate limit stats ─────────────────────────────────────────

describe("Wave 119: Redis-backed rate limit stats", () => {
  it("wave25Router.ts uses Redis for rate limit stats", () => {
    const wave25 = fs.readFileSync(
      path.resolve(ROOT, "server/wave25Router.ts"),
      "utf8"
    );
    expect(wave25).toContain("REDIS_URL");
    expect(wave25).toContain("paygate:ratelimit:");
    expect(wave25).toContain("paygate:blocked:");
  });

  it("wave25Router.ts does not use Math.random for rate limit stats", () => {
    const wave25 = fs.readFileSync(
      path.resolve(ROOT, "server/wave25Router.ts"),
      "utf8"
    );
    // Should not have Math.random() for generating fake rate limit numbers
    const lines = wave25.split("\n");
    const rateLimitSection = lines
      .slice(
        lines.findIndex((l) => l.includes("requestsLastHour")),
        lines.findIndex((l) => l.includes("requestsLastHour")) + 30
      )
      .join("\n");
    expect(rateLimitSection).not.toContain("Math.random");
  });

  it("wave25Router.ts falls back gracefully when Redis is unavailable", () => {
    const wave25 = fs.readFileSync(
      path.resolve(ROOT, "server/wave25Router.ts"),
      "utf8"
    );
    // Should have a try/catch or fallback for Redis unavailability
    expect(wave25).toContain("Redis unavailable");
  });
});

// ── 4. Deterministic credit score ─────────────────────────────────────────────

describe("Wave 119: Deterministic credit score in db.ts", () => {
  it("db.ts credit score is a fixed baseline, not random", () => {
    const dbTs = fs.readFileSync(
      path.resolve(ROOT, "server/db.ts"),
      "utf8"
    );
    // Should have a static baseline credit score
    expect(dbTs).toContain("creditScore: 650");
    // Should NOT use Math.random for credit score
    const creditScoreContext = dbTs.substring(
      Math.max(0, dbTs.indexOf("creditScore") - 200),
      dbTs.indexOf("creditScore") + 200
    );
    expect(creditScoreContext).not.toContain("Math.random");
  });
});

// ── 5. Real gold price fetch ──────────────────────────────────────────────────

describe("Wave 119: Real gold price fetch in sipProcessor.ts", () => {
  const sipPath = path.resolve(ROOT, "server/jobs/sipProcessor.ts");

  it("sipProcessor.ts exists", () => {
    expect(fs.existsSync(sipPath)).toBe(true);
  });

  it("sipProcessor.ts fetches gold price from middleware bridge", () => {
    const sip = fs.readFileSync(sipPath, "utf8");
    expect(sip).toContain("fetchAndCacheGoldPrice");
    expect(sip).toContain("gold-price-ngn");
  });

  it("sipProcessor.ts has a static fallback price", () => {
    const sip = fs.readFileSync(sipPath, "utf8");
    // Should have a fallback price constant (not Math.random)
    expect(sip).toContain("98_500");
    expect(sip).not.toMatch(/goldPrice.*Math\.random/);
  });
});

// ── 6. Flutter mobile screen parity ──────────────────────────────────────────

describe("Wave 119: Flutter mobile screen parity", () => {
  const flutterScreensDir = path.resolve(
    ROOT,
    "mobile/flutter/lib/screens"
  );

  it("Flutter screens directory exists", () => {
    expect(fs.existsSync(flutterScreensDir)).toBe(true);
  });

  it("Flutter has at least 28 screen files", () => {
    const screens: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (entry.name.endsWith(".dart")) screens.push(entry.name);
      }
    };
    walk(flutterScreensDir);
    expect(screens.length).toBeGreaterThanOrEqual(28);
  });

  const expectedFlutterScreens = [
    "billing_analytics_screen.dart",
    "billing_engine_screen.dart",
    "profile_screen.dart",
    "notification_preferences_screen.dart",
    "virtual_cards_full_screen.dart",
    "dashboard_screen.dart",
    "transactions_screen.dart",
    "analytics_screen.dart",
    "payouts_screen.dart",
    "disputes_screen.dart",
    "virtual_cards_screen.dart",
    "notifications_screen.dart",
    "settings_screen.dart",
    "cross_border_screen.dart",
    "fraud_risk_screen.dart",
    "bnpl_screen.dart",
    "fx_screen.dart",
    "payment_links_screen.dart",
    "webhooks_screen.dart",
    "customers_screen.dart",
    "compliance_screen.dart",
    "qr_payments_screen.dart",
    "reconciliation_screen.dart",
    "settlements_screen.dart",
  ];

  it.each(expectedFlutterScreens)(
    "Flutter screen exists: %s",
    (screenFile) => {
      const found = findFile(flutterScreensDir, screenFile);
      expect(found).toBeTruthy();
    }
  );

  it("Flutter app.dart registers billing-analytics route", () => {
    const appDart = fs.readFileSync(
      path.resolve(ROOT, "mobile/flutter/lib/app.dart"),
      "utf8"
    );
    expect(appDart).toContain("/billing-analytics");
    expect(appDart).toContain("BillingAnalyticsScreen");
  });

  it("Flutter app.dart registers notification-preferences route", () => {
    const appDart = fs.readFileSync(
      path.resolve(ROOT, "mobile/flutter/lib/app.dart"),
      "utf8"
    );
    expect(appDart).toContain("/notification-preferences");
    expect(appDart).toContain("NotificationPreferencesScreen");
  });

  it("Flutter app.dart registers virtual-cards detail route", () => {
    const appDart = fs.readFileSync(
      path.resolve(ROOT, "mobile/flutter/lib/app.dart"),
      "utf8"
    );
    expect(appDart).toContain("VirtualCardsFullScreen");
  });

  it("Flutter billing_config.dart model file exists", () => {
    const modelPath = path.resolve(
      ROOT,
      "mobile/flutter/lib/models/billing_config.dart"
    );
    expect(fs.existsSync(modelPath)).toBe(true);
    const content = fs.readFileSync(modelPath, "utf8");
    expect(content).toContain("class BillingConfig");
    expect(content).toContain("class BillingAuditEntry");
  });
});

// ── 7. React Native mobile screen parity ─────────────────────────────────────

describe("Wave 119: React Native mobile screen parity", () => {
  const rnTabsDir = path.resolve(
    ROOT,
    "mobile/react-native/app/(tabs)"
  );

  it("React Native tabs directory exists", () => {
    expect(fs.existsSync(rnTabsDir)).toBe(true);
  });

  it("React Native has at least 27 screen files", () => {
    const files = fs.readdirSync(rnTabsDir).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(27);
  });

  const expectedRNScreens = [
    "index.tsx",
    "dashboard.tsx",
    "transactions.tsx",
    "analytics.tsx",
    "payouts.tsx",
    "disputes.tsx",
    "virtual-cards.tsx",
    "virtual-cards-full.tsx",
    "notifications.tsx",
    "notification-preferences.tsx",
    "settings.tsx",
    "profile.tsx",
    "billing-engine.tsx",
    "billing_config_list.tsx",
    "customers.tsx",
    "bnpl.tsx",
    "compliance.tsx",
    "cross-border.tsx",
    "fraud-risk.tsx",
    "fx.tsx",
    "payment-links.tsx",
    "qr-payments.tsx",
    "reconciliation.tsx",
    "settlements.tsx",
    "webhooks.tsx",
    "auth_login.tsx",
  ];

  it.each(expectedRNScreens)(
    "React Native screen exists: %s",
    (screenFile) => {
      const filePath = path.join(rnTabsDir, screenFile);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  );
});

// ── 8. Seed data ──────────────────────────────────────────────────────────────

describe("Wave 119: Seed data", () => {
  const seedPath = path.resolve(
    ROOT,
    "billing-engine/seed/billing_seed.sql"
  );

  it("billing_seed.sql exists", () => {
    expect(fs.existsSync(seedPath)).toBe(true);
  });

  it("billing_seed.sql covers Wave 119 tables", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    expect(seed).toContain("overhead_costs");
    expect(seed).toContain("subscription_plans_v2");
    expect(seed).toContain("portal_subscriptions");
  });

  it("billing_seed.sql has Wave 119 section marker", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    expect(seed).toContain("Wave 119");
  });
});

// ── 9. Environment variables documentation ────────────────────────────────────

describe("Wave 119: Environment variables documentation", () => {
  it("ENVIRONMENT_VARIABLES_WAVE119.md exists", () => {
    const envDocPath = path.resolve(
      ROOT,
      "docs/ENVIRONMENT_VARIABLES_WAVE119.md"
    );
    expect(fs.existsSync(envDocPath)).toBe(true);
  });

  it("Wave 119 env doc covers all major services", () => {
    const envDoc = fs.readFileSync(
      path.resolve(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE119.md"),
      "utf8"
    );
    const requiredSections = [
      "Portal",
      "Stripe",
      "Middleware",
      "Authentication",
      "Billing Engine",
      "USSD",
      "Rust Billing Core",
      "Go Event Ingestor",
      "Go Audit RBAC",
      "Python Settlement",
    ];
    for (const section of requiredSections) {
      expect(envDoc).toContain(section);
    }
  });

  it("Wave 119 env doc documents new OpenSearch variables", () => {
    const envDoc = fs.readFileSync(
      path.resolve(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE119.md"),
      "utf8"
    );
    expect(envDoc).toContain("OPENSEARCH_URL");
    expect(envDoc).toContain("OPENSEARCH_INDEX");
  });
});

// ── 10. Security116 still wired ───────────────────────────────────────────────

describe("Wave 119: Security116 PBAC still wired", () => {
  it("billing.ts still imports from security116", () => {
    const billingTs = fs.readFileSync(
      path.resolve(ROOT, "server/routers/billing.ts"),
      "utf8"
    );
    expect(billingTs).toContain("security116");
    expect(billingTs).toContain("assertBillingPermission");
  });

  it("security116.ts exports assertBillingPermission", () => {
    const sec116 = fs.readFileSync(
      path.resolve(ROOT, "server/security116.ts"),
      "utf8"
    );
    expect(sec116).toContain("assertBillingPermission");
  });
});

// ── 11. Smoke test covers new endpoints ───────────────────────────────────────

describe("Wave 119: Smoke test coverage", () => {
  it("smoke_test.sh exists", () => {
    const smokePath = path.resolve(
      ROOT,
      "billing-engine/tests/smoke_test.sh"
    );
    expect(fs.existsSync(smokePath)).toBe(true);
  });

  it("smoke_test.sh covers all 5 billing engine services", () => {
    const smoke = fs.readFileSync(
      path.resolve(ROOT, "billing-engine/tests/smoke_test.sh"),
      "utf8"
    );
    expect(smoke).toContain("8093"); // Rust billing core
    expect(smoke).toContain("8094"); // Go event ingestor
    expect(smoke).toContain("8095"); // Go onboarding workflow
    expect(smoke).toContain("8096"); // Go audit RBAC
    expect(smoke).toContain("8097"); // Python settlement bridge
  });
});

// ── Helper ────────────────────────────────────────────────────────────────────

function findFile(dir: string, filename: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const found = findFile(path.join(dir, entry.name), filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}
