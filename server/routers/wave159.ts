/**
 * Wave 159 — Liveness Replay Viewer & Ensemble Scoring Router
 *
 * Provides:
 *   1. listSessions — paginated list of liveness sessions for a merchant
 *   2. getSession   — full session detail with ensemble score breakdown
 *   3. overrideDecision — admin override of liveness decision
 *   4. stats        — aggregate liveness stats (pass/fail/uncertain counts)
 *   5. ensembleScore — compute weighted ensemble score from three service scores
 */
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { logger } from "../logger";
import { z } from "zod";
import { getDb } from "../db";
import { livenessSessions } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, count, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { publishEvent, KAFKA_TOPICS } from "../kafkaClient";
import { notifyMerchant } from "../pushClient";

// ─── Ensemble scoring weights ─────────────────────────────────────────────────
const DEFAULT_WEIGHTS = { rust: 0.3, go: 0.3, python: 0.4 };

function computeEnsemble(
  rust: number | null,
  go: number | null,
  python: number | null,
  weights = DEFAULT_WEIGHTS
): number {
  let total = 0;
  let wSum = 0;
  if (rust !== null) { total += rust * weights.rust; wSum += weights.rust; }
  if (go !== null)   { total += go   * weights.go;   wSum += weights.go;   }
  if (python !== null) { total += python * weights.python; wSum += weights.python; }
  if (wSum === 0) return 0;
  return total / wSum;
}

export const wave159Router = router({
  // ─── List sessions ──────────────────────────────────────────────────────────
  listSessions: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      decision: z.enum(["real", "spoof", "uncertain"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const conditions = [];
      if (input.merchantId) conditions.push(eq(livenessSessions.merchantId, input.merchantId));
      if (input.decision)   conditions.push(eq(livenessSessions.decision, input.decision));
      if (input.from)       conditions.push(gte(livenessSessions.createdAt, new Date(input.from)));
      if (input.to)         conditions.push(lte(livenessSessions.createdAt, new Date(input.to)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, [{ total }]] = await Promise.all([
        db.select().from(livenessSessions)
          .where(where)
          .orderBy(desc(livenessSessions.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: count() }).from(livenessSessions).where(where),
      ]);

      // Compute ensemble score for each row
      const enriched = rows.map(r => ({
        ...r,
        ensembleScore: computeEnsemble(r.rustSignalScore, r.goGatewayScore, r.pythonMlScore),
      }));

      return { rows: enriched, total: Number(total) };
    }),

  // ─── Get single session ──────────────────────────────────────────────────────
  getSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [session] = await db.select().from(livenessSessions)
        .where(eq(livenessSessions.id, input.id))
        .limit(1);

      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const ensembleScore = computeEnsemble(
        session.rustSignalScore,
        session.goGatewayScore,
        session.pythonMlScore,
      );

      return {
        ...session,
        ensembleScore,
        weights: session.ensembleWeights ?? DEFAULT_WEIGHTS,
        scoreBreakdown: {
          rust:   { score: session.rustSignalScore,   weight: DEFAULT_WEIGHTS.rust,   label: "Rust Signal Processor (Fourier/LBP/Colour)" },
          go:     { score: session.goGatewayScore,     weight: DEFAULT_WEIGHTS.go,     label: "Go API Gateway (Face-Match/Detect)" },
          python: { score: session.pythonMlScore, weight: DEFAULT_WEIGHTS.python, label: "Python ML (InsightFace/SilentFace)" },
        },
      };
    }),

  // ─── Override decision ───────────────────────────────────────────────────────
  // PLATFORM-ADMIN ONLY: overriding a liveness (anti-spoofing/KYC) decision is
  // a security-critical action. The role is re-checked from the DB on every
  // call (never trusted from the session/JWT), matching adminRouter's
  // adminProcedure pattern.
  overrideDecision: protectedProcedure
    .input(z.object({
      id: z.string(),
      decision: z.enum(["real", "spoof", "uncertain"]),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { users } = await import("../../drizzle/schema");
      const [adminUser] = await db.select({ role: users.role })
        .from(users)
        .where(eq(users.openId, ctx.user.openId))
        .limit(1);
      if (!adminUser || adminUser.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required to override liveness decisions" });
      }

      const [updated] = await db.update(livenessSessions)
        .set({
          overrideDecision: input.decision,
          overrideNote: input.note ?? null,
          overrideBy: String(ctx.user.id),
          overrideAt: new Date(),
        })
        .where(eq(livenessSessions.id, input.id))
        .returning({ id: livenessSessions.id });

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return { success: true };
    }),

  // ─── Stats ───────────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      days: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { total: 0, real: 0, spoof: 0, uncertain: 0, avgScore: 0, avgDurationMs: 0 };

      const since = new Date(Date.now() - input.days * 86_400_000);
      const conditions = [gte(livenessSessions.createdAt, since)];
      if (input.merchantId) conditions.push(eq(livenessSessions.merchantId, input.merchantId));

      const [result] = await db.select({
        total: count(),
        avgScore: sql<number>`avg(liveness_score)`,
        avgDurationMs: sql<number>`avg(duration_ms)`,
      }).from(livenessSessions).where(and(...conditions));

      const decisionCounts = await db.select({
        decision: livenessSessions.decision,
        cnt: count(),
      }).from(livenessSessions)
        .where(and(...conditions))
        .groupBy(livenessSessions.decision);

      const byDecision: Record<string, number> = {};
      for (const row of decisionCounts) {
        if (row.decision) byDecision[row.decision] = Number(row.cnt);
      }

      return {
        total: Number(result?.total ?? 0),
        real: byDecision["real"] ?? 0,
        spoof: byDecision["spoof"] ?? 0,
        uncertain: byDecision["uncertain"] ?? 0,
        avgScore: Number(result?.avgScore ?? 0),
        avgDurationMs: Number(result?.avgDurationMs ?? 0),
      };
    }),

  // ─── Compute ensemble score (on-demand, no DB write) ─────────────────────────
  ensembleScore: protectedProcedure
    .input(z.object({
      rustScore:   z.number().min(0).max(1).nullable(),
      goScore:     z.number().min(0).max(1).nullable(),
      pythonScore: z.number().min(0).max(1).nullable(),
      weights: z.object({
        rust:   z.number().min(0).max(1).default(0.3),
        go:     z.number().min(0).max(1).default(0.3),
        python: z.number().min(0).max(1).default(0.4),
      }).optional(),
    }))
    .mutation(({ input }) => {
      const w = input.weights ?? DEFAULT_WEIGHTS;
      const score = computeEnsemble(input.rustScore, input.goScore, input.pythonScore, w);
      const decision: "real" | "spoof" | "uncertain" =
        score >= 0.75 ? "real" : score <= 0.35 ? "spoof" : "uncertain";
      return { score, decision, weights: w };
    }),

  // ─── Ingest session (called by liveness service webhook) ─────────────────────
  ingestSession: protectedProcedure
    .input(z.object({
      merchantId:      z.string(),
      submissionId:    z.string().optional(),
      sessionRef:      z.string().optional(),
      mode:            z.enum(["passive", "active", "full"]).default("passive"),
      challengeType:   z.string().optional(),
      livenessScore:   z.number().min(0).max(1).optional(),
      confidenceScore: z.number().min(0).max(1).optional(),
      spoofType:       z.string().optional(),
      rustSignalScore: z.number().min(0).max(1).optional(),
      goGatewayScore:  z.number().min(0).max(1).optional(),
      pythonMlScore:   z.number().min(0).max(1).optional(),
      frameCount:      z.number().int().min(0).default(0),
      passiveFrameUrl: z.string().url().optional(),
      challengeFrameUrls: z.array(z.string().url()).optional(),
      ipAddress:       z.string().optional(),
      userAgent:       z.string().optional(),
      deviceType:      z.string().optional(),
      durationMs:      z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const ensembleScore = computeEnsemble(
        input.rustSignalScore ?? null,
        input.goGatewayScore  ?? null,
        input.pythonMlScore   ?? null,
      );
      const decision: "real" | "spoof" | "uncertain" =
        ensembleScore >= 0.75 ? "real" : ensembleScore <= 0.35 ? "spoof" : "uncertain";

      const id = `ls_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      await db.insert(livenessSessions).values({
        id,
        merchantId:      input.merchantId,
        submissionId:    input.submissionId ?? null,
        sessionRef:      input.sessionRef ?? null,
        mode:            input.mode,
        challengeType:   input.challengeType ?? null,
        decision,
        livenessScore:   input.livenessScore ?? null,
        confidenceScore: input.confidenceScore ?? null,
        spoofType:       input.spoofType ?? null,
        rustSignalScore: input.rustSignalScore ?? null,
        goGatewayScore:  input.goGatewayScore  ?? null,
        pythonMlScore:   input.pythonMlScore   ?? null,
        ensembleWeights: DEFAULT_WEIGHTS,
        frameCount:      input.frameCount,
        passiveFrameUrl: input.passiveFrameUrl ?? null,
        challengeFrameUrls: input.challengeFrameUrls ?? null,
        ipAddress:       input.ipAddress ?? null,
        userAgent:       input.userAgent ?? null,
        deviceType:      input.deviceType ?? null,
        durationMs:      input.durationMs ?? null,
      });

      // ── Kafka: liveness.completed event (Fix 3) ─────────────────────────────
      publishEvent(
        KAFKA_TOPICS.KYC,
        {
          type: "liveness.completed",
          sessionId: id,
          merchantId: input.merchantId,
          submissionId: input.submissionId ?? null,
          decision,
          ensembleScore,
          scoreBreakdown: {
            rust:   input.rustSignalScore ?? null,
            go:     input.goGatewayScore  ?? null,
            python: input.pythonMlScore   ?? null,
          },
          mode: input.mode,
          durationMs: input.durationMs ?? null,
          timestamp: new Date().toISOString(),
        },
        input.merchantId,
        { "x-event-type": "liveness.completed" },
      ).catch((e) => logger.error("[wave159] liveness.completed event publish failed", e));
      // ── Push notification: liveness result to merchant (Fix 3) ────────────────
      if (decision === "spoof") {
        notifyMerchant({
          merchantId: input.merchantId,
          notification: {
            title: "Liveness Check Failed",
            body: "A liveness verification attempt was flagged. Please contact support if this was unexpected.",
          },
          type: "liveness_failed",
          data: { sessionId: id, decision, ensembleScore: String(ensembleScore) },
        }).catch((e) => logger.error("[wave159] spoof alert notification failed — merchant NOT alerted of liveness failure", { sessionId: id, error: e instanceof Error ? e.message : String(e) }));
      }
      return { id, decision, ensembleScore };
    }),
});
