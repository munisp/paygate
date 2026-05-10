/**
 * Wave 123 — Security Hardening Module
 *
 * Implements:
 * 1. PBAC enforcement for aiModelAdmin, menuMgmt, and portalHealth namespaces
 * 2. AI model version integrity validation (semantic versioning guard)
 * 3. Menu item price range validation (prevents negative/overflow prices)
 * 4. Rate-limit bypass detection for portalHealth endpoints
 * 5. Audit trail helpers for sensitive AI model mutations
 * 6. Input sanitisation for all wave123 tRPC procedures
 * 7. Admin-only guard for portalHealth and aiModelAdmin write operations
 */
import { TRPCError } from "@trpc/server";
import { Request, Response, NextFunction } from "express";

// ── 1. PBAC for wave123 namespaces ────────────────────────────────────────────

export type Wave123Permission =
  | "aiModelAdmin:read"
  | "aiModelAdmin:write"
  | "aiModelAdmin:delete"
  | "menuMgmt:read"
  | "menuMgmt:write"
  | "menuMgmt:delete"
  | "portalHealth:read"
  | "portalHealth:admin";

const ROLE_PERMISSIONS: Record<string, Wave123Permission[]> = {
  admin: [
    "aiModelAdmin:read", "aiModelAdmin:write", "aiModelAdmin:delete",
    "menuMgmt:read", "menuMgmt:write", "menuMgmt:delete",
    "portalHealth:read", "portalHealth:admin",
  ],
  merchant: [
    "aiModelAdmin:read",
    "menuMgmt:read", "menuMgmt:write", "menuMgmt:delete",
    "portalHealth:read",
  ],
  developer: [
    "aiModelAdmin:read",
    "menuMgmt:read",
    "portalHealth:read",
  ],
  viewer: [
    "aiModelAdmin:read",
    "menuMgmt:read",
    "portalHealth:read",
  ],
};

export function assertWave123Permission(
  userRole: string | undefined,
  permission: Wave123Permission
): void {
  const role = userRole ?? "viewer";
  const allowed = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS["viewer"];
  if (!allowed.includes(permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Role '${role}' does not have permission '${permission}'`,
    });
  }
}

export function hasWave123Permission(
  userRole: string | undefined,
  permission: Wave123Permission
): boolean {
  try {
    assertWave123Permission(userRole, permission);
    return true;
  } catch {
    return false;
  }
}

// ── 2. AI Model Version Integrity Validation ──────────────────────────────────

const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;

export function validateModelVersion(version: string): void {
  if (!SEMVER_RE.test(version)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid model version '${version}'. Must follow semantic versioning (e.g. 1.2.3 or 2.0.0-beta.1)`,
    });
  }
  const parts = version.split(".").map(Number);
  if (parts.some(isNaN)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Model version contains non-numeric parts",
    });
  }
}

export function validateModelAccuracy(value: number | undefined, field: string): void {
  if (value === undefined) return;
  if (value < 0 || value > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${field} must be between 0 and 1 (got ${value})`,
    });
  }
}

// ── 3. Menu Item Price Validation ─────────────────────────────────────────────

const MAX_PRICE_KOBO = 100_000_000_00; // ₦100M in kobo

export function validateMenuItemPrice(priceKobo: number): void {
  if (!Number.isInteger(priceKobo)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Price must be an integer number of kobo",
    });
  }
  if (priceKobo < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Price cannot be negative",
    });
  }
  if (priceKobo > MAX_PRICE_KOBO) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Price exceeds maximum allowed value of ₦${(MAX_PRICE_KOBO / 100).toLocaleString()}`,
    });
  }
}

export function validateMenuItemName(name: string): void {
  if (name.trim().length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Item name cannot be empty" });
  }
  if (name.length > 255) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Item name too long (max 255 chars)" });
  }
  // Prevent XSS via menu item names
  const xssPattern = /<script|javascript:|on\w+\s*=/i;
  if (xssPattern.test(name)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Item name contains invalid characters" });
  }
}

// ── 4. Portal Health Rate-Limit Bypass Detection ─────────────────────────────

const HEALTH_ENDPOINT_CALL_LOG = new Map<string, { count: number; windowStart: number }>();
const HEALTH_RATE_LIMIT = 30; // max 30 calls per minute per IP
const HEALTH_WINDOW_MS = 60_000;

export function checkHealthEndpointRateLimit(ip: string): void {
  const now = Date.now();
  const entry = HEALTH_ENDPOINT_CALL_LOG.get(ip);
  if (!entry || now - entry.windowStart > HEALTH_WINDOW_MS) {
    HEALTH_ENDPOINT_CALL_LOG.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count++;
  if (entry.count > HEALTH_RATE_LIMIT) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Health endpoint rate limit exceeded (${HEALTH_RATE_LIMIT} req/min)`,
    });
  }
}

// ── 5. Audit Trail Helpers for AI Model Mutations ────────────────────────────

export interface AiModelAuditEvent {
  action: "model.registered" | "model.status_changed" | "model.deleted" | "job.cancelled";
  actorId: string;
  actorName?: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export function buildAiModelAuditEvent(
  action: AiModelAuditEvent["action"],
  actorId: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
  actorName?: string
): AiModelAuditEvent {
  return {
    action,
    actorId,
    actorName,
    resourceId,
    metadata,
    timestamp: new Date(),
  };
}

// ── 6. Input Sanitisation ─────────────────────────────────────────────────────

export function sanitizeNotes(notes: string | undefined): string | undefined {
  if (!notes) return undefined;
  // Strip HTML tags and limit length
  return notes.replace(/<[^>]*>/g, "").slice(0, 2000).trim() || undefined;
}

export function sanitizeMerchantId(merchantId: string): string {
  if (!merchantId || merchantId.length < 3 || merchantId.length > 128) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid merchantId",
    });
  }
  // Only alphanumeric, underscores, hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(merchantId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "merchantId contains invalid characters",
    });
  }
  return merchantId;
}

// ── 7. Admin-Only Guard ───────────────────────────────────────────────────────

export function requireAdminRole(userRole: string | undefined, operation: string): void {
  if (userRole !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Operation '${operation}' requires admin role (current: ${userRole ?? "unknown"})`,
    });
  }
}

// ── Express Middleware: Validate Content-Type for AI model uploads ────────────

export function validateAiModelUploadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.path.includes("/ai-model") && req.method === "POST") {
    const contentType = req.headers["content-type"] ?? "";
    const allowed = ["application/json", "multipart/form-data", "application/octet-stream"];
    if (!allowed.some(t => contentType.includes(t))) {
      res.status(415).json({ error: "Unsupported Media Type for AI model upload" });
      return;
    }
  }
  next();
}

// ── Export summary ────────────────────────────────────────────────────────────

export const wave123Security = {
  assertPermission: assertWave123Permission,
  hasPermission: hasWave123Permission,
  validateModelVersion,
  validateModelAccuracy,
  validateMenuItemPrice,
  validateMenuItemName,
  checkHealthEndpointRateLimit,
  buildAiModelAuditEvent,
  sanitizeNotes,
  sanitizeMerchantId,
  requireAdminRole,
};
