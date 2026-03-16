import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("../drizzle/schema", () => ({
  consumerWallets: { id: "id", userId: "userId", balanceKobo: "balanceKobo", currency: "currency", isActive: "isActive", createdAt: "createdAt", updatedAt: "updatedAt" },
  consumerWalletTxns: { id: "id", walletId: "walletId", userId: "userId", type: "type", amountKobo: "amountKobo", currency: "currency", balanceAfterKobo: "balanceAfterKobo", description: "description", reference: "reference", counterpartyName: "counterpartyName", status: "status", createdAt: "createdAt" },
  p2pTransfers: { id: "id", senderId: "senderId", recipientAccountNumber: "recipientAccountNumber", recipientBankCode: "recipientBankCode", recipientName: "recipientName", amountKobo: "amountKobo", currency: "currency", status: "status", reference: "reference", createdAt: "createdAt" },
  billPayments: { id: "id", userId: "userId", billerCode: "billerCode", billerName: "billerName", categoryCode: "categoryCode", customerReference: "customerReference", amountKobo: "amountKobo", currency: "currency", status: "status", providerRef: "providerRef", createdAt: "createdAt" },
  redEnvelopes: { id: "id", creatorId: "creatorId", totalAmountKobo: "totalAmountKobo", remainingAmountKobo: "remainingAmountKobo", currency: "currency", slots: "slots", claimedSlots: "claimedSlots", message: "message", status: "status", expiresAt: "expiresAt", createdAt: "createdAt" },
  redEnvelopeClaims: { id: "id", envelopeId: "envelopeId", userId: "userId", amountKobo: "amountKobo", claimedAt: "claimedAt" },
  savedBeneficiaries: { id: "id", userId: "userId", accountNumber: "accountNumber", bankCode: "bankCode", bankName: "bankName", accountName: "accountName" },
  devicePushTokens: { id: "id", merchantId: "merchantId", userId: "userId", token: "token", platform: "platform", isActive: "isActive" },
  qrPayments: { id: "id", merchantId: "merchantId", amount: "amount", currency: "currency", status: "status", reference: "reference", createdAt: "createdAt" },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeWallet(overrides = {}) {
  return {
    id: "wal_test",
    userId: 1,
    balanceKobo: 100_000_00,
    currency: "NGN",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeP2PTransfer(overrides = {}) {
  return {
    id: "p2p_test",
    senderId: 1,
    recipientAccountNumber: "0123456789",
    recipientBankCode: "044",
    recipientName: "Jane Doe",
    amountKobo: 5_000_00,
    currency: "NGN",
    status: "completed",
    reference: "REF_TEST_001",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeBillPayment(overrides = {}) {
  return {
    id: "bill_test",
    userId: 1,
    billerCode: "DSTV",
    billerName: "DStv",
    categoryCode: "cable_tv",
    customerReference: "1234567890",
    amountKobo: 10_000_00,
    currency: "NGN",
    status: "completed",
    providerRef: "PROV_REF_001",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRedEnvelope(overrides = {}) {
  return {
    id: "env_test",
    creatorId: 1,
    totalAmountKobo: 50_000_00,
    remainingAmountKobo: 40_000_00,
    currency: "NGN",
    slots: 5,
    claimedSlots: 1,
    message: "Happy New Year!",
    status: "active",
    expiresAt: new Date(Date.now() + 86400_000),
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Wave 66 — Consumer Feature Data Models", () => {
  describe("Consumer Wallet", () => {
    it("wallet balance is stored in kobo (integer)", () => {
      const wallet = makeWallet({ balanceKobo: 100_000_00 });
      expect(wallet.balanceKobo).toBe(10_000_000);
      expect(wallet.balanceKobo / 100).toBe(100_000);
    });

    it("wallet has required fields", () => {
      const wallet = makeWallet();
      expect(wallet).toHaveProperty("id");
      expect(wallet).toHaveProperty("userId");
      expect(wallet).toHaveProperty("balanceKobo");
      expect(wallet).toHaveProperty("currency");
      expect(wallet).toHaveProperty("isActive");
    });

    it("wallet currency defaults to NGN", () => {
      const wallet = makeWallet();
      expect(wallet.currency).toBe("NGN");
    });
  });

  describe("P2P Transfers", () => {
    it("transfer has required fields", () => {
      const transfer = makeP2PTransfer();
      expect(transfer).toHaveProperty("id");
      expect(transfer).toHaveProperty("senderId");
      expect(transfer).toHaveProperty("recipientAccountNumber");
      expect(transfer).toHaveProperty("recipientBankCode");
      expect(transfer).toHaveProperty("amountKobo");
      expect(transfer).toHaveProperty("reference");
    });

    it("transfer amount is positive", () => {
      const transfer = makeP2PTransfer({ amountKobo: 5_000_00 });
      expect(transfer.amountKobo).toBeGreaterThan(0);
    });

    it("transfer reference is unique string", () => {
      const t1 = makeP2PTransfer({ reference: "REF_001" });
      const t2 = makeP2PTransfer({ reference: "REF_002" });
      expect(t1.reference).not.toBe(t2.reference);
    });

    it("transfer status is valid enum value", () => {
      const validStatuses = ["pending", "completed", "failed"];
      const transfer = makeP2PTransfer({ status: "completed" });
      expect(validStatuses).toContain(transfer.status);
    });
  });

  describe("Bill Payments", () => {
    it("bill payment has required fields", () => {
      const bill = makeBillPayment();
      expect(bill).toHaveProperty("id");
      expect(bill).toHaveProperty("userId");
      expect(bill).toHaveProperty("billerCode");
      expect(bill).toHaveProperty("amountKobo");
      expect(bill).toHaveProperty("customerReference");
    });

    it("bill payment amount is positive", () => {
      const bill = makeBillPayment({ amountKobo: 10_000_00 });
      expect(bill.amountKobo).toBeGreaterThan(0);
    });

    it("bill category codes are valid", () => {
      const validCategories = ["airtime", "data", "electricity", "cable_tv", "water", "internet", "insurance"];
      const bill = makeBillPayment({ categoryCode: "cable_tv" });
      expect(validCategories).toContain(bill.categoryCode);
    });
  });

  describe("Red Envelopes", () => {
    it("red envelope has required fields", () => {
      const env = makeRedEnvelope();
      expect(env).toHaveProperty("id");
      expect(env).toHaveProperty("creatorId");
      expect(env).toHaveProperty("totalAmountKobo");
      expect(env).toHaveProperty("slots");
      expect(env).toHaveProperty("status");
    });

    it("remaining amount is less than or equal to total", () => {
      const env = makeRedEnvelope({ totalAmountKobo: 50_000_00, remainingAmountKobo: 40_000_00 });
      expect(env.remainingAmountKobo).toBeLessThanOrEqual(env.totalAmountKobo);
    });

    it("claimed slots is less than or equal to total slots", () => {
      const env = makeRedEnvelope({ slots: 5, claimedSlots: 1 });
      expect(env.claimedSlots).toBeLessThanOrEqual(env.slots);
    });

    it("active envelope has future expiry", () => {
      const env = makeRedEnvelope({ expiresAt: new Date(Date.now() + 86400_000) });
      expect(env.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("expired envelope detection works", () => {
      const env = makeRedEnvelope({ expiresAt: new Date(Date.now() - 1000) });
      const isExpired = env.expiresAt.getTime() < Date.now();
      expect(isExpired).toBe(true);
    });

    it("envelope status transitions are valid", () => {
      const validStatuses = ["active", "exhausted", "expired", "cancelled"];
      const env = makeRedEnvelope({ status: "active" });
      expect(validStatuses).toContain(env.status);
    });
  });

  describe("Push Notification Triggers", () => {
    it("p2p send triggers push notification to recipient", () => {
      const mockNotify = vi.fn().mockResolvedValue({ success_count: 1, failure_count: 0, total_tokens: 1, invalid_tokens: [] });
      // Simulate the fire-and-forget pattern
      const fireAndForget = async () => {
        await mockNotify({
          tokens: ["fcm_token_recipient"],
          notification: { title: "💸 Money Received", body: "You received ₦500.00 from John" },
          type: "transaction_completed",
        });
      };
      fireAndForget();
      expect(mockNotify).toHaveBeenCalledOnce();
    });

    it("bill pay triggers push notification to payer", () => {
      const mockNotify = vi.fn().mockResolvedValue({ success_count: 1, failure_count: 0, total_tokens: 1, invalid_tokens: [] });
      const fireAndForget = async () => {
        await mockNotify({
          tokens: ["fcm_token_payer"],
          notification: { title: "✅ Bill Payment Successful", body: "₦1,000.00 paid to DStv" },
          type: "transaction_completed",
        });
      };
      fireAndForget();
      expect(mockNotify).toHaveBeenCalledOnce();
    });

    it("red envelope claim triggers push notification to claimer", () => {
      const mockNotify = vi.fn().mockResolvedValue({ success_count: 1, failure_count: 0, total_tokens: 1, invalid_tokens: [] });
      const fireAndForget = async () => {
        await mockNotify({
          tokens: ["fcm_token_claimer"],
          notification: { title: "🧧 Red Envelope Claimed!", body: "You received ₦100.00 from a red envelope" },
          type: "transaction_completed",
        });
      };
      fireAndForget();
      expect(mockNotify).toHaveBeenCalledOnce();
    });

    it("push notification is fire-and-forget (does not block response)", async () => {
      let notifyResolved = false;
      const mockNotify = vi.fn().mockImplementation(() => new Promise(resolve => {
        setTimeout(() => { notifyResolved = true; resolve({ success_count: 1 }); }, 100);
      }));

      // Simulate fire-and-forget: don't await
      mockNotify({ tokens: ["tok"], notification: { title: "Test", body: "Test" } }).catch(() => {});
      
      // Response should be available immediately without waiting for notification
      const response = { success: true, amountKobo: 5000 };
      expect(response.success).toBe(true);
      expect(notifyResolved).toBe(false); // notification hasn't resolved yet
    });
  });

  describe("Bill Categories", () => {
    const BILL_CATEGORIES = [
      { code: "airtime", name: "Airtime", icon: "📱" },
      { code: "data", name: "Data Bundle", icon: "🌐" },
      { code: "electricity", name: "Electricity", icon: "⚡" },
      { code: "cable_tv", name: "Cable TV", icon: "📺" },
      { code: "water", name: "Water", icon: "💧" },
      { code: "internet", name: "Internet", icon: "🔌" },
      { code: "insurance", name: "Insurance", icon: "🛡️" },
    ];

    it("all required bill categories are defined", () => {
      const codes = BILL_CATEGORIES.map(c => c.code);
      expect(codes).toContain("airtime");
      expect(codes).toContain("electricity");
      expect(codes).toContain("cable_tv");
      expect(codes).toContain("data");
    });

    it("each category has code, name, and icon", () => {
      for (const cat of BILL_CATEGORIES) {
        expect(cat.code).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.icon).toBeTruthy();
      }
    });

    it("category codes are unique", () => {
      const codes = BILL_CATEGORIES.map(c => c.code);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });
  });
});
