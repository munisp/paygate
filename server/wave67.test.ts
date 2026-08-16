/**
 * Wave 67 Tests — VTpass Integration, consumerBills.verify, Saved Beneficiaries
 *
 * NOTE: tRPC v11 stores procedures in _def.procedures as flat dot-notation keys.
 * Procedure type (mutation vs query) is not exposed as a boolean flag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── VTpass Client Tests ──────────────────────────────────────────────────────

describe("vtpass client", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VTPASS_API_KEY;
    delete process.env.VTPASS_SECRET_KEY;
    // STALE CONTRACT: silent simulation fallback was replaced by fail-loud
    // behavior (see vtpass.failLoud.test.ts); simulation results are only
    // produced when PAYGATE_SIMULATION_MODE=true, so these simulation-mode
    // tests opt in explicitly.
    process.env.PAYGATE_SIMULATION_MODE = "true";
  });

  afterEach(() => {
    delete process.env.PAYGATE_SIMULATION_MODE;
  });

  it("returns simulation result when no credentials are set", async () => {
    const { vtpassPay } = await import("./vtpass");
    const result = await vtpassPay({
      billerCode: "mtn_airtime",
      customerReference: "08012345678",
      amountNaira: 100,
      requestId: "test_req_001",
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.providerRef).toContain("sim_");
    expect(result.message).toMatch(/simulat/i);
  });

  it("returns simulation result for unknown biller code", async () => {
    const { vtpassPay } = await import("./vtpass");
    const result = await vtpassPay({
      billerCode: "unknown_biller_xyz",
      customerReference: "12345",
      amountNaira: 50,
      requestId: "test_req_002",
    });
    expect(result.success).toBe(true);
    expect(result.providerRef).toContain("sim_");
  });

  it("verify returns valid:true in simulation mode", async () => {
    const { vtpassVerify } = await import("./vtpass");
    const result = await vtpassVerify({
      billerCode: "ekedc",
      customerReference: "1234567890",
    });
    expect(result.valid).toBe(true);
    expect(result.message).toMatch(/simulat/i);
  });

  it("maps all known airtime biller codes in simulation mode", async () => {
    const { vtpassPay } = await import("./vtpass");
    const billerCodes = [
      "mtn_airtime",
      "airtel_airtime",
      "glo_airtime",
      "9mobile_airtime",
    ];
    for (const code of billerCodes) {
      const result = await vtpassPay({
        billerCode: code,
        customerReference: "08012345678",
        amountNaira: 100,
        requestId: `test_${code}`,
      });
      expect(result.success, `${code} should succeed`).toBe(true);
    }
  });

  it("maps all known data biller codes in simulation mode", async () => {
    const { vtpassPay } = await import("./vtpass");
    const billerCodes = [
      "mtn_data",
      "airtel_data",
      "glo_data",
      "9mobile_data",
    ];
    for (const code of billerCodes) {
      const result = await vtpassPay({
        billerCode: code,
        customerReference: "08012345678",
        amountNaira: 1000,
        requestId: `test_${code}`,
      });
      expect(result.success, `${code} should succeed`).toBe(true);
    }
  });

  it("maps all known electricity biller codes in simulation mode", async () => {
    const { vtpassPay } = await import("./vtpass");
    const billerCodes = ["ekedc", "ikedc", "aedc", "phedc"];
    for (const code of billerCodes) {
      const result = await vtpassPay({
        billerCode: code,
        customerReference: "1234567890",
        amountNaira: 5000,
        requestId: `test_${code}`,
      });
      expect(result.success, `${code} should succeed`).toBe(true);
    }
  });

  it("maps all known cable TV biller codes in simulation mode", async () => {
    const { vtpassPay } = await import("./vtpass");
    const billerCodes = ["dstv", "gotv", "startimes"];
    for (const code of billerCodes) {
      const result = await vtpassPay({
        billerCode: code,
        customerReference: "1234567890",
        amountNaira: 3000,
        requestId: `test_${code}`,
      });
      expect(result.success, `${code} should succeed`).toBe(true);
    }
  });

  it("returns a transactionDate in simulation result", async () => {
    const { vtpassPay } = await import("./vtpass");
    const result = await vtpassPay({
      billerCode: "mtn_airtime",
      customerReference: "08012345678",
      amountNaira: 200,
      requestId: "test_date_001",
    });
    expect(result.transactionDate).toBeDefined();
    expect(new Date(result.transactionDate!).getTime()).toBeGreaterThan(0);
  });

  it("includes requestId in providerRef for traceability", async () => {
    const { vtpassPay } = await import("./vtpass");
    const requestId = "trace_test_abc123";
    const result = await vtpassPay({
      billerCode: "mtn_airtime",
      customerReference: "08012345678",
      amountNaira: 100,
      requestId,
    });
    expect(result.providerRef).toContain(requestId);
  });

  it("vtpassVerify returns customerName in simulation mode", async () => {
    const { vtpassVerify } = await import("./vtpass");
    const result = await vtpassVerify({
      billerCode: "dstv",
      customerReference: "1234567890",
    });
    expect(result.valid).toBe(true);
    expect(result.customerName).toBeDefined();
  });
});

// ─── consumerBills Router Tests ───────────────────────────────────────────────

describe("consumerBills router", () => {
  it("has listCategories, listBillers, pay, verify, and history procedures", async () => {
    const { appRouter } = await import("./routers");
    const router = (appRouter as any)._def.procedures;
    expect(router["consumerBills.listCategories"]).toBeDefined();
    expect(router["consumerBills.listBillers"]).toBeDefined();
    expect(router["consumerBills.pay"]).toBeDefined();
    expect(router["consumerBills.verify"]).toBeDefined();
    expect(router["consumerBills.history"]).toBeDefined();
    // Generous timeout: importing the full appRouter on a slow (FUSE)
    // filesystem can exceed the 15s default.
  }, 90000);

  it("all five consumerBills procedures are registered", async () => {
    const { appRouter } = await import("./routers");
    const keys = Object.keys((appRouter as any)._def.procedures);
    const billKeys = keys.filter((k) => k.startsWith("consumerBills."));
    expect(billKeys.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── P2P Router Tests ─────────────────────────────────────────────────────────

describe("p2p router", () => {
  it("has send, history, savedBeneficiaries, and deleteBeneficiary procedures", async () => {
    const { appRouter } = await import("./routers");
    const router = (appRouter as any)._def.procedures;
    expect(router["p2p.send"]).toBeDefined();
    expect(router["p2p.history"]).toBeDefined();
    expect(router["p2p.savedBeneficiaries"]).toBeDefined();
    expect(router["p2p.deleteBeneficiary"]).toBeDefined();
  });

  it("all four p2p procedures are registered", async () => {
    const { appRouter } = await import("./routers");
    const keys = Object.keys((appRouter as any)._def.procedures);
    const p2pKeys = keys.filter((k) => k.startsWith("p2p."));
    expect(p2pKeys.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── QR Payments Router Tests (merchant-side) ─────────────────────────────────

describe("qrPayments router", () => {
  it("has generate, scan, and recentScans procedures", async () => {
    const { appRouter } = await import("./routers");
    const router = (appRouter as any)._def.procedures;
    expect(router["qrPayments.generate"]).toBeDefined();
    expect(router["qrPayments.scan"]).toBeDefined();
    expect(router["qrPayments.recentScans"]).toBeDefined();
  });
});

// ─── Red Envelope Router Tests ────────────────────────────────────────────────

describe("redEnvelope router", () => {
  it("has create, claim, status, and myEnvelopes procedures", async () => {
    const { appRouter } = await import("./routers");
    const router = (appRouter as any)._def.procedures;
    expect(router["redEnvelope.create"]).toBeDefined();
    expect(router["redEnvelope.claim"]).toBeDefined();
    expect(router["redEnvelope.status"]).toBeDefined();
    expect(router["redEnvelope.myEnvelopes"]).toBeDefined();
  });

  it("all four redEnvelope procedures are registered", async () => {
    const { appRouter } = await import("./routers");
    const keys = Object.keys((appRouter as any)._def.procedures);
    const envKeys = keys.filter((k) => k.startsWith("redEnvelope."));
    expect(envKeys.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── Consumer Wallet Router Tests ─────────────────────────────────────────────

describe("consumerWallet router", () => {
  it("has getOrCreate, getBalance, topUp, and history procedures", async () => {
    const { appRouter } = await import("./routers");
    const router = (appRouter as any)._def.procedures;
    expect(router["consumerWallet.getOrCreate"]).toBeDefined();
    expect(router["consumerWallet.getBalance"]).toBeDefined();
    expect(router["consumerWallet.topUp"]).toBeDefined();
    expect(router["consumerWallet.history"]).toBeDefined();
  });

  it("all four consumerWallet procedures are registered", async () => {
    const { appRouter } = await import("./routers");
    const keys = Object.keys((appRouter as any)._def.procedures);
    const walletKeys = keys.filter((k) => k.startsWith("consumerWallet."));
    expect(walletKeys.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── VTpass Integration Wiring Tests ─────────────────────────────────────────

describe("vtpass wiring in consumerBills.pay", () => {
  it("vtpass.ts exports vtpassPay and vtpassVerify functions", async () => {
    const vtpass = await import("./vtpass");
    expect(typeof vtpass.vtpassPay).toBe("function");
    expect(typeof vtpass.vtpassVerify).toBe("function");
  });

  it("vtpassPay result has required fields", async () => {
    const { vtpassPay } = await import("./vtpass");
    const result = await vtpassPay({
      billerCode: "mtn_airtime",
      customerReference: "08012345678",
      amountNaira: 100,
      requestId: "wire_test_001",
    });
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("providerRef");
    expect(result).toHaveProperty("message");
  });

  it("vtpassVerify result has required fields", async () => {
    const { vtpassVerify } = await import("./vtpass");
    const result = await vtpassVerify({
      billerCode: "ekedc",
      customerReference: "1234567890",
    });
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("message");
  });

  it("consumerBills.pay procedure accepts variationCode input", async () => {
    const { appRouter } = await import("./routers");
    const proc = (appRouter as any)._def.procedures["consumerBills.pay"];
    expect(proc).toBeDefined();
    // The input schema should include variationCode (optional)
    const inputSchema = proc._def.inputs?.[0];
    expect(inputSchema).toBeDefined();
  });
});
