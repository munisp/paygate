/**
 * Wave 174 — KYB/KYC Advanced Compliance Routers
 *
 * - uboMgmtRouter       : UBO (Ultimate Beneficial Owner) mapping & director KYC sub-flow
 * - adverseMediaRouter  : Adverse media screening via LLM + YouVerify
 * - temporalCheckRouter : Temporal consistency checks (doc expiry, DOB, name, address)
 * - kybRiskScoreRouter  : Automated KYB composite risk scoring
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  uboOwners,
  adverseMediaScreenings,
  temporalConsistencyChecks,
  kybRiskScores,
  kybVerifications,
  kycSubmissions,
  livenessSessions,
} from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { publishAuditEvent } from "../auditEvents";
import { logger } from "../logger";

// ─── 1. UBO Management Router ─────────────────────────────────────────────────
export const uboMgmtRouter = router({
  list: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(uboOwners)
        .where(and(
          eq(uboOwners.verificationId, input.verificationId),
          eq(uboOwners.merchantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(uboOwners.ownershipPct));
      return rows;
    }),

  add: protectedProcedure
    .input(z.object({
      verificationId: z.string(),
      fullName: z.string().min(2),
      bvn: z.string().length(11).optional(),
      nin: z.string().optional(),
      ownershipPct: z.number().min(0.01).max(100),
      isPep: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      // Validate total ownership does not exceed 100%
      const existing = await db.select({ total: sql<number>`sum(${uboOwners.ownershipPct})` })
        .from(uboOwners)
        .where(and(
          eq(uboOwners.verificationId, input.verificationId),
          eq(uboOwners.merchantId, ctx.user.tenantId ?? ""),
        ));
      const currentTotal = Number(existing[0]?.total ?? 0);
      if (currentTotal + input.ownershipPct > 100.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Total ownership would exceed 100% (current: ${currentTotal.toFixed(1)}%)`,
        });
      }
      const [row] = await db.insert(uboOwners).values({
        verificationId: input.verificationId,
        merchantId: ctx.user.tenantId ?? "",
        fullName: input.fullName,
        bvn: input.bvn,
        nin: input.nin,
        ownershipPct: input.ownershipPct,
        isPep: input.isPep,
      }).returning();
      publishAuditEvent({
        action: "kyb.ubo.added",
        actorId: ctx.user.openId,
        targetId: row.id,
        metadata: { verificationId: input.verificationId, fullName: input.fullName, ownershipPct: input.ownershipPct },
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      return row;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      fullName: z.string().min(2).optional(),
      ownershipPct: z.number().min(0.01).max(100).optional(),
      isPep: z.boolean().optional(),
      kycStatus: z.enum(["pending", "approved", "rejected"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const { id, ...rest } = input;
      await db.update(uboOwners).set({ ...rest, updatedAt: new Date() })
        .where(and(eq(uboOwners.id, id), eq(uboOwners.merchantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.delete(uboOwners)
        .where(and(eq(uboOwners.id, input.id), eq(uboOwners.merchantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  ownershipSummary: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const rows = await db.select({
        total: sql<number>`sum(${uboOwners.ownershipPct})`,
        count: sql<number>`count(*)`,
        pepCount: sql<number>`sum(case when ${uboOwners.isPep} then 1 else 0 end)`,
        pendingKyc: sql<number>`sum(case when ${uboOwners.kycStatus} = 'pending' then 1 else 0 end)`,
      }).from(uboOwners)
        .where(and(
          eq(uboOwners.verificationId, input.verificationId),
          eq(uboOwners.merchantId, ctx.user.tenantId ?? ""),
        ));
      return {
        totalOwnership: Number(rows[0]?.total ?? 0),
        count: Number(rows[0]?.count ?? 0),
        pepCount: Number(rows[0]?.pepCount ?? 0),
        pendingKyc: Number(rows[0]?.pendingKyc ?? 0),
      };
    }),
});

// ─── 2. Adverse Media Screening Router ────────────────────────────────────────
export const adverseMediaRouter = router({
  screen: protectedProcedure
    .input(z.object({
      entityType: z.enum(["merchant", "ubo", "director"]),
      entityId: z.string(),
      name: z.string().min(2),
      country: z.string().default("NG"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const query = `${input.name} ${input.country}`;
      let flagged = false;
      let flagReason: string | null = null;
      let resultJson: string | null = null;

      try {
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an AML/CFT adverse media screening assistant. 
Given a person or business name and country, assess whether there is credible adverse media 
(fraud, money laundering, terrorism financing, sanctions, corruption, criminal conviction).
Respond ONLY with valid JSON: { "flagged": boolean, "reason": string | null, "confidence": "high"|"medium"|"low" }.
Be conservative: only flag if there is clear, credible adverse information. Unknown persons should NOT be flagged.`,
            },
            {
              role: "user",
              content: `Screen for adverse media: Name="${input.name}", Country="${input.country}". 
Respond with JSON only.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "adverse_media_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  flagged: { type: "boolean" },
                  reason: { type: ["string", "null"] },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["flagged", "reason", "confidence"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = llmResponse?.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
        flagged = parsed.flagged === true && parsed.confidence !== "low";
        flagReason = parsed.reason ?? null;
        resultJson = JSON.stringify(parsed);
      } catch (e: any) {
        // FAIL LOUD — a failed screening MUST NOT be persisted as a completed
        // (unflagged) screening-of-record. Downstream risk scoring consumes
        // `flagged`; silently recording a pass on provider error is an AML breach.
        logger.error(`[adverseMedia] Screening provider error for "${input.name}": ${e?.message}`);
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Adverse media screening provider is unavailable — screening NOT completed. Retry or escalate to manual review.",
        });
      }

      const [row] = await db.insert(adverseMediaScreenings).values({
        entityType: input.entityType,
        entityId: input.entityId,
        merchantId: ctx.user.tenantId ?? "",
        query,
        provider: "llm_search",
        result: resultJson,
        flagged,
        flagReason,
      }).returning();

      if (flagged) {
        publishAuditEvent({
          action: "compliance.adverse_media.flagged",
          actorId: ctx.user.openId,
          targetId: input.entityId,
          metadata: { entityType: input.entityType, name: input.name, reason: flagReason },
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }

      return { id: row.id, flagged, flagReason, query };
    }),

  list: protectedProcedure
    .input(z.object({
      entityId: z.string().optional(),
      flaggedOnly: z.boolean().default(false),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [eq(adverseMediaScreenings.merchantId, ctx.user.tenantId ?? "")];
      if (input.entityId) conditions.push(eq(adverseMediaScreenings.entityId, input.entityId));
      if (input.flaggedOnly) conditions.push(eq(adverseMediaScreenings.flagged, true));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]);
      const rows = await db.select().from(adverseMediaScreenings)
        .where(where).orderBy(desc(adverseMediaScreenings.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(adverseMediaScreenings).where(where);
      return { screenings: rows, total: Number(count), totalPages: Math.ceil(Number(count) / input.limit) };
    }),

  markReviewed: protectedProcedure
    .input(z.object({ id: z.string(), cleared: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(adverseMediaScreenings).set({
        reviewedBy: ctx.user.openId,
        reviewedAt: new Date(),
        flagged: !input.cleared,
      }).where(and(
        eq(adverseMediaScreenings.id, input.id),
        eq(adverseMediaScreenings.merchantId, ctx.user.tenantId ?? ""),
      ));
      return { success: true };
    }),
});

// ─── 3. Temporal Consistency Check Router ─────────────────────────────────────
export const temporalCheckRouter = router({
  run: protectedProcedure
    .input(z.object({ submissionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [submission] = await db.select().from(kycSubmissions)
        .where(and(
          eq(kycSubmissions.submissionId, input.submissionId),
          eq(kycSubmissions.merchantId, ctx.user.tenantId ?? ""),
        )).limit(1);
      if (!submission) throw new TRPCError({ code: "NOT_FOUND" });

      const checks: Array<{
        checkType: string;
        fieldA: string | null;
        fieldB: string | null;
        passed: boolean;
        note: string | null;
      }> = [];

      // Check 1: Document expiry
      if (submission.documentExpiresAt) {
        const expired = new Date(submission.documentExpiresAt) < new Date();
        checks.push({
          checkType: "doc_expiry",
          fieldA: new Date(submission.documentExpiresAt).toISOString().slice(0, 10),
          fieldB: new Date().toISOString().slice(0, 10),
          passed: !expired,
          note: expired ? "Document has expired" : null,
        });
      }

      // Check 2: BVN name match (if bvnValidated and bvnName stored)
      if ((submission as any).bvnValidated && (submission as any).bvnName && submission.fullName) {
        const bvnName: string = (submission as any).bvnName ?? "";
        const docName: string = submission.fullName ?? "";
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
        const similarity = normalize(bvnName) === normalize(docName);
        checks.push({
          checkType: "name_mismatch",
          fieldA: docName,
          fieldB: bvnName,
          passed: similarity,
          note: !similarity ? `Document name "${docName}" does not match BVN name "${bvnName}"` : null,
        });
      }

      // Check 3: DOB plausibility (must be 18–120 years old)
      if (submission.dateOfBirth) {
        const dob = new Date(submission.dateOfBirth);
        const ageMs = Date.now() - dob.getTime();
        const ageYears = ageMs / (365.25 * 24 * 3600 * 1000);
        const plausible = ageYears >= 18 && ageYears <= 120;
        checks.push({
          checkType: "dob_mismatch",
          fieldA: dob.toISOString().slice(0, 10),
          fieldB: `age=${ageYears.toFixed(1)}`,
          passed: plausible,
          note: !plausible ? `Age ${ageYears.toFixed(1)} years is outside plausible range (18–120)` : null,
        });
      }

      // Persist checks
      if (checks.length > 0) {
        await db.insert(temporalConsistencyChecks).values(
          checks.map(c => ({
            submissionId: input.submissionId,
            merchantId: ctx.user.tenantId ?? "",
            checkType: c.checkType,
            fieldA: c.fieldA,
            fieldB: c.fieldB,
            passed: c.passed,
            note: c.note,
          }))
        );
      }

      const failed = checks.filter(c => !c.passed);
      return { checks, passed: failed.length === 0, failedCount: failed.length };
    }),

  list: protectedProcedure
    .input(z.object({ submissionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      return db.select().from(temporalConsistencyChecks)
        .where(and(
          eq(temporalConsistencyChecks.submissionId, input.submissionId),
          eq(temporalConsistencyChecks.merchantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(temporalConsistencyChecks.createdAt));
    }),
});

// ─── 4. KYB Risk Score Router ──────────────────────────────────────────────────
export const kybRiskScoreRouter = router({
  compute: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [verification] = await db.select().from(kybVerifications)
        .where(and(
          eq(kybVerifications.verificationId, input.verificationId),
          eq(kybVerifications.merchantId, ctx.user.tenantId ?? ""),
        )).limit(1);
      if (!verification) throw new TRPCError({ code: "NOT_FOUND" });

      // Gather sub-scores
      // 1. UBO risk: PEP presence and unverified UBOs
      const uboRows = await db.select().from(uboOwners)
        .where(eq(uboOwners.verificationId, input.verificationId));
      const pepCount = uboRows.filter(u => u.isPep).length;
      const unverifiedUbo = uboRows.filter(u => u.kycStatus !== "approved").length;
      const uboRiskScore = Math.min(100, pepCount * 30 + unverifiedUbo * 15);

      // 2. Adverse media score
      const adverseRows = await db.select().from(adverseMediaScreenings)
        .where(and(
          eq(adverseMediaScreenings.merchantId, ctx.user.tenantId ?? ""),
          eq(adverseMediaScreenings.flagged, true),
        ));
      const adverseMediaScore = Math.min(100, adverseRows.length * 25);

      // 3. Geo-velocity score
      const geoVelocityScore = verification.geoVelocityFlagged ? 40 : 0;

      // 4. Document quality score (based on temporal consistency failures)
      const tempChecks = await db.select().from(temporalConsistencyChecks)
        .where(eq(temporalConsistencyChecks.merchantId, ctx.user.tenantId ?? ""));
      const failedChecks = tempChecks.filter(c => !c.passed).length;
      const documentQualityScore = Math.min(100, failedChecks * 20);

      // 5. Liveness score (based on recent liveness sessions)
      const livenessRows = await db.select().from(livenessSessions)
        .where(eq(livenessSessions.merchantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(livenessSessions.createdAt)).limit(5);
      const failedLiveness = livenessRows.filter(l => l.decision === "spoof").length;
      const livenessScore = Math.min(100, failedLiveness * 20);

      // 6. BVN match score
      const bvnMatchScore = (verification as any).bvnValidated === false ? 50 : 0;

      // Composite score (weighted average)
      const compositeScore = Math.round(
        uboRiskScore * 0.25 +
        adverseMediaScore * 0.25 +
        geoVelocityScore * 0.15 +
        documentQualityScore * 0.15 +
        livenessScore * 0.10 +
        bvnMatchScore * 0.10
      );

      const riskBand =
        compositeScore >= 75 ? "critical" :
        compositeScore >= 50 ? "high" :
        compositeScore >= 25 ? "medium" : "low";

      const [row] = await db.insert(kybRiskScores).values({
        verificationId: input.verificationId,
        merchantId: ctx.user.tenantId ?? "",
        compositeScore,
        riskBand,
        uboRiskScore,
        adverseMediaScore,
        geoVelocityScore,
        documentQualityScore,
        livenessScore,
        bvnMatchScore,
        scoredBy: "auto",
      }).returning();

      // Update KYB verification risk level to match
      await db.update(kybVerifications).set({
        riskLevel: riskBand === "critical" ? "high" : riskBand === "high" ? "high" : riskBand === "medium" ? "medium" : "low",
        updatedAt: new Date(),
      }).where(eq(kybVerifications.verificationId, input.verificationId));

      publishAuditEvent({
        action: "kyb.risk_score.computed",
        actorId: ctx.user.openId,
        targetId: input.verificationId,
        metadata: { compositeScore, riskBand },
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      return row;
    }),

  latest: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(kybRiskScores)
        .where(and(
          eq(kybRiskScores.verificationId, input.verificationId),
          eq(kybRiskScores.merchantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(kybRiskScores.scoredAt)).limit(1);
      return row ?? null;
    }),

  history: protectedProcedure
    .input(z.object({
      verificationId: z.string(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      return db.select().from(kybRiskScores)
        .where(and(
          eq(kybRiskScores.verificationId, input.verificationId),
          eq(kybRiskScores.merchantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(kybRiskScores.scoredAt)).limit(input.limit);
    }),
});
