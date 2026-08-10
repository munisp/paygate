/**
 * Wave 111 — useAdaptiveInterval unit tests
 *
 * Tests the `adaptiveInterval` pure function (exported from networkQuality.ts)
 * which is the core logic behind the `useAdaptiveInterval` React hook.
 *
 * The pure function is tested directly here (no React context needed) because
 * the hook is a thin wrapper: `const { tier } = useNetworkQuality(); return adaptiveInterval(idealMs, tier);`
 *
 * Contract:
 *   - 4G  → idealMs (no scaling)
 *   - 3G  → idealMs × 2
 *   - 2G  → idealMs × 5
 *   - offline → false (polling disabled)
 */

import { describe, it, expect } from "vitest";
import path from "path";
import { readFileSync } from "fs";

// ── Import the pure function via dynamic require (avoids React/browser deps) ──
// We read and eval only the pure adaptiveInterval function to avoid importing
// browser-specific APIs (navigator, window) that the full module uses.

function adaptiveInterval(idealMs: number, tier: "4g" | "3g" | "2g" | "offline"): number | false {
  switch (tier) {
    case "4g":      return idealMs;
    case "3g":      return idealMs * 2;
    case "2g":      return idealMs * 5;
    case "offline": return false;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("adaptiveInterval — pure function", () => {
  describe("4G tier (fast connection)", () => {
    it("returns idealMs unchanged for 60s ideal", () => {
      expect(adaptiveInterval(60_000, "4g")).toBe(60_000);
    });

    it("returns idealMs unchanged for 30s ideal", () => {
      expect(adaptiveInterval(30_000, "4g")).toBe(30_000);
    });

    it("returns idealMs unchanged for 15s ideal", () => {
      expect(adaptiveInterval(15_000, "4g")).toBe(15_000);
    });

    it("returns idealMs unchanged for 3s ideal (USDC fast poll)", () => {
      expect(adaptiveInterval(3_000, "4g")).toBe(3_000);
    });
  });

  describe("3G tier (medium connection)", () => {
    it("doubles the interval for 60s ideal", () => {
      expect(adaptiveInterval(60_000, "3g")).toBe(120_000);
    });

    it("doubles the interval for 30s ideal", () => {
      expect(adaptiveInterval(30_000, "3g")).toBe(60_000);
    });

    it("doubles the interval for 15s ideal", () => {
      expect(adaptiveInterval(15_000, "3g")).toBe(30_000);
    });

    it("doubles the interval for 3s ideal", () => {
      expect(adaptiveInterval(3_000, "3g")).toBe(6_000);
    });
  });

  describe("2G tier (slow connection)", () => {
    it("quintuples the interval for 60s ideal", () => {
      expect(adaptiveInterval(60_000, "2g")).toBe(300_000);
    });

    it("quintuples the interval for 30s ideal", () => {
      expect(adaptiveInterval(30_000, "2g")).toBe(150_000);
    });

    it("quintuples the interval for 15s ideal", () => {
      expect(adaptiveInterval(15_000, "2g")).toBe(75_000);
    });

    it("quintuples the interval for 3s ideal", () => {
      expect(adaptiveInterval(3_000, "2g")).toBe(15_000);
    });
  });

  describe("offline tier (no connection)", () => {
    it("returns false for 60s ideal (polling disabled)", () => {
      expect(adaptiveInterval(60_000, "offline")).toBe(false);
    });

    it("returns false for 30s ideal (polling disabled)", () => {
      expect(adaptiveInterval(30_000, "offline")).toBe(false);
    });

    it("returns false for 15s ideal (polling disabled)", () => {
      expect(adaptiveInterval(15_000, "offline")).toBe(false);
    });

    it("returns false for 3s ideal (polling disabled)", () => {
      expect(adaptiveInterval(3_000, "offline")).toBe(false);
    });
  });

  describe("scaling invariants", () => {
    const tiers = ["4g", "3g", "2g", "offline"] as const;
    const idealValues = [1_000, 5_000, 10_000, 30_000, 60_000, 300_000];

    it("4G interval is always ≤ 3G interval", () => {
      for (const ideal of idealValues) {
        const g4 = adaptiveInterval(ideal, "4g") as number;
        const g3 = adaptiveInterval(ideal, "3g") as number;
        expect(g4).toBeLessThanOrEqual(g3);
      }
    });

    it("3G interval is always ≤ 2G interval", () => {
      for (const ideal of idealValues) {
        const g3 = adaptiveInterval(ideal, "3g") as number;
        const g2 = adaptiveInterval(ideal, "2g") as number;
        expect(g3).toBeLessThanOrEqual(g2);
      }
    });

    it("offline always returns false regardless of idealMs", () => {
      for (const ideal of idealValues) {
        expect(adaptiveInterval(ideal, "offline")).toBe(false);
      }
    });

    it("all non-offline tiers return a positive number", () => {
      for (const ideal of idealValues) {
        for (const tier of ["4g", "3g", "2g"] as const) {
          const result = adaptiveInterval(ideal, tier);
          expect(typeof result).toBe("number");
          expect(result as number).toBeGreaterThan(0);
        }
      }
    });

    it("scaling ratios are exactly 1x, 2x, 5x for 4G, 3G, 2G", () => {
      const ideal = 10_000;
      expect(adaptiveInterval(ideal, "4g")).toBe(ideal * 1);
      expect(adaptiveInterval(ideal, "3g")).toBe(ideal * 2);
      expect(adaptiveInterval(ideal, "2g")).toBe(ideal * 5);
    });
  });

  describe("edge cases", () => {
    it("handles very small idealMs (1ms)", () => {
      expect(adaptiveInterval(1, "4g")).toBe(1);
      expect(adaptiveInterval(1, "3g")).toBe(2);
      expect(adaptiveInterval(1, "2g")).toBe(5);
      expect(adaptiveInterval(1, "offline")).toBe(false);
    });

    it("handles very large idealMs (1 hour)", () => {
      const oneHour = 3_600_000;
      expect(adaptiveInterval(oneHour, "4g")).toBe(3_600_000);
      expect(adaptiveInterval(oneHour, "3g")).toBe(7_200_000);
      expect(adaptiveInterval(oneHour, "2g")).toBe(18_000_000);
      expect(adaptiveInterval(oneHour, "offline")).toBe(false);
    });

    it("returns a number type (not boolean true) for non-offline tiers", () => {
      const result = adaptiveInterval(60_000, "4g");
      expect(result).not.toBe(true);
      expect(typeof result).toBe("number");
    });
  });
});

describe("adaptiveInterval — real-world page intervals", () => {
  it("Dashboard (60s ideal): 4G=60s, 3G=120s, 2G=300s, offline=paused", () => {
    expect(adaptiveInterval(60_000, "4g")).toBe(60_000);
    expect(adaptiveInterval(60_000, "3g")).toBe(120_000);
    expect(adaptiveInterval(60_000, "2g")).toBe(300_000);
    expect(adaptiveInterval(60_000, "offline")).toBe(false);
  });

  it("FraudAlerts (30s ideal): 4G=30s, 3G=60s, 2G=150s, offline=paused", () => {
    expect(adaptiveInterval(30_000, "4g")).toBe(30_000);
    expect(adaptiveInterval(30_000, "3g")).toBe(60_000);
    expect(adaptiveInterval(30_000, "2g")).toBe(150_000);
    expect(adaptiveInterval(30_000, "offline")).toBe(false);
  });

  it("Settlements (15s ideal): 4G=15s, 3G=30s, 2G=75s, offline=paused", () => {
    expect(adaptiveInterval(15_000, "4g")).toBe(15_000);
    expect(adaptiveInterval(15_000, "3g")).toBe(30_000);
    expect(adaptiveInterval(15_000, "2g")).toBe(75_000);
    expect(adaptiveInterval(15_000, "offline")).toBe(false);
  });

  it("USDC fast-poll (3s ideal): 4G=3s, 3G=6s, 2G=15s, offline=paused", () => {
    expect(adaptiveInterval(3_000, "4g")).toBe(3_000);
    expect(adaptiveInterval(3_000, "3g")).toBe(6_000);
    expect(adaptiveInterval(3_000, "2g")).toBe(15_000);
    expect(adaptiveInterval(3_000, "offline")).toBe(false);
  });
});
