// server/routers/syndicationAp.ts
// P2-b Syndication packaging for the AP suite (Melio-inspired, white-label
// partners embed PayGate AP under their own brand).
//
// Procedures: getPartnerApConfig (per-tenant AP feature flags + branding),
// setPartnerApConfig (platform-admin gated flag provisioning), rotatePartnerKey
// (tenant_api_keys rotation — raw key returned exactly once, only the sha256
// hash is stored), getPartnerUsage (per-day AP usage metering for rev-share,
// computed on the fly from ap_* tables).
//
// Conventions (IMPLEMENTATION_SPEC_MELIO.md §D1–D8, §P2-b):
// - tenant resolution copies the existing pattern: ctx.user.tenantId
//   (crud120.ts — the same file that hosts featureFlagsRouter)
// - feature flags live in the SAME store featureFlagsRouter uses
//   (feature_flags table, crud120.ts:1020). NOTE on flag granularity:
//   feature_flags.key is globally UNIQUE, so one row cannot exist per tenant
//   per flag. Per-tenant enablement therefore rides the store's targeting
//   columns: a flag is ON for a tenant when the row is enabled and either
//   (a) target_merchant_ids lists the tenant id, or (b) there is no target
//   list and rollout is 100%. feature_flags.tenant_id (per-tenant override
//   row) is honoured on read when present. This is documented here because
//   the flags are global-with-targeting, not per-merchant rows.
// - admin writes are gated by a DB re-check of users.role === 'admin' —
//   the exact platformAdminProcedure gate featureFlagsRouter uses for writes
//   (crud120.ts:174), the admin-equivalent of pbacProcedure('approve_payout')
// - no new public REST server: partners call /trpc with their tenant API key
//   (wave221 developer API keys + PBAC scopes 'ap_bills.create'/'ap_bills.read')
// - usage metering: tenant_usage_metrics was evaluated and REJECTED for AP
//   rev-share metering — its tx_volume is float32 (lossy for kobo amounts),
//   it has no per-day granularity, and its counters are generic (api calls,
//   storage), not AP-specific. Usage is therefore computed on the fly from
//   ap_bills / ap_payments / accounting_sync_runs; NO new tables are created.

import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { eq, and, or, gte, lt, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { db, getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import {
  featureFlags,
  tenants,
  tenantApiKeys,
  merchants,
  users,
  apBills,
  apPayments,
  accountingConnections,
  accountingSyncRuns,
} from "../../drizzle/schema";
import { auditLog, buildAuditEntry } from "../auditTrail";

// ─── Constants ────────────────────────────────────────────────────────────────

/** AP suite feature-flag keys (feature_flags.key) exposed to partner tenants. */
export const AP_FLAG_KEYS = {
  apBillPayEnabled: "ap_bill_pay_enabled",
  apInboxEnabled: "ap_inbox_enabled",
  payOverTimeEnabled: "ap_pay_over_time_enabled",
  accountingSyncEnabled: "ap_accounting_sync_enabled",
} as const;

type ApFlagName = keyof typeof AP_FLAG_KEYS;

/** PBAC scopes partners receive on rotated AP keys (wave221 developer keys model). */
const AP_PARTNER_SCOPES = ["ap_bills.create", "ap_bills.read"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Throws FORBIDDEN unless the caller's users.role is 'admin' (DB-checked — the
 *  exact gate featureFlagsRouter uses for flag writes, crud120.ts:166). */
async function requirePlatformAdmin(dbConn: Db, openId: string): Promise<void> {
  const [caller] = await dbConn
    .select({ role: users.role })
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  if (!caller || caller.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform admin access required" });
  }
}

/** Platform-admin-gated procedure (copies crud120.ts:174 platformAdminProcedure). */
const platformAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const dbConn = await getDb();
  if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  await requirePlatformAdmin(dbConn, ctx.user.openId);
  return next({ ctx });
});

/**
 * Resolve the caller's tenant. Copies the tenant resolution used across
 * crud120.ts: tenant identity comes from ctx.user.tenantId, never from client
 * input. Falls back to the caller's own merchant's tenant for merchant users.
 */
async function resolveTenantId(ctx: { user: { openId: string; tenantId?: string | null } }): Promise<string> {
  const direct = ctx.user.tenantId;
  if (direct) return direct;
  const user = await getUserByOpenId(ctx.user.openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required (no tenant on user, no merchant owned)" });
  }
  return merchant.tenantId;
}

function parseTargets(targetMerchantIds: string | null): string[] {
  return targetMerchantIds ? targetMerchantIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Deterministic flag evaluation for a tenant (featureFlagsRouter.evaluate uses
 * Math.random() for percentage rollout — partner config must be stable, so a
 * sub-100% rollout without explicit targeting evaluates to OFF here).
 */
function evaluateFlagForTenant(
  rows: { enabled: boolean; rolloutPercentage: number; targetMerchantIds: string | null; tenantId: string | null }[],
  tenantId: string,
): boolean {
  // Per-tenant override row (feature_flags.tenant_id) wins over the global row.
  const row = rows.find((r) => r.tenantId === tenantId) ?? rows.find((r) => r.tenantId == null) ?? rows[0];
  if (!row || !row.enabled) return false;
  const targets = parseTargets(row.targetMerchantIds);
  if (targets.length > 0) return targets.includes(tenantId);
  return row.rolloutPercentage >= 100;
}

/** Read all AP flag rows relevant to a tenant (global + tenant overrides). */
async function readApFlagRows(tenantId: string) {
  const rows = await db
    .select()
    .from(featureFlags)
    .where(and(
      inArray(featureFlags.key, Object.values(AP_FLAG_KEYS)),
      or(isNull(featureFlags.tenantId), eq(featureFlags.tenantId, tenantId)),
    ));
  return rows;
}

function groupRowsByKey<T extends { key: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.key) ?? [];
    list.push(row);
    map.set(row.key, list);
  }
  return map;
}

/** sha256-hash an API key — copies the wave221 generateApiKey storage pattern
 *  (raw returned once, sha256 hash + display prefix stored, raw NEVER stored). */
function generatePartnerKey(): { raw: string; prefix: string; hash: string } {
  const raw = `pk_ap_${randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, 16);
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

/** [start, end) UTC bounds for a 'YYYY-MM' period. */
export function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function dayKey(d: Date | string): string {
  return (typeof d === "string" ? new Date(d) : d).toISOString().slice(0, 10);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const syndicationApRouter = router({
  /**
   * Partner-facing AP config: which AP features are enabled for the caller's
   * tenant plus the tenant's white-label branding (tenants table columns, the
   * same source whiteLabelRouter uses).
   */
  getPartnerApConfig: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = await resolveTenantId(ctx);
    const rows = await readApFlagRows(tenantId);
    const byKey = groupRowsByKey(rows);

    const flags = Object.fromEntries(
      (Object.keys(AP_FLAG_KEYS) as ApFlagName[]).map((name) => [
        name,
        evaluateFlagForTenant(byKey.get(AP_FLAG_KEYS[name]) ?? [], tenantId),
      ]),
    ) as Record<ApFlagName, boolean>;

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(or(eq(tenants.id, tenantId), eq(tenants.slug, tenantId)))
      .limit(1);

    return {
      tenantId,
      ...flags,
      branding: tenant
        ? {
            name: tenant.name,
            logoUrl: tenant.logoUrl,
            primaryColor: tenant.primaryColor,
            accentColor: tenant.accentColor,
            secondaryColor: tenant.secondaryColor,
            fontFamily: tenant.fontFamily,
            faviconUrl: tenant.faviconUrl,
            footerText: tenant.footerText,
            supportEmail: tenant.supportEmail,
            customDomain: tenant.customDomain,
          }
        : null,
    };
  }),

  /**
   * Provision AP flags for a tenant. Platform-admin gated (same DB re-check
   * featureFlagsRouter uses for writes). Enable = add the tenant to the flag
   * row's target list (creating the row if missing); disable = remove it.
   * Updates are guarded (UPDATE ... WHERE id RETURNING; empty result → the row
   * changed under us and we fail loudly instead of writing blind).
   *
   * Limitation (documented per spec): a flag that is globally ON (enabled,
   * rollout 100%, no target list) cannot be turned OFF for a single tenant via
   * targetMerchantIds — the admin must first restrict the flag (rollout < 100
   * or an explicit target list). Global flags are platform policy.
   */
  setPartnerApConfig: platformAdminProcedure
    .input(z.object({
      tenantId: z.string().min(1).optional(),
      flags: z.object({
        apBillPayEnabled: z.boolean().optional(),
        apInboxEnabled: z.boolean().optional(),
        payOverTimeEnabled: z.boolean().optional(),
        accountingSyncEnabled: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const applied: Record<string, boolean> = {};

      for (const name of Object.keys(AP_FLAG_KEYS) as ApFlagName[]) {
        const desired = input.flags[name];
        if (desired === undefined) continue;
        const key = AP_FLAG_KEYS[name];
        const rows = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
        const row = rows.find((r) => r.tenantId === tenantId) ?? rows.find((r) => r.tenantId == null) ?? rows[0];

        if (!row) {
          if (!desired) { applied[name] = false; continue; } // already off everywhere
          await db.insert(featureFlags).values({
            key,
            name: `AP suite: ${name}`,
            description: `AP syndication flag '${name}' (provisioned by syndicationAp.setPartnerApConfig)`,
            enabled: true,
            rolloutPercentage: 100,
            targetMerchantIds: tenantId,
            category: "ap_suite",
          });
          applied[name] = true;
          continue;
        }

        const targets = parseTargets(row.targetMerchantIds);
        const nextTargets = desired
          ? [...new Set([...targets, tenantId])]
          : targets.filter((t) => t !== tenantId);
        const [updated] = await db
          .update(featureFlags)
          .set({
            enabled: desired ? true : row.enabled,
            targetMerchantIds: nextTargets.length > 0 ? nextTargets.join(",") : null,
            updatedAt: new Date(),
          })
          .where(eq(featureFlags.id, row.id))
          .returning();
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Feature flag '${key}' changed concurrently — retry`,
          });
        }
        applied[name] = desired;
      }

      await auditLog(buildAuditEntry(ctx, tenantId, "syndication.ap.config.update", "tenant", tenantId, {
        flags: input.flags,
        applied,
      }));

      return { tenantId, applied };
    }),

  /**
   * Rotate the partner AP API key for a tenant. Copies the tenant_api_keys /
   * wave221 storage pattern: 32 random bytes hex with a 'pk_ap_' prefix, only
   * the sha256 hash (+ display prefix) is stored, the previous active key is
   * revoked in the same call, and the raw key is returned EXACTLY ONCE in this
   * response — it is unrecoverable afterwards.
   */
  rotatePartnerKey: platformAdminProcedure
    .input(z.object({ tenantId: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId ?? (await resolveTenantId(ctx));
      const { raw, prefix, hash } = generatePartnerKey();

      // Revoke every currently-active key for the tenant (guarded: only rows
      // that are still active are touched).
      await db
        .update(tenantApiKeys)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(tenantApiKeys.tenantId, tenantId), eq(tenantApiKeys.isActive, true)));

      await db.insert(tenantApiKeys).values({
        tenantId,
        name: "ap-partner-api-key",
        keyPrefix: prefix,
        keyHash: hash,
        permissions: 1,
        scopes: [...AP_PARTNER_SCOPES],
        environment: "production",
        isActive: true,
      });

      await auditLog(buildAuditEntry(ctx, tenantId, "syndication.ap.key.rotate", "tenant_api_key", prefix, {
        tenantId,
        keyPrefix: prefix,
        scopes: [...AP_PARTNER_SCOPES],
      }));

      // Raw key is returned ONCE — only the hash is persisted.
      return { tenantId, raw, prefix, scopes: [...AP_PARTNER_SCOPES] };
    }),

  /**
   * AP usage metering for rev-share reporting, grouped by day. Computed ON THE
   * FLY from ap_bills / ap_payments / accounting_sync_runs for all merchants
   * under the caller's tenant (see header for why tenant_usage_metrics was
   * rejected — no metering table fits and none is created).
   */
  getPartnerUsage: protectedProcedure
    .input(z.object({
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = await resolveTenantId(ctx);
      const period = input?.period ?? new Date().toISOString().slice(0, 7);
      const { start, end } = periodBounds(period);

      const merchantRows = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.tenantId, tenantId));
      const merchantIds = merchantRows.map((r) => r.id);

      const days = new Map<string, {
        date: string;
        billsCreated: number;
        billVolumeKobo: number;
        paymentsCompleted: number;
        paymentVolumeKobo: number;
        syncRunsSucceeded: number;
      }>();
      const bucket = (date: Date | string) => {
        const k = dayKey(date);
        let b = days.get(k);
        if (!b) {
          b = { date: k, billsCreated: 0, billVolumeKobo: 0, paymentsCompleted: 0, paymentVolumeKobo: 0, syncRunsSucceeded: 0 };
          days.set(k, b);
        }
        return b;
      };

      if (merchantIds.length > 0) {
        const billRows = await db
          .select({ totalKobo: apBills.totalKobo, createdAt: apBills.createdAt })
          .from(apBills)
          .where(and(
            inArray(apBills.merchantId, merchantIds),
            gte(apBills.createdAt, start),
            lt(apBills.createdAt, end),
          ));
        for (const r of billRows) {
          const b = bucket(r.createdAt);
          b.billsCreated += 1;
          b.billVolumeKobo += r.totalKobo ?? 0;
        }

        const paymentRows = await db
          .select({ amountKobo: apPayments.amountKobo, createdAt: apPayments.createdAt })
          .from(apPayments)
          .where(and(
            inArray(apPayments.merchantId, merchantIds),
            eq(apPayments.status, "completed"),
            gte(apPayments.createdAt, start),
            lt(apPayments.createdAt, end),
          ));
        for (const r of paymentRows) {
          const b = bucket(r.createdAt);
          b.paymentsCompleted += 1;
          b.paymentVolumeKobo += r.amountKobo ?? 0;
        }

        // Sync runs carry no merchant_id — scoped via their connection.
        const syncRows = await db
          .select({ startedAt: accountingSyncRuns.startedAt })
          .from(accountingSyncRuns)
          .innerJoin(accountingConnections, eq(accountingSyncRuns.connectionId, accountingConnections.id))
          .where(and(
            inArray(accountingConnections.merchantId, merchantIds),
            eq(accountingSyncRuns.status, "succeeded"),
            gte(accountingSyncRuns.startedAt, start),
            lt(accountingSyncRuns.startedAt, end),
          ));
        for (const r of syncRows) {
          bucket(r.startedAt).syncRunsSucceeded += 1;
        }
      }

      const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
      const totals = dayList.reduce(
        (acc, d) => ({
          billsCreated: acc.billsCreated + d.billsCreated,
          billVolumeKobo: acc.billVolumeKobo + d.billVolumeKobo,
          paymentsCompleted: acc.paymentsCompleted + d.paymentsCompleted,
          paymentVolumeKobo: acc.paymentVolumeKobo + d.paymentVolumeKobo,
          syncRunsSucceeded: acc.syncRunsSucceeded + d.syncRunsSucceeded,
        }),
        { billsCreated: 0, billVolumeKobo: 0, paymentsCompleted: 0, paymentVolumeKobo: 0, syncRunsSucceeded: 0 },
      );

      return { tenantId, period, days: dayList, totals };
    }),
});

/** Exported for unit tests (hostedCheckout.test.ts internals pattern). */
export const __syndicationApInternals = {
  AP_FLAG_KEYS,
  evaluateFlagForTenant,
  periodBounds,
  generatePartnerKey,
};
