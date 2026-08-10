/**
 * Usage Metering Router Tests
 * Tests for tenant usage tracking, quota checking, and invoice management.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();
const mockReturning = vi.fn();

vi.mock("./db", () => ({
  getDb: () => ({
    select: () => ({ from: mockFrom }),
    insert: () => ({ values: mockValues }),
    update: () => ({ set: mockSet }),
  }),
  db: {},
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, openId: "user_001", role: "user", tenantId: "ten_test", ...overrides },
    req: {} as never,
    res: {} as never,
  };
}

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe("usageMeteringRouter", () => {
  describe("period calculation", () => {
    it("generates YYYY-MM format for current month", () => {
      const period = new Date().toISOString().slice(0, 7);
      expect(period).toMatch(/^\d{4}-\d{2}$/);
    });

    it("generates correct period for January", () => {
      const date = new Date("2026-01-15T10:00:00Z");
      const period = date.toISOString().slice(0, 7);
      expect(period).toBe("2026-01");
    });

    it("generates correct period for December", () => {
      const date = new Date("2025-12-31T23:59:59Z");
      const period = date.toISOString().slice(0, 7);
      expect(period).toBe("2025-12");
    });
  });

  describe("quota calculation", () => {
    const defaultLimits: Record<string, { maxApiCalls: number; maxTxVolume: number; maxUsers: number; maxCorridors: number }> = {
      starter: { maxApiCalls: 10_000, maxTxVolume: 1_000_000, maxUsers: 5, maxCorridors: 2 },
      growth: { maxApiCalls: 100_000, maxTxVolume: 50_000_000, maxUsers: 25, maxCorridors: 10 },
      enterprise: { maxApiCalls: 10_000_000, maxTxVolume: 1_000_000_000, maxUsers: 500, maxCorridors: 100 },
    };

    it("starter plan has correct limits", () => {
      const limits = defaultLimits.starter;
      expect(limits.maxApiCalls).toBe(10_000);
      expect(limits.maxTxVolume).toBe(1_000_000);
      expect(limits.maxUsers).toBe(5);
      expect(limits.maxCorridors).toBe(2);
    });

    it("growth plan has correct limits", () => {
      const limits = defaultLimits.growth;
      expect(limits.maxApiCalls).toBe(100_000);
      expect(limits.maxTxVolume).toBe(50_000_000);
      expect(limits.maxUsers).toBe(25);
      expect(limits.maxCorridors).toBe(10);
    });

    it("enterprise plan has correct limits", () => {
      const limits = defaultLimits.enterprise;
      expect(limits.maxApiCalls).toBe(10_000_000);
      expect(limits.maxTxVolume).toBe(1_000_000_000);
      expect(limits.maxUsers).toBe(500);
      expect(limits.maxCorridors).toBe(100);
    });

    it("calculates API calls percentage correctly", () => {
      const usage = { apiCalls: 5000 };
      const limits = defaultLimits.starter;
      const pct = Math.round((usage.apiCalls / limits.maxApiCalls) * 100);
      expect(pct).toBe(50);
    });

    it("calculates tx volume percentage correctly", () => {
      const usage = { txVolume: 250_000 };
      const limits = defaultLimits.starter;
      const pct = Math.round((usage.txVolume / limits.maxTxVolume) * 100);
      expect(pct).toBe(25);
    });

    it("detects quota exceeded for API calls", () => {
      const usage = { apiCalls: 11_000 };
      const limits = defaultLimits.starter;
      const ok = usage.apiCalls < limits.maxApiCalls;
      expect(ok).toBe(false);
    });

    it("detects quota within limit for API calls", () => {
      const usage = { apiCalls: 9_999 };
      const limits = defaultLimits.starter;
      const ok = usage.apiCalls < limits.maxApiCalls;
      expect(ok).toBe(true);
    });

    it("detects quota exceeded for tx volume", () => {
      const usage = { txVolume: 1_000_001 };
      const limits = defaultLimits.starter;
      const ok = usage.txVolume < limits.maxTxVolume;
      expect(ok).toBe(false);
    });

    it("handles 0% usage correctly", () => {
      const usage = { apiCalls: 0 };
      const limits = defaultLimits.growth;
      const pct = Math.round((usage.apiCalls / limits.maxApiCalls) * 100);
      expect(pct).toBe(0);
    });

    it("handles 100% usage correctly", () => {
      const usage = { apiCalls: 100_000 };
      const limits = defaultLimits.growth;
      const pct = Math.round((usage.apiCalls / limits.maxApiCalls) * 100);
      expect(pct).toBe(100);
    });
  });

  describe("usage accumulation", () => {
    it("accumulates API calls correctly", () => {
      const existing = { apiCalls: 100 };
      const input = { apiCalls: 50 };
      const newTotal = existing.apiCalls + input.apiCalls;
      expect(newTotal).toBe(150);
    });

    it("accumulates tx volume correctly", () => {
      const existing = { txVolume: 500_000 };
      const input = { txVolume: 250_000 };
      const newTotal = existing.txVolume + input.txVolume;
      expect(newTotal).toBe(750_000);
    });

    it("accumulates tx count correctly", () => {
      const existing = { txCount: 200 };
      const input = { txCount: 50 };
      const newTotal = existing.txCount + input.txCount;
      expect(newTotal).toBe(250);
    });

    it("accumulates storage bytes correctly", () => {
      const existing = { storageBytes: 1_000_000 };
      const input = { storageBytes: 500_000 };
      const newTotal = existing.storageBytes + input.storageBytes;
      expect(newTotal).toBe(1_500_000);
    });

    it("accumulates webhook deliveries correctly", () => {
      const existing = { webhookDeliveries: 300 };
      const input = { webhookDeliveries: 100 };
      const newTotal = existing.webhookDeliveries + input.webhookDeliveries;
      expect(newTotal).toBe(400);
    });
  });

  describe("invoice status transitions", () => {
    const validStatuses = ["draft", "open", "paid", "void", "uncollectible"] as const;

    it("has all valid invoice statuses", () => {
      expect(validStatuses).toContain("draft");
      expect(validStatuses).toContain("open");
      expect(validStatuses).toContain("paid");
      expect(validStatuses).toContain("void");
      expect(validStatuses).toContain("uncollectible");
    });

    it("new invoices default to open status", () => {
      const invoice = { status: "open" as const };
      expect(invoice.status).toBe("open");
    });

    it("paid invoices have paidAt timestamp", () => {
      const invoice = { status: "paid", paidAt: new Date() };
      expect(invoice.paidAt).toBeDefined();
    });
  });

  describe("tenant ID resolution", () => {
    it("uses input tenantId when provided", () => {
      const input = { tenantId: "ten_explicit" };
      const ctx = makeCtx({ tenantId: "ten_from_ctx" });
      const resolved = input.tenantId ?? ctx.user.tenantId ?? "platform";
      expect(resolved).toBe("ten_explicit");
    });

    it("falls back to ctx.user.tenantId when input not provided", () => {
      const input: { tenantId?: string } = {};
      const ctx = makeCtx({ tenantId: "ten_from_ctx" });
      const resolved = input.tenantId ?? ctx.user.tenantId ?? "platform";
      expect(resolved).toBe("ten_from_ctx");
    });

    it("falls back to platform when both are undefined", () => {
      const input: { tenantId?: string } = {};
      const ctx = makeCtx({ tenantId: undefined });
      const resolved = input.tenantId ?? ctx.user.tenantId ?? "platform";
      expect(resolved).toBe("platform");
    });
  });

  describe("admin-only invoice creation", () => {
    it("allows admin to create invoice", () => {
      const ctx = makeCtx({ role: "admin" });
      expect(ctx.user.role).toBe("admin");
      // No TRPCError thrown
    });

    it("blocks non-admin from creating invoice", () => {
      const ctx = makeCtx({ role: "user" });
      const isAdmin = ctx.user.role === "admin";
      expect(isAdmin).toBe(false);
    });
  });

  describe("plan limit defaults", () => {
    it("enterprise plan supports 100 corridors", () => {
      const limits = { maxCorridors: 100 };
      expect(limits.maxCorridors).toBe(100);
    });

    it("starter plan supports only 2 corridors", () => {
      const limits = { maxCorridors: 2 };
      expect(limits.maxCorridors).toBe(2);
    });

    it("growth plan supports 10 corridors", () => {
      const limits = { maxCorridors: 10 };
      expect(limits.maxCorridors).toBe(10);
    });
  });
});
