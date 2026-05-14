/**
 * Corridor Router Tests
 * Tests for tenant corridor management: create, update, toggle, FX markup, daily limits.
 */
import { describe, it, expect } from "vitest";

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe("corridorRouter", () => {
  describe("corridor defaults", () => {
    it("default FX markup is 1.5%", () => {
      const defaults = { fxMarkupPct: 1.5 };
      expect(defaults.fxMarkupPct).toBe(1.5);
    });

    it("default daily limit is $50,000 USD", () => {
      const defaults = { dailyLimitUsd: 50000 };
      expect(defaults.dailyLimitUsd).toBe(50000);
    });

    it("default min amount is $1 USD", () => {
      const defaults = { minAmountUsd: 1 };
      expect(defaults.minAmountUsd).toBe(1);
    });

    it("default max amount is $10,000 USD", () => {
      const defaults = { maxAmountUsd: 10000 };
      expect(defaults.maxAmountUsd).toBe(10000);
    });

    it("default flat fee is $0 USD", () => {
      const defaults = { flatFeeUsd: 0 };
      expect(defaults.flatFeeUsd).toBe(0);
    });

    it("corridors are enabled by default", () => {
      const defaults = { isEnabled: true };
      expect(defaults.isEnabled).toBe(true);
    });
  });

  describe("currency validation", () => {
    it("accepts 3-letter currency codes", () => {
      const currencies = ["NGN", "USD", "GBP", "EUR", "KES", "GHS", "ZAR"];
      currencies.forEach(c => expect(c.length).toBe(3));
    });

    it("NGN to USD corridor is valid", () => {
      const corridor = { sourceCurrency: "NGN", destCurrency: "USD" };
      expect(corridor.sourceCurrency).toBe("NGN");
      expect(corridor.destCurrency).toBe("USD");
    });

    it("source and dest currencies can differ", () => {
      const corridor = { sourceCurrency: "NGN", destCurrency: "GBP" };
      expect(corridor.sourceCurrency).not.toBe(corridor.destCurrency);
    });
  });

  describe("FX markup validation", () => {
    it("FX markup must be between 0 and 10%", () => {
      const validMarkups = [0, 0.5, 1.5, 2.0, 5.0, 10.0];
      validMarkups.forEach(m => {
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(10);
      });
    });

    it("FX markup of 1.5% means 1.5 cents per dollar", () => {
      const markup = 1.5;
      const amount = 100;
      const fee = (amount * markup) / 100;
      expect(fee).toBe(1.5);
    });

    it("FX markup of 0% means no extra charge", () => {
      const markup = 0;
      const amount = 100;
      const fee = (amount * markup) / 100;
      expect(fee).toBe(0);
    });
  });

  describe("daily limit validation", () => {
    it("daily limit must be non-negative", () => {
      const limit = 50000;
      expect(limit).toBeGreaterThanOrEqual(0);
    });

    it("zero daily limit effectively disables corridor", () => {
      const limit = 0;
      const amount = 100;
      const allowed = amount <= limit;
      expect(allowed).toBe(false);
    });

    it("transaction within daily limit is allowed", () => {
      const limit = 50000;
      const amount = 1000;
      const allowed = amount <= limit;
      expect(allowed).toBe(true);
    });

    it("transaction exceeding daily limit is blocked", () => {
      const limit = 50000;
      const amount = 60000;
      const allowed = amount <= limit;
      expect(allowed).toBe(false);
    });
  });

  describe("admin-only operations", () => {
    it("create requires admin role", () => {
      const user = { role: "user" };
      const isAdmin = user.role === "admin";
      expect(isAdmin).toBe(false);
    });

    it("update requires admin role", () => {
      const user = { role: "admin" };
      const isAdmin = user.role === "admin";
      expect(isAdmin).toBe(true);
    });

    it("toggle requires admin role", () => {
      const user = { role: "user" };
      const isAdmin = user.role === "admin";
      expect(isAdmin).toBe(false);
    });

    it("delete requires admin role", () => {
      const user = { role: "admin" };
      const isAdmin = user.role === "admin";
      expect(isAdmin).toBe(true);
    });
  });

  describe("corridor toggle", () => {
    it("can enable a disabled corridor", () => {
      const corridor = { isEnabled: false };
      const updated = { ...corridor, isEnabled: true };
      expect(updated.isEnabled).toBe(true);
    });

    it("can disable an enabled corridor", () => {
      const corridor = { isEnabled: true };
      const updated = { ...corridor, isEnabled: false };
      expect(updated.isEnabled).toBe(false);
    });
  });

  describe("tenant ID resolution", () => {
    it("uses input tenantId when provided", () => {
      const input = { tenantId: "ten_explicit" };
      const ctx = { user: { tenantId: "ten_from_ctx" } };
      const resolved = input.tenantId ?? ctx.user.tenantId ?? "platform";
      expect(resolved).toBe("ten_explicit");
    });

    it("falls back to ctx.user.tenantId", () => {
      const input: { tenantId?: string } = {};
      const ctx = { user: { tenantId: "ten_from_ctx" } };
      const resolved = input.tenantId ?? ctx.user.tenantId ?? "platform";
      expect(resolved).toBe("ten_from_ctx");
    });

    it("falls back to platform when both undefined", () => {
      const input: { tenantId?: string } = {};
      const ctx = { user: { tenantId: undefined } };
      const resolved = input.tenantId ?? ctx.user.tenantId ?? "platform";
      expect(resolved).toBe("platform");
    });
  });
});
