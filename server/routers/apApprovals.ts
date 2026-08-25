/**
 * apApprovals.ts — P1-a AP bill approval rules engine (Melio-inspired AP suite)
 *
 * Router: apApprovalsRouter
 *  - createRule / updateRule / deleteRule / listRules — CRUD on
 *    ap_bill_approval_rules (writes gated by pbacProcedure('approve_payout')).
 *  - submitForApproval — guarded flip draft|extracted → pending_approval,
 *    evaluates the approval chain, inserts ap_bill_approvals rows, notifies
 *    approvers (merchant_notifications + email, non-fatal), auditLog + Kafka
 *    paygate.ap.bills (non-fatal).
 *  - approveStep / rejectStep — maker-checker decisions. Approver identity is
 *    taken ONLY from ctx.user.id (never from client input); maker ≠ checker
 *    (bill.createdBy ≠ approver). Guarded UPDATE ... WHERE status='pending'
 *    RETURNING (empty → CONFLICT). Last-step approval flips the bill →
 *    approved; rejection flips it → rejected and notifies the creator.
 *  - batchApprove — per-bill isolated try/catch inside one request; each bill
 *    decided in its own transaction; returns {billId, ok, error?}[].
 *  - approvalQueue — bills in pending_approval where ctx.user.id holds a
 *    pending step (join ap_bill_approvals), merchant scoped.
 *
 * Pure internals exported as __approvalInternals (see evaluateApprovalChain).
 * Maker-checker pattern reference: server/wave30Router.ts (payout approvals).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { router, protectedProcedure, pbacProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import {
  apBills,
  apBillApprovalRules,
  apBillApprovals,
  merchantNotifications,
  users,
} from "../../drizzle/schema";
import { auditLog } from "../auditTrail";
import { sendEmail } from "../emailService";
import { publishEvent } from "../kafkaClient";
import { logger } from "../logger";

type DbHandle = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// ─── Merchant resolution (server-side session only — never client input) ─────
// Same pattern as crud119.ts resolveMerchantId.
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

async function resolveMerchantOwnerId(openId: string): Promise<{ merchantId: string; ownerId: number }> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return { merchantId: merchant.id, ownerId: merchant.ownerId };
}

async function requireDb(): Promise<DbHandle> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ─── Pure approval-chain evaluation ──────────────────────────────────────────

export interface ApprovalRuleShape {
  id?: number | null;
  priority?: number | null;
  minAmountKobo?: number | null;
  maxAmountKobo?: number | null;
  vendorId?: string | null;
  approverRole?: string | null;
  approverUserId?: number | null;
  requiredApprovals?: number | null;
  isActive?: boolean | null;
}

export interface ApprovalStep {
  step: number;                    // 1-based, ordered by rule priority
  ruleId: number | null;
  approverUserId: number | null;   // null → resolved to merchant owner at submit time
  approverRole: string | null;
  requiredApprovals: number;
}

/**
 * evaluateApprovalChain — PURE.
 * Given a bill ({totalKobo, vendorId}) and the merchant's rules, return the
 * ordered approver steps: rules filtered by isActive + amount range
 * (minAmountKobo ≤ total ≤ maxAmountKobo, null bounds = unbounded) + vendor
 * match (null rule vendorId = wildcard), sorted by priority ASC (ties by id).
 * Empty result means "no rule matched" → caller applies the default
 * single-step merchant-admin approval.
 */
export function evaluateApprovalChain(
  bill: { totalKobo: number; vendorId?: string | null },
  rules: ApprovalRuleShape[],
): ApprovalStep[] {
  const matching = rules
    .filter((r) => r.isActive !== false)
    .filter((r) => {
      if (r.minAmountKobo != null && bill.totalKobo < r.minAmountKobo) return false;
      if (r.maxAmountKobo != null && bill.totalKobo > r.maxAmountKobo) return false;
      if (r.vendorId != null && r.vendorId !== (bill.vendorId ?? null)) return false;
      return true;
    })
    .sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pa !== pb) return pa - pb;
      return (a.id ?? 0) - (b.id ?? 0);
    });
  return matching.map((r, i) => ({
    step: i + 1,
    ruleId: r.id ?? null,
    approverUserId: r.approverUserId ?? null,
    approverRole: r.approverRole ?? null,
    requiredApprovals: Math.min(Math.max(r.requiredApprovals ?? 1, 1), 5),
  }));
}

/** Default chain when no rule matches: single-step merchant-admin approval. */
function defaultApprovalChain(ownerId: number): ApprovalStep[] {
  return [{ step: 1, ruleId: null, approverUserId: ownerId, approverRole: "admin", requiredApprovals: 1 }];
}

// ─── Shared decision core (used by approveStep / batchApprove) ───────────────

async function getBillForMerchant(db: DbHandle, merchantId: string, billId: string) {
  const [bill] = await db
    .select()
    .from(apBills)
    .where(and(eq(apBills.id, billId), eq(apBills.merchantId, merchantId)))
    .limit(1);
  return bill ?? null;
}

/** Lowest step number that still has pending approval rows, or null. */
async function currentOpenStep(db: DbHandle, billId: string): Promise<number | null> {
  const [row] = await db
    .select({ step: apBillApprovals.step })
    .from(apBillApprovals)
    .where(and(eq(apBillApprovals.billId, billId), eq(apBillApprovals.status, "pending")))
    .orderBy(asc(apBillApprovals.step))
    .limit(1);
  return row?.step ?? null;
}

/**
 * approveStepCore — records an approval decision for ctx.user at the current
 * open step. All state changes are guarded UPDATEs (status predicate inside
 * WHERE) so a concurrent decision cannot double-approve or ride an illegal
 * transition. Throws TRPCError on NOT_FOUND / FORBIDDEN (maker=checker) /
 * CONFLICT (wrong approver, already decided, no open step).
 */
async function approveStepCore(
  db: DbHandle,
  args: { merchantId: string; billId: string; approverUserId: number; notes?: string | null },
): Promise<{ billId: string; step: number; billApproved: boolean }> {
  const bill = await getBillForMerchant(db, args.merchantId, args.billId);
  if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

  // Maker ≠ checker: the user who created the bill can never approve it.
  if (bill.createdBy != null && bill.createdBy === args.approverUserId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Maker-checker violation: bill creator cannot approve their own bill",
    });
  }

  const step = await currentOpenStep(db, args.billId);
  if (step == null) {
    throw new TRPCError({ code: "CONFLICT", message: "No pending approval step for this bill" });
  }

  // Guarded decision: only a pending row assigned to THIS approver at the
  // CURRENT step can be flipped. Empty RETURNING = wrong approver or already
  // decided (double-approve) → CONFLICT.
  const [decision] = await db
    .update(apBillApprovals)
    .set({ status: "approved", decidedAt: new Date(), notes: args.notes ?? null })
    .where(and(
      eq(apBillApprovals.billId, args.billId),
      eq(apBillApprovals.approverUserId, args.approverUserId),
      eq(apBillApprovals.status, "pending"),
      eq(apBillApprovals.step, step),
    ))
    .returning();
  if (!decision) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "No pending approval assigned to you at the current step (already decided or not an approver)",
    });
  }

  // Bill completes when no pending approval rows remain.
  const remaining = await db
    .select({ step: apBillApprovals.step })
    .from(apBillApprovals)
    .where(and(eq(apBillApprovals.billId, args.billId), eq(apBillApprovals.status, "pending")))
    .orderBy(asc(apBillApprovals.step))
    .limit(1);

  let billApproved = false;
  if (remaining.length === 0) {
    const [flipped] = await db
      .update(apBills)
      .set({ status: "approved", updatedAt: new Date() })
      .where(and(
        eq(apBills.id, args.billId),
        eq(apBills.merchantId, args.merchantId),
        inArray(apBills.status, ["pending_approval"]),
      ))
      .returning();
    if (!flipped) {
      throw new TRPCError({ code: "CONFLICT", message: "Bill status changed concurrently — retry" });
    }
    billApproved = true;
  }
  return { billId: args.billId, step, billApproved };
}

/**
 * rejectStepCore — mirrors approveStepCore; a single rejection at the current
 * step rejects the whole bill.
 */
async function rejectStepCore(
  db: DbHandle,
  args: { merchantId: string; billId: string; approverUserId: number; notes: string },
): Promise<{ billId: string; step: number; billRejected: boolean; bill: typeof apBills.$inferSelect }> {
  const bill = await getBillForMerchant(db, args.merchantId, args.billId);
  if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

  if (bill.createdBy != null && bill.createdBy === args.approverUserId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Maker-checker violation: bill creator cannot reject their own bill",
    });
  }

  const step = await currentOpenStep(db, args.billId);
  if (step == null) {
    throw new TRPCError({ code: "CONFLICT", message: "No pending approval step for this bill" });
  }

  const [decision] = await db
    .update(apBillApprovals)
    .set({ status: "rejected", decidedAt: new Date(), notes: args.notes })
    .where(and(
      eq(apBillApprovals.billId, args.billId),
      eq(apBillApprovals.approverUserId, args.approverUserId),
      eq(apBillApprovals.status, "pending"),
      eq(apBillApprovals.step, step),
    ))
    .returning();
  if (!decision) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "No pending approval assigned to you at the current step (already decided or not an approver)",
    });
  }

  const [flipped] = await db
    .update(apBills)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(
      eq(apBills.id, args.billId),
      eq(apBills.merchantId, args.merchantId),
      inArray(apBills.status, ["pending_approval"]),
    ))
    .returning();
  if (!flipped) {
    throw new TRPCError({ code: "CONFLICT", message: "Bill status changed concurrently — retry" });
  }
  return { billId: args.billId, step, billRejected: true, bill };
}

// ─── Notification helpers (non-fatal) ────────────────────────────────────────

async function notifyMerchant(
  db: DbHandle,
  opts: { merchantId: string; type: string; title: string; body: string; billId: string; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    await db.insert(merchantNotifications).values({
      merchantId: opts.merchantId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      entityId: opts.billId,
      entityType: "ap_bill",
      priority: "high",
      actionUrl: `/bills/${opts.billId}`,
      metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
    });
  } catch (err: any) {
    logger.warn("ap_approval_notify_failed", { type: opts.type, billId: opts.billId, error: err?.message });
  }
}

async function emailApprovers(
  db: DbHandle,
  approverUserIds: number[],
  opts: { subject: string; html: string },
): Promise<void> {
  try {
    const uniqueIds = [...new Set(approverUserIds)];
    if (uniqueIds.length === 0) return;
    const rows = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(inArray(users.id, uniqueIds));
    for (const u of rows) {
      if (!u.email) continue;
      await sendEmail({ to: u.email, subject: opts.subject, html: opts.html });
    }
  } catch (err: any) {
    logger.warn("ap_approval_email_failed", { error: err?.message });
  }
}

async function publishBillEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    await publishEvent("paygate.ap.bills", payload, String(payload.billId ?? ""));
  } catch (err: any) {
    logger.warn("ap_bill_event_publish_failed", { error: err?.message });
  }
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ruleFields = {
  name: z.string().min(1).max(255),
  priority: z.number().int().default(0),
  minAmountKobo: z.number().int().nonnegative().default(0),
  maxAmountKobo: z.number().int().nonnegative().optional(),
  vendorId: z.string().max(64).optional(),
  approverRole: z.string().min(1).max(64).optional(),
  approverUserId: z.number().int().positive().optional(),
  requiredApprovals: z.number().int().min(1).max(5).default(1),
  isActive: z.boolean().default(true),
};

const createRuleInput = z.object(ruleFields).refine(
  (v) => v.maxAmountKobo == null || v.maxAmountKobo > v.minAmountKobo,
  { message: "maxAmountKobo must be greater than minAmountKobo", path: ["maxAmountKobo"] },
);

const updateRuleInput = z.object({
  ruleId: z.number().int().positive(),
  name: ruleFields.name.optional(),
  priority: ruleFields.priority.optional(),
  minAmountKobo: ruleFields.minAmountKobo.optional(),
  maxAmountKobo: ruleFields.maxAmountKobo.nullable().optional(),
  vendorId: ruleFields.vendorId.nullable().optional(),
  approverRole: ruleFields.approverRole.nullable().optional(),
  approverUserId: ruleFields.approverUserId.nullable().optional(),
  requiredApprovals: ruleFields.requiredApprovals.optional(),
  isActive: ruleFields.isActive.optional(),
});

// ─── Router ──────────────────────────────────────────────────────────────────

export const apApprovalsRouter = router({
  createRule: pbacProcedure("approve_payout")
    .input(createRuleInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [rule] = await db.insert(apBillApprovalRules).values({
        merchantId,
        name: input.name,
        priority: input.priority,
        minAmountKobo: input.minAmountKobo,
        maxAmountKobo: input.maxAmountKobo ?? null,
        vendorId: input.vendorId ?? null,
        approverRole: input.approverRole ?? null,
        approverUserId: input.approverUserId ?? null,
        requiredApprovals: input.requiredApprovals,
        isActive: input.isActive,
      }).returning();
      await auditLog({
        merchantId,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "ap_approval_rule.created",
        resource: "ap_bill_approval_rule",
        resourceId: String(rule?.id ?? ""),
        metadata: { name: input.name, priority: input.priority },
      });
      return rule;
    }),

  updateRule: pbacProcedure("approve_payout")
    .input(updateRuleInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const { ruleId, ...patch } = input;

      // Fetch existing to validate the merged amount range (max > min).
      const [existing] = await db
        .select()
        .from(apBillApprovalRules)
        .where(and(eq(apBillApprovalRules.id, ruleId), eq(apBillApprovalRules.merchantId, merchantId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Approval rule not found" });

      const mergedMin = patch.minAmountKobo ?? existing.minAmountKobo ?? 0;
      const mergedMax = patch.maxAmountKobo === undefined ? existing.maxAmountKobo : patch.maxAmountKobo;
      if (mergedMax != null && mergedMax <= mergedMin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "maxAmountKobo must be greater than minAmountKobo",
        });
      }

      const set: Record<string, unknown> = {};
      for (const key of ["name", "priority", "minAmountKobo", "requiredApprovals", "isActive"] as const) {
        if (patch[key] !== undefined) set[key] = patch[key];
      }
      // Nullable fields: undefined = leave, null = clear.
      for (const key of ["maxAmountKobo", "vendorId", "approverRole", "approverUserId"] as const) {
        if (patch[key] !== undefined) set[key] = patch[key];
      }
      if (Object.keys(set).length === 0) return existing;

      const [updated] = await db
        .update(apBillApprovalRules)
        .set(set)
        .where(and(eq(apBillApprovalRules.id, ruleId), eq(apBillApprovalRules.merchantId, merchantId)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Approval rule not found" });
      await auditLog({
        merchantId,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "ap_approval_rule.updated",
        resource: "ap_bill_approval_rule",
        resourceId: String(ruleId),
        metadata: { changed: Object.keys(set) },
      });
      return updated;
    }),

  deleteRule: pbacProcedure("approve_payout")
    .input(z.object({ ruleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [deleted] = await db
        .delete(apBillApprovalRules)
        .where(and(eq(apBillApprovalRules.id, input.ruleId), eq(apBillApprovalRules.merchantId, merchantId)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Approval rule not found" });
      await auditLog({
        merchantId,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "ap_approval_rule.deleted",
        resource: "ap_bill_approval_rule",
        resourceId: String(input.ruleId),
        metadata: { name: deleted.name },
      });
      return { success: true, ruleId: input.ruleId };
    }),

  listRules: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const conds = [eq(apBillApprovalRules.merchantId, merchantId)];
      if (!input?.includeInactive) conds.push(eq(apBillApprovalRules.isActive, true));
      return db
        .select()
        .from(apBillApprovalRules)
        .where(and(...conds))
        .orderBy(asc(apBillApprovalRules.priority), asc(apBillApprovalRules.id));
    }),

  submitForApproval: protectedProcedure
    .input(z.object({ billId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { merchantId, ownerId } = await resolveMerchantOwnerId(ctx.user.openId);

      const bill = await getBillForMerchant(db, merchantId, input.billId);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

      // Guarded flip: draft|extracted → pending_approval. The status predicate
      // lives inside the UPDATE WHERE (ecommerce.ts TOCTOU pattern) so a
      // concurrent transition cannot slip through between read and write.
      const [flipped] = await db
        .update(apBills)
        .set({ status: "pending_approval", updatedAt: new Date() })
        .where(and(
          eq(apBills.id, input.billId),
          eq(apBills.merchantId, merchantId),
          inArray(apBills.status, ["draft", "extracted"]),
        ))
        .returning();
      if (!flipped) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Bill is not in a submittable state (must be draft or extracted)",
        });
      }

      // Evaluate the approval chain; empty match → default single-step
      // merchant-admin (owner) approval.
      const rules = await db
        .select()
        .from(apBillApprovalRules)
        .where(and(eq(apBillApprovalRules.merchantId, merchantId), eq(apBillApprovalRules.isActive, true)));
      const chain = evaluateApprovalChain(
        { totalKobo: bill.totalKobo, vendorId: bill.vendorId },
        rules,
      );
      const steps = chain.length > 0 ? chain : defaultApprovalChain(ownerId);

      // Insert one pending approval row per step. approver_user_id is NOT NULL
      // in the schema — role-only rules fall back to the merchant owner.
      const approverIds: number[] = [];
      for (const s of steps) {
        const approverId = s.approverUserId ?? ownerId;
        approverIds.push(approverId);
        await db.insert(apBillApprovals).values({
          billId: input.billId,
          ruleId: s.ruleId,
          step: s.step,
          approverUserId: approverId,
          status: "pending",
        });
      }

      await notifyMerchant(db, {
        merchantId,
        type: "ap_bill_approval_requested",
        title: "Bill awaiting approval",
        body: `Bill ${bill.billNumber ?? input.billId} (${bill.totalKobo} kobo) was submitted for approval (${steps.length} step${steps.length === 1 ? "" : "s"}).`,
        billId: input.billId,
        metadata: { steps: steps.length, totalKobo: bill.totalKobo },
      });
      await emailApprovers(db, approverIds, {
        subject: `Approval requested: bill ${bill.billNumber ?? input.billId}`,
        html: `<p>A bill for <strong>${bill.totalKobo}</strong> kobo requires your approval.</p><p>Bill: ${bill.billNumber ?? input.billId}</p>`,
      });

      await auditLog({
        merchantId,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "ap_bill.submitted_for_approval",
        resource: "ap_bill",
        resourceId: input.billId,
        metadata: { steps: steps.length, approverUserIds: approverIds },
      });
      await publishBillEvent({
        type: "ap_bill.submitted_for_approval",
        billId: input.billId,
        merchantId,
        steps: steps.length,
        submittedBy: ctx.user.id,
      });
      return { billId: input.billId, status: "pending_approval" as const, steps: steps.length };
    }),

  approveStep: pbacProcedure("approve_payout")
    .input(z.object({ billId: z.string().min(1), notes: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      // Approver identity comes ONLY from the authenticated session.
      const result = await approveStepCore(db, {
        merchantId,
        billId: input.billId,
        approverUserId: ctx.user.id,
        notes: input.notes ?? null,
      });
      await auditLog({
        merchantId,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "ap_bill.approval_step_approved",
        resource: "ap_bill",
        resourceId: input.billId,
        metadata: { step: result.step, notes: input.notes ?? null },
      });
      if (result.billApproved) {
        await auditLog({
          merchantId,
          actorId: ctx.user.openId,
          actorName: ctx.user.name ?? "unknown",
          actorEmail: ctx.user.email ?? undefined,
          action: "ap_bill.approved",
          resource: "ap_bill",
          resourceId: input.billId,
          metadata: { finalStep: result.step },
        });
        await publishBillEvent({
          type: "ap_bill.approved",
          billId: input.billId,
          merchantId,
          approvedBy: ctx.user.id,
        });
      }
      return result;
    }),

  rejectStep: pbacProcedure("approve_payout")
    .input(z.object({
      billId: z.string().min(1),
      notes: z.string().min(3, "Rejection notes are required (min 3 characters)").max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const result = await rejectStepCore(db, {
        merchantId,
        billId: input.billId,
        approverUserId: ctx.user.id,
        notes: input.notes,
      });
      await auditLog({
        merchantId,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "ap_bill.rejected",
        resource: "ap_bill",
        resourceId: input.billId,
        metadata: { step: result.step, notes: input.notes },
      });
      // Notify the bill creator (via the merchant notification feed).
      await notifyMerchant(db, {
        merchantId,
        type: "ap_bill_rejected",
        title: "Bill rejected",
        body: `Bill ${result.bill.billNumber ?? input.billId} was rejected at step ${result.step}: ${input.notes}`,
        billId: input.billId,
        metadata: { step: result.step, rejectedBy: ctx.user.id, createdBy: result.bill.createdBy },
      });
      await publishBillEvent({
        type: "ap_bill.rejected",
        billId: input.billId,
        merchantId,
        rejectedBy: ctx.user.id,
      });
      const { bill: _bill, ...rest } = result;
      return rest;
    }),

  batchApprove: pbacProcedure("approve_payout")
    .input(z.object({
      billIds: z.array(z.string().min(1)).min(1).max(50),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const results: Array<{ billId: string; ok: boolean; error?: string }> = [];
      // Each bill is decided independently in its own transaction so one
      // failure never rolls back the others.
      for (const billId of input.billIds) {
        try {
          const result = await db.transaction(async (tx) =>
            approveStepCore(tx as unknown as DbHandle, {
              merchantId,
              billId,
              approverUserId: ctx.user.id,
              notes: input.notes ?? null,
            }));
          await auditLog({
            merchantId,
            actorId: ctx.user.openId,
            actorName: ctx.user.name ?? "unknown",
            actorEmail: ctx.user.email ?? undefined,
            action: result.billApproved ? "ap_bill.approved" : "ap_bill.approval_step_approved",
            resource: "ap_bill",
            resourceId: billId,
            metadata: { batch: true, step: result.step },
          });
          results.push({ billId, ok: true });
        } catch (err: any) {
          results.push({ billId, ok: false, error: err?.message ?? "unknown error" });
        }
      }
      return { results };
    }),

  approvalQueue: protectedProcedure
    .input(z.object({ status: z.string().max(32).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      // Bills where the caller personally holds a pending approval step.
      return db
        .select({
          bill: apBills,
          approvalId: apBillApprovals.id,
          step: apBillApprovals.step,
          approvalStatus: apBillApprovals.status,
        })
        .from(apBillApprovals)
        .innerJoin(apBills, eq(apBillApprovals.billId, apBills.id))
        .where(and(
          eq(apBills.merchantId, merchantId),
          eq(apBillApprovals.approverUserId, ctx.user.id),
          eq(apBillApprovals.status, "pending"),
          eq(apBills.status, input?.status ?? "pending_approval"),
        ))
        .orderBy(desc(apBills.createdAt));
    }),
});

// ─── Test-visible internals ──────────────────────────────────────────────────

export const __approvalInternals = {
  evaluateApprovalChain,
  defaultApprovalChain,
  approveStepCore,
  rejectStepCore,
  currentOpenStep,
};
