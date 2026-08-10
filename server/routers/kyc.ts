/**
 * kyc.ts — Full DB-backed KYC router with liveness detection procedures.
 */
import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getUserByOpenId, getMerchantByOwnerId, getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { ENV } from '../_core/env';

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

  /** Save liveness result to the KYC submission record */
  saveLivenessResult: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      score: z.number(),
      passed: z.boolean(),
      mode: z.string().optional(),
      challengeType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await (await getDbInstance()).update(schema.kycSubmissions)
        .set({
          livenessScore: input.score,
          livenessMode: input.mode ?? 'passive',
          livenessChallengeType: input.challengeType ?? null,
          livenessPassedAt: input.passed ? new Date() : null,
          livenessSessionId: input.submissionId,
          updatedAt: new Date(),
        })
        .where(eq(schema.kycSubmissions.id, input.submissionId));
      return { success: true };
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
