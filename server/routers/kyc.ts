/**
 * kyc.ts — Full DB-backed KYC router with liveness detection procedures.
 */
import { router, protectedProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getUserByOpenId, getMerchantByOwnerId, getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { ENV } from '../_core/env';

/**
 * G7 — payout gate: a merchant may only initiate payouts once its KYC has been
 * approved by a reviewer. Single indexed SELECT (kyc_merchant_idx), fail-loud.
 */
export async function assertApprovedKyc(merchantId: string): Promise<void> {
  const db = await getDbInstance();
  const [row] = await db
    .select({ id: schema.kycSubmissions.id })
    .from(schema.kycSubmissions)
    .where(and(
      eq(schema.kycSubmissions.merchantId, merchantId),
      eq(schema.kycSubmissions.status, 'approved' as any),
    ))
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'KYC verification required — complete and pass KYC before payouts',
    });
  }
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

async function callLiveness(path: string, body: unknown): Promise<any> {
  const url = `${ENV.livenessGatewayUrl}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

export const kycRouter = router({
  /** List KYC submissions for the authenticated merchant */
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(schema.kycSubmissions.merchantId, merchantId)];
      if (input.status) conditions.push(eq(schema.kycSubmissions.status, input.status as any));
      const [rows, [{ total }]] = await Promise.all([
        (await getDbInstance()).select().from(schema.kycSubmissions)
          .where(and(...conditions))
          .orderBy(desc(schema.kycSubmissions.createdAt))
          .limit(input.pageSize).offset(offset),
        (await getDbInstance()).select({ total: count() }).from(schema.kycSubmissions).where(and(...conditions)),
      ]);
      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  /** Get a single KYC submission */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [row] = await (await getDbInstance()).select().from(schema.kycSubmissions)
        .where(and(eq(schema.kycSubmissions.id, input.id), eq(schema.kycSubmissions.merchantId, merchantId)))
        .limit(1);
      if (!row) throw new Error('KYC submission not found');
      return row;
    }),

  /** Passive liveness check — returns a score from the liveness gateway */
  checkLiveness: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      imageBase64: z.string(),
      mode: z.enum(['passive', 'active']).default('passive'),
    }))
    .mutation(async ({ input }) => {
      const result = await callLiveness('/v1/liveness/check', {
        submission_id: input.submissionId,
        image: input.imageBase64,
        mode: input.mode,
      });
      return result ?? { score: 0, passed: false, error: 'Liveness service unavailable' };
    }),

  /** Face detection — returns bounding boxes */
  faceDetect: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }) => {
      const result = await callLiveness('/v1/face/detect', { image: input.imageBase64 });
      return result ?? { faces: [], error: 'Face detection service unavailable' };
    }),

  /** Facial landmark detection */
  landmarks: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }) => {
      const result = await callLiveness('/v1/face/landmarks', { image: input.imageBase64 });
      return result ?? { landmarks: [], error: 'Landmark service unavailable' };
    }),

  /** Extract face embedding vector */
  extractEmbedding: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }) => {
      const result = await callLiveness('/v1/face/embedding', { image: input.imageBase64 });
      return result ?? { embedding: [], error: 'Embedding service unavailable' };
    }),

  /** Match two face embeddings */
  faceMatch: protectedProcedure
    .input(z.object({
      embeddingA: z.array(z.number()),
      embeddingB: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const result = await callLiveness('/v1/face/match', {
        embedding_a: input.embeddingA,
        embedding_b: input.embeddingB,
      });
      return result ?? { matched: false, distance: 1, error: 'Face match service unavailable' };
    }),

  /**
   * Save a client-reported liveness outcome from the onboarding wizard.
   * G5: the client is NEVER trusted as authoritative — `passed`/`score` are
   * stored only as unverified `client_reported_*` metadata. `livenessPassedAt`
   * may be set exclusively by a server-side checkLiveness result or an admin
   * override; the submission status stays pending until then.
   */
  saveLivenessResult: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      score: z.number(),
      passed: z.boolean(),
      mode: z.string().optional(),
      challengeType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const db = await getDbInstance();
      // Merchant-scoped: a caller can only report against its own submission.
      const scope = and(
        eq(schema.kycSubmissions.id, input.submissionId),
        eq(schema.kycSubmissions.merchantId, merchantId),
      );
      const [sub] = await db.select({ id: schema.kycSubmissions.id })
        .from(schema.kycSubmissions).where(scope).limit(1);
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'KYC submission not found' });
      // Non-authoritative metadata only — never livenessScore / livenessPassedAt.
      await db.update(schema.kycSubmissions)
        .set({
          livenessMode: input.mode ?? 'passive',
          livenessChallengeType: input.challengeType ?? null,
          livenessSessionId: input.submissionId,
          updatedAt: new Date(),
        })
        .where(scope);
      // Unverified client report (columns added in migration 0105; raw SQL
      // because drizzle/schema.ts is owned by another change stream).
      await db.execute(sql`
        UPDATE kyc_submissions
        SET client_reported_liveness_score = ${input.score},
            client_reported_liveness_passed = ${input.passed},
            client_reported_liveness_at = now()
        WHERE id = ${input.submissionId} AND merchant_id = ${merchantId}
      `);
      return { success: true, verified: false };
    }),

  /** KYC stats for the merchant dashboard */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const merchantId = await resolveMerchantId(ctx.user!.openId);
    const rows = await (await getDbInstance()).select({ status: schema.kycSubmissions.status, total: count() })
      .from(schema.kycSubmissions)
      .where(eq(schema.kycSubmissions.merchantId, merchantId))
      .groupBy(schema.kycSubmissions.status);
    const s: Record<string, number> = {};
    for (const r of rows) s[r.status] = r.total;
    return { pending: s['pending'] ?? 0, approved: s['approved'] ?? 0, rejected: s['rejected'] ?? 0, total: Object.values(s).reduce((a, b) => a + b, 0) };
  }),
});
