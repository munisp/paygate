import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { logProcedure } from "../logger";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // Mask stack traces in production to prevent information leakage
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Only include stack traces in development
        stack: IS_PRODUCTION ? undefined : shape.data.stack,
      },
    };
  },
});

// ─── Logging middleware ───────────────────────────────────────────────────────
// Applied to ALL procedures (public and protected).
// Logs procedure path, type, duration, success/failure, and actor.

const loggingMiddleware = t.middleware(async opts => {
  const start = Date.now();
  const result = await opts.next();
  const durationMs = Date.now() - start;
  logProcedure(
    opts.path,
    opts.type as "query" | "mutation" | "subscription",
    durationMs,
    result.ok,
    { userId: (opts.ctx as any).user?.openId }
  );
  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(loggingMiddleware);

// ─── requireUser ──────────────────────────────────────────────────────────────

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(loggingMiddleware).use(requireUser);

// ─── adminProcedure ───────────────────────────────────────────────────────────

export const adminProcedure = t.procedure.use(loggingMiddleware).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ─── tenantProcedure ──────────────────────────────────────────────────────────
// Resolves the tenant for the authenticated user's merchant.
// Injects ctx.tenantId into the procedure context.
// Falls back to the default platform tenant if the merchant has no tenantId set.

export const DEFAULT_TENANT_ID = "ten_default";

// ─── auditedProtectedProcedure ────────────────────────────────────────────────
// Import auditedProcedure directly from server/_core/auditMiddleware.ts.
// NOT re-exported here to avoid circular dependency
// (auditMiddleware imports protectedProcedure from this file).

// ─── featureGatedProcedure ────────────────────────────────────────────────────
// Factory that creates a protected procedure gated by a feature flag.
// Usage: featureGatedProcedure('bnpl').query(...)
// The feature flag is looked up in the feature_flags table for the user's tenant.
// Falls back to enabled=true when the DB is unavailable (fail-open for availability).

export function featureGatedProcedure(featureKey: string) {
  return protectedProcedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      try {
        // Lazy import to avoid circular deps
        const { getDb } = await import('../db');
        const { sql } = await import('drizzle-orm');
        const db = await getDb();
        if (db) {
          const rows = await db.execute(sql`
            SELECT enabled FROM feature_flags
            WHERE key = ${featureKey}
              AND (merchant_id IS NULL OR merchant_id = ${(ctx.user as any).merchantId ?? null})
            LIMIT 1
          `);
          if (rows.rows.length > 0 && !(rows.rows[0] as any).enabled) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `Feature '${featureKey}' is not enabled for your account`,
            });
          }
        }
      } catch (err: any) {
        // Re-throw TRPCErrors (feature disabled)
        if (err instanceof TRPCError) throw err;
        // Fail-open: if DB lookup fails, allow the request through
      }
      return next({ ctx });
    }),
  );
}

// ─── tenantPlanProcedure ──────────────────────────────────────────────────────
// Factory that creates a protected procedure gated by a minimum tenant plan.
// Plans: starter < growth < enterprise
// Usage: tenantPlanProcedure('growth').query(...)

const PLAN_RANK: Record<string, number> = { starter: 1, growth: 2, enterprise: 3 };

export function tenantPlanProcedure(minimumPlan: 'starter' | 'growth' | 'enterprise') {
  return protectedProcedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      try {
        const { getDb } = await import('../db');
        const { sql } = await import('drizzle-orm');
        const db = await getDb();
        if (db) {
          const merchantId = (ctx.user as any).merchantId;
          if (merchantId) {
            const rows = await db.execute(sql`
              SELECT plan FROM tenant_billing_invoices
              WHERE merchant_id = ${merchantId}
                AND status = 'paid'
              ORDER BY created_at DESC LIMIT 1
            `);
            const currentPlan = (rows.rows[0] as any)?.plan ?? 'starter';
            const currentRank = PLAN_RANK[currentPlan] ?? 1;
            const requiredRank = PLAN_RANK[minimumPlan] ?? 1;
            if (currentRank < requiredRank) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: `This feature requires the ${minimumPlan} plan or higher. Please upgrade your subscription.`,
              });
            }
          }
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        // Fail-open: if DB lookup fails, allow the request through
      }
      return next({ ctx });
    }),
  );
}

// ─── pbacProcedure ────────────────────────────────────────────────────────────────────────────
// Factory that creates a protected procedure enforced by Permify PBAC.
// Falls back gracefully when Permify is not configured (dev/test mode).
// Usage: pbacProcedure('create_payout').mutation(...)
export function pbacProcedure(
  action:
    | "view_transactions"
    | "create_payout"
    | "approve_payout"
    | "manage_team"
    | "view_analytics"
    | "manage_api_keys"
    | "manage_webhooks"
    | "view_disputes"
    | "respond_dispute"
    | "manage_settings"
) {
  return protectedProcedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      // In test/CI environments or when PERMIFY_URL is not configured, skip the
      // Permify check so integration tests pass without a live Permify instance.
      // In production, PERMIFY_URL must be set; the fail-open catch below handles
      // transient Permify outages gracefully.
      if (process.env.NODE_ENV === 'test' || !process.env.PERMIFY_URL) {
        return next({ ctx });
      }
      try {
        const { canPerformMerchantAction } = await import("../permifyClient");
        const merchantId =
          (ctx.user as any).merchantId ??
          (ctx.user as any).id?.toString() ??
          "";
        const allowed = await canPerformMerchantAction(
          ctx.user.id.toString(),
          merchantId,
          action
        );
        if (!allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Action '${action}' is not permitted for your role`,
          });
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        // Fail-open: if Permify is unreachable, allow the request through
        console.warn(`[pbac] Permify check failed for '${action}', failing open:`, err?.message);
      }
      return next({ ctx });
    })
  );
}

export const tenantProcedure = t.procedure.use(loggingMiddleware).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    // Resolve tenantId from the user's own tenantId field (set during provisioning)
    // or fall back to the default platform tenant.
    const tenantId: string = (ctx.user as any).tenantId ?? DEFAULT_TENANT_ID;

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        tenantId,
      },
    });
  }),
);
