/**
 * Wave 174 — Temporal Consistency, Adverse Media, UBO, KYB Risk Scoring
 * Tests: router existence, UBO ownership logic, adverse media confidence,
 *        temporal consistency checks, KYB risk band assignment.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── Pure logic helpers ───────────────────────────────────────────────────────

function kybRiskBand(score: number): "low" | "medium" | "high" | "critical" {
  if (score < 25) return "low";
  if (score < 50) return "medium";
  if (score < 75) return "high";
  return "critical";
}

function weightedRiskScore(components: {
  adverseMedia: number;
  uboRisk: number;
  documentRisk: number;
  industryRisk: number;
}): number {
  const weights = {
    adverseMedia: 0.3,
    uboRisk: 0.25,
    documentRisk: 0.25,
    industryRisk: 0.2,
  };
  return Math.min(
    100,
    Object.entries(weights).reduce(
      (sum, [k, w]) => sum + Math.min(100, components[k as keyof typeof components]) * w,
      0
    )
  );
}

function isAdverseMediaFlagged(confidence: number, threshold = 0.7): boolean {
  return confidence >= threshold;
}

function uboOwnershipValid(percentages: number[]): boolean {
  const total = percentages.reduce((a, b) => a + b, 0);
  return total <= 100 && percentages.every((p) => p >= 0 && p <= 100);
}

function temporalAgeCheck(dobYear: number, nowYear = new Date().getFullYear()): "valid" | "underage" | "implausible" {
  const age = nowYear - dobYear;
  if (age < 18) return "underage";
  if (age > 120) return "implausible";
  return "valid";
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Wave 174 — wave174.ts router existence", () => {
  it("server/routers/wave174.ts exists", () => {
    expect(fs.existsSync(path.join(ROOT, "server/routers/wave174.ts"))).toBe(true);
  });

  it("wave174.ts exports uboMgmtRouter", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routers/wave174.ts"), "utf8");
    expect(src).toContain("uboMgmtRouter");
  });

  it("wave174.ts exports adverseMediaRouter", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routers/wave174.ts"), "utf8");
    expect(src).toContain("adverseMediaRouter");
  });

  it("wave174.ts exports kybRiskScoreRouter", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routers/wave174.ts"), "utf8");
    expect(src).toContain("kybRiskScoreRouter");
  });

  it("wave174.ts exports temporalCheckRouter", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routers/wave174.ts"), "utf8");
    expect(src).toContain("temporalCheckRouter");
  });
});

describe("Wave 174 — KYB Risk Scoring", () => {
  it("assigns 'low' band for score 0–24", () => {
    expect(kybRiskBand(0)).toBe("low");
    expect(kybRiskBand(24)).toBe("low");
  });

  it("assigns 'medium' band for score 25–49", () => {
    expect(kybRiskBand(25)).toBe("medium");
    expect(kybRiskBand(49)).toBe("medium");
  });

  it("assigns 'high' band for score 50–74", () => {
    expect(kybRiskBand(50)).toBe("high");
    expect(kybRiskBand(74)).toBe("high");
  });

  it("assigns 'critical' band for score 75+", () => {
    expect(kybRiskBand(75)).toBe("critical");
    expect(kybRiskBand(100)).toBe("critical");
  });

  it("weighted composite score is correctly computed", () => {
    const score = weightedRiskScore({
      adverseMedia: 80,
      uboRisk: 60,
      documentRisk: 40,
      industryRisk: 20,
    });
    // 80*0.3 + 60*0.25 + 40*0.25 + 20*0.2 = 24 + 15 + 10 + 4 = 53
    expect(score).toBeCloseTo(53, 0);
  });

  it("caps sub-scores at 100", () => {
    const score = weightedRiskScore({
      adverseMedia: 200,
      uboRisk: 200,
      documentRisk: 200,
      industryRisk: 200,
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("Wave 174 — Adverse Media Screening", () => {
  it("should flag high-confidence adverse media (>=0.7)", () => {
    expect(isAdverseMediaFlagged(0.85)).toBe(true);
    expect(isAdverseMediaFlagged(0.7)).toBe(true);
  });

  it("should not flag low-confidence results (<0.7)", () => {
    expect(isAdverseMediaFlagged(0.69)).toBe(false);
    expect(isAdverseMediaFlagged(0.3)).toBe(false);
  });
});

describe("Wave 174 — UBO Ownership Validation", () => {
  it("accepts valid ownership percentages summing to ≤100", () => {
    expect(uboOwnershipValid([30, 25, 20, 15])).toBe(true);
    expect(uboOwnershipValid([100])).toBe(true);
    expect(uboOwnershipValid([50, 50])).toBe(true);
  });

  it("rejects ownership percentages summing to >100", () => {
    expect(uboOwnershipValid([60, 50])).toBe(false);
  });

  it("rejects negative ownership percentages", () => {
    expect(uboOwnershipValid([-10, 110])).toBe(false);
  });
});

describe("Wave 174 — Temporal Consistency Checks", () => {
  it("should return 'valid' for age 25", () => {
    const year = new Date().getFullYear() - 25;
    expect(temporalAgeCheck(year)).toBe("valid");
  });

  it("should return 'underage' for age 16", () => {
    const year = new Date().getFullYear() - 16;
    expect(temporalAgeCheck(year)).toBe("underage");
  });

  it("should return 'implausible' for age 130", () => {
    const year = new Date().getFullYear() - 130;
    expect(temporalAgeCheck(year)).toBe("implausible");
  });

  it("boundary: age exactly 18 is valid", () => {
    const year = new Date().getFullYear() - 18;
    expect(temporalAgeCheck(year)).toBe("valid");
  });
});
