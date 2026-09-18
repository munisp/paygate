/**
 * vtpass.failLoud.test.ts — mockware regression tests.
 * Bill payments must FAIL LOUD when VTpass is unconfigured or the provider
 * errors; simulated success is only reachable via PAYGATE_SIMULATION_MODE=true.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vtpassPay, vtpassVerify } from "./vtpass";

const ENV_KEYS = ["VTPASS_API_KEY", "VTPASS_SECRET_KEY", "PAYGATE_SIMULATION_MODE", "VTPASS_SANDBOX"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  delete process.env.VTPASS_API_KEY;
  delete process.env.VTPASS_SECRET_KEY;
  delete process.env.PAYGATE_SIMULATION_MODE;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("vtpassPay — fail loud", () => {
  it("returns success:false when credentials are missing (never a sim_* success)", async () => {
    const r = await vtpassPay({ billerCode: "mtn_airtime", customerReference: "08030000000", amountNaira: 500, requestId: "req_1" });
    expect(r.success).toBe(false);
    expect(r.status).toBe("failed");
    expect(r.providerRef).not.toMatch(/^sim_/);
    expect(r.simulation).toBeUndefined();
  });

  it("returns success:false when the live API errors — no fallback simulation", async () => {
    process.env.VTPASS_API_KEY = "live_key";
    process.env.VTPASS_SECRET_KEY = "live_secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const r = await vtpassPay({ billerCode: "mtn_airtime", customerReference: "08030000000", amountNaira: 500, requestId: "req_2" });
    expect(r.success).toBe(false);
    expect(r.status).toBe("failed");
    expect(r.message).toMatch(/unavailable|network down/i);
    expect(r.providerRef).not.toMatch(/^sim_/);
  });

  it("simulation only when PAYGATE_SIMULATION_MODE=true, and is loudly labeled", async () => {
    process.env.PAYGATE_SIMULATION_MODE = "true";
    delete process.env.NODE_ENV;
    const r = await vtpassPay({ billerCode: "mtn_airtime", customerReference: "08030000000", amountNaira: 500, requestId: "req_3" });
    expect(r.simulation).toBe(true);
    expect(r.message).toMatch(/SIMULATED/);
  });

  it("simulation is suppressed in production even if the flag is set", async () => {
    process.env.PAYGATE_SIMULATION_MODE = "true";
    process.env.NODE_ENV = "production";
    const r = await vtpassPay({ billerCode: "mtn_airtime", customerReference: "08030000000", amountNaira: 500, requestId: "req_4" });
    expect(r.success).toBe(false); // no creds + prod ⇒ fail loud, never simulate
    expect(r.simulation).toBeUndefined();
    delete process.env.NODE_ENV;
  });
});

describe("vtpassVerify — fail loud", () => {
  it("returns valid:false when credentials are missing (never a fake customer)", async () => {
    const r = await vtpassVerify({ billerCode: "ikedc", customerReference: "12345678901" });
    expect(r.valid).toBe(false);
    expect(r.customerName).toBeUndefined();
  });

  it("returns valid:false when the live API errors", async () => {
    process.env.VTPASS_API_KEY = "live_key";
    process.env.VTPASS_SECRET_KEY = "live_secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const r = await vtpassVerify({ billerCode: "ikedc", customerReference: "12345678901" });
    expect(r.valid).toBe(false);
    expect(r.customerName).not.toBe("Simulated Customer");
  });
});
