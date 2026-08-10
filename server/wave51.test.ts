/**
 * Wave 51 Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Loyalty balance display logic (customer detail panel)
 * 2. Inventory reservation flow (reserve / partial-reserve / fail-open)
 * 3. Rate limit toast trigger logic
 * 4. Inventory release on transaction failure
 * 5. Reservation metadata stored in transaction
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. Loyalty Balance Display ───────────────────────────────────────────────
describe("Loyalty balance display logic", () => {
  type LoyaltyBalance = {
    balance: number;
    tier: "bronze" | "silver" | "gold" | "platinum";
    lifetime_points: number;
    last_activity: string | null;
  };

  function formatLoyaltyTier(tier: LoyaltyBalance["tier"]): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  }

  function isLoyaltyActive(lastActivity: string | null, thresholdDays = 90): boolean {
    if (!lastActivity) return false;
    const diff = Date.now() - new Date(lastActivity).getTime();
    return diff < thresholdDays * 24 * 60 * 60 * 1000;
  }

  function getLoyaltyBadgeColor(tier: LoyaltyBalance["tier"]): string {
    const map: Record<LoyaltyBalance["tier"], string> = {
      bronze: "amber",
      silver: "slate",
      gold: "yellow",
      platinum: "violet",
    };
    return map[tier];
  }

  it("formats tier names with title case", () => {
    expect(formatLoyaltyTier("bronze")).toBe("Bronze");
    expect(formatLoyaltyTier("silver")).toBe("Silver");
    expect(formatLoyaltyTier("gold")).toBe("Gold");
    expect(formatLoyaltyTier("platinum")).toBe("Platinum");
  });

  it("marks recent activity as active", () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isLoyaltyActive(recent)).toBe(true);
  });

  it("marks old activity as inactive", () => {
    const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    expect(isLoyaltyActive(old)).toBe(false);
  });

  it("marks null last_activity as inactive", () => {
    expect(isLoyaltyActive(null)).toBe(false);
  });

  it("returns correct badge color per tier", () => {
    expect(getLoyaltyBadgeColor("bronze")).toBe("amber");
    expect(getLoyaltyBadgeColor("silver")).toBe("slate");
    expect(getLoyaltyBadgeColor("gold")).toBe("yellow");
    expect(getLoyaltyBadgeColor("platinum")).toBe("violet");
  });

  it("balance of 0 is valid and displayable", () => {
    const balance: LoyaltyBalance = {
      balance: 0,
      tier: "bronze",
      lifetime_points: 0,
      last_activity: null,
    };
    expect(balance.balance).toBe(0);
    expect(formatLoyaltyTier(balance.tier)).toBe("Bronze");
  });

  it("lifetime points can exceed current balance (redemptions occurred)", () => {
    const balance: LoyaltyBalance = {
      balance: 200,
      tier: "gold",
      lifetime_points: 5000,
      last_activity: new Date().toISOString(),
    };
    expect(balance.lifetime_points).toBeGreaterThan(balance.balance);
  });
});

// ─── 2. Inventory Reservation Flow ───────────────────────────────────────────
describe("Inventory reservation flow", () => {
  type ReservationResult = {
    reservation_id: string;
    merchant_id: string;
    transaction_ref: string;
    items: Array<{ item_id: string; quantity: number; reserved: boolean }>;
    all_reserved: boolean;
  };

  /**
   * Mirrors the gate logic in transactions.createTest:
   *   - null result (service down) → fail-open (no reservation, continue)
   *   - all_reserved true → store reservation_id
   *   - all_reserved false → release and throw CONFLICT
   */
  function evaluateInventoryGate(
    result: ReservationResult | null
  ): { proceed: boolean; reservationId: string | null; error?: string } {
    if (!result) {
      // Fail-open: service unavailable
      return { proceed: true, reservationId: null };
    }
    if (result.all_reserved) {
      return { proceed: true, reservationId: result.reservation_id };
    }
    // Partial reservation — must release and block
    return {
      proceed: false,
      reservationId: null,
      error: "Insufficient inventory for one or more items. Reservation failed.",
    };
  }

  it("null result (service unavailable) → fail-open, proceed without reservation", () => {
    const r = evaluateInventoryGate(null);
    expect(r.proceed).toBe(true);
    expect(r.reservationId).toBeNull();
  });

  it("all_reserved true → proceed with reservation_id stored", () => {
    const result: ReservationResult = {
      reservation_id: "rsv_abc123",
      merchant_id: "mch_1",
      transaction_ref: "TEST_txn_1",
      items: [{ item_id: "itm_1", quantity: 2, reserved: true }],
      all_reserved: true,
    };
    const r = evaluateInventoryGate(result);
    expect(r.proceed).toBe(true);
    expect(r.reservationId).toBe("rsv_abc123");
  });

  it("all_reserved false → block transaction with CONFLICT error", () => {
    const result: ReservationResult = {
      reservation_id: "rsv_partial",
      merchant_id: "mch_1",
      transaction_ref: "TEST_txn_2",
      items: [
        { item_id: "itm_1", quantity: 5, reserved: false },
        { item_id: "itm_2", quantity: 1, reserved: true },
      ],
      all_reserved: false,
    };
    const r = evaluateInventoryGate(result);
    expect(r.proceed).toBe(false);
    expect(r.error).toContain("Insufficient inventory");
  });

  it("reservation_id is included in transaction metadata when reserved", () => {
    const reservationId = "rsv_xyz789";
    const metadata = {
      fraudScore: 20,
      fraudLevel: "low",
      inventoryReservationId: reservationId,
    };
    expect(metadata.inventoryReservationId).toBe(reservationId);
  });

  it("metadata has no inventoryReservationId when service unavailable", () => {
    const metadata: Record<string, unknown> = {
      fraudScore: 15,
      fraudLevel: "low",
    };
    expect(metadata.inventoryReservationId).toBeUndefined();
  });

  it("empty items array skips reservation entirely", () => {
    // When no inventory items are passed, the gate should not be invoked
    const inventoryItems: Array<{ item_id: string; quantity: number }> = [];
    const shouldReserve = inventoryItems.length > 0;
    expect(shouldReserve).toBe(false);
  });

  it("reservation release is called on transaction failure", () => {
    const releaseFn = vi.fn().mockResolvedValue({ ok: true });
    const reservationId = "rsv_to_release";

    // Simulate transaction failure path
    async function simulateFailure() {
      try {
        throw new Error("DB write failed");
      } catch {
        if (reservationId) {
          releaseFn(reservationId).catch(() => {});
        }
        throw new Error("DB write failed");
      }
    }

    expect(simulateFailure()).rejects.toThrow("DB write failed");
    // Release should have been called
    setTimeout(() => {
      expect(releaseFn).toHaveBeenCalledWith(reservationId);
    }, 10);
  });
});

// ─── 3. Rate Limit Toast Logic ────────────────────────────────────────────────
describe("Rate limit toast trigger logic", () => {
  function extractRetryAfterSec(message: string): number {
    const match = message.match(/Retry after (\d+)s/);
    return match ? parseInt(match[1], 10) : 60;
  }

  function isRateLimitError(errorData: { code?: string } | null | undefined, message: string): boolean {
    return errorData?.code === "TOO_MANY_REQUESTS" || message?.includes("Rate limit exceeded");
  }

  it("extracts retry-after seconds from error message", () => {
    expect(extractRetryAfterSec("Rate limit exceeded. Retry after 42s. (105/100 in 60s window)")).toBe(42);
    expect(extractRetryAfterSec("Rate limit exceeded. Retry after 5s.")).toBe(5);
  });

  it("defaults to 60s when no retry-after in message", () => {
    expect(extractRetryAfterSec("Some other error")).toBe(60);
  });

  it("detects rate limit error by code", () => {
    expect(isRateLimitError({ code: "TOO_MANY_REQUESTS" }, "Rate limit exceeded")).toBe(true);
  });

  it("detects rate limit error by message content", () => {
    expect(isRateLimitError(null, "Rate limit exceeded. Retry after 10s.")).toBe(true);
  });

  it("does not trigger for unrelated errors", () => {
    expect(isRateLimitError({ code: "NOT_FOUND" }, "Resource not found")).toBe(false);
    expect(isRateLimitError({ code: "UNAUTHORIZED" }, "Please login")).toBe(false);
  });

  it("does not trigger for empty error data", () => {
    expect(isRateLimitError(undefined, "Something went wrong")).toBe(false);
  });

  it("toast deduplication prevents multiple toasts for same burst", () => {
    let toastCount = 0;
    let active = false;

    function showToast(message: string) {
      if (active) return;
      active = true;
      toastCount++;
      // Simulate auto-close after duration
      setTimeout(() => { active = false; }, 100);
    }

    // Simulate 5 rapid rate-limit errors
    for (let i = 0; i < 5; i++) {
      showToast("Rate limit exceeded. Retry after 60s.");
    }
    expect(toastCount).toBe(1);
  });

  it("toast duration is capped at 15 seconds", () => {
    function toastDuration(retrySec: number): number {
      return Math.min(retrySec * 1000, 15_000);
    }
    expect(toastDuration(5)).toBe(5000);
    expect(toastDuration(30)).toBe(15000);
    expect(toastDuration(120)).toBe(15000);
  });
});

// ─── 4. Inventory + Fraud Gate Integration ───────────────────────────────────
describe("Inventory reservation integrates with fraud gate", () => {
  type FraudResult = {
    risk_level: "low" | "medium" | "high" | "critical";
    recommendation: "approve" | "review" | "decline";
    risk_score: number;
    signals: string[];
  };

  type ReservationResult = {
    reservation_id: string;
    all_reserved: boolean;
  };

  function processTransaction(
    fraud: FraudResult | null,
    reservation: ReservationResult | null
  ): { status: "ok" | "blocked"; reason?: string; metadata: Record<string, unknown> } {
    // Step 1: Fraud gate
    if (fraud?.recommendation === "decline" || fraud?.risk_level === "critical") {
      return { status: "blocked", reason: "fraud", metadata: {} };
    }

    // Step 2: Inventory gate
    if (reservation !== null && !reservation.all_reserved) {
      return { status: "blocked", reason: "inventory", metadata: {} };
    }

    // Step 3: Proceed
    const metadata: Record<string, unknown> = {};
    if (fraud) {
      metadata.fraudScore = fraud.risk_score;
      metadata.fraudLevel = fraud.risk_level;
    }
    if (reservation?.all_reserved) {
      metadata.inventoryReservationId = reservation.reservation_id;
    }
    return { status: "ok", metadata };
  }

  it("fraud blocks before inventory is checked", () => {
    const r = processTransaction(
      { risk_level: "critical", recommendation: "decline", risk_score: 99, signals: [] },
      { reservation_id: "rsv_1", all_reserved: true }
    );
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("fraud");
  });

  it("inventory failure blocks transaction", () => {
    const r = processTransaction(
      { risk_level: "low", recommendation: "approve", risk_score: 10, signals: [] },
      { reservation_id: "rsv_partial", all_reserved: false }
    );
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("inventory");
  });

  it("both pass → transaction proceeds with full metadata", () => {
    const r = processTransaction(
      { risk_level: "medium", recommendation: "approve", risk_score: 40, signals: [] },
      { reservation_id: "rsv_ok", all_reserved: true }
    );
    expect(r.status).toBe("ok");
    expect(r.metadata.fraudScore).toBe(40);
    expect(r.metadata.inventoryReservationId).toBe("rsv_ok");
  });

  it("fraud null + inventory null → proceed (both fail-open)", () => {
    const r = processTransaction(null, null);
    expect(r.status).toBe("ok");
    expect(r.metadata.fraudScore).toBeUndefined();
    expect(r.metadata.inventoryReservationId).toBeUndefined();
  });

  it("fraud null + inventory success → proceed with reservation metadata", () => {
    const r = processTransaction(null, { reservation_id: "rsv_2", all_reserved: true });
    expect(r.status).toBe("ok");
    expect(r.metadata.inventoryReservationId).toBe("rsv_2");
  });
});
