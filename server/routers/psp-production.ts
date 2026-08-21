/**
 * psp-production.ts
 *
 * PSP Licence-Holder Production Routers:
 *   1. strRouter            — Suspicious Transaction Reports (NFIU goAML)
 *   2. velocityLimitsRouter — Sub-merchant velocity limit config + breach log
 *   3. interchangeRouter    — Interchange fee schedule management + fee records
 *   4. schemeMembershipRouter — Visa/Mastercard/Verve scheme membership
 *   5. chargebackLifecycleRouter — Full lifecycle: evidence upload, timeline, scheme submission
 *   6. regulatoryReportsRouter  — CBN Form A/B/C generation, submission, download
 *
 * All procedures call real DB tables. Zero mocks/stubs.
 */

import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  strRecords,
  velocityLimitConfigs,
  velocityBreaches,
  interchangeSchedule,
  interchangeFeeRecords,
  schemeMemberships,
  chargebackEvidencePackages,
  chargebackTimeline,
  chargebacks,
  regulatoryReports,
  regulatoryReportSubmissions,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { publishEvent } from "../kafkaClient";

// ─── 1. STR Router ────────────────────────────────────────────────────────────

export const strRouter = router({
  /**
   * File a new Suspicious Transaction Report.
   * Sets a 24-hour NFIU submission deadline from the time of filing.
   */
  file: protectedProcedure
    .input(z.object({
      transactionId: z.string().min(1),
      strType: z.enum(["STR", "SAR"]).default("STR"),
      subjectType: z.enum(["INDIVIDUAL", "ENTITY"]).default("INDIVIDUAL"),
      subjectData: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        name: z.string().optional(), // for ENTITY
        bvn: z.string().optional(),
        nin: z.string().optional(),
        rcNumber: z.string().optional(), // for ENTITY
        tin: z.string().optional(),
        dob: z.string().optional(),
        nationality: z.string().default("NG"),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }),
      transactionData: z.object({
        date: z.string(),
        amountKobo: z.number().int().positive(),
        currency: z.string().default("NGN"),
        type: z.string().default("TRANSFER"),
        channel: z.string().optional(),
      }),
      suspicionType: z.enum([
        "MONEY_LAUNDERING",
        "TERRORIST_FINANCING",
        "FRAUD",
        "PROLIFERATION_FINANCING",
        "OTHER",
      ]).default("MONEY_LAUNDERING"),
      suspicionGrounds: z.string().min(20),
      suspicionIndicators: z.array(z.string()).default([]),
      narrative: z.string().min(50),
      actionTaken: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;
      const filedAt = new Date();
      // NFIU requires STRs within 24 hours of suspicion arising
      const deadlineAt = new Date(filedAt.getTime() + 24 * 60 * 60 * 1000);

      const [record] = await db.insert(strRecords).values({
        merchantId,
        transactionId: input.transactionId,
        strType: input.strType,
        subjectType: input.subjectType,
        subjectData: JSON.stringify(input.subjectData),
        transactionData: JSON.stringify(input.transactionData),
        suspicionType: input.suspicionType,
        suspicionGrounds: input.suspicionGrounds,
        suspicionIndicators: JSON.stringify(input.suspicionIndicators),
        narrative: input.narrative,
        actionTaken: input.actionTaken ?? null,
        filedBy: ctx.user.name ?? ctx.user.openId,
        filedAt,
        deadlineAt,
        submissionStatus: "pending",
        submissionAttempts: 0,
        deadlineBreached: false,
      }).returning();

      // Publish to Kafka for async NFIU submission
      await publishEvent("str.filed", {
        str_id: record.id,
        merchant_id: merchantId,
        transaction_id: input.transactionId,
        deadline_at: deadlineAt.toISOString(),
      });

      return { strId: record.id, deadlineAt };
    }),

  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
      strType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(strRecords.merchantId, merchantId)];
      if (input.status) conditions.push(eq(strRecords.submissionStatus, input.status));
      if (input.strType) conditions.push(eq(strRecords.strType, input.strType));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]);
      const rows = await db.select().from(strRecords)
        .where(where)
        .orderBy(desc(strRecords.filedAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(strRecords).where(where);
      return { strs: rows, total: Number(count), page: input.page, limit: input.limit };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;
      const [row] = await db.select().from(strRecords)
        .where(and(eq(strRecords.id, input.id), eq(strRecords.merchantId, merchantId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...row,
        subjectData: JSON.parse(row.subjectData),
        transactionData: JSON.parse(row.transactionData),
        suspicionIndicators: row.suspicionIndicators ? JSON.parse(row.suspicionIndicators) : [],
      };
    }),

  /**
   * Mark an STR as submitted to NFIU (called by the Go bridge after successful goAML submission).
   */
  markSubmitted: adminProcedure
    .input(z.object({
      id: z.string(),
      nfiuRef: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(strRecords).set({
        nfiuRef: input.nfiuRef,
        nfiuSubmittedAt: new Date(),
        submissionStatus: "submitted",
        submissionAttempts: sql`${strRecords.submissionAttempts} + 1`,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(strRecords.id, input.id));
      return { success: true };
    }),

  markAcknowledged: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(strRecords).set({
        nfiuAcknowledgedAt: new Date(),
        submissionStatus: "acknowledged",
        updatedAt: new Date(),
      }).where(eq(strRecords.id, input.id));
      return { success: true };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const merchantId = ctx.user.tenantId ?? ctx.user.openId;
    const rows = await db.select({
      status: strRecords.submissionStatus,
      count: sql<number>`count(*)`,
    }).from(strRecords)
      .where(eq(strRecords.merchantId, merchantId))
      .groupBy(strRecords.submissionStatus);
    const breached = await db.select({ count: sql<number>`count(*)` })
      .from(strRecords)
      .where(and(
        eq(strRecords.merchantId, merchantId),
        eq(strRecords.deadlineBreached, true),
      ));
    return {
      byStatus: rows.map(r => ({ status: r.status, count: Number(r.count) })),
      deadlineBreached: Number(breached[0]?.count ?? 0),
    };
  }),
});

// ─── 2. Velocity Limits Router ────────────────────────────────────────────────

export const velocityLimitsRouter = router({
  listConfigs: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      channel: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      // Cross-tenant reads only for platform admins (role check consistent
      // with adminProcedure used elsewhere in this file). Merchants always
      // see only their own configs — the merchantId input cannot override.
      const ownMerchantId = ctx.user.tenantId ?? ctx.user.openId;
      let targetMerchantId = ownMerchantId;
      if (input.merchantId && input.merchantId !== ownMerchantId) {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot read another merchant's velocity-limit configs" });
        }
        targetMerchantId = input.merchantId;
      }
      const conditions = [eq(velocityLimitConfigs.merchantId, targetMerchantId)];
      if (input.channel) conditions.push(eq(velocityLimitConfigs.channel, input.channel));
      if (input.isActive !== undefined) conditions.push(eq(velocityLimitConfigs.isActive, input.isActive));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]);
      return db.select().from(velocityLimitConfigs).where(where).orderBy(desc(velocityLimitConfigs.createdAt));
    }),

  setLimit: adminProcedure
    .input(z.object({
      merchantId: z.string(),
      channel: z.enum(["all", "nip", "pos", "ussd", "web", "mobile", "card"]).default("all"),
      limitType: z.enum(["per_minute", "per_hour", "per_day", "per_month"]),
      maxCount: z.number().int().positive().optional(),
      maxAmountKobo: z.number().int().positive().optional(),
      singleTxMaxKobo: z.number().int().positive().optional(),
      riskTier: z.enum(["standard", "elevated", "high_risk"]).default("standard"),
      reason: z.string().optional(),
      effectiveTo: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      // Deactivate existing limits for same merchant+channel+limitType
      await db.update(velocityLimitConfigs).set({
        isActive: false,
        updatedAt: new Date(),
      }).where(and(
        eq(velocityLimitConfigs.merchantId, input.merchantId),
        eq(velocityLimitConfigs.channel, input.channel),
        eq(velocityLimitConfigs.limitType, input.limitType),
        eq(velocityLimitConfigs.isActive, true),
      ));
      const [config] = await db.insert(velocityLimitConfigs).values({
        merchantId: input.merchantId,
        channel: input.channel,
        limitType: input.limitType,
        maxCount: input.maxCount ?? null,
        maxAmountKobo: input.maxAmountKobo ?? null,
        singleTxMaxKobo: input.singleTxMaxKobo ?? null,
        riskTier: input.riskTier,
        isActive: true,
        effectiveFrom: new Date(),
        effectiveTo: input.effectiveTo ?? null,
        setBy: ctx.user.openId,
        reason: input.reason ?? null,
      }).returning();
      // Publish to Kafka so Go bridge Redis counters are invalidated
      await publishEvent("velocity_limit.updated", {
        merchant_id: input.merchantId,
        channel: input.channel,
        limit_type: input.limitType,
        config_id: config.id,
      });
      return config;
    }),

  deactivateLimit: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(velocityLimitConfigs).set({
        isActive: false,
        updatedAt: new Date(),
      }).where(eq(velocityLimitConfigs.id, input.id));
      return { success: true };
    }),

  listBreaches: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      merchantId: z.string().optional(),
      action: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      // Same cross-tenant guard as listConfigs: merchantId override is
      // honoured for platform admins only.
      const ownMerchantId = ctx.user.tenantId ?? ctx.user.openId;
      let targetMerchantId = ownMerchantId;
      if (input.merchantId && input.merchantId !== ownMerchantId) {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot read another merchant's velocity breaches" });
        }
        targetMerchantId = input.merchantId;
      }
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(velocityBreaches.merchantId, targetMerchantId)];
      if (input.action) conditions.push(eq(velocityBreaches.action, input.action));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]);
      const rows = await db.select().from(velocityBreaches)
        .where(where)
        .orderBy(desc(velocityBreaches.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(velocityBreaches).where(where);
      return { breaches: rows, total: Number(count), page: input.page, limit: input.limit };
    }),

  resolveBreachOverride: adminProcedure
    .input(z.object({
      breachId: z.string(),
      reason: z.string().min(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(velocityBreaches).set({
        action: "allowed",
        resolvedAt: new Date(),
        resolvedBy: ctx.user.openId,
      }).where(eq(velocityBreaches.id, input.breachId));
      return { success: true };
    }),
});

// ─── 3. Interchange Router ────────────────────────────────────────────────────

export const interchangeRouter = router({
  listSchedule: protectedProcedure
    .input(z.object({
      scheme: z.string().optional(),
      channel: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [];
      if (input.scheme) conditions.push(eq(interchangeSchedule.scheme, input.scheme));
      if (input.channel) conditions.push(eq(interchangeSchedule.channel, input.channel));
      if (input.isActive !== undefined) conditions.push(eq(interchangeSchedule.isActive, input.isActive));
      const where = conditions.length === 0 ? undefined
        : conditions.length === 1 ? conditions[0]
        : and(...conditions as [any, ...any[]]);
      return db.select().from(interchangeSchedule)
        .where(where)
        .orderBy(desc(interchangeSchedule.effectiveFrom));
    }),

  upsertScheduleEntry: adminProcedure
    .input(z.object({
      scheme: z.enum(["visa", "mastercard", "verve", "amex"]),
      cardType: z.enum(["debit", "credit", "prepaid", "corporate"]),
      channel: z.enum(["card_present", "card_not_present", "contactless", "ecommerce"]),
      mcc: z.string().optional(),
      basisPoints: z.number().int().min(0).max(10000),
      fixedFeeKobo: z.number().int().min(0).default(0),
      minFeeKobo: z.number().int().min(0).default(0),
      maxFeeKobo: z.number().int().min(0).default(0),
      effectiveFrom: z.date(),
      effectiveTo: z.date().optional(),
      source: z.enum(["cbn_schedule", "scheme_direct", "custom"]).default("cbn_schedule"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Expire existing matching entry
      await db.update(interchangeSchedule).set({
        isActive: false,
        effectiveTo: input.effectiveFrom,
        updatedAt: new Date(),
      }).where(and(
        eq(interchangeSchedule.scheme, input.scheme),
        eq(interchangeSchedule.cardType, input.cardType),
        eq(interchangeSchedule.channel, input.channel),
        eq(interchangeSchedule.isActive, true),
        input.mcc ? eq(interchangeSchedule.mcc, input.mcc) : isNull(interchangeSchedule.mcc),
      ));
      const [entry] = await db.insert(interchangeSchedule).values({
        ...input,
        mcc: input.mcc ?? null,
        effectiveTo: input.effectiveTo ?? null,
        isActive: true,
      }).returning();
      return entry;
    }),

  calculateFee: protectedProcedure
    .input(z.object({
      scheme: z.string(),
      cardType: z.string().optional(),
      channel: z.string(),
      amountKobo: z.number().int().positive(),
      mcc: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const now = new Date();
      // Find best matching schedule entry (most specific: with MCC > without MCC)
      const conditions = [
        eq(interchangeSchedule.scheme, input.scheme),
        eq(interchangeSchedule.channel, input.channel),
        eq(interchangeSchedule.isActive, true),
        lte(interchangeSchedule.effectiveFrom, now),
        or(isNull(interchangeSchedule.effectiveTo), gte(interchangeSchedule.effectiveTo, now)),
      ];
      if (input.cardType) conditions.push(eq(interchangeSchedule.cardType, input.cardType));

      const entries = await db.select().from(interchangeSchedule)
        .where(and(...conditions as [any, ...any[]]))
        .orderBy(desc(interchangeSchedule.effectiveFrom))
        .limit(10);

      // Prefer MCC-specific entry
      const entry = (input.mcc ? entries.find(e => e.mcc === input.mcc) : null)
        ?? entries.find(e => !e.mcc)
        ?? entries[0];

      if (!entry) {
        // Default CBN interchange: 1.5% for card, 0.5% for NIP
        const defaultBps = input.channel === "card_present" || input.channel === "card_not_present" ? 150 : 50;
        const feeKobo = Math.round(input.amountKobo * defaultBps / 10000);
        return { feeKobo, basisPoints: defaultBps, fixedFeeKobo: 0, scheduleId: null };
      }

      const percentageFeeKobo = Math.round(input.amountKobo * entry.basisPoints / 10000);
      let feeKobo = percentageFeeKobo + (entry.fixedFeeKobo ?? 0);
      if (entry.minFeeKobo && feeKobo < entry.minFeeKobo) feeKobo = entry.minFeeKobo;
      if (entry.maxFeeKobo && entry.maxFeeKobo > 0 && feeKobo > entry.maxFeeKobo) feeKobo = entry.maxFeeKobo;

      return {
        feeKobo,
        basisPoints: entry.basisPoints,
        fixedFeeKobo: entry.fixedFeeKobo ?? 0,
        percentageFeeKobo,
        scheduleId: entry.id,
      };
    }),

  listFeeRecords: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      billingPeriod: z.string().optional(),
      scheme: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(interchangeFeeRecords.merchantId, merchantId)];
      if (input.billingPeriod) conditions.push(eq(interchangeFeeRecords.billingPeriod, input.billingPeriod));
      if (input.scheme) conditions.push(eq(interchangeFeeRecords.scheme, input.scheme));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]);
      const rows = await db.select().from(interchangeFeeRecords)
        .where(where)
        .orderBy(desc(interchangeFeeRecords.createdAt))
        .offset(offset).limit(input.limit);
      const [agg] = await db.select({
        count: sql<number>`count(*)`,
        totalFeeKobo: sql<number>`sum(fee_kobo)`,
      }).from(interchangeFeeRecords).where(where);
      return {
        records: rows,
        total: Number(agg.count),
        totalFeeKobo: Number(agg.totalFeeKobo ?? 0),
        page: input.page,
        limit: input.limit,
      };
    }),
});

// ─── 4. Scheme Membership Router ──────────────────────────────────────────────

export const schemeMembershipRouter = router({
  list: adminProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(schemeMemberships).orderBy(desc(schemeMemberships.createdAt));
  }),

  get: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(schemeMemberships)
        .where(eq(schemeMemberships.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...row,
        binRanges: row.binRanges ? JSON.parse(row.binRanges) : [],
        sponsoredMerchants: row.sponsoredMerchants ? JSON.parse(row.sponsoredMerchants) : [],
      };
    }),

  upsert: adminProcedure
    .input(z.object({
      id: z.string().optional(),
      scheme: z.enum(["visa", "mastercard", "verve", "amex"]),
      membershipType: z.enum(["principal", "associate", "sponsored"]).default("principal"),
      memberId: z.string().min(1),
      status: z.enum(["active", "suspended", "terminated", "pending"]).default("active"),
      effectiveFrom: z.date(),
      renewalDate: z.date().optional(),
      contactEmail: z.string().email().optional(),
      complianceOfficer: z.string().optional(),
      binRanges: z.array(z.object({
        low: z.string(),
        high: z.string(),
        cardType: z.string(),
        country: z.string().default("NG"),
      })).default([]),
      annualFeeUsd: z.number().int().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const values = {
        scheme: input.scheme,
        membershipType: input.membershipType,
        memberId: input.memberId,
        status: input.status,
        effectiveFrom: input.effectiveFrom,
        renewalDate: input.renewalDate ?? null,
        contactEmail: input.contactEmail ?? null,
        complianceOfficer: input.complianceOfficer ?? null,
        binRanges: JSON.stringify(input.binRanges),
        annualFeeUsd: input.annualFeeUsd ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      };
      if (input.id) {
        await db.update(schemeMemberships).set(values).where(eq(schemeMemberships.id, input.id));
        return { id: input.id };
      }
      const [row] = await db.insert(schemeMemberships).values(values).returning();
      return { id: row.id };
    }),

  lookupBin: protectedProcedure
    .input(z.object({ bin: z.string().min(6).max(8) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const memberships = await db.select().from(schemeMemberships)
        .where(eq(schemeMemberships.status, "active"));
      for (const m of memberships) {
        const ranges: Array<{ low: string; high: string; cardType: string; country: string }> =
          m.binRanges ? JSON.parse(m.binRanges) : [];
        for (const range of ranges) {
          if (input.bin >= range.low && input.bin <= range.high) {
            return { scheme: m.scheme, cardType: range.cardType, country: range.country, memberId: m.memberId };
          }
        }
      }
      return null;
    }),
});

// ─── 5. Chargeback Lifecycle Router ───────────────────────────────────────────

const CHARGEBACK_DEADLINES_DAYS: Record<string, number> = {
  received: 20,           // 20 days to respond to initial chargeback
  evidence_uploaded: 15,  // 15 days to submit to scheme after evidence gathered
  submitted_to_scheme: 45, // 45 days for scheme to respond
  pre_arbitration: 10,    // 10 days for pre-arbitration response
};

export const chargebackLifecycleRouter = router({
  getTimeline: protectedProcedure
    .input(z.object({ chargebackId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;
      const events = await db.select().from(chargebackTimeline)
        .where(and(
          eq(chargebackTimeline.chargebackId, input.chargebackId),
          eq(chargebackTimeline.merchantId, merchantId),
        ))
        .orderBy(chargebackTimeline.occurredAt);
      return events;
    }),

  advanceState: protectedProcedure
    .input(z.object({
      chargebackId: z.string(),
      event: z.enum([
        "evidence_uploaded",
        "submitted_to_scheme",
        "scheme_response",
        "escalated",
        "won",
        "lost",
        "closed",
      ]),
      notes: z.string().optional(),
      schemeRef: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;

      // Get current chargeback state
      const [cb] = await db.select().from(chargebacks)
        .where(and(eq(chargebacks.id, input.chargebackId), eq(chargebacks.merchantId, merchantId)))
        .limit(1);
      if (!cb) throw new TRPCError({ code: "NOT_FOUND" });

      // Calculate deadline for next state
      const deadlineDays = CHARGEBACK_DEADLINES_DAYS[input.event];
      const deadlineAt = deadlineDays
        ? new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000)
        : null;

      // Insert timeline event
      await db.insert(chargebackTimeline).values({
        chargebackId: input.chargebackId,
        merchantId,
        event: input.event,
        previousState: cb.status,
        newState: input.event === "won" ? "won"
          : input.event === "lost" ? "lost"
          : input.event === "closed" ? "closed"
          : "under_review",
        actorId: ctx.user.openId,
        actorType: "user",
        notes: input.notes ?? null,
        schemeRef: input.schemeRef ?? null,
        deadlineAt,
      });

      // Update chargeback status
      const newStatus = input.event === "won" ? "resolved_merchant"
        : input.event === "lost" ? "resolved_customer"
        : input.event === "closed" ? "closed"
        : "under_review";

      await db.update(chargebacks).set({
        status: newStatus as any,
        notes: input.notes ?? cb.notes,
        updatedAt: new Date(),
        ...(newStatus === "resolved_merchant" || newStatus === "resolved_customer" || newStatus === "closed"
          ? { resolvedAt: new Date() } : {}),
      }).where(eq(chargebacks.id, input.chargebackId));

      // Publish to Kafka for scheme submission if needed
      if (input.event === "submitted_to_scheme") {
        await publishEvent("chargeback.submitted_to_scheme", {
          chargeback_id: input.chargebackId,
          merchant_id: merchantId,
          scheme_ref: input.schemeRef,
        });
      }

      return { success: true, newStatus, deadlineAt };
    }),

  uploadEvidence: protectedProcedure
    .input(z.object({
      chargebackId: z.string(),
      evidenceType: z.enum([
        "transaction_receipt",
        "delivery_proof",
        "communication",
        "refund_proof",
        "other",
      ]),
      fileName: z.string(),
      mimeType: z.string(),
      fileSizeBytes: z.number().int().positive(),
      base64Content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;

      // Validate chargeback belongs to merchant
      const [cb] = await db.select().from(chargebacks)
        .where(and(eq(chargebacks.id, input.chargebackId), eq(chargebacks.merchantId, merchantId)))
        .limit(1);
      if (!cb) throw new TRPCError({ code: "NOT_FOUND" });

      // Upload to S3 — sanitize fileName so path traversal ("../") cannot
      // escape the merchant prefix (same safeName pattern as
      // server/routers/chargebackLifecycle.ts).
      const fileBuffer = Buffer.from(input.base64Content, "base64");
      const suffix = crypto.randomUUID().slice(0, 8);
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `chargebacks/${merchantId}/${input.chargebackId}/${suffix}-${safeName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

      // Insert evidence record
      const [evidence] = await db.insert(chargebackEvidencePackages).values({
        chargebackId: input.chargebackId,
        merchantId,
        evidenceType: input.evidenceType,
        fileName: input.fileName,
        fileKey,
        fileUrl: url,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        uploadedBy: ctx.user.openId,
      }).returning();

      return { evidenceId: evidence.id, fileUrl: url };
    }),

  listEvidence: protectedProcedure
    .input(z.object({ chargebackId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;
      return db.select().from(chargebackEvidencePackages)
        .where(and(
          eq(chargebackEvidencePackages.chargebackId, input.chargebackId),
          eq(chargebackEvidencePackages.merchantId, merchantId),
        ))
        .orderBy(chargebackEvidencePackages.uploadedAt);
    }),
});

// ─── 6. Regulatory Reports Router ─────────────────────────────────────────────

export const regulatoryReportsRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      reportType: z.string().optional(),
      status: z.string().optional(),
      period: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(regulatoryReports.merchantId, merchantId)];
      if (input.reportType) conditions.push(eq(regulatoryReports.reportType, input.reportType));
      if (input.status) conditions.push(eq(regulatoryReports.status, input.status));
      if (input.period) conditions.push(eq(regulatoryReports.period, input.period));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]);
      const rows = await db.select().from(regulatoryReports)
        .where(where)
        .orderBy(desc(regulatoryReports.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(regulatoryReports).where(where);
      return { reports: rows, total: Number(count), page: input.page, limit: input.limit };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = ctx.user.tenantId ?? ctx.user.openId;
      const [report] = await db.select().from(regulatoryReports)
        .where(and(eq(regulatoryReports.id, input.id), eq(regulatoryReports.merchantId, merchantId)))
        .limit(1);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      const submissions = await db.select().from(regulatoryReportSubmissions)
        .where(eq(regulatoryReportSubmissions.reportId, input.id))
        .orderBy(desc(regulatoryReportSubmissions.submittedAt));
      return { report, submissions };
    }),

  /**
   * Trigger generation of a CBN Form A (monthly transaction summary).
   * Calls the Python regulatory-reporting service via the Go bridge.
   */
  generateFormA: adminProcedure
    .input(z.object({
      merchantId: z.string(),
      period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM"),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Idempotency: check if report already exists for this period
      const existing = await db.select().from(regulatoryReports)
        .where(and(
          eq(regulatoryReports.merchantId, input.merchantId),
          eq(regulatoryReports.period, input.period),
          eq(regulatoryReports.reportType, "CBN_FORM_A"),
        )).limit(1);
      if (existing.length > 0) return { reportId: existing[0].id, alreadyExists: true };

      const [report] = await db.insert(regulatoryReports).values({
        merchantId: input.merchantId,
        reportType: "CBN_FORM_A",
        period: input.period,
        regulator: "CBN",
        status: "pending",
      }).returning();

      // Publish to Kafka for async generation by Python service
      await publishEvent("regulatory.generate_form_a", {
        report_id: report.id,
        merchant_id: input.merchantId,
        period: input.period,
      });

      return { reportId: report.id, alreadyExists: false };
    }),

  generateFormB: adminProcedure
    .input(z.object({
      merchantId: z.string(),
      quarter: z.string().regex(/^\d{4}-Q[1-4]$/, "Quarter must be YYYY-Q1/Q2/Q3/Q4"),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(regulatoryReports)
        .where(and(
          eq(regulatoryReports.merchantId, input.merchantId),
          eq(regulatoryReports.period, input.quarter),
          eq(regulatoryReports.reportType, "CBN_FORM_B"),
        )).limit(1);
      if (existing.length > 0) return { reportId: existing[0].id, alreadyExists: true };

      const [report] = await db.insert(regulatoryReports).values({
        merchantId: input.merchantId,
        reportType: "CBN_FORM_B",
        period: input.quarter,
        regulator: "CBN",
        status: "pending",
      }).returning();

      await publishEvent("regulatory.generate_form_b", {
        report_id: report.id,
        merchant_id: input.merchantId,
        quarter: input.quarter,
      });

      return { reportId: report.id, alreadyExists: false };
    }),

  generateFormC: adminProcedure
    .input(z.object({
      merchantId: z.string(),
      year: z.number().int().min(2020).max(2100),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const period = String(input.year);
      const existing = await db.select().from(regulatoryReports)
        .where(and(
          eq(regulatoryReports.merchantId, input.merchantId),
          eq(regulatoryReports.period, period),
          eq(regulatoryReports.reportType, "CBN_FORM_C"),
        )).limit(1);
      if (existing.length > 0) return { reportId: existing[0].id, alreadyExists: true };

      const [report] = await db.insert(regulatoryReports).values({
        merchantId: input.merchantId,
        reportType: "CBN_FORM_C",
        period,
        regulator: "CBN",
        status: "pending",
      }).returning();

      await publishEvent("regulatory.generate_form_c", {
        report_id: report.id,
        merchant_id: input.merchantId,
        year: input.year,
      });

      return { reportId: report.id, alreadyExists: false };
    }),

  /**
   * Mark a report as submitted (called by Python service after successful CBN portal submission).
   */
  markSubmitted: adminProcedure
    .input(z.object({
      reportId: z.string(),
      regulatorRef: z.string(),
      fileUrl: z.string().url().optional(),
      fileKey: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(regulatoryReports).set({
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(regulatoryReports.id, input.reportId));

      const [report] = await db.select().from(regulatoryReports)
        .where(eq(regulatoryReports.id, input.reportId)).limit(1);

      await db.insert(regulatoryReportSubmissions).values({
        reportId: input.reportId,
        merchantId: report?.merchantId ?? "",
        formType: report?.reportType ?? "CBN_FORM_A",
        period: report?.period ?? "",
        submissionMethod: "api",
        regulatorRef: input.regulatorRef,
        status: "submitted",
        fileUrl: input.fileUrl ?? null,
        fileKey: input.fileKey ?? null,
      });

      return { success: true };
    }),

  /**
   * Retry a failed or pending regulatory report submission.
   * Re-publishes the Kafka event so the Python service picks it up again.
   */
  retrySubmission: adminProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [report] = await db.select().from(regulatoryReports)
        .where(eq(regulatoryReports.id, input.reportId)).limit(1);
      if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
      if (report.status === 'acknowledged') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Report already acknowledged by regulator' });
      const eventType = report.reportType === 'CBN_FORM_A' ? 'regulatory.generate_form_a'
        : report.reportType === 'CBN_FORM_B' ? 'regulatory.generate_form_b'
        : 'regulatory.generate_form_c';
      await publishEvent(eventType, {
        report_id: report.id,
        merchant_id: report.merchantId,
        period: report.period,
        retry: true,
      });
      await db.update(regulatoryReports).set({ status: 'pending', updatedAt: new Date() })
        .where(eq(regulatoryReports.id, input.reportId));
      return { success: true, reportId: input.reportId };
    }),

  /**
   * List all submission attempts for a given report (submission history table).
   */
  listSubmissions: protectedProcedure
    .input(z.object({
      reportId: z.string().optional(),
      merchantId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const targetMerchantId = input.merchantId ?? ctx.user.tenantId ?? ctx.user.openId;
      const conditions = [eq(regulatoryReportSubmissions.merchantId, targetMerchantId)];
      if (input.reportId) conditions.push(eq(regulatoryReportSubmissions.reportId, input.reportId));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]);
      const rows = await db.select().from(regulatoryReportSubmissions)
        .where(where)
        .orderBy(desc(regulatoryReportSubmissions.submittedAt))
        .limit(input.limit);
      return { submissions: rows };
    }),

  /**
   * Record the CBN portal acknowledgement reference number against a submission.
   */
  acknowledgeSubmission: adminProcedure
    .input(z.object({
      submissionId: z.string(),
      regulatorRef: z.string().min(1),
      acknowledgedAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [submission] = await db.select().from(regulatoryReportSubmissions)
        .where(eq(regulatoryReportSubmissions.id, input.submissionId)).limit(1);
      if (!submission) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' });
      const ackAt = input.acknowledgedAt ? new Date(input.acknowledgedAt) : new Date();
      await db.update(regulatoryReportSubmissions).set({
        regulatorRef: input.regulatorRef,
        acknowledgedAt: ackAt,
        status: 'acknowledged',
      }).where(eq(regulatoryReportSubmissions.id, input.submissionId));
      // Propagate acknowledged status to the parent report
      await db.update(regulatoryReports).set({
        status: 'acknowledged',
        acknowledgedAt: ackAt,
        updatedAt: new Date(),
      }).where(eq(regulatoryReports.id, submission.reportId));
      return { success: true };
    }),

  /**
   * Interchange P&L analytics — daily/monthly fee income grouped by scheme, channel, card type.
   */
  interchangePnl: adminProcedure
    .input(z.object({
      period: z.enum(["7d", "30d", "90d", "12m"]).default("30d"),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const periodDays = input.period === "7d" ? 7 : input.period === "30d" ? 30 : input.period === "90d" ? 90 : 365;
      const since = new Date(Date.now() - periodDays * 86_400_000);
      const byScheme = await db
        .select({
          scheme: interchangeFeeRecords.scheme,
          channel: interchangeFeeRecords.channel,
          cardType: interchangeFeeRecords.cardType,
          billingPeriod: interchangeFeeRecords.billingPeriod,
          totalFeeKobo: sql<number>`coalesce(sum(${interchangeFeeRecords.feeKobo}), 0)`,
          totalVolumeKobo: sql<number>`coalesce(sum(${interchangeFeeRecords.transactionAmountKobo}), 0)`,
          txCount: sql<number>`count(*)`,
          avgBps: sql<number>`coalesce(avg(${interchangeFeeRecords.basisPoints}), 0)`,
        })
        .from(interchangeFeeRecords)
        .where(gte(interchangeFeeRecords.createdAt, since))
        .groupBy(
          interchangeFeeRecords.scheme,
          interchangeFeeRecords.channel,
          interchangeFeeRecords.cardType,
          interchangeFeeRecords.billingPeriod,
        )
        .orderBy(desc(interchangeFeeRecords.billingPeriod));
      const totalFeeKobo = byScheme.reduce((s, r) => s + Number(r.totalFeeKobo), 0);
      const totalVolumeKobo = byScheme.reduce((s, r) => s + Number(r.totalVolumeKobo), 0);
      return {
        summary: {
          totalFeeKobo,
          totalVolumeKobo,
          effectiveBps: totalVolumeKobo > 0 ? Math.round((totalFeeKobo / totalVolumeKobo) * 10_000) : 0,
          txCount: byScheme.reduce((s, r) => s + Number(r.txCount), 0),
        },
        rows: byScheme.map(r => ({
          ...r,
          totalFeeKobo: Number(r.totalFeeKobo),
          totalVolumeKobo: Number(r.totalVolumeKobo),
          txCount: Number(r.txCount),
          avgBps: Number(r.avgBps),
        })),
      };
    }),

  /**
   * STR filing queue — pending STRs with countdown to 24h CBN deadline.
   */
  pendingStrQueue: adminProcedure
    .query(async () => {
      const db = (await getDb())!;
      const rows = await db
        .select()
        .from(strRecords)
        .where(eq(strRecords.submissionStatus, "pending"))
        .orderBy(strRecords.filedAt)
        .limit(200);
      const now = Date.now();
      return rows.map(r => {
        const ageMs = now - new Date(r.filedAt).getTime();
        const deadlineMs = 24 * 3_600_000;
        const remainingMs = Math.max(0, deadlineMs - ageMs);
        const remainingHours = remainingMs / 3_600_000;
        return {
          ...r,
          ageHours: Math.round(ageMs / 3_600_000 * 10) / 10,
          remainingHours: Math.round(remainingHours * 10) / 10,
          isUrgent: remainingHours < 4,
          isOverdue: remainingMs === 0,
        };
      });
    }),

  /**
   * Submit a single STR to NFIU via the Go bridge — one-click from the filing queue.
   */
  submitStrToNfiu: adminProcedure
    .input(z.object({ strId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [record] = await db
        .select()
        .from(strRecords)
        .where(eq(strRecords.id, input.strId))
        .limit(1);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "STR record not found" });
      if (record.submissionStatus === "submitted" || record.submissionStatus === "acknowledged") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "STR already submitted" });
      }
      const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://localhost:8080";
      const resp = await fetch(`${bridgeUrl}/api/cbn/str/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
        },
        body: JSON.stringify({
          str_id: record.id,
          transaction_id: record.transactionId,
          merchant_id: record.merchantId,
          subject_data: record.subjectData,
          transaction_data: record.transactionData,
          suspicion_type: record.suspicionType,
          suspicion_grounds: record.suspicionGrounds,
          narrative: record.narrative,
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        await db.update(strRecords).set({
          submissionAttempts: sql`${strRecords.submissionAttempts} + 1`,
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(strRecords.id, input.strId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `NFIU submission failed: ${errBody}` });
      }
      const result = await resp.json() as { reference: string };
      await db.update(strRecords).set({
        nfiuRef: result.reference,
        nfiuSubmittedAt: new Date(),
        submissionStatus: "submitted",
        submissionAttempts: sql`${strRecords.submissionAttempts} + 1`,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(strRecords.id, input.strId));
      await publishEvent("str.submitted", { strId: input.strId, nfiuReference: result.reference });
      return { success: true, nfiuReference: result.reference };
    }),

  upcomingDeadlines: adminProcedure
    .input(z.object({ daysAhead: z.number().int().min(1).max(30).default(7) }))
    .query(async () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      // CBN Form A: due 10th of each month
      // CBN Form B: due 25th of March, June, September, December
      // CBN Form C: due January 15th
      const deadlines = [
        { form_type: "CBN_FORM_A", description: "Monthly Transaction Summary", due_day: 10, due_months: [1,2,3,4,5,6,7,8,9,10,11,12] },
        { form_type: "CBN_FORM_B", description: "Quarterly Activity Report", due_day: 25, due_months: [3,6,9,12] },
        { form_type: "CBN_FORM_C", description: "Annual Compliance Report", due_day: 15, due_months: [1] },
      ];
      return deadlines
        .filter(d => d.due_months.includes(month))
        .map(d => ({
          form_type: d.form_type,
          description: d.description,
          due_date: `${now.getFullYear()}-${String(month).padStart(2,'0')}-${String(d.due_day).padStart(2,'0')}`,
          days_remaining: d.due_day - day,
        }))
        .filter(d => d.days_remaining >= 0 && d.days_remaining <= 7);
    }),
});
