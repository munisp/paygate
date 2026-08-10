/**
 * Round 49 Tests
 * - Anomaly threshold config (getAnomalyConfig / setAnomalyConfig)
 * - Proper geo column typing in getKeycloakEvents return type
 * - New-country alert dismissal (acknowledgeGeoAnomaly)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getAnomalyConfig: vi.fn(),
    setAnomalyConfig: vi.fn(),
    acknowledgeGeoAnomaly: vi.fn(),
    getKeycloakEvents: vi.fn(),
    getUserByOpenId: vi.fn(),
  };
});

import {
  getAnomalyConfig,
  setAnomalyConfig,
  acknowledgeGeoAnomaly,
  getKeycloakEvents,
  getUserByOpenId,
} from "./db";

// ── Helpers ──────────────────────────────────────────────────────────────────
const mockAdmin = { id: 1, openId: "admin-open-id", role: "admin" as const, email: "admin@test.com", name: "Admin" };

// ── getAnomalyConfig ─────────────────────────────────────────────────────────
describe("getAnomalyConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns defaults when no row exists", async () => {
    vi.mocked(getAnomalyConfig).mockResolvedValueOnce({
      loginAnomalyWindowMinutes: 15,
      loginAnomalyThreshold: 5,
    });
    const cfg = await getAnomalyConfig(1);
    expect(cfg.loginAnomalyWindowMinutes).toBe(15);
    expect(cfg.loginAnomalyThreshold).toBe(5);
  });

  it("returns persisted values when row exists", async () => {
    vi.mocked(getAnomalyConfig).mockResolvedValueOnce({
      loginAnomalyWindowMinutes: 30,
      loginAnomalyThreshold: 10,
    });
    const cfg = await getAnomalyConfig(1);
    expect(cfg.loginAnomalyWindowMinutes).toBe(30);
    expect(cfg.loginAnomalyThreshold).toBe(10);
  });

  it("is called with the correct userId", async () => {
    vi.mocked(getAnomalyConfig).mockResolvedValueOnce({ loginAnomalyWindowMinutes: 15, loginAnomalyThreshold: 5 });
    await getAnomalyConfig(42);
    expect(getAnomalyConfig).toHaveBeenCalledWith(42);
  });
});

// ── setAnomalyConfig ─────────────────────────────────────────────────────────
describe("setAnomalyConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls setAnomalyConfig with correct args", async () => {
    vi.mocked(setAnomalyConfig).mockResolvedValueOnce(undefined);
    await setAnomalyConfig(1, 30, 10);
    expect(setAnomalyConfig).toHaveBeenCalledWith(1, 30, 10);
  });

  it("accepts boundary values (1 min window, threshold 1)", async () => {
    vi.mocked(setAnomalyConfig).mockResolvedValueOnce(undefined);
    await setAnomalyConfig(1, 1, 1);
    expect(setAnomalyConfig).toHaveBeenCalledWith(1, 1, 1);
  });

  it("accepts max boundary values (1440 min, threshold 1000)", async () => {
    vi.mocked(setAnomalyConfig).mockResolvedValueOnce(undefined);
    await setAnomalyConfig(1, 1440, 1000);
    expect(setAnomalyConfig).toHaveBeenCalledWith(1, 1440, 1000);
  });
});

// ── acknowledgeGeoAnomaly ────────────────────────────────────────────────────
describe("acknowledgeGeoAnomaly", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls acknowledgeGeoAnomaly with the correct eventId", async () => {
    vi.mocked(acknowledgeGeoAnomaly).mockResolvedValueOnce(undefined);
    await acknowledgeGeoAnomaly(99);
    expect(acknowledgeGeoAnomaly).toHaveBeenCalledWith(99);
  });

  it("does not throw on valid eventId", async () => {
    vi.mocked(acknowledgeGeoAnomaly).mockResolvedValueOnce(undefined);
    await expect(acknowledgeGeoAnomaly(1)).resolves.toBeUndefined();
  });
});

// ── getKeycloakEvents geo_anomaly_acknowledged field ────────────────────────
describe("getKeycloakEvents geo_anomaly_acknowledged field", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns geo_anomaly_acknowledged as false for normal events", async () => {
    vi.mocked(getKeycloakEvents).mockResolvedValueOnce([
      {
        id: 1,
        event_type: "LOGIN",
        realm_id: "paygate",
        client_id: "web",
        user_id: "user-123",
        session_id: "sess-abc",
        ip_address: "1.2.3.4",
        geo_country: "Nigeria",
        geo_city: "Lagos",
        geo_anomaly_acknowledged: false,
        error: null,
        details: null,
        received_at: new Date(),
      },
    ]);
    const events = await getKeycloakEvents({ limit: 10, offset: 0 });
    expect(events[0].geo_anomaly_acknowledged).toBe(false);
  });

  it("returns geo_anomaly_acknowledged as true after dismissal", async () => {
    vi.mocked(getKeycloakEvents).mockResolvedValueOnce([
      {
        id: 2,
        event_type: "LOGIN",
        realm_id: "paygate",
        client_id: "web",
        user_id: "user-456",
        session_id: "sess-def",
        ip_address: "5.6.7.8",
        geo_country: "Ghana",
        geo_city: "Accra",
        geo_anomaly_acknowledged: true,
        error: null,
        details: null,
        received_at: new Date(),
      },
    ]);
    const events = await getKeycloakEvents({ limit: 10, offset: 0 });
    expect(events[0].geo_anomaly_acknowledged).toBe(true);
  });

  it("returns geo_country and geo_city as typed strings (not any)", async () => {
    vi.mocked(getKeycloakEvents).mockResolvedValueOnce([
      {
        id: 3,
        event_type: "LOGIN",
        realm_id: null,
        client_id: null,
        user_id: "user-789",
        session_id: null,
        ip_address: "9.10.11.12",
        geo_country: "Kenya",
        geo_city: "Nairobi",
        geo_anomaly_acknowledged: null,
        error: null,
        details: null,
        received_at: new Date(),
      },
    ]);
    const events = await getKeycloakEvents({ limit: 10, offset: 0 });
    const evt = events[0];
    // These should be typed as string | null, not any
    expect(typeof evt.geo_country).toBe("string");
    expect(typeof evt.geo_city).toBe("string");
    expect(evt.geo_country).toBe("Kenya");
    expect(evt.geo_city).toBe("Nairobi");
  });

  it("handles null geo fields gracefully", async () => {
    vi.mocked(getKeycloakEvents).mockResolvedValueOnce([
      {
        id: 4,
        event_type: "LOGOUT",
        realm_id: null,
        client_id: null,
        user_id: "user-000",
        session_id: null,
        ip_address: null,
        geo_country: null,
        geo_city: null,
        geo_anomaly_acknowledged: null,
        error: null,
        details: null,
        received_at: new Date(),
      },
    ]);
    const events = await getKeycloakEvents({ limit: 10, offset: 0 });
    expect(events[0].geo_country).toBeNull();
    expect(events[0].geo_city).toBeNull();
    expect(events[0].geo_anomaly_acknowledged).toBeNull();
  });
});

// ── Integration: config round-trip ──────────────────────────────────────────
describe("anomaly config round-trip", () => {
  it("set then get returns the same values", async () => {
    vi.mocked(setAnomalyConfig).mockResolvedValueOnce(undefined);
    vi.mocked(getAnomalyConfig).mockResolvedValueOnce({
      loginAnomalyWindowMinutes: 45,
      loginAnomalyThreshold: 20,
    });
    await setAnomalyConfig(1, 45, 20);
    const cfg = await getAnomalyConfig(1);
    expect(cfg.loginAnomalyWindowMinutes).toBe(45);
    expect(cfg.loginAnomalyThreshold).toBe(20);
  });

  it("overwrite config with new values", async () => {
    vi.mocked(setAnomalyConfig).mockResolvedValue(undefined);
    vi.mocked(getAnomalyConfig)
      .mockResolvedValueOnce({ loginAnomalyWindowMinutes: 15, loginAnomalyThreshold: 5 })
      .mockResolvedValueOnce({ loginAnomalyWindowMinutes: 60, loginAnomalyThreshold: 15 });

    await setAnomalyConfig(1, 15, 5);
    const first = await getAnomalyConfig(1);
    expect(first.loginAnomalyWindowMinutes).toBe(15);

    await setAnomalyConfig(1, 60, 15);
    const second = await getAnomalyConfig(1);
    expect(second.loginAnomalyWindowMinutes).toBe(60);
    expect(second.loginAnomalyThreshold).toBe(15);
  });
});
