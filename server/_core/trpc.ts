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
