/**
 * Notification Preferences Router
 *
 * Manages per-merchant, per-channel notification preferences stored in
 * the `realtime_notification_preferences` table.
 *
 * Procedures:
 *   get    — fetch current preferences (creates defaults if none exist)
 *   update — update one or more preference flags
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";

const PrefsInput = z.object({
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  webhookEnabled: z.boolean().optional(),
  eventPayment: z.boolean().optional(),
  eventDispute: z.boolean().optional(),
  eventPayout: z.boolean().optional(),
  eventFraud: z.boolean().optional(),
  eventKyc: z.boolean().optional(),
  eventSystem: z.boolean().optional(),
  digestFrequency: z.enum(["realtime", "daily", "weekly", "never"]).optional(),
});

export const notificationPreferencesRouter = router({
  /** Return current preferences, creating defaults if the row doesn't exist yet */
  get: protectedProcedure.query(async ({ ctx }) => {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const { getUserByOpenId, getMerchantByOwnerId } = await import("../db");
    const user = await getUserByOpenId(ctx.user.openId);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    const merchant = await getMerchantByOwnerId(user.id);
    if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });

    // Upsert defaults on first access
    await db.execute(
      sql`INSERT INTO realtime_notification_preferences
            (id, merchant_id, push_enabled, in_app_enabled, email_enabled, sms_enabled, webhook_enabled,
             event_payment, event_dispute, event_payout, event_fraud, event_kyc, created_at, updated_at)
          VALUES
            (gen_random_uuid(), ${merchant.id}, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, now(), now())
          ON CONFLICT (merchant_id) DO NOTHING`
    );

    const rows = await db.execute(
      sql`SELECT * FROM realtime_notification_preferences WHERE merchant_id = ${merchant.id} LIMIT 1`
    );
    const row = (rows as any).rows?.[0] ?? (rows as any)[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Preferences not found" });

    return {
      pushEnabled:    Boolean(row.push_enabled),
      inAppEnabled:   Boolean(row.in_app_enabled),
      emailEnabled:   Boolean(row.email_enabled),
      smsEnabled:     Boolean(row.sms_enabled),
      webhookEnabled: Boolean(row.webhook_enabled),
      eventPayment:   Boolean(row.event_payment),
      eventDispute:   Boolean(row.event_dispute),
      eventPayout:    Boolean(row.event_payout),
      eventFraud:     Boolean(row.event_fraud),
      eventKyc:       Boolean(row.event_kyc),
      eventSystem:    Boolean((row as any).event_system ?? 1),
      digestFrequency: String((row as any).digest_frequency ?? "daily") as "realtime" | "daily" | "weekly" | "never",
    };
  }),

  /** Patch one or more preference flags */
  update: protectedProcedure
    .input(PrefsInput)
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { getUserByOpenId, getMerchantByOwnerId } = await import("../db");
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      const merchant = await getMerchantByOwnerId(user.id);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });

      // Parameterized SET clauses — column names come from the whitelisted
      // fieldMap (safe as sql.raw identifiers); every VALUE and the
      // merchant_id are bound parameters. No string-built SQL.
      const sets: ReturnType<typeof sql>[] = [];

      const fieldMap: Record<string, string> = {
        pushEnabled:    "push_enabled",
        inAppEnabled:   "in_app_enabled",
        emailEnabled:   "email_enabled",
        smsEnabled:     "sms_enabled",
        webhookEnabled: "webhook_enabled",
        eventPayment:   "event_payment",
        eventDispute:   "event_dispute",
        eventPayout:    "event_payout",
        eventFraud:     "event_fraud",
        eventKyc:       "event_kyc",
        eventSystem:    "event_system",
        digestFrequency: "digest_frequency",
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        const val = (input as any)[key];
        if (val !== undefined) {
          // Boolean flags are stored as integer 1/0 (see table DDL);
          // digestFrequency is a text enum.
          sets.push(sql`${sql.raw(col)} = ${key === "digestFrequency" ? String(val) : val ? 1 : 0}`);
        }
      }

      if (sets.length === 0) return { updated: false };

      await db.execute(
        sql`UPDATE realtime_notification_preferences
            SET ${sql.join(sets, sql`, `)}, updated_at = now()
            WHERE merchant_id = ${merchant.id}`
      );

      return { updated: true };
    }),
});
