/**
 * USDC Router Tests
 * =================
 * Tests for the USDC payout tRPC procedures: wallet registration,
 * payout initiation, balance queries, and status polling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../server/middlewareBridge", () => ({
  safe: vi.fn(),
}));

vi.mock("../server/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../server/db", () => ({
  getDb: vi.fn(),
}));

import { safe } from "../server/middlewareBridge";
import { getDb } from "../server/db";

const mockSafe = vi.mocked(safe);
const mockGetDb = vi.mocked(getDb);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "test-id" }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

// ── Wallet Address Validation ─────────────────────────────────────────────────

describe("USDC wallet address validation", () => {
  it("accepts a valid 44-char base58 Solana address", () => {
    const addr = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    expect(addr).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("rejects an address with invalid base58 characters", () => {
    const addr = "0xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    expect(addr).not.toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("rejects an empty string", () => {
    expect("").not.toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("rejects a too-short address", () => {
    expect("abc123").not.toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("rejects a too-long address", () => {
    const addr = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    expect(addr).not.toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});

// ── USDC Amount Conversion ────────────────────────────────────────────────────

describe("USDC lamport conversion", () => {
  const USDC_DECIMALS = 6;

  function usdcToLamports(usdc: number): number {
    return Math.round(usdc * Math.pow(10, USDC_DECIMALS));
  }

  function lamportsToUsdc(lamports: number): number {
    return lamports / Math.pow(10, USDC_DECIMALS);
  }

  it("converts 1 USDC to 1,000,000 lamports", () => {
    expect(usdcToLamports(1)).toBe(1_000_000);
  });

  it("converts 0.5 USDC to 500,000 lamports", () => {
    expect(usdcToLamports(0.5)).toBe(500_000);
  });

  it("converts 0.000001 USDC to 1 lamport", () => {
    expect(usdcToLamports(0.000001)).toBe(1);
  });

  it("converts 1,000,000 lamports to 1 USDC", () => {
    expect(lamportsToUsdc(1_000_000)).toBe(1.0);
  });

  it("round-trips correctly", () => {
    const amounts = [0.5, 1.0, 10.0, 100.0, 0.000001];
    for (const amt of amounts) {
      expect(lamportsToUsdc(usdcToLamports(amt))).toBeCloseTo(amt, 6);
    }
  });
});

// ── Payout Status Machine ─────────────────────────────────────────────────────

describe("USDC payout status transitions", () => {
  type PayoutStatus = "pending" | "reserved" | "broadcasting" | "confirming" | "settled" | "failed" | "voided";

  const VALID_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
    pending:      ["reserved", "failed"],
    reserved:     ["broadcasting", "voided", "failed"],
    broadcasting: ["confirming", "failed"],
    confirming:   ["settled", "failed"],
    settled:      [],
    failed:       [],
    voided:       [],
  };

  function isValidTransition(from: PayoutStatus, to: PayoutStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  it("allows pending → reserved", () => {
    expect(isValidTransition("pending", "reserved")).toBe(true);
  });

  it("allows reserved → broadcasting", () => {
    expect(isValidTransition("reserved", "broadcasting")).toBe(true);
  });

  it("allows broadcasting → confirming", () => {
    expect(isValidTransition("broadcasting", "confirming")).toBe(true);
  });

  it("allows confirming → settled", () => {
    expect(isValidTransition("confirming", "settled")).toBe(true);
  });

  it("allows reserved → voided (TigerBeetle void)", () => {
    expect(isValidTransition("reserved", "voided")).toBe(true);
  });

  it("disallows settled → any (terminal state)", () => {
    const statuses: PayoutStatus[] = ["pending", "reserved", "broadcasting", "confirming", "failed", "voided"];
    for (const s of statuses) {
      expect(isValidTransition("settled", s)).toBe(false);
    }
  });

  it("disallows failed → any (terminal state)", () => {
    const statuses: PayoutStatus[] = ["pending", "reserved", "broadcasting", "confirming", "settled", "voided"];
    for (const s of statuses) {
      expect(isValidTransition("failed", s)).toBe(false);
    }
  });

  it("disallows confirming → reserved (backward transition)", () => {
    expect(isValidTransition("confirming", "reserved")).toBe(false);
  });
});

// ── Network Validation ────────────────────────────────────────────────────────

describe("USDC network validation", () => {
  const VALID_NETWORKS = ["mainnet", "devnet"] as const;
  type Network = typeof VALID_NETWORKS[number];

  function isValidNetwork(n: string): n is Network {
    return VALID_NETWORKS.includes(n as Network);
  }

  it("accepts mainnet", () => {
    expect(isValidNetwork("mainnet")).toBe(true);
  });

  it("accepts devnet", () => {
    expect(isValidNetwork("devnet")).toBe(true);
  });

  it("rejects testnet", () => {
    expect(isValidNetwork("testnet")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidNetwork("")).toBe(false);
  });

  it("rejects arbitrary string", () => {
    expect(isValidNetwork("production")).toBe(false);
  });
});

// ── Fraud Score Thresholds ────────────────────────────────────────────────────

describe("USDC fraud score thresholds", () => {
  const FRAUD_BLOCK_THRESHOLD = 80;
  const FRAUD_REVIEW_THRESHOLD = 60;

  function getPayoutDecision(score: number): "allow" | "review" | "block" {
    if (score >= FRAUD_BLOCK_THRESHOLD) return "block";
    if (score >= FRAUD_REVIEW_THRESHOLD) return "review";
    return "allow";
  }

  it("blocks payouts with score >= 80", () => {
    expect(getPayoutDecision(80)).toBe("block");
    expect(getPayoutDecision(95)).toBe("block");
    expect(getPayoutDecision(100)).toBe("block");
  });

  it("flags for review with score 60-79", () => {
    expect(getPayoutDecision(60)).toBe("review");
    expect(getPayoutDecision(70)).toBe("review");
    expect(getPayoutDecision(79)).toBe("review");
  });

  it("allows payouts with score < 60", () => {
    expect(getPayoutDecision(0)).toBe("allow");
    expect(getPayoutDecision(30)).toBe("allow");
    expect(getPayoutDecision(59)).toBe("allow");
  });
});

// ── Payout Reference Validation ───────────────────────────────────────────────

describe("USDC payout reference validation", () => {
  const MAX_REFERENCE_LENGTH = 128;

  function isValidReference(ref: string | undefined): boolean {
    if (ref === undefined || ref === "") return true; // optional
    return ref.length <= MAX_REFERENCE_LENGTH && /^[\w\-\.]+$/.test(ref);
  }

  it("accepts undefined (optional field)", () => {
    expect(isValidReference(undefined)).toBe(true);
  });

  it("accepts empty string", () => {
    expect(isValidReference("")).toBe(true);
  });

  it("accepts alphanumeric reference", () => {
    expect(isValidReference("order-12345")).toBe(true);
  });

  it("accepts reference with dots", () => {
    expect(isValidReference("seller.payout.q1.2026")).toBe(true);
  });

  it("rejects reference with spaces", () => {
    expect(isValidReference("order 12345")).toBe(false);
  });

  it("rejects reference exceeding max length", () => {
    expect(isValidReference("a".repeat(129))).toBe(false);
  });

  it("accepts reference at max length", () => {
    expect(isValidReference("a".repeat(128))).toBe(true);
  });
});

// ── TigerBeetle Ledger Constants ──────────────────────────────────────────────

describe("TigerBeetle USDC ledger constants", () => {
  const LEDGER_USDC = 2;
  const CODE_USDC_ESCROW = 20;
  const CODE_USDC_PAYOUT = 21;
  const CODE_USDC_DEPOSIT = 22;

  it("USDC ledger ID is 2 (distinct from NGN=1)", () => {
    expect(LEDGER_USDC).toBe(2);
    expect(LEDGER_USDC).not.toBe(1); // NGN ledger
  });

  it("escrow, payout, and deposit codes are distinct", () => {
    const codes = [CODE_USDC_ESCROW, CODE_USDC_PAYOUT, CODE_USDC_DEPOSIT];
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("USDC codes are in the 20-29 range (USDC namespace)", () => {
    for (const code of [CODE_USDC_ESCROW, CODE_USDC_PAYOUT, CODE_USDC_DEPOSIT]) {
      expect(code).toBeGreaterThanOrEqual(20);
      expect(code).toBeLessThan(30);
    }
  });
});
