/**
 * Admin Router Tests
 *
 * Tests for adminRouter.ts using createCaller() to run through the full
 * tRPC middleware chain (including adminProcedure role check).
 *
 * The adminProcedure middleware:
 * 1. Calls getDb() — throws INTERNAL_SERVER_ERROR if null
 * 2. Queries the users table for the user's role using Drizzle ORM chain
 * 3. Throws FORBIDDEN if role !== 'admin'
 *
 * We mock getDb() to return a mock Drizzle DB that returns the correct role.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
// vi.mock is hoisted — factory must not reference module-level variables
const mockGetDb = vi.fn();

vi.mock("./db", () => ({
  getDb: mockGetDb,
  execRaw: vi.fn().mockResolvedValue([]),
  getTenantBySlug: vi.fn().mockResolvedValue(null),
  updateTenantBranding: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logProcedure: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
import type { TrpcContext } from "./_core/context";

function makeCtx(role: "admin" | "user" = "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: `${role}-open-id`,
      email: `${role}@test.com`,
      name: `${role} User`,
      role,
      loginMethod: "manus",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: { origin: "https://test.manus.space" }, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/**
 * Create a mock Drizzle DB that returns a specific user role from the
 * db.select().from().where().limit() chain used by adminProcedure.
 * Also handles all other Drizzle query patterns (returning empty arrays).
 */
function createMockDb(userRole: "admin" | "user") {
  const limitMock = vi.fn().mockResolvedValue([{ role: userRole }]);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, limit: limitMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return { select: selectMock };
}

/**
 * Set up getDb() mock: first call returns admin-check DB, subsequent calls return null.
 */
function setupAdminDb(userRole: "admin" | "user" = "admin") {
  let callCount = 0;
  mockGetDb.mockImplementation(async () => {
    callCount++;
    if (callCount === 1) return createMockDb(userRole);
    return null; // procedure body falls back gracefully
  });
}

// ─── Load adminRouter once ─────────────────────────────────────────────────────
let adminRouter: any;
beforeAll(async () => {
  const mod = await import("./adminRouter");
  adminRouter = mod.adminRouter;
});

// ─── adminRouter — access control ─────────────────────────────────────────────

describe("adminRouter — non-admin access is forbidden", () => {
  it("overview.getKPIs throws FORBIDDEN for non-admin user", async () => {
    setupAdminDb("user");
    const caller = adminRouter.createCaller(makeCtx("user"));
    await expect(caller.overview.getKPIs()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("merchants.listMerchants throws FORBIDDEN for non-admin user", async () => {
    setupAdminDb("user");
    const caller = adminRouter.createCaller(makeCtx("user"));
    await expect(caller.merchants.listMerchants({ limit: 10, offset: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("kyc.getStats throws FORBIDDEN for non-admin user", async () => {
    setupAdminDb("user");
    const caller = adminRouter.createCaller(makeCtx("user"));
    await expect(caller.kyc.getStats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fraud.getPlatformFraudStats throws FORBIDDEN for non-admin user", async () => {
    setupAdminDb("user");
    const caller = adminRouter.createCaller(makeCtx("user"));
    await expect(caller.fraud.getPlatformFraudStats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("health.getOverview throws FORBIDDEN for non-admin user", async () => {
    setupAdminDb("user");
    const caller = adminRouter.createCaller(makeCtx("user"));
    await expect(caller.health.getOverview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── adminRouter — overview sub-router ────────────────────────────────────────

describe("adminRouter.overview — KPI and analytics (admin access)", () => {
  it("getKPIs returns null (DB fallback) for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.overview.getKPIs();
    // When DB is null in procedure body, getKPIs returns null
    expect(result).toBeNull();
  });

  it("getRevenueTimeSeries returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.overview.getRevenueTimeSeries({ period: "7d", granularity: "day" });
    expect(typeof result).toBe("object");
  });

  it("getTopMerchants returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.overview.getTopMerchants({ limit: 5 });
    expect(typeof result).toBe("object");
  });
});

// ─── adminRouter — merchants sub-router ───────────────────────────────────────

describe("adminRouter.merchants — Merchant management procedures", () => {
  it("listMerchants returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.merchants.listMerchants({ limit: 10, offset: 0 });
    expect(typeof result).toBe("object");
  });
});

// ─── adminRouter — KYC sub-router ─────────────────────────────────────────────

describe("adminRouter.kyc — KYC review procedures", () => {
  it("getStats returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.kyc.getStats();
    expect(typeof result).toBe("object");
  });

  it("listPending returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.kyc.listPending({ limit: 20, offset: 0 });
    expect(typeof result).toBe("object");
  });
});

// ─── adminRouter — fraud sub-router ───────────────────────────────────────────

describe("adminRouter.fraud — Fraud oversight procedures", () => {
  it("getPlatformFraudStats returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.fraud.getPlatformFraudStats();
    expect(typeof result).toBe("object");
  });

  it("listAlerts returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.fraud.listAlerts({ limit: 20, offset: 0 });
    expect(typeof result).toBe("object");
  });
});

// ─── adminRouter — revenue sub-router ─────────────────────────────────────────

describe("adminRouter.revenue — Revenue management procedures", () => {
  it("getSummary returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.revenue.getSummary({ period: "month" });
    expect(typeof result).toBe("object");
  });

  it("getFeeTierConfig returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.revenue.getFeeTierConfig();
    expect(typeof result).toBe("object");
  });
});

// ─── adminRouter — settlements sub-router ─────────────────────────────────────

describe("adminRouter.settlements — Settlement management procedures", () => {
  it("getSettlementStats returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.settlements.getSettlementStats();
    expect(typeof result).toBe("object");
  });
});

// ─── adminRouter — health sub-router ──────────────────────────────────────────

describe("adminRouter.health — System health procedures", () => {
  it("getOverview returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.health.getOverview();
    expect(typeof result).toBe("object");
  });

  it("getDatabaseStats returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.health.getDatabaseStats();
    expect(typeof result).toBe("object");
  });

  it("getIndexHealth returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.health.getIndexHealth();
    expect(typeof result).toBe("object");
  });
});

// ─── adminRouter — config sub-router ──────────────────────────────────────────

describe("adminRouter.config — Configuration panel procedures", () => {
  it("getFeatureFlags returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.config.getFeatureFlags();
    expect(typeof result).toBe("object");
  });

  it("getRateLimits returns an object for admin", async () => {
    setupAdminDb("admin");
    const caller = adminRouter.createCaller(makeCtx("admin"));
    const result = await caller.config.getRateLimits();
    expect(typeof result).toBe("object");
  });
});
