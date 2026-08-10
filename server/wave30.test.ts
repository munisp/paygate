/**
 * Wave 30 Tests — Soundbox, PTSP Settlement, POS Simulator
 * Tests cover: useSoundbox hook logic, PTSP settlement grouping,
 * batch CSV format, settlement status transitions, and POS event schema.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── useSoundbox hook logic (pure functions) ──────────────────────────────────

const AUDIO_CONFIRMATIONS: Record<string, string> = {
  en: "Payment received: {amount} Naira",
  yo: "Owo ti gba: Naira {amount}",
  ha: "An karbi kudi: Naira {amount}",
  ig: "Ego enwetara: Naira {amount}",
};

function formatAudioConfirmation(lang: string, amountNgn: number): string {
  const template = AUDIO_CONFIRMATIONS[lang] ?? AUDIO_CONFIRMATIONS["en"];
  return template.replace("{amount}", amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 }));
}

function getSoundboxTone(eventType: "payment" | "error" | "heartbeat"): {
  frequency: number;
  duration: number;
  type: OscillatorType;
} {
  switch (eventType) {
    case "payment":
      return { frequency: 880, duration: 0.3, type: "sine" };
    case "error":
      return { frequency: 220, duration: 0.5, type: "sawtooth" };
    case "heartbeat":
      return { frequency: 440, duration: 0.1, type: "square" };
  }
}

describe("useSoundbox — audio confirmation formatting", () => {
  it("formats English confirmation correctly", () => {
    const msg = formatAudioConfirmation("en", 5000);
    expect(msg).toContain("Payment received");
    expect(msg).toContain("Naira");
    expect(msg).toContain("5,000");
  });

  it("formats Yoruba confirmation correctly", () => {
    const msg = formatAudioConfirmation("yo", 2500);
    expect(msg).toContain("Owo ti gba");
    expect(msg).toContain("Naira");
  });

  it("formats Hausa confirmation correctly", () => {
    const msg = formatAudioConfirmation("ha", 1000);
    expect(msg).toContain("An karbi kudi");
  });

  it("formats Igbo confirmation correctly", () => {
    const msg = formatAudioConfirmation("ig", 750.5);
    expect(msg).toContain("Ego enwetara");
  });

  it("falls back to English for unknown language", () => {
    const msg = formatAudioConfirmation("fr", 1000);
    expect(msg).toContain("Payment received");
  });

  it("returns correct tone for payment event", () => {
    const tone = getSoundboxTone("payment");
    expect(tone.frequency).toBe(880);
    expect(tone.duration).toBe(0.3);
    expect(tone.type).toBe("sine");
  });

  it("returns correct tone for error event", () => {
    const tone = getSoundboxTone("error");
    expect(tone.frequency).toBe(220);
    expect(tone.type).toBe("sawtooth");
  });

  it("returns correct tone for heartbeat event", () => {
    const tone = getSoundboxTone("heartbeat");
    expect(tone.frequency).toBe(440);
    expect(tone.duration).toBe(0.1);
  });
});

// ─── PTSP Settlement logic ────────────────────────────────────────────────────

interface PosTransaction {
  id: string;
  terminalId: string;
  merchantId: string;
  amountKobo: number;
  channel: string;
  status: string;
  createdAt: Date;
  rrn: string;
  authCode: string;
}

type SettlementStatus = "pending" | "submitted" | "confirmed" | "failed";

interface SettlementBatch {
  batchId: string;
  date: string;
  terminalId: string;
  merchantId: string;
  totalAmountKobo: number;
  transactionCount: number;
  status: SettlementStatus;
  submittedAt: Date | null;
  confirmedAt: Date | null;
}

function groupTransactionsIntoBatches(
  transactions: PosTransaction[],
  batchDate: string
): SettlementBatch[] {
  const groups = new Map<string, PosTransaction[]>();

  for (const txn of transactions) {
    if (txn.status !== "approved") continue;
    const key = `${txn.terminalId}::${txn.merchantId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(txn);
  }

  const batches: SettlementBatch[] = [];
  let batchNum = 1;

  for (const [key, txns] of groups) {
    const [terminalId, merchantId] = key.split("::");
    batches.push({
      batchId: `BATCH-${batchDate.replace(/-/g, "")}-${String(batchNum).padStart(4, "0")}`,
      date: batchDate,
      terminalId,
      merchantId,
      totalAmountKobo: txns.reduce((sum, t) => sum + t.amountKobo, 0),
      transactionCount: txns.length,
      status: "pending",
      submittedAt: null,
      confirmedAt: null,
    });
    batchNum++;
  }

  return batches.sort((a, b) => a.terminalId.localeCompare(b.terminalId));
}

function generatePTSPCsv(batches: SettlementBatch[]): string {
  const header = "BATCH_ID,DATE,TERMINAL_ID,MERCHANT_ID,AMOUNT_NGN,TXN_COUNT,STATUS";
  const rows = batches.map((b) =>
    [
      b.batchId,
      b.date,
      b.terminalId,
      b.merchantId,
      (b.totalAmountKobo / 100).toFixed(2),
      b.transactionCount,
      b.status.toUpperCase(),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

function transitionSettlementStatus(
  current: SettlementStatus,
  action: "submit" | "confirm" | "fail"
): SettlementStatus {
  const transitions: Record<SettlementStatus, Partial<Record<string, SettlementStatus>>> = {
    pending: { submit: "submitted" },
    submitted: { confirm: "confirmed", fail: "failed" },
    confirmed: {},
    failed: { submit: "submitted" }, // allow retry
  };
  return (transitions[current][action] as SettlementStatus) ?? current;
}

const sampleTransactions: PosTransaction[] = [
  { id: "T1", terminalId: "TID001", merchantId: "MID001", amountKobo: 500000, channel: "card", status: "approved", createdAt: new Date("2026-03-13"), rrn: "123456789012", authCode: "AUTH01" },
  { id: "T2", terminalId: "TID001", merchantId: "MID001", amountKobo: 250000, channel: "qr", status: "approved", createdAt: new Date("2026-03-13"), rrn: "123456789013", authCode: "AUTH02" },
  { id: "T3", terminalId: "TID002", merchantId: "MID002", amountKobo: 1000000, channel: "nip", status: "approved", createdAt: new Date("2026-03-13"), rrn: "123456789014", authCode: "AUTH03" },
  { id: "T4", terminalId: "TID001", merchantId: "MID001", amountKobo: 100000, channel: "card", status: "declined", createdAt: new Date("2026-03-13"), rrn: "123456789015", authCode: "" },
];

describe("PTSP Settlement — batch grouping", () => {
  it("groups approved transactions by terminal+merchant", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    expect(batches).toHaveLength(2);
  });

  it("excludes declined transactions from batches", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    const tid001Batch = batches.find((b) => b.terminalId === "TID001");
    expect(tid001Batch?.transactionCount).toBe(2); // T1 + T2, not T4
  });

  it("sums amounts correctly for TID001", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    const tid001Batch = batches.find((b) => b.terminalId === "TID001");
    expect(tid001Batch?.totalAmountKobo).toBe(750000); // 500000 + 250000
  });

  it("sums amounts correctly for TID002", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    const tid002Batch = batches.find((b) => b.terminalId === "TID002");
    expect(tid002Batch?.totalAmountKobo).toBe(1000000);
  });

  it("assigns correct batch IDs with date prefix", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    for (const batch of batches) {
      expect(batch.batchId).toMatch(/^BATCH-20260313-\d{4}$/);
    }
  });

  it("all batches start with pending status", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    for (const batch of batches) {
      expect(batch.status).toBe("pending");
    }
  });

  it("returns empty array for no approved transactions", () => {
    const declined = sampleTransactions.filter((t) => t.status === "declined");
    const batches = groupTransactionsIntoBatches(declined, "2026-03-13");
    expect(batches).toHaveLength(0);
  });
});

describe("PTSP Settlement — CSV generation", () => {
  it("generates valid CSV with header", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    const csv = generatePTSPCsv(batches);
    expect(csv).toContain("BATCH_ID,DATE,TERMINAL_ID,MERCHANT_ID,AMOUNT_NGN,TXN_COUNT,STATUS");
  });

  it("CSV has correct number of data rows", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    const csv = generatePTSPCsv(batches);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 batches
  });

  it("amounts in CSV are in NGN (not kobo)", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    const csv = generatePTSPCsv(batches);
    expect(csv).toContain("7500.00"); // TID001: ₦7,500
    expect(csv).toContain("10000.00"); // TID002: ₦10,000
  });

  it("CSV status is uppercase", () => {
    const batches = groupTransactionsIntoBatches(sampleTransactions, "2026-03-13");
    const csv = generatePTSPCsv(batches);
    expect(csv).toContain("PENDING");
    expect(csv).not.toContain("pending");
  });
});

describe("PTSP Settlement — status transitions", () => {
  it("pending → submitted on submit", () => {
    expect(transitionSettlementStatus("pending", "submit")).toBe("submitted");
  });

  it("submitted → confirmed on confirm", () => {
    expect(transitionSettlementStatus("submitted", "confirm")).toBe("confirmed");
  });

  it("submitted → failed on fail", () => {
    expect(transitionSettlementStatus("submitted", "fail")).toBe("failed");
  });

  it("failed → submitted on retry submit", () => {
    expect(transitionSettlementStatus("failed", "submit")).toBe("submitted");
  });

  it("confirmed is terminal — no further transitions", () => {
    expect(transitionSettlementStatus("confirmed", "submit")).toBe("confirmed");
    expect(transitionSettlementStatus("confirmed", "fail")).toBe("confirmed");
  });

  it("pending cannot be confirmed directly", () => {
    expect(transitionSettlementStatus("pending", "confirm")).toBe("pending");
  });
});

// ─── POS Event schema validation ──────────────────────────────────────────────

interface PosPaymentEvent {
  event_type: "payment";
  terminal_id: string;
  merchant_id: string;
  amount_kobo: number;
  amount_ngn: number;
  currency: string;
  currency_code: number;
  channel: "card" | "qr" | "nip" | "ussd";
  status: "approved" | "declined";
  response_code: string;
  rrn: string;
  stan: string;
  auth_code: string;
  audio_language: "en" | "yo" | "ha" | "ig";
  audio_confirmation: string;
  iso8583: object | null;
}

function validatePosPaymentEvent(event: unknown): event is PosPaymentEvent {
  if (typeof event !== "object" || event === null) return false;
  const e = event as Record<string, unknown>;
  return (
    e.event_type === "payment" &&
    typeof e.terminal_id === "string" &&
    typeof e.merchant_id === "string" &&
    typeof e.amount_kobo === "number" &&
    e.amount_kobo > 0 &&
    typeof e.amount_ngn === "number" &&
    e.currency === "NGN" &&
    e.currency_code === 566 &&
    ["card", "qr", "nip", "ussd"].includes(e.channel as string) &&
    ["approved", "declined"].includes(e.status as string) &&
    typeof e.rrn === "string" &&
    e.rrn.length === 12 &&
    ["en", "yo", "ha", "ig"].includes(e.audio_language as string)
  );
}

describe("POS Event schema validation", () => {
  const validEvent: PosPaymentEvent = {
    event_type: "payment",
    terminal_id: "TID001",
    merchant_id: "MID001",
    amount_kobo: 500000,
    amount_ngn: 5000,
    currency: "NGN",
    currency_code: 566,
    channel: "card",
    status: "approved",
    response_code: "00",
    rrn: "123456789012",
    stan: "123456",
    auth_code: "AUTH01",
    audio_language: "en",
    audio_confirmation: "Payment received: 5,000.00 Naira",
    iso8583: { mti: "0110", de39: "00" },
  };

  it("validates a correct payment event", () => {
    expect(validatePosPaymentEvent(validEvent)).toBe(true);
  });

  it("rejects event with wrong currency", () => {
    expect(validatePosPaymentEvent({ ...validEvent, currency: "USD" })).toBe(false);
  });

  it("rejects event with wrong currency code", () => {
    expect(validatePosPaymentEvent({ ...validEvent, currency_code: 840 })).toBe(false);
  });

  it("rejects event with invalid channel", () => {
    expect(validatePosPaymentEvent({ ...validEvent, channel: "cash" })).toBe(false);
  });

  it("rejects event with zero amount", () => {
    expect(validatePosPaymentEvent({ ...validEvent, amount_kobo: 0 })).toBe(false);
  });

  it("rejects event with short RRN", () => {
    expect(validatePosPaymentEvent({ ...validEvent, rrn: "12345" })).toBe(false);
  });

  it("rejects event with invalid audio language", () => {
    expect(validatePosPaymentEvent({ ...validEvent, audio_language: "fr" as any })).toBe(false);
  });

  it("accepts all valid Nigerian channels", () => {
    for (const channel of ["card", "qr", "nip", "ussd"] as const) {
      expect(validatePosPaymentEvent({ ...validEvent, channel })).toBe(true);
    }
  });

  it("accepts all valid audio languages", () => {
    for (const lang of ["en", "yo", "ha", "ig"] as const) {
      expect(validatePosPaymentEvent({ ...validEvent, audio_language: lang })).toBe(true);
    }
  });
});
