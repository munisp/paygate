/**
 * PayGate Security Utilities
 *
 * Centralised security helpers used across all server code:
 * - SSRF protection for webhook URLs
 * - Timing-safe secret comparison
 * - OAuth origin validation
 * - File upload MIME / size validation
 * - Input sanitisation helpers
 */

import { createHash, timingSafeEqual } from "crypto";
import { TRPCError } from "@trpc/server";
import dns from "dns/promises";

// ─── Private IP ranges (RFC-1918, loopback, link-local, metadata) ─────────────
const PRIVATE_RANGES = [
  /^127\./,                          // loopback
  /^10\./,                           // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC-1918
  /^192\.168\./,                     // RFC-1918
  /^169\.254\./,                     // link-local / AWS metadata
  /^100\.6[4-9]\.|^100\.[7-9]\d\.|^100\.1[01]\d\.|^100\.12[0-7]\./, // CGNAT
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 ULA
  /^fe80:/i,                         // IPv6 link-local
  /^0\./,                            // "this" network
  /^255\./,                          // broadcast
];

const METADATA_HOSTS = new Set([
  "169.254.169.254",   // AWS / GCP / Azure instance metadata
  "metadata.google.internal",
  "metadata.internal",
]);

/**
 * Resolves a webhook URL's hostname and throws if it resolves to a private/internal IP.
 * Also blocks known cloud metadata endpoints.
 */
export async function blockPrivateWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid webhook URL" });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL must use http or https" });
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known metadata hosts by name
  if (METADATA_HOSTS.has(hostname)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL targets a restricted host" });
  }

  // Block raw private IPs without DNS resolution
  for (const re of PRIVATE_RANGES) {
    if (re.test(hostname)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL must not target private IP ranges" });
    }
  }

  // Resolve hostname and check resolved IPs
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addresses, ...addresses6];
    for (const ip of all) {
      for (const re of PRIVATE_RANGES) {
        if (re.test(ip)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL resolves to a private IP address" });
        }
      }
      if (METADATA_HOSTS.has(ip)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL resolves to a restricted host" });
      }
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    // DNS resolution failure — allow (external DNS may be down; we already checked raw IP patterns)
  }
}

// ─── Timing-safe secret comparison ───────────────────────────────────────────

/**
 * Compares two strings in constant time to prevent timing attacks.
 * Returns true only if both strings are identical.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) {
      // Still do a comparison to avoid early-exit timing leak
      timingSafeEqual(bufA, Buffer.alloc(bufA.length));
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// ─── OAuth origin validation ──────────────────────────────────────────────────

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-zA-Z0-9-]+\.manus\.space$/,
  /^https:\/\/[a-zA-Z0-9-]+\.manus\.computer$/,
];

/**
 * Validates that an OAuth redirect origin is in the allowlist.
 * Throws if the origin is not trusted.
 */
export function validateOAuthOrigin(origin: string): void {
  // Check against env-configured allowed origins first
  const envAllowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (envAllowed.includes(origin)) return;

  // Check against built-in patterns
  for (const pattern of ALLOWED_ORIGIN_PATTERNS) {
    if (pattern.test(origin)) return;
  }

  throw new Error(`OAuth origin '${origin}' is not in the allowed list`);
}

// ─── File upload validation ───────────────────────────────────────────────────

const ALLOWED_EVIDENCE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const ALLOWED_EVIDENCE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf"]);

/** Maximum base64-encoded file size for evidence uploads: 10 MB */
export const MAX_EVIDENCE_BASE64_BYTES = 10 * 1024 * 1024;

/**
 * Validates a file upload for dispute evidence.
 * Throws TRPCError on violation.
 */
export function validateEvidenceUpload(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
}): void {
  const { fileName, mimeType, base64Data } = params;

  // Size check (base64 is ~33% larger than binary)
  if (base64Data.length > MAX_EVIDENCE_BASE64_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File too large. Maximum size is ${MAX_EVIDENCE_BASE64_BYTES / 1024 / 1024} MB.`,
    });
  }

  // MIME type allowlist
  if (!ALLOWED_EVIDENCE_MIMES.has(mimeType.toLowerCase())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File type '${mimeType}' is not allowed. Allowed types: JPEG, PNG, WebP, GIF, PDF.`,
    });
  }

  // Extension check (defence-in-depth against MIME spoofing)
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EVIDENCE_EXTENSIONS.has(ext)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File extension '.${ext}' is not allowed.`,
    });
  }

  // Sanitise filename — strip path traversal characters
  if (/[/\\<>:"|?*\x00-\x1f]/.test(fileName)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "File name contains invalid characters.",
    });
  }
}

// ─── Input sanitisation helpers ───────────────────────────────────────────────

/**
 * Strips leading/trailing whitespace and truncates to maxLength.
 */
export function sanitizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

/**
 * Sanitises a free-text description field (max 2000 chars).
 */
export function sanitizeDescription(value: string): string {
  return sanitizeText(value, 2000);
}

/**
 * Sanitises a short name/title field (max 200 chars).
 */
export function sanitizeName(value: string): string {
  return sanitizeText(value, 200);
}

// ─── Error sanitisation ───────────────────────────────────────────────────────

/**
 * Returns a safe error message for client responses.
 * Strips internal service URLs, stack traces, and DB error details.
 */
export function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof TRPCError) return err.message;
  if (err instanceof Error) {
    const msg = err.message;
    // Strip common internal leakage patterns
    if (
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("getaddrinfo") ||
      msg.includes("syntax error") ||
      msg.includes("duplicate key") ||
      msg.includes("violates") ||
      msg.includes("column") ||
      msg.includes("relation") ||
      msg.includes("table")
    ) {
      return "An internal error occurred. Please try again later.";
    }
    // Truncate long messages
    return msg.slice(0, 200);
  }
  return "An unexpected error occurred.";
}

// ─── Bcrypt password helpers ──────────────────────────────────────────────────

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/**
 * Hashes a password using bcrypt with cost factor 12.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verifies a password against a bcrypt hash.
 * Also accepts legacy SHA-256 hashes and migrates them on success.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  jwtSecret: string
): Promise<{ valid: boolean; needsMigration: boolean }> {
  // Detect bcrypt hash (starts with $2a$ or $2b$)
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
    const valid = await bcrypt.compare(password, storedHash);
    return { valid, needsMigration: false };
  }

  // Legacy SHA-256 hash — verify and flag for migration
  const legacyHash = createHash("sha256").update(password + jwtSecret).digest("hex");
  const valid = timingSafeStringEqual(legacyHash, storedHash);
  return { valid, needsMigration: valid }; // migrate on successful login
}
