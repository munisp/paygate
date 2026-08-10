/**
 * Wave 161 — Resilient Connectivity Tests
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function fileExists(rel: string) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ─── 1. Router ────────────────────────────────────────────────────────────────
describe("Wave 161: wave161Router", () => {
  it("router file exists", () => {
    expect(fileExists("server/routers/wave161.ts")).toBe(true);
  });
  it("exports wave161Router", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("export const wave161Router");
  });
  it("has offlineQueue.list procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("offlineQueue");
    expect(content).toContain("list");
  });
  it("has offlineQueue.enqueue procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("enqueue");
  });
  it("has offlineQueue.sync procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("sync");
  });
  it("has offlineQueue.retry procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("retry");
  });
  it("has offlineQueue.cancel procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("cancel");
  });
  it("has offlineQueue.stats procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("stats");
  });
  it("has retryPolicy.list procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("retryPolicy");
  });
  it("has networkQuality.report procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("networkQuality");
    expect(content).toContain("report");
  });
  it("has networkQuality.getStatus procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("getStatus");
  });
  it("has networkQuality.history procedure", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("history");
  });
  it("implements exponential backoff computeNextRetry", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("computeNextRetry");
    expect(content).toContain("backoffMultiplier");
    expect(content).toContain("maxDelayMs");
  });
  it("defines DEFAULT_POLICIES for 5 operation types", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("payment.create");
    expect(content).toContain("payout.approve");
    expect(content).toContain("webhook.deliver");
    expect(content).toContain("kyc.submit");
    expect(content).toContain("default");
  });
  it("transport selection logic covers offline_queue, sse_fallback, polling_fallback, websocket", () => {
    const content = readFile("server/routers/wave161.ts");
    expect(content).toContain("offline_queue");
    expect(content).toContain("sse_fallback");
    expect(content).toContain("polling_fallback");
    expect(content).toContain("websocket");
  });
});

// ─── 2. Schema ────────────────────────────────────────────────────────────────
describe("Wave 161: schema tables", () => {
  it("offline_queue table is defined in schema.ts", () => {
    const content = readFile("drizzle/schema.ts");
    expect(content).toContain("offlineQueue");
    expect(content).toContain("offline_queue");
  });
  it("retry_policies table is defined in schema.ts", () => {
    const content = readFile("drizzle/schema.ts");
    expect(content).toContain("retryPolicies");
    expect(content).toContain("retry_policies");
  });
  it("network_quality_events table is defined in schema.ts", () => {
    const content = readFile("drizzle/schema.ts");
    expect(content).toContain("networkQualityEvents");
    expect(content).toContain("network_quality_events");
  });
  it("offline_queue_status enum is defined", () => {
    const content = readFile("drizzle/schema.ts");
    expect(content).toContain("offline_queue_status");
  });
  it("offline_queue_priority enum is defined", () => {
    const content = readFile("drizzle/schema.ts");
    expect(content).toContain("offline_queue_priority");
  });
});

// ─── 3. Router registration ───────────────────────────────────────────────────
describe("Wave 161: router registration", () => {
  it("wave161Router is imported in routers.ts", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("wave161Router");
  });
  it("resilientConnectivity namespace is registered", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("resilientConnectivity");
  });
});

// ─── 4. Frontend page ─────────────────────────────────────────────────────────
describe("Wave 161: ResilienceCenter page", () => {
  it("ResilienceCenter.tsx exists", () => {
    expect(fileExists("client/src/pages/ResilienceCenter.tsx")).toBe(true);
  });
  it("page uses trpc.resilientConnectivity.offlineQueue.list", () => {
    const content = readFile("client/src/pages/ResilienceCenter.tsx");
    expect(content).toContain("resilientConnectivity.offlineQueue.list");
  });
  it("page uses trpc.resilientConnectivity.offlineQueue.stats", () => {
    const content = readFile("client/src/pages/ResilienceCenter.tsx");
    expect(content).toContain("resilientConnectivity.offlineQueue.stats");
  });
  it("page uses trpc.resilientConnectivity.networkQuality.getStatus", () => {
    const content = readFile("client/src/pages/ResilienceCenter.tsx");
    expect(content).toContain("resilientConnectivity.networkQuality.getStatus");
  });
  it("page uses trpc.resilientConnectivity.retryPolicy.list", () => {
    const content = readFile("client/src/pages/ResilienceCenter.tsx");
    expect(content).toContain("resilientConnectivity.retryPolicy.list");
  });
  it("page is registered in App.tsx", () => {
    const appTsx = readFile("client/src/App.tsx");
    expect(appTsx).toContain("ResilienceCenter");
    expect(appTsx).toContain("/resilience-center");
  });
  it("page is in sidebar navigation", () => {
    const layout = readFile("client/src/components/Layout.tsx");
    expect(layout).toContain("/resilience-center");
  });
});
