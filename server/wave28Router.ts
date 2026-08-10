/**
 * wave28Router.ts — Wave 28 Production Finalization
 *
 * Features:
 * A: Webhook retry bulk replay (dead-letter queue management)
 * B: Loyalty tier auto-promotion cron + push notifications
 * C: BNPL repayment schedule with amortisation table
 * D: Invite-code system (generate, validate, revoke)
 * E: Partner onboarding wizard (5-step: invite → company → branding → fees → review)
 * F: Tenant admin dashboard (sub-users, branding, corridors, fee overrides)
 * G: Tenant isolation middleware + white-label preview
 */

import { z } from "zod";
import { sql } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb, execRaw } from "./db";
import crypto from "crypto";

// ─── A: Webhook Retry Bulk Replay ────────────────────────────────────────────
const webhookRetryEnhancedRouter = router({
  // List deliveries with filters
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      let whereClause = "WHERE 1=1";
      const params: any[] = [];
      let paramIdx = 1;

      if (input.status && input.status !== "all") {
        whereClause += ` AND wd.status = $${paramIdx++}`;
        params.push(input.status);
      }
      if (input.search) {
        whereClause += ` AND (wd.event_type ILIKE $${paramIdx} OR wd.endpoint_url ILIKE $${paramIdx})`;
        params.push(`%${input.search}%`);
        paramIdx++;
      }

      const result = await execRaw(db, `
        SELECT
          wd.id,
          wd.event_type,
          wd.endpoint_url,
          wd.status,
          wd.attempt_count,
          wd.max_attempts,
          wd.response_status,
          wd.error_message,
          wd.next_retry_at,
          wd.retry_at,
          wd.created_at,
          wd.merchant_id,
          wd.tenant_id
        FROM webhook_deliveries wd
        ${whereClause}
        ORDER BY wd.created_at DESC
        LIMIT ${input.limit}
      `);

      const statsResult = await db.execute(sql.raw(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
          COUNT(*) FILTER (WHERE status = 'abandoned' OR status = 'dead_letter') as abandoned_count,
          COUNT(*) FILTER (WHERE status = 'success' AND delivered_at > NOW() - INTERVAL '24 hours') as succeeded_today
        FROM webhook_deliveries
      `));

      const stats = (statsResult as any).rows[0];
      return {
        deliveries: (result as any).rows,
        stats: {
          pendingCount: Number(stats?.pending_count ?? 0),
          failedCount: Number(stats?.failed_count ?? 0),
          abandonedCount: Number(stats?.abandoned_count ?? 0),
          succeededToday: Number(stats?.succeeded_today ?? 0),
        },
      };
    }),

  // Retry a single delivery
  retry: protectedProcedure
    .input(z.object({
      deliveryId: z.string(),
      delayMinutes: z.number().min(0).max(1440).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const retryAt = input.delayMinutes > 0
        ? new Date(Date.now() + input.delayMinutes * 60000).toISOString()
        : new Date().toISOString();
      await execRaw(db, `
        UPDATE webhook_deliveries SET
          status = 'pending',
          retry_at = $1,
          next_retry_at = $1,
          attempt_count = COALESCE(attempt_count, 0),
          updated_at = NOW()
        WHERE id = $2
      `, [retryAt, input.deliveryId]);
      return { success: true, retryAt };
    }),

  // Bulk retry all failed/abandoned deliveries
  retryAll: protectedProcedure
    .input(z.object({
      statuses: z.array(z.string()).default(["failed", "abandoned", "dead_letter"]),
      delayMinutes: z.number().min(0).max(60).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const retryAt = input.delayMinutes > 0
        ? new Date(Date.now() + input.delayMinutes * 60000).toISOString()
        : new Date().toISOString();
      const statusList = input.statuses.map((_, i) => `$${i + 2}`).join(", ");
      const result = await execRaw(db, `
        UPDATE webhook_deliveries SET
          status = 'pending',
          retry_at = $1,
          next_retry_at = $1,
          updated_at = NOW()
        WHERE status IN (${statusList})
        AND (max_attempts IS NULL OR attempt_count < max_attempts)
      `, [retryAt, ...input.statuses]);
      const count = (result as any).rowCount ?? 0;
      return { success: true, count, retryAt };
    }),

  // Bulk replay dead-letter queue with configurable delay
  bulkReplayDeadLetter: protectedProcedure
    .input(z.object({
      delaySeconds: z.number().min(0).max(3600).default(30),
      resetAttemptCount: z.boolean().default(true),
      maxBatch: z.number().min(1).max(500).default(100),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const retryAt = new Date(Date.now() + input.delaySeconds * 1000).toISOString();
      const resetClause = input.resetAttemptCount ? ", attempt_count = 0" : "";
      const result = await execRaw(db, `
        UPDATE webhook_deliveries SET
          status = 'pending',
          retry_at = $1,
          next_retry_at = $1,
          updated_at = NOW()
          ${resetClause}
        WHERE status IN ('abandoned', 'dead_letter', 'failed')
        AND id IN (
          SELECT id FROM webhook_deliveries
          WHERE status IN ('abandoned', 'dead_letter', 'failed')
          ORDER BY created_at ASC
          LIMIT $2
        )
      `, [retryAt, input.maxBatch]);
      const count = (result as any).rowCount ?? 0;
      return { success: true, count, retryAt, resetAttemptCount: input.resetAttemptCount };
    }),

  // Abandon a delivery (move to dead-letter)
  abandon: protectedProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE webhook_deliveries SET
          status = 'abandoned',
          updated_at = NOW()
        WHERE id = $1
      `, [input.deliveryId]);
      return { success: true };
    }),

  // Get dead-letter queue stats
  getDeadLetterStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT
        COUNT(*) as total_dead_letter,
        COUNT(DISTINCT merchant_id) as affected_merchants,
        COUNT(DISTINCT event_type) as distinct_event_types,
        MIN(created_at) as oldest_entry,
        MAX(created_at) as newest_entry,
        SUM(attempt_count) as total_attempts_made
      FROM webhook_deliveries
      WHERE status IN ('abandoned', 'dead_letter', 'failed')
    `);
    const row = (result as any).rows[0];

    const byEventType = await db.execute(`
      SELECT event_type, COUNT(*) as count
      FROM webhook_deliveries
      WHERE status IN ('abandoned', 'dead_letter', 'failed')
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      summary: row,
      byEventType: (byEventType as any).rows,
    };
  }),
});

// ─── B: Loyalty Tier Auto-Promotion Engine ───────────────────────────────────
const loyaltyAutoPromotionRouter = router({
  // Run tier evaluation for all consumers (normally called by cron)
  runTierEvaluation: protectedProcedure
    .input(z.object({
      dryRun: z.boolean().default(false),
      sendNotifications: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Get all tier configs ordered by min_points
      const tiersResult = await db.execute(`
        SELECT tier_name, min_points, max_points, cashback_rate, bonus_multiplier
        FROM loyalty_tier_configs
        ORDER BY min_points ASC
      `);
      const tiers = (tiersResult as any).rows;

      if (tiers.length === 0) {
        return { evaluated: 0, upgraded: 0, downgraded: 0, unchanged: 0, dryRun: input.dryRun };
      }

      // Get all loyalty accounts with their current points
      const accountsResult = await db.execute(`
        SELECT id, user_id, points_balance, lifetime_points, tier
        FROM consumer_loyalty_accounts
      `);
      const accounts = (accountsResult as any).rows;

      const changes: Array<{ userId: number; oldTier: string; newTier: string; points: number }> = [];
      let upgraded = 0, downgraded = 0, unchanged = 0;

      for (const account of accounts) {
        const points = Number(account.lifetime_points ?? account.points_balance ?? 0);
        // Find the highest tier the user qualifies for
        let newTier = tiers[0].tier_name; // default to lowest
        for (const tier of tiers) {
          if (points >= Number(tier.min_points)) {
            newTier = tier.tier_name;
          }
        }

        if (newTier !== account.tier) {
          const tierRanks: Record<string, number> = {};
          tiers.forEach((t: any, i: number) => { tierRanks[t.tier_name] = i; });
          const isUpgrade = (tierRanks[newTier] ?? 0) > (tierRanks[account.tier] ?? 0);

          changes.push({ userId: account.user_id, oldTier: account.tier, newTier, points });
          if (isUpgrade) upgraded++; else downgraded++;

          if (!input.dryRun) {
            await execRaw(db, `
              UPDATE consumer_loyalty_accounts SET tier = $1, updated_at = NOW() WHERE id = $2
            `, [newTier, account.id]);
          }
        } else {
          unchanged++;
        }
      }

      // Record evaluation in audit log
      if (!input.dryRun && changes.length > 0) {
        await execRaw(db, `
          INSERT INTO audit_logs (action, resource_type, resource_id, details, created_at)
          VALUES ('loyalty_tier_evaluation', 'system', 'cron', $1::jsonb, NOW())
        `, [JSON.stringify({ upgraded, downgraded, unchanged, total: accounts.length })]);
      }

      return {
        evaluated: accounts.length,
        upgraded,
        downgraded,
        unchanged,
        changes: input.dryRun ? changes.slice(0, 20) : [],
        dryRun: input.dryRun,
      };
    }),

  // Get tier distribution stats
  getTierDistribution: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT
        cla.tier,
        COUNT(*) as member_count,
        AVG(cla.points_balance) as avg_points,
        AVG(cla.lifetime_points) as avg_lifetime_points,
        ltc.cashback_rate,
        ltc.bonus_multiplier
      FROM consumer_loyalty_accounts cla
      LEFT JOIN loyalty_tier_configs ltc ON ltc.tier_name = cla.tier
      GROUP BY cla.tier, ltc.cashback_rate, ltc.bonus_multiplier
      ORDER BY ltc.min_points ASC NULLS LAST
    `);
    return (result as any).rows;
  }),

  // Get recent tier changes
  getRecentChanges: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT
          al.details,
          al.created_at,
          al.action
        FROM audit_logs al
        WHERE al.action IN ('loyalty_tier_evaluation', 'loyalty_tier_upgrade', 'loyalty_tier_downgrade')
        ORDER BY al.created_at DESC
        LIMIT $1
      `, [input.limit]);
      return (result as any).rows;
    }),

  // Manually override a user's tier
  overrideTier: protectedProcedure
    .input(z.object({
      userId: z.number(),
      newTier: z.enum(["bronze", "silver", "gold", "platinum"]),
      reason: z.string().min(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const current = await execRaw(db, `
        SELECT tier FROM consumer_loyalty_accounts WHERE user_id = $1
      `, [input.userId]);
      const oldTier = (current as any).rows[0]?.tier ?? "bronze";

      await execRaw(db, `
        UPDATE consumer_loyalty_accounts SET tier = $1, updated_at = NOW() WHERE user_id = $2
      `, [input.newTier, input.userId]);

      await execRaw(db, `
        INSERT INTO audit_logs (action, resource_type, resource_id, details, created_at)
        VALUES ('loyalty_tier_override', 'user', $1::text, $2::jsonb, NOW())
      `, [input.userId.toString(), JSON.stringify({ oldTier, newTier: input.newTier, reason: input.reason })]);

      return { success: true, oldTier, newTier: input.newTier };
    }),

  // Get tier config (for display)
  getTierConfigs: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT * FROM loyalty_tier_configs ORDER BY min_points ASC
    `);
    return (result as any).rows;
  }),

  // Update tier config
  updateTierConfig: protectedProcedure
    .input(z.object({
      tierName: z.string(),
      minPoints: z.number().min(0),
      cashbackRate: z.number().min(0).max(100),
      bonusMultiplier: z.number().min(1).max(10),
      perksDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE loyalty_tier_configs SET
          min_points = $1,
          cashback_rate = $2,
          bonus_multiplier = $3,
          perks_description = $4,
          updated_at = NOW()
        WHERE tier_name = $5
      `, [input.minPoints, input.cashbackRate, input.bonusMultiplier, input.perksDescription ?? null, input.tierName]);
      return { success: true };
    }),
});

// ─── C: BNPL Repayment Schedule ───────────────────────────────────────────────
const bnplRepaymentRouter = router({
  // Generate amortisation schedule for an approved application
  generateSchedule: protectedProcedure
    .input(z.object({
      applicationId: z.number(),
      loanAmount: z.number().min(1000),
      interestRateMonthly: z.number().min(0).max(50).default(2.5),
      repaymentMonths: z.number().min(1).max(60).default(12),
      startDate: z.string().optional(), // ISO date string
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Delete existing schedule for this application
      await execRaw(db, `DELETE FROM bnpl_repayment_schedules WHERE application_id = $1`, [input.applicationId]);

      const monthlyRate = input.interestRateMonthly / 100;
      const n = input.repaymentMonths;
      const P = input.loanAmount;

      // Standard amortisation formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
      let monthlyPayment: number;
      if (monthlyRate === 0) {
        monthlyPayment = P / n;
      } else {
        monthlyPayment = P * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
      }
      monthlyPayment = Math.ceil(monthlyPayment * 100) / 100; // round up to nearest kobo

      const startDate = input.startDate ? new Date(input.startDate) : new Date();
      let outstandingBalance = P;
      const schedule = [];

      for (let i = 1; i <= n; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);

        const interestAmount = Math.round(outstandingBalance * monthlyRate * 100) / 100;
        const principalAmount = Math.round((monthlyPayment - interestAmount) * 100) / 100;
        outstandingBalance = Math.max(0, Math.round((outstandingBalance - principalAmount) * 100) / 100);

        // Last instalment: pay off remaining balance
        const totalAmount = i === n ? (principalAmount + interestAmount + outstandingBalance) : monthlyPayment;
        const finalBalance = i === n ? 0 : outstandingBalance;

        schedule.push({
          applicationId: input.applicationId,
          instalmentNumber: i,
          dueDate: dueDate.toISOString().split("T")[0],
          principalAmount: i === n ? principalAmount + outstandingBalance : principalAmount,
          interestAmount,
          totalAmount: Math.round(totalAmount * 100) / 100,
          outstandingBalance: finalBalance,
        });

        if (i === n) outstandingBalance = 0;
      }

      // Bulk insert schedule
      for (const row of schedule) {
        await execRaw(db, `
          INSERT INTO bnpl_repayment_schedules
            (application_id, instalment_number, due_date, principal_amount, interest_amount, total_amount, outstanding_balance, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        `, [row.applicationId, row.instalmentNumber, row.dueDate, row.principalAmount, row.interestAmount, row.totalAmount, row.outstandingBalance]);
      }

      // Update application with repayment details
      await execRaw(db, `
        UPDATE bnpl_applications SET
          repayment_months = $1,
          interest_rate = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [n, input.interestRateMonthly, input.applicationId]);

      return {
        applicationId: input.applicationId,
        loanAmount: P,
        monthlyPayment,
        totalInterest: Math.round((monthlyPayment * n - P) * 100) / 100,
        totalRepayable: Math.round(monthlyPayment * n * 100) / 100,
        schedule,
      };
    }),

  // Get schedule for an application
  getSchedule: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const app = await execRaw(db, `
        SELECT id, consumer_id, requested_limit, approved_limit, score, status,
               repayment_months, interest_rate, currency
        FROM bnpl_applications WHERE id = $1
      `, [input.applicationId]);

      const schedule = await execRaw(db, `
        SELECT * FROM bnpl_repayment_schedules
        WHERE application_id = $1
        ORDER BY instalment_number ASC
      `, [input.applicationId]);

      const rows = (schedule as any).rows;
      const totalPaid = rows.filter((r: any) => r.status === "paid").reduce((s: number, r: any) => s + Number(r.total_amount), 0);
      const totalDue = rows.reduce((s: number, r: any) => s + Number(r.total_amount), 0);

      return {
        application: (app as any).rows[0],
        schedule: rows,
        summary: {
          totalInstalments: rows.length,
          paidInstalments: rows.filter((r: any) => r.status === "paid").length,
          pendingInstalments: rows.filter((r: any) => r.status === "pending").length,
          overdueInstalments: rows.filter((r: any) => r.status === "overdue").length,
          totalPaid: Math.round(totalPaid * 100) / 100,
          totalDue: Math.round(totalDue * 100) / 100,
          outstandingBalance: Math.round((totalDue - totalPaid) * 100) / 100,
        },
      };
    }),

  // Mark an instalment as paid
  markPaid: protectedProcedure
    .input(z.object({
      scheduleId: z.number(),
      paidAt: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE bnpl_repayment_schedules SET
          status = 'paid',
          paid_at = $1
        WHERE id = $2
      `, [input.paidAt ?? new Date().toISOString(), input.scheduleId]);
      return { success: true };
    }),

  // Mark overdue instalments
  markOverdue: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      UPDATE bnpl_repayment_schedules SET status = 'overdue'
      WHERE status = 'pending' AND due_date < CURRENT_DATE
    `);
    return { count: (result as any).rowCount ?? 0 };
  }),

  // List all applications with schedule summary
  listApplications: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      let where = "WHERE 1=1";
      const params: any[] = [input.limit];
      if (input.status) {
        where += " AND ba.status = $2";
        params.push(input.status);
      }
      const result = await db.execute(`
        SELECT
          ba.*,
          COUNT(brs.id) as total_instalments,
          COUNT(brs.id) FILTER (WHERE brs.status = 'paid') as paid_instalments,
          COUNT(brs.id) FILTER (WHERE brs.status = 'overdue') as overdue_instalments,
          SUM(brs.total_amount) FILTER (WHERE brs.status = 'pending' OR brs.status = 'overdue') as outstanding_balance
        FROM bnpl_applications ba
        LEFT JOIN bnpl_repayment_schedules brs ON brs.application_id = ba.id
        ${where}
        GROUP BY ba.id
        ORDER BY ba.created_at DESC
        LIMIT ${input.limit}
      `);
      return (result as any).rows;
    }),
});

// ─── D: Invite Code System ────────────────────────────────────────────────────
const inviteCodeRouter = router({
  // Generate a new invite code
  generate: protectedProcedure
    .input(z.object({
      type: z.enum(["single_use", "multi_use", "unlimited"]).default("single_use"),
      maxUses: z.number().min(1).max(10000).optional(),
      expiresInDays: z.number().min(1).max(365).optional(),
      plan: z.enum(["starter", "growth", "scale", "enterprise"]).default("starter"),
      notes: z.string().max(500).optional(),
      prefix: z.string().max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Generate a readable code: PREFIX-XXXX-XXXX
      const prefix = input.prefix?.toUpperCase() ?? "PG";
      const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
      const code = `${prefix}-${randomPart.slice(0, 4)}-${randomPart.slice(4)}`;

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
        : null;

      const usesRemaining = input.type === "single_use" ? 1
        : input.type === "multi_use" ? (input.maxUses ?? 10)
        : null; // unlimited

      await execRaw(db, `
        INSERT INTO invite_codes
          (code, type, uses_remaining, max_uses, expires_at, created_by, plan, notes, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      `, [code, input.type, usesRemaining, input.maxUses ?? null, expiresAt, ctx.user?.name ?? "admin", input.plan, input.notes ?? null]);

      return { code, type: input.type, expiresAt, plan: input.plan };
    }),

  // Validate an invite code (public — used during partner onboarding)
  validate: publicProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT id, code, type, uses_remaining, max_uses, uses_total, expires_at, plan, notes, is_active
        FROM invite_codes
        WHERE code = $1
      `, [input.code.toUpperCase()]);

      const row = (result as any).rows[0];
      if (!row) return { valid: false, reason: "Code not found" };
      if (!row.is_active) return { valid: false, reason: "Code has been revoked" };
      if (row.expires_at && new Date(row.expires_at) < new Date()) return { valid: false, reason: "Code has expired" };
      if (row.uses_remaining !== null && Number(row.uses_remaining) <= 0) return { valid: false, reason: "Code has been fully used" };

      return {
        valid: true,
        code: row.code,
        plan: row.plan,
        type: row.type,
        usesRemaining: row.uses_remaining,
        notes: row.notes,
      };
    }),

  // List all invite codes
  list: protectedProcedure
    .input(z.object({
      isActive: z.boolean().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      let where = "WHERE 1=1";
      const params: any[] = [input.limit];
      if (input.isActive !== undefined) {
        where += " AND is_active = $2";
        params.push(input.isActive);
      }
      const result = await db.execute(sql.raw(`
        SELECT * FROM invite_codes ${where} ORDER BY created_at DESC LIMIT $1
      `));
      return (result as any).rows;
    }),

  // Revoke an invite code
  revoke: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `UPDATE invite_codes SET is_active = false, updated_at = NOW() WHERE code = $1`, [input.code]);
      return { success: true };
    }),

  // Reactivate an invite code
  reactivate: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `UPDATE invite_codes SET is_active = true, updated_at = NOW() WHERE code = $1`, [input.code]);
      return { success: true };
    }),
});

// ─── E: Partner Onboarding Wizard ─────────────────────────────────────────────
const partnerOnboardingRouter = router({
  // Step 1: Validate invite code and create session
  startSession: publicProcedure
    .input(z.object({ inviteCode: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const code = input.inviteCode.toUpperCase();

      // Validate code
      const codeResult = await execRaw(db, `
        SELECT id, code, type, uses_remaining, expires_at, plan, is_active
        FROM invite_codes WHERE code = $1
      `, [code]);
      const inviteRow = (codeResult as any).rows[0];
      if (!inviteRow) throw new Error("Invalid invite code");
      if (!inviteRow.is_active) throw new Error("This invite code has been revoked");
      if (inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date()) throw new Error("This invite code has expired");
      if (inviteRow.uses_remaining !== null && Number(inviteRow.uses_remaining) <= 0) throw new Error("This invite code has already been used");

      // Create session
      const sessionId = `pos-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      await execRaw(db, `
        INSERT INTO partner_onboarding_sessions (id, invite_code, step, status)
        VALUES ($1, $2, 1, 'in_progress')
      `, [sessionId, code]);

      return { sessionId, plan: inviteRow.plan, inviteCode: code };
    }),

  // Step 2: Save company details
  saveCompanyDetails: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      companyName: z.string().min(2).max(200),
      companyEmail: z.string().email(),
      companyPhone: z.string().min(7),
      companyCountry: z.string().default("NG"),
      companyWebsite: z.string().url().optional(),
      businessType: z.string(),
      rcNumber: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE partner_onboarding_sessions SET
          step = 2,
          company_name = $1,
          company_email = $2,
          company_phone = $3,
          company_country = $4,
          company_website = $5,
          business_type = $6,
          rc_number = $7,
          updated_at = NOW()
        WHERE id = $8
      `, [input.companyName, input.companyEmail, input.companyPhone, input.companyCountry,
          input.companyWebsite ?? null, input.businessType, input.rcNumber ?? null, input.sessionId]);
      return { success: true, step: 2 };
    }),

  // Step 3: Save branding
  saveBranding: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#8b5cf6"),
      logoUrl: z.string().url().optional(),
      fontFamily: z.string().default("Inter"),
      customDomain: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE partner_onboarding_sessions SET
          step = 3,
          primary_color = $1,
          accent_color = $2,
          logo_url = $3,
          font_family = $4,
          custom_domain = $5,
          updated_at = NOW()
        WHERE id = $6
      `, [input.primaryColor, input.accentColor, input.logoUrl ?? null, input.fontFamily, input.customDomain ?? null, input.sessionId]);
      return { success: true, step: 3 };
    }),

  // Step 4: Save fee structure and corridors
  saveFeeStructure: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      corridors: z.array(z.object({
        sourceCurrency: z.string(),
        destCurrency: z.string(),
        feePct: z.number().min(0).max(10),
      })),
      feeStructure: z.object({
        transferFeePct: z.number().min(0).max(10).default(1.5),
        paymentLinkFeePct: z.number().min(0).max(10).default(2.0),
        virtualCardFeePct: z.number().min(0).max(10).default(1.0),
        bnplInterestRate: z.number().min(0).max(50).default(2.5),
        fxMarkupPct: z.number().min(0).max(10).default(1.0),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE partner_onboarding_sessions SET
          step = 4,
          fee_structure = $1::jsonb,
          selected_corridors = $2::jsonb,
          updated_at = NOW()
        WHERE id = $3
      `, [JSON.stringify(input.feeStructure), JSON.stringify(input.corridors), input.sessionId]);
      return { success: true, step: 4 };
    }),

  // Step 5: Complete onboarding — create tenant, corridors, fee overrides
  complete: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Get session
      const sessionResult = await execRaw(db, `
        SELECT * FROM partner_onboarding_sessions WHERE id = $1 AND status = 'in_progress'
      `, [input.sessionId]);
      const session = (sessionResult as any).rows[0];
      if (!session) throw new Error("Session not found or already completed");
      if (!session.company_name) throw new Error("Company details not completed");

      // Create tenant
      const tenantId = `tenant-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      const slug = session.company_name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 50);

      // Get plan from invite code
      const inviteResult = await execRaw(db, `SELECT plan FROM invite_codes WHERE code = $1`, [session.invite_code]);
      const plan = (inviteResult as any).rows[0]?.plan ?? "starter";

      await execRaw(db, `
        INSERT INTO tenants
          (id, name, slug, email, phone, country, plan, status,
           primary_color, accent_color, logo_url, font_family, custom_domain,
           support_email, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active',
                $8, $9, $10, $11, $12, $4, NOW(), NOW())
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
      `, [tenantId, session.company_name, slug, session.company_email, session.company_phone,
          session.company_country, plan, session.primary_color, session.accent_color,
          session.logo_url, session.font_family, session.custom_domain]);

      // Create corridors
      const corridors = session.selected_corridors ?? [];
      for (const corridor of corridors) {
        await execRaw(db, `
          INSERT INTO tenant_corridors (tenant_id, source_currency, dest_currency, fee_pct, is_enabled)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (tenant_id, source_currency, dest_currency) DO UPDATE SET fee_pct = EXCLUDED.fee_pct
        `, [tenantId, corridor.sourceCurrency, corridor.destCurrency, corridor.feePct]);
      }

      // Create fee overrides
      const fees = session.fee_structure ?? {};
      const feeTypes = [
        { type: "transfer", value: fees.transferFeePct ?? 1.5 },
        { type: "payment_link", value: fees.paymentLinkFeePct ?? 2.0 },
        { type: "virtual_card", value: fees.virtualCardFeePct ?? 1.0 },
        { type: "bnpl", value: fees.bnplInterestRate ?? 2.5 },
        { type: "fx", value: fees.fxMarkupPct ?? 1.0 },
      ];
      for (const fee of feeTypes) {
        await execRaw(db, `
          INSERT INTO tenant_fee_overrides (tenant_id, transaction_type, fee_type, fee_value)
          VALUES ($1, $2, 'percentage', $3)
          ON CONFLICT (tenant_id, transaction_type) DO UPDATE SET fee_value = EXCLUDED.fee_value
        `, [tenantId, fee.type, fee.value]);
      }

      // Decrement invite code uses
      await execRaw(db, `
        UPDATE invite_codes SET
          uses_total = uses_total + 1,
          uses_remaining = CASE WHEN uses_remaining IS NOT NULL THEN GREATEST(0, uses_remaining - 1) ELSE NULL END,
          updated_at = NOW()
        WHERE code = $1
      `, [session.invite_code]);

      // Mark session complete
      await execRaw(db, `
        UPDATE partner_onboarding_sessions SET
          status = 'completed',
          tenant_id = $1,
          step = 5,
          updated_at = NOW()
        WHERE id = $2
      `, [tenantId, input.sessionId]);

      return {
        success: true,
        tenantId,
        slug,
        plan,
        dashboardUrl: `/admin/tenant?tenantId=${tenantId}`,
      };
    }),

  // Get session state (for resuming wizard)
  getSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT * FROM partner_onboarding_sessions WHERE id = $1
      `, [input.sessionId]);
      return (result as any).rows[0] ?? null;
    }),
});

// ─── F: Tenant Admin Dashboard ────────────────────────────────────────────────
const tenantAdminRouter = router({
  // Get tenant overview
  getOverview: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tenant = await execRaw(db, `
        SELECT
          t.*,
          COUNT(DISTINCT tu.id) as user_count,
          COUNT(DISTINCT tc.id) as corridor_count,
          COUNT(DISTINCT tfo.id) as fee_override_count
        FROM tenants t
        LEFT JOIN tenant_users tu ON tu.tenant_id = t.id AND tu.is_active = true
        LEFT JOIN tenant_corridors tc ON tc.tenant_id = t.id AND tc.is_enabled = true
        LEFT JOIN tenant_fee_overrides tfo ON tfo.tenant_id = t.id AND tfo.is_active = true
        WHERE t.id = $1
        GROUP BY t.id
      `, [input.tenantId]);

      const recentActivity = await execRaw(db, `
        SELECT action, resource_type, details, created_at
        FROM audit_logs
        WHERE details::text LIKE $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [`%${input.tenantId}%`]);

      return {
        tenant: (tenant as any).rows[0],
        recentActivity: (recentActivity as any).rows,
      };
    }),

  // List sub-users
  listUsers: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT tu.*, u.email as user_email, u.name as user_name
        FROM tenant_users tu
        LEFT JOIN users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
        ORDER BY tu.created_at DESC
      `, [input.tenantId]);
      return (result as any).rows;
    }),

  // Invite a sub-user
  inviteUser: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      email: z.string().email(),
      name: z.string().min(2),
      role: z.enum(["admin", "member", "viewer"]).default("member"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        INSERT INTO tenant_users (tenant_id, email, name, role, invited_by, invited_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, is_active = true
      `, [input.tenantId, input.email, input.name, input.role, ctx.user?.name ?? "admin"]);
      return { success: true };
    }),

  // Update user role
  updateUserRole: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      email: z.string().email(),
      role: z.enum(["owner", "admin", "member", "viewer"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE tenant_users SET role = $1 WHERE tenant_id = $2 AND email = $3
      `, [input.role, input.tenantId, input.email]);
      return { success: true };
    }),

  // Remove user from tenant
  removeUser: protectedProcedure
    .input(z.object({ tenantId: z.string(), email: z.string().email() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE tenant_users SET is_active = false WHERE tenant_id = $1 AND email = $2
      `, [input.tenantId, input.email]);
      return { success: true };
    }),

  // Get corridors
  getCorridors: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT * FROM tenant_corridors WHERE tenant_id = $1 ORDER BY source_currency, dest_currency
      `, [input.tenantId]);
      return (result as any).rows;
    }),

  // Update corridor
  updateCorridor: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      sourceCurrency: z.string(),
      destCurrency: z.string(),
      isEnabled: z.boolean(),
      feePct: z.number().min(0).max(20),
      minAmount: z.number().min(0).optional(),
      maxAmount: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        INSERT INTO tenant_corridors
          (tenant_id, source_currency, dest_currency, is_enabled, fee_pct, min_amount, max_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, source_currency, dest_currency) DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled,
          fee_pct = EXCLUDED.fee_pct,
          min_amount = EXCLUDED.min_amount,
          max_amount = EXCLUDED.max_amount,
          updated_at = NOW()
      `, [input.tenantId, input.sourceCurrency, input.destCurrency, input.isEnabled, input.feePct,
          input.minAmount ?? 100, input.maxAmount ?? null]);
      return { success: true };
    }),

  // Get fee overrides
  getFeeOverrides: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT * FROM tenant_fee_overrides WHERE tenant_id = $1 ORDER BY transaction_type
      `, [input.tenantId]);
      return (result as any).rows;
    }),

  // Update fee override
  updateFeeOverride: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      transactionType: z.string(),
      feeType: z.enum(["percentage", "flat"]),
      feeValue: z.number().min(0),
      minFee: z.number().min(0).optional(),
      maxFee: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        INSERT INTO tenant_fee_overrides
          (tenant_id, transaction_type, fee_type, fee_value, min_fee, max_fee)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, transaction_type) DO UPDATE SET
          fee_type = EXCLUDED.fee_type,
          fee_value = EXCLUDED.fee_value,
          min_fee = EXCLUDED.min_fee,
          max_fee = EXCLUDED.max_fee,
          updated_at = NOW()
      `, [input.tenantId, input.transactionType, input.feeType, input.feeValue,
          input.minFee ?? 0, input.maxFee ?? null]);
      return { success: true };
    }),

  // Update branding
  updateBranding: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      primaryColor: z.string().optional(),
      accentColor: z.string().optional(),
      logoUrl: z.string().url().optional(),
      fontFamily: z.string().optional(),
      footerText: z.string().optional(),
      supportEmail: z.string().email().optional(),
      customDomain: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (input.primaryColor !== undefined) { updates.push(`primary_color = $${idx++}`); params.push(input.primaryColor); }
      if (input.accentColor !== undefined) { updates.push(`accent_color = $${idx++}`); params.push(input.accentColor); }
      if (input.logoUrl !== undefined) { updates.push(`logo_url = $${idx++}`); params.push(input.logoUrl); }
      if (input.fontFamily !== undefined) { updates.push(`font_family = $${idx++}`); params.push(input.fontFamily); }
      if (input.footerText !== undefined) { updates.push(`footer_text = $${idx++}`); params.push(input.footerText); }
      if (input.supportEmail !== undefined) { updates.push(`support_email = $${idx++}`); params.push(input.supportEmail); }
      if (input.customDomain !== undefined) { updates.push(`custom_domain = $${idx++}`); params.push(input.customDomain); }

      if (updates.length === 0) return { success: true };
      updates.push(`updated_at = NOW()`);
      params.push(input.tenantId);

      await db.execute(sql.raw(`UPDATE tenants SET ${updates.join(", ")} WHERE id = $${idx}`));
      return { success: true };
    }),

  // Get white-label preview config
  getPreviewConfig: publicProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT id, name, slug, primary_color, accent_color, logo_url, font_family,
               footer_text, support_email, custom_domain, plan, status
        FROM tenants WHERE id = $1
      `, [input.tenantId]);
      return (result as any).rows[0] ?? null;
    }),
});

// ─── G: Tenant Isolation Helpers ─────────────────────────────────────────────
const tenantIsolationRouter = router({
  // Get current user's tenant context
  getMyTenant: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await execRaw(db, `
      SELECT t.id, t.name, t.slug, t.plan, t.status, t.primary_color, t.accent_color,
             t.logo_url, t.font_family, t.footer_text, t.support_email,
             tu.role as user_role
      FROM tenant_users tu
      JOIN tenants t ON t.id = tu.tenant_id
      WHERE tu.user_id = $1 AND tu.is_active = true
      LIMIT 1
    `, [ctx.user?.id]);
    return (result as any).rows[0] ?? null;
  }),

  // List all tenants (admin only)
  listAll: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      plan: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      let where = "WHERE 1=1";
      const params: any[] = [input.limit];
      let idx = 2;
      if (input.status) { where += ` AND status = $${idx++}`; params.push(input.status); }
      if (input.plan) { where += ` AND plan = $${idx++}`; params.push(input.plan); }

      const result = await db.execute(sql.raw(`
        SELECT
          t.*,
          COUNT(DISTINCT tu.id) as user_count,
          COUNT(DISTINCT tc.id) as corridor_count
        FROM tenants t
        LEFT JOIN tenant_users tu ON tu.tenant_id = t.id AND tu.is_active = true
        LEFT JOIN tenant_corridors tc ON tc.tenant_id = t.id AND tc.is_enabled = true
        ${where}
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT $1
      `));
      return (result as any).rows;
    }),

  // Suspend a tenant
  suspend: protectedProcedure
    .input(z.object({ tenantId: z.string(), reason: z.string().min(5) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE tenants SET status = 'suspended', suspend_reason = $1, suspended_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [input.reason, input.tenantId]);
      return { success: true };
    }),

  // Reactivate a tenant
  activate: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE tenants SET status = 'active', suspend_reason = NULL, suspended_at = NULL, updated_at = NOW()
        WHERE id = $1
      `, [input.tenantId]);
      return { success: true };
    }),
});

// ─── Wave 28 Root Router ──────────────────────────────────────────────────────
export const wave28Router = router({
  webhookRetryEnhanced: webhookRetryEnhancedRouter,
  loyaltyAutoPromotion: loyaltyAutoPromotionRouter,
  bnplRepayment: bnplRepaymentRouter,
  inviteCode: inviteCodeRouter,
  partnerOnboarding: partnerOnboardingRouter,
  tenantAdmin: tenantAdminRouter,
  tenantIsolation: tenantIsolationRouter,
});
