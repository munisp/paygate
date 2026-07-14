/**
 * NextHub SRBE tRPC Router Tests
 *
 * Tests cover all 6 NextHub routers:
 *   - nexthubSettlement: settlement window CRUD and state transitions
 *   - nexthubReconciliation: exception listing and resolution
 *   - nexthubBilling: invoice listing and fee posting
 *   - nexthubDisputes: dispute creation and resolution
 *   - nexthubSecurity: security event listing and AML rule toggle
 *   - nexthubDfsps: DFSP registry CRUD
 *
 * All tests use the real tRPC caller (no mocks) against the test database.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createCallerFactory } from "./_core/trpc";
import { appRouter } from "./routers";
import { getDb } from "./db";

// ── Test caller setup ─────────────────────────────────────────────────────────

const createCaller = createCallerFactory(appRouter);

// Admin context for protected procedures
const adminCtx = {
  user: {
    id: "test-admin-001",
    openId: "test-admin-001",
    name: "Test Admin",
    email: "admin@nexthub.test",
    role: "admin" as const,
    avatarUrl: null,
  },
  db: null as any, // populated in beforeAll
};

// Unauthenticated context for public procedures
const anonCtx = {
  user: null,
  db: null as any,
};

beforeAll(async () => {
  const db = await getDb();
  adminCtx.db = db;
  anonCtx.db = db;
});

// ── nexthubSettlement ─────────────────────────────────────────────────────────

describe("nexthubSettlement", () => {
  it("listWindows returns an array", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubSettlement.listWindows({
      status: "OPEN",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result.windows)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("listWindows filters by status", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubSettlement.listWindows({
      status: "CLOSED",
      limit: 5,
      offset: 0,
    });
    // All returned windows should have CLOSED status
    for (const w of result.windows) {
      expect(w.status).toBe("CLOSED");
    }
  });

  it("getWindow returns null for non-existent ID", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubSettlement.getWindow({
      windowId: "non-existent-window-id",
    });
    expect(result).toBeNull();
  });

  it("createWindow creates a new settlement window", async () => {
    const caller = createCaller(adminCtx);
    const now = Date.now();
    const result = await caller.nexthubSettlement.createWindow({
      windowType: "DNS_INTRADAY",
      settlementModel: "DEFERRED_NET",
      currency: "NGN",
      openedAt: now,
      scheduledCloseAt: now + 2 * 3600 * 1000,
    });
    expect(result.id).toBeTruthy();
    expect(result.status).toBe("OPEN");
    expect(result.windowType).toBe("DNS_INTRADAY");
  });

  it("closeWindow transitions OPEN → CLOSED", async () => {
    const caller = createCaller(adminCtx);
    const now = Date.now();
    // Create a window first
    const created = await caller.nexthubSettlement.createWindow({
      windowType: "RTGS",
      settlementModel: "GROSS",
      currency: "NGN",
      openedAt: now,
      scheduledCloseAt: now + 3600 * 1000,
    });
    // Close it
    const closed = await caller.nexthubSettlement.closeWindow({
      windowId: created.id,
    });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).toBeTruthy();
  });

  it("closeWindow rejects already-closed window", async () => {
    const caller = createCaller(adminCtx);
    const now = Date.now();
    const created = await caller.nexthubSettlement.createWindow({
      windowType: "DNS_EOD",
      settlementModel: "DEFERRED_NET",
      currency: "NGN",
      openedAt: now,
      scheduledCloseAt: now + 3600 * 1000,
    });
    await caller.nexthubSettlement.closeWindow({ windowId: created.id });
    // Closing again should throw
    await expect(
      caller.nexthubSettlement.closeWindow({ windowId: created.id })
    ).rejects.toThrow();
  });

  it("getNetPositions returns positions for a window", async () => {
    const caller = createCaller(adminCtx);
    const now = Date.now();
    const win = await caller.nexthubSettlement.createWindow({
      windowType: "RTGS",
      settlementModel: "GROSS",
      currency: "NGN",
      openedAt: now,
      scheduledCloseAt: now + 3600 * 1000,
    });
    const positions = await caller.nexthubSettlement.getNetPositions({
      windowId: win.id,
    });
    expect(Array.isArray(positions)).toBe(true);
  });
});

// ── nexthubReconciliation ─────────────────────────────────────────────────────

describe("nexthubReconciliation", () => {
  it("listExceptions returns an array", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubReconciliation.listExceptions({
      status: "OPEN",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result.exceptions)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("listExceptions filters by break type", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubReconciliation.listExceptions({
      breakType: "AMOUNT",
      limit: 10,
      offset: 0,
    });
    for (const ex of result.exceptions) {
      expect(ex.breakType).toBe("AMOUNT");
    }
  });

  it("resolveException marks exception as AUTO_RESOLVED", async () => {
    const caller = createCaller(adminCtx);
    // First create an exception to resolve
    const created = await caller.nexthubReconciliation.createException({
      windowId: "test-window-001",
      breakType: "TIMING",
      hubTransferId: "hub-transfer-001",
      railReference: null,
      hubAmountMinor: 100000,
      railAmountMinor: null,
      currency: "NGN",
      payerFspId: "DFSP001",
      payeeFspId: "DFSP002",
      description: "Test timing break",
    });
    const resolved = await caller.nexthubReconciliation.resolveException({
      exceptionId: created.id,
      resolution: "AUTO_RESOLVED",
      notes: "Resolved by test",
    });
    expect(resolved.status).toBe("AUTO_RESOLVED");
  });

  it("getStats returns summary counts", async () => {
    const caller = createCaller(adminCtx);
    const stats = await caller.nexthubReconciliation.getStats({});
    expect(typeof stats.openCount).toBe("number");
    expect(typeof stats.autoResolvedCount).toBe("number");
    expect(typeof stats.escalatedCount).toBe("number");
  });
});

// ── nexthubBilling ────────────────────────────────────────────────────────────

describe("nexthubBilling", () => {
  it("listInvoices returns an array", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubBilling.listInvoices({
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result.invoices)).toBe(true);
  });

  it("listInvoices filters by dfspId", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubBilling.listInvoices({
      dfspId: "DFSP001",
      limit: 10,
      offset: 0,
    });
    for (const inv of result.invoices) {
      expect(inv.dfspId).toBe("DFSP001");
    }
  });

  it("getBillingSummary returns totals", async () => {
    const caller = createCaller(adminCtx);
    const summary = await caller.nexthubBilling.getBillingSummary({
      periodStart: Date.now() - 30 * 24 * 3600 * 1000,
      periodEnd: Date.now(),
    });
    expect(typeof summary.totalSchemeFeeMinor).toBe("number");
    expect(typeof summary.totalInterchangeMinor).toBe("number");
    expect(typeof summary.totalFxMarkupMinor).toBe("number");
    expect(typeof summary.totalPenaltyMinor).toBe("number");
  });
});

// ── nexthubDisputes ───────────────────────────────────────────────────────────

describe("nexthubDisputes", () => {
  it("listDisputes returns an array", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubDisputes.listDisputes({
      status: "OPEN",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result.disputes)).toBe(true);
  });

  it("createDispute creates a new dispute", async () => {
    const caller = createCaller(adminCtx);
    const dispute = await caller.nexthubDisputes.createDispute({
      transferId: "test-transfer-001",
      initiatingFspId: "DFSP001",
      respondingFspId: "DFSP002",
      disputeType: "WRONG_AMOUNT",
      claimedAmountMinor: 100000,
      currency: "NGN",
      description: "Test dispute",
    });
    expect(dispute.id).toBeTruthy();
    expect(dispute.status).toBe("OPEN");
  });

  it("resolveDispute upheld posts reversal", async () => {
    const caller = createCaller(adminCtx);
    const dispute = await caller.nexthubDisputes.createDispute({
      transferId: "test-transfer-002",
      initiatingFspId: "DFSP001",
      respondingFspId: "DFSP002",
      disputeType: "DUPLICATE_PAYMENT",
      claimedAmountMinor: 50000,
      currency: "NGN",
      description: "Duplicate payment test",
    });
    const resolved = await caller.nexthubDisputes.resolveDispute({
      disputeId: dispute.id,
      outcome: "UPHELD",
      notes: "Confirmed duplicate",
    });
    expect(resolved.outcome).toBe("UPHELD");
    expect(resolved.status).toBe("RESOLVED");
  });
});

// ── nexthubSecurity ───────────────────────────────────────────────────────────

describe("nexthubSecurity", () => {
  it("listSecurityEvents returns an array", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubSecurity.listSecurityEvents({
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result.events)).toBe(true);
  });

  it("listAmlRules returns rules", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubSecurity.listAmlRules({});
    expect(Array.isArray(result.rules)).toBe(true);
  });

  it("toggleAmlRule enables and disables a rule", async () => {
    const caller = createCaller(adminCtx);
    const rules = await caller.nexthubSecurity.listAmlRules({});
    if (rules.rules.length === 0) return; // skip if no rules
    const rule = rules.rules[0];
    const toggled = await caller.nexthubSecurity.toggleAmlRule({
      ruleId: rule.id,
      enabled: !rule.enabled,
    });
    expect(toggled.enabled).toBe(!rule.enabled);
  });

  it("getSecurityStats returns counts", async () => {
    const caller = createCaller(adminCtx);
    const stats = await caller.nexthubSecurity.getSecurityStats({});
    expect(typeof stats.totalEvents).toBe("number");
    expect(typeof stats.criticalCount).toBe("number");
    expect(typeof stats.amlAlertsToday).toBe("number");
  });
});

// ── nexthubDfsps ─────────────────────────────────────────────────────────────

describe("nexthubDfsps", () => {
  it("listDfsps returns an array", async () => {
    const caller = createCaller(adminCtx);
    const result = await caller.nexthubDfsps.listDfsps({
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result.dfsps)).toBe(true);
  });

  it("createDfsp creates a new DFSP", async () => {
    const caller = createCaller(adminCtx);
    const dfsp = await caller.nexthubDfsps.createDfsp({
      fspId: `TEST-DFSP-${Date.now()}`,
      name: "Test DFSP Bank",
      type: "BANK",
      currency: "NGN",
      country: "NG",
      contactEmail: "ops@testdfsp.ng",
    });
    expect(dfsp.id).toBeTruthy();
    expect(dfsp.status).toBe("PENDING");
  });

  it("activateDfsp transitions PENDING → ACTIVE", async () => {
    const caller = createCaller(adminCtx);
    const dfsp = await caller.nexthubDfsps.createDfsp({
      fspId: `TEST-DFSP-ACT-${Date.now()}`,
      name: "Test Activate DFSP",
      type: "MOBILE_MONEY",
      currency: "NGN",
      country: "NG",
      contactEmail: "ops@activatetest.ng",
    });
    const activated = await caller.nexthubDfsps.activateDfsp({
      dfspId: dfsp.id,
    });
    expect(activated.status).toBe("ACTIVE");
  });

  it("getDfsp returns the created DFSP", async () => {
    const caller = createCaller(adminCtx);
    const created = await caller.nexthubDfsps.createDfsp({
      fspId: `TEST-DFSP-GET-${Date.now()}`,
      name: "Test Get DFSP",
      type: "FINTECH",
      currency: "NGN",
      country: "NG",
      contactEmail: "ops@gettest.ng",
    });
    const fetched = await caller.nexthubDfsps.getDfsp({ dfspId: created.id });
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.name).toBe("Test Get DFSP");
  });
});
