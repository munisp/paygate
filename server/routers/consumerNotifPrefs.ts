/**
 * Consumer Notification Preferences Router
 *
 * Manages per-user, per-channel, per-category notification preferences
 * for the consumer PWA, stored in `consumer_notification_prefs`.
 *
 * Procedures:
 *   get    — fetch current prefs (upserts defaults on first access)
 *   update — patch one or more preference flags
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";

const ConsumerPrefsInput = z.object({
  // Channel toggles
  pushEnabled:    z.boolean().optional(),
  inAppEnabled:   z.boolean().optional(),
  emailEnabled:   z.boolean().optional(),
  smsEnabled:     z.boolean().optional(),
  // Push categories
  pushPayments:   z.boolean().optional(),
  pushFraud:      z.boolean().optional(),
  pushPromotions: z.boolean().optional(),
  pushSystem:     z.boolean().optional(),
  pushDisputes:   z.boolean().optional(),
  pushLoans:      z.boolean().optional(),
  // In-app categories
  inAppPayments:   z.boolean().optional(),
  inAppFraud:      z.boolean().optional(),
  inAppPromotions: z.boolean().optional(),
  inAppSystem:     z.boolean().optional(),
  inAppDisputes:   z.boolean().optional(),
  inAppLoans:      z.boolean().optional(),
  // Email categories
  emailPayments:   z.boolean().optional(),
  emailFraud:      z.boolean().optional(),
  emailPromotions: z.boolean().optional(),
  emailSystem:     z.boolean().optional(),
  emailDisputes:   z.boolean().optional(),
  emailLoans:      z.boolean().optional(),
  // Quiet hours
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd:     z.string().regex(/^\d{2}:\d{2}$/).optional(),
  // Digest frequency
  digestFrequency: z.enum(["realtime", "daily", "weekly", "never"]).optional(),
});

const COLUMN_MAP: Record<string, string> = {
  pushEnabled:    "push_enabled",
  inAppEnabled:   "in_app_enabled",
  emailEnabled:   "email_enabled",
  smsEnabled:     "sms_enabled",
  pushPayments:   "push_payments",
  pushFraud:      "push_fraud",
  pushPromotions: "push_promotions",
  pushSystem:     "push_system",
  pushDisputes:   "push_disputes",
  pushLoans:      "push_loans",
  inAppPayments:   "in_app_payments",
  inAppFraud:      "in_app_fraud",
  inAppPromotions: "in_app_promotions",
  inAppSystem:     "in_app_system",
  inAppDisputes:   "in_app_disputes",
  inAppLoans:      "in_app_loans",
  emailPayments:   "email_payments",
  emailFraud:      "email_fraud",
  emailPromotions: "email_promotions",
  emailSystem:     "email_system",
  emailDisputes:   "email_disputes",
  emailLoans:      "email_loans",
  quietHoursEnabled: "quiet_hours_enabled",
  quietHoursStart:   "quiet_hours_start",
  quietHoursEnd:     "quiet_hours_end",
  digestFrequency:   "digest_frequency",
};

export const consumerNotifPrefsRouter = router({
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
      INSERT INTO consumer_notification_prefs (
        id, user_id,
        push_enabled, in_app_enabled, email_enabled, sms_enabled,
        push_payments, push_fraud, push_promotions, push_system, push_disputes, push_loans,
        in_app_payments, in_app_fraud, in_app_promotions, in_app_system, in_app_disputes, in_app_loans,
        email_payments, email_fraud, email_promotions, email_system, email_disputes, email_loans,
        quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${user.id},
        true, true, true, false,
        true, true, false, true, true, true,
        true, true, true, true, true, true,
        true, true, false, true, true, false,
        false, '22:00', '07:00',
        now(), now()
      )
      ON CONFLICT (user_id) DO NOTHING
    `);

    const rows = await db.execute(
      sql`SELECT * FROM consumer_notification_prefs WHERE user_id = ${user.id} LIMIT 1`
    );
    const row = (rows as any).rows?.[0] ?? (rows as any)[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Preferences not found" });

    return {
      pushEnabled:    Boolean(row.push_enabled),
      inAppEnabled:   Boolean(row.in_app_enabled),
      emailEnabled:   Boolean(row.email_enabled),
      smsEnabled:     Boolean(row.sms_enabled),
      pushPayments:   Boolean(row.push_payments),
      pushFraud:      Boolean(row.push_fraud),
      pushPromotions: Boolean(row.push_promotions),
      pushSystem:     Boolean(row.push_system),
      pushDisputes:   Boolean(row.push_disputes),
      pushLoans:      Boolean(row.push_loans),
      inAppPayments:   Boolean(row.in_app_payments),
      inAppFraud:      Boolean(row.in_app_fraud),
      inAppPromotions: Boolean(row.in_app_promotions),
      inAppSystem:     Boolean(row.in_app_system),
      inAppDisputes:   Boolean(row.in_app_disputes),
      inAppLoans:      Boolean(row.in_app_loans),
      emailPayments:   Boolean(row.email_payments),
      emailFraud:      Boolean(row.email_fraud),
      emailPromotions: Boolean(row.email_promotions),
      emailSystem:     Boolean(row.email_system),
      emailDisputes:   Boolean(row.email_disputes),
      emailLoans:      Boolean(row.email_loans),
      quietHoursEnabled: Boolean(row.quiet_hours_enabled),
      quietHoursStart:   String(row.quiet_hours_start ?? "22:00"),
      quietHoursEnd:     String(row.quiet_hours_end ?? "07:00"),
      digestFrequency:   String(row.digest_frequency ?? "weekly") as "realtime" | "daily" | "weekly" | "never",
    };
  }),

  /** Patch one or more preference flags */
  update: protectedProcedure
    .input(ConsumerPrefsInput)
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { getUserByOpenId } = await import("../db");
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const setParts: string[] = [];
      for (const [key, col] of Object.entries(COLUMN_MAP)) {
        const val = (input as any)[key];
        if (val === undefined) continue;
        if (typeof val === "boolean") {
          setParts.push(`${col} = ${val}`);
        } else {
          // string values (quiet hours times)
          setParts.push(`${col} = '${String(val).replace(/'/g, "''")}'`);
        }
      }
      if (setParts.length === 0) return { updated: false };

      await db.execute(
        sql.raw(
          `UPDATE consumer_notification_prefs
           SET ${setParts.join(", ")}, updated_at = now()
           WHERE user_id = ${user.id}`
        )
      );
      return { updated: true };
    }),
});
