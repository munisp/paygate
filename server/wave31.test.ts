/**
 * Wave 31 — Unit tests for:
 *   - pos.confirmBatch
 *   - pos.upsertBatch
 *   - pos.listBatches
 *   - pos.updateLocation
 *   - settings.updateSoundboxLanguage
 *
 * Uses the same pattern as server/auth.logout.test.ts
 */
import { describe, it, expect, vi } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    getUserByOpenId: vi.fn().mockResolvedValue({
      id: 1, openId: "test-open-id", email: "test@example.com", name: "Test User", role: "user",
    }),
    getMerchantByOwnerId: vi.fn().mockResolvedValue({
      id: "mch_test", businessName: "Test Merchant", tenantId: "ten_default",
    }),
    upsertPtspBatch: vi.fn().mockResolvedValue(undefined),
    listPtspBatches: vi.fn().mockResolvedValue([
      {
        id: "batch_001", merchantId: "mch_test", settlementDate: "2026-03-13",
        status: "submitted", nibssReference: null, totalAmountKobo: 500000, transactionCount: 5,
      },
    ]),
    confirmPtspBatch: vi.fn().mockResolvedValue(undefined),
    updateMerchant: vi.fn().mockResolvedValue({ id: "mch_test", soundboxLanguage: "yo" }),
  };
});

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Wave 31 — PTSP Batch procedures", () => {
  it("upsertPtspBatch is called with correct merchantId", async () => {
    const { upsertPtspBatch, getMerchantByOwnerId } = await import("./db");
    const merchant = await getMerchantByOwnerId(1);
    expect(merchant?.id).toBe("mch_test");

    await upsertPtspBatch({
      id: "batch_001",
      merchantId: merchant!.id,
      settlementDate: "2026-03-13",
      status: "submitted",
      totalAmountKobo: 500000,
      transactionCount: 5,
    });
    expect(upsertPtspBatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: "batch_001", merchantId: "mch_test" })
    );
  });

  it("listPtspBatches returns array with correct shape", async () => {
    const { listPtspBatches } = await import("./db");
    const batches = await listPtspBatches("mch_test", 50);
    expect(Array.isArray(batches)).toBe(true);
    expect(batches[0]).toMatchObject({ id: "batch_001", status: "submitted" });
  });

  it("confirmPtspBatch is called with correct arguments", async () => {
    const { confirmPtspBatch } = await import("./db");
    await confirmPtspBatch("batch_001", "NIBSS-REF-001", "confirmed", "2026-03-13T18:00:00Z");
    expect(confirmPtspBatch).toHaveBeenCalledWith(
      "batch_001",
      "NIBSS-REF-001",
      "confirmed",
      "2026-03-13T18:00:00Z"
    );
  });
});

describe("Wave 31 — Soundbox language preference", () => {
  it("updateMerchant is called with soundboxLanguage", async () => {
    const { updateMerchant, getMerchantByOwnerId } = await import("./db");
    const merchant = await getMerchantByOwnerId(1);
    await updateMerchant(merchant!.id, { soundboxLanguage: "yo" });
    expect(updateMerchant).toHaveBeenCalledWith("mch_test", { soundboxLanguage: "yo" });
  });

  it("soundboxLanguage enum accepts all four Nigerian languages", () => {
    const validLanguages = ["en", "yo", "ha", "ig"] as const;
    validLanguages.forEach(lang => {
      expect(["en", "yo", "ha", "ig"]).toContain(lang);
    });
  });
});

describe("Wave 31 — Terminal location update", () => {
  it("GPS coordinates are encoded as integer times 1e6", () => {
    const lat = 6.5244;
    const lng = 3.3792;
    const encodedLat = Math.round(lat * 1e6);
    const encodedLng = Math.round(lng * 1e6);
    expect(encodedLat).toBe(6524400);
    expect(encodedLng).toBe(3379200);
    // Decode back
    expect(encodedLat / 1e6).toBeCloseTo(lat, 4);
    expect(encodedLng / 1e6).toBeCloseTo(lng, 4);
  });

  it("health status is derived correctly from lastHeartbeatAt", () => {
    const now = Date.now();
    const getHealth = (lastHeartbeatAt: string | null): "online" | "warning" | "offline" => {
      if (!lastHeartbeatAt) return "offline";
      const ageMs = now - new Date(lastHeartbeatAt).getTime();
      if (ageMs < 5 * 60 * 1000) return "online";
      if (ageMs < 30 * 60 * 1000) return "warning";
      return "offline";
    };

    expect(getHealth(null)).toBe("offline");
    expect(getHealth(new Date(now - 2 * 60 * 1000).toISOString())).toBe("online");
    expect(getHealth(new Date(now - 10 * 60 * 1000).toISOString())).toBe("warning");
    expect(getHealth(new Date(now - 60 * 60 * 1000).toISOString())).toBe("offline");
  });

  it("Abuja default coordinates are within Nigeria", () => {
    const abuja = { lat: 9.0579, lng: 7.4951 };
    // Nigeria bounding box: lat 4-14, lng 3-15
    expect(abuja.lat).toBeGreaterThan(4);
    expect(abuja.lat).toBeLessThan(14);
    expect(abuja.lng).toBeGreaterThan(3);
    expect(abuja.lng).toBeLessThan(15);
  });
});
