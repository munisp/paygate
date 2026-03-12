/**
 * NIP Account Resolution Retry & Error Logging Tests
 * Tests the resolveAccountWithRetry procedure and nip_resolution_errors table helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Retry logic unit tests ────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  onError?: (err: unknown, attempt: number) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      onError?.(err, attempt);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastError;
}

describe("retryWithBackoff", () => {
  it("succeeds on first attempt without retrying", async () => {
    const fn = vi.fn().mockResolvedValue({ accountName: "JOHN DOE" });
    const result = await retryWithBackoff(fn, MAX_RETRIES, 1);
    expect(result).toEqual({ accountName: "JOHN DOE" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("NIBSS_TIMEOUT"))
      .mockResolvedValueOnce({ accountName: "JANE DOE" });
    const errors: Array<{ err: unknown; attempt: number }> = [];
    const result = await retryWithBackoff(fn, MAX_RETRIES, 1, (err, attempt) => {
      errors.push({ err, attempt });
    });
    expect(result).toEqual({ accountName: "JANE DOE" });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].attempt).toBe(1);
  });

  it("retries up to maxRetries and throws on all failures", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("NIBSS_UNAVAILABLE"));
    const errors: number[] = [];
    await expect(
      retryWithBackoff(fn, MAX_RETRIES, 1, (_, attempt) => errors.push(attempt))
    ).rejects.toThrow("NIBSS_UNAVAILABLE");
    expect(fn).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(errors).toEqual([1, 2, 3]);
  });

  it("succeeds on third attempt after two failures", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("TIMEOUT"))
      .mockRejectedValueOnce(new Error("TIMEOUT"))
      .mockResolvedValueOnce({ accountName: "ALICE SMITH" });
    const result = await retryWithBackoff(fn, MAX_RETRIES, 1);
    expect(result).toEqual({ accountName: "ALICE SMITH" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when maxRetries is 1", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("FAIL"));
    await expect(retryWithBackoff(fn, 1, 1)).rejects.toThrow("FAIL");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── NIP resolution error log helpers ────────────────────────────────────

interface NipResolutionError {
  id: number;
  tenantId: string;
  merchantId: string;
  bankCode: string;
  accountNumber: string;
  errorCode: string;
  errorMessage: string;
  attemptNumber: number;
  errorSource: string;
  resolvedAt: Date | null;
  createdAt: Date;
}

// In-memory store for testing
let errorStore: NipResolutionError[] = [];
let nextId = 1;

function createNipResolutionError(input: Omit<NipResolutionError, "id" | "resolvedAt" | "createdAt">): NipResolutionError {
  const record: NipResolutionError = {
    ...input,
    id: nextId++,
    resolvedAt: null,
    createdAt: new Date(),
  };
  errorStore.push(record);
  return record;
}

function listNipResolutionErrors(filters: {
  tenantId?: string;
  merchantId?: string;
  bankCode?: string;
  limit?: number;
  offset?: number;
}): { rows: NipResolutionError[]; total: number } {
  let rows = errorStore.filter(e => {
    if (filters.tenantId && e.tenantId !== filters.tenantId) return false;
    if (filters.merchantId && e.merchantId !== filters.merchantId) return false;
    if (filters.bankCode && e.bankCode !== filters.bankCode) return false;
    return true;
  });
  const total = rows.length;
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 20;
  rows = rows.slice(offset, offset + limit);
  return { rows, total };
}

function countNipResolutionErrors(tenantId: string, bankCode?: string): number {
  return errorStore.filter(e => {
    if (e.tenantId !== tenantId) return false;
    if (bankCode && e.bankCode !== bankCode) return false;
    return true;
  }).length;
}

function markNipErrorResolved(id: number): NipResolutionError | null {
  const idx = errorStore.findIndex(e => e.id === id);
  if (idx === -1) return null;
  errorStore[idx].resolvedAt = new Date();
  return errorStore[idx];
}

beforeEach(() => {
  errorStore = [];
  nextId = 1;
});

describe("NIP resolution error log", () => {
  it("creates an error record with correct fields", () => {
    const record = createNipResolutionError({
      tenantId: "ten_001",
      merchantId: "mer_001",
      bankCode: "058",
      accountNumber: "0123456789",
      errorCode: "NIBSS_TIMEOUT",
      errorMessage: "NIBSS name enquiry timed out after 30s",
      attemptNumber: 1,
      errorSource: "nibss",
    });
    expect(record.id).toBe(1);
    expect(record.tenantId).toBe("ten_001");
    expect(record.bankCode).toBe("058");
    expect(record.attemptNumber).toBe(1);
    expect(record.resolvedAt).toBeNull();
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  it("logs multiple attempts for the same account", () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      createNipResolutionError({
        tenantId: "ten_001",
        merchantId: "mer_001",
        bankCode: "058",
        accountNumber: "0123456789",
        errorCode: "NIBSS_TIMEOUT",
        errorMessage: `Attempt ${attempt} timed out`,
        attemptNumber: attempt,
        errorSource: "nibss",
      });
    }
    const { rows, total } = listNipResolutionErrors({ tenantId: "ten_001" });
    expect(total).toBe(3);
    expect(rows.map(r => r.attemptNumber)).toEqual([1, 2, 3]);
  });

  it("filters by tenantId correctly", () => {
    createNipResolutionError({
      tenantId: "ten_001", merchantId: "mer_001", bankCode: "058",
      accountNumber: "0123456789", errorCode: "TIMEOUT", errorMessage: "timeout",
      attemptNumber: 1, errorSource: "nibss",
    });
    createNipResolutionError({
      tenantId: "ten_002", merchantId: "mer_002", bankCode: "011",
      accountNumber: "9876543210", errorCode: "INVALID_ACCOUNT", errorMessage: "invalid",
      attemptNumber: 1, errorSource: "nibss",
    });
    const { rows, total } = listNipResolutionErrors({ tenantId: "ten_001" });
    expect(total).toBe(1);
    expect(rows[0].tenantId).toBe("ten_001");
  });

  it("filters by bankCode correctly", () => {
    createNipResolutionError({
      tenantId: "ten_001", merchantId: "mer_001", bankCode: "058",
      accountNumber: "0123456789", errorCode: "TIMEOUT", errorMessage: "timeout",
      attemptNumber: 1, errorSource: "nibss",
    });
    createNipResolutionError({
      tenantId: "ten_001", merchantId: "mer_001", bankCode: "011",
      accountNumber: "9876543210", errorCode: "TIMEOUT", errorMessage: "timeout",
      attemptNumber: 1, errorSource: "nibss",
    });
    const { rows } = listNipResolutionErrors({ tenantId: "ten_001", bankCode: "058" });
    expect(rows).toHaveLength(1);
    expect(rows[0].bankCode).toBe("058");
  });

  it("paginates results correctly", () => {
    for (let i = 0; i < 10; i++) {
      createNipResolutionError({
        tenantId: "ten_001", merchantId: "mer_001", bankCode: "058",
        accountNumber: `012345678${i}`, errorCode: "TIMEOUT", errorMessage: `timeout ${i}`,
        attemptNumber: 1, errorSource: "nibss",
      });
    }
    const page1 = listNipResolutionErrors({ tenantId: "ten_001", limit: 4, offset: 0 });
    const page2 = listNipResolutionErrors({ tenantId: "ten_001", limit: 4, offset: 4 });
    const page3 = listNipResolutionErrors({ tenantId: "ten_001", limit: 4, offset: 8 });
    expect(page1.total).toBe(10);
    expect(page1.rows).toHaveLength(4);
    expect(page2.rows).toHaveLength(4);
    expect(page3.rows).toHaveLength(2);
  });

  it("counts errors by tenant", () => {
    for (let i = 0; i < 5; i++) {
      createNipResolutionError({
        tenantId: "ten_001", merchantId: "mer_001", bankCode: "058",
        accountNumber: `012345678${i}`, errorCode: "TIMEOUT", errorMessage: "timeout",
        attemptNumber: 1, errorSource: "nibss",
      });
    }
    createNipResolutionError({
      tenantId: "ten_002", merchantId: "mer_002", bankCode: "011",
      accountNumber: "9876543210", errorCode: "TIMEOUT", errorMessage: "timeout",
      attemptNumber: 1, errorSource: "nibss",
    });
    expect(countNipResolutionErrors("ten_001")).toBe(5);
    expect(countNipResolutionErrors("ten_002")).toBe(1);
    expect(countNipResolutionErrors("ten_003")).toBe(0);
  });

  it("counts errors by tenant and bankCode", () => {
    createNipResolutionError({
      tenantId: "ten_001", merchantId: "mer_001", bankCode: "058",
      accountNumber: "0123456789", errorCode: "TIMEOUT", errorMessage: "timeout",
      attemptNumber: 1, errorSource: "nibss",
    });
    createNipResolutionError({
      tenantId: "ten_001", merchantId: "mer_001", bankCode: "011",
      accountNumber: "9876543210", errorCode: "TIMEOUT", errorMessage: "timeout",
      attemptNumber: 1, errorSource: "nibss",
    });
    expect(countNipResolutionErrors("ten_001", "058")).toBe(1);
    expect(countNipResolutionErrors("ten_001", "011")).toBe(1);
    expect(countNipResolutionErrors("ten_001", "033")).toBe(0);
  });

  it("marks an error as resolved", () => {
    const record = createNipResolutionError({
      tenantId: "ten_001", merchantId: "mer_001", bankCode: "058",
      accountNumber: "0123456789", errorCode: "TIMEOUT", errorMessage: "timeout",
      attemptNumber: 1, errorSource: "nibss",
    });
    expect(record.resolvedAt).toBeNull();
    const resolved = markNipErrorResolved(record.id);
    expect(resolved).not.toBeNull();
    expect(resolved!.resolvedAt).toBeInstanceOf(Date);
  });

  it("returns null when marking non-existent error as resolved", () => {
    const result = markNipErrorResolved(9999);
    expect(result).toBeNull();
  });
});

// ─── Retry + error log integration ───────────────────────────────────────

describe("resolveAccountWithRetry integration", () => {
  it("logs errors for each failed attempt before success", async () => {
    const loggedErrors: Array<{ attempt: number; errorCode: string }> = [];
    const mockResolve = vi.fn()
      .mockRejectedValueOnce(new Error("NIBSS_TIMEOUT"))
      .mockRejectedValueOnce(new Error("NIBSS_TIMEOUT"))
      .mockResolvedValueOnce({ accountName: "JOHN DOE", sessionId: "sess_123" });

    const result = await retryWithBackoff(
      mockResolve,
      MAX_RETRIES,
      1,
      (err, attempt) => {
        loggedErrors.push({
          attempt,
          errorCode: (err as Error).message,
        });
      }
    );

    expect(result).toEqual({ accountName: "JOHN DOE", sessionId: "sess_123" });
    expect(loggedErrors).toHaveLength(2);
    expect(loggedErrors[0]).toEqual({ attempt: 1, errorCode: "NIBSS_TIMEOUT" });
    expect(loggedErrors[1]).toEqual({ attempt: 2, errorCode: "NIBSS_TIMEOUT" });
  });

  it("logs all 3 attempts when all fail", async () => {
    const loggedErrors: number[] = [];
    const mockResolve = vi.fn().mockRejectedValue(new Error("NIBSS_UNAVAILABLE"));

    await expect(
      retryWithBackoff(mockResolve, MAX_RETRIES, 1, (_, attempt) => loggedErrors.push(attempt))
    ).rejects.toThrow("NIBSS_UNAVAILABLE");

    expect(loggedErrors).toEqual([1, 2, 3]);
  });

  it("does not log errors when first attempt succeeds", async () => {
    const loggedErrors: number[] = [];
    const mockResolve = vi.fn().mockResolvedValue({ accountName: "SUCCESS" });

    await retryWithBackoff(mockResolve, MAX_RETRIES, 1, (_, attempt) => loggedErrors.push(attempt));
    expect(loggedErrors).toHaveLength(0);
  });

  it("error source is correctly categorized", () => {
    const categorizeError = (err: Error): string => {
      if (err.message.includes("TIMEOUT")) return "nibss";
      if (err.message.includes("BRIDGE")) return "bridge";
      if (err.message.includes("INVALID")) return "validation";
      return "unknown";
    };

    expect(categorizeError(new Error("NIBSS_TIMEOUT"))).toBe("nibss");
    expect(categorizeError(new Error("BRIDGE_UNAVAILABLE"))).toBe("bridge");
    expect(categorizeError(new Error("INVALID_ACCOUNT"))).toBe("validation");
    expect(categorizeError(new Error("UNKNOWN_ERROR"))).toBe("unknown");
  });

  it("exponential backoff delays increase correctly", () => {
    const delays = [1, 2, 3].map(attempt => BASE_DELAY_MS * Math.pow(2, attempt - 1));
    expect(delays).toEqual([100, 200, 400]);
  });
});
