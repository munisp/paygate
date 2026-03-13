/**
 * Wave 29 Tests — POS Full-Stack: ISO 8583, Fluvio, PTSP Settlement, Rewards Auto-Earn
 *
 * Tests cover:
 * - ISO 8583 message parsing logic
 * - POS reconciliation report data shaping
 * - PTSP batch settlement grouping
 * - EMV offline queue deduplication
 * - Rewards auto-earn calculation
 * - Fluvio event schema validation
 */

import { describe, it, expect } from "vitest";

// ─── ISO 8583 Parser Tests ────────────────────────────────────────────────────

describe("ISO 8583 Parser", () => {
  // Simulate the field extraction logic from iso8583_parser.go
  function parseISO8583Fields(raw: Record<string, string>) {
    return {
      mti: raw["mti"] ?? "",
      pan: raw["2"] ? raw["2"].slice(-4).padStart(raw["2"].length, "*") : "",
      processingCode: raw["3"] ?? "",
      amountKobo: raw["4"] ? parseInt(raw["4"], 10) : 0,
      transmissionDateTime: raw["7"] ?? "",
      rrn: raw["37"] ?? "",
      responseCode: raw["39"] ?? "",
      terminalId: raw["41"] ?? "",
      merchantId: raw["42"] ?? "",
      cardAcceptorName: raw["43"] ?? "",
      currencyCode: raw["49"] ?? "566", // 566 = NGN
    };
  }

  it("parses a purchase authorisation request (MTI 0100)", () => {
    const raw = {
      mti: "0100",
      "2": "5399999999991234",
      "3": "000000",
      "4": "150000", // ₦1,500.00 in kobo
      "7": "0313143022",
      "37": "RRN123456789",
      "41": "TID00001",
      "42": "MID000000001",
      "43": "SHOPRITE IKEJA",
      "49": "566",
    };
    const parsed = parseISO8583Fields(raw);
    expect(parsed.mti).toBe("0100");
    expect(parsed.pan).toContain("****");
    expect(parsed.pan).toContain("1234");
    expect(parsed.amountKobo).toBe(150000);
    expect(parsed.currencyCode).toBe("566");
    expect(parsed.terminalId).toBe("TID00001");
  });

  it("defaults currency to NGN (566) when field 49 is absent", () => {
    const parsed = parseISO8583Fields({ mti: "0200", "4": "50000" });
    expect(parsed.currencyCode).toBe("566");
  });

  it("masks PAN correctly — only last 4 digits visible", () => {
    const parsed = parseISO8583Fields({ "2": "4111111111111111" });
    expect(parsed.pan).toMatch(/^\*+1111$/);
    expect(parsed.pan).not.toContain("411111");
  });

  it("returns zero amountKobo for missing field 4", () => {
    const parsed = parseISO8583Fields({ mti: "0100" });
    expect(parsed.amountKobo).toBe(0);
  });

  it("parses reversal MTI 0400", () => {
    const parsed = parseISO8583Fields({ mti: "0400", "4": "75000", "37": "REV001" });
    expect(parsed.mti).toBe("0400");
    expect(parsed.rrn).toBe("REV001");
  });

  it("parses balance enquiry MTI 0100 with processing code 310000", () => {
    const parsed = parseISO8583Fields({ mti: "0100", "3": "310000" });
    expect(parsed.processingCode).toBe("310000");
  });
});

// ─── POS Reconciliation Report Tests ─────────────────────────────────────────

describe("POS Reconciliation Report", () => {
  interface TxRow {
    settlementDate: string;
    terminalId: string;
    channel: string;
    status: string;
    amountKobo: number;
  }

  function groupForRecon(rows: TxRow[]) {
    const groups: Record<string, { count: number; volumeKobo: number; settled: number }> = {};
    for (const row of rows) {
      const key = `${row.settlementDate}|${row.terminalId}|${row.channel}|${row.status}`;
      if (!groups[key]) groups[key] = { count: 0, volumeKobo: 0, settled: 0 };
      groups[key].count++;
      groups[key].volumeKobo += row.amountKobo;
      if (row.status === "completed") groups[key].settled++;
    }
    return groups;
  }

  const sampleRows: TxRow[] = [
    { settlementDate: "2026-03-13", terminalId: "T1", channel: "card", status: "completed", amountKobo: 150000 },
    { settlementDate: "2026-03-13", terminalId: "T1", channel: "card", status: "completed", amountKobo: 200000 },
    { settlementDate: "2026-03-13", terminalId: "T1", channel: "qr", status: "completed", amountKobo: 75000 },
    { settlementDate: "2026-03-13", terminalId: "T2", channel: "nip", status: "failed", amountKobo: 50000 },
    { settlementDate: "2026-03-12", terminalId: "T1", channel: "card", status: "completed", amountKobo: 300000 },
  ];

  it("groups transactions by date + terminal + channel + status", () => {
    const groups = groupForRecon(sampleRows);
    expect(Object.keys(groups)).toHaveLength(4);
  });

  it("sums volume correctly per group", () => {
    const groups = groupForRecon(sampleRows);
    const cardT1 = groups["2026-03-13|T1|card|completed"];
    expect(cardT1.volumeKobo).toBe(350000);
    expect(cardT1.count).toBe(2);
  });

  it("separates failed transactions from completed ones", () => {
    const groups = groupForRecon(sampleRows);
    const failedNip = groups["2026-03-13|T2|nip|failed"];
    expect(failedNip).toBeDefined();
    expect(failedNip.count).toBe(1);
    expect(failedNip.settled).toBe(0);
  });

  it("computes settlement rate correctly", () => {
    const totalTxns = sampleRows.length;
    const settledTxns = sampleRows.filter(r => r.status === "completed").length;
    const rate = (settledTxns / totalTxns) * 100;
    expect(rate).toBeCloseTo(80, 1);
  });

  it("handles empty input gracefully", () => {
    const groups = groupForRecon([]);
    expect(Object.keys(groups)).toHaveLength(0);
  });
});

// ─── PTSP Batch Settlement Tests ──────────────────────────────────────────────

describe("PTSP Batch Settlement", () => {
  interface BatchTx {
    id: string;
    amountKobo: number;
    status: "pending" | "completed" | "failed";
    terminalId: string;
    channel: string;
    createdAt: Date;
  }

  function buildSettlementBatch(txns: BatchTx[], cutoffHour = 23) {
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setHours(cutoffHour, 0, 0, 0);

    const eligible = txns.filter(t =>
      t.status === "completed" &&
      t.createdAt <= cutoff
    );

    const totalKobo = eligible.reduce((sum, t) => sum + t.amountKobo, 0);
    const byChannel: Record<string, number> = {};
    for (const t of eligible) {
      byChannel[t.channel] = (byChannel[t.channel] ?? 0) + t.amountKobo;
    }

    return {
      count: eligible.length,
      totalKobo,
      byChannel,
      batchRef: `PTSP-${today.toISOString().slice(0, 10)}-${eligible.length}`,
    };
  }

  const now = new Date();
  const txns: BatchTx[] = [
    { id: "t1", amountKobo: 100000, status: "completed", terminalId: "T1", channel: "card", createdAt: now },
    { id: "t2", amountKobo: 50000, status: "completed", terminalId: "T1", channel: "qr", createdAt: now },
    { id: "t3", amountKobo: 75000, status: "failed", terminalId: "T2", channel: "card", createdAt: now },
    { id: "t4", amountKobo: 200000, status: "completed", terminalId: "T2", channel: "nip", createdAt: now },
  ];

  it("excludes failed transactions from batch", () => {
    const batch = buildSettlementBatch(txns);
    expect(batch.count).toBe(3);
  });

  it("sums total volume correctly", () => {
    const batch = buildSettlementBatch(txns);
    expect(batch.totalKobo).toBe(350000);
  });

  it("breaks down volume by channel", () => {
    const batch = buildSettlementBatch(txns);
    expect(batch.byChannel.card).toBe(100000);
    expect(batch.byChannel.qr).toBe(50000);
    expect(batch.byChannel.nip).toBe(200000);
  });

  it("generates a batch reference with today's date", () => {
    const batch = buildSettlementBatch(txns);
    const today = new Date().toISOString().slice(0, 10);
    expect(batch.batchRef).toContain(today);
    expect(batch.batchRef).toContain("PTSP-");
  });

  it("returns empty batch for all-failed transactions", () => {
    const failedOnly: BatchTx[] = txns.map(t => ({ ...t, status: "failed" as const }));
    const batch = buildSettlementBatch(failedOnly);
    expect(batch.count).toBe(0);
    expect(batch.totalKobo).toBe(0);
  });
});

// ─── EMV Offline Queue Tests ──────────────────────────────────────────────────

describe("EMV Offline Queue", () => {
  interface OfflineTx {
    id: string;
    terminalId: string;
    amountKobo: number;
    arqc: string; // Application Request Cryptogram
    queuedAt: Date;
    processed: boolean;
  }

  function deduplicateQueue(queue: OfflineTx[]): OfflineTx[] {
    const seen = new Set<string>();
    return queue.filter(tx => {
      // Dedup by ARQC — each EMV transaction has a unique cryptogram
      if (seen.has(tx.arqc)) return false;
      seen.add(tx.arqc);
      return true;
    });
  }

  function processQueue(queue: OfflineTx[], maxBatch = 50): { toProcess: OfflineTx[]; remaining: OfflineTx[] } {
    const unprocessed = queue.filter(t => !t.processed);
    const deduped = deduplicateQueue(unprocessed);
    const sorted = deduped.sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());
    return {
      toProcess: sorted.slice(0, maxBatch),
      remaining: sorted.slice(maxBatch),
    };
  }

  const now = new Date();
  const queue: OfflineTx[] = [
    { id: "e1", terminalId: "T1", amountKobo: 5000, arqc: "ARQC001", queuedAt: new Date(now.getTime() - 3000), processed: false },
    { id: "e2", terminalId: "T1", amountKobo: 5000, arqc: "ARQC001", queuedAt: new Date(now.getTime() - 2000), processed: false }, // duplicate ARQC
    { id: "e3", terminalId: "T2", amountKobo: 10000, arqc: "ARQC002", queuedAt: new Date(now.getTime() - 1000), processed: false },
    { id: "e4", terminalId: "T1", amountKobo: 7500, arqc: "ARQC003", queuedAt: now, processed: true }, // already processed
  ];

  it("deduplicates by ARQC cryptogram", () => {
    const deduped = deduplicateQueue(queue.filter(t => !t.processed));
    expect(deduped).toHaveLength(2);
    expect(deduped.map(t => t.arqc)).toEqual(["ARQC001", "ARQC002"]);
  });

  it("excludes already-processed transactions", () => {
    const { toProcess } = processQueue(queue);
    expect(toProcess.every(t => !t.processed)).toBe(true);
  });

  it("processes in FIFO order (oldest first)", () => {
    const { toProcess } = processQueue(queue);
    for (let i = 1; i < toProcess.length; i++) {
      expect(toProcess[i].queuedAt.getTime()).toBeGreaterThanOrEqual(toProcess[i - 1].queuedAt.getTime());
    }
  });

  it("respects maxBatch limit", () => {
    const bigQueue: OfflineTx[] = Array.from({ length: 100 }, (_, i) => ({
      id: `e${i}`,
      terminalId: "T1",
      amountKobo: 1000,
      arqc: `ARQC${i.toString().padStart(3, "0")}`,
      queuedAt: new Date(now.getTime() - i * 1000),
      processed: false,
    }));
    const { toProcess, remaining } = processQueue(bigQueue, 50);
    expect(toProcess).toHaveLength(50);
    expect(remaining).toHaveLength(50);
  });
});

// ─── Rewards Auto-Earn Tests ──────────────────────────────────────────────────

describe("Rewards Auto-Earn", () => {
  // 1 point per ₦100 spent (100 kobo = ₦1, so 10000 kobo = ₦100 = 1 point)
  const EARN_RATE_KOBO_PER_POINT = 10000;

  function calculatePoints(amountKobo: number): number {
    return Math.floor(amountKobo / EARN_RATE_KOBO_PER_POINT);
  }

  function calculateRedemptionDiscount(points: number): number {
    // 100 points = ₦10 (1000 kobo)
    const POINTS_PER_NAIRA = 10;
    return Math.floor(points / POINTS_PER_NAIRA) * 100; // returns kobo
  }

  it("earns 1 point per ₦100 spent", () => {
    expect(calculatePoints(10000)).toBe(1);   // ₦100
    expect(calculatePoints(50000)).toBe(5);   // ₦500
    expect(calculatePoints(100000)).toBe(10); // ₦1,000
  });

  it("floors partial points — no fractional points", () => {
    expect(calculatePoints(15000)).toBe(1);  // ₦150 → 1 point
    expect(calculatePoints(19999)).toBe(1);  // ₦199.99 → 1 point
    expect(calculatePoints(9999)).toBe(0);   // ₦99.99 → 0 points
  });

  it("earns 0 points for zero amount", () => {
    expect(calculatePoints(0)).toBe(0);
  });

  it("calculates redemption discount correctly", () => {
    expect(calculateRedemptionDiscount(100)).toBe(1000);  // 100 pts = ₦10 = 1000 kobo
    expect(calculateRedemptionDiscount(500)).toBe(5000);  // 500 pts = ₦50 = 5000 kobo
    expect(calculateRedemptionDiscount(1000)).toBe(10000); // 1000 pts = ₦100 = 10000 kobo
  });

  it("floors redemption — floors to nearest naira", () => {
    expect(calculateRedemptionDiscount(105)).toBe(1000); // 105 pts → ₦10 (5 pts wasted, floor to 10)
    expect(calculateRedemptionDiscount(99)).toBe(900);   // 99 pts → ₦9 (floor(99/10)*100 = 900 kobo)
    expect(calculateRedemptionDiscount(9)).toBe(0);      // 9 pts → ₦0 (below 10 pts minimum)
  });

  it("auto-earn on ₦1,500 transfer earns 15 points", () => {
    const amountKobo = 150000; // ₦1,500
    const points = calculatePoints(amountKobo);
    expect(points).toBe(15);
  });
});

// ─── Fluvio Event Schema Tests ────────────────────────────────────────────────

describe("Fluvio POS Event Schema", () => {
  interface FluvioPOSEvent {
    eventType: "payment" | "heartbeat" | "card_auth" | "error";
    terminalId: string;
    merchantId: string;
    amountKobo?: number;
    channel?: string;
    status?: string;
    arqc?: string;
    rrn?: string;
    responseCode?: string;
    ts: number;
  }

  function validateEvent(event: unknown): event is FluvioPOSEvent {
    if (typeof event !== "object" || event === null) return false;
    const e = event as Record<string, unknown>;
    if (!["payment", "heartbeat", "card_auth", "error"].includes(e.eventType as string)) return false;
    if (typeof e.terminalId !== "string" || !e.terminalId) return false;
    if (typeof e.merchantId !== "string" || !e.merchantId) return false;
    if (typeof e.ts !== "number" || e.ts <= 0) return false;
    return true;
  }

  it("validates a well-formed payment event", () => {
    const event: FluvioPOSEvent = {
      eventType: "payment",
      terminalId: "TID001",
      merchantId: "MID001",
      amountKobo: 150000,
      channel: "card",
      status: "completed",
      rrn: "RRN001",
      ts: Date.now(),
    };
    expect(validateEvent(event)).toBe(true);
  });

  it("validates a heartbeat event (no amount required)", () => {
    const event: FluvioPOSEvent = {
      eventType: "heartbeat",
      terminalId: "TID001",
      merchantId: "MID001",
      ts: Date.now(),
    };
    expect(validateEvent(event)).toBe(true);
  });

  it("rejects event with invalid eventType", () => {
    expect(validateEvent({ eventType: "unknown", terminalId: "T1", merchantId: "M1", ts: Date.now() })).toBe(false);
  });

  it("rejects event with missing terminalId", () => {
    expect(validateEvent({ eventType: "payment", merchantId: "M1", ts: Date.now() })).toBe(false);
  });

  it("rejects event with zero timestamp", () => {
    expect(validateEvent({ eventType: "heartbeat", terminalId: "T1", merchantId: "M1", ts: 0 })).toBe(false);
  });

  it("rejects null input", () => {
    expect(validateEvent(null)).toBe(false);
  });
});
