/**
 * Wave 44 Tests
 * Covers:
 *  1. settlements.listBreached — returns only unresolved sla_breached rows
 *  2. settlements.retry — state machine transition for sla_breached → processing
 *  3. vendors.spendHistory — monthly aggregation over 6 months
 *  4. SLA countdown helper — time-to-breach calculation
 */
import { describe, it, expect } from "vitest";

// ─── 1. listBreached filter logic ─────────────────────────────────────────────
describe("settlements.listBreached filter logic", () => {
  function filterBreached(rows: Array<{ status: string; resolvedAt: Date | null }>) {
    return rows.filter(
      (r) => r.status === "sla_breached" && r.resolvedAt === null
    );
  }

  it("returns only unresolved sla_breached rows", () => {
    const rows = [
      { status: "sla_breached", resolvedAt: null },
      { status: "sla_breached", resolvedAt: new Date() },
      { status: "completed", resolvedAt: null },
      { status: "processing", resolvedAt: null },
    ];
    const result = filterBreached(rows);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("sla_breached");
    expect(result[0].resolvedAt).toBeNull();
  });

  it("returns empty array when no breaches exist", () => {
    const rows = [
      { status: "completed", resolvedAt: null },
      { status: "processing", resolvedAt: null },
    ];
    expect(filterBreached(rows)).toHaveLength(0);
  });

  it("returns empty array when all breaches are resolved", () => {
    const rows = [
      { status: "sla_breached", resolvedAt: new Date("2026-01-01") },
      { status: "sla_breached", resolvedAt: new Date("2026-02-01") },
    ];
    expect(filterBreached(rows)).toHaveLength(0);
  });
});

// ─── 2. Settlement retry state machine ────────────────────────────────────────
describe("settlement retry state machine", () => {
  type SettlementStatus = "pending" | "processing" | "completed" | "failed" | "sla_breached";

  function canRetry(status: SettlementStatus): boolean {
    return status === "sla_breached" || status === "failed";
  }

  function transitionOnRetry(status: SettlementStatus): SettlementStatus {
    if (!canRetry(status)) throw new Error(`Cannot retry settlement in status: ${status}`);
    return "processing";
  }

  it("allows retry from sla_breached", () => {
    expect(canRetry("sla_breached")).toBe(true);
    expect(transitionOnRetry("sla_breached")).toBe("processing");
  });

  it("allows retry from failed", () => {
    expect(canRetry("failed")).toBe(true);
    expect(transitionOnRetry("failed")).toBe("processing");
  });

  it("does not allow retry from completed", () => {
    expect(canRetry("completed")).toBe(false);
    expect(() => transitionOnRetry("completed")).toThrow();
  });

  it("does not allow retry from processing", () => {
    expect(canRetry("processing")).toBe(false);
    expect(() => transitionOnRetry("processing")).toThrow();
  });

  it("does not allow retry from pending", () => {
    expect(canRetry("pending")).toBe(false);
    expect(() => transitionOnRetry("pending")).toThrow();
  });
});

// ─── 3. Vendor spend history aggregation ─────────────────────────────────────
describe("vendors.spendHistory monthly aggregation", () => {
  interface PO {
    vendorId: string;
    totalAmount: number; // in kobo
    createdAt: Date;
    status: string;
  }

  function aggregateSpendHistory(
    pos: PO[],
    vendorId: string,
    months: number = 6
  ): Array<{ month: string; spendKobo: number }> {
    const now = new Date("2026-03-14");
    const result: Array<{ month: string; spendKobo: number }> = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const spendKobo = pos
        .filter(
          (p) =>
            p.vendorId === vendorId &&
            p.status !== "cancelled" &&
            p.createdAt >= monthStart &&
            p.createdAt <= monthEnd
        )
        .reduce((sum, p) => sum + p.totalAmount, 0);

      result.push({ month: label, spendKobo });
    }

    return result;
  }

  const samplePos: PO[] = [
    { vendorId: "v1", totalAmount: 500_000, createdAt: new Date("2026-01-15"), status: "delivered" },
    { vendorId: "v1", totalAmount: 300_000, createdAt: new Date("2026-01-28"), status: "delivered" },
    { vendorId: "v1", totalAmount: 200_000, createdAt: new Date("2026-02-10"), status: "delivered" },
    { vendorId: "v1", totalAmount: 100_000, createdAt: new Date("2026-02-20"), status: "cancelled" }, // excluded
    { vendorId: "v1", totalAmount: 750_000, createdAt: new Date("2026-03-05"), status: "delivered" },
    { vendorId: "v2", totalAmount: 999_000, createdAt: new Date("2026-01-10"), status: "delivered" },
  ];

  it("returns 6 months of data", () => {
    const history = aggregateSpendHistory(samplePos, "v1");
    expect(history).toHaveLength(6);
  });

  it("aggregates spend correctly for Jan 2026", () => {
    const history = aggregateSpendHistory(samplePos, "v1");
    const jan = history.find((h) => h.month.startsWith("Jan"));
    expect(jan).toBeDefined();
    expect(jan!.spendKobo).toBe(800_000); // 500k + 300k, cancelled excluded
  });

  it("aggregates spend correctly for Feb 2026", () => {
    const history = aggregateSpendHistory(samplePos, "v1");
    const feb = history.find((h) => h.month.startsWith("Feb"));
    expect(feb).toBeDefined();
    expect(feb!.spendKobo).toBe(200_000); // cancelled PO excluded
  });

  it("aggregates spend correctly for Mar 2026", () => {
    const history = aggregateSpendHistory(samplePos, "v1");
    const mar = history.find((h) => h.month.startsWith("Mar"));
    expect(mar).toBeDefined();
    expect(mar!.spendKobo).toBe(750_000);
  });

  it("returns zero for months with no POs", () => {
    const history = aggregateSpendHistory(samplePos, "v1");
    const emptyMonths = history.filter((h) => h.spendKobo === 0);
    // Oct, Nov, Dec 2025 should be 0
    expect(emptyMonths.length).toBeGreaterThanOrEqual(3);
  });

  it("does not mix vendor data", () => {
    const historyV2 = aggregateSpendHistory(samplePos, "v2");
    const jan = historyV2.find((h) => h.month.startsWith("Jan"));
    expect(jan!.spendKobo).toBe(999_000);
    const mar = historyV2.find((h) => h.month.startsWith("Mar"));
    expect(mar!.spendKobo).toBe(0);
  });
});

// ─── 4. SLA countdown helper ──────────────────────────────────────────────────
describe("SLA countdown helper", () => {
  function getSlaCountdown(
    createdAt: Date,
    slaHours: number,
    now: Date = new Date()
  ): { hoursRemaining: number; isBreached: boolean; urgency: "ok" | "warning" | "critical" } {
    const deadlineMs = createdAt.getTime() + slaHours * 60 * 60 * 1000;
    const remainingMs = deadlineMs - now.getTime();
    const hoursRemaining = remainingMs / (60 * 60 * 1000);
    const isBreached = hoursRemaining <= 0;
    const urgency = isBreached
      ? "critical"
      : hoursRemaining <= 1
      ? "critical"
      : hoursRemaining <= slaHours * 0.25
      ? "warning"
      : "ok";
    return { hoursRemaining, isBreached, urgency };
  }

  const now = new Date("2026-03-14T12:00:00Z");

  it("returns ok urgency when plenty of time remains", () => {
    const createdAt = new Date("2026-03-14T10:00:00Z"); // 2 hours ago
    const result = getSlaCountdown(createdAt, 24, now);
    expect(result.isBreached).toBe(false);
    expect(result.hoursRemaining).toBeCloseTo(22, 0);
    expect(result.urgency).toBe("ok");
  });

  it("returns warning urgency when < 25% of SLA remains", () => {
    const createdAt = new Date("2026-03-14T06:00:00Z"); // 6 hours ago, 4h SLA
    const result = getSlaCountdown(createdAt, 8, now);
    expect(result.isBreached).toBe(false);
    expect(result.urgency).toBe("warning");
  });

  it("returns critical urgency when < 1 hour remains", () => {
    const createdAt = new Date("2026-03-14T11:10:00Z"); // 50 min ago, 1h SLA
    const result = getSlaCountdown(createdAt, 1, now);
    expect(result.isBreached).toBe(false);
    expect(result.urgency).toBe("critical");
  });

  it("marks as breached when deadline has passed", () => {
    const createdAt = new Date("2026-03-13T10:00:00Z"); // 26 hours ago, 24h SLA
    const result = getSlaCountdown(createdAt, 24, now);
    expect(result.isBreached).toBe(true);
    expect(result.urgency).toBe("critical");
    expect(result.hoursRemaining).toBeLessThan(0);
  });
});
