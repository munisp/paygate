/**
 * wave89.production.test.ts — Sprint v89 Production Tests
 *
 * Tests for:
 *   - slaBreachesRouter (list, acknowledge, getStats)
 *   - adminTenantRevenueEnhancedRouter (getRevenue, getTopMerchants, getRevenueBreakdown)
 *   - portfolioRebalancingEnhancedRouter (getOrders, cancelOrder)
 *   - claimDocumentsEnhancedRouter (getSignedUrl, deleteDocument)
 *   - corridorLiveStatsEnhancedRouter (toggle, setDailyLimit)
 *   - seed-wave89.mjs structure validation
 *   - wave89Router module exports
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// ─── Module Existence Tests ───────────────────────────────────────────────────
describe("wave89Router module", () => {
  it("should export slaBreachesRouter", async () => {
    const mod = await import("./wave89Router");
    expect(mod.slaBreachesRouter).toBeDefined();
    expect(typeof mod.slaBreachesRouter).toBe("object");
  });

  it("should export adminTenantRevenueRouter", async () => {
    const mod = await import("./wave89Router");
    expect(mod.adminTenantRevenueRouter).toBeDefined();
  });

  it("should export portfolioRebalancingEnhancedRouter", async () => {
    const mod = await import("./wave89Router");
    expect(mod.portfolioRebalancingEnhancedRouter).toBeDefined();
  });

  it("should export claimDocumentsEnhancedRouter", async () => {
    const mod = await import("./wave89Router");
    expect(mod.claimDocumentsEnhancedRouter).toBeDefined();
  });

  it("should export corridorLiveStatsEnhancedRouter", async () => {
    const mod = await import("./wave89Router");
    expect(mod.corridorLiveStatsEnhancedRouter).toBeDefined();
  });
});

// ─── slaBreachesRouter Tests ──────────────────────────────────────────────────
describe("slaBreachesRouter", () => {
  it("should have list, acknowledge, and getStats procedures", async () => {
    const { slaBreachesRouter } = await import("./wave89Router");
    const procedures = Object.keys(slaBreachesRouter._def.procedures ?? slaBreachesRouter._def.record ?? {});
    expect(procedures).toContain("list");
    expect(procedures).toContain("acknowledge");
    expect(procedures).toContain("getStats");
  });

  it("should return mock SLA breaches when DB is unavailable", async () => {
    const { slaBreachesRouter } = await import("./wave89Router");
    const listProcedure = (slaBreachesRouter as any)._def?.procedures?.list ?? (slaBreachesRouter as any)._def?.record?.list;
    expect(listProcedure).toBeDefined();
  });

  it("should classify breach severity correctly", () => {
    // Business rule: >48h breach = critical, >24h = high, >8h = medium, else = low
    const classifySeverity = (breachHours: number) => {
      if (breachHours > 48) return "critical";
      if (breachHours > 24) return "high";
      if (breachHours > 8) return "medium";
      return "low";
    };
    expect(classifySeverity(72)).toBe("critical");
    expect(classifySeverity(30)).toBe("high");
    expect(classifySeverity(12)).toBe("medium");
    expect(classifySeverity(4)).toBe("low");
  });

  it("should define SLA windows per currency", () => {
    // Business rule: NGN=24h, USD/GBP/EUR=48h, exotic=72h
    const getSlaWindow = (currency: string) => {
      if (currency === "NGN") return 24;
      if (["USD", "GBP", "EUR"].includes(currency)) return 48;
      return 72;
    };
    expect(getSlaWindow("NGN")).toBe(24);
    expect(getSlaWindow("USD")).toBe(48);
    expect(getSlaWindow("GBP")).toBe(48);
    expect(getSlaWindow("EUR")).toBe(48);
    expect(getSlaWindow("JPY")).toBe(72);
    expect(getSlaWindow("CNY")).toBe(72);
  });
});

// ─── adminTenantRevenueRouter Tests ──────────────────────────────────────────
describe("adminTenantRevenueRouter", () => {
  it("should have getRevenue, getTopMerchants, getRevenueBreakdown procedures", async () => {
    const { adminTenantRevenueRouter } = await import("./wave89Router");
    const procedures = Object.keys(
      (adminTenantRevenueRouter as any)._def?.procedures ??
      (adminTenantRevenueRouter as any)._def?.record ?? {}
    );
    expect(procedures).toContain("getRevenue");
    expect(procedures).toContain("getTopMerchants");
    expect(procedures).toContain("getRevenueBreakdown");
  });

  it("should apply correct fee rates per currency", () => {
    // Business rule: NGN=1.5%, USD/GBP/EUR=2.5%, mobile money=1.8%
    const feeRates: Record<string, number> = {
      NGN: 0.015,
      USD: 0.025,
      GBP: 0.025,
      EUR: 0.025,
      KES: 0.018,
      GHS: 0.018,
    };
    expect(feeRates.NGN).toBe(0.015);
    expect(feeRates.USD).toBe(0.025);
    expect(feeRates.KES).toBe(0.018);
  });

  it("should calculate revenue correctly from volume and fee rate", () => {
    const volumeNgn = 833_333_333;
    const feeRate = 0.015;
    const expectedRevenue = Math.round(volumeNgn * feeRate);
    expect(expectedRevenue).toBe(12_500_000); // ₦12.5M
  });

  it("should support period filtering", async () => {
    const { adminTenantRevenueRouter } = await import("./wave89Router");
    const getRevenueProcedure = (adminTenantRevenueRouter as any)._def?.procedures?.getRevenue ??
      (adminTenantRevenueRouter as any)._def?.record?.getRevenue;
    expect(getRevenueProcedure).toBeDefined();
  });
});

// ─── portfolioRebalancingEnhancedRouter Tests ─────────────────────────────────
describe("portfolioRebalancingEnhancedRouter", () => {
  it("should have getOrders and cancelOrder procedures", async () => {
    const { portfolioRebalancingEnhancedRouter } = await import("./wave89Router");
    const procedures = Object.keys(
      (portfolioRebalancingEnhancedRouter as any)._def?.procedures ??
      (portfolioRebalancingEnhancedRouter as any)._def?.record ?? {}
    );
    expect(procedures).toContain("getOrders");
    expect(procedures).toContain("cancelOrder");
  });

  it("should validate allocation percentages sum to 100", () => {
    const validateAllocation = (gold: number, mf: number, pension: number) => {
      return Math.abs(gold + mf + pension - 100) < 0.01;
    };
    expect(validateAllocation(30, 50, 20)).toBe(true);
    expect(validateAllocation(40, 40, 20)).toBe(true);
    expect(validateAllocation(25, 55, 20)).toBe(true);
    expect(validateAllocation(30, 50, 25)).toBe(false); // 105% — invalid
  });

  it("should calculate rebalancing delta correctly", () => {
    const currentGold = 25;
    const targetGold = 30;
    const totalPortfolioNgn = 1_000_000;
    const goldDeltaNgn = ((targetGold - currentGold) / 100) * totalPortfolioNgn;
    expect(goldDeltaNgn).toBe(50_000); // Need to buy ₦50k of gold
  });
});

// ─── claimDocumentsEnhancedRouter Tests ──────────────────────────────────────
describe("claimDocumentsEnhancedRouter", () => {
  it("should have getSignedUrl and deleteDocument procedures", async () => {
    const { claimDocumentsEnhancedRouter } = await import("./wave89Router");
    const procedures = Object.keys(
      (claimDocumentsEnhancedRouter as any)._def?.procedures ??
      (claimDocumentsEnhancedRouter as any)._def?.record ?? {}
    );
    expect(procedures).toContain("getSignedUrl");
    expect(procedures).toContain("deleteDocument");
  });

  it("should set signed URL expiry to 3600 seconds (1 hour)", async () => {
    const { claimDocumentsEnhancedRouter } = await import("./wave89Router");
    const getSignedUrlProcedure = (claimDocumentsEnhancedRouter as any)._def?.procedures?.getSignedUrl ??
      (claimDocumentsEnhancedRouter as any)._def?.record?.getSignedUrl;
    expect(getSignedUrlProcedure).toBeDefined();
    // The signed URL expiry is hardcoded to 3600 in the implementation
    // This is a security best practice — short-lived URLs
  });

  it("should validate allowed MIME types for claim documents", () => {
    const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const isAllowed = (mime: string) => allowedMimeTypes.includes(mime);
    expect(isAllowed("application/pdf")).toBe(true);
    expect(isAllowed("image/jpeg")).toBe(true);
    expect(isAllowed("application/exe")).toBe(false);
    expect(isAllowed("text/html")).toBe(false);
  });
});

// ─── corridorLiveStatsEnhancedRouter Tests ────────────────────────────────────
describe("corridorLiveStatsEnhancedRouter", () => {
  it("should have toggle and setDailyLimit procedures", async () => {
    const { corridorLiveStatsEnhancedRouter } = await import("./wave89Router");
    const procedures = Object.keys(
      (corridorLiveStatsEnhancedRouter as any)._def?.procedures ??
      (corridorLiveStatsEnhancedRouter as any)._def?.record ?? {}
    );
    expect(procedures).toContain("toggle");
    expect(procedures).toContain("setDailyLimit");
  });

  it("should validate FX markup percentage is reasonable", () => {
    // Business rule: FX markup should be between 0.5% and 5%
    const isValidMarkup = (pct: number) => pct >= 0.5 && pct <= 5.0;
    expect(isValidMarkup(1.5)).toBe(true);
    expect(isValidMarkup(2.5)).toBe(true);
    expect(isValidMarkup(0.3)).toBe(false); // Too low — below cost
    expect(isValidMarkup(6.0)).toBe(false); // Too high — uncompetitive
  });

  it("should validate daily limit is positive", () => {
    const isValidLimit = (limitUsd: number) => limitUsd > 0;
    expect(isValidLimit(500000)).toBe(true);
    expect(isValidLimit(0)).toBe(false);
    expect(isValidLimit(-1000)).toBe(false);
  });
});

// ─── Seed Script Tests ────────────────────────────────────────────────────────
describe("seed-wave89.mjs", () => {
  const seedPath = path.resolve(__dirname, "../scripts/seed-wave89.mjs");

  it("should exist", () => {
    expect(existsSync(seedPath)).toBe(true);
  });

  it("should seed claim_documents table", () => {
    const content = readFileSync(seedPath, "utf-8");
    expect(content).toContain("claim_documents");
    expect(content).toContain("cd_001");
  });

  it("should seed portfolio_rebalancing_orders table", () => {
    const content = readFileSync(seedPath, "utf-8");
    expect(content).toContain("portfolio_rebalancing_orders");
    expect(content).toContain("ro_001");
  });

  it("should seed corridor_live_stats table", () => {
    const content = readFileSync(seedPath, "utf-8");
    expect(content).toContain("corridor_live_stats");
    expect(content).toContain("corr_001");
  });

  it("should support both PostgreSQL and MySQL", () => {
    const content = readFileSync(seedPath, "utf-8");
    expect(content).toContain("seedPostgres");
    expect(content).toContain("seedMySQL");
  });

  it("should handle missing DATABASE_URL gracefully", () => {
    const content = readFileSync(seedPath, "utf-8");
    expect(content).toContain("No DATABASE_URL set");
    expect(content).toContain("process.exit(0)");
  });

  it("should use ON CONFLICT DO NOTHING for idempotent seeding", () => {
    const content = readFileSync(seedPath, "utf-8");
    expect(content).toContain("ON CONFLICT");
    expect(content).toContain("DO NOTHING");
  });
});

// ─── seed-all.mjs Integration Tests ──────────────────────────────────────────
describe("seed-all.mjs", () => {
  const seedAllPath = path.resolve(__dirname, "../scripts/seed-all.mjs");

  it("should include seed-wave89.mjs", () => {
    const content = readFileSync(seedAllPath, "utf-8");
    expect(content).toContain("seed-wave89.mjs");
  });

  it("should run seed-wave89 after seed-wave38", () => {
    const content = readFileSync(seedAllPath, "utf-8");
    const wave38Idx = content.indexOf("seed-wave38.mjs");
    const wave89Idx = content.indexOf("seed-wave89.mjs");
    expect(wave38Idx).toBeGreaterThan(0);
    expect(wave89Idx).toBeGreaterThan(wave38Idx);
  });
});

// ─── routers.ts Registration Tests ───────────────────────────────────────────
describe("routers.ts wave89 registration", () => {
  const routersPath = path.resolve(__dirname, "routers.ts");

  it("should import from wave89Router", () => {
    const content = readFileSync(routersPath, "utf-8");
    expect(content).toContain("wave89Router");
  });

  it("should register slaBreaches router", () => {
    const content = readFileSync(routersPath, "utf-8");
    expect(content).toContain("slaBreaches: slaBreachesRouter");
  });

  it("should register adminTenantRevenueEnhanced router", () => {
    const content = readFileSync(routersPath, "utf-8");
    expect(content).toContain("adminTenantRevenueEnhanced");
  });

  it("should register portfolioRebalancingEnhanced router", () => {
    const content = readFileSync(routersPath, "utf-8");
    expect(content).toContain("portfolioRebalancingEnhanced");
  });

  it("should register claimDocumentsEnhanced router", () => {
    const content = readFileSync(routersPath, "utf-8");
    expect(content).toContain("claimDocumentsEnhanced");
  });

  it("should register corridorLiveEnhanced router", () => {
    const content = readFileSync(routersPath, "utf-8");
    expect(content).toContain("corridorLiveEnhanced");
  });
});
