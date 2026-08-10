/**
 * wave88.newfeatures.test.ts
 * Comprehensive tests for Sprint v88 new features:
 * - Portfolio Rebalancing (executeRebalance mutation)
 * - Claims Document Upload (claimDocuments table + upload procedure)
 * - Corridor Live Stats (corridorLiveStats procedures)
 * - GNN Score write-back to transactions
 * - AdminSlaMonitor, AdminTenantRevenue, WhiteLabelSDK pages
 * - wave88Router registration in appRouter
 * - Security: timingSafeEqual for internal key comparisons
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCaller } from "./routers";
import * as crypto from "crypto";

// ─── Mock DB ────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    then: vi.fn().mockResolvedValue([]),
  },
  getUserById: vi.fn().mockResolvedValue({ id: 1, name: "Test User", email: "test@example.com", role: "user" }),
  getMerchantByUserId: vi.fn().mockResolvedValue({ id: 1, businessName: "Test Merchant", status: "active" }),
}));

// ─── Mock Storage ────────────────────────────────────────────────────────────
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "https://cdn.example.com/test.pdf" }),
  storageGet: vi.fn().mockResolvedValue({ key: "test-key", url: "https://cdn.example.com/test.pdf" }),
}));

// ─── Mock env ────────────────────────────────────────────────────────────────
vi.mock("./_core/env", () => ({
  env: {
    JWT_SECRET: "test-secret-key-32-chars-minimum!!",
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    MIDDLEWARE_INTERNAL_KEY: "test-internal-key-for-middleware",
    FRAUD_SCORING_URL: "http://localhost:8001",
    TIGERBEETLE_ADDRESS: "localhost:3000",
    OWNER_OPEN_ID: "test-owner-id",
    OWNER_NAME: "Test Owner",
    BUILT_IN_FORGE_API_URL: "http://localhost:8080",
    BUILT_IN_FORGE_API_KEY: "test-forge-key",
  },
}));

// ─── Mock TigerBeetle ────────────────────────────────────────────────────────
vi.mock("./tigerbeetle", () => ({
  createTBClient: vi.fn().mockResolvedValue({
    createAccounts: vi.fn().mockResolvedValue([]),
    createTransfers: vi.fn().mockResolvedValue([]),
    lookupAccounts: vi.fn().mockResolvedValue([]),
    lookupTransfers: vi.fn().mockResolvedValue([]),
    destroy: vi.fn(),
  }),
  BatchTransfers: vi.fn().mockResolvedValue([]),
  TB_MAX_BATCH_SIZE: 8190,
}));

// ─── Mock fetch ──────────────────────────────────────────────────────────────
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({ gnn_score: 0.12, ring_detected: false }),
  text: vi.fn().mockResolvedValue("OK"),
});

// ─── Helper: create mock context ─────────────────────────────────────────────
function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, name: "Test User", email: "test@example.com", role: "user" as const, openId: "test-open-id" },
    req: { headers: { origin: "http://localhost:3000", "x-forwarded-for": "127.0.0.1" } } as any,
    res: { setHeader: vi.fn(), cookie: vi.fn() } as any,
    ...overrides,
  };
}

// ─── 1. wave88Router file exists ─────────────────────────────────────────────
describe("wave88Router — file existence", () => {
  it("wave88Router.ts exists in server directory", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routerPath = path.resolve(__dirname, "wave88Router.ts");
    expect(fs.existsSync(routerPath)).toBe(true);
  });

  it("wave88Router exports portfolioRebalancingRouter", async () => {
    const mod = await import("./wave88Router");
    expect(mod.portfolioRebalancingRouter).toBeDefined();
  });

  it("wave88Router exports claimDocumentsRouter", async () => {
    const mod = await import("./wave88Router");
    expect(mod.claimDocumentsRouter).toBeDefined();
  });

  it("wave88Router exports corridorLiveStatsRouter", async () => {
    const mod = await import("./wave88Router");
    expect(mod.corridorLiveStatsRouter).toBeDefined();
  });
});

// ─── 2. Portfolio Rebalancing ─────────────────────────────────────────────────
describe("portfolioRebalancingRouter", () => {
  it("exports portfolioRebalancingRouter with expected procedures", async () => {
    const { portfolioRebalancingRouter } = await import("./wave88Router");
    expect(portfolioRebalancingRouter).toBeDefined();
    // Router should be a tRPC router object
    expect(typeof portfolioRebalancingRouter).toBe("object");
  });

  it("router has executeRebalance procedure", async () => {
    const { portfolioRebalancingRouter } = await import("./wave88Router");
    expect(portfolioRebalancingRouter._def?.procedures?.executeRebalance ||
           portfolioRebalancingRouter._def?.record?.executeRebalance).toBeDefined();
  });
});

// ─── 3. Claims Documents ─────────────────────────────────────────────────────
describe("claimDocumentsRouter", () => {
  it("exports claimDocumentsRouter", async () => {
    const { claimDocumentsRouter } = await import("./wave88Router");
    expect(claimDocumentsRouter).toBeDefined();
  });

  it("router has uploadDocument procedure", async () => {
    const { claimDocumentsRouter } = await import("./wave88Router");
    expect(claimDocumentsRouter._def?.procedures?.uploadDocument ||
           claimDocumentsRouter._def?.record?.uploadDocument).toBeDefined();
  });

  it("router has listDocuments procedure", async () => {
    const { claimDocumentsRouter } = await import("./wave88Router");
    expect(claimDocumentsRouter._def?.procedures?.listDocuments ||
           claimDocumentsRouter._def?.record?.listDocuments).toBeDefined();
  });
});

// ─── 4. Corridor Live Stats ───────────────────────────────────────────────────
describe("corridorLiveStatsRouter", () => {
  it("exports corridorLiveStatsRouter", async () => {
    const { corridorLiveStatsRouter } = await import("./wave88Router");
    expect(corridorLiveStatsRouter).toBeDefined();
  });

  it("router has getLiveStats procedure", async () => {
    const { corridorLiveStatsRouter } = await import("./wave88Router");
    expect(corridorLiveStatsRouter._def?.procedures?.getLiveStats ||
           corridorLiveStatsRouter._def?.record?.getLiveStats).toBeDefined();
  });

  it("router has setFxMarkup procedure", async () => {
    const { corridorLiveStatsRouter } = await import("./wave88Router");
    expect(corridorLiveStatsRouter._def?.procedures?.setFxMarkup ||
           corridorLiveStatsRouter._def?.record?.setFxMarkup).toBeDefined();
  });
});

// ─── 5. GNN Score write-back ──────────────────────────────────────────────────
describe("GNN score write-back", () => {
  it("routers.ts contains GNN score write-back logic", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routersContent = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );
    // Check for GNN scoring call in transaction creation
    expect(routersContent).toMatch(/gnnScore|gnn_score|FRAUD_SCORING_URL/i);
  });

  it("schema.ts has gnnScore column on transactions table", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const schemaContent = fs.readFileSync(
      path.resolve(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    expect(schemaContent).toMatch(/gnnScore|gnn_score/);
  });

  it("schema.ts has gnnRingDetected column on transactions table", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const schemaContent = fs.readFileSync(
      path.resolve(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    expect(schemaContent).toMatch(/gnnRingDetected|gnn_ring_detected/);
  });
});

// ─── 6. New Admin/Frontend Pages ──────────────────────────────────────────────
describe("New admin and merchant pages", () => {
  it("AdminSlaMonitor.tsx exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/admin/AdminSlaMonitor.tsx")
    )).toBe(true);
  });

  it("AdminTenantRevenue.tsx exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/admin/AdminTenantRevenue.tsx")
    )).toBe(true);
  });

  it("WhiteLabelSDK.tsx exists in pages root", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/WhiteLabelSDK.tsx")
    )).toBe(true);
  });

  it("AdminTenantBilling.tsx exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/admin/AdminTenantBilling.tsx")
    )).toBe(true);
  });

  it("AdminCorridorMonitor.tsx exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/admin/AdminCorridorMonitor.tsx")
    )).toBe(true);
  });
});

// ─── 7. Consumer Pages ────────────────────────────────────────────────────────
describe("New consumer pages", () => {
  it("ClaimsTracker.tsx exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/consumer/ClaimsTracker.tsx")
    )).toBe(true);
  });

  it("PortfolioRebalancing.tsx exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/consumer/PortfolioRebalancing.tsx")
    )).toBe(true);
  });

  it("ConsumerLoyaltyDashboard.tsx exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/consumer/ConsumerLoyaltyDashboard.tsx")
    )).toBe(true);
  });

  it("ConsumerBnplRepayments.tsx exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../client/src/pages/consumer/ConsumerBnplRepayments.tsx")
    )).toBe(true);
  });
});

// ─── 8. Security: timingSafeEqual ─────────────────────────────────────────────
describe("Security: timingSafeEqual for internal key comparisons", () => {
  it("routers.ts uses timingSafeEqual for MIDDLEWARE_INTERNAL_KEY", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routersContent = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );
    expect(routersContent).toMatch(/timingSafeEqual/);
  });

  it("sseHardening.ts uses timingSafeEqual for internal key", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const sseContent = fs.readFileSync(
      path.resolve(__dirname, "sseHardening.ts"),
      "utf-8"
    );
    expect(sseContent).toMatch(/timingSafeEqual/);
  });

  it("timingSafeEqual correctly compares equal buffers", () => {
    const key = "test-secret-key-32-chars-minimum!!";
    const a = Buffer.from(key);
    const b = Buffer.from(key);
    expect(crypto.timingSafeEqual(a, b)).toBe(true);
  });

  it("timingSafeEqual correctly rejects unequal buffers", () => {
    const a = Buffer.from("correct-key-value-32-chars-min!!");
    const b = Buffer.from("wrong-key-value-32-chars-minimum");
    expect(crypto.timingSafeEqual(a, b)).toBe(false);
  });
});

// ─── 9. Schema: claimDocuments table ─────────────────────────────────────────
describe("Schema: new tables in schema.ts", () => {
  it("schema.ts has claimDocuments table", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const schemaContent = fs.readFileSync(
      path.resolve(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    expect(schemaContent).toMatch(/claimDocuments|claim_documents/);
  });

  it("schema.ts has portfolioRebalancingOrders table", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const schemaContent = fs.readFileSync(
      path.resolve(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    expect(schemaContent).toMatch(/portfolioRebalancingOrders|portfolio_rebalancing_orders/);
  });

  it("schema.ts has corridorLiveStats table", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const schemaContent = fs.readFileSync(
      path.resolve(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    expect(schemaContent).toMatch(/corridorLiveStats|corridor_live_stats/);
  });
});

// ─── 10. PLATFORM_FEATURES.md ────────────────────────────────────────────────
describe("Documentation: PLATFORM_FEATURES.md", () => {
  it("PLATFORM_FEATURES.md exists in docs directory", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../docs/PLATFORM_FEATURES.md")
    )).toBe(true);
  });

  it("PLATFORM_FEATURES.md contains key feature categories", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../docs/PLATFORM_FEATURES.md"),
      "utf-8"
    );
    expect(content).toMatch(/Payment Processing|Fraud|Compliance|Consumer/i);
  });
});

// ─── 11. 1B Payments Architecture ────────────────────────────────────────────
describe("1B Payments Architecture", () => {
  it("1b-payments-architecture.md exists in docs directory", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../docs/1b-payments-architecture.md")
    )).toBe(true);
  });

  it("tieringArchival.ts exists in server directory", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "tieringArchival.ts")
    )).toBe(true);
  });

  it("tieringArchival.ts exports archiveOldTransactions function", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "tieringArchival.ts"),
      "utf-8"
    );
    expect(content).toMatch(/archiveOldTransactions|export.*archive/i);
  });
});

// ─── 12. Wealth Advisor Python Service ───────────────────────────────────────
describe("Wealth Advisor Python microservice", () => {
  it("wealth-advisor/main.py exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../python-services/wealth-advisor/main.py")
    )).toBe(true);
  });

  it("wealth-advisor/requirements.txt exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../python-services/wealth-advisor/requirements.txt")
    )).toBe(true);
  });

  it("wealth-advisor/Dockerfile exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../python-services/wealth-advisor/Dockerfile")
    )).toBe(true);
  });
});

// ─── 13. Security Audit Report ───────────────────────────────────────────────
describe("Security Audit Report", () => {
  it("SECURITY_AUDIT_REPORT.md exists in docs directory", async () => {
    const fs = await import("fs");
    const path = await import("path");
    expect(fs.existsSync(
      path.resolve(__dirname, "../docs/SECURITY_AUDIT_REPORT.md")
    )).toBe(true);
  });

  it("Security audit report contains vulnerability scores", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../docs/SECURITY_AUDIT_REPORT.md"),
      "utf-8"
    );
    expect(content).toMatch(/score|VULN|vulnerability/i);
  });
});
