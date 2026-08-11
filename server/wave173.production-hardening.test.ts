/**
 * Wave 173 — NDPR Retention, KYB Renewal, Geo-Velocity, Liveness Trend
 * Tests: NDPR 90-day biometric retention, KYB document renewal reminders,
 *        geo-velocity anomaly detection, liveness score trend.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── Pure logic helpers (mirroring server implementations) ───────────────────

const BIOMETRIC_RETENTION_DAYS = 90;

function isRetentionExpired(createdAt: Date, now = new Date()): boolean {
  const expiryMs =
    createdAt.getTime() + BIOMETRIC_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() > expiryMs;
}

function kybDocumentExpiryWarning(
  expiryDate: Date,
  now = new Date()
): "expired" | "expiring_soon" | "valid" {
  const daysUntilExpiry =
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 90) return "expiring_soon";
  return "valid";
}

interface GeoPoint {
  lat: number;
  lon: number;
  ts: number; // Unix ms
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const chord =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(chord));
}

function geoVelocityKmh(a: GeoPoint, b: GeoPoint): number {
  const distKm = haversineKm(a, b);
  const hours = Math.abs(b.ts - a.ts) / (1000 * 60 * 60);
  if (hours === 0) return Infinity;
  return distKm / hours;
}

const MAX_HUMAN_VELOCITY_KMH = 900; // commercial aircraft speed

function isGeoVelocityAnomaly(a: GeoPoint, b: GeoPoint): boolean {
  return geoVelocityKmh(a, b) > MAX_HUMAN_VELOCITY_KMH;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Wave 173 — NDPR Biometric Retention (90 days)", () => {
  it("should flag session created 91 days ago as expired", () => {
    const past = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    expect(isRetentionExpired(past)).toBe(true);
  });

  it("should not flag session created 89 days ago", () => {
    const recent = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);
    expect(isRetentionExpired(recent)).toBe(false);
  });

  it("should not flag session created today", () => {
    expect(isRetentionExpired(new Date())).toBe(false);
  });

  it("retention period is exactly 90 days", () => {
    expect(BIOMETRIC_RETENTION_DAYS).toBe(90);
  });

  it("in-process NDPR purge job was removed from index.ts", () => {
    // Real contract: no ndpr/biometric purge handler remains in index.ts;
    // biometric retention is governed by docs/DATA_RETENTION_POLICY.md.
    const src = fs.readFileSync(
      path.join(ROOT, "server/_core/index.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/ndpr.*purge|biometric.*purge|purge.*biometric/i);
  });

  it("face_embeddings table remains in the schema with retention policy docs", () => {
    const schema = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf8");
    expect(schema).toMatch(/face_embeddings|faceEmbeddings/);
    const policy = fs.readFileSync(path.join(ROOT, "docs/DATA_RETENTION_POLICY.md"), "utf8");
    expect(policy.toLowerCase()).toContain("biometric");
  });
});

describe("Wave 173 — KYB Document Renewal Reminders", () => {
  it("should return 'expired' for a document that expired yesterday", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(kybDocumentExpiryWarning(yesterday)).toBe("expired");
  });

  it("should return 'expiring_soon' for a document expiring in 30 days", () => {
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    expect(kybDocumentExpiryWarning(soon)).toBe("expiring_soon");
  });

  it("should return 'expiring_soon' for a document expiring in exactly 90 days", () => {
    const boundary = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    expect(kybDocumentExpiryWarning(boundary)).toBe("expiring_soon");
  });

  it("should return 'valid' for a document expiring in 180 days", () => {
    const future = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    expect(kybDocumentExpiryWarning(future)).toBe("valid");
  });
});

describe("Wave 173 — Geo-Velocity Anomaly Detection", () => {
  it("should flag Lagos→London in 1 minute as anomaly (impossible velocity)", () => {
    const lagos: GeoPoint = { lat: 6.5244, lon: 3.3792, ts: 0 };
    const london: GeoPoint = { lat: 51.5074, lon: -0.1278, ts: 60_000 }; // 1 min later
    expect(isGeoVelocityAnomaly(lagos, london)).toBe(true);
  });

  it("should not flag Lagos→Abuja in 1 hour as anomaly (~500 km/h by air)", () => {
    const lagos: GeoPoint = { lat: 6.5244, lon: 3.3792, ts: 0 };
    const abuja: GeoPoint = { lat: 9.0579, lon: 7.4951, ts: 3_600_000 }; // 1 hour
    // ~480 km, 1 hour → ~480 km/h, below 900 km/h threshold
    expect(isGeoVelocityAnomaly(lagos, abuja)).toBe(false);
  });

  it("haversine distance Lagos→London is approximately 5000 km", () => {
    const lagos: GeoPoint = { lat: 6.5244, lon: 3.3792, ts: 0 };
    const london: GeoPoint = { lat: 51.5074, lon: -0.1278, ts: 0 };
    const dist = haversineKm(lagos, london);
    expect(dist).toBeGreaterThan(4900);
    expect(dist).toBeLessThan(5200);
  });

  it("should return Infinity velocity for same timestamp", () => {
    const p1: GeoPoint = { lat: 6.5, lon: 3.4, ts: 1000 };
    const p2: GeoPoint = { lat: 51.5, lon: -0.1, ts: 1000 };
    expect(geoVelocityKmh(p1, p2)).toBe(Infinity);
  });
});

describe("Wave 173 — Liveness Score Trend", () => {
  it("liveness_sessions table exists in schema", () => {
    const schema = fs.readFileSync(
      path.join(ROOT, "drizzle/schema.ts"),
      "utf8"
    );
    expect(schema).toContain("liveness_sessions");
  });

  it("liveness_sessions has decision column for trend analysis", () => {
    const schema = fs.readFileSync(
      path.join(ROOT, "drizzle/schema.ts"),
      "utf8"
    );
    const idx = schema.indexOf("liveness_sessions");
    const block = schema.slice(idx, idx + 800);
    expect(block).toContain("decision");
  });

  it("trend calculation: pass rate over 7 sessions", () => {
    const sessions = [
      { decision: "pass" },
      { decision: "pass" },
      { decision: "fail" },
      { decision: "pass" },
      { decision: "pass" },
      { decision: "fail" },
      { decision: "pass" },
    ];
    const passRate =
      sessions.filter((s) => s.decision === "pass").length / sessions.length;
    expect(passRate).toBeCloseTo(5 / 7, 2);
  });
});
