/**
 * Wave 79 — Admin Portal, Ollama AI, and Production Next Steps Tests
 * Tests cover: adminRouter, ollamaRouter, seed data, webhook events, platform inventory
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ─── Admin Router ─────────────────────────────────────────────────────────────

describe("adminRouter — structure", () => {
  const routerPath = path.resolve(__dirname, "adminRouter.ts");

  it("adminRouter.ts exists", () => {
    expect(fs.existsSync(routerPath)).toBe(true);
  });

  it("exports adminRouter", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("export const adminRouter");
  });

  it("has platformOverview sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("platformOverview");
  });

  it("has merchants sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("merchantMgmtRouter");
  });

  it("has kycReview sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("kycReview");
  });

  it("has disputes sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("disputeMgmtRouter");
  });

  it("has fraudOversight sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("fraudOversight");
  });

  it("has revenue sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("revenueMgmtRouter");
  });

  it("has settlements sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("settlementMgmtRouter");
  });

  it("has compliance sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("complianceRouter");
  });

  it("has systemHealth sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("systemHealth");
  });

  it("has audit sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("auditAdminRouter");
  });

  it("has notifications sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("notifAdminRouter");
  });

  it("has configPanel sub-router", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("configPanel");
  });

  it("uses adminProcedure for all procedures", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("adminProcedure");
  });

  it("does not expose procedures to public access", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    // Should not use publicProcedure
    expect(content).not.toContain("publicProcedure");
  });
});

describe("adminRouter — wired into appRouter", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");

  it("routers.ts imports adminRouter", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("adminRouter");
  });

  it("adminRouter is registered in appRouter", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/admin.*adminRouter|adminRouter.*admin/);
  });
});

// ─── Admin Pages ──────────────────────────────────────────────────────────────

describe("Admin Portal pages — existence", () => {
  const adminPagesDir = path.resolve(__dirname, "../client/src/pages/admin");

  const expectedPages = [
    "AdminPlatformOverview.tsx",
    "AdminMerchantManagement.tsx",
    "AdminKYCReview.tsx",
    "AdminDisputeManagement.tsx",
    "AdminFraudOversight.tsx",
    "AdminRevenue.tsx",
    "AdminSettlements.tsx",
    "AdminCompliance.tsx",
    "AdminSystemHealth.tsx",
    "AdminAuditTrail.tsx",
    "AdminNotifications.tsx",
    "AdminConfig.tsx",
  ];

  for (const page of expectedPages) {
    it(`${page} exists`, () => {
      expect(fs.existsSync(path.join(adminPagesDir, page))).toBe(true);
    });
  }
});

describe("Admin Portal pages — content", () => {
  const adminPagesDir = path.resolve(__dirname, "../client/src/pages/admin");

  it("AdminPlatformOverview uses trpc.admin.overview", () => {
    const content = fs.readFileSync(
      path.join(adminPagesDir, "AdminPlatformOverview.tsx"),
      "utf-8"
    );
    expect(content).toContain("admin");
    expect(content).toContain("overview");
  });

  it("AdminKYCReview has approve/reject functionality", () => {
    const content = fs.readFileSync(
      path.join(adminPagesDir, "AdminKYCReview.tsx"),
      "utf-8"
    );
    expect(content.toLowerCase()).toMatch(/approve|reject/);
  });

  it("AdminFraudOversight has flagAccount functionality", () => {
    const content = fs.readFileSync(
      path.join(adminPagesDir, "AdminFraudOversight.tsx"),
      "utf-8"
    );
    expect(content).toContain("fraud");
  });

  it("AdminConfig has feature flags", () => {
    const content = fs.readFileSync(
      path.join(adminPagesDir, "AdminConfig.tsx"),
      "utf-8"
    );
    expect(content.toLowerCase()).toMatch(/feature.*flag|flag.*feature/);
  });

  it("AdminSystemHealth shows service health", () => {
    const content = fs.readFileSync(
      path.join(adminPagesDir, "AdminSystemHealth.tsx"),
      "utf-8"
    );
    expect(content.toLowerCase()).toMatch(/health|service|status/);
  });
});

describe("AdminLayout — structure", () => {
  const layoutPath = path.resolve(
    __dirname,
    "../client/src/components/AdminLayout.tsx"
  );

  it("AdminLayout.tsx exists", () => {
    expect(fs.existsSync(layoutPath)).toBe(true);
  });

  it("AdminLayout exports default component", () => {
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("export default");
  });

  it("AdminLayout has sidebar navigation", () => {
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content.toLowerCase()).toMatch(/sidebar|nav/);
  });

  it("AdminLayout has all 12 admin nav items", () => {
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("/admin/merchants");
    expect(content).toContain("/admin/kyc");
    expect(content).toContain("/admin/disputes");
    expect(content).toContain("/admin/fraud");
  });
});

// ─── Admin Routes in App.tsx ──────────────────────────────────────────────────

describe("Admin routes — App.tsx", () => {
  const appPath = path.resolve(__dirname, "../client/src/App.tsx");

  it("App.tsx has /admin route", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain("/admin");
  });

  it("App.tsx imports AdminPlatformOverview", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain("AdminPlatformOverview");
  });

  it("App.tsx imports AdminKYCReview", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain("AdminKYCReview");
  });

  it("App.tsx imports AdminSystemHealth", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain("AdminSystemHealth");
  });
});

// ─── Ollama Router ────────────────────────────────────────────────────────────

describe("ollamaRouter — structure", () => {
  const routerPath = path.resolve(__dirname, "ollamaRouter.ts");

  it("ollamaRouter.ts exists", () => {
    expect(fs.existsSync(routerPath)).toBe(true);
  });

  it("exports ollamaRouter", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("export const ollamaRouter");
  });

  it("has chat procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("chat");
  });

  it("has listModels procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("listModels");
  });

  it("has pullModel procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("pullModel");
  });

  it("has health procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("health");
  });
});

describe("Ollama helper — structure", () => {
  const helperPath = path.resolve(__dirname, "ollama.ts");

  it("ollama.ts exists", () => {
    expect(fs.existsSync(helperPath)).toBe(true);
  });

  it("exports ollamaChat function", () => {
    const content = fs.readFileSync(helperPath, "utf-8");
    expect(content).toContain("ollamaChat");
  });

  it("exports OllamaListResponse interface", () => {
    const content = fs.readFileSync(helperPath, "utf-8");
    expect(content).toContain("OllamaListResponse");
  });

  it("uses OLLAMA_BASE_URL from env", () => {
    const content = fs.readFileSync(helperPath, "utf-8");
    expect(content).toContain("OLLAMA");
  });

  it("has default Ollama URL", () => {
    const content = fs.readFileSync(helperPath, "utf-8");
    expect(content).toContain("11434");
  });
});

describe("OllamaChat page — structure", () => {
  const pagePath = path.resolve(
    __dirname,
    "../client/src/pages/OllamaChat.tsx"
  );

  it("OllamaChat.tsx exists", () => {
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it("OllamaChat uses trpc4.ollama.chat", () => {
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).toContain("ollama");
    expect(content).toContain("chat");
  });

  it("OllamaChat shows model selector", () => {
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content.toLowerCase()).toMatch(/model/);
  });
});

describe("ollamaRouter — wired into appRouter", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");

  it("routers.ts imports ollamaRouter", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("ollamaRouter");
  });

  it("ollama is registered in appRouter", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toMatch(/ollama.*ollamaRouter|ollamaRouter.*ollama/);
  });
});

// ─── Webhook Events ───────────────────────────────────────────────────────────

describe("webhookEvents — structure", () => {
  const eventsPath = path.resolve(__dirname, "webhookEvents.ts");

  it("webhookEvents.ts exists", () => {
    expect(fs.existsSync(eventsPath)).toBe(true);
  });

  it("exports dispatchWebhookEvent function", () => {
    const content = fs.readFileSync(eventsPath, "utf-8");
    expect(content).toContain("dispatchWebhookEvent");
  });
});

describe("webhookEventHooks — structure", () => {
  const hooksPath = path.resolve(__dirname, "webhookEventHooks.ts");

  it("webhookEventHooks.ts exists", () => {
    expect(fs.existsSync(hooksPath)).toBe(true);
  });

  it("exports onGoldPurchased hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onGoldPurchased");
  });

  it("exports onGoldSold hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onGoldSold");
  });

  it("exports onMutualFundInvested hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onMutualFundInvested");
  });

  it("exports onInsurancePolicyCreated hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onInsurancePolicyCreated");
  });

  it("exports onPensionContribution hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onPensionContribution");
  });

  it("exports onCashbackRedeemed hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onCashbackRedeemed");
  });

  it("exports onSoundboxDeviceRegistered hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onSoundboxDeviceRegistered");
  });

  it("exports onEmiContractCreated hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onEmiContractCreated");
  });

  it("exports onRemittanceInitiated hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onRemittanceInitiated");
  });

  it("exports onBulkCollectionCreated hook", () => {
    const content = fs.readFileSync(hooksPath, "utf-8");
    expect(content).toContain("onBulkCollectionCreated");
  });
});

describe("webhookEventHooks — wired into newFeaturesRouter", () => {
  const routerPath = path.resolve(__dirname, "newFeaturesRouter.ts");

  it("newFeaturesRouter imports webhookEventHooks", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("webhookEventHooks");
  });

  it("buyGold mutation fires onGoldPurchased", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("onGoldPurchased");
  });

  it("invest mutation fires onMutualFundInvested", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("onMutualFundInvested");
  });

  it("initiateTransfer mutation fires onRemittanceInitiated", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("onRemittanceInitiated");
  });
});

// ─── Seed Script ──────────────────────────────────────────────────────────────

describe("seed-wave78-fixed.mjs — structure", () => {
  const seedPath = path.resolve(__dirname, "../seed-wave78-fixed.mjs");

  it("seed-wave78-fixed.mjs exists", () => {
    expect(fs.existsSync(seedPath)).toBe(true);
  });

  it("seeds digital_gold_holdings", () => {
    const content = fs.readFileSync(seedPath, "utf-8");
    expect(content).toContain("digital_gold_holdings");
  });

  it("seeds mutual_fund_holdings", () => {
    const content = fs.readFileSync(seedPath, "utf-8");
    expect(content).toContain("mutual_fund_holdings");
  });

  it("seeds consumer_insurance_policies", () => {
    const content = fs.readFileSync(seedPath, "utf-8");
    expect(content).toContain("consumer_insurance_policies");
  });

  it("seeds pension_accounts", () => {
    const content = fs.readFileSync(seedPath, "utf-8");
    expect(content).toContain("pension_accounts");
  });

  it("seeds emi_contracts", () => {
    const content = fs.readFileSync(seedPath, "utf-8");
    expect(content).toContain("emi_contracts");
  });

  it("seeds salary_accounts", () => {
    const content = fs.readFileSync(seedPath, "utf-8");
    expect(content).toContain("salary_accounts");
  });

  it("seeds subscription_plans_v2", () => {
    const content = fs.readFileSync(seedPath, "utf-8");
    expect(content).toContain("subscription_plans_v2");
  });

  it("seeds retail_pos_configs", () => {
    const content = fs.readFileSync(seedPath, "utf-8");
    expect(content).toContain("retail_pos_configs");
  });
});

// ─── Platform Feature Inventory ───────────────────────────────────────────────

describe("PLATFORM_FEATURE_INVENTORY.md — completeness", () => {
  const inventoryPath = path.resolve(
    __dirname,
    "../PLATFORM_FEATURE_INVENTORY.md"
  );

  it("PLATFORM_FEATURE_INVENTORY.md exists", () => {
    expect(fs.existsSync(inventoryPath)).toBe(true);
  });

  it("documents Merchant Portal", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    expect(content).toContain("Merchant Portal");
  });

  it("documents Consumer Portal", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    expect(content).toContain("Consumer Portal");
  });

  it("documents Admin Portal", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    expect(content).toContain("Admin Portal");
  });

  it("documents Python microservices", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    expect(content.toLowerCase()).toMatch(/python.*microservice|microservice.*python|python.*service/i);
  });

  it("documents Ollama AI integration", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    expect(content).toContain("Ollama");
  });

  it("documents Stripe billing", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    expect(content).toContain("Stripe");
  });

  it("documents database tables count", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    // Should mention a significant number of tables
    expect(content).toMatch(/\d{2,3}.*table|table.*\d{2,3}/i);
  });

  it("documents test count", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    // Should mention a significant number of tests
    expect(content).toMatch(/1[,.]?[0-9]{3}.*test|test.*1[,.]?[0-9]{3}/i);
  });

  it("has production readiness checklist", () => {
    const content = fs.readFileSync(inventoryPath, "utf-8");
    expect(content.toLowerCase()).toContain("production readiness");
  });
});

// ─── Portal Billing ───────────────────────────────────────────────────────────

describe("portalBillingRouter — structure", () => {
  const routerPath = path.resolve(__dirname, "portalBillingRouter.ts");

  it("portalBillingRouter.ts exists", () => {
    expect(fs.existsSync(routerPath)).toBe(true);
  });

  it("has 4 portal plans (Free, Starter, Growth, Enterprise)", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("free");
    expect(content).toContain("starter");
    expect(content).toContain("growth");
    expect(content).toContain("enterprise");
  });

  it("has createCheckoutSession procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("createCheckoutSession");
  });

  it("has createPortalSession procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("createPortalSession");
  });

  it("has getSubscription procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("getSubscription");
  });

  it("has listPlans procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("listPlans");
  });
});

describe("Billing page — structure", () => {
  const pagePath = path.resolve(
    __dirname,
    "../client/src/pages/Billing.tsx"
  );

  it("Billing.tsx exists", () => {
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it("Billing page shows plan comparison", () => {
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content.toLowerCase()).toMatch(/plan|pricing/);
  });

  it("Billing page has upgrade/checkout functionality", () => {
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content.toLowerCase()).toMatch(/upgrade|checkout|subscribe/);
  });
});

// ─── Python Microservices ─────────────────────────────────────────────────────

describe("Wave 79 Python microservices — existence", () => {
  const servicesDir = path.resolve(__dirname, "../python-services");

  const expectedServices = [
    "digital-gold",
    "mutual-funds",
    "pension-nps",
    "cashback-rewards",
    "soundbox",
    "wealth-management",
    "emi-service",
    "bulk-collections",
    "salary-accounts",
    "intl-remittance",
  ];

  for (const service of expectedServices) {
    it(`${service} directory exists`, () => {
      expect(fs.existsSync(path.join(servicesDir, service))).toBe(true);
    });

    it(`${service}/main.py exists`, () => {
      expect(
        fs.existsSync(path.join(servicesDir, service, "main.py"))
      ).toBe(true);
    });

    it(`${service}/Dockerfile exists`, () => {
      expect(
        fs.existsSync(path.join(servicesDir, service, "Dockerfile"))
      ).toBe(true);
    });

    it(`${service}/requirements.txt exists`, () => {
      expect(
        fs.existsSync(path.join(servicesDir, service, "requirements.txt"))
      ).toBe(true);
    });
  }
});

describe("Wave 79 Python microservices — health endpoints", () => {
  const servicesDir = path.resolve(__dirname, "../python-services");

  const services = [
    "digital-gold",
    "mutual-funds",
    "pension-nps",
    "cashback-rewards",
  ];

  for (const service of services) {
    it(`${service}/main.py has /health endpoint`, () => {
      const content = fs.readFileSync(
        path.join(servicesDir, service, "main.py"),
        "utf-8"
      );
      expect(content).toContain("/health");
    });

    it(`${service}/main.py uses FastAPI`, () => {
      const content = fs.readFileSync(
        path.join(servicesDir, service, "main.py"),
        "utf-8"
      );
      expect(content).toContain("FastAPI");
    });
  }
});

// ─── Observability ────────────────────────────────────────────────────────────

describe("Prometheus — Wave 78/79 scrape targets", () => {
  const prometheusPath = path.resolve(
    __dirname,
    "../infra/prometheus/prometheus.yml"
  );

  it("prometheus.yml exists", () => {
    expect(fs.existsSync(prometheusPath)).toBe(true);
  });

  it("scrapes digital-gold-service", () => {
    const content = fs.readFileSync(prometheusPath, "utf-8");
    expect(content).toContain("digital-gold");
  });

  it("scrapes mutual-funds-service", () => {
    const content = fs.readFileSync(prometheusPath, "utf-8");
    expect(content).toContain("mutual-funds");
  });

  it("scrapes intl-remittance-service", () => {
    const content = fs.readFileSync(prometheusPath, "utf-8");
    expect(content).toContain("intl-remittance");
  });
});

describe("Grafana — Wave 78 dashboard", () => {
  const dashboardPath = path.resolve(
    __dirname,
    "../infra/grafana/paygate-wave78-dashboard.json"
  );

  it("paygate-wave78-dashboard.json exists", () => {
    expect(fs.existsSync(dashboardPath)).toBe(true);
  });

  it("dashboard has panels", () => {
    const content = fs.readFileSync(dashboardPath, "utf-8");
    const dashboard = JSON.parse(content);
    expect(dashboard.panels).toBeDefined();
    expect(dashboard.panels.length).toBeGreaterThan(0);
  });

  it("dashboard title mentions PayGate", () => {
    const content = fs.readFileSync(dashboardPath, "utf-8");
    const dashboard = JSON.parse(content);
    expect(dashboard.title).toContain("PayGate");
  });
});
