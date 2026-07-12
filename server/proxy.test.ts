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
});
