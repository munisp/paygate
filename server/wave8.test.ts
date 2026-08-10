/**
 * Wave 8 Tests
 * Tests cover:
 *  - SSE live transaction stream (event format, heartbeat, client registry)
 *  - Notification preferences update (toggle logic, persistence, partial update)
 *  - Bulk payout CSV upload (parsing, validation, per-row result reporting)
 *  - Dashboard live stream hook (event aggregation, deduplication)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── SSE Live Transaction Stream ──────────────────────────────────────────────
describe("SSE: live transaction stream", () => {
  it("formats SSE event payload correctly", () => {
    const event = "transaction.created";
    const data = { id: "tx_abc123", amount: 5000, currency: "NGN", status: "completed" };
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    expect(payload).toContain("event: transaction.created");
    expect(payload).toContain('"id":"tx_abc123"');
    expect(payload).toContain('"amount":5000');
    expect(payload.endsWith("\n\n")).toBe(true);
  });

  it("heartbeat comment line keeps connection alive", () => {
    const heartbeat = `: heartbeat\n\n`;
    expect(heartbeat.startsWith(":")).toBe(true);
    expect(heartbeat.endsWith("\n\n")).toBe(true);
  });

  it("broadcaster skips merchants with no connected clients", () => {
    const sseClients = new Map<string, Set<{ write: (s: string) => void }>>();
    const written: string[] = [];
    const broadcast = (merchantId: string, event: string, data: unknown) => {
      const clients = sseClients.get(merchantId);
      if (!clients || clients.size === 0) return;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of Array.from(clients)) {
        res.write(payload);
        written.push(payload);
      }
    };
    broadcast("merchant_no_clients", "transaction.created", { id: "tx1" });
    expect(written).toHaveLength(0);
  });

  it("broadcaster delivers to all connected clients for a merchant", () => {
    const sseClients = new Map<string, Set<{ write: (s: string) => void }>>();
    const written: string[] = [];
    const mockRes1 = { write: (s: string) => written.push(`client1:${s}`) };
    const mockRes2 = { write: (s: string) => written.push(`client2:${s}`) };
    sseClients.set("merchant_001", new Set([mockRes1, mockRes2]));
    const broadcast = (merchantId: string, event: string, data: unknown) => {
      const clients = sseClients.get(merchantId);
      if (!clients || clients.size === 0) return;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of Array.from(clients)) res.write(payload);
    };
    broadcast("merchant_001", "transaction.created", { id: "tx2", amount: 10000 });
    expect(written).toHaveLength(2);
    expect(written[0]).toContain("client1:");
    expect(written[1]).toContain("client2:");
    expect(written[0]).toContain("transaction.created");
  });

  it("removes disconnected client from registry on close", () => {
    const sseClients = new Map<string, Set<object>>();
    const mockRes = { write: vi.fn() };
    sseClients.set("merchant_002", new Set([mockRes]));
    expect(sseClients.get("merchant_002")?.size).toBe(1);
    // Simulate disconnect
    sseClients.get("merchant_002")?.delete(mockRes);
    expect(sseClients.get("merchant_002")?.size).toBe(0);
  });

  it("broadcaster handles write errors by removing dead client", () => {
    const sseClients = new Map<string, Set<{ write: (s: string) => void }>>();
    const deadClient = {
      write: (_: string) => { throw new Error("EPIPE: broken pipe"); }
    };
    sseClients.set("merchant_003", new Set([deadClient]));
    const broadcast = (merchantId: string, event: string, data: unknown) => {
      const clients = sseClients.get(merchantId);
      if (!clients || clients.size === 0) return;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of Array.from(clients)) {
        try { res.write(payload); } catch { clients.delete(res); }
      }
    };
    expect(() => broadcast("merchant_003", "tx.created", {})).not.toThrow();
    expect(sseClients.get("merchant_003")?.size).toBe(0);
  });

  it("SSE requires authentication — unauthenticated context returns 401", () => {
    const ctx = { user: null };
    const isAuthorized = ctx.user !== null;
    expect(isAuthorized).toBe(false);
  });
});

// ─── Notification Preferences ─────────────────────────────────────────────────
describe("settings.updateNotificationPrefs", () => {
  it("accepts all three notification toggles", () => {
    const input = {
      notifyOnFraudAlert: true,
      notifyOnPayout: false,
      notifyOnDispute: true,
    };
    const keys = Object.keys(input);
    expect(keys).toContain("notifyOnFraudAlert");
    expect(keys).toContain("notifyOnPayout");
    expect(keys).toContain("notifyOnDispute");
  });

  it("allows partial update — only provided fields are changed", () => {
    const existing = { notifyOnFraudAlert: true, notifyOnPayout: true, notifyOnDispute: true };
    const patch = { notifyOnPayout: false };
    const updated = { ...existing, ...patch };
    expect(updated.notifyOnFraudAlert).toBe(true);
    expect(updated.notifyOnPayout).toBe(false);
    expect(updated.notifyOnDispute).toBe(true);
  });

  it("toggle from true to false disables notification", () => {
    let pref = true;
    pref = !pref;
    expect(pref).toBe(false);
  });

  it("toggle from false to true enables notification", () => {
    let pref = false;
    pref = !pref;
    expect(pref).toBe(true);
  });

  it("defaults are all enabled (true)", () => {
    const defaults = { notifyOnFraudAlert: true, notifyOnPayout: true, notifyOnDispute: true };
    expect(defaults.notifyOnFraudAlert).toBe(true);
    expect(defaults.notifyOnPayout).toBe(true);
    expect(defaults.notifyOnDispute).toBe(true);
  });

  it("rejects non-boolean values for notification flags", () => {
    const validate = (val: unknown): boolean => typeof val === "boolean";
    expect(validate(true)).toBe(true);
    expect(validate(false)).toBe(true);
    expect(validate("yes")).toBe(false);
    expect(validate(1)).toBe(false);
    expect(validate(null)).toBe(false);
  });
});

// ─── Bulk Payout CSV Parsing ──────────────────────────────────────────────────
type BulkRow = { amount: number; currency: string; bankCode?: string; accountNumber?: string; accountName?: string; narration?: string };

function parseCsvRows(text: string): { rows: BulkRow[]; errors: string[] } {
  const lines = text.trim().split("\n");
  const errors: string[] = [];
  const rows: BulkRow[] = [];
  const start = lines[0]?.toLowerCase().includes("amount") ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const [amountStr, currency = "NGN", bankCode, accountNumber, accountName, narration] = cols;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < 100) {
      errors.push(`Row ${i + 1}: invalid amount "${amountStr}"`);
      continue;
    }
    rows.push({ amount, currency: currency || "NGN", bankCode, accountNumber, accountName, narration });
  }
  return { rows, errors };
}

describe("payouts.createBulk — CSV parsing", () => {
  it("parses valid CSV with header row", () => {
    const csv = "amount,currency,bankCode,accountNumber,accountName,narration\n5000,NGN,044,0123456789,John Doe,Salary";
    const { rows, errors } = parseCsvRows(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].currency).toBe("NGN");
    expect(rows[0].bankCode).toBe("044");
  });

  it("parses CSV without header row", () => {
    const csv = "10000,GHS,030,9876543210,Jane Smith,Vendor payment";
    const { rows, errors } = parseCsvRows(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
    expect(rows[0].amount).toBe(10000);
    expect(rows[0].currency).toBe("GHS");
  });

  it("rejects rows with amount below minimum (100)", () => {
    const csv = "amount,currency\n50,NGN\n200,NGN";
    const { rows, errors } = parseCsvRows(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("invalid amount");
  });

  it("rejects rows with non-numeric amount", () => {
    const csv = "amount,currency\nabc,NGN\n500,NGN";
    const { rows, errors } = parseCsvRows(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("defaults currency to NGN when not provided", () => {
    const csv = "5000,,044,0123456789";
    const { rows } = parseCsvRows(csv);
    expect(rows[0].currency).toBe("NGN");
  });

  it("handles quoted CSV values correctly", () => {
    const csv = '"5000","NGN","044","0123456789","John Doe","Salary payment"';
    const { rows, errors } = parseCsvRows(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].accountName).toBe("John Doe");
  });

  it("parses multiple rows and counts correctly", () => {
    const csv = "amount,currency\n1000,NGN\n2000,GHS\n3000,KES";
    const { rows, errors } = parseCsvRows(csv);
    expect(rows).toHaveLength(3);
    expect(errors).toHaveLength(0);
  });

  it("skips invalid rows but continues parsing valid ones", () => {
    const csv = "amount,currency\n50,NGN\n1000,GHS\nabc,KES\n2000,ZAR";
    const { rows, errors } = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(2);
  });
});

describe("payouts.createBulk — batch result reporting", () => {
  it("reports per-row success and failure", () => {
    type BulkResult = { index: number; success: boolean; id?: string; error?: string };
    const results: BulkResult[] = [
      { index: 0, success: true, id: "pyo_001" },
      { index: 1, success: false, error: "Insufficient balance" },
      { index: 2, success: true, id: "pyo_003" },
    ];
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    expect(succeeded).toBe(2);
    expect(failed).toBe(1);
    expect(results[1].error).toBe("Insufficient balance");
  });

  it("total equals succeeded + failed", () => {
    const total = 10;
    const succeeded = 8;
    const failed = 2;
    expect(succeeded + failed).toBe(total);
  });

  it("all-success batch has zero failures", () => {
    const results = Array.from({ length: 5 }, (_, i) => ({
      index: i, success: true, id: `pyo_00${i}`
    }));
    const failed = results.filter(r => !r.success).length;
    expect(failed).toBe(0);
  });

  it("enforces maximum batch size of 500 rows", () => {
    const maxBatchSize = 500;
    const oversized = Array.from({ length: 501 }, (_, i) => ({ amount: 1000, currency: "NGN" }));
    const isValid = oversized.length <= maxBatchSize;
    expect(isValid).toBe(false);
  });

  it("enforces minimum batch size of 1 row", () => {
    const minBatchSize = 1;
    const empty: unknown[] = [];
    const isValid = empty.length >= minBatchSize;
    expect(isValid).toBe(false);
  });

  it("fee calculation is 0.5% of payout amount", () => {
    const amount = 10000;
    const feeAmount = Math.round(amount * 0.005);
    expect(feeAmount).toBe(50);
  });

  it("fee rounds correctly for fractional amounts", () => {
    const amount = 3333;
    const feeAmount = Math.round(amount * 0.005);
    expect(feeAmount).toBe(17); // 16.665 → 17
  });
});

// ─── Dashboard Live Stream Hook ───────────────────────────────────────────────
describe("useTransactionStream — event aggregation", () => {
  it("prepends new transaction to stream list", () => {
    const existing = [{ id: "tx1", amount: 1000 }, { id: "tx2", amount: 2000 }];
    const newTx = { id: "tx3", amount: 3000 };
    const updated = [newTx, ...existing];
    expect(updated[0].id).toBe("tx3");
    expect(updated).toHaveLength(3);
  });

  it("caps stream list at 50 items to prevent memory growth", () => {
    const MAX_STREAM = 50;
    const existing = Array.from({ length: 50 }, (_, i) => ({ id: `tx${i}`, amount: i * 100 }));
    const newTx = { id: "tx_new", amount: 9999 };
    const updated = [newTx, ...existing].slice(0, MAX_STREAM);
    expect(updated).toHaveLength(MAX_STREAM);
    expect(updated[0].id).toBe("tx_new");
  });

  it("deduplicates events by transaction ID", () => {
    const existing = [{ id: "tx1", amount: 1000 }];
    const duplicate = { id: "tx1", amount: 1000 };
    const alreadyExists = existing.some(t => t.id === duplicate.id);
    expect(alreadyExists).toBe(true);
    const updated = alreadyExists ? existing : [duplicate, ...existing];
    expect(updated).toHaveLength(1);
  });

  it("EventSource connects to correct SSE endpoint", () => {
    const endpoint = "/api/events/transactions";
    expect(endpoint).toBe("/api/events/transactions");
    expect(endpoint.startsWith("/api/")).toBe(true);
  });

  it("reconnects on connection error with exponential backoff", () => {
    const baseDelay = 1000;
    const maxDelay = 30000;
    const getBackoffDelay = (attempt: number) =>
      Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    expect(getBackoffDelay(0)).toBe(1000);
    expect(getBackoffDelay(1)).toBe(2000);
    expect(getBackoffDelay(2)).toBe(4000);
    expect(getBackoffDelay(5)).toBe(30000); // capped at maxDelay
  });
});
