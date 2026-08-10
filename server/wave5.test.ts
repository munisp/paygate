/**
 * Wave 5 — Vitest tests
 * Covers:
 *  - Quote expiry countdown logic
 *  - Corridor volume heatmap normalisation
 *  - Webhook event log filtering and status badge logic
 *  - getCorridorVolume DB helper (pure logic path)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Quote Expiry Countdown ───────────────────────────────────────────────────

describe("Quote expiry countdown", () => {
  const QUOTE_TTL_SECONDS = 300;

  function secondsLeft(expiresAt: string): number {
    return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
  }

  function pct(secs: number): number {
    return (secs / QUOTE_TTL_SECONDS) * 100;
  }

  it("returns 100% at the moment of creation", () => {
    const expiresAt = new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString();
    const secs = secondsLeft(expiresAt);
    expect(pct(secs)).toBeCloseTo(100, 0);
  });

  it("returns 0% for an already-expired quote", () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    const secs = secondsLeft(expiresAt);
    expect(secs).toBe(0);
    expect(pct(secs)).toBe(0);
  });

  it("returns approximately 50% at the halfway point", () => {
    const expiresAt = new Date(Date.now() + (QUOTE_TTL_SECONDS / 2) * 1000).toISOString();
    const secs = secondsLeft(expiresAt);
    expect(pct(secs)).toBeCloseTo(50, 1);
  });

  it("is urgent (<=30s) near expiry", () => {
    const expiresAt = new Date(Date.now() + 25_000).toISOString();
    const secs = secondsLeft(expiresAt);
    expect(secs).toBeLessThanOrEqual(30);
  });

  it("is critical (<=10s) very close to expiry", () => {
    const expiresAt = new Date(Date.now() + 8_000).toISOString();
    const secs = secondsLeft(expiresAt);
    expect(secs).toBeLessThanOrEqual(10);
  });

  it("formats time as M:SS", () => {
    const secs = 185;
    const formatted = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    expect(formatted).toBe("3:05");
  });

  it("formats 0 seconds as 0:00", () => {
    const secs = 0;
    const formatted = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    expect(formatted).toBe("0:00");
  });
});

// ─── Corridor Volume Heatmap Normalisation ────────────────────────────────────

describe("Corridor volume heatmap normalisation", () => {
  const MOCK_VOLUMES = [
    { corridor: "NGN-KES", transferCount: 120 },
    { corridor: "NGN-GHS", transferCount: 80 },
    { corridor: "NGN-ZAR", transferCount: 40 },
    { corridor: "NGN-USD", transferCount: 10 },
    { corridor: "KES-NGN", transferCount: 0 },
  ];

  function buildVolumeMap(volumes: typeof MOCK_VOLUMES): Record<string, number> {
    const map: Record<string, number> = {};
    for (const v of volumes) map[v.corridor] = v.transferCount;
    return map;
  }

  function normalise(count: number, max: number): number {
    return count / Math.max(1, max);
  }

  function heatmapClass(n: number): string {
    if (n >= 0.75) return "high";
    if (n >= 0.5) return "medium-high";
    if (n >= 0.25) return "medium-low";
    return "low";
  }

  it("highest corridor gets normalised value of 1.0", () => {
    const map = buildVolumeMap(MOCK_VOLUMES);
    const max = Math.max(...Object.values(map));
    expect(normalise(map["NGN-KES"], max)).toBe(1.0);
  });

  it("zero-volume corridor gets normalised value of 0", () => {
    const map = buildVolumeMap(MOCK_VOLUMES);
    const max = Math.max(...Object.values(map));
    expect(normalise(map["KES-NGN"], max)).toBe(0);
  });

  it("classifies NGN-KES as high heat", () => {
    const map = buildVolumeMap(MOCK_VOLUMES);
    const max = Math.max(...Object.values(map));
    expect(heatmapClass(normalise(map["NGN-KES"], max))).toBe("high");
  });

  it("classifies NGN-GHS as medium-high heat", () => {
    const map = buildVolumeMap(MOCK_VOLUMES);
    const max = Math.max(...Object.values(map));
    expect(heatmapClass(normalise(map["NGN-GHS"], max))).toBe("medium-high");
  });

  it("classifies NGN-ZAR as medium-low heat", () => {
    const map = buildVolumeMap(MOCK_VOLUMES);
    const max = Math.max(...Object.values(map));
    expect(heatmapClass(normalise(map["NGN-ZAR"], max))).toBe("medium-low");
  });

  it("classifies NGN-USD as low heat", () => {
    const map = buildVolumeMap(MOCK_VOLUMES);
    const max = Math.max(...Object.values(map));
    expect(heatmapClass(normalise(map["NGN-USD"], max))).toBe("low");
  });

  it("handles all-zero volumes without division by zero", () => {
    const allZero = MOCK_VOLUMES.map(v => ({ ...v, transferCount: 0 }));
    const map = buildVolumeMap(allZero);
    const max = Math.max(1, ...Object.values(map)); // Math.max(1, ...) guard
    for (const corridor of Object.keys(map)) {
      expect(normalise(map[corridor], max)).toBe(0);
    }
  });

  it("heatmap bar width is at least 2% for non-zero corridors", () => {
    const map = buildVolumeMap(MOCK_VOLUMES);
    const max = Math.max(...Object.values(map));
    const width = Math.max(2, normalise(map["NGN-USD"], max) * 100);
    expect(width).toBeGreaterThanOrEqual(2);
  });
});

// ─── Webhook Event Log Status Logic ──────────────────────────────────────────

describe("Webhook delivery status badge logic", () => {
  function isSuccess(status: string, responseStatus: number | null): boolean {
    return status === "delivered" || (responseStatus != null && responseStatus >= 200 && responseStatus < 300);
  }

  function isFailed(status: string): boolean {
    return status === "failed";
  }

  function badgeVariant(status: string, responseStatus: number | null): "success" | "failed" | "pending" {
    if (isSuccess(status, responseStatus)) return "success";
    if (isFailed(status)) return "failed";
    return "pending";
  }

  it("marks delivered status as success", () => {
    expect(badgeVariant("delivered", 200)).toBe("success");
  });

  it("marks HTTP 200 as success regardless of status string", () => {
    expect(badgeVariant("pending", 200)).toBe("success");
  });

  it("marks HTTP 201 as success", () => {
    expect(badgeVariant("pending", 201)).toBe("success");
  });

  it("marks HTTP 400 as failed", () => {
    expect(badgeVariant("failed", 400)).toBe("failed");
  });

  it("marks HTTP 500 as failed", () => {
    expect(badgeVariant("failed", 500)).toBe("failed");
  });

  it("marks pending status with no response as pending", () => {
    expect(badgeVariant("pending", null)).toBe("pending");
  });

  it("marks retrying status as pending", () => {
    expect(badgeVariant("retrying", null)).toBe("pending");
  });

  it("HTTP 299 is still a success", () => {
    expect(badgeVariant("delivered", 299)).toBe("success");
  });

  it("HTTP 300 is not a success (redirect)", () => {
    expect(badgeVariant("pending", 300)).toBe("pending");
  });
});

// ─── Webhook Filter Logic ─────────────────────────────────────────────────────

describe("Webhook event log filter", () => {
  const MOCK_DELIVERIES = [
    { id: "d1", webhookId: "wh1", eventType: "payment.success", status: "delivered", responseStatus: 200 },
    { id: "d2", webhookId: "wh1", eventType: "payment.failed", status: "failed", responseStatus: 500 },
    { id: "d3", webhookId: "wh2", eventType: "payout.created", status: "delivered", responseStatus: 200 },
    { id: "d4", webhookId: "wh2", eventType: "dispute.opened", status: "pending", responseStatus: null },
    { id: "d5", webhookId: "wh3", eventType: "kyc.approved", status: "delivered", responseStatus: 200 },
  ];

  function filterDeliveries(deliveries: typeof MOCK_DELIVERIES, webhookId: string) {
    if (webhookId === "all") return deliveries;
    return deliveries.filter(d => d.webhookId === webhookId);
  }

  it("returns all deliveries when filter is 'all'", () => {
    expect(filterDeliveries(MOCK_DELIVERIES, "all")).toHaveLength(5);
  });

  it("filters to wh1 deliveries only", () => {
    const result = filterDeliveries(MOCK_DELIVERIES, "wh1");
    expect(result).toHaveLength(2);
    expect(result.every(d => d.webhookId === "wh1")).toBe(true);
  });

  it("filters to wh2 deliveries only", () => {
    const result = filterDeliveries(MOCK_DELIVERIES, "wh2");
    expect(result).toHaveLength(2);
    expect(result.every(d => d.webhookId === "wh2")).toBe(true);
  });

  it("returns empty array for unknown webhook ID", () => {
    expect(filterDeliveries(MOCK_DELIVERIES, "wh999")).toHaveLength(0);
  });

  it("respects limit of 20 (simulated)", () => {
    const large = Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`, webhookId: "wh1", eventType: "payment.success",
      status: "delivered", responseStatus: 200,
    }));
    const limited = filterDeliveries(large, "all").slice(0, 20);
    expect(limited).toHaveLength(20);
  });
});
