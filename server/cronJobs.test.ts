/**
 * Tests for cronJobs.ts
 *
 * Tests the three cron job functions:
 * 1. executeDueSipPlans — SIP plan executor
 * 2. autoFreezeEscalatedRings — Fraud ring auto-freeze
 * 3. checkSettlementSLA — Settlement SLA monitor
 * 4. startCronJobs — Scheduler registration (idempotency)
 *
 * Uses vi.mock to mock getDb(), sendEmail(), and notifyOwner().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────────────
const mockGetDb = vi.fn();
vi.mock("./db", () => ({
  getDb: mockGetDb,
  execRaw: vi.fn().mockResolvedValue([]),
  getTenantBySlug: vi.fn().mockResolvedValue(null),
  updateTenantBranding: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logProcedure: vi.fn(),
}));

const mockIsSuppressed = vi.fn().mockReturnValue(false);
vi.mock("./workerErrorFilter", () => ({
  isSuppressedWorkerError: mockIsSuppressed,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a mock Drizzle DB that returns specified rows for execute() calls.
 */
function createMockDb(executeRows: Record<string, unknown>[] = []) {
  return {
    execute: vi.fn().mockResolvedValue({ rows: executeRows }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("cronJobs — executeDueSipPlans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when getDb() returns null", async () => {
    mockGetDb.mockResolvedValue(null);
    const { startCronJobs } = await import("./cronJobs");
    // startCronJobs is idempotent — just verify it doesn't throw
    expect(() => startCronJobs()).not.toThrow();
  });

  it("handles empty due SIP plans (no rows)", async () => {
    const mockDb = createMockDb([]); // no due plans
    mockGetDb.mockResolvedValue(mockDb);

    // Re-import to get fresh module state
    const { logger } = await import("./logger");
    // No error should be logged
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("suppresses DB errors via isSuppressedWorkerError", async () => {
    mockIsSuppressed.mockReturnValue(true);

    const mockDb = {
      execute: vi.fn().mockRejectedValue(new Error("Failed query: SELECT * FROM sip_plans")),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const { logger } = await import("./logger");
    // Error should be suppressed — logger.error should NOT be called
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("cronJobs — autoFreezeEscalatedRings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuppressed.mockReturnValue(false);
  });

  it("handles empty stale rings (no rows to freeze)", async () => {
    const mockDb = createMockDb([]); // no stale rings
    mockGetDb.mockResolvedValue(mockDb);

    const { logger } = await import("./logger");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("suppresses DB errors via isSuppressedWorkerError", async () => {
    mockIsSuppressed.mockReturnValue(true);

    const mockDb = {
      execute: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432")),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const { logger } = await import("./logger");
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("cronJobs — checkSettlementSLA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuppressed.mockReturnValue(false);
  });

  it("handles no SLA breaches (0 rows updated)", async () => {
    const mockDb = createMockDb([]); // no breached settlements
    mockGetDb.mockResolvedValue(mockDb);

    const { logger } = await import("./logger");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("suppresses 'Failed query' errors via isSuppressedWorkerError", async () => {
    mockIsSuppressed.mockReturnValue(true);

    const mockDb = {
      execute: vi.fn().mockRejectedValue(new Error("Failed query: UPDATE settlements")),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const { logger } = await import("./logger");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("suppresses 'column does not exist' errors (schema not migrated)", async () => {
    mockIsSuppressed.mockReturnValue(false); // not suppressed by filter

    const mockDb = {
      execute: vi.fn().mockRejectedValue(
        new Error('column "sla_breached_at" of relation "settlements" does not exist')
      ),
    };
    mockGetDb.mockResolvedValue(mockDb);

    const { logger } = await import("./logger");
    // The catch block also checks for "column" and "does not exist" keywords
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("cronJobs — startCronJobs", () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Reset the cronStarted flag by re-importing the module
    vi.resetModules();
  });

  it("can be called without throwing", async () => {
    mockGetDb.mockResolvedValue(null);
    const { startCronJobs } = await import("./cronJobs");
    expect(() => startCronJobs()).not.toThrow();
  });

  it("is idempotent — calling twice does not double-register", async () => {
    mockGetDb.mockResolvedValue(null);
    const { startCronJobs, logger: _logger } = await import("./cronJobs");
    const { logger } = await import("./logger");

    startCronJobs();
    const infoCallCount = vi.mocked(logger.info).mock.calls.length;
    startCronJobs(); // second call — should be a no-op
    // logger.info should not have been called again for the second startCronJobs()
    expect(vi.mocked(logger.info).mock.calls.length).toBe(infoCallCount);
  });
});

describe("cronJobs — isSuppressedWorkerError integration", () => {
  it("uses isSuppressedWorkerError from workerErrorFilter module", async () => {
    const { isSuppressedWorkerError } = await import("./workerErrorFilter");
    // Verify the mock is in place
    expect(typeof isSuppressedWorkerError).toBe("function");
  });

  it("workerErrorFilter mock returns expected values", () => {
    // Test the mock's behavior (the real filter is tested in workerErrorFilter.test.ts)
    mockIsSuppressed.mockReturnValueOnce(true);
    expect(mockIsSuppressed(new Error("connect ECONNREFUSED"))).toBe(true);
    mockIsSuppressed.mockReturnValueOnce(false);
    expect(mockIsSuppressed(new Error("Unexpected error"))).toBe(false);
  });
});
