/**
 * Tenant Isolation Middleware
 * Ensures all data queries are scoped by tenantId.
 * Tenants cannot see each other's data.
 */
import { TRPCError } from "@trpc/server";
import { getDb, execRaw } from "./db";
import { eq, and } from "drizzle-orm";

// ─── In-memory rate limit store (per-tenant) ─────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const PLAN_RATE_LIMITS: Record<string, number> = {
  starter: 100,    // 100 req/min
  growth: 500,     // 500 req/min
  scale: 2000,     // 2000 req/min
  enterprise: 10000, // 10000 req/min
};

/**
 * Check and increment rate limit for a tenant.
 * Returns true if the request should be allowed, false if rate-limited.
 */
export function checkTenantRateLimit(tenantId: string, plan: string): boolean {
  const limit = PLAN_RATE_LIMITS[plan] ?? 100;
  const now = Date.now();
  const windowMs = 60_000; // 1 minute window

  const entry = rateLimitStore.get(tenantId);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(tenantId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Get remaining rate limit for a tenant.
 */
export function getTenantRateLimitInfo(tenantId: string, plan: string): {
  limit: number;
  remaining: number;
  resetAt: number;
} {
  const limit = PLAN_RATE_LIMITS[plan] ?? 100;
  const now = Date.now();
  const windowMs = 60_000;

  const entry = rateLimitStore.get(tenantId);
  if (!entry || now > entry.resetAt) {
    return { limit, remaining: limit, resetAt: now + windowMs };
  }

  return {
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Validate that a tenantId exists and is active.
 * Throws TRPCError if invalid.
 */
export async function validateTenant(tenantId: string): Promise<{
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await execRaw(db, `SELECT id, slug, name, plan, status FROM partner_tenants WHERE id = $1 AND status = 'active' LIMIT 1`, [tenantId]);

  const rows = (result as any).rows ?? result;
  if (!rows || rows.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Tenant ${tenantId} not found or inactive`,
    });
  }

  return rows[0];
}

/**
 * Validate that a user belongs to a tenant with the required role.
 * Throws TRPCError if unauthorized.
 */
export async function validateTenantMembership(
  tenantId: string,
  userEmail: string,
  requiredRoles: string[] = ["owner", "admin", "member", "viewer"]
): Promise<{ role: string; is_active: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await execRaw(db, `SELECT role, is_active FROM tenant_users WHERE tenant_id = $1 AND email = $2 LIMIT 1`, [tenantId, userEmail]);

  const rows = (result as any).rows ?? result;
  if (!rows || rows.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this tenant",
    });
  }

  const member = rows[0];
  if (!member.is_active) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your access to this tenant has been revoked",
    });
  }

  if (!requiredRoles.includes(member.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Insufficient role. Required: ${requiredRoles.join(" or ")}. Your role: ${member.role}`,
    });
  }

  return member;
}

/**
 * Build a tenant-scoped WHERE clause fragment.
 * Use this to ensure all queries include tenant_id = $tenantId.
 */
export function tenantScope(tenantId: string): { tenant_id: string } {
  return { tenant_id: tenantId };
}

/**
 * Audit log helper — records tenant actions.
 */
export async function logTenantAction(
  tenantId: string,
  action: string,
  actorEmail: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await execRaw(db, `INSERT INTO tenant_audit_logs (tenant_id, action, actor_email, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`, [tenantId, action, actorEmail, metadata ? JSON.stringify(metadata) : null]);
  } catch {
    // Non-fatal — audit log failure should not block the main operation
    console.warn("[tenantAudit] Failed to log action:", action, "for tenant:", tenantId);
  }
}

/**
 * TenantGuard — Express middleware for REST endpoints that require tenant context.
 * Validates X-Tenant-ID header and injects tenant into req.
 */
export function tenantGuard() {
  return async (req: any, res: any, next: any) => {
    const tenantId = req.headers["x-tenant-id"] as string;
    if (!tenantId) {
      return res.status(400).json({ error: "X-Tenant-ID header required" });
    }

    try {
      const tenant = await validateTenant(tenantId);

      // Rate limit check
      const allowed = checkTenantRateLimit(tenantId, tenant.plan);
      if (!allowed) {
        const info = getTenantRateLimitInfo(tenantId, tenant.plan);
        res.setHeader("X-RateLimit-Limit", info.limit);
        res.setHeader("X-RateLimit-Remaining", 0);
        res.setHeader("X-RateLimit-Reset", Math.ceil(info.resetAt / 1000));
        return res.status(429).json({ error: "Rate limit exceeded for tenant" });
      }

      req.tenant = tenant;
      next();
    } catch (err: any) {
      return res.status(403).json({ error: err.message ?? "Tenant validation failed" });
    }
  };
}

/**
 * Cleanup stale rate limit entries (call periodically).
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
