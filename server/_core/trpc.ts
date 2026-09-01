import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { trace, context as otelContext, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { TrpcContext } from "./context";
import { setTenantAttrs } from "../tracing";
import { recordTrpcCall } from "../metrics";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

// ─── Telemetry middleware ─────────────────────────────────────────────────────
// Applied to EVERY procedure (public/protected/admin/pbac). Creates a span
// `trpc.<path>` (SERVER kind), stamps tenant attributes when known, and
// records the call in Prometheus on completion. Telemetry is wrapped so a
// tracing/metrics failure can never break a request, and original errors are
// always re-thrown unchanged (never swallowed).

const telemetryMiddleware = t.middleware(async ({ ctx, next, path }) => {
  const start = Date.now();
  let span: ReturnType<ReturnType<typeof trace.getTracer>["startSpan"]> | undefined;
  try {
    span = trace
      .getTracer("paygate-trpc")
      .startSpan(`trpc.${path}`, { kind: SpanKind.SERVER });
    setTenantAttrs(span, ctx);
  } catch (err) {
    console.warn("[otel] trpc span start failed:", err instanceof Error ? err.message : err);
    span = undefined;
  }

  const finish = (ok: boolean) => {
    try {
      recordTrpcCall(path, ok ? "success" : "error", Date.now() - start);
    } catch (err) {
      console.warn("[metrics] recordTrpcCall failed:", err instanceof Error ? err.message : err);
    }
    try {
      span?.end();
    } catch {
      // ignore — span.end must never break a request
    }
  };

  const run = async () => {
    try {
      const result = await next();
      if (!result.ok) throw result.error;
      finish(true);
      return result;
    } catch (err) {
      // Mark the span, record the failure metric, then re-throw the original
      // error unchanged — telemetry must never swallow or alter errors.
      try {
        if (err instanceof TRPCError) {
          span?.setStatus({ code: SpanStatusCode.ERROR, message: err.code });
          span?.setAttribute("paygate.trpc_error_code", err.code);
        } else {
          span?.setStatus({ code: SpanStatusCode.ERROR });
        }
        span?.recordException?.(err as Error);
      } catch {
        // ignore — telemetry must never break a request
      }
      finish(false);
      throw err;
    }
  };

  if (!span) return run();
  return otelContext.with(trace.setSpan(otelContext.active(), span), run);
});

const baseProcedure = t.procedure.use(telemetryMiddleware);

export const router = t.router;
export const publicProcedure = baseProcedure;

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

export const protectedProcedure = baseProcedure.use(requireUser);

export const adminProcedure = baseProcedure.use(
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

// ─── PBAC procedure ───────────────────────────────────────────────────────────
//
// Named-permission → (resource, action) map enforced by server/pbac.ts
// (Permify with a local role-matrix fallback). FAIL CLOSED:
//  - unknown permission name → FORBIDDEN thrown at procedure-build time
//  - permission backend error → deny (FORBIDDEN)

const PBAC_PERMISSION_MAP = {
  create_payout: { resource: "payout", action: "initiate" },
  approve_payout: { resource: "payout", action: "approve" },
  reject_payout: { resource: "payout", action: "reject" },
  manage_api_keys: { resource: "api_key", action: "create" },
  revoke_api_keys: { resource: "api_key", action: "revoke" },
  manage_webhooks: { resource: "webhook", action: "create" },
  initiate_transaction: { resource: "transaction", action: "initiate" },
  export_transactions: { resource: "transaction", action: "export" },
  manage_virtual_cards: { resource: "virtual_card", action: "create" },
  trigger_settlement: { resource: "settlement", action: "trigger" },
  // Billing engine (tenant fee configs, DFSP fee tiers, invoices) — admin/finance.
  view_billing: { resource: "billing", action: "view" },
  manage_billing: { resource: "billing", action: "manage" },
  // Chargeback lifecycle (evidence, escalation, timeline) — admin/finance.
  view_chargebacks: { resource: "chargeback", action: "view" },
  manage_chargebacks: { resource: "chargeback", action: "manage" },
} as const;

export type PbacPermission = keyof typeof PBAC_PERMISSION_MAP;

export function pbacProcedure(permission: PbacPermission | (string & {})) {
  const mapping = (PBAC_PERMISSION_MAP as Record<string, { resource: string; action: string }>)[permission];
  if (!mapping) {
    // Fail closed at build time — an unknown permission name is a
    // programming error and must never silently pass.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Unknown PBAC permission: ${String(permission)}`,
    });
  }
  return protectedProcedure.use(async ({ ctx, next }) => {
    const user = ctx.user;
    try {
      // Lazy import to avoid a module cycle (pbac.ts imports protectedProcedure).
      const { requirePermission } = await import("../pbac");
      await requirePermission(
        String(user.id),
        (user as { role?: string }).role ?? "user",
        mapping.resource as never,
        mapping.action,
      );
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      // Backend error (Permify down, matrix failure, …) → deny.
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission check failed for ${String(permission)}`,
      });
    }
    return next({ ctx });
  });
}
