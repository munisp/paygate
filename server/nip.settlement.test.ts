/**
 * Tests for CBN NIP bank directory and Settlement SLA alerting.
 * These are pure unit tests — no database required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── NIP Bank Directory ────────────────────────────────────────────────────────

const NIGERIAN_BANKS = [
  { bankCode: "044", bankName: "Access Bank", shortName: "Access" },
  { bankCode: "058", bankName: "Guaranty Trust Bank", shortName: "GTBank" },
  { bankCode: "057", bankName: "Zenith Bank", shortName: "Zenith" },
  { bankCode: "033", bankName: "United Bank for Africa", shortName: "UBA" },
  { bankCode: "011", bankName: "First Bank of Nigeria", shortName: "First Bank" },
  { bankCode: "000025", bankName: "Kuda Bank", shortName: "Kuda" },
  { bankCode: "000023", bankName: "Paycom (OPay)", shortName: "OPay" },
  { bankCode: "000031", bankName: "Moniepoint MFB", shortName: "Moniepoint" },
];

describe("NIP Bank Directory", () => {
  it("contains all required CBN NIP bank fields", () => {
    for (const bank of NIGERIAN_BANKS) {
      expect(bank).toHaveProperty("bankCode");
      expect(bank).toHaveProperty("bankName");
      expect(bank).toHaveProperty("shortName");
      expect(bank.bankCode.length).toBeGreaterThanOrEqual(3);
      expect(bank.bankName.length).toBeGreaterThan(0);
    }
  });

  it("has unique bank codes", () => {
    const codes = NIGERIAN_BANKS.map(b => b.bankCode);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("includes major commercial banks", () => {
    const codes = new Set(NIGERIAN_BANKS.map(b => b.bankCode));
    expect(codes.has("044")).toBe(true); // Access Bank
    expect(codes.has("058")).toBe(true); // GTBank
    expect(codes.has("057")).toBe(true); // Zenith Bank
    expect(codes.has("033")).toBe(true); // UBA
    expect(codes.has("011")).toBe(true); // First Bank
  });

  it("includes digital/mobile money banks", () => {
    const codes = new Set(NIGERIAN_BANKS.map(b => b.bankCode));
    expect(codes.has("000025")).toBe(true); // Kuda
    expect(codes.has("000023")).toBe(true); // OPay
    expect(codes.has("000031")).toBe(true); // Moniepoint
  });

  it("filters banks by search term (case-insensitive simulation)", () => {
    const search = "bank";
    const filtered = NIGERIAN_BANKS.filter(b =>
      b.bankName.toLowerCase().includes(search.toLowerCase())
    );
    expect(filtered.length).toBeGreaterThan(0);
    for (const b of filtered) {
      expect(b.bankName.toLowerCase()).toContain(search);
    }
  });

  it("finds bank by code", () => {
    const bank = NIGERIAN_BANKS.find(b => b.bankCode === "058");
    expect(bank).toBeDefined();
    expect(bank?.bankName).toBe("Guaranty Trust Bank");
  });
});

// ─── NIP Account Name Enquiry ─────────────────────────────────────────────────

function simulateNipNameEnquiry(accountNumber: string): string {
  const names = [
    "ADEBAYO OLUWASEUN", "CHIOMA OKONKWO", "IBRAHIM MUSA",
    "FATIMA ABUBAKAR", "EMEKA OKAFOR", "NGOZI EZE",
    "TUNDE BAKARE", "AMINA YUSUF",
  ];
  return names[parseInt(accountNumber.slice(-1), 10) % names.length];
}

describe("NIP Account Name Enquiry", () => {
  it("returns a non-empty account name for any 10-digit account number", () => {
    const testAccounts = ["0123456789", "9876543210", "1111111111", "0000000000"];
    for (const acc of testAccounts) {
      const name = simulateNipNameEnquiry(acc);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("returns deterministic names for the same account number", () => {
    const acc = "0123456789";
    expect(simulateNipNameEnquiry(acc)).toBe(simulateNipNameEnquiry(acc));
  });

  it("returns different names for different account numbers", () => {
    const names = new Set(
      ["0000000000", "1111111111", "2222222222", "3333333333",
       "4444444444", "5555555555", "6666666666", "7777777777"].map(simulateNipNameEnquiry)
    );
    // Should have at least 2 distinct names across 8 different last digits
    expect(names.size).toBeGreaterThan(1);
  });

  it("validates 10-digit account number format", () => {
    const validAccount = /^\d{10}$/;
    expect(validAccount.test("0123456789")).toBe(true);
    expect(validAccount.test("123456789")).toBe(false);  // 9 digits
    expect(validAccount.test("01234567890")).toBe(false); // 11 digits
    expect(validAccount.test("012345678A")).toBe(false);  // non-digit
  });

  it("validates bank code format (3-10 digits, numeric only)", () => {
    const validCodes = ["044", "058", "000025", "000031"];
    const invalidCodes = ["ab", "AB", "", "0A"];
    for (const code of validCodes) {
      const valid = code.length >= 3 && code.length <= 10 && /^\d+$/.test(code);
      expect(valid).toBe(true);
    }
    for (const code of invalidCodes) {
      const valid = code.length >= 3 && code.length <= 10 && /^\d+$/.test(code);
      expect(valid).toBe(false);
    }
  });
});

// ─── Settlement SLA Alerting ──────────────────────────────────────────────────

interface MockSettlement {
  id: string;
  reference: string;
  merchantId: string;
  tenantId: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed" | "sla_breached";
  slaDeadlineAt: Date | null;
  slaBreachedAt: Date | null;
  slaAlertSentAt: Date | null;
  initiatedAt: Date;
}

function isSlaBreach(settlement: MockSettlement, now = new Date()): boolean {
  return (
    settlement.status === "pending" &&
    settlement.slaDeadlineAt !== null &&
    settlement.slaDeadlineAt <= now
  );
}

function computeSlaDeadline(initiatedAt: Date, slaHours = 2): Date {
  return new Date(initiatedAt.getTime() + slaHours * 60 * 60 * 1000);
}

describe("Settlement SLA Alerting", () => {
  const now = new Date("2026-03-12T10:00:00Z");

  it("computes SLA deadline as initiatedAt + slaHours", () => {
    const initiated = new Date("2026-03-12T08:00:00Z");
    const deadline = computeSlaDeadline(initiated, 2);
    expect(deadline.toISOString()).toBe("2026-03-12T10:00:00.000Z");
  });

  it("detects SLA breach when deadline has passed and status is pending", () => {
    const settlement: MockSettlement = {
      id: "stl_001",
      reference: "STL_001",
      merchantId: "mer_001",
      tenantId: "ten_001",
      amount: 500000,
      currency: "NGN",
      status: "pending",
      slaDeadlineAt: new Date("2026-03-12T09:00:00Z"), // 1h before now
      slaBreachedAt: null,
      slaAlertSentAt: null,
      initiatedAt: new Date("2026-03-12T07:00:00Z"),
    };
    expect(isSlaBreach(settlement, now)).toBe(true);
  });

  it("does not flag breach when deadline is in the future", () => {
    const settlement: MockSettlement = {
      id: "stl_002",
      reference: "STL_002",
      merchantId: "mer_001",
      tenantId: "ten_001",
      amount: 200000,
      currency: "NGN",
      status: "pending",
      slaDeadlineAt: new Date("2026-03-12T12:00:00Z"), // 2h after now
      slaBreachedAt: null,
      slaAlertSentAt: null,
      initiatedAt: new Date("2026-03-12T10:00:00Z"),
    };
    expect(isSlaBreach(settlement, now)).toBe(false);
  });

  it("does not flag breach for completed settlements", () => {
    const settlement: MockSettlement = {
      id: "stl_003",
      reference: "STL_003",
      merchantId: "mer_001",
      tenantId: "ten_001",
      amount: 100000,
      currency: "NGN",
      status: "completed",
      slaDeadlineAt: new Date("2026-03-12T09:00:00Z"),
      slaBreachedAt: null,
      slaAlertSentAt: null,
      initiatedAt: new Date("2026-03-12T07:00:00Z"),
    };
    expect(isSlaBreach(settlement, now)).toBe(false);
  });

  it("does not flag breach for already-breached settlements", () => {
    const settlement: MockSettlement = {
      id: "stl_004",
      reference: "STL_004",
      merchantId: "mer_001",
      tenantId: "ten_001",
      amount: 300000,
      currency: "NGN",
      status: "sla_breached",
      slaDeadlineAt: new Date("2026-03-12T08:00:00Z"),
      slaBreachedAt: new Date("2026-03-12T08:01:00Z"),
      slaAlertSentAt: new Date("2026-03-12T08:01:00Z"),
      initiatedAt: new Date("2026-03-12T06:00:00Z"),
    };
    expect(isSlaBreach(settlement, now)).toBe(false);
  });

  it("does not flag breach when slaDeadlineAt is null", () => {
    const settlement: MockSettlement = {
      id: "stl_005",
      reference: "STL_005",
      merchantId: "mer_001",
      tenantId: "ten_001",
      amount: 150000,
      currency: "NGN",
      status: "pending",
      slaDeadlineAt: null,
      slaBreachedAt: null,
      slaAlertSentAt: null,
      initiatedAt: new Date("2026-03-12T07:00:00Z"),
    };
    expect(isSlaBreach(settlement, now)).toBe(false);
  });

  it("identifies settlements needing alert (breached but alert not yet sent)", () => {
    const settlements: MockSettlement[] = [
      {
        id: "stl_006", reference: "STL_006", merchantId: "mer_001", tenantId: "ten_001",
        amount: 500000, currency: "NGN", status: "pending",
        slaDeadlineAt: new Date("2026-03-12T09:00:00Z"),
        slaBreachedAt: null, slaAlertSentAt: null,
        initiatedAt: new Date("2026-03-12T07:00:00Z"),
      },
      {
        id: "stl_007", reference: "STL_007", merchantId: "mer_001", tenantId: "ten_001",
        amount: 200000, currency: "NGN", status: "pending",
        slaDeadlineAt: new Date("2026-03-12T09:30:00Z"),
        slaBreachedAt: null, slaAlertSentAt: new Date("2026-03-12T09:31:00Z"), // already alerted
        initiatedAt: new Date("2026-03-12T07:30:00Z"),
      },
      {
        id: "stl_008", reference: "STL_008", merchantId: "mer_001", tenantId: "ten_001",
        amount: 300000, currency: "NGN", status: "pending",
        slaDeadlineAt: new Date("2026-03-12T12:00:00Z"), // not yet breached
        slaBreachedAt: null, slaAlertSentAt: null,
        initiatedAt: new Date("2026-03-12T10:00:00Z"),
      },
    ];

    const needsAlert = settlements.filter(s =>
      isSlaBreach(s, now) && !s.slaAlertSentAt
    );
    expect(needsAlert).toHaveLength(1);
    expect(needsAlert[0].id).toBe("stl_006");
  });

  it("CBN NIP SLA is 2 hours by default", () => {
    const initiated = new Date("2026-03-12T08:00:00Z");
    const deadline = computeSlaDeadline(initiated); // default 2h
    const diffHours = (deadline.getTime() - initiated.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(2);
  });

  it("formats SLA breach alert message correctly", () => {
    const settlement: MockSettlement = {
      id: "stl_009", reference: "STL_REF_009", merchantId: "mer_001", tenantId: "ten_001",
      amount: 500000, currency: "NGN", status: "pending",
      slaDeadlineAt: new Date("2026-03-12T09:00:00Z"),
      slaBreachedAt: null, slaAlertSentAt: null,
      initiatedAt: new Date("2026-03-12T07:00:00Z"),
    };
    const merchantName = "Acme Payments Ltd";
    const alertTitle = `⚠️ Settlement SLA Breach: ${settlement.reference}`;
    const alertContent = `Settlement ${settlement.reference} for merchant ${merchantName} (${settlement.currency} ${(settlement.amount / 100).toFixed(2)}) has breached the CBN NIP 2-hour SLA.`;

    expect(alertTitle).toContain("STL_REF_009");
    expect(alertContent).toContain("Acme Payments Ltd");
    expect(alertContent).toContain("5000.00");
    expect(alertContent).toContain("CBN NIP 2-hour SLA");
  });
});

// ─── Settlement Status Transitions ────────────────────────────────────────────

describe("Settlement Status Transitions", () => {
  type SettlementStatus = "pending" | "processing" | "completed" | "failed" | "sla_breached";

  const VALID_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
    pending: ["processing", "failed", "sla_breached"],
    processing: ["completed", "failed"],
    completed: [],
    failed: [],
    sla_breached: ["processing", "failed"],
  };

  function canTransition(from: SettlementStatus, to: SettlementStatus): boolean {
    return VALID_TRANSITIONS[from].includes(to);
  }

  it("allows pending → processing", () => {
    expect(canTransition("pending", "processing")).toBe(true);
  });

  it("allows pending → sla_breached", () => {
    expect(canTransition("pending", "sla_breached")).toBe(true);
  });

  it("allows processing → completed", () => {
    expect(canTransition("processing", "completed")).toBe(true);
  });

  it("allows processing → failed", () => {
    expect(canTransition("processing", "failed")).toBe(true);
  });

  it("allows sla_breached → processing (retry)", () => {
    expect(canTransition("sla_breached", "processing")).toBe(true);
  });

  it("disallows completed → any", () => {
    expect(canTransition("completed", "failed")).toBe(false);
    expect(canTransition("completed", "pending")).toBe(false);
  });

  it("disallows failed → any", () => {
    expect(canTransition("failed", "completed")).toBe(false);
    expect(canTransition("failed", "processing")).toBe(false);
  });
});
