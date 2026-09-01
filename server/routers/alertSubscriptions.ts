/**
 * alertSubscriptions.ts — merchant-scoped alert subscription management
 * (OTEL_IMPLEMENTATION_SPEC §7, Novu alert bridge).
 *
 * Channels: email | sms | in_app. Severities: info | warning | critical.
 * On subscribe, the merchant is upserted as a Novu subscriber (idempotent by
 * subscriberId = merchantId). FAIL-LOUD: if Novu subscriber creation fails
 * the mutation throws — no silent divergence between DB and Novu.
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { alertSubscriptions } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { logger } from "../logger";

// ─── Merchant resolution (same pattern as crud119.ts:110) ────────────────────
async function resolveMerchant(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant;
}

async function resolveMerchantId(openId: string): Promise<string> {
  return (await resolveMerchant(openId)).id;
}

// ─── Novu subscriber upsert (idempotent by subscriberId = merchantId) ────────
async function upsertNovuSubscriber(merchantId: string, target: { email?: string; phone?: string }) {
  if (!ENV.novuApiKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "NOVU_API_KEY not configured — cannot create Novu subscriber",
    });
  }
  const body: Record<string, unknown> = { subscriberId: merchantId, ...target };
  let resp: Response;
  try {
    resp = await fetch(`${ENV.novuApiUrl.replace(/\/$/, "")}/v1/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": ENV.internalApiKey,
        Authorization: `ApiKey ${ENV.novuApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    logger.error(`[alertSubscriptions] Novu subscriber upsert unreachable: ${e}`);
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Novu subscriber creation failed (service unreachable); subscription NOT persisted",
    });
  }
  // 201 = created, 200/204 = already exists (idempotent by subscriberId)
  if (!resp.ok && resp.status !== 409) {
    const text = await resp.text().catch(() => "");
    logger.error(`[alertSubscriptions] Novu subscriber upsert HTTP ${resp.status}: ${text.slice(0, 200)}`);
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `Novu subscriber creation failed (HTTP ${resp.status}); subscription NOT persisted`,
    });
  }
}

const channelEnum = z.enum(["email", "sms", "in_app"]);
const severityEnum = z.enum(["info", "warning", "critical"]);

const subscribeInput = z.object({
  channel: channelEnum,
  target: z.string().min(1).max(255),
  minSeverity: severityEnum.default("warning"),
}).superRefine((v, ctx) => {
  if (v.channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.target)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "target must be a valid email address for email channel" });
  }
  if (v.channel === "sms" && !/^\+?[0-9]{7,15}$/.test(v.target)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "target must be a valid phone number for sms channel" });
  }
});

export const alertSubscriptionsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db
      .select()
      .from(alertSubscriptions)
      .where(eq(alertSubscriptions.merchantId, merchantId))
      .orderBy(desc(alertSubscriptions.createdAt));
  }),

  subscribe: protectedProcedure
    .input(subscribeInput)
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      // FAIL-LOUD: Novu subscriber must exist before we persist — otherwise
      // alerts would silently never reach this merchant.
      await upsertNovuSubscriber(merchantId, {
        ...(input.channel === "email" ? { email: input.target } : {}),
        ...(input.channel === "sms" ? { phone: input.target } : {}),
      });
      const [row] = await db
        .insert(alertSubscriptions)
        .values({
          merchantId,
          channel: input.channel,
          target: input.target,
          minSeverity: input.minSeverity,
          novuSubscriberId: merchantId,
        })
        .onConflictDoUpdate({
          target: [
            alertSubscriptions.merchantId,
            alertSubscriptions.channel,
            alertSubscriptions.target,
          ],
          set: { minSeverity: input.minSeverity, updatedAt: new Date() },
        })
        .returning();
      return row;
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const deleted = await db
        .delete(alertSubscriptions)
        .where(and(
          eq(alertSubscriptions.id, input.id),
          eq(alertSubscriptions.merchantId, merchantId),
        ))
        .returning();
      if (!deleted || deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });
      }
      return { deleted: true, id: input.id };
    }),
});

export type AlertSubscriptionsRouter = typeof alertSubscriptionsRouter;
