import { z } from "zod";
import { desc } from "drizzle-orm";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getDb } from "../db";
import { securityAuditSnapshots } from "../../drizzle/schema";

function gradeFor(score: number): string {
  if (score >= 97) return "A+";
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return "D";
}

export const systemRouter = router({
  /**
   * Latest nightly security audit snapshot (platform scope).
   * Returns null when no audit has ever run — the client renders
   * "No run recorded yet" in that case. Never fabricates a result.
   */
  nightlyAuditStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(securityAuditSnapshots)
      .orderBy(desc(securityAuditSnapshots.createdAt))
      .limit(1);
    const latest = rows[0];
    if (!latest) return null;
    const findings = (latest.findings as any[]) ?? [];
    const p0Failures = findings.filter(
      (f) => f?.severity === "p0" && f?.status === "fail",
    ).length;
    return {
      score: latest.overallScore,
      grade: gradeFor(latest.overallScore),
      p0Failures,
      findings,
      triggeredBy: latest.triggeredBy,
      runAt: latest.createdAt.toISOString(),
    };
  }),

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
