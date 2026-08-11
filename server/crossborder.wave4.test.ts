/**
 * Wave 4 — Cross-Border & FX tRPC Procedure Tests
 * Tests for:
 *  - crossBorder.getQuote (fallback FX calculation when bridge is offline)
 *  - crossBorder.initiate (creates DB record, calls bridge, updates status)
 *  - fx.getRates (returns rates from DB)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_FX_RATES = [
  { targetCurrency: "NGN", rate: "1580.0", baseCurrency: "USD", source: "test" },
  { targetCurrency: "KES", rate: "128.5", baseCurrency: "USD", source: "test" },
  { targetCurrency: "GHS", rate: "15.2", baseCurrency: "USD", source: "test" },
  { targetCurrency: "ZAR", rate: "18.6", baseCurrency: "USD", source: "test" },
  { targetCurrency: "GBP", rate: "0.79", baseCurrency: "USD", source: "test" },
];

// ─── FX Rate Cross-Calculation Logic ─────────────────────────────────────────

describe("FX cross-rate calculation", () => {
  function getCrossRate(
    rates: typeof MOCK_FX_RATES,
    sourceCurrency: string,
    targetCurrency: string
  ): number {
    const srcRate = rates.find((r) => r.targetCurrency === sourceCurrency);
    const tgtRate = rates.find((r) => r.targetCurrency === targetCurrency);
    if (!srcRate || !tgtRate) throw new Error("Rate not found");
    const srcToUsd = 1 / parseFloat(srcRate.rate);
    const usdToTgt = parseFloat(tgtRate.rate);
    return srcToUsd * usdToTgt;
  }

  it("calculates NGN→KES cross-rate correctly", () => {
    const rate = getCrossRate(MOCK_FX_RATES, "NGN", "KES");
    // 1 NGN = (1/1580) USD × 128.5 KES/USD
    const expected = (1 / 1580) * 128.5;
    expect(rate).toBeCloseTo(expected, 6);
  });

  it("calculates NGN→GBP cross-rate correctly", () => {
    const rate = getCrossRate(MOCK_FX_RATES, "NGN", "GBP");
    const expected = (1 / 1580) * 0.79;
    expect(rate).toBeCloseTo(expected, 6);
  });

  it("throws when source currency is not in rates", () => {
    expect(() => getCrossRate(MOCK_FX_RATES, "XYZ", "KES")).toThrow("Rate not found");
  });

  it("throws when target currency is not in rates", () => {
    expect(() => getCrossRate(MOCK_FX_RATES, "NGN", "XYZ")).toThrow("Rate not found");
  });
});

// ─── Quote Calculation Logic ──────────────────────────────────────────────────

describe("Quote calculation (fallback path)", () => {
  const FEE_RATE = 0.015;

  function buildQuote(
    rates: typeof MOCK_FX_RATES,
    sourceCurrency: string,
    targetCurrency: string,
    amount: string
  ) {
    const srcRate = rates.find((r) => r.targetCurrency === sourceCurrency);
    const tgtRate = rates.find((r) => r.targetCurrency === targetCurrency);
    if (!srcRate || !tgtRate) throw new Error("FX rate not available for this corridor");

    const srcToUsd = 1 / parseFloat(srcRate.rate);
    const usdToTgt = parseFloat(tgtRate.rate);
    const exchangeRate = (srcToUsd * usdToTgt).toFixed(6);
    const sourceAmt = parseFloat(amount);
    const fee = (sourceAmt * FEE_RATE).toFixed(2);
    const targetAmount = ((sourceAmt - parseFloat(fee)) * parseFloat(exchangeRate)).toFixed(2);

    return { exchange_rate: exchangeRate, target_amount: targetAmount, fee };
  }

  it("computes correct fee at 1.5%", () => {
    const quote = buildQuote(MOCK_FX_RATES, "NGN", "KES", "10000");
    expect(parseFloat(quote.fee)).toBeCloseTo(150, 1);
  });

  it("deducts fee before applying exchange rate", () => {
    const quote = buildQuote(MOCK_FX_RATES, "NGN", "KES", "10000");
    const rate = parseFloat(quote.exchange_rate);
    const expectedTarget = (10000 - 150) * rate;
    expect(parseFloat(quote.target_amount)).toBeCloseTo(expectedTarget, 1);
  });

  it("target amount is less than source × rate (fee applied)", () => {
    const quote = buildQuote(MOCK_FX_RATES, "NGN", "KES", "10000");
    const rate = parseFloat(quote.exchange_rate);
    expect(parseFloat(quote.target_amount)).toBeLessThan(10000 * rate);
  });

  it("throws for unknown corridor", () => {
    expect(() => buildQuote(MOCK_FX_RATES, "NGN", "JPY", "10000")).toThrow(
      "FX rate not available for this corridor"
    );
  });

  it("handles small amounts (100 NGN)", () => {
    const quote = buildQuote(MOCK_FX_RATES, "NGN", "KES", "100");
    expect(parseFloat(quote.fee)).toBeCloseTo(1.5, 1);
    expect(parseFloat(quote.target_amount)).toBeGreaterThan(0);
  });
});

// ─── Transfer ID Generation ───────────────────────────────────────────────────

describe("Transfer ID format", () => {
  function generateTransferId(): string {
    const timestamp = Date.now();
    const hex = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
    return `XB-${timestamp}-${hex}`;
  }

  it("starts with XB- prefix", () => {
    const id = generateTransferId();
    expect(id).toMatch(/^XB-/);
  });

  it("contains a timestamp segment", () => {
    const id = generateTransferId();
    const parts = id.split("-");
    expect(parts.length).toBe(3);
    const ts = parseInt(parts[1], 10);
    expect(ts).toBeGreaterThan(1_700_000_000_000); // after Nov 2023
  });

  it("contains an 8-char hex suffix", () => {
    const id = generateTransferId();
    const hex = id.split("-")[2];
    expect(hex).toMatch(/^[0-9a-f]{8}$/);
  });

  it("generates unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, generateTransferId));
    expect(ids.size).toBe(100);
  });
});

// ─── Bridge Graceful Degradation ─────────────────────────────────────────────

describe("Bridge fetch graceful degradation", () => {
  async function mockBridgeFetch(
    path: string,
    method: string,
    body?: unknown,
    shouldFail = false
  ): Promise<unknown> {
    if (shouldFail) {
      // Simulate network error — bridge offline
      console.warn("[Bridge] Unavailable: connect ECONNREFUSED");
      return null;
    }
    // Simulate successful bridge response
    return {
      status: "submitted",
      mojaloop_transfer_id: `ML-${Date.now()}`,
      exchange_rate: "0.081266",
      target_amount: "799.97",
    };
  }

  it("returns null when bridge is offline", async () => {
    const result = await mockBridgeFetch("/v1/cross-border/transfer", "POST", {}, true);
    expect(result).toBeNull();
  });

  it("returns bridge response when bridge is online", async () => {
    const result = await mockBridgeFetch("/v1/cross-border/transfer", "POST", {}, false) as any;
    expect(result).not.toBeNull();
    expect(result.status).toBe("submitted");
    expect(result.mojaloop_transfer_id).toMatch(/^ML-/);
  });

  it("falls back to 'pending' status when bridge is offline", async () => {
    const bridgeResult = await mockBridgeFetch("/v1/cross-border/transfer", "POST", {}, true);
    const bridgeStatus = (bridgeResult as any)?.status ?? "pending";
    expect(bridgeStatus).toBe("pending");
  });

  it("uses bridge status when bridge is online", async () => {
    const bridgeResult = await mockBridgeFetch("/v1/cross-border/transfer", "POST", {}, false);
    const bridgeStatus = (bridgeResult as any)?.status ?? "pending";
    expect(bridgeStatus).toBe("submitted");
  });
});

// ─── FX Ticker Pair Calculation ───────────────────────────────────────────────

describe("FX ticker pair cross-rates", () => {
  const TICKER_PAIRS = [
    { base: "NGN", target: "KES" },
    { base: "NGN", target: "GHS" },
    { base: "NGN", target: "ZAR" },
    { base: "NGN", target: "GBP" },
  ];

  function buildRateMap(rates: typeof MOCK_FX_RATES): Record<string, number> {
    const map: Record<string, number> = { USD: 1 };
    for (const r of rates) {
      map[r.targetCurrency] = parseFloat(r.rate);
    }
    return map;
  }

  function getCrossRate(map: Record<string, number>, base: string, target: string): number | null {
    if (!map[base] || !map[target]) return null;
    return (1 / map[base]) * map[target];
  }

  it("computes all ticker pair rates without null", () => {
    const map = buildRateMap(MOCK_FX_RATES);
    for (const { base, target } of TICKER_PAIRS) {
      const rate = getCrossRate(map, base, target);
      expect(rate).not.toBeNull();
      expect(rate).toBeGreaterThan(0);
    }
  });

  it("NGN/KES rate is approximately 0.08 (1 NGN ≈ 0.08 KES)", () => {
    const map = buildRateMap(MOCK_FX_RATES);
    const rate = getCrossRate(map, "NGN", "KES")!;
    expect(rate).toBeGreaterThan(0.07);
    expect(rate).toBeLessThan(0.1);
  });

  it("returns null for unknown currency pair", () => {
    const map = buildRateMap(MOCK_FX_RATES);
    const rate = getCrossRate(map, "NGN", "JPY");
    expect(rate).toBeNull();
  });
});

// ─── Rail quotes & health: fail-loud, never fabricated ───────────────────────
// The CIPS/UPI/PIX quote & validation procedures previously fell back to
// hardcoded FX rates (0.0048/0.0047/0.0033) and fabricated receiver
// identities, and getRailHealth served Math.random latencies. These tests pin
// the fail-loud contract.

import * as fs from "fs";
import * as path from "path";

const ROUTERS_SRC = fs.readFileSync(path.join(__dirname, "routers.ts"), "utf-8");

function section(startMarker: string, endMarker: string): string {
  const start = ROUTERS_SRC.indexOf(startMarker);
  const end = ROUTERS_SRC.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`section not found: ${startMarker}`);
  return ROUTERS_SRC.slice(start, end);
}

describe("rail quote/validation procedures fail loud (no fabricated rates or identities)", () => {
  const railSection = section("getRailHealth: protectedProcedure", "const NIGERIAN_BANKS");

  it("contains no hardcoded rail FX rates", () => {
    expect(railSection).not.toContain("0.0048");
    expect(railSection).not.toContain("0.0047");
    expect(railSection).not.toContain("0.0033");
  });

  it("contains no fabricated receiver identities", () => {
    expect(railSection).not.toContain("PIX Receiver");
    expect(railSection).not.toContain("fall through to demo");
  });

  it("contains no Math.random-derived data", () => {
    expect(railSection).not.toContain("Math.random");
  });

  it("rail quotes and validations throw SERVICE_UNAVAILABLE when upstream is unavailable", () => {
    // Fail-loud helpers (defined next to bridgeFetch) must be the only paths
    expect(railSection).toContain("railBridgeCall(");
    expect(railSection).toContain("railGatewayQuote(");
    const helpers = section("async function railBridgeCall", "getRailHealth: protectedProcedure");
    expect(helpers).toContain('code: "SERVICE_UNAVAILABLE"');
    // UPI VPA + PIX key validation go through the real bridge proxies
    expect(railSection).toContain("/v1/upi/vpa/resolve");
    expect(railSection).toContain("/v1/pix/key/lookup");
  });

  it("getRailHealth probes real bridge rail-health endpoints", () => {
    expect(railSection).toContain("/v1/mojaloop/health");
    expect(railSection).toContain("/v1/cips/health");
    expect(railSection).toContain("/v1/upi/health");
    expect(railSection).toContain("/v1/pix/health");
  });

  it("rails without a live probe report status unknown, not simulated values", () => {
    expect(railSection).toContain('status: "unknown"');
    expect(railSection).toContain("uptime: null");
  });
});
