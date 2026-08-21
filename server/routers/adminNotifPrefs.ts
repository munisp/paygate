/**
 * Admin Notification Preferences Router
 *
 * Manages per-admin, per-channel, per-category system alert preferences
 * stored in `admin_notification_prefs`.
 *
 * Procedures:
 *   get    — fetch current prefs (upserts defaults on first access)
 *   update — patch one or more preference flags
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";

const AdminPrefsInput = z.object({
  // Channel toggles
  pushEnabled:  z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  slackEnabled: z.boolean().optional(),
  // Alert categories
  alertNewMerchant:      z.boolean().optional(),
  alertKycSubmission:    z.boolean().optional(),
  alertKycApproval:      z.boolean().optional(),
  alertHighRiskTxn:      z.boolean().optional(),
  alertFraudEscalation:  z.boolean().optional(),
  alertDisputeOpened:    z.boolean().optional(),
  alertDisputeEscalated: z.boolean().optional(),
  alertPayoutApproval:   z.boolean().optional(),
  alertSystemError:      z.boolean().optional(),
  alertBridgeDown:       z.boolean().optional(),
  alertRateLimit:        z.boolean().optional(),
  alertDailyDigest:      z.boolean().optional(),
  alertWeeklyReport:     z.boolean().optional(),
  // Thresholds
  highRiskScoreThreshold:   z.number().int().min(0).max(100).optional(),
  largePayoutThresholdKobo: z.number().int().min(0).optional(),
  // Digest frequency
  digestFrequency: z.enum(["realtime", "daily", "weekly", "never"]).optional(),
});

const COLUMN_MAP: Record<string, string> = {
  pushEnabled:  "push_enabled",
  emailEnabled: "email_enabled",
  slackEnabled: "slack_enabled",
  alertNewMerchant:      "alert_new_merchant",
  alertKycSubmission:    "alert_kyc_submission",
  alertKycApproval:      "alert_kyc_approval",
  alertHighRiskTxn:      "alert_high_risk_txn",
  alertFraudEscalation:  "alert_fraud_escalation",
  alertDisputeOpened:    "alert_dispute_opened",
  alertDisputeEscalated: "alert_dispute_escalated",
  alertPayoutApproval:   "alert_payout_approval",
  alertSystemError:      "alert_system_error",
  alertBridgeDown:       "alert_bridge_down",
  alertRateLimit:        "alert_rate_limit",
  alertDailyDigest:      "alert_daily_digest",
  alertWeeklyReport:     "alert_weekly_report",
  highRiskScoreThreshold:   "high_risk_score_threshold",
  largePayoutThresholdKobo: "large_payout_threshold_kobo",
  digestFrequency:          "digest_frequency",
};

export const adminNotifPrefsRouter = router({
  /** Return current preferences, creating defaults if the row doesn't exist yet */
  get: protectedProcedure.query(async ({ ctx }) => {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const { getUserByOpenId } = await import("../db");
    const user = await getUserByOpenId(ctx.user.openId);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

    // Upsert defaults on first access
    await db.execute(sql`
      INSERT INTO admin_notification_prefs (
        id, user_id,
        push_enabled, email_enabled, slack_enabled,
        alert_new_merchant, alert_kyc_submission, alert_kyc_approval,
        alert_high_risk_txn, alert_fraud_escalation,
        alert_dispute_opened, alert_dispute_escalated, alert_payout_approval,
        alert_system_error, alert_bridge_down, alert_rate_limit,
        alert_daily_digest, alert_weekly_report,
        high_risk_score_threshold, large_payout_threshold_kobo,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${user.id},
        true, true, false,
        true, true, true,
        true, true,
        true, true, true,
        true, true, false,
        true, true,
        75, 1000000000,
        now(), now()
      )
      ON CONFLICT (user_id) DO NOTHING
    `);

    const rows = await db.execute(
      sql`SELECT * FROM admin_notification_prefs WHERE user_id = ${user.id} LIMIT 1`
    );
    const row = (rows as any).rows?.[0] ?? (rows as any)[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Preferences not found" });

    return {
      pushEnabled:  Boolean(row.push_enabled),
      emailEnabled: Boolean(row.email_enabled),
      slackEnabled: Boolean(row.slack_enabled),
      alertNewMerchant:      Boolean(row.alert_new_merchant),
      alertKycSubmission:    Boolean(row.alert_kyc_submission),
      alertKycApproval:      Boolean(row.alert_kyc_approval),
      alertHighRiskTxn:      Boolean(row.alert_high_risk_txn),
      alertFraudEscalation:  Boolean(row.alert_fraud_escalation),
      alertDisputeOpened:    Boolean(row.alert_dispute_opened),
      alertDisputeEscalated: Boolean(row.alert_dispute_escalated),
      alertPayoutApproval:   Boolean(row.alert_payout_approval),
      alertSystemError:      Boolean(row.alert_system_error),
      alertBridgeDown:       Boolean(row.alert_bridge_down),
      alertRateLimit:        Boolean(row.alert_rate_limit),
      alertDailyDigest:      Boolean(row.alert_daily_digest),
      alertWeeklyReport:     Boolean(row.alert_weekly_report),
      highRiskScoreThreshold:   Number(row.high_risk_score_threshold ?? 75),
      largePayoutThresholdKobo: Number(row.large_payout_threshold_kobo ?? 1000000000),
      digestFrequency:          String(row.digest_frequency ?? "weekly") as "realtime" | "daily" | "weekly" | "never",
    };
  }),

  /** Patch one or more preference flags */
  update: protectedProcedure
    .input(AdminPrefsInput)
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { getUserByOpenId } = await import("../db");
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      // Parameterized SET clauses — column names come from the whitelisted
      // COLUMN_MAP (safe as sql.raw identifiers); every VALUE is bound as a
      // parameter. No string-built SQL. (This also fixes digestFrequency:
      // string enum values previously went through Number(val) → NaN.)
      const setParts: ReturnType<typeof sql>[] = [];
      for (const [key, col] of Object.entries(COLUMN_MAP)) {
        const val = (input as any)[key];
        if (val === undefined) continue;
        setParts.push(sql`${sql.raw(col)} = ${val}`);
      }
      if (setParts.length === 0) return { updated: false };

      await db.execute(
        sql`UPDATE admin_notification_prefs
            SET ${sql.join(setParts, sql`, `)}, updated_at = now()
            WHERE user_id = ${user.id}`
      );
      return { updated: true };
    }),
});
