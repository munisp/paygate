/**
 * SLA Breach Auto-Escalation Scheduler Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runSlaEscalation, startSlaEscalationScheduler, stopSlaEscalationScheduler } from "./slaEscalation";

// ─── Mock getDb ────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// ─── Mock notifyOwner ──────────────────────────────────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Mock webhookDispatch ────────────────────────────────────────────
vi.mock("./webhookDispatch", () => ({
  dispatchSlaBreachWebhook: vi.fn().mockResolvedValue({ dispatched: 0, failed: 0 }),
}));

// ─── Mock drizzle-orm ─────────────────────────────────────────────────────────
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args) => ({ type: "and", args })),
    eq: vi.fn((col, val) => ({ type: "eq", col, val })),
    isNull: vi.fn((col) => ({ type: "isNull", col })),
    lte: vi.fn((col, val) => ({ type: "lte", col, val })),
    sql: actual.sql,
  };
});

// ─── Mock schema ──────────────────────────────────────────────────────────────
vi.mock("../drizzle/schema", () => ({
  settlements: {
    id: "id",
    status: "status",
    severity: "severity",
    resolvedAt: "resolvedAt",
    slaBreachedAt: "slaBreachedAt",
    notes: "notes",
    updatedAt: "updatedAt",
  },
}));

import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeMockDb(rows: object[] = []) {
  const mockUpdate = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  const mockSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return {
    select: vi.fn().mockReturnValue(mockSelect),
    update: vi.fn().mockReturnValue(mockUpdate),
    _mockSelect: mockSelect,
    _mockUpdate: mockUpdate,
  };
}

function makeBreachRow(overrides: Partial<{
  id: string;
  reference: string;
  merchantId: string;
  amount: number;
  currency: string;
  slaBreachedAt: Date;
  slaDeadlineAt: Date;
  resolvedAt: Date | null;
  severity: string;
}> = {}) {
  const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000);
  return {
    id: "settle_001",
    reference: "REF-001",
    merchantId: "merch_001",
    amount: 100000,
    currency: "NGN",
    slaBreachedAt: fiveHoursAgo,
    slaDeadlineAt: new Date(Date.now() - 7 * 3_600_000),
    resolvedAt: null,
    severity: "high",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("runSlaEscalation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early with error when db is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null as any);
    const result = await runSlaEscalation();
    expect(result.escalatedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Database unavailable");
  });

  it("returns zero escalations when no candidates found", async () => {
    const db = makeMockDb([]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const result = await runSlaEscalation();
    expect(result.escalatedCount).toBe(0);
    expect(result.escalatedIds).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("escalates a single high-severity breach to critical", async () => {
    const breach = makeBreachRow();
    const db = makeMockDb([breach]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await runSlaEscalation();

    expect(result.escalatedCount).toBe(1);
    expect(result.escalatedIds).toContain("settle_001");
    expect(result.errors).toHaveLength(0);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("fires notifyOwner for each escalated breach", async () => {
    const breach = makeBreachRow();
    const db = makeMockDb([breach]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    await runSlaEscalation();

    expect(notifyOwner).toHaveBeenCalledTimes(1);
    const call = vi.mocked(notifyOwner).mock.calls[0][0];
    expect(call.title).toContain("CRITICAL");
    expect(call.title).toContain("REF-001");
    expect(call.content).toContain("auto-escalated from HIGH to **CRITICAL**");
  });

  it("escalates multiple breaches in a single run", async () => {
    const breaches = [
      makeBreachRow({ id: "settle_001", reference: "REF-001" }),
      makeBreachRow({ id: "settle_002", reference: "REF-002" }),
      makeBreachRow({ id: "settle_003", reference: "REF-003" }),
    ];
    const db = makeMockDb(breaches);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await runSlaEscalation();

    expect(result.escalatedCount).toBe(3);
    expect(result.escalatedIds).toEqual(["settle_001", "settle_002", "settle_003"]);
    expect(notifyOwner).toHaveBeenCalledTimes(3);
  });

  it("records error and continues when individual escalation fails", async () => {
    const breaches = [
      makeBreachRow({ id: "settle_001", reference: "REF-001" }),
      makeBreachRow({ id: "settle_002", reference: "REF-002" }),
    ];
    const db = makeMockDb(breaches);
    // Make the update fail for the first call only
    let callCount = 0;
    db._mockUpdate.where.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("DB write failed"));
      return Promise.resolve(undefined);
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await runSlaEscalation();

    expect(result.escalatedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("settle_001");
    expect(result.errors[0]).toContain("DB write failed");
  });

  it("includes ranAt timestamp in result", async () => {
    const db = makeMockDb([]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    const before = Date.now();
    const result = await runSlaEscalation();
    const after = Date.now();
    expect(result.ranAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.ranAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("calculates correct hours overdue in notification", async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 3_600_000);
    const breach = makeBreachRow({ slaBreachedAt: sixHoursAgo });
    const db = makeMockDb([breach]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    await runSlaEscalation();

    const call = vi.mocked(notifyOwner).mock.calls[0][0];
    expect(call.content).toContain("6h");
  });

  it("handles null slaBreachedAt gracefully", async () => {
    const breach = makeBreachRow({ slaBreachedAt: null as any });
    const db = makeMockDb([breach]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await runSlaEscalation();
    // Should not throw, should still escalate
    expect(result.errors).toHaveLength(0);
    expect(result.escalatedCount).toBe(1);
  });

  it("handles null slaDeadlineAt gracefully in notification", async () => {
    const breach = makeBreachRow({ slaDeadlineAt: null as any });
    const db = makeMockDb([breach]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    await runSlaEscalation();
    const call = vi.mocked(notifyOwner).mock.calls[0][0];
    expect(call.content).toContain("N/A");
  });

  it("records query error in result when db.select throws", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => { throw new Error("Connection lost"); }),
      update: vi.fn(),
    };
    vi.mocked(getDb).mockResolvedValue(db as any);

    const result = await runSlaEscalation();
    expect(result.escalatedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Connection lost");
  });
});

describe("startSlaEscalationScheduler / stopSlaEscalationScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopSlaEscalationScheduler();
  });

  afterEach(() => {
    stopSlaEscalationScheduler();
    vi.useRealTimers();
  });

  it("starts without throwing", () => {
    expect(() => startSlaEscalationScheduler()).not.toThrow();
  });

  it("is idempotent — calling start twice does not create two timers", () => {
    const db = makeMockDb([]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    startSlaEscalationScheduler();
    startSlaEscalationScheduler(); // second call should be a no-op
    // advance 15 min — should only fire once
    vi.advanceTimersByTime(900_000);
    // db.select is called at most once per interval tick
    expect(db.select.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("stops cleanly without throwing", () => {
    startSlaEscalationScheduler();
    expect(() => stopSlaEscalationScheduler()).not.toThrow();
  });

  it("stop is idempotent when called without start", () => {
    expect(() => stopSlaEscalationScheduler()).not.toThrow();
    expect(() => stopSlaEscalationScheduler()).not.toThrow();
  });
});
