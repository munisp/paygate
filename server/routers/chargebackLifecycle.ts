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
import crypto, { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { storagePut } from '../storage';
import { getUserByOpenId, getMerchantByOwnerId, getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { dispatchWebhookEvent } from '../webhookEvents';
import { logger } from '../logger';
import { runInTx, debitMerchantWallet } from './refunds';

const TENANT_ID = 'ten_default';

// ─── Chargeback state machine (C18/H6a) ─────────────────────────────────────
export const CHARGEBACK_STATUSES = [
  'open', 'under_review', 'pre_arbitration', 'arbitration', 'closed_won', 'closed_lost',
] as const;
export type ChargebackStatus = (typeof CHARGEBACK_STATUSES)[number];

/** Legal transitions. closed_* are terminal. */
const CHARGEBACK_TRANSITIONS: Record<ChargebackStatus, readonly ChargebackStatus[]> = {
  open: ['under_review', 'closed_won', 'closed_lost'],
  under_review: ['pre_arbitration', 'closed_won', 'closed_lost'],
  pre_arbitration: ['arbitration', 'closed_won', 'closed_lost'],
  arbitration: ['closed_won', 'closed_lost'],
  closed_won: [],
  closed_lost: [],
};

async function emitChargebackEvent(merchantId: string, event: string, data: Record<string, unknown>) {
  try {
    await dispatchWebhookEvent({
      event: event as any,
      id: `evt_${crypto.randomBytes(10).toString('hex')}`,
      tenantId: TENANT_ID,
      merchantId,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (err) {
    logger.error('chargeback webhook dispatch failed', { err, event });
  }
}

/** Negate every numeric amount field of split legs (jsonb array). */
function negateLegs(legs: unknown): unknown {
  if (!Array.isArray(legs)) return legs;
  return legs.map((leg: any) => {
    if (!leg || typeof leg !== 'object') return leg;
    const out: any = { ...leg };
    for (const k of ['amountKobo', 'amount_kobo', 'amount']) {
      if (typeof out[k] === 'number') out[k] = -out[k];
    }
    return out;
  });
}

/**
 * Split-leg reversal (H6d): for a lost chargeback, write compensating
 * negative split_payments legs (status 'reversed') for every completed split
 * on the underlying transaction, mark the originals reversed, and emit
 * split.reversed. Runs inside the caller's transaction.
 */
async function reverseSplitLegs(
  db: any,
  merchantId: string,
  chargeback: { id: string; transaction_id: string | null },
): Promise<number> {
  if (!chargeback.transaction_id) return 0;
  const txRes = await db.execute(sql`
    SELECT reference FROM transactions
    WHERE (id = ${chargeback.transaction_id} OR reference = ${chargeback.transaction_id})
      AND merchant_id = ${merchantId}
    LIMIT 1
  `);
  const reference = (txRes.rows[0] as any)?.reference ?? chargeback.transaction_id;
  const spRes = await db.execute(sql`
    SELECT * FROM split_payments WHERE reference = ${reference} AND status = 'completed'
  `);
  let reversed = 0;
  const now = new Date().toISOString();
  for (const sp of spRes.rows as any[]) {
    await db.execute(sql`
      INSERT INTO split_payments (
        split_payment_id, split_rule_id, total_amount_kobo, reference, legs,
        status, merchant_id, created_at, updated_at
      ) VALUES (
        ${`rev_${sp.split_payment_id}`}, ${sp.split_rule_id},
        ${-Number(sp.total_amount_kobo)}, ${sp.reference},
        ${JSON.stringify(negateLegs(sp.legs))},
        ${'reversed'}, ${sp.merchant_id ?? merchantId}, ${now}, ${now}
      )
      ON CONFLICT (split_payment_id) DO NOTHING
    `);
    await db.execute(sql`
      UPDATE split_payments SET status = 'reversed', updated_at = ${now}
      WHERE split_payment_id = ${sp.split_payment_id}
    `);
    reversed++;
    await emitChargebackEvent(merchantId, 'split.reversed', {
      chargeback_id: chargeback.id,
      split_payment_id: sp.split_payment_id,
      reversal_split_payment_id: `rev_${sp.split_payment_id}`,
      reference,
    });
  }
  return reversed;
}

/** Hold (reserve) the disputed amount against the merchant's wallet (H6c). */
async function adjustReservedBalance(
  db: any,
  merchantId: string,
  deltaKobo: number,
): Promise<void> {
  const res = await db.execute(sql`
    UPDATE wallets
    SET reserved_balance = GREATEST(COALESCE(reserved_balance, '0')::bigint + ${deltaKobo}, 0)::text,
        updated_at = ${new Date().toISOString()}
    WHERE merchant_id = ${merchantId}
    RETURNING id
  `);
  if (!res.rows[0] && deltaKobo > 0) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `No wallet found for merchant '${merchantId}'; cannot place chargeback hold`,
    });
  }
}

/**
 * placeChargebackHold — called where chargebacks are opened (webhook/wave24
 * creation sites are owned by other work streams; call this there). Reserves
 * the disputed amount on the merchant wallet so it cannot be paid out while
 * the chargeback is open.
 */
export async function placeChargebackHold(
  db: any,
  merchantId: string,
  amountKobo: number,
  chargebackId: string,
): Promise<void> {
  await adjustReservedBalance(db, merchantId, amountKobo);
  logger.info('chargeback hold placed', { merchantId, amountKobo, chargebackId });
}

/**
 * Guarded chargeback status transition (C18/H6a). The UPDATE re-checks the
 * pre-transition status in its WHERE clause — a concurrent flip yields 0 rows
 * and fails with CONFLICT. closed_lost additionally, in the SAME DB
 * transaction: releases the hold, debits the merchant wallet (audit row in
 * wallet_transactions), reverses split legs and emits events (H6c/H6d).
 */
export async function transitionChargebackStatus(
  db: any,
  merchantId: string,
  id: string,
  next: ChargebackStatus,
  opts: { actorId?: string; reason?: string; event?: string } = {},
): Promise<any> {
  const cur = await db.execute(sql`
    SELECT * FROM chargebacks WHERE id = ${id} AND merchant_id = ${merchantId} LIMIT 1
  `);
  const current = cur.rows[0] as any | undefined;
  if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Chargeback not found' });
  const allowed = CHARGEBACK_TRANSITIONS[current.status as ChargebackStatus] ?? [];
  if (!allowed.includes(next)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Illegal chargeback status transition '${current.status}' → '${next}'`,
    });
  }
  return runInTx(db, async (tx) => {
    const now = new Date().toISOString();
    const res = await tx.execute(sql`
      UPDATE chargebacks SET
        status = ${next},
        resolved_at = ${next.startsWith('closed') ? now : null},
        updated_at = ${now}
      WHERE id = ${id} AND merchant_id = ${merchantId} AND status = ${current.status}
      RETURNING *
    `);
    const row = res.rows[0] as any | undefined;
    if (!row) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Chargeback status changed concurrently — retry' });
    }
    if (next === 'closed_lost') {
      await adjustReservedBalance(tx, merchantId, -Number(current.amount_kobo));
      await debitMerchantWallet(tx, {
        merchantId,
        amountKobo: Number(current.amount_kobo),
        currency: current.currency ?? 'NGN',
        reason: 'chargeback',
        reference: `chargeback_${id}`,
        description: `Chargeback ${id} lost — merchant wallet debit`,
      });
      row.split_legs_reversed = await reverseSplitLegs(tx, merchantId, {
        id, transaction_id: current.transaction_id ?? null,
      });
    } else if (next === 'closed_won') {
      await adjustReservedBalance(tx, merchantId, -Number(current.amount_kobo));
    }
    await tx.execute(sql`
      INSERT INTO chargeback_timeline (
        id, chargeback_id, merchant_id, event, previous_state, new_state,
        actor_id, actor_type, notes, occurred_at
      ) VALUES (
        ${randomUUID()}, ${id}, ${merchantId}, ${opts.event ?? 'status_changed'},
        ${current.status}, ${next}, ${opts.actorId ?? null}, ${opts.actorId ? 'user' : 'system'},
        ${opts.reason ?? null}, ${now}
      )
    `);
    await emitChargebackEvent(merchantId, `chargeback.${next}`, {
      chargeback_id: id,
      previous_status: current.status,
      status: next,
      amount_kobo: current.amount_kobo,
      currency: current.currency,
    });
    return row;
  });
}

/**
 * autoAcceptExpiredChargebacks — called by cronJobs.
 * Chargebacks past their due_date with no closure are auto-accepted: the
 * merchant concedes, the chargeback flips to closed_lost and the wallet
 * debit / hold release / split reversal run in the same transaction per row.
 * Per-row failures are logged (fail loud) and the sweep continues.
 */
export async function autoAcceptExpiredChargebacks(): Promise<{
  scanned: number; closed: number; errors: Array<{ chargebackId: string; merchantId: string; error: string }>;
}> {
  const db = await getDb();
  if (!db) throw new Error('autoAcceptExpiredChargebacks: DB unavailable');
  const res = await db.execute(sql`
    SELECT id, merchant_id FROM chargebacks
    WHERE status IN ('open', 'under_review', 'pre_arbitration', 'arbitration')
      AND due_date IS NOT NULL AND due_date < now()
    ORDER BY due_date ASC
    LIMIT 200
  `);
  const rows = res.rows as any[];
  const out = { scanned: rows.length, closed: 0, errors: [] as any[] };
  for (const r of rows) {
    try {
      await transitionChargebackStatus(db, r.merchant_id, r.id, 'closed_lost', {
        reason: 'auto_accepted_sla: response deadline elapsed',
        event: 'auto_accepted',
      });
      out.closed++;
    } catch (err: any) {
      logger.error('autoAcceptExpiredChargebacks row failed', { err, chargebackId: r.id });
      out.errors.push({ chargebackId: r.id, merchantId: r.merchant_id, error: err?.message ?? 'unknown' });
    }
  }
  return out;
}

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
      // H6b: evidence is pointless once closed or past the response deadline.
      if (chargeback.status.startsWith('closed')) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Chargeback is ${chargeback.status}; evidence can no longer be submitted`,
        });
      }
      const deadline = chargeback.evidenceDeadline ?? chargeback.dueDate;
      if (deadline && new Date(deadline).getTime() < Date.now()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Evidence deadline (${new Date(deadline).toISOString()}) has passed`,
        });
      }
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

  /** Upload an evidence file (base64) to storage and attach it to a chargeback */
  uploadEvidence: manageChargebacks
    .input(z.object({
      chargebackId: z.string(),
      evidenceType: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      fileContentBase64: z.string().max(14_000_000, 'File must be under ~10MB'),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [chargeback] = await (await getDbInstance()).select().from(schema.chargebacks)
        .where(and(eq(schema.chargebacks.id, input.chargebackId), eq(schema.chargebacks.merchantId, merchantId)))
        .limit(1);
      if (!chargeback) throw new Error('Chargeback not found');
      const buffer = Buffer.from(input.fileContentBase64, 'base64');
      const suffix = randomUUID().slice(0, 8);
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `chargeback-evidence/${merchantId}/${input.chargebackId}/${suffix}-${safeName}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType);
      const db = await getDbInstance();
      const [[evidence]] = await Promise.all([
        db.insert(schema.chargebackEvidencePackages).values({
          chargebackId: input.chargebackId,
          merchantId,
          evidenceType: input.evidenceType,
          fileName: input.fileName,
          fileKey,
          fileUrl,
          mimeType: input.mimeType,
          fileSizeBytes: buffer.length,
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
      // C18/H6a: escalate follows the state machine with a guarded flip —
      // illegal jumps and concurrent escalations fail with CONFLICT.
      const row = await transitionChargebackStatus(db2, merchantId, input.chargebackId, input.newStatus, {
        actorId: ctx.user!.openId,
        reason: input.reason,
        event: 'escalated',
      });
      return { success: true, newStatus: input.newStatus, chargeback: row };
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
