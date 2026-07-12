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
});
