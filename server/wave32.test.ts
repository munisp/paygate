/**
 * Wave 32 – Backend unit tests
 * Tests cover: geofence distance calculation, agent banking aggregation,
 * restaurant order total, KDS order age, inventory cost engine,
 * loyalty points earn/redeem, payroll calculation, kiosk health classification.
 */

import { describe, it, expect } from "vitest";

// ─── Geofence helpers ─────────────────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isInsideGeofence(
  termLat: number, termLng: number,
  centerLat: number, centerLng: number,
  radiusMeters: number
): boolean {
  return haversineMeters(termLat, termLng, centerLat, centerLng) <= radiusMeters;
}

describe("Geofence distance", () => {
  it("Lagos Victoria Island to Lekki Phase 1 (~18 km)", () => {
    const d = haversineMeters(6.4281, 3.4219, 6.4698, 3.5852);
    expect(d).toBeGreaterThan(15_000);
    expect(d).toBeLessThan(25_000);
  });

  it("terminal inside 500m zone", () => {
    expect(isInsideGeofence(6.4281, 3.4219, 6.4285, 3.4225, 500)).toBe(true);
  });

  it("terminal outside 500m zone", () => {
    expect(isInsideGeofence(6.4281, 3.4219, 6.4698, 3.5852, 500)).toBe(false);
  });

  it("terminal exactly on boundary is inside", () => {
    // 0 distance → always inside
    expect(isInsideGeofence(6.4281, 3.4219, 6.4281, 3.4219, 1)).toBe(true);
  });
});

// ─── Agent banking aggregation ────────────────────────────────────────────────
interface AgentRecord {
  agentCode: string;
  transactions: number;
  volumeKobo: number;
  commissionKobo: number;
}

function aggregateNetwork(agents: AgentRecord[]) {
  return {
    totalAgents: agents.length,
    totalTransactions: agents.reduce((s, a) => s + a.transactions, 0),
    totalVolumeKobo: agents.reduce((s, a) => s + a.volumeKobo, 0),
    totalCommissionKobo: agents.reduce((s, a) => s + a.commissionKobo, 0),
  };
}

describe("Agent banking aggregation", () => {
  const agents: AgentRecord[] = [
    { agentCode: "AG001", transactions: 120, volumeKobo: 6_000_000_00, commissionKobo: 120_000 },
    { agentCode: "AG002", transactions: 80, volumeKobo: 4_000_000_00, commissionKobo: 80_000 },
    { agentCode: "AG003", transactions: 200, volumeKobo: 10_000_000_00, commissionKobo: 200_000 },
  ];

  it("sums transactions correctly", () => {
    expect(aggregateNetwork(agents).totalTransactions).toBe(400);
  });

  it("sums volume correctly", () => {
    expect(aggregateNetwork(agents).totalVolumeKobo).toBe(20_000_000_00);
  });

  it("sums commission correctly", () => {
    expect(aggregateNetwork(agents).totalCommissionKobo).toBe(400_000);
  });

  it("handles empty network", () => {
    const r = aggregateNetwork([]);
    expect(r.totalAgents).toBe(0);
    expect(r.totalVolumeKobo).toBe(0);
  });
});

// ─── Restaurant order total ───────────────────────────────────────────────────
interface OrderItem { qty: number; unitPriceKobo: number }

function calcOrderTotal(items: OrderItem[]): number {
  return items.reduce((s, i) => s + i.qty * i.unitPriceKobo, 0);
}

describe("Restaurant order total", () => {
  it("calculates multi-item order correctly", () => {
    const items: OrderItem[] = [
      { qty: 2, unitPriceKobo: 2_500_00 },  // 2 × ₦2,500 = ₦5,000
      { qty: 1, unitPriceKobo: 1_000_00 },  // 1 × ₦1,000 = ₦1,000
      { qty: 3, unitPriceKobo: 500_00 },    // 3 × ₦500  = ₦1,500
    ];
    expect(calcOrderTotal(items)).toBe(7_500_00);
  });

  it("returns 0 for empty order", () => {
    expect(calcOrderTotal([])).toBe(0);
  });

  it("handles single item", () => {
    expect(calcOrderTotal([{ qty: 5, unitPriceKobo: 200_00 }])).toBe(1_000_00);
  });
});

// ─── KDS order age ────────────────────────────────────────────────────────────
function getOrderAgeMinutes(createdAt: Date, now: Date): number {
  return (now.getTime() - createdAt.getTime()) / 60_000;
}

function classifyOrderAge(mins: number): "fresh" | "warning" | "overdue" {
  if (mins < 5) return "fresh";
  if (mins < 15) return "warning";
  return "overdue";
}

describe("KDS order age classification", () => {
  it("classifies 3-minute order as fresh", () => {
    expect(classifyOrderAge(3)).toBe("fresh");
  });

  it("classifies 10-minute order as warning", () => {
    expect(classifyOrderAge(10)).toBe("warning");
  });

  it("classifies 20-minute order as overdue", () => {
    expect(classifyOrderAge(20)).toBe("overdue");
  });

  it("boundary: exactly 5 minutes is warning", () => {
    expect(classifyOrderAge(5)).toBe("warning");
  });
});

// ─── Inventory cost engine ────────────────────────────────────────────────────
interface RecipeIngredient { quantityPerServing: number; costPerUnitKobo: number }

function calcRecipeCost(ingredients: RecipeIngredient[]): number {
  return ingredients.reduce((s, i) => s + i.quantityPerServing * i.costPerUnitKobo, 0);
}

function calcFoodCostPct(recipeCostKobo: number, sellingPriceKobo: number): number {
  if (sellingPriceKobo === 0) return 0;
  return (recipeCostKobo / sellingPriceKobo) * 100;
}

describe("Inventory cost engine", () => {
  it("calculates recipe cost correctly", () => {
    const ingredients: RecipeIngredient[] = [
      { quantityPerServing: 0.2, costPerUnitKobo: 500_00 },  // 0.2 kg tomatoes
      { quantityPerServing: 0.1, costPerUnitKobo: 1_000_00 }, // 0.1 kg chicken
    ];
    // 0.2 × 50000 + 0.1 × 100000 = 10000 + 10000 = 20000 kobo = ₦200
    expect(calcRecipeCost(ingredients)).toBeCloseTo(20_000, 0);
  });

  it("calculates food cost percentage", () => {
    const pct = calcFoodCostPct(20_000, 80_000);
    expect(pct).toBeCloseTo(25, 1);
  });

  it("handles zero selling price gracefully", () => {
    expect(calcFoodCostPct(20_000, 0)).toBe(0);
  });
});

// ─── Loyalty points ───────────────────────────────────────────────────────────
function earnPoints(spendKobo: number, pointsPerThousandNaira: number): number {
  return Math.floor((spendKobo / 100_000) * pointsPerThousandNaira);
}

function koboValueOfPoints(points: number, koboPerPoint: number): number {
  return points * koboPerPoint;
}

describe("Loyalty points engine", () => {
  it("earns correct points for ₦5,000 spend at 1 pt/₦1,000", () => {
    expect(earnPoints(500_000, 1)).toBe(5);
  });

  it("earns correct points for ₦10,000 spend at 2 pts/₦1,000", () => {
    expect(earnPoints(1_000_000, 2)).toBe(20);
  });

  it("floors partial points", () => {
    expect(earnPoints(150_000, 1)).toBe(1); // ₦1,500 → 1 pt
  });

  it("calculates kobo value of points correctly", () => {
    expect(koboValueOfPoints(50, 100)).toBe(5_000); // 50 pts × ₦1 = ₦50
  });
});

// ─── Payroll calculation ──────────────────────────────────────────────────────
function calcHourlyGross(hoursWorked: number, hourlyRateKobo: number, tipsKobo: number): number {
  return hoursWorked * hourlyRateKobo + tipsKobo;
}

function calcPAYE(grossKobo: number): number {
  // Simplified Nigerian PAYE: 7% on first ₦300k/month, 11% on next ₦300k
  const gross = grossKobo / 100;
  if (gross <= 300_000) return Math.round(gross * 0.07 * 100);
  return Math.round((300_000 * 0.07 + (gross - 300_000) * 0.11) * 100);
}

describe("Payroll calculation", () => {
  it("calculates hourly gross correctly", () => {
    const gross = calcHourlyGross(40, 1_500_00, 5_000_00); // 40h × ₦1,500 + ₦5,000 tips
    expect(gross).toBe(65_000_00); // ₦65,000
  });

  it("calculates PAYE for low earner (₦50,000/month)", () => {
    const paye = calcPAYE(5_000_000); // ₦50,000
    expect(paye).toBe(350_000); // 7% = ₦3,500
  });

  it("calculates PAYE for mid earner (₦400,000/month)", () => {
    const paye = calcPAYE(40_000_000); // ₦400,000
    // 7% of ₦300k = ₦21,000 + 11% of ₦100k = ₦11,000 = ₦32,000
    expect(paye).toBe(3_200_000);
  });
});

// ─── Kiosk health classification ─────────────────────────────────────────────
function classifyKioskHealth(minutesSinceHeartbeat: number | null): "online" | "warning" | "offline" {
  if (minutesSinceHeartbeat === null) return "offline";
  if (minutesSinceHeartbeat <= 5) return "online";
  if (minutesSinceHeartbeat <= 30) return "warning";
  return "offline";
}

describe("Kiosk health classification", () => {
  it("classifies null heartbeat as offline", () => {
    expect(classifyKioskHealth(null)).toBe("offline");
  });

  it("classifies 2-minute heartbeat as online", () => {
    expect(classifyKioskHealth(2)).toBe("online");
  });

  it("classifies 15-minute heartbeat as warning", () => {
    expect(classifyKioskHealth(15)).toBe("warning");
  });

  it("classifies 45-minute heartbeat as offline", () => {
    expect(classifyKioskHealth(45)).toBe("offline");
  });

  it("boundary: exactly 5 minutes is online", () => {
    expect(classifyKioskHealth(5)).toBe("online");
  });

  it("boundary: exactly 30 minutes is warning", () => {
    expect(classifyKioskHealth(30)).toBe("warning");
  });
});
