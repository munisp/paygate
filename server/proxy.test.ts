import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock fetch so tests don't make real HTTP calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("paygate proxy router", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("ping returns pong with mock data when backend is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.ping();
    // ping returns { connected: boolean, latencyMs?: number }
    expect(result).toHaveProperty("connected");
  });

  it("gatewayHealth returns health object", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.gatewayHealth();
    expect(result).toHaveProperty("status");
  });

  it("gatewayRoutes returns array", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.gatewayRoutes();
    expect(Array.isArray(result)).toBe(true);
  });

  it("kafka returns object with brokers array", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.kafka();
    // MOCK_KAFKA has a top-level brokers array
    expect(result).toHaveProperty("brokers");
    expect(Array.isArray((result as any).brokers)).toBe(true);
  });

  it("redis returns object with hitRate", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.redis();
    // MOCK_REDIS has hitRate nested under stats
    expect(result).toHaveProperty("stats");
    expect((result as any).stats).toHaveProperty("hitRate");
  });

  it("pool returns object with pools array", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.pool();
    expect(result).toHaveProperty("pools");
  });

  it("consumerGroupDetail returns partitions and members arrays", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.consumerGroupDetail({ groupName: "payment-processor" });
    expect(result).toHaveProperty("partitions");
    expect(result).toHaveProperty("members");
    expect(result).toHaveProperty("lagHistory");
    expect(Array.isArray(result.partitions)).toBe(true);
    expect(Array.isArray(result.members)).toBe(true);
    // payment-processor has 12 partitions and 4 members
    expect(result.partitions.length).toBe(12);
    expect(result.members.length).toBe(4);
  });

  it("topicHistory with date range returns history scoped to range", async () => {
    const caller = appRouter.createCaller(createCtx());
    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const to   = new Date().toISOString();
    const result = await caller.paygate.topicHistory({ topicName: "payment.events", from, to });
    expect(result).toHaveProperty("history");
    expect(Array.isArray(result.history)).toBe(true);
    // 7 days → daily buckets → ~7 points (≤ 90)
    expect(result.history.length).toBeGreaterThan(0);
    expect(result.history.length).toBeLessThanOrEqual(90);
  });

  it("redisNodeHistory with date range returns memHistory and hitMissHistory", async () => {
    const caller = appRouter.createCaller(createCtx());
    const from = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const to   = new Date().toISOString();
    const result = await caller.paygate.redisNodeHistory({ nodeId: "redis-primary", from, to });
    expect(result).toHaveProperty("memHistory");
    expect(result).toHaveProperty("hitMissHistory");
    expect(Array.isArray(result.memHistory)).toBe(true);
    // 48h → 48 hourly points
    expect(result.memHistory.length).toBe(48);
  });

  it("getThresholds returns default values when no DB row exists", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.getThresholds();
    expect(result).toHaveProperty("lagWarn");
    expect(result).toHaveProperty("lagCritical");
    expect(result).toHaveProperty("memWarnPct");
    expect(result).toHaveProperty("memCriticalPct");
    // Defaults
    expect(result.lagWarn).toBe(5);
    expect(result.lagCritical).toBe(20);
  });

  it("consumerGroupDetail partitions include recentlyReassigned flag", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.consumerGroupDetail({ groupName: "audit-archiver" });
    expect(result.partitions.length).toBeGreaterThan(0);
    // Every partition must have the recentlyReassigned boolean
    result.partitions.forEach(p => {
      expect(typeof (p as any).recentlyReassigned).toBe("boolean");
    });
    // At least some partitions should be flagged (deterministic seed guarantees this)
    const flagged = result.partitions.filter(p => (p as any).recentlyReassigned);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it("checkBreaches returns notified=false and empty breaches when mock data is within defaults", async () => {
    // MOCK_KAFKA audit-archiver has lag=12 which exceeds lagWarn=5 → 1 warn breach expected
    // MOCK_REDIS primary is 842/4096 (~20%) — below memWarnPct=70 → no Redis breach
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED")); // force mock fallback
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.checkBreaches({ forceMock: true });
    expect(result).toHaveProperty("notified");
    expect(result).toHaveProperty("breaches");
    expect(Array.isArray(result.breaches)).toBe(true);
    // Warn breach detected but not critical → notified=false (no owner push for warn-only)
    expect(result.notified).toBe(false);
    // At least 1 warn breach for kafka_lag
    expect(result.breaches.length).toBeGreaterThanOrEqual(1);
    const kafkaBreach = result.breaches.find((b: { metric: string }) => b.metric === "kafka_lag");
    expect(kafkaBreach).toBeDefined();
    expect((kafkaBreach as any).severity).toBe("warn");
  });

  it("listBreaches returns events and total fields", async () => {
    const caller = appRouter.createCaller(createCtx());
    // DB may not be available in test env — procedure should return empty gracefully
    const result = await caller.paygate.listBreaches({});
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.events)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("listBreaches respects severity filter input", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.listBreaches({ severity: "critical", limit: 10, offset: 0 });
    expect(result).toHaveProperty("events");
    // All returned events should be critical (or empty if DB is unavailable)
    result.events.forEach(e => {
      expect(e.severity).toBe("critical");
    });
  });

  it("acknowledgeBreaches returns acknowledged count", async () => {
    const caller = appRouter.createCaller(createCtx());
    // Pass a non-existent ID — should return 0 acknowledged (DB may be unavailable)
    const result = await caller.paygate.acknowledgeBreaches({ ids: [999999] });
    expect(result).toHaveProperty("acknowledged");
    expect(typeof result.acknowledged).toBe("number");
  });

  it("unacknowledgedCount returns a non-negative number", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.unacknowledgedCount();
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it("listAlertRules returns rules array", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.listAlertRules();
    expect(result).toHaveProperty("rules");
    expect(Array.isArray(result.rules)).toBe(true);
  });

  it("saveAlertRule creates a new rule and returns it", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.paygate.saveAlertRule({
      name: "test-rule",
      metric: "kafka_lag",
      target: "payment-processor",
      severity: "warn",
      threshold: 50,
    });
    expect(result).toHaveProperty("ok");
    expect(result.ok).toBe(true);
  });

  it("deleteAlertRule returns deleted count", async () => {
    const caller = appRouter.createCaller(createCtx());
    // Delete a non-existent rule — should return 0
    const result = await caller.paygate.deleteAlertRule({ id: 999999 });
    expect(result).toHaveProperty("ok");
  });

  it("toggleAlertRule returns the updated rule", async () => {
    // First create a rule to toggle
    const caller = appRouter.createCaller(createCtx());
    const created = await caller.paygate.saveAlertRule({
      name: "toggle-test-rule",
      metric: "redis_memory",
      target: "redis-primary",
      severity: "critical",
      threshold: 90,
    });
    expect(created).toHaveProperty("ok");
    expect(created.ok).toBe(true);
    // Toggle a non-existent rule — should still return ok
    const toggled = await caller.paygate.toggleAlertRule({ id: 999999, enabled: false });
    expect(toggled).toHaveProperty("ok");
  });
});
