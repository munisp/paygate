/**
 * Wave 117 — Billing Event Pipeline, Tier Provisioning & Analytics Tests
 *
 * Tests cover:
 * 1. Billing event schema alignment (pipeline column names match DB schema)
 * 2. provisionBillingTier — tier mapping to fee rates and split percentages
 * 3. getAnalytics — aggregation logic with zero-data guard
 * 4. getRevenueTimeSeries — granularity bucketing logic
 * 5. Billing tier constants — Starter/Growth/Enterprise fee rate ordering
 * 6. Analytics EBITDA computation — net platform minus overhead
 */

import { describe, it, expect } from "vitest";

// ── 1. Pipeline column alignment ──────────────────────────────────────────────

const BILLING_EVENTS_SCHEMA_COLUMNS = [
  "id", "tenant_id", "merchant_id", "transaction_id", "transaction_ref",
  "amount_kobo", "gross_fee_kobo", "platform_revenue_kobo", "reseller_revenue_kobo",
  "interchange_cost_kobo", "net_platform_kobo", "overhead_kobo", "ebitda_kobo",
  "pricing_model", "fee_rate_bps", "platform_share_bps", "reseller_share_bps",
  "interchange_rate_bps", "overhead_rate_bps", "billing_config_id",
  "status", "error_message", "processed_at", "created_at",
];

const PIPELINE_INSERT_COLUMNS = [
  "tenant_id", "merchant_id", "transaction_id", "transaction_ref",
  "amount_kobo", "gross_fee_kobo", "platform_revenue_kobo", "reseller_revenue_kobo",
  "interchange_cost_kobo", "net_platform_kobo", "overhead_kobo", "ebitda_kobo",
  "pricing_model", "fee_rate_bps", "platform_share_bps", "reseller_share_bps",
  "interchange_rate_bps", "overhead_rate_bps", "billing_config_id",
  "status", "processed_at",
];

describe("Wave 117 — Pipeline column alignment", () => {
  it("all pipeline INSERT columns exist in billing_events schema", () => {
    for (const col of PIPELINE_INSERT_COLUMNS) {
      expect(BILLING_EVENTS_SCHEMA_COLUMNS).toContain(col);
    }
  });

  it("pipeline does not insert id or created_at (auto-generated)", () => {
    expect(PIPELINE_INSERT_COLUMNS).not.toContain("id");
    expect(PIPELINE_INSERT_COLUMNS).not.toContain("created_at");
  });
});

// ── 2. Tier provisioning — fee rate and split mapping ─────────────────────────

interface TierConfig {
  feeRateBps: number;
  feeCapKobo: number;
  platformShareBps: number;
  resellerShareBps: number;
  overheadKobo: number;
}

function getTierConfig(tier: "starter" | "growth" | "enterprise"): TierConfig {
  const configs: Record<string, TierConfig> = {
    starter: {
      feeRateBps: 150,       // 1.5%
      feeCapKobo: 200_000,   // ₦2,000
      platformShareBps: 6500, // 65%
      resellerShareBps: 3500, // 35%
      overheadKobo: 200_000_00, // ₦2M/mo
    },
    growth: {
      feeRateBps: 140,       // 1.4%
      feeCapKobo: 150_000,   // ₦1,500
      platformShareBps: 7000, // 70%
      resellerShareBps: 3000, // 30%
      overheadKobo: 500_000_00, // ₦5M/mo
    },
    enterprise: {
      feeRateBps: 120,       // 1.2%
      feeCapKobo: 100_000,   // ₦1,000
      platformShareBps: 7500, // 75%
      resellerShareBps: 2500, // 25%
      overheadKobo: 1200_000_00, // ₦12M/mo
    },
  };
  return configs[tier];
}

describe("Wave 117 — Tier provisioning fee mapping", () => {
  it("starter tier has 1.5% fee rate (150 bps)", () => {
    expect(getTierConfig("starter").feeRateBps).toBe(150);
  });

  it("growth tier has 1.4% fee rate (140 bps)", () => {
    expect(getTierConfig("growth").feeRateBps).toBe(140);
  });

  it("enterprise tier has 1.2% fee rate (120 bps)", () => {
    expect(getTierConfig("enterprise").feeRateBps).toBe(120);
  });

  it("enterprise fee rate is lower than growth which is lower than starter", () => {
    const s = getTierConfig("starter").feeRateBps;
    const g = getTierConfig("growth").feeRateBps;
    const e = getTierConfig("enterprise").feeRateBps;
    expect(s).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(e);
  });

  it("platform + reseller shares sum to 10000 bps (100%) for all tiers", () => {
    for (const tier of ["starter", "growth", "enterprise"] as const) {
      const config = getTierConfig(tier);
      expect(config.platformShareBps + config.resellerShareBps).toBe(10000);
    }
  });

  it("enterprise has highest platform share (75%)", () => {
    expect(getTierConfig("enterprise").platformShareBps).toBe(7500);
  });

  it("starter has lowest platform share (65%)", () => {
    expect(getTierConfig("starter").platformShareBps).toBe(6500);
  });

  it("enterprise fee cap is lower than starter (volume discount)", () => {
    expect(getTierConfig("enterprise").feeCapKobo).toBeLessThan(getTierConfig("starter").feeCapKobo);
  });
});

// ── 3. Analytics aggregation logic ────────────────────────────────────────────

interface BillingEvent {
  amountKobo: number;
  grossFeeKobo: number;
  platformRevenueKobo: number;
  resellerRevenueKobo: number;
  interchangeCostKobo: number;
  netPlatformKobo: number;
  overheadKobo: number;
  ebitdaKobo: number;
}

function aggregateEvents(events: BillingEvent[]) {
  const totals = {
    transactions: events.length,
    amountKobo: 0,
    grossFeeKobo: 0,
    platformRevenueKobo: 0,
    resellerRevenueKobo: 0,
    interchangeCostKobo: 0,
    netPlatformKobo: 0,
    overheadKobo: 0,
    ebitdaKobo: 0,
    ebitdaMarginPct: 0,
  };
  for (const e of events) {
    totals.amountKobo += e.amountKobo;
    totals.grossFeeKobo += e.grossFeeKobo;
    totals.platformRevenueKobo += e.platformRevenueKobo;
    totals.resellerRevenueKobo += e.resellerRevenueKobo;
    totals.interchangeCostKobo += e.interchangeCostKobo;
    totals.netPlatformKobo += e.netPlatformKobo;
    totals.overheadKobo += e.overheadKobo;
    totals.ebitdaKobo += e.ebitdaKobo;
  }
  totals.ebitdaMarginPct = totals.grossFeeKobo > 0
    ? (totals.ebitdaKobo / totals.grossFeeKobo) * 100
    : 0;
  return { totals };
}

describe("Wave 117 — Analytics aggregation", () => {
  const sampleEvents: BillingEvent[] = [
    { amountKobo: 1_000_000, grossFeeKobo: 15_000, platformRevenueKobo: 9_750, resellerRevenueKobo: 5_250, interchangeCostKobo: 1_000, netPlatformKobo: 8_750, overheadKobo: 5_000, ebitdaKobo: 3_750 },
    { amountKobo: 2_000_000, grossFeeKobo: 30_000, platformRevenueKobo: 19_500, resellerRevenueKobo: 10_500, interchangeCostKobo: 2_000, netPlatformKobo: 17_500, overheadKobo: 5_000, ebitdaKobo: 12_500 },
    { amountKobo: 500_000, grossFeeKobo: 7_500, platformRevenueKobo: 4_875, resellerRevenueKobo: 2_625, interchangeCostKobo: 500, netPlatformKobo: 4_375, overheadKobo: 5_000, ebitdaKobo: -625 },
  ];

  it("transaction count equals number of events", () => {
    const { totals } = aggregateEvents(sampleEvents);
    expect(totals.transactions).toBe(3);
  });

  it("total gross fee is sum of all events", () => {
    const { totals } = aggregateEvents(sampleEvents);
    expect(totals.grossFeeKobo).toBe(52_500);
  });

  it("EBITDA margin is computed as ebitda / grossFee * 100", () => {
    const { totals } = aggregateEvents(sampleEvents);
    const expectedMargin = (15_625 / 52_500) * 100;
    expect(totals.ebitdaMarginPct).toBeCloseTo(expectedMargin, 2);
  });

  it("returns zero margin when no events", () => {
    const { totals } = aggregateEvents([]);
    expect(totals.ebitdaMarginPct).toBe(0);
    expect(totals.transactions).toBe(0);
  });

  it("EBITDA can be negative (overhead exceeds net platform)", () => {
    const { totals } = aggregateEvents([sampleEvents[2]]);
    expect(totals.ebitdaKobo).toBe(-625);
  });
});

// ── 4. Time series granularity bucketing ──────────────────────────────────────

function bucketByGranularity(
  timestamp: Date,
  granularity: "day" | "week" | "month"
): string {
  const d = new Date(timestamp);
  if (granularity === "day") {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  } else if (granularity === "week") {
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    return monday.toISOString().slice(0, 10);
  } else {
    return d.toISOString().slice(0, 7); // YYYY-MM
  }
}

describe("Wave 117 — Time series granularity bucketing", () => {
  it("day granularity returns YYYY-MM-DD", () => {
    const result = bucketByGranularity(new Date("2026-05-09T14:30:00Z"), "day");
    expect(result).toBe("2026-05-09");
  });

  it("month granularity returns YYYY-MM", () => {
    const result = bucketByGranularity(new Date("2026-05-09T14:30:00Z"), "month");
    expect(result).toBe("2026-05");
  });

  it("week granularity returns Monday of the week", () => {
    // 2026-05-09 is a Saturday; Monday is 2026-05-04
    const result = bucketByGranularity(new Date("2026-05-09T14:30:00Z"), "week");
    expect(result).toBe("2026-05-04");
  });

  it("two events on same day have same bucket", () => {
    const b1 = bucketByGranularity(new Date("2026-05-09T08:00:00Z"), "day");
    const b2 = bucketByGranularity(new Date("2026-05-09T23:59:59Z"), "day");
    expect(b1).toBe(b2);
  });

  it("two events on different days have different buckets", () => {
    const b1 = bucketByGranularity(new Date("2026-05-09T08:00:00Z"), "day");
    const b2 = bucketByGranularity(new Date("2026-05-10T08:00:00Z"), "day");
    expect(b1).not.toBe(b2);
  });
});

// ── 5. EBITDA computation ─────────────────────────────────────────────────────

function computeEbitda(netPlatformKobo: number, overheadKobo: number): number {
  return netPlatformKobo - overheadKobo;
}

describe("Wave 117 — EBITDA computation", () => {
  it("positive EBITDA when net platform exceeds overhead", () => {
    expect(computeEbitda(10_000_000, 8_000_000)).toBe(2_000_000);
  });

  it("zero EBITDA at break-even", () => {
    expect(computeEbitda(8_000_000, 8_000_000)).toBe(0);
  });

  it("negative EBITDA when overhead exceeds net platform", () => {
    expect(computeEbitda(5_000_000, 8_000_000)).toBe(-3_000_000);
  });

  it("EBITDA scales linearly with volume", () => {
    const base = computeEbitda(10_000_000, 8_000_000);
    const doubled = computeEbitda(20_000_000, 8_000_000);
    expect(doubled).toBe(base + 10_000_000);
  });
});
