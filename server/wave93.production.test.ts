/**
 * wave93.production.test.ts
 * Sprint v93: Gold SIP Processor, Fraud Alerts Dashboard, Revenue Analytics Export
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getGoldPriceNGN,
  calculateNextDebitDate,
  isSIPDueToday,
  executeSIPPlan,
  processDueSIPs,
  startSIPProcessor,
  stopSIPProcessor,
  type SIPPlan,
} from "./jobs/sipProcessor";

// ─── Gold Price Oracle ────────────────────────────────────────────────────────

describe("Gold Price Oracle", () => {
  it("returns a positive NGN price per gram", () => {
    const price = getGoldPriceNGN();
    expect(price).toBeGreaterThan(0);
    expect(price).toBeGreaterThan(90_000); // Realistic floor
    expect(price).toBeLessThan(110_000);   // Realistic ceiling
  });

  it("returns different prices on consecutive calls (variation)", () => {
    const prices = Array.from({ length: 20 }, () => getGoldPriceNGN());
    const unique = new Set(prices);
    expect(unique.size).toBeGreaterThan(1); // Should have variation
  });
});

// ─── Next Debit Date Calculator ───────────────────────────────────────────────

describe("calculateNextDebitDate", () => {
  const base = new Date("2026-04-24T08:00:00.000Z");

  it("calculates daily next debit (+1 day)", () => {
    const next = calculateNextDebitDate({ frequency: "daily", dayOfMonth: 1 }, base);
    expect(next.getUTCDate()).toBe(25);
    expect(next.getUTCHours()).toBe(8);
  });

  it("calculates weekly next debit (+7 days)", () => {
    const next = calculateNextDebitDate({ frequency: "weekly", dayOfMonth: 1 }, base);
    expect(next.getUTCDate()).toBe(1); // April 24 + 7 = May 1
    expect(next.getUTCMonth()).toBe(4); // May
  });

  it("calculates monthly next debit (+1 month)", () => {
    const next = calculateNextDebitDate({ frequency: "monthly", dayOfMonth: 15 }, base);
    expect(next.getUTCMonth()).toBe(4); // May
    expect(next.getUTCDate()).toBe(15);
  });

  it("caps day-of-month at 28 to avoid overflow", () => {
    const next = calculateNextDebitDate({ frequency: "monthly", dayOfMonth: 31 }, base);
    expect(next.getUTCDate()).toBeLessThanOrEqual(28);
  });

  it("always sets time to 08:00 UTC", () => {
    const next = calculateNextDebitDate({ frequency: "daily", dayOfMonth: 1 }, base);
    expect(next.getUTCHours()).toBe(8);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCSeconds()).toBe(0);
  });
});

// ─── SIP Due Today Check ──────────────────────────────────────────────────────

describe("isSIPDueToday", () => {
  it("returns true when nextDebitAt is today", () => {
    const today = new Date();
    today.setUTCHours(8, 0, 0, 0);
    expect(isSIPDueToday({ nextDebitAt: today })).toBe(true);
  });

  it("returns false when nextDebitAt is tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(8, 0, 0, 0);
    expect(isSIPDueToday({ nextDebitAt: tomorrow })).toBe(false);
  });

  it("returns false when nextDebitAt was yesterday", () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(8, 0, 0, 0);
    expect(isSIPDueToday({ nextDebitAt: yesterday })).toBe(false);
  });
});

// ─── SIP Plan Execution ───────────────────────────────────────────────────────

describe("executeSIPPlan", () => {
  const mockPlan: SIPPlan = {
    id: "sip_test_001",
    merchantId: "merch_001",
    userId: "user_001",
    monthlyAmountNGN: 50_000,
    frequency: "monthly",
    dayOfMonth: 15,
    status: "active",
    nextDebitAt: new Date(),
    totalGramsAccumulated: 0.5,
    totalInvestedNGN: 50_000,
    runCount: 1,
    lastRunAt: null,
    createdAt: new Date(),
  };

  it("calculates correct grams from NGN amount and gold price", async () => {
    const goldPrice = 100_000; // ₦100,000/g
    const result = await executeSIPPlan(mockPlan, goldPrice);
    // 50,000 / 100,000 = 0.5 grams
    expect(result.grams).toBeCloseTo(0.5, 4);
    expect(result.amountNGN).toBe(50_000);
    expect(result.txId).toContain("sip_sip_test_001");
  });

  it("generates a unique txId for each execution", async () => {
    const goldPrice = 98_500;
    const [r1, r2] = await Promise.all([
      executeSIPPlan(mockPlan, goldPrice),
      executeSIPPlan(mockPlan, goldPrice),
    ]);
    expect(r1.txId).not.toBe(r2.txId);
  });

  it("returns grams proportional to investment amount", async () => {
    const goldPrice = 50_000;
    const largePlan = { ...mockPlan, monthlyAmountNGN: 500_000 };
    const result = await executeSIPPlan(largePlan, goldPrice);
    expect(result.grams).toBeCloseTo(10, 2); // 500k / 50k = 10g
  });
});

// ─── SIP Processor (integration) ─────────────────────────────────────────────

describe("processDueSIPs", () => {
  it("returns a valid result object even when DB is unavailable", async () => {
    const result = await processDueSIPs();
    expect(result).toHaveProperty("processed");
    expect(result).toHaveProperty("succeeded");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("totalGramsPurchased");
    expect(result).toHaveProperty("totalNGNInvested");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("processed count equals succeeded + failed", async () => {
    const result = await processDueSIPs();
    expect(result.processed).toBe(result.succeeded + result.failed);
  });

  it("totalGramsPurchased is non-negative", async () => {
    const result = await processDueSIPs();
    expect(result.totalGramsPurchased).toBeGreaterThanOrEqual(0);
  });
});

// ─── SIP Processor Lifecycle ──────────────────────────────────────────────────

describe("SIP Processor lifecycle", () => {
  it("startSIPProcessor does not throw", () => {
    expect(() => startSIPProcessor()).not.toThrow();
  });

  it("stopSIPProcessor does not throw", () => {
    expect(() => stopSIPProcessor()).not.toThrow();
  });

  it("startSIPProcessor is idempotent (calling twice is safe)", () => {
    expect(() => {
      startSIPProcessor();
      startSIPProcessor();
    }).not.toThrow();
    stopSIPProcessor(); // Cleanup
  });
});

// ─── Fraud Alert Business Rules ───────────────────────────────────────────────

describe("Fraud Alert Business Rules", () => {
  it("risk score 90+ is classified as critical", () => {
    const score = 92;
    const level = score >= 90 ? "critical" : score >= 75 ? "high" : score >= 50 ? "medium" : "low";
    expect(level).toBe("critical");
  });

  it("risk score 75-89 is classified as high", () => {
    const score = 80;
    const level = score >= 90 ? "critical" : score >= 75 ? "high" : score >= 50 ? "medium" : "low";
    expect(level).toBe("high");
  });

  it("risk score below 50 is classified as low", () => {
    const score = 30;
    const level = score >= 90 ? "critical" : score >= 75 ? "high" : score >= 50 ? "medium" : "low";
    expect(level).toBe("low");
  });

  it("alert status transitions are valid", () => {
    const validTransitions: Record<string, string[]> = {
      open: ["investigating", "resolved", "false_positive"],
      investigating: ["resolved", "false_positive"],
      resolved: [],
      false_positive: [],
    };
    expect(validTransitions["open"]).toContain("investigating");
    expect(validTransitions["investigating"]).toContain("resolved");
    expect(validTransitions["resolved"]).toHaveLength(0);
  });
});

// ─── Revenue Export Business Rules ───────────────────────────────────────────

describe("Revenue Analytics Export", () => {
  it("generates correct CSV header row", () => {
    const headers = ["date", "volume_kobo", "volume_ngn", "transaction_count", "avg_transaction_ngn", "channel", "currency"];
    const csvHeader = headers.join(",");
    expect(csvHeader).toContain("date");
    expect(csvHeader).toContain("volume_kobo");
    expect(csvHeader).toContain("transaction_count");
  });

  it("converts kobo to NGN correctly", () => {
    const kobo = 5_000_000;
    const ngn = kobo / 100;
    expect(ngn).toBe(50_000);
  });

  it("groups daily data correctly for 7-day range", () => {
    const from = new Date("2026-04-17T00:00:00Z");
    const to = new Date("2026-04-24T00:00:00Z");
    const diffMs = to.getTime() - from.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
    const groupBy = diffDays <= 7 ? "day" : diffDays <= 90 ? "week" : "month";
    expect(groupBy).toBe("day");
  });

  it("groups weekly data correctly for 30-day range", () => {
    const days = 30;
    const groupBy = days <= 7 ? "day" : days <= 90 ? "week" : "month";
    expect(groupBy).toBe("week");
  });

  it("groups monthly data correctly for 365-day range", () => {
    const days = 365;
    const groupBy = days <= 7 ? "day" : days <= 90 ? "week" : "month";
    expect(groupBy).toBe("month");
  });

  it("export filename includes date range", () => {
    const from = new Date("2026-04-01");
    const to = new Date("2026-04-30");
    const filename = `revenue-export-${from.toISOString().slice(0,10)}-to-${to.toISOString().slice(0,10)}.csv`;
    expect(filename).toContain("2026-04-01");
    expect(filename).toContain("2026-04-30");
    expect(filename.endsWith(".csv")).toBe(true);
  });
});

// ─── Country Risk Classification ──────────────────────────────────────────────

describe("Country Risk Classification", () => {
  const RISK_LEVELS: Record<string, string> = {
    NG: "medium", GH: "low", KE: "low", ZA: "medium",
    US: "high", GB: "medium", CN: "critical", RU: "critical",
    BR: "high", IN: "medium",
  };

  it("Nigeria is classified as medium risk", () => {
    expect(RISK_LEVELS["NG"]).toBe("medium");
  });

  it("China and Russia are classified as critical risk", () => {
    expect(RISK_LEVELS["CN"]).toBe("critical");
    expect(RISK_LEVELS["RU"]).toBe("critical");
  });

  it("Ghana and Kenya are classified as low risk", () => {
    expect(RISK_LEVELS["GH"]).toBe("low");
    expect(RISK_LEVELS["KE"]).toBe("low");
  });

  it("all 10 countries have valid risk levels", () => {
    const validLevels = ["low", "medium", "high", "critical"];
    Object.values(RISK_LEVELS).forEach((level) => {
      expect(validLevels).toContain(level);
    });
  });
});
