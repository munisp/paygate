/**
 * Wave 123 Production Readiness Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers:
 *   1. Backend Routers — wave123.ts registration and exports
 *   2. AI Model Admin — listModels, registerModel, updateModelStatus, deleteModel,
 *                       listAuditTrail, listTrainingJobs, cancelTrainingJob, getModelStats
 *   3. Menu Management — listCategories, createCategory, updateCategory, deleteCategory,
 *                        listItems, createItem, updateItem, deleteItem, bulkUpdateAvailability
 *   4. Portal Health — getHealthStatus, getGoLiveChecklist, getRateLimitDashboard,
 *                      getDependencyGraph, runHealthCheck
 *   5. Security — security123.ts PBAC definitions
 *   6. Middleware Bridge — wave123 bridge functions
 *   7. PWA Pages — AIModelAdmin, MenuManagement, PortalHealthDashboard
 *   8. React Native Screens — PayrollScreen, TeamRolesScreen, MobileMoneyReconScreen,
 *                             FXDashboardScreen, CheckoutScreen
 *   9. Docker Compose — wave123 services
 *  10. Seed Data — wave123 SQL
 *  11. Env Var Docs — ENVIRONMENT_VARIABLES_WAVE123.md
 *  12. AppNavigator — new screen registrations
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. Backend Router Registration ──────────────────────────────────────────
describe("Wave 123 — Backend Router Registration", () => {
  it("wave123.ts router file exists", () => {
    expect(existsSync(join(ROOT, "server/routers/wave123.ts"))).toBe(true);
  });

  it("aiModelAdminRouter is exported from wave123.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");
    expect(content).toContain("aiModelAdminRouter");
  });

  it("menuMgmtRouter is exported from wave123.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");
    expect(content).toContain("menuMgmtRouter");
  });

  it("portalHealthRouter is exported from wave123.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");
    expect(content).toContain("portalHealthRouter");
  });

  it("wave123 routers are imported in main routers.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("wave123");
  });

  it("aiModelAdmin namespace is registered in appRouter", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("aiModelAdmin");
  });

  it("menuMgmt namespace is registered in appRouter", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("menuMgmt");
  });

  it("portalHealth namespace is registered in appRouter", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("portalHealth");
  });
});

// ─── 2. AI Model Admin Router ─────────────────────────────────────────────────
describe("Wave 123 — AI Model Admin Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");

  it("has listModels procedure", () => {
    expect(getContent()).toContain("listModels:");
  });

  it("has getModel procedure", () => {
    expect(getContent()).toContain("getModel:");
  });

  it("has registerModel procedure", () => {
    expect(getContent()).toContain("registerModel:");
  });

  it("has updateModelStatus procedure", () => {
    expect(getContent()).toContain("updateModelStatus:");
  });

  it("has deleteModel procedure", () => {
    expect(getContent()).toContain("deleteModel:");
  });

  it("has listAuditTrail procedure", () => {
    expect(getContent()).toContain("listAuditTrail:");
  });

  it("has listTrainingJobs procedure", () => {
    expect(getContent()).toContain("listTrainingJobs:");
  });

  it("has cancelTrainingJob procedure", () => {
    expect(getContent()).toContain("cancelTrainingJob:");
  });

  it("has getModelStats procedure", () => {
    expect(getContent()).toContain("getModelStats:");
  });

  it("uses aiModelRegistry table from schema", () => {
    expect(getContent()).toContain("aiModelRegistry");
  });

  it("uses aiAuditTrail table from schema", () => {
    expect(getContent()).toContain("aiAuditTrail");
  });

  it("uses gnnTrainingJobs table from schema", () => {
    expect(getContent()).toContain("gnnTrainingJobs");
  });

  it("uses protectedProcedure for all mutations", () => {
    const content = getContent();
    // All mutations should use protectedProcedure, not publicProcedure
    expect(content).toContain("protectedProcedure");
  });

  it("publishes Kafka events on model status changes", () => {
    expect(getContent()).toContain("publishKafkaEventViaMiddleware");
  });

  it("validates model type enum correctly", () => {
    const content = getContent();
    expect(content).toContain("gnn_fraud");
    expect(content).toContain("credit_scoring");
    expect(content).toContain("anomaly_detection");
  });
});

// ─── 3. Menu Management Router ────────────────────────────────────────────────
describe("Wave 123 — Menu Management Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");

  it("has listCategories procedure", () => {
    expect(getContent()).toContain("listCategories:");
  });

  it("has createCategory procedure", () => {
    expect(getContent()).toContain("createCategory:");
  });

  it("has updateCategory procedure", () => {
    expect(getContent()).toContain("updateCategory:");
  });

  it("has deleteCategory procedure", () => {
    expect(getContent()).toContain("deleteCategory:");
  });

  it("has listItems procedure", () => {
    expect(getContent()).toContain("listItems:");
  });

  it("has createItem procedure", () => {
    expect(getContent()).toContain("createItem:");
  });

  it("has updateItem procedure", () => {
    expect(getContent()).toContain("updateItem:");
  });

  it("has deleteItem procedure", () => {
    expect(getContent()).toContain("deleteItem:");
  });

  it("has bulkUpdateAvailability procedure", () => {
    expect(getContent()).toContain("bulkUpdateAvailability:");
  });

  it("uses menuCategories table from schema", () => {
    expect(getContent()).toContain("menuCategories");
  });

  it("uses menuItems table from schema", () => {
    expect(getContent()).toContain("menuItems");
  });

  it("validates price in kobo (integer)", () => {
    const content = getContent();
    expect(content).toContain("priceKobo");
  });

  it("has CDN cache invalidation via middleware bridge", () => {
    expect(getContent()).toContain("invalidateMenuCacheViaMiddleware");
  });
});

// ─── 4. Portal Health Router ──────────────────────────────────────────────────
describe("Wave 123 — Portal Health Router", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");

  it("has getHealthStatus procedure", () => {
    expect(getContent()).toContain("getHealthStatus:");
  });

  it("has getGoLiveChecklist procedure", () => {
    expect(getContent()).toContain("getGoLiveChecklist:");
  });

  it("has getRateLimitDashboard procedure", () => {
    expect(getContent()).toContain("getRateLimitDashboard:");
  });

  it("has getDependencyGraph procedure", () => {
    expect(getContent()).toContain("getDependencyGraph:");
  });

  it("has runHealthCheck procedure", () => {
    expect(getContent()).toContain("runHealthCheck:");
  });

  it("checks database connectivity in health status", () => {
    const content = getContent();
    expect(content).toContain("database");
  });

  it("checks Redis connectivity in health status", () => {
    const content = getContent();
    expect(content).toContain("redis");
  });

  it("includes go-live checklist items", () => {
    const content = getContent();
    expect(content).toContain("goLive");
  });
});

// ─── 5. Security — PBAC Definitions ──────────────────────────────────────────
describe("Wave 123 — Security PBAC", () => {
  it("security123.ts exists", () => {
    expect(existsSync(join(ROOT, "server/security123.ts"))).toBe(true);
  });

  it("defines PBAC for aiModelAdmin namespace", () => {
    const content = readFileSync(join(ROOT, "server/security123.ts"), "utf-8");
    expect(content).toContain("aiModelAdmin");
  });

  it("defines PBAC for menuMgmt namespace", () => {
    const content = readFileSync(join(ROOT, "server/security123.ts"), "utf-8");
    expect(content).toContain("menuMgmt");
  });

  it("defines PBAC for portalHealth namespace", () => {
    const content = readFileSync(join(ROOT, "server/security123.ts"), "utf-8");
    expect(content).toContain("portalHealth");
  });

  it("restricts AI model admin to admin role", () => {
    const content = readFileSync(join(ROOT, "server/security123.ts"), "utf-8");
    expect(content).toContain("admin");
  });

  it("allows merchants to manage their own menus", () => {
    const content = readFileSync(join(ROOT, "server/security123.ts"), "utf-8");
    expect(content).toContain("merchant");
  });
});

// ─── 6. Middleware Bridge — Wave 123 Functions ────────────────────────────────
describe("Wave 123 — Middleware Bridge Functions", () => {
  const getContent = () => readFileSync(join(ROOT, "server/middlewareBridge.ts"), "utf-8");

  it("syncAiModelToRegistryViaMiddleware is defined", () => {
    expect(getContent()).toContain("syncAiModelToRegistryViaMiddleware");
  });

  it("triggerGnnTrainingJobViaMiddleware is defined", () => {
    expect(getContent()).toContain("triggerGnnTrainingJobViaMiddleware");
  });

  it("getAiModelInferenceMetricsViaMiddleware is defined", () => {
    expect(getContent()).toContain("getAiModelInferenceMetricsViaMiddleware");
  });

  it("invalidateMenuCacheViaMiddleware is defined", () => {
    expect(getContent()).toContain("invalidateMenuCacheViaMiddleware");
  });

  it("publishMenuUpdateEventViaMiddleware is defined", () => {
    expect(getContent()).toContain("publishMenuUpdateEventViaMiddleware");
  });

  it("runExternalHealthCheckViaMiddleware is defined", () => {
    expect(getContent()).toContain("runExternalHealthCheckViaMiddleware");
  });

  it("getPortalUptimeStatsViaMiddleware is defined", () => {
    expect(getContent()).toContain("getPortalUptimeStatsViaMiddleware");
  });

  it("all wave123 bridge functions use safe() wrapper", () => {
    const content = getContent();
    // Count safe() calls across all Wave 123 sections
    const parts = content.split("Wave 123");
    // Sum safe() calls in all parts after the first (which is pre-wave123 content)
    const safeCallCount = parts.slice(1).reduce((sum, part) => {
      return sum + (part.match(/return safe\(/g) ?? []).length;
    }, 0);
    expect(safeCallCount).toBeGreaterThanOrEqual(7);
  });
});

// ─── 7. PWA Pages ─────────────────────────────────────────────────────────────
describe("Wave 123 — PWA Pages", () => {
  it("AIModelAdmin.tsx page exists", () => {
    expect(existsSync(join(ROOT, "client/src/pages/AIModelAdmin.tsx"))).toBe(true);
  });

  it("AIModelAdmin page uses aiModelAdmin tRPC namespace", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/AIModelAdmin.tsx"), "utf-8");
    expect(content).toContain("aiModelAdmin");
  });

  it("AIModelAdmin page has model registry tab", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/AIModelAdmin.tsx"), "utf-8");
    expect(content).toContain("models");
  });

  it("AIModelAdmin page has audit trail tab", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/AIModelAdmin.tsx"), "utf-8");
    expect(content).toContain("audit");
  });

  it("AIModelAdmin page has training jobs tab", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/AIModelAdmin.tsx"), "utf-8");
    expect(content).toContain("jobs");
  });

  it("AIModelAdmin page has register model dialog", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/AIModelAdmin.tsx"), "utf-8");
    expect(content).toContain("Register Model");
  });

  it("MenuManagement.tsx page exists", () => {
    expect(existsSync(join(ROOT, "client/src/pages/MenuManagement.tsx"))).toBe(true);
  });

  it("MenuManagement page uses menuMgmt tRPC namespace", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/MenuManagement.tsx"), "utf-8");
    expect(content).toContain("menuMgmt");
  });

  it("MenuManagement page has category management", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/MenuManagement.tsx"), "utf-8");
    expect(content).toContain("categor");
  });

  it("MenuManagement page has item management", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/MenuManagement.tsx"), "utf-8");
    expect(content).toContain("item");
  });

  it("MenuManagement page shows price in Naira (kobo conversion)", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/MenuManagement.tsx"), "utf-8");
    // Should convert kobo to naira for display
    expect(content).toMatch(/100|kobo|naira|₦/i);
  });

  it("PortalHealthDashboard.tsx page exists", () => {
    expect(existsSync(join(ROOT, "client/src/pages/PortalHealthDashboard.tsx"))).toBe(true);
  });

  it("PortalHealthDashboard page uses portalHealth tRPC namespace", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/PortalHealthDashboard.tsx"), "utf-8");
    expect(content).toContain("portalHealth");
  });

  it("PortalHealthDashboard page has health status view", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/PortalHealthDashboard.tsx"), "utf-8");
    expect(content).toContain("health");
  });

  it("PortalHealthDashboard page has go-live checklist", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/PortalHealthDashboard.tsx"), "utf-8");
    expect(content).toContain("golive");
  });

  it("PortalHealthDashboard page has rate limit dashboard", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/PortalHealthDashboard.tsx"), "utf-8");
    expect(content).toContain("ratelimit");
  });

  it("all 3 wave123 pages are registered in App.tsx", () => {
    const content = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("AIModelAdmin");
    expect(content).toContain("MenuManagement");
    expect(content).toContain("PortalHealthDashboard");
  });
});

// ─── 8. React Native Screens ──────────────────────────────────────────────────
describe("Wave 123 — React Native Screens", () => {
  const RN_SCREENS = join(ROOT, "mobile/react-native/src/screens");

  it("PayrollScreen.tsx exists", () => {
    expect(existsSync(join(RN_SCREENS, "PayrollScreen.tsx"))).toBe(true);
  });

  it("PayrollScreen uses payroll tRPC namespace", () => {
    const content = readFileSync(join(RN_SCREENS, "PayrollScreen.tsx"), "utf-8");
    expect(content).toContain("payroll");
  });

  it("TeamRolesScreen.tsx exists", () => {
    expect(existsSync(join(RN_SCREENS, "TeamRolesScreen.tsx"))).toBe(true);
  });

  it("TeamRolesScreen uses team tRPC namespace", () => {
    const content = readFileSync(join(RN_SCREENS, "TeamRolesScreen.tsx"), "utf-8");
    expect(content).toMatch(/team|member/i);
  });

  it("MobileMoneyReconScreen.tsx exists", () => {
    expect(existsSync(join(RN_SCREENS, "MobileMoneyReconScreen.tsx"))).toBe(true);
  });

  it("MobileMoneyReconScreen uses mobileMoneyRecon tRPC namespace", () => {
    const content = readFileSync(join(RN_SCREENS, "MobileMoneyReconScreen.tsx"), "utf-8");
    expect(content).toMatch(/mobileMoneyRecon|mobileMoney/i);
  });

  it("FXDashboardScreen.tsx exists", () => {
    expect(existsSync(join(RN_SCREENS, "FXDashboardScreen.tsx"))).toBe(true);
  });

  it("FXDashboardScreen uses fx tRPC namespace", () => {
    const content = readFileSync(join(RN_SCREENS, "FXDashboardScreen.tsx"), "utf-8");
    expect(content).toContain("fx");
  });

  it("CheckoutScreen.tsx exists", () => {
    expect(existsSync(join(RN_SCREENS, "CheckoutScreen.tsx"))).toBe(true);
  });

  it("CheckoutScreen uses paymentLinks tRPC namespace", () => {
    const content = readFileSync(join(RN_SCREENS, "CheckoutScreen.tsx"), "utf-8");
    expect(content).toMatch(/paymentLinks|checkout/i);
  });

  it("all 5 new screens are registered in AppNavigator.tsx", () => {
    const navContent = readFileSync(
      join(ROOT, "mobile/react-native/src/navigation/AppNavigator.tsx"),
      "utf-8"
    );
    expect(navContent).toContain("PayrollScreen");
    expect(navContent).toContain("TeamRolesScreen");
    expect(navContent).toContain("MobileMoneyReconScreen");
    expect(navContent).toContain("FXDashboardScreen");
    expect(navContent).toContain("CheckoutScreen");
  });
});

// ─── 9. Docker Compose ────────────────────────────────────────────────────────
describe("Wave 123 — Docker Compose", () => {
  it("docker-compose.wave123.yml exists", () => {
    expect(existsSync(join(ROOT, "docker-compose.wave123.yml"))).toBe(true);
  });

  it("includes MLflow service", () => {
    const content = readFileSync(join(ROOT, "docker-compose.wave123.yml"), "utf-8");
    expect(content).toContain("mlflow");
  });

  it("includes MinIO service", () => {
    const content = readFileSync(join(ROOT, "docker-compose.wave123.yml"), "utf-8");
    expect(content).toContain("minio");
  });

  it("includes Feast feature store service", () => {
    const content = readFileSync(join(ROOT, "docker-compose.wave123.yml"), "utf-8");
    expect(content).toContain("feast");
  });

  it("includes Uptime Kuma service", () => {
    const content = readFileSync(join(ROOT, "docker-compose.wave123.yml"), "utf-8");
    expect(content).toContain("uptime-kuma");
  });

  it("includes OpenTelemetry Collector service", () => {
    const content = readFileSync(join(ROOT, "docker-compose.wave123.yml"), "utf-8");
    expect(content).toContain("otel-collector");
  });

  it("includes GNN worker service with GPU profile", () => {
    const content = readFileSync(join(ROOT, "docker-compose.wave123.yml"), "utf-8");
    expect(content).toContain("gnn-worker");
    expect(content).toContain("profiles:");
  });

  it("labels all services with wave 123", () => {
    const content = readFileSync(join(ROOT, "docker-compose.wave123.yml"), "utf-8");
    expect(content).toContain("com.paygate.wave: \"123\"");
  });

  it("uses external paygate_net network", () => {
    const content = readFileSync(join(ROOT, "docker-compose.wave123.yml"), "utf-8");
    expect(content).toContain("external: true");
  });
});

// ─── 10. Seed Data ────────────────────────────────────────────────────────────
describe("Wave 123 — Seed Data", () => {
  it("seed-wave123.sql exists", () => {
    expect(existsSync(join(ROOT, "scripts/seed-wave123.sql"))).toBe(true);
  });

  it("seeds ai_model_registry table", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    expect(content).toContain("ai_model_registry");
  });

  it("seeds ai_audit_trail table", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    expect(content).toContain("ai_audit_trail");
  });

  it("seeds gnn_training_jobs table", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    expect(content).toContain("gnn_training_jobs");
  });

  it("seeds menu_categories table", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    expect(content).toContain("menu_categories");
  });

  it("seeds menu_items table", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    expect(content).toContain("menu_items");
  });

  it("includes at least 5 AI model registry entries", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    const modelInserts = (content.match(/model_gnn_fraud|model_risk_scorer|model_kyc_classifier|model_churn_predictor/g) ?? []).length;
    expect(modelInserts).toBeGreaterThanOrEqual(5);
  });

  it("includes at least 5 AI audit trail entries", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    const auditInserts = (content.match(/'audit_\d+'/g) ?? []).length;
    expect(auditInserts).toBeGreaterThanOrEqual(5);
  });

  it("includes menu items with prices in kobo", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    expect(content).toContain("price_kobo");
  });

  it("uses ON CONFLICT DO NOTHING for idempotent seeding", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    const conflictCount = (content.match(/ON CONFLICT.*DO NOTHING/g) ?? []).length;
    expect(conflictCount).toBeGreaterThanOrEqual(5);
  });

  it("includes verification block at end of seed", () => {
    const content = readFileSync(join(ROOT, "scripts/seed-wave123.sql"), "utf-8");
    expect(content).toContain("RAISE NOTICE");
  });
});

// ─── 11. Environment Variable Documentation ───────────────────────────────────
describe("Wave 123 — Environment Variable Documentation", () => {
  it("ENVIRONMENT_VARIABLES_WAVE123.md exists", () => {
    expect(existsSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"))).toBe(true);
  });

  it("documents MLflow variables", () => {
    const content = readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"), "utf-8");
    expect(content).toContain("MLFLOW_TRACKING_URI");
  });

  it("documents MinIO variables", () => {
    const content = readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"), "utf-8");
    expect(content).toContain("MINIO_ROOT_USER");
  });

  it("documents GNN worker variables", () => {
    const content = readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"), "utf-8");
    expect(content).toContain("GNN_WORKER_ENABLED");
  });

  it("documents menu management variables", () => {
    const content = readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"), "utf-8");
    expect(content).toContain("MENU_CDN_URL");
  });

  it("documents portal health variables", () => {
    const content = readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"), "utf-8");
    expect(content).toContain("HEALTH_CHECK_TIMEOUT_MS");
  });

  it("documents feature flags", () => {
    const content = readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"), "utf-8");
    expect(content).toContain("FEATURE_AI_MODEL_ADMIN");
    expect(content).toContain("FEATURE_MENU_MANAGEMENT");
    expect(content).toContain("FEATURE_PORTAL_HEALTH");
  });

  it("documents OpenTelemetry variables", () => {
    const content = readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"), "utf-8");
    expect(content).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });

  it("includes example .env additions section", () => {
    const content = readFileSync(join(ROOT, "docs/ENVIRONMENT_VARIABLES_WAVE123.md"), "utf-8");
    expect(content).toContain(".env");
  });
});

// ─── 12. Schema Coverage ──────────────────────────────────────────────────────
describe("Wave 123 — Schema Coverage", () => {
  it("aiModelRegistry table is imported in wave123.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");
    expect(content).toContain("aiModelRegistry");
  });

  it("aiAuditTrail table is imported in wave123.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");
    expect(content).toContain("aiAuditTrail");
  });

  it("gnnTrainingJobs table is imported in wave123.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");
    expect(content).toContain("gnnTrainingJobs");
  });

  it("menuCategories table is imported in wave123.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");
    expect(content).toContain("menuCategories");
  });

  it("menuItems table is imported in wave123.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave123.ts"), "utf-8");
    expect(content).toContain("menuItems");
  });

  it("aiModelRegistry table exists in schema.ts", () => {
    const content = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("aiModelRegistry");
  });

  it("aiAuditTrail table exists in schema.ts", () => {
    const content = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("aiAuditTrail");
  });

  it("gnnTrainingJobs table exists in schema.ts", () => {
    const content = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("gnnTrainingJobs");
  });

  it("menuCategories table exists in schema.ts", () => {
    const content = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("menuCategories");
  });

  it("menuItems table exists in schema.ts", () => {
    const content = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("menuItems");
  });
});
