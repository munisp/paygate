/**
 * splitPayments.ts — Split payments engine (Paystack /split parity + better).
 *
 * Money in bigint kobo. Percentages in basis points (10000 = 100%).
 * Allocations always sum EXACTLY to the transaction total — rounding
 * remainder goes to the main account (deterministic).
 *
 * Tables (drizzle/0095_refunds_splits.sql, accessed via raw SQL because
 * drizzle/schema.ts is owned by another work stream):
 *   split_groups, split_group_members
 * Settlement rows are written to the existing split_payments table (upgraded
 * in place with merchant_id + split_code columns).
 */

import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { dispatchWebhookEvent } from "../webhookEvents";
import { logger } from "../logger";

const TENANT_ID = "ten_default";
const PERCENTAGE_TOTAL_BPS = 10_000;

// ─── Webhook event constants ─────────────────────────────────────────────────
export const SPLIT_EVENTS = {
  applied: "split.applied",
} as const;

export const SPLIT_TYPES = ["percentage", "flat"] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

export const BEARER_TYPES = ["account", "subaccount", "all", "all_proportional"] as const;
export type BearerType = (typeof BEARER_TYPES)[number];

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SplitGroupRow {
  id: string;
  merchant_id: string;
  name: string;
  split_code: string;
  type: SplitType;
  currency: string;
  bearer_type: BearerType;
  bearer_subaccount_id: string | null;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SplitMemberRow {
  id: string;
  group_id: string;
  subaccount_ref: string;
  share: number;
  created_at: string;
}

export interface SplitPartyInput {
  ref: string;
  /** percentage: basis points (10000 = 100%); flat: kobo */
  share: number;
}

export interface ApplySplitInput {
  amountKobo: number;
  type: SplitType;
  bearerType: BearerType;
  bearerSubaccountRef?: string | null;
  subaccounts: SplitPartyInput[];
  /** Platform fee (kobo) computed by the fee engine; default 0. */
  feeKobo?: number;
  /**
   * Per-transaction override (Paystack `transaction_charge`): replaces
   * feeKobo as the total flat fee charged on this transaction.
   */
  transactionChargeKobo?: number;
}

export interface SplitAllocation {
  ref: string; // 'MAIN' for the merchant main account
  grossKobo: number;
  feeKobo: number;
  netKobo: number;
}

export interface ApplySplitResult {
  totalKobo: number;
  chargeKobo: number;
  bearerType: BearerType;
  allocations: SplitAllocation[];
}

// ─── Merchant scoping (same pattern as crud119.ts) ──────────────────────────
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant)
    throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

// ─── Pure split math ─────────────────────────────────────────────────────────
/**
 * Compute allocations for a payment. Deterministic: every party's share is
 * floored and ALL rounding remainder lands on the main account, so the
 * allocations always sum exactly to amountKobo.
 *
 * Bearer logic (Paystack parity):
 *   account          → main account bears the entire charge.
 *   subaccount       → bearerSubaccountRef bears the entire charge.
 *   all              → charge split evenly across every party (remainder → main).
 *   all_proportional → charge split pro-rata to gross allocations (remainder → main).
 */
export function applySplit(input: ApplySplitInput): ApplySplitResult {
  const { amountKobo, type, bearerType, subaccounts } = input;
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "amountKobo must be a positive integer" });
  }
  const charge = input.transactionChargeKobo ?? input.feeKobo ?? 0;
  if (charge < 0 || !Number.isInteger(charge)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "charge must be a non-negative integer kobo" });
  }

  // ── 1. Gross allocations (floored) ────────────────────────────────────────
  let gross: number[];
  if (type === "percentage") {
    const totalBps = subaccounts.reduce((a, s) => a + s.share, 0);
    if (totalBps > PERCENTAGE_TOTAL_BPS) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Percentage shares sum to ${totalBps}bps (> ${PERCENTAGE_TOTAL_BPS}bps = 100%)`,
      });
    }
    gross = subaccounts.map((s) => Math.floor((amountKobo * s.share) / PERCENTAGE_TOTAL_BPS));
  } else {
    const totalFlat = subaccounts.reduce((a, s) => a + s.share, 0);
    if (totalFlat > amountKobo) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Flat shares sum to ${totalFlat}k which exceeds the transaction amount ${amountKobo}k`,
      });
    }
    gross = subaccounts.map((s) => s.share);
  }
  const subsGrossTotal = gross.reduce((a, b) => a + b, 0);
  const mainGross = amountKobo - subsGrossTotal; // absorbs rounding remainder

  // ── 2. Charge distribution across parties (index n = main) ───────────────
  const n = subaccounts.length;
  const feeShares = new Array<number>(n + 1).fill(0);
  if (charge > 0) {
    if (bearerType === "account") {
      feeShares[n] = charge;
    } else if (bearerType === "subaccount") {
      const idx = subaccounts.findIndex((s) => s.ref === input.bearerSubaccountRef);
      if (idx === -1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `bearer_type=subaccount requires bearerSubaccountRef matching a member (got '${input.bearerSubaccountRef ?? "none"}')`,
        });
      }
      feeShares[idx] = charge;
    } else if (bearerType === "all") {
      const each = Math.floor(charge / (n + 1));
      for (let i = 0; i <= n; i++) feeShares[i] = each;
      feeShares[n] += charge - each * (n + 1); // remainder → main
    } else {
      // all_proportional — pro-rata to gross, remainder → main
      const weights = [...gross, mainGross];
      const weightTotal = weights.reduce((a, b) => a + b, 0);
      let assigned = 0;
      for (let i = 0; i <= n; i++) {
        feeShares[i] = weightTotal === 0 ? 0 : Math.floor((charge * weights[i]) / weightTotal);
        assigned += feeShares[i];
      }
      feeShares[n] += charge - assigned;
    }
  }

  // ── 3. Net amounts; clamp at zero ─────────────────────────────────────────
  // The charge is deducted from its bearer(s) and credited to the MAIN account
  // (the platform/main account collects transaction charges), so allocations
  // always sum EXACTLY to amountKobo: main is the residual sink.
  const allocations: SplitAllocation[] = [];
  let subsNetTotal = 0;
  for (let i = 0; i < n; i++) {
    const fee = feeShares[i];
    const net = Math.max(0, gross[i] - fee);
    subsNetTotal += net;
    allocations.push({ ref: subaccounts[i].ref, grossKobo: gross[i], feeKobo: fee, netKobo: net });
  }
  const mainFee = feeShares[n];
  const mainNet = mainGross - mainFee + charge;
  if (mainNet < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        `Charge ${charge}k plus subaccount shares exceed the transaction amount ` +
        `${amountKobo}k — split cannot be applied without driving the main account negative`,
    });
  }
  allocations.push({ ref: "MAIN", grossKobo: mainGross, feeKobo: mainFee, netKobo: mainNet });

  return { totalKobo: amountKobo, chargeKobo: charge, bearerType, allocations };
}

/** Validation used by createGroup/addMember: percentage groups must total 10000bps. */
export function validatePercentageSum(members: SplitPartyInput[]): void {
  const total = members.reduce((a, m) => a + m.share, 0);
  if (total !== PERCENTAGE_TOTAL_BPS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Percentage split members must sum to ${PERCENTAGE_TOTAL_BPS}bps (100%); got ${total}bps`,
    });
  }
}

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function getGroupForMerchant(
  db: any,
  merchantId: string,
  idOrCode: string,
): Promise<SplitGroupRow | null> {
  const res = await db.execute(sql`
    SELECT * FROM split_groups
    WHERE merchant_id = ${merchantId}
      AND (id = ${idOrCode} OR split_code = ${idOrCode})
    LIMIT 1
  `);
  return (res.rows[0] as unknown as SplitGroupRow | undefined) ?? null;
}

async function listMembers(db: any, groupId: string): Promise<SplitMemberRow[]> {
  const res = await db.execute(sql`
    SELECT * FROM split_group_members WHERE group_id = ${groupId} ORDER BY created_at ASC, id ASC
  `);
  return res.rows as unknown as SplitMemberRow[];
}

async function emitSplitAppliedEvent(
  merchantId: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await dispatchWebhookEvent({
      event: SPLIT_EVENTS.applied as any,
      id: `evt_${crypto.randomBytes(10).toString("hex")}`,
      tenantId: TENANT_ID,
      merchantId,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (err: any) {
    logger.error("split.applied webhook dispatch failed", { err });
  }
}

/**
 * recordSplitSettlement — write split_payments rows when a payment carrying a
 * split_code succeeds. Exported for orchestrator wiring (hostedCheckout calls
 * this post-success) and used directly by tests. Fails loud: unknown/inactive
 * split code → NOT_FOUND, never a silent skip.
 */
export async function recordSplitSettlement(opts: {
  merchantId: string;
  splitCode: string;
  reference: string;
  amountKobo: number;
  feeKobo?: number;
  transactionChargeKobo?: number;
}): Promise<{ splitPaymentId: string; result: ApplySplitResult }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

  const group = await getGroupForMerchant(db, opts.merchantId, opts.splitCode);
  if (!group || !group.active) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Active split group '${opts.splitCode}' not found for this merchant`,
    });
  }
  const members = await listMembers(db, group.id);
  const result = applySplit({
    amountKobo: opts.amountKobo,
    type: group.type,
    bearerType: group.bearer_type,
    bearerSubaccountRef: group.bearer_subaccount_id,
    subaccounts: members.map((m) => ({ ref: m.subaccount_ref, share: Number(m.share) })),
    feeKobo: opts.feeKobo,
    transactionChargeKobo: opts.transactionChargeKobo,
  });

  const splitPaymentId = `sp_${crypto.randomBytes(12).toString("hex")}`;
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO split_payments (
      split_payment_id, split_rule_id, merchant_id, split_code,
      total_amount_kobo, reference, legs, status, created_at, updated_at
    ) VALUES (
      ${splitPaymentId}, ${group.id}, ${opts.merchantId}, ${group.split_code},
      ${opts.amountKobo}, ${opts.reference}, ${JSON.stringify(result.allocations)},
      'completed', ${now}, ${now}
    )
  `);

  await emitSplitAppliedEvent(opts.merchantId, {
    split_payment_id: splitPaymentId,
    split_code: group.split_code,
    reference: opts.reference,
    total_kobo: result.totalKobo,
    charge_kobo: result.chargeKobo,
    allocations: result.allocations,
  });
  return { splitPaymentId, result };
}

// ─── Validation schemas ──────────────────────────────────────────────────────
const memberInput = z.object({
  ref: z.string().min(1),
  share: z.number().int().positive(),
});

const dynamicSplitInput = z.object({
  type: z.enum(SPLIT_TYPES),
  bearer_type: z.enum(BEARER_TYPES),
  bearer_subaccount_ref: z.string().optional(),
  subaccounts: z.array(memberInput).min(1),
});

// ─── Router ──────────────────────────────────────────────────────────────────
export const splitEngineRouter = router({
  createGroup: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        type: z.enum(SPLIT_TYPES),
        currency: z.string().length(3).default("NGN"),
        bearerType: z.enum(BEARER_TYPES).default("account"),
        bearerSubaccountRef: z.string().optional(),
        members: z.array(memberInput).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      if (input.type === "percentage") validatePercentageSum(input.members);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const groupId = `spg_${crypto.randomBytes(12).toString("hex")}`;
      const splitCode = `SPL_${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
      const now = new Date().toISOString();
      const res = await db.execute(sql`
        INSERT INTO split_groups (
          id, merchant_id, name, split_code, type, currency,
          bearer_type, bearer_subaccount_id, active, created_at, updated_at
        ) VALUES (
          ${groupId}, ${merchantId}, ${input.name}, ${splitCode}, ${input.type},
          ${input.currency}, ${input.bearerType}, ${input.bearerSubaccountRef ?? null},
          true, ${now}, ${now}
        )
        RETURNING *
      `);
      const group = res.rows[0] as unknown as SplitGroupRow;
      for (const m of input.members) {
        await db.execute(sql`
          INSERT INTO split_group_members (id, group_id, subaccount_ref, share, created_at)
          VALUES (${`spm_${crypto.randomBytes(12).toString("hex")}`}, ${groupId}, ${m.ref}, ${m.share}, ${now})
        `);
      }
      return { ...group, members: await listMembers(db, groupId) };
    }),

  listGroups: protectedProcedure
    .input(
      z.object({
        active: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const res = await db.execute(sql`
        SELECT * FROM split_groups
        WHERE merchant_id = ${merchantId}
          ${input.active === undefined ? sql`` : sql`AND active = ${input.active}`}
          ${input.cursor ? sql`AND id > ${input.cursor}` : sql``}
        ORDER BY id ASC
        LIMIT ${input.limit + 1}
      `);
      const rows = res.rows as unknown as SplitGroupRow[];
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
    }),

  getGroup: protectedProcedure
    .input(z.object({ idOrCode: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const group = await getGroupForMerchant(db, merchantId, input.idOrCode);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Split group not found" });
      return { ...group, members: await listMembers(db, group.id) };
    }),

  updateGroup: protectedProcedure
    .input(
      z.object({
        idOrCode: z.string().min(1),
        name: z.string().min(1).max(200).optional(),
        active: z.boolean().optional(),
        bearerType: z.enum(BEARER_TYPES).optional(),
        bearerSubaccountRef: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const group = await getGroupForMerchant(db, merchantId, input.idOrCode);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Split group not found" });

      const next = {
        name: input.name ?? group.name,
        active: input.active ?? group.active,
        bearer_type: input.bearerType ?? group.bearer_type,
        bearer_subaccount_id:
          input.bearerSubaccountRef === undefined
            ? group.bearer_subaccount_id
            : input.bearerSubaccountRef,
      };
      const res = await db.execute(sql`
        UPDATE split_groups SET
          name = ${next.name}, active = ${next.active},
          bearer_type = ${next.bearer_type},
          bearer_subaccount_id = ${next.bearer_subaccount_id},
          updated_at = ${new Date().toISOString()}
        WHERE id = ${group.id} AND merchant_id = ${merchantId}
        RETURNING *
      `);
      return { ...(res.rows[0] as unknown as SplitGroupRow), members: await listMembers(db, group.id) };
    }),

  addMember: protectedProcedure
    .input(z.object({ idOrCode: z.string().min(1), member: memberInput }))
    .mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const group = await getGroupForMerchant(db, merchantId, input.idOrCode);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Split group not found" });

      const existing = await listMembers(db, group.id);
      const others = existing.filter((m) => m.subaccount_ref !== input.member.ref);
      const nextMembers = [
        ...others.map((m) => ({ ref: m.subaccount_ref, share: Number(m.share) })),
        input.member,
      ];
      if (group.type === "percentage") {
        // Groups are created with exactly 10000bps; incremental edits only
        // forbid overshooting 100% (a group mid-edit may legitimately be < 100%).
        const totalBps = nextMembers.reduce((a, m) => a + m.share, 0);
        if (totalBps > PERCENTAGE_TOTAL_BPS) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Percentage split members would total ${totalBps}bps (> ${PERCENTAGE_TOTAL_BPS}bps = 100%)`,
          });
        }
      }

      // Upsert semantics: add or update the share for this subaccount.
      await db.execute(sql`
        INSERT INTO split_group_members (id, group_id, subaccount_ref, share, created_at)
        VALUES (${`spm_${crypto.randomBytes(12).toString("hex")}`}, ${group.id},
                ${input.member.ref}, ${input.member.share}, ${new Date().toISOString()})
        ON CONFLICT (group_id, subaccount_ref) DO UPDATE SET share = EXCLUDED.share
      `);
      return { ...group, members: await listMembers(db, group.id) };
    }),

  removeMember: protectedProcedure
    .input(z.object({ idOrCode: z.string().min(1), ref: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const group = await getGroupForMerchant(db, merchantId, input.idOrCode);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Split group not found" });
      await db.execute(sql`
        DELETE FROM split_group_members
        WHERE group_id = ${group.id} AND subaccount_ref = ${input.ref}
      `);
      return { ...group, members: await listMembers(db, group.id) };
    }),

  /** Soft delete — groups with settlement history are deactivated, never dropped. */
  deleteGroup: protectedProcedure
    .input(z.object({ idOrCode: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const group = await getGroupForMerchant(db, merchantId, input.idOrCode);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Split group not found" });
      await db.execute(sql`
        UPDATE split_groups SET active = false, updated_at = ${new Date().toISOString()}
        WHERE id = ${group.id} AND merchant_id = ${merchantId}
      `);
      return { id: group.id, splitCode: group.split_code, active: false };
    }),

  previewSplit: protectedProcedure
    .input(
      z.object({
        amountKobo: z.number().int().positive(),
        /** Existing group by id / SPL_ code … */
        splitCode: z.string().optional(),
        /** … or a fully dynamic split object (Paystack parity). */
        dynamic: dynamicSplitInput.optional(),
        feeKobo: z.number().int().min(0).optional(),
        transactionChargeKobo: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      if (!input.splitCode && !input.dynamic) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide either splitCode (existing group) or a dynamic split object",
        });
      }

      let splitInput: ApplySplitInput;
      if (input.dynamic) {
        if (input.dynamic.type === "percentage") {
          validatePercentageSum(input.dynamic.subaccounts);
        }
        splitInput = {
          amountKobo: input.amountKobo,
          type: input.dynamic.type,
          bearerType: input.dynamic.bearer_type,
          bearerSubaccountRef: input.dynamic.bearer_subaccount_ref ?? null,
          subaccounts: input.dynamic.subaccounts,
          feeKobo: input.feeKobo,
          transactionChargeKobo: input.transactionChargeKobo,
        };
      } else {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const group = await getGroupForMerchant(db, merchantId, input.splitCode!);
        if (!group || !group.active) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Active split group '${input.splitCode}' not found` });
        }
        const members = await listMembers(db, group.id);
        splitInput = {
          amountKobo: input.amountKobo,
          type: group.type,
          bearerType: group.bearer_type,
          bearerSubaccountRef: group.bearer_subaccount_id,
          subaccounts: members.map((m) => ({ ref: m.subaccount_ref, share: Number(m.share) })),
          feeKobo: input.feeKobo,
          transactionChargeKobo: input.transactionChargeKobo,
        };
      }
      return applySplit(splitInput);
    }),
});

export type SplitEngineRouter = typeof splitEngineRouter;
