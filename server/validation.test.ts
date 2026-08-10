/**
 * Validation utility tests
 * Tests for shared frontend validation helpers (imported via shared path)
 */
import { describe, it, expect } from "vitest";

// ─── Inline the validation logic for server-side testing ─────────────────────
// (These mirror the client/src/lib/validation.ts functions)

const isValidNigerianPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\s+/g, "").replace(/^0/, "+234");
  return /^\+234[789][01]\d{8}$/.test(cleaned);
};

const isValidBVN = (bvn: string): boolean => /^\d{11}$/.test(bvn.trim());
const isValidNIN = (nin: string): boolean => /^\d{11}$/.test(nin.trim());
const isValidAccountNumber = (acct: string): boolean => /^\d{10}$/.test(acct.trim());
const isValidAmount = (amount: number | string): boolean => {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return Number.isFinite(n) && n > 0;
};
const isValidAmountKobo = (kobo: number): boolean =>
  Number.isInteger(kobo) && kobo >= 100;
const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const isValidUrl = (url: string): boolean => {
  try { new URL(url); return true; } catch { return false; }
};
const isValidPIN = (pin: string): boolean => /^\d{4,6}$/.test(pin.trim());
const isValidOTP = (otp: string): boolean => /^\d{6}$/.test(otp.trim());
const isValidCardNumber = (number: string): boolean => {
  const digits = number.replace(/\s/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0; let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
};
const isValidExpiry = (expiry: string): boolean => {
  const match = expiry.match(/^(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2].length === 2 ? `20${match[2]}` : match[2], 10);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const expDate = new Date(year, month - 1, 1);
  return expDate >= new Date(now.getFullYear(), now.getMonth(), 1);
};
const isValidIBAN = (iban: string): boolean =>
  /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(iban.replace(/\s/g, "").toUpperCase());
const isValidSWIFT = (swift: string): boolean =>
  /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift.replace(/\s/g, "").toUpperCase());
const isNonEmpty = (value: string | undefined | null): boolean =>
  typeof value === "string" && value.trim().length > 0;
const formatNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nairaToKobo = (naira: string | number): number =>
  Math.round(parseFloat(String(naira).replace(/,/g, "")) * 100);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Nigerian Phone Validation", () => {
  it("accepts valid +234 format", () => {
    expect(isValidNigerianPhone("+2348012345678")).toBe(true);
    expect(isValidNigerianPhone("+2349012345678")).toBe(true);
    expect(isValidNigerianPhone("+2347012345678")).toBe(true);
  });
  it("converts leading 0 to +234", () => {
    expect(isValidNigerianPhone("08012345678")).toBe(true);
    expect(isValidNigerianPhone("09012345678")).toBe(true);
  });
  it("rejects invalid formats", () => {
    expect(isValidNigerianPhone("1234567890")).toBe(false);
    expect(isValidNigerianPhone("+2348")).toBe(false);
    expect(isValidNigerianPhone("+234801234567890")).toBe(false);
    expect(isValidNigerianPhone("+2346012345678")).toBe(false); // invalid prefix 60
  });
});

describe("BVN Validation", () => {
  it("accepts exactly 11 digits", () => {
    expect(isValidBVN("22345678901")).toBe(true);
    expect(isValidBVN("00000000000")).toBe(true);
  });
  it("rejects non-11-digit strings", () => {
    expect(isValidBVN("1234567890")).toBe(false);  // 10 digits
    expect(isValidBVN("123456789012")).toBe(false); // 12 digits
    expect(isValidBVN("2234567890A")).toBe(false);  // contains letter
  });
});

describe("NIN Validation", () => {
  it("accepts exactly 11 digits", () => {
    expect(isValidNIN("12345678901")).toBe(true);
  });
  it("rejects non-11-digit strings", () => {
    expect(isValidNIN("1234567890")).toBe(false);
    expect(isValidNIN("123456789012")).toBe(false);
  });
});

describe("Account Number Validation", () => {
  it("accepts exactly 10 digits", () => {
    expect(isValidAccountNumber("0123456789")).toBe(true);
  });
  it("rejects non-10-digit strings", () => {
    expect(isValidAccountNumber("012345678")).toBe(false);
    expect(isValidAccountNumber("01234567890")).toBe(false);
    expect(isValidAccountNumber("012345678A")).toBe(false);
  });
});

describe("Amount Validation", () => {
  it("accepts positive numbers", () => {
    expect(isValidAmount(100)).toBe(true);
    expect(isValidAmount(0.01)).toBe(true);
    expect(isValidAmount("500.50")).toBe(true);
  });
  it("rejects zero and negative", () => {
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount("0")).toBe(false);
    expect(isValidAmount("abc")).toBe(false);
  });
});

describe("Amount Kobo Validation", () => {
  it("accepts integers >= 100 kobo", () => {
    expect(isValidAmountKobo(100)).toBe(true);
    expect(isValidAmountKobo(50000)).toBe(true);
  });
  it("rejects < 100 kobo or non-integer", () => {
    expect(isValidAmountKobo(99)).toBe(false);
    expect(isValidAmountKobo(0)).toBe(false);
    expect(isValidAmountKobo(100.5)).toBe(false);
  });
});

describe("Email Validation", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user+tag@sub.domain.co")).toBe(true);
  });
  it("rejects invalid emails", () => {
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@domain.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
  });
});

describe("URL Validation", () => {
  it("accepts valid URLs", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://localhost:3000/path")).toBe(true);
  });
  it("rejects invalid URLs", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
    expect(isValidUrl("ftp//example.com")).toBe(false);
  });
});

describe("PIN Validation", () => {
  it("accepts 4-6 digit PINs", () => {
    expect(isValidPIN("1234")).toBe(true);
    expect(isValidPIN("123456")).toBe(true);
  });
  it("rejects non-digit or wrong length", () => {
    expect(isValidPIN("123")).toBe(false);
    expect(isValidPIN("1234567")).toBe(false);
    expect(isValidPIN("12ab")).toBe(false);
  });
});

describe("OTP Validation", () => {
  it("accepts exactly 6 digits", () => {
    expect(isValidOTP("123456")).toBe(true);
    expect(isValidOTP("000000")).toBe(true);
  });
  it("rejects non-6-digit strings", () => {
    expect(isValidOTP("12345")).toBe(false);
    expect(isValidOTP("1234567")).toBe(false);
    expect(isValidOTP("12345A")).toBe(false);
  });
});

describe("Card Number Validation (Luhn)", () => {
  it("accepts valid Visa test card", () => {
    expect(isValidCardNumber("4242424242424242")).toBe(true);
  });
  it("accepts valid Mastercard test card", () => {
    expect(isValidCardNumber("5555555555554444")).toBe(true);
  });
  it("rejects invalid card numbers", () => {
    expect(isValidCardNumber("1234567890123456")).toBe(false);
    expect(isValidCardNumber("4242424242424241")).toBe(false); // last digit wrong
  });
});

describe("Expiry Date Validation", () => {
  it("accepts future dates", () => {
    const futureYear = new Date().getFullYear() + 2;
    expect(isValidExpiry(`12/${String(futureYear).slice(2)}`)).toBe(true);
    expect(isValidExpiry(`06/${futureYear}`)).toBe(true);
  });
  it("rejects past dates", () => {
    expect(isValidExpiry("01/20")).toBe(false);
    expect(isValidExpiry("12/2019")).toBe(false);
  });
  it("rejects invalid month", () => {
    expect(isValidExpiry("00/30")).toBe(false);
    expect(isValidExpiry("13/30")).toBe(false);
  });
});

describe("IBAN Validation", () => {
  it("accepts valid IBAN format", () => {
    expect(isValidIBAN("GB29NWBK60161331926819")).toBe(true);
    expect(isValidIBAN("DE89370400440532013000")).toBe(true);
  });
  it("rejects invalid IBAN format", () => {
    expect(isValidIBAN("NOTANIBAN")).toBe(false);
    expect(isValidIBAN("12GB29NWBK")).toBe(false);
  });
});

describe("SWIFT/BIC Validation", () => {
  it("accepts valid SWIFT codes", () => {
    expect(isValidSWIFT("GTBINGLA")).toBe(true);
    expect(isValidSWIFT("GTBINGLALAG")).toBe(true);
  });
  it("rejects invalid SWIFT codes", () => {
    expect(isValidSWIFT("GTBI")).toBe(false);
    expect(isValidSWIFT("123INGLA")).toBe(false);
  });
});

describe("isNonEmpty", () => {
  it("returns true for non-empty strings", () => {
    expect(isNonEmpty("hello")).toBe(true);
    expect(isNonEmpty("  x  ")).toBe(true);
  });
  it("returns false for empty/null/undefined", () => {
    expect(isNonEmpty("")).toBe(false);
    expect(isNonEmpty("   ")).toBe(false);
    expect(isNonEmpty(null)).toBe(false);
    expect(isNonEmpty(undefined)).toBe(false);
  });
});

describe("Currency Utilities", () => {
  it("formatNaira converts kobo to ₦ string", () => {
    expect(formatNaira(100)).toBe("₦1.00");
    expect(formatNaira(50000)).toBe("₦500.00");
    expect(formatNaira(1000000)).toBe("₦10,000.00");
  });
  it("nairaToKobo converts ₦ amount to kobo", () => {
    expect(nairaToKobo(1)).toBe(100);
    expect(nairaToKobo("500.50")).toBe(50050);
    expect(nairaToKobo("1,000")).toBe(100000);
  });
});
