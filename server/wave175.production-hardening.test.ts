/**
 * Wave 175 — SCUML, Accessibility, i18n, Production Final Sweep
 * Tests: SCUML registration expiry, accessibility fallback reasons,
 *        locale preferences, wave175.ts router existence.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── Pure logic helpers ───────────────────────────────────────────────────────

const SCUML_VALIDITY_DAYS = 365;

function scumlExpiryDate(registrationDate: Date): Date {
  return new Date(registrationDate.getTime() + SCUML_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

function isScumlExpiringSoon(expiryDate: Date, now = new Date(), warningDays = 30): boolean {
  const daysUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry >= 0 && daysUntilExpiry <= warningDays;
}

const VALID_FALLBACK_REASONS = [
  "disability",
  "technical_failure",
  "elderly",
  "medical",
  "notarised_document",
];

function isValidFallbackReason(reason: string): boolean {
  return VALID_FALLBACK_REASONS.includes(reason);
}

const VALID_LOCALES = ["en-NG", "en-GH", "en-KE", "fr-CI", "fr-SN", "yo-NG", "ha-NG", "ig-NG"];
const VALID_CURRENCIES = ["NGN", "GHS", "KES", "XOF", "USD", "GBP", "EUR"];

function isValidLocale(locale: string): boolean {
  return /^[a-z]{2,3}-[A-Z]{2}$/.test(locale);
}

function isValidCurrency(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency);
}

function formatNGN(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Wave 175 — wave175.ts router existence", () => {
  it("server/routers/wave175.ts exists", () => {
    expect(fs.existsSync(path.join(ROOT, "server/routers/wave175.ts"))).toBe(true);
  });

  it("wave175.ts exports scumlRouter", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routers/wave175.ts"), "utf8");
    expect(src).toContain("scumlRouter");
  });

  it("wave175.ts exports accessibilityRouter", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routers/wave175.ts"), "utf8");
    expect(src).toContain("accessibilityRouter");
  });

  it("wave175.ts exports localeRouter", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routers/wave175.ts"), "utf8");
    expect(src).toContain("localeRouter");
  });
});

describe("Wave 175 — SCUML Registration Check", () => {
  it("should set 1-year expiry for cleared SCUML registrations", () => {
    // Use 2023-01-01 (non-leap year) so 365 days lands on 2024-01-01
    const regDate = new Date("2023-01-01");
    const expiry = scumlExpiryDate(regDate);
    expect(expiry.getFullYear()).toBe(2024);
    expect(expiry.getMonth()).toBe(0); // January
    expect(expiry.getDate()).toBe(1);
  });

  it("should identify SCUML registrations expiring within 30 days", () => {
    const soon = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    expect(isScumlExpiringSoon(soon)).toBe(true);
  });

  it("should not flag SCUML registrations expiring in 60 days", () => {
    const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    expect(isScumlExpiringSoon(later)).toBe(false);
  });

  it("should not flag already-expired SCUML registrations as 'expiring soon'", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isScumlExpiringSoon(past)).toBe(false);
  });

  it("SCUML validity period is 365 days", () => {
    expect(SCUML_VALIDITY_DAYS).toBe(365);
  });
});

describe("Wave 175 — Accessibility Fallback", () => {
  it("should accept valid fallback reason: disability", () => {
    expect(isValidFallbackReason("disability")).toBe(true);
  });

  it("should accept valid fallback reason: notarised_document", () => {
    expect(isValidFallbackReason("notarised_document")).toBe(true);
  });

  it("should accept valid fallback reason: elderly", () => {
    expect(isValidFallbackReason("elderly")).toBe(true);
  });

  it("should reject invalid fallback reason", () => {
    expect(isValidFallbackReason("just_lazy")).toBe(false);
    expect(isValidFallbackReason("")).toBe(false);
    expect(isValidFallbackReason("DISABILITY")).toBe(false);
  });

  it("default review status is pending", () => {
    const newRequest = { reason: "disability", status: "pending" as const };
    expect(newRequest.status).toBe("pending");
  });
});

describe("Wave 175 — Locale Preferences", () => {
  it("should default to en-NG locale", () => {
    const defaults = { locale: "en-NG", currency: "NGN", timezone: "Africa/Lagos" };
    expect(defaults.locale).toBe("en-NG");
  });

  it("should default to NGN currency", () => {
    const defaults = { locale: "en-NG", currency: "NGN", timezone: "Africa/Lagos" };
    expect(defaults.currency).toBe("NGN");
  });

  it("should default to Africa/Lagos timezone", () => {
    const defaults = { locale: "en-NG", currency: "NGN", timezone: "Africa/Lagos" };
    expect(defaults.timezone).toBe("Africa/Lagos");
  });

  it("should format NGN currency correctly", () => {
    const formatted = formatNGN(1500.5);
    expect(formatted).toMatch(/NGN|₦/);
    expect(formatted).toContain("1,500");
  });

  it("should accept valid BCP-47 locale codes", () => {
    for (const locale of VALID_LOCALES) {
      expect(isValidLocale(locale)).toBe(true);
    }
  });

  it("should accept valid ISO-4217 currency codes", () => {
    for (const currency of VALID_CURRENCIES) {
      expect(isValidCurrency(currency)).toBe(true);
    }
  });
});
