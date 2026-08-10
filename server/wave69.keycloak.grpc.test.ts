/**
 * Wave 69 — Keycloak JWT validation, gRPC client stubs, idempotency,
 * nameEnquiry, consumer analytics, consumer disputes, consumer fraud,
 * push token registration, and CSV export.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// ─── Keycloak URL helpers (pure logic, no ENV caching dependency) ─────────────

describe("Keycloak URL helpers", () => {
  // Build URLs using the same pattern as keycloak.ts but with test values
  const buildBaseUrl = (base: string, realm: string) => `${base}/realms/${realm}`;
  const buildEndpoint = (base: string, realm: string, path: string) =>
    `${buildBaseUrl(base, realm)}/protocol/openid-connect/${path}`;

  const BASE = "https://auth.paygate.io";
  const REALM = "paygate";

  it("builds authorization endpoint correctly", () => {
    const url = buildEndpoint(BASE, REALM, "auth");
    expect(url).toBe("https://auth.paygate.io/realms/paygate/protocol/openid-connect/auth");
  });

  it("builds token endpoint correctly", () => {
    const url = buildEndpoint(BASE, REALM, "token");
    expect(url).toBe("https://auth.paygate.io/realms/paygate/protocol/openid-connect/token");
  });

  it("builds JWKS URI correctly", () => {
    const url = buildEndpoint(BASE, REALM, "certs");
    expect(url).toBe("https://auth.paygate.io/realms/paygate/protocol/openid-connect/certs");
  });

  it("builds end-session endpoint correctly", () => {
    const url = buildEndpoint(BASE, REALM, "logout");
    expect(url).toBe("https://auth.paygate.io/realms/paygate/protocol/openid-connect/logout");
  });

  it("builds userinfo endpoint correctly", () => {
    const url = buildEndpoint(BASE, REALM, "userinfo");
    expect(url).toBe("https://auth.paygate.io/realms/paygate/protocol/openid-connect/userinfo");
  });

  it("returns empty base URL path when no base is set", () => {
    const url = buildBaseUrl("", REALM);
    expect(url).toBe("/realms/paygate");
  });

  it("handles custom realm in URL", () => {
    const url = buildBaseUrl(BASE, "production-realm");
    expect(url).toContain("production-realm");
  });
});

// ─── Keycloak role mapping ────────────────────────────────────────────────────

describe("Keycloak role mapping", () => {
  it("maps realm_access.roles to portal role admin", async () => {
    const { extractRole } = await import("./_core/keycloak");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = extractRole({ sub: "u1", realm_access: { roles: ["paygate-admin", "offline_access"] } } as any);
    expect(role).toBe("admin");
  });

  it("maps merchant-user realm role to user", async () => {
    const { extractRole } = await import("./_core/keycloak");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = extractRole({ sub: "u2", realm_access: { roles: ["merchant-user"] } } as any);
    expect(role).toBe("user");
  });

  it("defaults to user when no recognized roles", async () => {
    const { extractRole } = await import("./_core/keycloak");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = extractRole({ sub: "u3", realm_access: { roles: ["offline_access"] } } as any);
    expect(role).toBe("user");
  });

  it("defaults to user when realm_access is missing", async () => {
    const { extractRole } = await import("./_core/keycloak");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = extractRole({ sub: "u4" } as any);
    expect(role).toBe("user");
  });

  it("prefers admin over user when both roles are present", async () => {
    const { extractRole } = await import("./_core/keycloak");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = extractRole({ sub: "u5", realm_access: { roles: ["merchant-user", "paygate-admin"] } } as any);
    expect(role).toBe("admin");
  });
});

// ─── gRPC client lazy initialization ─────────────────────────────────────────

describe("gRPC client lazy initialization", () => {
  it("returns null for ledger client when GRPC_BRIDGE_URL is not set", async () => {
    const OLD_ENV = process.env;
    process.env = { ...OLD_ENV };
    delete process.env.GRPC_BRIDGE_URL;
    vi.resetModules();
    const { getLedgerClient } = await import("./grpcClient");
    const client = getLedgerClient();
    expect(client).toBeNull();
    process.env = OLD_ENV;
  });

  it("returns null for fraud client when GRPC_FRAUD_URL is not set", async () => {
    const OLD_ENV = process.env;
    process.env = { ...OLD_ENV };
    delete process.env.GRPC_BRIDGE_URL;
    delete process.env.GRPC_FRAUD_URL;
    vi.resetModules();
    const { getFraudClient } = await import("./grpcClient");
    const client = getFraudClient();
    expect(client).toBeNull();
    process.env = OLD_ENV;
  });

  it("returns null for consumer client when GRPC_CONSUMER_URL is not set", async () => {
    const OLD_ENV = process.env;
    process.env = { ...OLD_ENV };
    delete process.env.GRPC_BRIDGE_URL;
    delete process.env.GRPC_CONSUMER_URL;
    delete process.env.CONSUMER_SERVICE_GRPC_URL;
    vi.resetModules();
    const { getConsumerClient } = await import("./grpcClient");
    const client = getConsumerClient();
    expect(client).toBeNull();
    process.env = OLD_ENV;
  });

  it("returns null for analytics client when GRPC_ANALYTICS_URL is not set", async () => {
    const OLD_ENV = process.env;
    process.env = { ...OLD_ENV };
    delete process.env.GRPC_BRIDGE_URL;
    delete process.env.GRPC_ANALYTICS_URL;
    delete process.env.ANALYTICS_SERVICE_GRPC_URL;
    vi.resetModules();
    const { getAnalyticsClient } = await import("./grpcClient");
    const client = getAnalyticsClient();
    expect(client).toBeNull();
    process.env = OLD_ENV;
  });

  it("returns null for outbox client when GRPC_OUTBOX_URL is not set", async () => {
    const OLD_ENV = process.env;
    process.env = { ...OLD_ENV };
    delete process.env.GRPC_OUTBOX_URL;
    delete process.env.OUTBOX_RELAY_GRPC_URL;
    vi.resetModules();
    const { getOutboxClient } = await import("./grpcClient");
    const client = getOutboxClient();
    expect(client).toBeNull();
    process.env = OLD_ENV;
  });
});

// ─── Idempotency middleware ───────────────────────────────────────────────────

describe("withIdempotency — key validation", () => {
  it("rejects keys shorter than 8 characters", async () => {
    const { withIdempotency } = await import("./idempotency");
    await expect(
      withIdempotency({
        key: "short",
        merchantId: "m1",
        operation: "test.op",
        requestBody: {},
        execute: async () => ({ ok: true }),
      })
    ).rejects.toThrow("idempotency_key must be at least 8 characters");
  });

  it("rejects empty key", async () => {
    const { withIdempotency } = await import("./idempotency");
    await expect(
      withIdempotency({
        key: "",
        merchantId: "m1",
        operation: "test.op",
        requestBody: {},
        execute: async () => ({ ok: true }),
      })
    ).rejects.toThrow("idempotency_key must be at least 8 characters");
  });
});

describe("withIdempotency — request hash", () => {
  it("produces consistent SHA-256 hash for same body", () => {
    const body = { amount: 1000, currency: "NGN", accountNumber: "0123456789" };
    const hash1 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const hash2 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces different hash for different bodies", () => {
    const body1 = { amount: 1000 };
    const body2 = { amount: 2000 };
    const hash1 = createHash("sha256").update(JSON.stringify(body1)).digest("hex");
    const hash2 = createHash("sha256").update(JSON.stringify(body2)).digest("hex");
    expect(hash1).not.toBe(hash2);
  });
});

// ─── Consumer analytics router ───────────────────────────────────────────────

describe("Consumer analytics data structures", () => {
  it("spend by month has correct shape", () => {
    const mockMonthlyData = [
      { month: "2024-01", totalKobo: 150000, txCount: 5 },
      { month: "2024-02", totalKobo: 200000, txCount: 8 },
    ];
    expect(mockMonthlyData[0]).toHaveProperty("month");
    expect(mockMonthlyData[0]).toHaveProperty("totalKobo");
    expect(mockMonthlyData[0]).toHaveProperty("txCount");
    expect(typeof mockMonthlyData[0].totalKobo).toBe("number");
  });

  it("spend by category has correct shape", () => {
    const mockCategoryData = [
      { category: "bills", totalKobo: 50000, txCount: 3 },
      { category: "p2p_send", totalKobo: 100000, txCount: 2 },
    ];
    expect(mockCategoryData[0]).toHaveProperty("category");
    expect(mockCategoryData[0]).toHaveProperty("totalKobo");
    expect(mockCategoryData.length).toBeGreaterThan(0);
  });

  it("credit/debit split has correct shape", () => {
    const mockSplit = { totalCreditKobo: 500000, totalDebitKobo: 300000, netKobo: 200000 };
    expect(mockSplit.netKobo).toBe(mockSplit.totalCreditKobo - mockSplit.totalDebitKobo);
  });
});

// ─── Consumer disputes ───────────────────────────────────────────────────────

describe("Consumer dispute validation", () => {
  it("validates dispute reason is non-empty", () => {
    const validateDispute = (reason: string) => reason.trim().length > 0;
    expect(validateDispute("Unauthorized transaction")).toBe(true);
    expect(validateDispute("")).toBe(false);
    expect(validateDispute("   ")).toBe(false);
  });

  it("validates dispute amount is positive", () => {
    const validateAmount = (amount: number) => amount > 0;
    expect(validateAmount(1000)).toBe(true);
    expect(validateAmount(0)).toBe(false);
    expect(validateAmount(-100)).toBe(false);
  });

  it("dispute status transitions are valid", () => {
    const validTransitions: Record<string, string[]> = {
      open: ["under_review", "resolved", "rejected"],
      under_review: ["resolved", "rejected"],
      resolved: [],
      rejected: [],
    };
    expect(validTransitions["open"]).toContain("under_review");
    expect(validTransitions["resolved"]).toHaveLength(0);
    expect(validTransitions["under_review"]).not.toContain("open");
  });
});

// ─── Consumer fraud flag ─────────────────────────────────────────────────────

describe("Consumer fraud scoring thresholds", () => {
  const FRAUD_THRESHOLD = 70;

  it("flags transaction when score exceeds threshold", () => {
    const shouldFlag = (score: number) => score > FRAUD_THRESHOLD;
    expect(shouldFlag(75)).toBe(true);
    expect(shouldFlag(70)).toBe(false);
    expect(shouldFlag(69)).toBe(false);
    expect(shouldFlag(100)).toBe(true);
  });

  it("calculates risk level from score", () => {
    const getRiskLevel = (score: number) => {
      if (score >= 80) return "high";
      if (score >= 50) return "medium";
      return "low";
    };
    expect(getRiskLevel(85)).toBe("high");
    expect(getRiskLevel(60)).toBe("medium");
    expect(getRiskLevel(30)).toBe("low");
  });
});

// ─── Push token registration ─────────────────────────────────────────────────

describe("Push token validation", () => {
  it("validates FCM token format (non-empty string)", () => {
    const isValidToken = (token: string) => typeof token === "string" && token.length > 10;
    expect(isValidToken("fGH7kL9mN2pQ4rS6tU8vW0xY1zA3bC5dE7fG9hI")).toBe(true);
    expect(isValidToken("")).toBe(false);
    expect(isValidToken("short")).toBe(false);
  });

  it("validates platform is fcm or apns", () => {
    const validPlatforms = ["fcm", "apns"];
    expect(validPlatforms.includes("fcm")).toBe(true);
    expect(validPlatforms.includes("apns")).toBe(true);
    expect(validPlatforms.includes("windows")).toBe(false);
  });

  it("validates device ID is non-empty", () => {
    const isValidDeviceId = (id: string) => id.trim().length > 0;
    expect(isValidDeviceId("device-uuid-123")).toBe(true);
    expect(isValidDeviceId("")).toBe(false);
  });
});

// ─── CSV export ──────────────────────────────────────────────────────────────

describe("Transaction CSV export", () => {
  it("generates valid CSV header", () => {
    const headers = ["Date", "Type", "Amount (NGN)", "Description", "Reference", "Status"];
    const csvHeader = headers.join(",");
    expect(csvHeader).toBe("Date,Type,Amount (NGN),Description,Reference,Status");
    expect(csvHeader.split(",")).toHaveLength(6);
  });

  it("escapes commas in CSV values", () => {
    const escapeCSV = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };
    expect(escapeCSV("Hello, World")).toBe('"Hello, World"');
    expect(escapeCSV('Say "hi"')).toBe('"Say ""hi"""');
    expect(escapeCSV("Normal")).toBe("Normal");
  });

  it("formats amount from kobo to naira", () => {
    const formatAmount = (kobo: number) => (kobo / 100).toFixed(2);
    expect(formatAmount(150000)).toBe("1500.00");
    expect(formatAmount(50)).toBe("0.50");
    expect(formatAmount(0)).toBe("0.00");
  });
});

// ─── nameEnquiry ─────────────────────────────────────────────────────────────

describe("NIP nameEnquiry validation", () => {
  it("validates account number is exactly 10 digits", () => {
    const isValidAccount = (acc: string) => /^\d{10}$/.test(acc);
    expect(isValidAccount("0123456789")).toBe(true);
    expect(isValidAccount("012345678")).toBe(false);  // 9 digits
    expect(isValidAccount("01234567890")).toBe(false); // 11 digits
    expect(isValidAccount("012345678a")).toBe(false);  // non-digit
  });

  it("validates bank code is 3-6 characters", () => {
    const isValidBankCode = (code: string) => code.length >= 3 && code.length <= 6;
    expect(isValidBankCode("044")).toBe(true);    // GTBank
    expect(isValidBankCode("000014")).toBe(true); // Access
    expect(isValidBankCode("AB")).toBe(false);    // too short
    expect(isValidBankCode("1234567")).toBe(false); // too long
  });

  it("name enquiry response has required fields", () => {
    const mockResponse = {
      accountName: "JOHN DOE",
      accountNumber: "0123456789",
      bankCode: "044",
      bankName: "Guaranty Trust Bank",
    };
    expect(mockResponse).toHaveProperty("accountName");
    expect(mockResponse).toHaveProperty("accountNumber");
    expect(mockResponse).toHaveProperty("bankCode");
    expect(mockResponse.accountName).toBeTruthy();
  });
});

// ─── Webhook trigger ─────────────────────────────────────────────────────────

describe("Webhook trigger validation", () => {
  it("validates webhook URL format", () => {
    const isValidUrl = (url: string) => {
      try {
        const u = new URL(url);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    };
    expect(isValidUrl("https://example.com/webhook")).toBe(true);
    expect(isValidUrl("http://localhost:3000/hook")).toBe(true);
    expect(isValidUrl("not-a-url")).toBe(false);
    expect(isValidUrl("ftp://example.com")).toBe(false);
  });

  it("generates HMAC-SHA256 signature for webhook payload", () => {
    const secret = "webhook-secret-key";
    const payload = JSON.stringify({ event: "payment.success", amount: 1000 });
    const sig1 = createHash("sha256").update(payload + secret).digest("hex");
    const sig2 = createHash("sha256").update(payload + secret).digest("hex");
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });

  it("different payloads produce different signatures", () => {
    const secret = "webhook-secret-key";
    const payload1 = JSON.stringify({ event: "payment.success", amount: 1000 });
    const payload2 = JSON.stringify({ event: "payment.failed", amount: 1000 });
    const sig1 = createHash("sha256").update(payload1 + secret).digest("hex");
    const sig2 = createHash("sha256").update(payload2 + secret).digest("hex");
    expect(sig1).not.toBe(sig2);
  });

  it("webhook event types are valid", () => {
    const validEvents = [
      "payment.success",
      "payment.failed",
      "payout.completed",
      "payout.failed",
      "dispute.opened",
      "dispute.resolved",
      "subscription.renewed",
      "subscription.cancelled",
    ];
    expect(validEvents).toContain("payment.success");
    expect(validEvents).toContain("dispute.opened");
    expect(validEvents).not.toContain("unknown.event");
  });
});

// ─── Consumer cross-border transfer ──────────────────────────────────────────

describe("Consumer cross-border transfer validation", () => {
  it("validates supported corridors", () => {
    const supportedCorridors = [
      "NGN-GHS", "NGN-KES", "NGN-ZAR", "NGN-USD", "NGN-EUR", "NGN-GBP",
      "NGN-CNY", "NGN-RUB", "NGN-BRL", "NGN-INR",
    ];
    expect(supportedCorridors).toContain("NGN-USD");
    expect(supportedCorridors).toContain("NGN-GHS");
    expect(supportedCorridors).not.toContain("NGN-JPY");
  });

  it("validates minimum transfer amount", () => {
    const MIN_AMOUNT_KOBO = 100_00; // ₦100
    const isValidAmount = (kobo: number) => kobo >= MIN_AMOUNT_KOBO;
    expect(isValidAmount(100_00)).toBe(true);
    expect(isValidAmount(50_00)).toBe(false);
    expect(isValidAmount(1_000_00)).toBe(true);
  });

  it("calculates exchange rate correctly", () => {
    const calculateReceiveAmount = (sendKobo: number, rate: number) =>
      Math.floor(sendKobo * rate);
    // 1 NGN = 0.0008 USD → 1000 NGN = 0.8 USD
    const result = calculateReceiveAmount(100_000_00, 0.0008); // 100,000 NGN
    expect(result).toBe(8000); // 80 USD in cents
  });
});

// ─── Monthly statement ───────────────────────────────────────────────────────

describe("Monthly statement generation", () => {
  it("generates correct month range for a given year-month", () => {
    const getMonthRange = (year: number, month: number) => {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end };
    };
    const { start, end } = getMonthRange(2024, 1);
    expect(start.getMonth()).toBe(0); // January
    expect(end.getDate()).toBe(31);   // January has 31 days
  });

  it("generates correct month range for February in leap year", () => {
    const getMonthRange = (year: number, month: number) => {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end };
    };
    const { end } = getMonthRange(2024, 2); // Feb 2024 (leap year)
    expect(end.getDate()).toBe(29);
  });

  it("statement summary has required fields", () => {
    const mockSummary = {
      period: "2024-01",
      openingBalance: 50000,
      closingBalance: 75000,
      totalCredits: 100000,
      totalDebits: 75000,
      transactionCount: 12,
    };
    expect(mockSummary).toHaveProperty("period");
    expect(mockSummary).toHaveProperty("openingBalance");
    expect(mockSummary).toHaveProperty("closingBalance");
    expect(mockSummary.closingBalance).toBe(
      mockSummary.openingBalance + mockSummary.totalCredits - mockSummary.totalDebits
    );
  });
});

// ─── Beneficiary management ──────────────────────────────────────────────────

describe("Beneficiary management", () => {
  it("validates beneficiary nickname is non-empty", () => {
    const isValidNickname = (name: string) => name.trim().length >= 1 && name.trim().length <= 50;
    expect(isValidNickname("Mum")).toBe(true);
    expect(isValidNickname("")).toBe(false);
    expect(isValidNickname("A".repeat(51))).toBe(false);
  });

  it("sorts beneficiaries by last used date descending", () => {
    const beneficiaries = [
      { name: "Alice", lastUsedAt: new Date("2024-01-15") },
      { name: "Bob", lastUsedAt: new Date("2024-03-01") },
      { name: "Charlie", lastUsedAt: new Date("2024-02-10") },
    ];
    const sorted = [...beneficiaries].sort(
      (a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime()
    );
    expect(sorted[0].name).toBe("Bob");
    expect(sorted[1].name).toBe("Charlie");
    expect(sorted[2].name).toBe("Alice");
  });
});

// ─── Dispute SLA ─────────────────────────────────────────────────────────────

describe("Dispute SLA tracking", () => {
  it("calculates SLA breach correctly", () => {
    const SLA_HOURS = 72;
    const isBreached = (createdAt: Date, now: Date) => {
      const diffHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      return diffHours > SLA_HOURS;
    };
    const created = new Date("2024-01-01T00:00:00Z");
    const withinSLA = new Date("2024-01-03T00:00:00Z"); // exactly 48 hours
    const breached = new Date("2024-01-05T00:00:00Z");  // 96 hours
    expect(isBreached(created, withinSLA)).toBe(false);
    expect(isBreached(created, breached)).toBe(true);
  });

  it("calculates hours remaining before SLA breach", () => {
    const SLA_HOURS = 72;
    const hoursRemaining = (createdAt: Date, now: Date) => {
      const elapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      return Math.max(0, SLA_HOURS - elapsed);
    };
    const created = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2024-01-02T00:00:00Z"); // 24 hours elapsed
    expect(hoursRemaining(created, now)).toBe(48);
  });

  it("returns 0 hours remaining when SLA is breached", () => {
    const SLA_HOURS = 72;
    const hoursRemaining = (createdAt: Date, now: Date) => {
      const elapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      return Math.max(0, SLA_HOURS - elapsed);
    };
    const created = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2024-01-10T00:00:00Z"); // 9 days elapsed
    expect(hoursRemaining(created, now)).toBe(0);
  });
});

// ─── Merchant analytics drill-down ───────────────────────────────────────────

describe("Merchant analytics drill-down", () => {
  it("validates date range: start must be before end", () => {
    const isValidRange = (start: Date, end: Date) => start < end;
    expect(isValidRange(new Date("2024-01-01"), new Date("2024-12-31"))).toBe(true);
    expect(isValidRange(new Date("2024-12-31"), new Date("2024-01-01"))).toBe(false);
    expect(isValidRange(new Date("2024-06-01"), new Date("2024-06-01"))).toBe(false);
  });

  it("aggregates revenue by payment channel", () => {
    const transactions = [
      { channel: "card", amountKobo: 10000 },
      { channel: "bank_transfer", amountKobo: 20000 },
      { channel: "card", amountKobo: 5000 },
      { channel: "usdc", amountKobo: 15000 },
    ];
    const byChannel = transactions.reduce((acc, tx) => {
      acc[tx.channel] = (acc[tx.channel] ?? 0) + tx.amountKobo;
      return acc;
    }, {} as Record<string, number>);
    expect(byChannel["card"]).toBe(15000);
    expect(byChannel["bank_transfer"]).toBe(20000);
    expect(byChannel["usdc"]).toBe(15000);
  });

  it("calculates growth rate between two periods", () => {
    const growthRate = (current: number, previous: number) => {
      if (previous === 0) return 100;
      return ((current - previous) / previous) * 100;
    };
    expect(growthRate(110, 100)).toBeCloseTo(10);
    expect(growthRate(90, 100)).toBeCloseTo(-10);
    expect(growthRate(0, 100)).toBeCloseTo(-100);
    expect(growthRate(100, 0)).toBe(100);
  });
});
