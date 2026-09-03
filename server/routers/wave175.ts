/**
 * Wave 175 — Production Readiness Final Sweep
 *
 * - scumlRouter          : SCUML (Special Control Unit against Money Laundering) check & registration
 * - accessibilityRouter  : Accessibility fallback sessions (manual review path)
 * - localeRouter         : i18n locale/currency/timezone preferences
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { eq, and, desc, lt, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logger } from "../logger";
import {
  scumlChecks,
  accessibilityFallbackSessions,
  userLocalePreferences,
  kybVerifications,
} from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { publishAuditEvent } from "../auditEvents";

// ─── 1. SCUML Router ──────────────────────────────────────────────────────────
export const scumlRouter = router({
  // Initiate a SCUML check for a business entity
  initiate: protectedProcedure
    .input(z.object({
      verificationId: z.string().optional(),
      entityName: z.string().min(2),
      rcNumber: z.string().optional(),
      checkType: z.enum(["registration", "renewal", "amendment"]).default("registration"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;

      // Use LLM to simulate SCUML screening (real integration would call SCUML API)
      let status: string = "pending";
      let scumlRef: string | null = null;
      let flagReason: string | null = null;

      try {
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a SCUML (Special Control Unit against Money Laundering) compliance checker for Nigeria.
Given a business name and optional RC number, assess if the entity appears on any AML/CFT watchlist.
Respond ONLY with valid JSON: { "cleared": boolean, "ref": string | null, "flagReason": string | null }
For most legitimate businesses, cleared should be true. Only flag obvious red flags.`,
            },
            {
              role: "user",
              content: `SCUML check: entityName="${input.entityName}", rcNumber="${input.rcNumber ?? 'N/A'}", checkType="${input.checkType}". Respond with JSON only.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "scuml_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  cleared: { type: "boolean" },
                  ref: { type: ["string", "null"] },
                  flagReason: { type: ["string", "null"] },
                },
                required: ["cleared", "ref", "flagReason"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = llmResponse?.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
        status = parsed.cleared ? "cleared" : "flagged";
        scumlRef = parsed.ref ?? `SCUML-${Date.now().toString(36).toUpperCase()}`;
        flagReason = parsed.flagReason ?? null;
      } catch {
        status = "error";
      }

      const expiresAt = status === "cleared"
        ? new Date(Date.now() + 365 * 24 * 3600 * 1000)  // 1 year validity
        : null;

      const [row] = await db.insert(scumlChecks).values({
        merchantId: ctx.user.tenantId ?? "",
        verificationId: input.verificationId,
        entityName: input.entityName,
        rcNumber: input.rcNumber,
        checkType: input.checkType,
        status,
        scumlRef,
        flagReason,
        checkedAt: new Date(),
        expiresAt,
      }).returning();

      if (status === "flagged") {
        await notifyOwner({
          title: `SCUML Flag: ${input.entityName}`,
          content: `SCUML check flagged ${input.entityName} (RC: ${input.rcNumber ?? "N/A"}). Reason: ${flagReason}. Requires manual review.`,
        }).catch((e) => logger.error("[wave175] SCUML flag owner alert failed — compliance alert lost", { entityName: input.entityName, error: e instanceof Error ? e.message : String(e) }));
        publishAuditEvent({
          action: "compliance.scuml.flagged",
          actorId: ctx.user.openId,
          targetId: row.id,
          metadata: { entityName: input.entityName, flagReason },
          timestamp: new Date().toISOString(),
        }).catch((e) => logger.error("[wave175] audit event compliance.scuml.flagged failed", e));
      }

      return row;
    }),

  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [eq(scumlChecks.merchantId, ctx.user.tenantId ?? "")];
      if (input.status) conditions.push(eq(scumlChecks.status, input.status));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]);
      const rows = await db.select().from(scumlChecks)
        .where(where).orderBy(desc(scumlChecks.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(scumlChecks).where(where);
      return { checks: rows, total: Number(count), totalPages: Math.ceil(Number(count) / input.limit) };
    }),

  // Check for expiring SCUML registrations (within 30 days)
  expiringSoon: protectedProcedure
    .input(z.object({ daysAhead: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const cutoff = new Date(Date.now() + input.daysAhead * 86_400_000);
      return db.select().from(scumlChecks)
        .where(and(
          eq(scumlChecks.merchantId, ctx.user.tenantId ?? ""),
          eq(scumlChecks.status, "cleared"),
          lt(scumlChecks.expiresAt!, cutoff),
        ))
        .orderBy(scumlChecks.expiresAt);
    }),
});

// ─── 2. Accessibility Fallback Router ─────────────────────────────────────────
export const accessibilityRouter = router({
  // Merchant requests manual review instead of automated liveness
  requestFallback: protectedProcedure
    .input(z.object({
      submissionId: z.string().optional(),
      reason: z.enum(["camera_unavailable", "disability", "device_unsupported", "other"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.insert(accessibilityFallbackSessions).values({
        merchantId: ctx.user.tenantId ?? "",
        submissionId: input.submissionId,
        reason: input.reason,
        reviewStatus: "pending",
      }).returning();

      await notifyOwner({
        title: `Accessibility Fallback Request`,
        content: `Merchant ${ctx.user.tenantId} requested manual liveness review. Reason: ${input.reason}. Session ID: ${row.id}.`,
      }).catch((e) => logger.error("[wave175] accessibility fallback owner alert failed", { sessionId: row.id, error: e instanceof Error ? e.message : String(e) }));

      return { id: row.id, reviewStatus: "pending", message: "Your request has been submitted for manual review. You will be notified within 24 hours." };
    }),

  // Admin: list pending fallback sessions
  listPending: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    return db.select().from(accessibilityFallbackSessions)
      .where(eq(accessibilityFallbackSessions.reviewStatus, "pending"))
      .orderBy(desc(accessibilityFallbackSessions.createdAt))
      .limit(100);
  }),

  // Admin: review a fallback session
  review: protectedProcedure
    .input(z.object({
      id: z.string(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(accessibilityFallbackSessions).set({
        reviewStatus: input.decision,
        reviewedBy: ctx.user.openId,
        reviewedAt: new Date(),
        reviewNotes: input.notes,
      }).where(eq(accessibilityFallbackSessions.id, input.id));
      publishAuditEvent({
        action: `accessibility.fallback.${input.decision}`,
        actorId: ctx.user.openId,
        targetId: input.id,
        metadata: { notes: input.notes },
        timestamp: new Date().toISOString(),
      }).catch((e) => logger.error("[wave175] audit event accessibility.fallback failed", e));
      return { success: true };
    }),

  myStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const [row] = await db.select().from(accessibilityFallbackSessions)
      .where(eq(accessibilityFallbackSessions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(accessibilityFallbackSessions.createdAt)).limit(1);
    return row ?? null;
  }),
});

// ─── 3. Locale Preferences Router ─────────────────────────────────────────────
export const localeRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const [row] = await db.select().from(userLocalePreferences)
      .where(eq(userLocalePreferences.userId, ctx.user.openId)).limit(1);
    // Return defaults if not set
    return row ?? {
      userId: ctx.user.openId,
      locale: "en-NG",
      currency: "NGN",
      timezone: "Africa/Lagos",
      dateFormat: "DD/MM/YYYY",
      numberFormat: "1,234.56",
    };
  }),

  update: protectedProcedure
    .input(z.object({
      locale: z.string().min(2).max(20).optional(),
      currency: z.string().length(3).optional(),
      timezone: z.string().min(3).max(50).optional(),
      dateFormat: z.string().optional(),
      numberFormat: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(userLocalePreferences)
        .where(eq(userLocalePreferences.userId, ctx.user.openId)).limit(1);
      if (existing.length > 0) {
        await db.update(userLocalePreferences)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(userLocalePreferences.userId, ctx.user.openId));
      } else {
        await db.insert(userLocalePreferences).values({
          userId: ctx.user.openId,
          locale: input.locale ?? "en-NG",
          currency: input.currency ?? "NGN",
          timezone: input.timezone ?? "Africa/Lagos",
          dateFormat: input.dateFormat ?? "DD/MM/YYYY",
          numberFormat: input.numberFormat ?? "1,234.56",
        });
      }
      return { success: true };
    }),

  // Available locale options
  options: protectedProcedure.query(() => ({
    locales: [
      { code: "en-NG", label: "English (Nigeria)" },
      { code: "en-GB", label: "English (UK)" },
      { code: "en-US", label: "English (US)" },
      { code: "fr-FR", label: "French" },
      { code: "ha-NG", label: "Hausa" },
      { code: "yo-NG", label: "Yoruba" },
      { code: "ig-NG", label: "Igbo" },
    ],
    currencies: [
      { code: "NGN", symbol: "₦", label: "Nigerian Naira" },
      { code: "USD", symbol: "$", label: "US Dollar" },
      { code: "GBP", symbol: "£", label: "British Pound" },
      { code: "EUR", symbol: "€", label: "Euro" },
      { code: "GHS", symbol: "₵", label: "Ghanaian Cedi" },
      { code: "KES", symbol: "KSh", label: "Kenyan Shilling" },
      { code: "ZAR", symbol: "R", label: "South African Rand" },
    ],
    timezones: [
      "Africa/Lagos",
      "Africa/Accra",
      "Africa/Nairobi",
      "Africa/Johannesburg",
      "Europe/London",
      "America/New_York",
    ],
  })),
});
