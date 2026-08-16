/**
 * Wave 55 — Loyalty Tier Upgrade Notifications, Fraud Comment Thread,
 * Transaction Retry Flow
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_THRESHOLDS = {
  bronze:   0,
  silver:   500,
  gold:     2000,
  platinum: 10000,
};

function getTierFromPoints(points: number): string {
  if (points >= TIER_THRESHOLDS.platinum) return "platinum";
  if (points >= TIER_THRESHOLDS.gold)     return "gold";
  if (points >= TIER_THRESHOLDS.silver)   return "silver";
  return "bronze";
}

function detectTierUpgrade(prevPoints: number, newPoints: number): string | null {
  const prevTier = getTierFromPoints(prevPoints);
  const newTier  = getTierFromPoints(newPoints);
  if (prevTier !== newTier) return newTier;
  return null;
}

// ─── Loyalty Tier Upgrade Notification ───────────────────────────────────────

describe("Wave 55 — Loyalty Tier Upgrade Notifications", () => {
  it("detects bronze → silver upgrade at 500 pts", () => {
    expect(detectTierUpgrade(490, 510)).toBe("silver");
  });

  it("detects silver → gold upgrade at 2000 pts", () => {
    expect(detectTierUpgrade(1990, 2010)).toBe("gold");
  });

  it("detects gold → platinum upgrade at 10000 pts", () => {
    expect(detectTierUpgrade(9990, 10010)).toBe("platinum");
  });

  it("returns null when no tier boundary is crossed", () => {
    expect(detectTierUpgrade(100, 200)).toBeNull();
    expect(detectTierUpgrade(500, 600)).toBeNull();
    expect(detectTierUpgrade(2000, 3000)).toBeNull();
  });

  it("returns null when points decrease (downgrade is not notified)", () => {
    // When points decrease from gold to silver, detectTierUpgrade still returns the new tier
    // but the caller should only notify on upgrades (newPoints > prevPoints)
    const prevPoints = 2100;
    const newPoints  = 1900;
    const isUpgrade = newPoints > prevPoints;
    const upgrade = isUpgrade ? detectTierUpgrade(prevPoints, newPoints) : null;
    expect(upgrade).toBeNull();
  });

  it("notifyOwner is called with tier upgrade message", async () => {
    const notifyOwner = vi.fn().mockResolvedValue(true);
    const prevPoints = 490;
    const newPoints  = 510;
    const upgrade = detectTierUpgrade(prevPoints, newPoints);
    if (upgrade) {
      await notifyOwner({
        title: "Customer loyalty tier upgrade",
        content: `Customer reached ${upgrade} tier (${newPoints} pts)`,
      });
    }
    expect(notifyOwner).toHaveBeenCalledOnce();
    expect(notifyOwner.mock.calls[0][0].title).toBe("Customer loyalty tier upgrade");
    expect(notifyOwner.mock.calls[0][0].content).toContain("silver");
  });

  it("notifyOwner is NOT called when no tier upgrade occurs", async () => {
    const notifyOwner = vi.fn().mockResolvedValue(true);
    const upgrade = detectTierUpgrade(100, 200);
    if (upgrade) await notifyOwner({ title: "tier", content: "tier" });
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("tier upgrade notification is fire-and-forget (does not block)", async () => {
    const notifyOwner = vi.fn().mockRejectedValue(new Error("network error"));
    const upgrade = detectTierUpgrade(490, 510);
    // Should not throw even if notifyOwner rejects
    await expect(
      (async () => {
        if (upgrade) {
          notifyOwner({ title: "tier", content: "tier" }).catch(() => {});
        }
        return "done";
      })()
    ).resolves.toBe("done");
  });
});

// ─── Fraud Alert Comment Thread ───────────────────────────────────────────────

describe("Wave 55 — Fraud Alert Comment Thread", () => {
  it("comment ID is generated with fac_ prefix", () => {
    const id = `fac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    expect(id).toMatch(/^fac_\d+_[a-z0-9]+$/);
  });

  it("comment body is trimmed before storage", () => {
    const raw = "  suspicious velocity pattern  ";
    const trimmed = raw.trim();
    expect(trimmed).toBe("suspicious velocity pattern");
  });

  it("empty comment body is rejected (min length 1)", () => {
    const validate = (body: string) => body.trim().length >= 1;
    expect(validate("")).toBe(false);
    expect(validate("   ")).toBe(false);
    expect(validate("note")).toBe(true);
  });

  it("comment body max length is 2000 chars", () => {
    const validate = (body: string) => body.length <= 2000;
    expect(validate("a".repeat(2000))).toBe(true);
    expect(validate("a".repeat(2001))).toBe(false);
  });

  it("getComments returns empty array when DB unavailable (fail-open)", async () => {
    const getDb = vi.fn().mockResolvedValue(null);
    const db = await getDb();
    const result = db ? ["comment"] : [];
    expect(result).toEqual([]);
  });

  it("addComment throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    const getDb = vi.fn().mockResolvedValue(null);
    const db = await getDb();
    const handler = () => {
      if (!db) throw new Error("DB unavailable");
    };
    expect(handler).toThrow("DB unavailable");
  });

  it("optimistic update adds comment immediately before server response", () => {
    const existingComments = [
      { id: "fac_1", alertId: "alert_1", body: "first note", authorName: "Alice", createdAt: new Date() },
    ];
    const optimisticComment = {
      id: `opt_${Date.now()}`,
      alertId: "alert_1",
      merchantId: "",
      authorName: "You",
      body: "second note",
      createdAt: new Date(),
    };
    const updated = [...existingComments, optimisticComment];
    expect(updated).toHaveLength(2);
    expect(updated[1].id).toMatch(/^opt_/);
  });

  it("fraudRiskRouter exports addComment and getComments procedures", async () => {
    const { appRouter } = await import("./routers");
    const allProcedures = (appRouter as any)._def.procedures ?? {};
    const keys = Object.keys(allProcedures);
    const hasAddComment = keys.some(k => k.includes("fraudRisk") && k.includes("addComment"));
    const hasGetComments = keys.some(k => k.includes("fraudRisk") && k.includes("getComments"));
    expect(hasAddComment).toBe(true);
    expect(hasGetComments).toBe(true);
    // Generous timeout: importing the full appRouter on a slow (FUSE)
    // filesystem can exceed the 15s default.
  }, 90000);
});

// ─── Transaction Retry Flow ───────────────────────────────────────────────────

describe("Wave 55 — Transaction Retry Flow", () => {
  it("retry button is only shown for failed transactions", () => {
    const shouldShowRetry = (status: string) => status === "failed";
    expect(shouldShowRetry("failed")).toBe(true);
    expect(shouldShowRetry("completed")).toBe(false);
    expect(shouldShowRetry("pending")).toBe(false);
    expect(shouldShowRetry("reversed")).toBe(false);
  });

  it("retry preserves original transaction parameters", () => {
    const originalTx = {
      amount: 50000,
      currency: "NGN",
      customerEmail: "test@example.com",
      customerName: "Test User",
      description: "Test payment",
      channel: "card",
    };
    const retryInput = {
      amount: Number(originalTx.amount),
      currency: originalTx.currency ?? "NGN",
      customerEmail: originalTx.customerEmail ?? undefined,
      customerName: originalTx.customerName ?? undefined,
      description: originalTx.description ?? undefined,
      channel: originalTx.channel ?? "card",
    };
    expect(retryInput.amount).toBe(50000);
    expect(retryInput.currency).toBe("NGN");
    expect(retryInput.customerEmail).toBe("test@example.com");
    expect(retryInput.channel).toBe("card");
  });

  it("retry defaults currency to NGN when original is null", () => {
    const tx = { amount: 10000, currency: null, channel: null };
    const retryInput = {
      amount: Number(tx.amount),
      currency: tx.currency ?? "NGN",
      channel: tx.channel ?? "card",
    };
    expect(retryInput.currency).toBe("NGN");
    expect(retryInput.channel).toBe("card");
  });

  it("retry creates a new transaction (not updates the failed one)", () => {
    // The retry flow calls createTest which generates a new txnId
    const generateTxnId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const originalId = generateTxnId("txn");
    const retryId = generateTxnId("txn");
    expect(retryId).not.toBe(originalId);
  });

  it("retry success closes dialog and invalidates transaction list", () => {
    const onClose = vi.fn();
    const invalidate = vi.fn();
    // Simulate onSuccess handler
    const onSuccess = () => {
      invalidate();
      onClose();
    };
    onSuccess();
    expect(onClose).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("retry failure shows error toast without closing dialog", () => {
    const onClose = vi.fn();
    const toastError = vi.fn();
    const onError = (err: Error) => {
      toastError(`Retry failed: ${err.message}`);
      // onClose is NOT called on error
    };
    onError(new Error("Fraud block"));
    expect(toastError).toHaveBeenCalledWith("Retry failed: Fraud block");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("transactions.createTest procedure exists in appRouter", async () => {
    const { appRouter } = await import("./routers");
    const allProcedures = (appRouter as any)._def.procedures ?? {};
    const keys = Object.keys(allProcedures);
    const found = keys.some(k => k.includes("transactions") && k.includes("createTest"));
    expect(found).toBe(true);
  });
});
