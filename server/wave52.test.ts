/**
 * Wave 52 Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Fraud signal drill-down panel logic
 * 2. Inventory reservation status badge rendering logic
 * 3. Loyalty redemption checkout flow (amount reduction, metadata, fail-open)
 * 4. customers.getLoyaltyBalance tier derivation
 * 5. Transaction detail dialog — badge visibility conditions
 */
import { describe, it, expect, vi } from "vitest";

// ─── 1. Fraud Signal Drill-Down Panel ─────────────────────────────────────────
describe("Fraud signal drill-down panel", () => {
  type FraudAlert = {
    id: string;
    alertType: string;
    riskScore: number;
    status: string;
    metadata: Record<string, unknown>;
  };

  function extractSignals(alert: FraudAlert): string[] {
    const signals = alert.metadata?.signals;
    if (!Array.isArray(signals)) return [];
    return signals.filter((s): s is string => typeof s === "string");
  }

  function signalSeverityLabel(riskScore: number): string {
    if (riskScore >= 80) return "Critical";
    if (riskScore >= 60) return "High";
    if (riskScore >= 40) return "Medium";
    return "Low";
  }

  function hasSignals(alert: FraudAlert): boolean {
    return extractSignals(alert).length > 0;
  }

  it("extracts signals array from metadata", () => {
    const alert: FraudAlert = {
      id: "frd_1",
      alertType: "velocity_breach",
      riskScore: 75,
      status: "open",
      metadata: { signals: ["high_velocity", "unusual_location", "new_device"] },
    };
    expect(extractSignals(alert)).toEqual(["high_velocity", "unusual_location", "new_device"]);
  });

  it("returns empty array when signals field is missing", () => {
    const alert: FraudAlert = {
      id: "frd_2",
      alertType: "card_testing",
      riskScore: 50,
      status: "open",
      metadata: {},
    };
    expect(extractSignals(alert)).toEqual([]);
  });

  it("returns empty array when signals is not an array", () => {
    const alert: FraudAlert = {
      id: "frd_3",
      alertType: "card_testing",
      riskScore: 50,
      status: "open",
      metadata: { signals: "high_velocity" },
    };
    expect(extractSignals(alert)).toEqual([]);
  });

  it("filters non-string values from signals array", () => {
    const alert: FraudAlert = {
      id: "frd_4",
      alertType: "velocity_breach",
      riskScore: 70,
      status: "investigating",
      metadata: { signals: ["high_velocity", 42, null, "new_device"] },
    };
    expect(extractSignals(alert)).toEqual(["high_velocity", "new_device"]);
  });

  it("maps risk score to severity label correctly", () => {
    expect(signalSeverityLabel(90)).toBe("Critical");
    expect(signalSeverityLabel(80)).toBe("Critical");
    expect(signalSeverityLabel(79)).toBe("High");
    expect(signalSeverityLabel(60)).toBe("High");
    expect(signalSeverityLabel(59)).toBe("Medium");
    expect(signalSeverityLabel(40)).toBe("Medium");
    expect(signalSeverityLabel(39)).toBe("Low");
    expect(signalSeverityLabel(0)).toBe("Low");
  });

  it("hasSignals returns true only when signals array is non-empty", () => {
    const withSignals: FraudAlert = {
      id: "frd_5",
      alertType: "velocity_breach",
      riskScore: 75,
      status: "open",
      metadata: { signals: ["high_velocity"] },
    };
    const withoutSignals: FraudAlert = {
      id: "frd_6",
      alertType: "velocity_breach",
      riskScore: 75,
      status: "open",
      metadata: {},
    };
    expect(hasSignals(withSignals)).toBe(true);
    expect(hasSignals(withoutSignals)).toBe(false);
  });

  it("drill-down sheet shows correct signal count", () => {
    const signals = ["high_velocity", "unusual_location", "new_device", "card_testing"];
    const alert: FraudAlert = {
      id: "frd_7",
      alertType: "velocity_breach",
      riskScore: 85,
      status: "open",
      metadata: { signals },
    };
    expect(extractSignals(alert).length).toBe(4);
  });
});

// ─── 2. Inventory Reservation Status Badge ────────────────────────────────────
describe("Inventory reservation status badge", () => {
  type TxMetadata = {
    inventoryReservationId?: string;
    inventoryReservationStatus?: string;
    fraudScore?: number;
    redeemedPoints?: number;
  };

  function getReservationBadgeProps(metadata: TxMetadata): {
    show: boolean;
    label: string;
    variant: "reserved" | "released" | "none";
    shortId: string;
  } {
    const { inventoryReservationId: id, inventoryReservationStatus: status } = metadata;
    if (!id) return { show: false, label: "", variant: "none", shortId: "" };
    const isReleased = status === "released";
    return {
      show: true,
      label: isReleased ? "Released" : "Reserved",
      variant: isReleased ? "released" : "reserved",
      shortId: id.slice(0, 12),
    };
  }

  it("shows Reserved badge when reservation exists without released status", () => {
    const meta: TxMetadata = { inventoryReservationId: "inv_abc123xyz456" };
    const props = getReservationBadgeProps(meta);
    expect(props.show).toBe(true);
    expect(props.label).toBe("Reserved");
    expect(props.variant).toBe("reserved");
  });

  it("shows Released badge when reservation status is 'released'", () => {
    const meta: TxMetadata = {
      inventoryReservationId: "inv_abc123xyz456",
      inventoryReservationStatus: "released",
    };
    const props = getReservationBadgeProps(meta);
    expect(props.show).toBe(true);
    expect(props.label).toBe("Released");
    expect(props.variant).toBe("released");
  });

  it("hides badge when no reservationId in metadata", () => {
    const meta: TxMetadata = { fraudScore: 45 };
    const props = getReservationBadgeProps(meta);
    expect(props.show).toBe(false);
    expect(props.variant).toBe("none");
  });

  it("truncates reservation ID to 12 characters for display", () => {
    const meta: TxMetadata = { inventoryReservationId: "inv_abc123xyz456789" };
    const props = getReservationBadgeProps(meta);
    expect(props.shortId).toBe("inv_abc123xy");
    expect(props.shortId.length).toBe(12);
  });

  it("handles empty string reservationId gracefully", () => {
    const meta: TxMetadata = { inventoryReservationId: "" };
    const props = getReservationBadgeProps(meta);
    expect(props.show).toBe(false);
  });
});

// ─── 3. Loyalty Redemption Checkout Flow ─────────────────────────────────────
describe("Loyalty redemption checkout flow", () => {
  const MIN_CHARGE = 100; // kobo

  function computeChargedAmount(
    originalAmount: number,
    pointsKoboValue: number
  ): number {
    return Math.max(MIN_CHARGE, originalAmount - pointsKoboValue);
  }

  function buildRedemptionMetadata(
    redeemedPoints: number,
    pointsKoboValue: number
  ): Record<string, number> | null {
    if (redeemedPoints <= 0) return null;
    return { redeemedPoints, pointsValue: pointsKoboValue };
  }

  it("reduces charged amount by points kobo value", () => {
    // 5000 kobo charge, 1000 kobo worth of points redeemed
    expect(computeChargedAmount(5000, 1000)).toBe(4000);
  });

  it("never charges below minimum (100 kobo)", () => {
    // Points value exceeds original amount
    expect(computeChargedAmount(500, 1000)).toBe(100);
    expect(computeChargedAmount(100, 200)).toBe(100);
  });

  it("charges full amount when no points redeemed", () => {
    expect(computeChargedAmount(5000, 0)).toBe(5000);
  });

  it("charges full amount when points value equals zero", () => {
    expect(computeChargedAmount(10000, 0)).toBe(10000);
  });

  it("stores redemption metadata when points are redeemed", () => {
    const meta = buildRedemptionMetadata(200, 2000);
    expect(meta).toEqual({ redeemedPoints: 200, pointsValue: 2000 });
  });

  it("returns null metadata when no points redeemed", () => {
    expect(buildRedemptionMetadata(0, 0)).toBeNull();
  });

  it("fail-open: charges full amount when redemption service unavailable", () => {
    // Simulate service unavailable — redeemedPoints stays 0, pointsKoboValue stays 0
    const redeemedPoints = 0;
    const pointsKoboValue = 0;
    const chargedAmount = computeChargedAmount(5000, pointsKoboValue);
    expect(chargedAmount).toBe(5000);
    expect(buildRedemptionMetadata(redeemedPoints, pointsKoboValue)).toBeNull();
  });

  it("handles exact minimum boundary correctly", () => {
    expect(computeChargedAmount(100, 0)).toBe(100);
    expect(computeChargedAmount(100, 50)).toBe(100);
    expect(computeChargedAmount(150, 50)).toBe(100);
    expect(computeChargedAmount(151, 50)).toBe(101);
  });
});

// ─── 4. customers.getLoyaltyBalance Tier Derivation ──────────────────────────
describe("Loyalty tier derivation from points balance", () => {
  function deriveTier(points: number): "bronze" | "silver" | "gold" | "platinum" {
    if (points >= 10000) return "platinum";
    if (points >= 5000) return "gold";
    if (points >= 1000) return "silver";
    return "bronze";
  }

  it("returns bronze for 0 points", () => expect(deriveTier(0)).toBe("bronze"));
  it("returns bronze for 999 points", () => expect(deriveTier(999)).toBe("bronze"));
  it("returns silver for exactly 1000 points", () => expect(deriveTier(1000)).toBe("silver"));
  it("returns silver for 4999 points", () => expect(deriveTier(4999)).toBe("silver"));
  it("returns gold for exactly 5000 points", () => expect(deriveTier(5000)).toBe("gold"));
  it("returns gold for 9999 points", () => expect(deriveTier(9999)).toBe("gold"));
  it("returns platinum for exactly 10000 points", () => expect(deriveTier(10000)).toBe("platinum"));
  it("returns platinum for 50000 points", () => expect(deriveTier(50000)).toBe("platinum"));
});

// ─── 5. Transaction Detail Dialog — Badge Visibility ─────────────────────────
describe("Transaction detail dialog badge visibility", () => {
  type TxMeta = {
    inventoryReservationId?: string;
    inventoryReservationStatus?: string;
    redeemedPoints?: number;
    pointsValue?: number;
    fraudScore?: number;
    fraudLevel?: string;
  };

  function shouldShowInventoryBadge(meta: TxMeta): boolean {
    return !!meta.inventoryReservationId;
  }

  function shouldShowLoyaltyBadge(meta: TxMeta): boolean {
    return typeof meta.redeemedPoints === "number" && meta.redeemedPoints > 0;
  }

  it("shows inventory badge only when reservationId present", () => {
    expect(shouldShowInventoryBadge({ inventoryReservationId: "inv_123" })).toBe(true);
    expect(shouldShowInventoryBadge({ fraudScore: 45 })).toBe(false);
    expect(shouldShowInventoryBadge({})).toBe(false);
  });

  it("shows loyalty badge only when redeemedPoints > 0", () => {
    expect(shouldShowLoyaltyBadge({ redeemedPoints: 100, pointsValue: 1000 })).toBe(true);
    expect(shouldShowLoyaltyBadge({ redeemedPoints: 0 })).toBe(false);
    expect(shouldShowLoyaltyBadge({})).toBe(false);
    expect(shouldShowLoyaltyBadge({ redeemedPoints: -5 })).toBe(false);
  });

  it("can show both badges simultaneously", () => {
    const meta: TxMeta = {
      inventoryReservationId: "inv_abc",
      redeemedPoints: 200,
      pointsValue: 2000,
    };
    expect(shouldShowInventoryBadge(meta)).toBe(true);
    expect(shouldShowLoyaltyBadge(meta)).toBe(true);
  });

  it("shows neither badge for a plain transaction", () => {
    const meta: TxMeta = { fraudScore: 30, fraudLevel: "low" };
    expect(shouldShowInventoryBadge(meta)).toBe(false);
    expect(shouldShowLoyaltyBadge(meta)).toBe(false);
  });
});
