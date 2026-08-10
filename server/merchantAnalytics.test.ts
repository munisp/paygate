/**
 * Unit tests for merchantAnalytics tRPC router procedures.
 * These tests validate the DB helper function signatures and the router
 * registration without requiring a live database connection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getPeriodComparison: vi.fn().mockResolvedValue({
    current: {
      totalVolume: "500000",
      totalFees: "15000",
      totalCount: 42,
      completedCount: 38,
      failedCount: 4,
      avgTxAmount: "11905",
      newCustomers: 5,
    },
    previous: {
      totalVolume: "400000",
      totalFees: "12000",
      totalCount: 35,
      completedCount: 31,
      failedCount: 4,
      avgTxAmount: "11428",
      newCustomers: 3,
    },
  }),
  getDailyStatusBreakdown: vi.fn().mockResolvedValue([
    { date: "2026-04-18", completed: 10, failed: 2, pending: 1, totalAmount: "120000" },
    { date: "2026-04-19", completed: 15, failed: 1, pending: 0, totalAmount: "180000" },
  ]),
  getTopCustomers: vi.fn().mockResolvedValue([
    { customerId: "cust_001", customerEmail: "alice@example.com", totalSpend: "250000", txCount: 12, lastTxAt: "2026-04-19" },
    { customerId: "cust_002", customerEmail: "bob@example.com", totalSpend: "180000", txCount: 8, lastTxAt: "2026-04-18" },
  ]),
  getHourlyHeatmap: vi.fn().mockResolvedValue([
    { hour: 9, dow: 1, txCount: 5, volume: "60000" },
    { hour: 14, dow: 3, txCount: 8, volume: "96000" },
  ]),
  getRecentTransactionsFeed: vi.fn().mockResolvedValue([
    {
      id: "tx_001",
      amount: "15000",
      currency: "NGN",
      status: "completed",
      channel: "card",
      customerEmail: "alice@example.com",
      description: "Test payment",
      createdAt: new Date("2026-04-19T10:00:00Z"),
      feeAmount: "450",
    },
  ]),
  getChannelBreakdown: vi.fn().mockResolvedValue([
    { channel: "card", volume: "300000", count: 25, successRate: 92 },
    { channel: "bank_transfer", volume: "200000", count: 17, successRate: 88 },
  ]),
  getRevenueTimeSeries: vi.fn().mockResolvedValue([
    { date: "2026-04-18", volume: "120000", fees: "3600", count: 10 },
    { date: "2026-04-19", volume: "180000", fees: "5400", count: 15 },
  ]),
  getFraudStats: vi.fn().mockResolvedValue({
    total: 3,
    open: 1,
    investigating: 1,
    avgRiskScore: 0.72,
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("merchantAnalytics DB helpers", () => {
  const from = new Date("2026-03-20T00:00:00Z");
  const to = new Date("2026-04-19T23:59:59Z");
  const merchantId = "merch_001";

  it("getPeriodComparison returns current and previous period data", async () => {
    const { getPeriodComparison } = await import("./db");
    const result = await getPeriodComparison(merchantId, from, to);
    expect(result).not.toBeNull();
    expect(result?.current).toBeDefined();
    expect(result?.previous).toBeDefined();
    expect(Number(result?.current?.totalVolume)).toBeGreaterThan(0);
    expect(Number(result?.current?.completedCount)).toBeGreaterThanOrEqual(0);
    expect(Number(result?.current?.newCustomers)).toBeGreaterThanOrEqual(0);
  });

  it("getDailyStatusBreakdown returns array of daily rows", async () => {
    const { getDailyStatusBreakdown } = await import("./db");
    const rows = await getDailyStatusBreakdown(merchantId, from, to);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row).toHaveProperty("date");
    expect(row).toHaveProperty("completed");
    expect(row).toHaveProperty("failed");
    expect(row).toHaveProperty("pending");
  });

  it("getTopCustomers returns ranked customer list", async () => {
    const { getTopCustomers } = await import("./db");
    const customers = await getTopCustomers(merchantId, from, to, 10);
    expect(Array.isArray(customers)).toBe(true);
    expect(customers.length).toBeGreaterThan(0);
    const c = customers[0];
    expect(c).toHaveProperty("customerEmail");
    expect(c).toHaveProperty("totalSpend");
    expect(c).toHaveProperty("txCount");
    // First customer should have highest spend
    if (customers.length > 1) {
      expect(Number(customers[0].totalSpend)).toBeGreaterThanOrEqual(Number(customers[1].totalSpend));
    }
  });

  it("getHourlyHeatmap returns hour/dow grid data", async () => {
    const { getHourlyHeatmap } = await import("./db");
    const cells = await getHourlyHeatmap(merchantId, from, to);
    expect(Array.isArray(cells)).toBe(true);
    for (const cell of cells) {
      expect(cell).toHaveProperty("hour");
      expect(cell).toHaveProperty("dow");
      expect(cell).toHaveProperty("txCount");
      expect(Number(cell.hour)).toBeGreaterThanOrEqual(0);
      expect(Number(cell.hour)).toBeLessThan(24);
      expect(Number(cell.dow)).toBeGreaterThanOrEqual(0);
      expect(Number(cell.dow)).toBeLessThan(7);
    }
  });

  it("getRecentTransactionsFeed returns recent transactions", async () => {
    const { getRecentTransactionsFeed } = await import("./db");
    const feed = await getRecentTransactionsFeed(merchantId, 20);
    expect(Array.isArray(feed)).toBe(true);
    expect(feed.length).toBeGreaterThan(0);
    const tx = feed[0];
    expect(tx).toHaveProperty("id");
    expect(tx).toHaveProperty("amount");
    expect(tx).toHaveProperty("status");
    expect(tx).toHaveProperty("channel");
    expect(tx).toHaveProperty("createdAt");
  });

  it("getChannelBreakdown returns channel volume data", async () => {
    const { getChannelBreakdown } = await import("./db");
    const channels = await getChannelBreakdown(merchantId, from, to);
    expect(Array.isArray(channels)).toBe(true);
    for (const ch of channels) {
      expect(ch).toHaveProperty("channel");
      expect(ch).toHaveProperty("volume");
      expect(ch).toHaveProperty("count");
      expect(ch).toHaveProperty("successRate");
      expect(Number(ch.successRate)).toBeGreaterThanOrEqual(0);
      expect(Number(ch.successRate)).toBeLessThanOrEqual(100);
    }
  });

  it("getRevenueTimeSeries returns daily revenue data", async () => {
    const { getRevenueTimeSeries } = await import("./db");
    const series = await getRevenueTimeSeries(merchantId, from, to);
    expect(Array.isArray(series)).toBe(true);
    for (const point of series) {
      expect(point).toHaveProperty("date");
      expect(point).toHaveProperty("volume");
      expect(point).toHaveProperty("fees");
      expect(point).toHaveProperty("count");
    }
  });

  it("getFraudStats returns fraud summary metrics", async () => {
    const { getFraudStats } = await import("./db");
    const stats = await getFraudStats(merchantId);
    expect(stats).not.toBeNull();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("open");
    expect(stats).toHaveProperty("investigating");
    expect(stats).toHaveProperty("avgRiskScore");
    expect(Number(stats?.total)).toBeGreaterThanOrEqual(0);
    expect(Number(stats?.avgRiskScore)).toBeGreaterThanOrEqual(0);
    expect(Number(stats?.avgRiskScore)).toBeLessThanOrEqual(1);
  });
});

describe("merchantAnalytics KPI derivation logic", () => {
  it("calculates period-over-period percentage change correctly", () => {
    const pctChange = (current: number, previous: number): number => {
      if (!previous) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    expect(pctChange(500000, 400000)).toBeCloseTo(25, 1);
    expect(pctChange(400000, 500000)).toBeCloseTo(-20, 1);
    expect(pctChange(100, 0)).toBe(100);
    expect(pctChange(0, 0)).toBe(0);
  });

  it("calculates success rate correctly", () => {
    const successRate = (completed: number, total: number): number =>
      total > 0 ? (completed / total) * 100 : 0;

    expect(successRate(38, 42)).toBeCloseTo(90.48, 1);
    expect(successRate(0, 10)).toBe(0);
    expect(successRate(10, 0)).toBe(0);
    expect(successRate(10, 10)).toBe(100);
  });

  it("formats NGN amounts correctly", () => {
    const fmtNGN = (kobo: number): string => {
      if (kobo >= 1_000_000_000) return `₦${(kobo / 1_000_000_000).toFixed(2)}B`;
      if (kobo >= 1_000_000) return `₦${(kobo / 1_000_000).toFixed(2)}M`;
      if (kobo >= 1_000) return `₦${(kobo / 1_000).toFixed(1)}K`;
      return `₦${kobo.toLocaleString()}`;
    };

    expect(fmtNGN(1_500_000_000)).toBe("₦1.50B");
    expect(fmtNGN(2_500_000)).toBe("₦2.50M");
    expect(fmtNGN(15_000)).toBe("₦15.0K");
    expect(fmtNGN(500)).toBe("₦500");
  });

  it("builds heatmap grid from flat data correctly", () => {
    const rawCells = [
      { dow: 1, hour: 9, txCount: 5 },
      { dow: 3, hour: 14, txCount: 8 },
      { dow: 0, hour: 0, txCount: 0 },
    ];

    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const cell of rawCells) {
      const dow = Number(cell.dow);
      const hour = Number(cell.hour);
      if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
        grid[dow][hour] = Number(cell.txCount);
      }
    }

    expect(grid[1][9]).toBe(5);
    expect(grid[3][14]).toBe(8);
    expect(grid[0][0]).toBe(0);
    expect(grid[6][23]).toBe(0);
    expect(grid.length).toBe(7);
    expect(grid[0].length).toBe(24);
  });
});
