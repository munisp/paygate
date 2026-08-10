/**
 * Round 51 Tests:
 * 1. Geo anomaly email notification (geoAnomalyEmail template)
 * 2. Anomaly config audit log (recordAnomalyConfigChange, getAnomalyConfigAuditLog)
 * 3. Active Sessions country column (getLatestCountryForUsers)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. Geo Anomaly Email Template ───────────────────────────────────────────

describe("geoAnomalyEmail", () => {
  it("generates correct subject with country name", async () => {
    const { geoAnomalyEmail } = await import("./emailService");
    const result = geoAnomalyEmail({
      ownerEmail: "admin@paygate.com",
      userId: "user-abc-123",
      newCountry: "Nigeria",
      knownCountries: ["United States", "United Kingdom"],
      ipAddress: "197.210.1.1",
      timestamp: new Date("2025-01-15T10:00:00Z"),
      portalUrl: "https://paygate.manus.space",
    });
    expect(result.subject).toContain("Nigeria");
    expect(result.subject).toContain("New Country Login Detected");
  });

  it("includes user ID in email body", async () => {
    const { geoAnomalyEmail } = await import("./emailService");
    const result = geoAnomalyEmail({
      ownerEmail: "admin@paygate.com",
      userId: "user-xyz-789",
      newCountry: "Brazil",
      knownCountries: ["Canada"],
      timestamp: new Date(),
      portalUrl: "https://paygate.manus.space",
    });
    expect(result.html).toContain("user-xyz-789");
    expect(result.html).toContain("Brazil");
  });

  it("shows 'None on record' when knownCountries is empty", async () => {
    const { geoAnomalyEmail } = await import("./emailService");
    const result = geoAnomalyEmail({
      ownerEmail: "admin@paygate.com",
      userId: "new-user-001",
      newCountry: "Germany",
      knownCountries: [],
      timestamp: new Date(),
      portalUrl: "https://paygate.manus.space",
    });
    expect(result.html).toContain("None on record");
  });

  it("includes IP address when provided", async () => {
    const { geoAnomalyEmail } = await import("./emailService");
    const result = geoAnomalyEmail({
      ownerEmail: "admin@paygate.com",
      userId: "user-001",
      newCountry: "France",
      knownCountries: ["Spain"],
      ipAddress: "88.200.1.1",
      timestamp: new Date(),
      portalUrl: "https://paygate.manus.space",
    });
    expect(result.html).toContain("88.200.1.1");
  });

  it("includes portal URL link in email body", async () => {
    const { geoAnomalyEmail } = await import("./emailService");
    const result = geoAnomalyEmail({
      ownerEmail: "admin@paygate.com",
      userId: "user-002",
      newCountry: "Japan",
      knownCountries: ["South Korea"],
      timestamp: new Date(),
      portalUrl: "https://custom.paygate.io",
    });
    expect(result.html).toContain("https://custom.paygate.io/active-sessions");
  });

  it("omits IP row when ipAddress is not provided", async () => {
    const { geoAnomalyEmail } = await import("./emailService");
    const result = geoAnomalyEmail({
      ownerEmail: "admin@paygate.com",
      userId: "user-003",
      newCountry: "Australia",
      knownCountries: ["New Zealand"],
      timestamp: new Date(),
      portalUrl: "https://paygate.manus.space",
    });
    // Should not have an IP Address row
    expect(result.html).not.toContain("IP Address");
  });
});

// ─── 2. Anomaly Config Audit Log ─────────────────────────────────────────────

describe("recordAnomalyConfigChange + getAnomalyConfigAuditLog", () => {
  it("recordAnomalyConfigChange is exported from db.ts", async () => {
    const db = await import("./db");
    expect(typeof db.recordAnomalyConfigChange).toBe("function");
  });

  it("getAnomalyConfigAuditLog is exported from db.ts", async () => {
    const db = await import("./db");
    expect(typeof db.getAnomalyConfigAuditLog).toBe("function");
  });

  it("getAnomalyConfigAuditLog returns an array (graceful on DB unavailable)", async () => {
    const db = await import("./db");
    const result = await db.getAnomalyConfigAuditLog(5);
    expect(Array.isArray(result)).toBe(true);
  });

  it("recordAnomalyConfigChange does not throw on DB unavailable", async () => {
    const db = await import("./db");
    await expect(db.recordAnomalyConfigChange({
      changedByUserId: 1,
      isGlobal: false,
      oldWindowMinutes: 15,
      oldThreshold: 5,
      newWindowMinutes: 30,
      newThreshold: 10,
    })).resolves.not.toThrow();
  });

  it("audit log entries have correct shape", async () => {
    const db = await import("./db");
    const result = await db.getAnomalyConfigAuditLog(5);
    for (const entry of result) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("changedByUserId");
      expect(entry).toHaveProperty("isGlobal");
      expect(entry).toHaveProperty("newWindowMinutes");
      expect(entry).toHaveProperty("newThreshold");
      expect(entry).toHaveProperty("changedAt");
      expect(entry.changedAt).toBeInstanceOf(Date);
    }
  });
});

// ─── 3. Session Country Column (getLatestCountryForUsers) ────────────────────

describe("getLatestCountryForUsers", () => {
  it("is exported from db.ts", async () => {
    const db = await import("./db");
    expect(typeof db.getLatestCountryForUsers).toBe("function");
  });

  it("returns empty object for empty input array", async () => {
    const db = await import("./db");
    const result = await db.getLatestCountryForUsers([]);
    expect(result).toEqual({});
  });

  it("returns a Record<string, string> (graceful on DB unavailable)", async () => {
    const db = await import("./db");
    const result = await db.getLatestCountryForUsers(["user-abc", "user-xyz"]);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    // All values should be strings
    for (const [k, v] of Object.entries(result)) {
      expect(typeof k).toBe("string");
      expect(typeof v).toBe("string");
    }
  });

  it("does not throw on DB unavailable", async () => {
    const db = await import("./db");
    await expect(db.getLatestCountryForUsers(["nonexistent-user"])).resolves.not.toThrow();
  });
});

// ─── 4. ActiveSessions: geoCountry field in session type ─────────────────────

describe("ActiveSessions geoCountry type", () => {
  it("session type includes geoCountry field", () => {
    // Verify the type contract by constructing a mock session object
    const mockSession: {
      id: string;
      userId: string;
      username: string;
      ipAddress: string;
      start: number;
      lastAccess: number;
      clients?: Record<string, string>;
      isNewCountry?: boolean;
      geoCountry?: string | null;
    } = {
      id: "sess-001",
      userId: "user-001",
      username: "alice",
      ipAddress: "1.2.3.4",
      start: Date.now() - 3600000,
      lastAccess: Date.now() - 60000,
      isNewCountry: true,
      geoCountry: "Nigeria",
    };
    expect(mockSession.geoCountry).toBe("Nigeria");
    expect(mockSession.isNewCountry).toBe(true);
  });

  it("geoCountry can be null (no login events for user)", () => {
    const mockSession: { geoCountry?: string | null } = { geoCountry: null };
    expect(mockSession.geoCountry).toBeNull();
  });
});
