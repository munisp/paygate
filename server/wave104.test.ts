/**
 * Wave 104 — Admin Data Pipeline Router Tests
 *
 * Tests for adminDataPipelineRouter:
 * - listDags: returns empty array when bridge unavailable
 * - triggerDag: returns triggered=false when bridge unavailable
 * - listDbtRuns: returns empty array when bridge unavailable
 * - listNifiFlows: returns empty array when bridge unavailable
 * - With bridge data: returns parsed arrays
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the middleware bridge ───────────────────────────────────────────────
vi.mock("./middlewareBridge", () => ({
  bridgeFetch: vi.fn().mockRejectedValue(new Error("Bridge unavailable")),
}));

import { adminDataPipelineRouter } from "./wave104Router";
import { bridgeFetch } from "./middlewareBridge";

function makeCtx() {
  return {
    user: { id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" as const },
    req: {} as any,
    res: {} as any,
  };
}

async function callQuery(path: string, input?: any) {
  const parts = path.split(".");
  let node: any = adminDataPipelineRouter._def.procedures;
  for (const part of parts) node = node[part];
  return node._def.resolver({ ctx: makeCtx(), input });
}

async function callMutation(path: string, input?: any) {
  return callQuery(path, input);
}

describe("adminDataPipelineRouter — bridge unavailable (fallback)", () => {
  beforeEach(() => {
    vi.mocked(bridgeFetch).mockRejectedValue(new Error("Bridge unavailable"));
  });

  it("listDags returns empty array when bridge throws", async () => {
    const result = await callQuery("listDags", { limit: 20 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("listDags returns empty array with default input", async () => {
    const result = await callQuery("listDags");
    expect(Array.isArray(result)).toBe(true);
  });

  it("triggerDag returns triggered=false when bridge unavailable", async () => {
    vi.mocked(bridgeFetch).mockResolvedValueOnce(null as any);
    const result = await callMutation("triggerDag", { dagId: "my_dag" });
    expect(result.triggered).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.runId).toBeNull();
  });

  it("listDbtRuns returns empty array when bridge throws", async () => {
    const result = await callQuery("listDbtRuns", { limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("listNifiFlows returns empty array when bridge throws", async () => {
    const result = await callQuery("listNifiFlows");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe("adminDataPipelineRouter — bridge available (with data)", () => {
  it("listDags returns parsed DAG list from bridge", async () => {
    vi.mocked(bridgeFetch).mockResolvedValueOnce({
      dags: [
        { dag_id: "etl_daily", description: "Daily ETL", is_active: true, last_run_state: "success", last_run_at: "2026-05-14T00:00:00Z", schedule_interval: "@daily" },
        { dag_id: "fraud_scoring", description: "Fraud ML", is_active: true, last_run_state: "running", last_run_at: "2026-05-14T06:00:00Z", schedule_interval: "@hourly" },
      ],
    } as any);
    const result = await callQuery("listDags", { limit: 20 });
    expect(result.length).toBe(2);
    expect(result[0].dag_id).toBe("etl_daily");
    expect(result[1].last_run_state).toBe("running");
  });

  it("triggerDag returns triggered=true with runId from bridge", async () => {
    vi.mocked(bridgeFetch).mockResolvedValueOnce({ run_id: "run-abc-123" } as any);
    const result = await callMutation("triggerDag", { dagId: "etl_daily", conf: { date: "2026-05-14" } });
    expect(result.triggered).toBe(true);
    expect(result.fallback).toBe(false);
    expect(result.runId).toBe("run-abc-123");
  });

  it("listDbtRuns returns parsed run list from bridge", async () => {
    vi.mocked(bridgeFetch).mockResolvedValueOnce({
      runs: [
        { run_id: "run-1", model_name: "dim_customers", status: "success", started_at: "2026-05-14T01:00:00Z", completed_at: "2026-05-14T01:05:00Z", rows_affected: 1500 },
      ],
    } as any);
    const result = await callQuery("listDbtRuns", { limit: 10 });
    expect(result.length).toBe(1);
    expect(result[0].model_name).toBe("dim_customers");
    expect(result[0].rows_affected).toBe(1500);
  });

  it("listNifiFlows returns parsed flow list from bridge", async () => {
    vi.mocked(bridgeFetch).mockResolvedValueOnce({
      flows: [
        { id: "flow-1", name: "Transaction Ingestion", status: "RUNNING", queued_count: 42, bytes_in: 1024000, bytes_out: 980000 },
      ],
    } as any);
    const result = await callQuery("listNifiFlows");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Transaction Ingestion");
    expect(result[0].status).toBe("RUNNING");
    expect(result[0].queued_count).toBe(42);
  });
});
