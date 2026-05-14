/**
 * SIP (Systematic Investment Plan) Router
 * Handles recurring investment schedules for Digital Gold, Mutual Funds, and Pension
 * Uses PostgreSQL-compatible SQL via Drizzle ORM
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import crypto from "crypto";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { createGoldSIPViaMiddleware, isBridgeAvailable } from "./middlewareBridge";

function nanoid(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

export const sipRouter = router({
  // List all SIP plans for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { plans: [] };
    const result = await db.execute(sql`
      SELECT id, asset_type, amount_kobo, frequency, next_execution_at, status, created_at,
             total_invested_kobo, execution_count, last_executed_at, fund_id, notes
      FROM sip_plans
      WHERE user_id = ${ctx.user.id}
      ORDER BY created_at DESC
    `);
    return { plans: result.rows as any[] };
  }),

  // Create a new SIP plan
  create: protectedProcedure
    .input(z.object({
      assetType: z.enum(["gold", "mutual_fund", "pension"]),
      amountKobo: z.number().min(100_000).max(10_000_000_000),
      frequency: z.enum(["daily", "weekly", "monthly"]),
      startDate: z.string().datetime().optional(),
      fundId: z.string().optional(),
      notes: z.string().max(200).optional(),
    }))
     .mutation(async ({ input, ctx }) => {
      // Try middleware bridge for gold SIPs
      if (isBridgeAvailable() && input.assetType === "gold") {
        const dayOfMonth = input.startDate ? new Date(input.startDate).getDate() : new Date().getDate();
        const result = await createGoldSIPViaMiddleware(ctx.user.id, input.amountKobo / 100, dayOfMonth);
        if (result) return { success: true, planId: result.sipId, nextExecutionAt: new Date().toISOString() };
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const planId = nanoid("sip_");
      const startAt = input.startDate ? new Date(input.startDate) : new Date();
      // Compute next execution based on frequency (PostgreSQL interval)
      const nextExec = new Date(startAt);;
      if (input.frequency === "daily") nextExec.setDate(nextExec.getDate() + 1);
      else if (input.frequency === "weekly") nextExec.setDate(nextExec.getDate() + 7);
      else nextExec.setMonth(nextExec.getMonth() + 1);

      await db.execute(sql`
        INSERT INTO sip_plans (
          id, user_id, asset_type, amount_kobo, frequency,
          fund_id, notes, status, next_execution_at,
          total_invested_kobo, execution_count, created_at
        ) VALUES (
          ${planId}, ${ctx.user.id}, ${input.assetType}, ${input.amountKobo},
          ${input.frequency}, ${input.fundId ?? null}, ${input.notes ?? null},
          'active', ${nextExec.toISOString()}, 0, 0, NOW()
        )
      `);

      logger.info(`[SIP] Plan ${planId} created for user ${ctx.user.id}: ${input.assetType} ${input.frequency}`);
      return { success: true, planId, nextExecutionAt: nextExec.toISOString() };
    }),

  // Update a SIP plan (amount, frequency, pause/resume)
  update: protectedProcedure
    .input(z.object({
      planId: z.string(),
      amountKobo: z.number().min(100_000).optional(),
      frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
      status: z.enum(["active", "paused"]).optional(),
      notes: z.string().max(200).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify ownership
      const check = await db.execute(sql`
        SELECT id FROM sip_plans WHERE id = ${input.planId} AND user_id = ${ctx.user.id}
      `);
      if (!check.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "SIP plan not found" });

      // Build SET clause dynamically
      const sets: any[] = [];
      if (input.amountKobo !== undefined) sets.push(sql`amount_kobo = ${input.amountKobo}`);
      if (input.frequency !== undefined) sets.push(sql`frequency = ${input.frequency}`);
      if (input.status !== undefined) sets.push(sql`status = ${input.status}`);
      if (input.notes !== undefined) sets.push(sql`notes = ${input.notes}`);
      sets.push(sql`updated_at = NOW()`);

      const setClauses = sets.reduce((acc, s, i) => i === 0 ? s : sql`${acc}, ${s}`);
      await db.execute(sql`
        UPDATE sip_plans SET ${setClauses}
        WHERE id = ${input.planId} AND user_id = ${ctx.user.id}
      `);

      return { success: true, planId: input.planId };
    }),

  // Cancel a SIP plan
  cancel: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const result = await db.execute(sql`
        UPDATE sip_plans SET status = 'cancelled', updated_at = NOW()
        WHERE id = ${input.planId} AND user_id = ${ctx.user.id}
        RETURNING id
      `);
      if (!result.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "SIP plan not found" });

      return { success: true, planId: input.planId };
    }),

  // Get execution history for a SIP plan
  getHistory: protectedProcedure
    .input(z.object({ planId: z.string(), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { executions: [] };
      const result = await db.execute(sql`
        SELECT e.id, e.plan_id, e.amount_kobo, e.status, e.executed_at, e.error_message
        FROM sip_executions e
        JOIN sip_plans p ON e.plan_id = p.id
        WHERE e.plan_id = ${input.planId} AND p.user_id = ${ctx.user.id}
        ORDER BY e.executed_at DESC
        LIMIT ${input.limit}
      `);
      return { executions: result.rows as any[] };
    }),

  // Get SIP summary stats for the current user
  summary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { totalPlans: 0, activePlans: 0, totalInvestedKobo: 0, nextExecution: null };
    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total_plans,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_plans,
        COALESCE(SUM(total_invested_kobo), 0) as total_invested_kobo,
        MIN(CASE WHEN status = 'active' THEN next_execution_at END) as next_execution
      FROM sip_plans
      WHERE user_id = ${ctx.user.id}
    `);
    const row = result.rows[0] as any;
    return {
      totalPlans: Number(row?.total_plans ?? 0),
      activePlans: Number(row?.active_plans ?? 0),
      totalInvestedKobo: Number(row?.total_invested_kobo ?? 0),
      nextExecution: row?.next_execution ?? null,
    };
  }),
});
