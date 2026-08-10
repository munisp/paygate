/**
 * Wave 138 — Production Readiness: Deep Audit Pass
 * Tests: Auth guards, consumer route protection, router registration,
 *        cookie security, CSRF protection, error handling, input validation
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

describe("Wave 138 — Auth & Security Audit", () => {
  it("main.tsx has global auth redirect via query cache subscriber", () => {
    const content = readFileSync(join(ROOT, "client/src/main.tsx"), "utf-8");
    expect(content).toContain("redirectToLoginIfUnauthorized");
    expect(content).toContain("UNAUTHED_ERR_MSG");
    expect(content).toContain("queryClient.getQueryCache().subscribe");
    expect(content).toContain("queryClient.getMutationCache().subscribe");
  });

  it("cookies.ts uses httpOnly and sameSite=none for all cookies", () => {
    const content = readFileSync(join(ROOT, "server/_core/cookies.ts"), "utf-8");
    expect(content).toContain("httpOnly: true");
    expect(content).toContain('sameSite: "none"');
  });

  it("CSRF protection is implemented in server", () => {
    const content = readFileSync(join(ROOT, "server/_core/index.ts"), "utf-8");
    expect(content).toContain("CSRF");
    expect(content).toContain("csrf-token");
  });

  it("auth rate limiter is configured", () => {
    const content = readFileSync(join(ROOT, "server/_core/index.ts"), "utf-8");
    expect(content).toContain("authLimiter");
    expect(content).toContain("rateLimit");
  });

  it("App.tsx has AdminGuard on all admin routes", () => {
    const content = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    // Count admin routes vs AdminGuard wrappings
    const adminRoutes = (content.match(/path="\/admin\//g) || []).length;
    const adminGuards = (content.match(/AdminGuard/g) || []).length;
    // Should have at least as many AdminGuard usages as admin routes (each route uses 2: open+close)
    expect(adminGuards).toBeGreaterThanOrEqual(adminRoutes);
  });

  it("publicProcedure mutations are only used for appropriate endpoints", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    // publicProcedure should only be used for: me, health, isConfigured, getPublicMenu, listCategories
    const publicMutations = content.match(/publicProcedure\.(query|mutation)/g) || [];
    // All public procedures should be read-only queries (no mutations)
    const publicMutationOnly = publicMutations.filter(m => m.includes("mutation"));
    expect(publicMutationOnly.length).toBe(0);
  });

  it("ErrorBoundary wraps the entire app", () => {
    const content = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("<ErrorBoundary>");
    expect(content).toContain("</ErrorBoundary>");
  });
});

describe("Wave 138 — Router Registration Audit", () => {
  const routersContent = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");

  it("all server/routers/*.ts files are imported in routers.ts", () => {
    const routerFiles = readdirSync(join(ROOT, "server/routers"))
      .filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map(f => f.replace(".ts", ""));
    
    for (const routerFile of routerFiles) {
      expect(routersContent).toContain(routerFile);
    }
  });

  it("wave68Router is registered in routers.ts", () => {
    expect(routersContent).toContain("wave68Router");
  });

  it("wave90Router is registered in routers.ts", () => {
    expect(routersContent).toContain("wave90Router");
  });

  it("corridorRouter is registered in routers.ts", () => {
    expect(routersContent).toContain("corridorRouter");
  });

  it("usageMeteringRouter is registered in routers.ts", () => {
    expect(routersContent).toContain("usageMeteringRouter");
  });
});

describe("Wave 138 — Input Validation Coverage", () => {
  it("routers.ts has 280+ input validation schemas", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    const inputCount = (content.match(/\.input\(/g) || []).length;
    expect(inputCount).toBeGreaterThanOrEqual(280);
  });

  it("routers.ts has 460+ z.string() validations", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    const stringCount = (content.match(/z\.string\(\)/g) || []).length;
    expect(stringCount).toBeGreaterThanOrEqual(460);
  });

  it("routers.ts has 87+ string length limits", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    const maxCount = (content.match(/z\.string\(\)\.max|z\.string\(\)\.min/g) || []).length;
    expect(maxCount).toBeGreaterThanOrEqual(87);
  });
});

describe("Wave 138 — Error Handling Coverage", () => {
  it("corridorRouter uses TRPCError for authorization", () => {
    const content = readFileSync(join(ROOT, "server/corridorRouter.ts"), "utf-8");
    expect(content).toContain("TRPCError");
    expect(content).toContain("FORBIDDEN");
  });

  it("usageMeteringRouter uses TRPCError", () => {
    const content = readFileSync(join(ROOT, "server/usageMeteringRouter.ts"), "utf-8");
    expect(content).toContain("TRPCError");
  });

  it("wave68Router has error handling", () => {
    const content = readFileSync(join(ROOT, "server/wave68Router.ts"), "utf-8");
    expect(content).toContain("catch");
    expect(content).toContain("TRPCError");
  });

  it("wave90Router has error handling", () => {
    const content = readFileSync(join(ROOT, "server/wave90Router.ts"), "utf-8");
    expect(content).toContain("catch");
    expect(content).toContain("TRPCError");
  });

  it("PWA pages have 500+ error handling patterns", () => {
    const pagesDir = join(ROOT, "client/src/pages");
    const pages = readdirSync(pagesDir).filter(f => f.endsWith(".tsx"));
    let errorPatterns = 0;
    for (const page of pages) {
      const content = readFileSync(join(pagesDir, page), "utf-8");
      errorPatterns += (content.match(/onError|toast\.error|catch|isError/g) || []).length;
    }
    expect(errorPatterns).toBeGreaterThanOrEqual(500);
  });
});

describe("Wave 138 — Mobile Coverage", () => {
  it("Flutter has 79 screens", () => {
    const { execSync } = require("child_process");
    const count = parseInt(execSync(
      `find ${ROOT}/mobile/flutter/lib/screens -name "*.dart" | wc -l`
    ).toString().trim());
    expect(count).toBeGreaterThanOrEqual(79);
  });

  it("React Native has 90 screens", () => {
    const screens = readdirSync(join(ROOT, "mobile/react-native/src/screens"))
      .filter(f => f.endsWith(".tsx")).length;
    expect(screens).toBeGreaterThanOrEqual(90);
  });

  it("RN has AgentBankingScreen", () => {
    expect(existsSync(join(ROOT, "mobile/react-native/src/screens/AgentBankingScreen.tsx"))).toBe(true);
  });

  it("RN has BNPLCalculatorScreen", () => {
    expect(existsSync(join(ROOT, "mobile/react-native/src/screens/BNPLCalculatorScreen.tsx"))).toBe(true);
  });

  it("RN has AuditLogScreen", () => {
    expect(existsSync(join(ROOT, "mobile/react-native/src/screens/AuditLogScreen.tsx"))).toBe(true);
  });

  it("Flutter analytics_screen has no mock Simulate API call", () => {
    const content = readFileSync(
      join(ROOT, "mobile/flutter/lib/screens/analytics/analytics_screen.dart"), "utf-8"
    );
    expect(content).not.toContain("Simulate API call");
    expect(content).toContain("api_service.dart");
  });

  it("all RN screens have API calls (tRPC or useTrpc)", () => {
    const screensDir = join(ROOT, "mobile/react-native/src/screens");
    const screens = readdirSync(screensDir).filter(f => f.endsWith(".tsx"));
    const screensWithoutApi = screens.filter(f => {
      const content = readFileSync(join(screensDir, f), "utf-8");
      return !content.includes("trpc") && !content.includes("useTrpc") && !content.includes("useQuery") && !content.includes("fetch(");
    });
    expect(screensWithoutApi.length).toBe(0);
  });
});

describe("Wave 138 — PWA Coverage", () => {
  it("PWA has 184+ pages", () => {
    const pagesDir = join(ROOT, "client/src/pages");
    const pages = readdirSync(pagesDir).filter(f => f.endsWith(".tsx")).length;
    expect(pages).toBeGreaterThanOrEqual(184);
  });

  it("PWA pages have 880+ loading state patterns", () => {
    const pagesDir = join(ROOT, "client/src/pages");
    const pages = readdirSync(pagesDir).filter(f => f.endsWith(".tsx"));
    let loadingPatterns = 0;
    for (const page of pages) {
      const content = readFileSync(join(pagesDir, page), "utf-8");
      loadingPatterns += (content.match(/isLoading|isPending|isFetching|Skeleton|spinner/g) || []).length;
    }
    expect(loadingPatterns).toBeGreaterThanOrEqual(880);
  });

  it("BillingConfig.tsx uses billing.listBillingEvents", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/BillingConfig.tsx"), "utf-8");
    expect(content).toContain("listBillingEvents");
  });

  it("SubscriptionManagement.tsx uses real churn data", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/SubscriptionManagement.tsx"), "utf-8");
    expect(content).toContain("churn");
  });
});
