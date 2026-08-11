/**
 * chargebackLifecycle.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full DB-backed chargeback lifecycle router.
 * Manages dispute evidence submission, timeline events, and escalations.
 */
import { router, pbacProcedure } from '../_core/trpc';

// PBAC: chargeback reads require chargeback:view; evidence/escalation writes
// require chargeback:manage (admin + finance_manager per server/pbac.ts).
const viewChargebacks = pbacProcedure('view_chargebacks');
const manageChargebacks = pbacProcedure('manage_chargebacks');
import { z } from 'zod';
import { getUserByOpenId, getMerchantByOwnerId, getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, count } from 'drizzle-orm';

async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new Error('User not found');
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new Error('Merchant not found');
  return merchant.id;
}

async function getDbInstance() {
  const d = await getDb();
  if (!d) throw new Error('Database unavailable');
  return d;
}

export const chargebackLifecycleRouter = router({
  /** List chargebacks with pagination */
  list: viewChargebacks
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(schema.chargebacks.merchantId, merchantId)];
      if (input.status) conditions.push(eq(schema.chargebacks.status, input.status));
      const [rows, [{ total }]] = await Promise.all([
        (await getDbInstance()).select().from(schema.chargebacks)
          .where(and(...conditions))
          .orderBy(desc(schema.chargebacks.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        (await getDbInstance()).select({ total: count() }).from(schema.chargebacks)
          .where(and(...conditions)),
      ]);
      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  /** Get a single chargeback with its evidence and timeline */
  get: viewChargebacks
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [chargeback] = await (await getDbInstance()).select().from(schema.chargebacks)
        .where(and(eq(schema.chargebacks.id, input.id), eq(schema.chargebacks.merchantId, merchantId)))
        .limit(1);
      if (!chargeback) throw new Error('Chargeback not found');
      const [evidence, timeline] = await Promise.all([
        (await getDbInstance()).select().from(schema.chargebackEvidencePackages)
          .where(eq(schema.chargebackEvidencePackages.chargebackId, input.id))
          .orderBy(desc(schema.chargebackEvidencePackages.uploadedAt)),
        (await getDbInstance()).select().from(schema.chargebackTimeline)
          .where(eq(schema.chargebackTimeline.chargebackId, input.id))
          .orderBy(desc(schema.chargebackTimeline.occurredAt)),
      ]);
      return { ...chargeback, evidence, timeline };
    }),

  /** Submit evidence for a chargeback */
  submitEvidence: manageChargebacks
    .input(z.object({
      chargebackId: z.string(),
      evidenceType: z.string(),
      fileName: z.string(),
      fileKey: z.string(),
      fileUrl: z.string().url(),
      mimeType: z.string(),
      fileSizeBytes: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [chargeback] = await (await getDbInstance()).select().from(schema.chargebacks)
        .where(and(eq(schema.chargebacks.id, input.chargebackId), eq(schema.chargebacks.merchantId, merchantId)))
        .limit(1);
      if (!chargeback) throw new Error('Chargeback not found');
      const db = await getDbInstance();
      // Insert evidence, update chargeback flag, and append timeline entry concurrently
      const [[evidence]] = await Promise.all([
        db.insert(schema.chargebackEvidencePackages).values({
          chargebackId: input.chargebackId,
          merchantId,
          evidenceType: input.evidenceType,
          fileName: input.fileName,
          fileKey: input.fileKey,
          fileUrl: input.fileUrl,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          uploadedBy: ctx.user!.openId,
        }).returning(),
        db.update(schema.chargebacks)
          .set({ evidenceSubmitted: true, updatedAt: new Date() })
          .where(eq(schema.chargebacks.id, input.chargebackId)),
        db.insert(schema.chargebackTimeline).values({
          chargebackId: input.chargebackId,
          merchantId,
          event: 'evidence_submitted',
          previousState: chargeback.status,
          newState: chargeback.status,
          actorId: ctx.user!.openId,
          actorType: 'user',
          notes: `Evidence submitted: ${input.evidenceType} (${input.fileName})`,
        }),
      ]);
      return evidence;
    }),

  /** Escalate a chargeback to a higher stage */
  escalate: manageChargebacks
    .input(z.object({
      chargebackId: z.string(),
      reason: z.string().min(1),
      newStatus: z.enum(['pre_arbitration', 'arbitration', 'closed_won', 'closed_lost']),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [chargeback] = await (await getDbInstance()).select().from(schema.chargebacks)
        .where(and(eq(schema.chargebacks.id, input.chargebackId), eq(schema.chargebacks.merchantId, merchantId)))
        .limit(1);
      if (!chargeback) throw new Error('Chargeback not found');
      const db2 = await getDbInstance();
      // Update status and append timeline entry concurrently
      await Promise.all([
        db2.update(schema.chargebacks)
          .set({ status: input.newStatus, updatedAt: new Date() })
          .where(eq(schema.chargebacks.id, input.chargebackId)),
        db2.insert(schema.chargebackTimeline).values({
          chargebackId: input.chargebackId,
          merchantId,
          event: 'escalated',
          previousState: chargeback.status,
          newState: input.newStatus,
          actorId: ctx.user!.openId,
          actorType: 'user',
          notes: input.reason,
        }),
      ]);
      return { success: true, newStatus: input.newStatus };
    }),

  /** Summary stats for the chargeback dashboard */
  stats: viewChargebacks.query(async ({ ctx }) => {
    const merchantId = await resolveMerchantId(ctx.user!.openId);
    const rows = await (await getDbInstance()).select({ status: schema.chargebacks.status, total: count() })
      .from(schema.chargebacks)
      .where(eq(schema.chargebacks.merchantId, merchantId))
      .groupBy(schema.chargebacks.status);
    const s: Record<string, number> = {};
    for (const r of rows) s[r.status] = r.total;
    return {
      open: s['open'] ?? 0,
      under_review: s['under_review'] ?? 0,
      pre_arbitration: s['pre_arbitration'] ?? 0,
      arbitration: s['arbitration'] ?? 0,
      closed_won: s['closed_won'] ?? 0,
      closed_lost: s['closed_lost'] ?? 0,
    };
  }),
});
