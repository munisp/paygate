/**
 * Shared frontend validation utilities
 * Used across all form pages for consistent validation rules.
 */

// ─── Nigerian phone number ────────────────────────────────────────────────────
export const isValidNigerianPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\s+/g, "").replace(/^0/, "+234");
  return /^\+234[789][01]\d{8}$/.test(cleaned);
};

// ─── BVN (Bank Verification Number) ──────────────────────────────────────────
export const isValidBVN = (bvn: string): boolean => /^\d{11}$/.test(bvn.trim());

// ─── NIN (National Identification Number) ────────────────────────────────────
export const isValidNIN = (nin: string): boolean => /^\d{11}$/.test(nin.trim());

// ─── Account number ───────────────────────────────────────────────────────────
export const isValidAccountNumber = (acct: string): boolean =>
  /^\d{10}$/.test(acct.trim());

// ─── Amount (in Naira, must be > 0) ──────────────────────────────────────────
export const isValidAmount = (amount: number | string): boolean => {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return Number.isFinite(n) && n > 0;
};

// ─── Amount in Kobo (must be >= 100 kobo = ₦1) ───────────────────────────────
export const isValidAmountKobo = (kobo: number): boolean =>
  Number.isInteger(kobo) && kobo >= 100;

// ─── Email ────────────────────────────────────────────────────────────────────
export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

// ─── URL ──────────────────────────────────────────────────────────────────────
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// ─── Bank sort code / routing ─────────────────────────────────────────────────
export const isValidSortCode = (code: string): boolean =>
  /^\d{6}$/.test(code.trim());

// ─── IBAN (basic format check) ────────────────────────────────────────────────
export const isValidIBAN = (iban: string): boolean =>
  /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(iban.replace(/\s/g, "").toUpperCase());

// ─── SWIFT/BIC ────────────────────────────────────────────────────────────────
export const isValidSWIFT = (swift: string): boolean =>
  /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(
    swift.replace(/\s/g, "").toUpperCase()
  );

// ─── Card number (Luhn check) ─────────────────────────────────────────────────
export const isValidCardNumber = (number: string): boolean => {
  const digits = number.replace(/\s/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

// ─── CVV ──────────────────────────────────────────────────────────────────────
export const isValidCVV = (cvv: string): boolean => /^\d{3,4}$/.test(cvv.trim());

// ─── Expiry date (MM/YY or MM/YYYY) ──────────────────────────────────────────
export const isValidExpiry = (expiry: string): boolean => {
  const match = expiry.match(/^(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2].length === 2 ? `20${match[2]}` : match[2], 10);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const expDate = new Date(year, month - 1, 1);
  return expDate >= new Date(now.getFullYear(), now.getMonth(), 1);
};

// ─── PIN (4–6 digits) ─────────────────────────────────────────────────────────
export const isValidPIN = (pin: string): boolean => /^\d{4,6}$/.test(pin.trim());

// ─── OTP (6 digits) ──────────────────────────────────────────────────────────
export const isValidOTP = (otp: string): boolean => /^\d{6}$/.test(otp.trim());

// ─── RC Number (Nigerian CAC registration) ───────────────────────────────────
export const isValidRCNumber = (rc: string): boolean =>
  /^RC\d{5,7}$/i.test(rc.trim()) || /^\d{5,7}$/.test(rc.trim());

// ─── TIN (Tax Identification Number) ─────────────────────────────────────────
export const isValidTIN = (tin: string): boolean =>
  /^\d{8,12}$/.test(tin.replace(/[-\s]/g, ""));

// ─── Naira amount formatter ───────────────────────────────────────────────────
export const formatNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Kobo from Naira string ───────────────────────────────────────────────────
export const nairaToKobo = (naira: string | number): number =>
  Math.round(parseFloat(String(naira).replace(/,/g, "")) * 100);

// ─── Truncate long strings ────────────────────────────────────────────────────
export const truncate = (str: string, maxLen = 32): string =>
  str.length > maxLen ? `${str.slice(0, maxLen - 3)}...` : str;

// ─── Generic required field check ────────────────────────────────────────────
export const isNonEmpty = (value: string | undefined | null): boolean =>
  typeof value === "string" && value.trim().length > 0;

// ─── Validate payout form ────────────────────────────────────────────────────
export interface PayoutFormFields {
  accountNumber: string;
  bankCode: string;
  amountKobo: number;
  narration: string;
}
export const validatePayoutForm = (f: PayoutFormFields): string | null => {
  if (!isValidAccountNumber(f.accountNumber)) return "Account number must be 10 digits";
  if (!isNonEmpty(f.bankCode)) return "Bank code is required";
  if (!isValidAmountKobo(f.amountKobo)) return "Amount must be at least ₦1";
  if (!isNonEmpty(f.narration)) return "Narration is required";
  return null;
};

// ─── Validate KYC/onboarding form ────────────────────────────────────────────
export interface KycFormFields {
  bvn: string;
  nin?: string;
  phone: string;
  email: string;
}
export const validateKycForm = (f: KycFormFields): string | null => {
  if (!isValidBVN(f.bvn)) return "BVN must be exactly 11 digits";
  if (f.nin && !isValidNIN(f.nin)) return "NIN must be exactly 11 digits";
  if (!isValidNigerianPhone(f.phone)) return "Enter a valid Nigerian phone number";
  if (!isValidEmail(f.email)) return "Enter a valid email address";
  return null;
};
