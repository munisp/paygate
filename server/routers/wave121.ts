/**
 * Wave 121 — Dedicated tRPC routers for:
 *   1. feeSchedules   — tenantFeeOverrides table
 *   2. chargebackMgmt — chargebacks table
 *   3. fraudRules     — fraudAlerts + fraud_rules logic
 *   4. kybMgmt        — kybVerifications table
 *   5. invoiceFinV2   — invoiceFinancingV2Applications table
 *   6. loyaltyV3      — loyaltyV3Programs + loyaltyV3Members tables
 *   7. openSearchAudit — OpenSearch-backed audit trail search
 *   8. tenantProvision — Temporal-backed tenant provisioning
 */

import { TRPCError } from "@trpc/server";
import { desc, eq, and, gte, lte, like, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { publishAuditEvent } from "../kafkaClient";
import { startKybVerification } from "../temporalClient";
import { getDb } from "../db";
import {
  tenantFeeOverrides,
  chargebacks,
  fraudAlerts,
  kybVerifications,
  kybSteps,
  invoiceFinancingV2Applications,
  loyaltyV3Programs,
  loyaltyV3Members,
  tenantConfig,
} from "../../drizzle/schema";
import {
  provisionTenantViaMiddleware,
  searchAuditTrailViaOpenSearch,
  indexAuditEventViaOpenSearch,
} from "../middlewareBridge";

// ─── 1. Fee Schedules ─────────────────────────────────────────────────────────
export const feeSchedulesRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      transactionType: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(tenantFeeOverrides.tenantId, ctx.user.tenantId ?? "")];
      if (input.isActive !== undefined) conditions.push(eq(tenantFeeOverrides.isActive, input.isActive));
      if (input.transactionType) conditions.push(eq(tenantFeeOverrides.transactionType, input.transactionType));
      const rows = await db.select().from(tenantFeeOverrides)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]))
        .orderBy(desc(tenantFeeOverrides.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(tenantFeeOverrides).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]));
      return { schedules: rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(tenantFeeOverrides)
        .where(and(
          eq(tenantFeeOverrides.id, input.id),
          eq(tenantFeeOverrides.tenantId, ctx.user.tenantId ?? "")
        )).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      transactionType: z.string().min(1).max(100),
      flatFeeNgn: z.number().min(0).default(0),
      percentageFee: z.number().min(0).max(100).default(1.5),
      capNgn: z.number().optional(),
      floorNgn: z.number().optional(),
      effectiveFrom: z.string().optional(),
      effectiveTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.insert(tenantFeeOverrides).values({
        tenantId: ctx.user.tenantId ?? "",
        transactionType: input.transactionType,
        flatFeeNgn: input.flatFeeNgn,
        percentageFee: input.percentageFee,
        capNgn: input.capNgn,
        floorNgn: input.floorNgn,
        isActive: true,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
      }).returning();
      return row;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      flatFeeNgn: z.number().min(0).optional(),
      percentageFee: z.number().min(0).max(100).optional(),
      capNgn: z.number().optional(),
      floorNgn: z.number().optional(),
      isActive: z.boolean().optional(),
      effectiveTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const { id, ...updates } = input;
      const setData: Record<string, unknown> = {};
      if (updates.flatFeeNgn !== undefined) setData.flatFeeNgn = updates.flatFeeNgn;
      if (updates.percentageFee !== undefined) setData.percentageFee = updates.percentageFee;
      if (updates.capNgn !== undefined) setData.capNgn = updates.capNgn;
      if (updates.floorNgn !== undefined) setData.floorNgn = updates.floorNgn;
      if (updates.isActive !== undefined) setData.isActive = updates.isActive;
      if (updates.effectiveTo) setData.effectiveTo = new Date(updates.effectiveTo);
      await db.update(tenantFeeOverrides).set(setData)
        .where(and(eq(tenantFeeOverrides.id, id), eq(tenantFeeOverrides.tenantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.delete(tenantFeeOverrides)
        .where(and(eq(tenantFeeOverrides.id, input.id), eq(tenantFeeOverrides.tenantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const [{ total }] = await db.select({ total: sql<number>`count(*)` })
      .from(tenantFeeOverrides).where(eq(tenantFeeOverrides.tenantId, ctx.user.tenantId ?? ""));
    const [{ active }] = await db.select({ active: sql<number>`count(*)` })
      .from(tenantFeeOverrides).where(and(
        eq(tenantFeeOverrides.tenantId, ctx.user.tenantId ?? ""),
        eq(tenantFeeOverrides.isActive, true)
      ));
    return { total: Number(total), active: Number(active) };
  }),
});

// ─── 2. Chargeback Management ─────────────────────────────────────────────────
export const chargebackMgmtRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(chargebacks.merchantId, ctx.user.tenantId ?? "")];
      if (input.status) conditions.push(eq(chargebacks.status, input.status));
      const rows = await db.select().from(chargebacks)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]))
        .orderBy(desc(chargebacks.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(chargebacks).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]));
      return { chargebacks: rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(chargebacks)
        .where(and(eq(chargebacks.id, input.id), eq(chargebacks.merchantId, ctx.user.tenantId ?? "")))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  submitEvidence: protectedProcedure
    .input(z.object({
      id: z.string(),
      evidence: z.string().min(1),
      evidenceUrl: z.string().url().optional(),
      evidenceFileName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(chargebacks).set({
        evidence: input.evidence,
        evidenceUrl: input.evidenceUrl,
        evidenceFileName: input.evidenceFileName,
        evidenceSubmitted: true,
        updatedAt: new Date(),
      }).where(and(eq(chargebacks.id, input.id), eq(chargebacks.merchantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["open", "under_review", "won", "lost", "withdrawn"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const setData: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };
      if (input.notes) setData.notes = input.notes;
      if (input.status === "won" || input.status === "lost") setData.resolvedAt = new Date();
      await db.update(chargebacks).set(setData)
        .where(and(eq(chargebacks.id, input.id), eq(chargebacks.merchantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select({
      status: chargebacks.status,
      count: sql<number>`count(*)`,
      totalAmount: sql<number>`sum(amount_kobo)`,
    }).from(chargebacks)
      .where(eq(chargebacks.merchantId, ctx.user.tenantId ?? ""))
      .groupBy(chargebacks.status);
    return rows.map(r => ({ status: r.status, count: Number(r.count), totalAmountKobo: Number(r.totalAmount ?? 0) }));
  }),
});

// ─── 3. Fraud Rules ───────────────────────────────────────────────────────────
export const fraudRulesRouter = router({
  listAlerts: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
      alertType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(fraudAlerts.merchantId, ctx.user.tenantId ?? "")];
      if (input.status) conditions.push(eq(fraudAlerts.status, input.status as any));
      if (input.alertType) conditions.push(eq(fraudAlerts.alertType, input.alertType as any));
      const rows = await db.select().from(fraudAlerts)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]))
        .orderBy(desc(fraudAlerts.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(fraudAlerts).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]));
      return { alerts: rows, total: Number(count) };
    }),

  getAlert: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(fraudAlerts)
        .where(and(eq(fraudAlerts.id, input.id), eq(fraudAlerts.merchantId, ctx.user.tenantId ?? "")))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  acknowledgeAlert: protectedProcedure
    .input(z.object({ id: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(fraudAlerts).set({
        status: "investigating",
        notes: input.notes,
        updatedAt: new Date(),
      }).where(and(eq(fraudAlerts.id, input.id), eq(fraudAlerts.merchantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  resolveAlert: protectedProcedure
    .input(z.object({ id: z.string(), resolution: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(fraudAlerts).set({
        status: "resolved",
        resolvedAt: new Date(),
        resolvedBy: ctx.user.openId,
        notes: input.resolution,
        updatedAt: new Date(),
      }).where(and(eq(fraudAlerts.id, input.id), eq(fraudAlerts.merchantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const byStatus = await db.select({
      status: fraudAlerts.status,
      count: sql<number>`count(*)`,
    }).from(fraudAlerts)
      .where(eq(fraudAlerts.merchantId, ctx.user.tenantId ?? ""))
      .groupBy(fraudAlerts.status);
    return {
      byStatus: byStatus.map(r => ({ status: r.status, count: Number(r.count) })),
    };
  }),

  createRule: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      ruleType: z.string().min(1),
      condition: z.string().optional(),
      action: z.string().min(1),
      threshold: z.number().min(0).default(0),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const ruleId = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.insert(fraudAlerts).values({
        id: ruleId,
        merchantId: ctx.user.tenantId ?? "",
        alertType: input.ruleType,
        status: input.isActive ? "open" : "resolved",
        riskScore: input.threshold,
        transactionId: null,
        amount: 0,
        currency: "NGN",
        description: `Rule: ${input.name} — Action: ${input.action}${input.condition ? ` — Condition: ${input.condition}` : ""}`,
        metadata: JSON.stringify({ name: input.name, ruleType: input.ruleType, action: input.action, condition: input.condition, threshold: input.threshold, isRule: true }),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      return { ruleId, success: true };
    }),
});

// ─── 4. KYB Management ────────────────────────────────────────────────────────
export const kybMgmtRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
      riskLevel: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(kybVerifications.merchantId, ctx.user.tenantId ?? "")];
      if (input.status) conditions.push(eq(kybVerifications.status, input.status));
      if (input.riskLevel) conditions.push(eq(kybVerifications.riskLevel, input.riskLevel));
      const rows = await db.select().from(kybVerifications)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]))
        .orderBy(desc(kybVerifications.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(kybVerifications).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]));
      return { verifications: rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(kybVerifications)
        .where(and(eq(kybVerifications.verificationId, input.id), eq(kybVerifications.merchantId, ctx.user.tenantId ?? "")))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  initiate: protectedProcedure
    .input(z.object({
      businessName: z.string().min(1),
      rcNumber: z.string().optional(),
      taxId: z.string().optional(),
      businessType: z.string().optional(),
      industryCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const verificationId = crypto.randomUUID();
      const [row] = await db.insert(kybVerifications).values({
        verificationId,
        merchantId: ctx.user.tenantId ?? "",
        businessName: input.businessName,
        rcNumber: input.rcNumber,
        taxId: input.taxId,
        businessType: input.businessType,
        industryCode: input.industryCode,
        status: "pending",
        initiatedBy: ctx.user.openId,
        startedAt: new Date(),
      }).returning();

      // ── Fix 4: Start Temporal KYB workflow and persist workflowId + runId ────────
      const wfHandle = await startKybVerification(
        ctx.user.tenantId ?? verificationId,
        [input.rcNumber ?? "", input.taxId ?? ""].filter(Boolean),
      ).catch(() => null);
      if (wfHandle?.workflowId) {
        await db.update(kybVerifications)
          .set({
            temporalWorkflowId: wfHandle.workflowId,
            temporalRunId: wfHandle.runId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(kybVerifications.verificationId, verificationId));
      }

      return { ...row, temporalWorkflowId: wfHandle?.workflowId ?? null };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["pending", "in_review", "approved", "rejected", "requires_more_info"]),
      riskLevel: z.enum(["low", "medium", "high"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const setData: Record<string, unknown> = { status: input.status, updatedAt: new Date() };
      if (input.riskLevel) setData.riskLevel = input.riskLevel;
      await db.update(kybVerifications).set(setData)
        .where(and(eq(kybVerifications.verificationId, input.id), eq(kybVerifications.merchantId, ctx.user.tenantId ?? "")));
      if (input.status === 'approved' || input.status === 'rejected') {
        publishAuditEvent({ action: 'kyb.status.updated', userId: ctx.user.openId, targetId: input.id, metadata: { status: input.status }, timestamp: new Date().toISOString() }).catch(() => {});
      }
      return { success: true };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select({
      status: kybVerifications.status,
      count: sql<number>`count(*)`,
    }).from(kybVerifications)
      .where(eq(kybVerifications.merchantId, ctx.user.tenantId ?? ""))
      .groupBy(kybVerifications.status);
    return rows.map(r => ({ status: r.status, count: Number(r.count) }));
  }),

  // ── KYB Renewal Reminder (Wave 173) ──────────────────────────────────────
  // Returns KYB verifications expiring within `daysAhead` days (default 30).
  // Sends an owner notification for each merchant approaching expiry.
  sendRenewalReminders: protectedProcedure
    .input(z.object({ daysAhead: z.number().int().min(1).max(90).default(30) }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const cutoff = new Date(Date.now() + input.daysAhead * 86_400_000);
      const now = new Date();
      const { lt, gt, isNull, or, and: andOp } = await import('drizzle-orm');
      const expiring = await db.select().from(kybVerifications).where(
        andOp(
          eq(kybVerifications.status, 'approved'),
          lt(kybVerifications.expiresAt!, cutoff),
          gt(kybVerifications.expiresAt!, now),
          or(
            isNull(kybVerifications.renewalReminderSentAt),
            lt(kybVerifications.renewalReminderSentAt!, new Date(Date.now() - 7 * 86_400_000)),
          ),
        )
      ).limit(100);
      let sent = 0;
      for (const v of expiring) {
        try {
          const { notifyOwner } = await import('../_core/notification');
          await notifyOwner({
            title: `KYB Renewal Due: ${v.businessName}`,
            content: `KYB verification for ${v.businessName} (${v.verificationId}) expires on ${v.expiresAt?.toISOString().slice(0,10)}. Please initiate renewal.`,
          });
          await db.update(kybVerifications)
            .set({ renewalReminderSentAt: new Date(), updatedAt: new Date() })
            .where(eq(kybVerifications.verificationId, v.verificationId));
          sent++;
        } catch { /* non-fatal */ }
      }
      return { sent, total: expiring.length };
    }),

  // ── Geo-Velocity Check (Wave 173) ─────────────────────────────────────────
  // Flags KYB verifications where the submitting IP resolves to a different
  // country than the registered business country.
  checkGeoVelocity: protectedProcedure
    .input(z.object({
      verificationId: z.string(),
      currentIp: z.string(),
      currentCountry: z.string().length(2), // ISO-3166-1 alpha-2
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [v] = await db.select().from(kybVerifications)
        .where(and(
          eq(kybVerifications.verificationId, input.verificationId),
          eq(kybVerifications.merchantId, ctx.user.tenantId ?? ''),
        )).limit(1);
      if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
      const flagged = v.lastKnownCountry !== null
        && v.lastKnownCountry !== input.currentCountry;
      const note = flagged
        ? `IP country changed from ${v.lastKnownCountry} to ${input.currentCountry} (IP: ${input.currentIp})`
        : null;
      await db.update(kybVerifications).set({
        lastKnownIp: input.currentIp,
        lastKnownCountry: input.currentCountry,
        geoVelocityFlagged: flagged,
        geoVelocityNote: note,
        updatedAt: new Date(),
      }).where(eq(kybVerifications.verificationId, input.verificationId));
      if (flagged) {
        publishAuditEvent({
          action: 'kyb.geo_velocity.flagged',
          userId: ctx.user.openId,
          targetId: input.verificationId,
          metadata: { note },
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
      return { flagged, note };
    }),

  // ── Director KYC sub-flow (Wave 181) ─────────────────────────────────────────
  getVerification: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(kybVerifications)
        .where(and(
          eq(kybVerifications.verificationId, input.verificationId),
          eq(kybVerifications.merchantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "KYB verification not found" });
      return row;
    }),

  addDirectorKyc: protectedProcedure
    .input(z.object({
      verificationId: z.string(),
      stepName: z.string().default("director_kyc"),
      directorData: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [kyb] = await db.select().from(kybVerifications)
        .where(and(
          eq(kybVerifications.verificationId, input.verificationId),
          eq(kybVerifications.merchantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);
      if (!kyb) throw new TRPCError({ code: "NOT_FOUND", message: "KYB verification not found" });
      const [step] = await db.insert(kybSteps).values({
        verificationId: input.verificationId,
        stepName: input.stepName,
        status: "pending",
        notes: input.directorData,
        updatedAt: new Date(),
      }).returning();
      if (kyb.status === "pending") {
        await db.update(kybVerifications)
          .set({ status: "in_review", updatedAt: new Date() })
          .where(eq(kybVerifications.verificationId, input.verificationId));
      }
      publishAuditEvent({
        action: "kyb.director_kyc.submitted",
        userId: ctx.user.openId,
        targetId: input.verificationId,
        metadata: { stepId: step.id, stepName: input.stepName },
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      return { stepId: step.id, status: "pending" };
    }),
});

// ─── 5. Invoice Financing V2 ──────────────────────────────────────────────────
export const invoiceFinV2Router = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(invoiceFinancingV2Applications.merchantId, ctx.user.tenantId ?? "")];
      if (input.status) conditions.push(eq(invoiceFinancingV2Applications.status, input.status));
      const rows = await db.select().from(invoiceFinancingV2Applications)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]))
        .orderBy(desc(invoiceFinancingV2Applications.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(invoiceFinancingV2Applications).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]));
      return { applications: rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(invoiceFinancingV2Applications)
        .where(and(eq(invoiceFinancingV2Applications.id, input.id), eq(invoiceFinancingV2Applications.merchantId, ctx.user.tenantId ?? "")))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  submitApplication: protectedProcedure
    .input(z.object({
      invoiceId: z.string().optional(),
      invoiceAmount: z.number().int().min(1),
      requestedAmount: z.number().int().min(1),
      interestRate: z.string().default("3.5"),
      tenorDays: z.number().int().min(1).max(365).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      if (input.requestedAmount > input.invoiceAmount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Requested amount cannot exceed invoice amount" });
      }
      const [row] = await db.insert(invoiceFinancingV2Applications).values({
        merchantId: ctx.user.tenantId ?? "",
        invoiceId: input.invoiceId,
        invoiceAmount: input.invoiceAmount,
        requestedAmount: input.requestedAmount,
        interestRate: input.interestRate,
        tenorDays: input.tenorDays,
        status: "pending",
      }).returning();
      return row;
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.string(), approvedAmount: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(invoiceFinancingV2Applications).set({
        status: "approved",
        approvedAmount: input.approvedAmount,
        updatedAt: new Date(),
      }).where(and(eq(invoiceFinancingV2Applications.id, input.id), eq(invoiceFinancingV2Applications.merchantId, ctx.user.tenantId ?? "")));
      publishAuditEvent({ action: 'invoice_financing.approved', actorId: ctx.user.openId, targetId: input.id, metadata: { approvedAmount: input.approvedAmount }, timestamp: new Date().toISOString() }).catch(() => {});
      return { success: true };
    }),

  disburse: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(invoiceFinancingV2Applications).set({
        status: "disbursed",
        disbursedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(invoiceFinancingV2Applications.id, input.id), eq(invoiceFinancingV2Applications.merchantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select({
      status: invoiceFinancingV2Applications.status,
      count: sql<number>`count(*)`,
      totalRequested: sql<number>`sum(requested_amount)`,
      totalApproved: sql<number>`sum(approved_amount)`,
    }).from(invoiceFinancingV2Applications)
      .where(eq(invoiceFinancingV2Applications.merchantId, ctx.user.tenantId ?? ""))
      .groupBy(invoiceFinancingV2Applications.status);
    return rows.map(r => ({
      status: r.status,
      count: Number(r.count),
      totalRequestedKobo: Number(r.totalRequested ?? 0),
      totalApprovedKobo: Number(r.totalApproved ?? 0),
    }));
  }),
});

// ─── 6. Loyalty V3 / Reward Catalog ──────────────────────────────────────────
export const loyaltyV3Router = router({
  listPrograms: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(loyaltyV3Programs.merchantId, ctx.user.tenantId ?? "")];
      if (input.status) conditions.push(eq(loyaltyV3Programs.status, input.status));
      const rows = await db.select().from(loyaltyV3Programs)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]))
        .orderBy(desc(loyaltyV3Programs.createdAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(loyaltyV3Programs).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]]));
      return { programs: rows, total: Number(count) };
    }),

  getProgram: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(loyaltyV3Programs)
        .where(and(eq(loyaltyV3Programs.id, input.id), eq(loyaltyV3Programs.merchantId, ctx.user.tenantId ?? "")))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  createProgram: protectedProcedure
    .input(z.object({
      programName: z.string().min(1).max(200),
      pointsPerNaira: z.number().int().min(1).default(1),
      redemptionRate: z.number().int().min(1).default(100),
      expiryDays: z.number().int().min(1).default(365),
      tiers: z.array(z.object({
        name: z.string().min(1).max(500),
        minPoints: z.number().int(),
        multiplier: z.number(),
      })).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [row] = await db.insert(loyaltyV3Programs).values({
        merchantId: ctx.user.tenantId ?? "",
        programName: input.programName,
        pointsPerNaira: input.pointsPerNaira,
        redemptionRate: input.redemptionRate,
        expiryDays: input.expiryDays,
        tiers: JSON.stringify(input.tiers),
        status: "active",
      }).returning();
      return row;
    }),

  updateProgram: protectedProcedure
    .input(z.object({
      id: z.string(),
      programName: z.string().optional(),
      pointsPerNaira: z.number().int().optional(),
      redemptionRate: z.number().int().optional(),
      expiryDays: z.number().int().optional(),
      status: z.enum(["active", "paused", "archived"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const { id, ...updates } = input;
      await db.update(loyaltyV3Programs).set(updates as Record<string, unknown>)
        .where(and(eq(loyaltyV3Programs.id, id), eq(loyaltyV3Programs.merchantId, ctx.user.tenantId ?? "")));
      return { success: true };
    }),

  listMembers: protectedProcedure
    .input(z.object({
      programId: z.string(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(loyaltyV3Members)
        .where(and(
          eq(loyaltyV3Members.programId, input.programId),
          eq(loyaltyV3Members.merchantId, ctx.user.tenantId ?? "")
        ))
        .orderBy(desc(loyaltyV3Members.totalPoints))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(loyaltyV3Members).where(and(
          eq(loyaltyV3Members.programId, input.programId),
          eq(loyaltyV3Members.merchantId, ctx.user.tenantId ?? "")
        ));
      return { members: rows, total: Number(count) };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const [{ programs }] = await db.select({ programs: sql<number>`count(*)` })
      .from(loyaltyV3Programs).where(eq(loyaltyV3Programs.merchantId, ctx.user.tenantId ?? ""));
    const [{ members }] = await db.select({ members: sql<number>`count(*)` })
      .from(loyaltyV3Members).where(eq(loyaltyV3Members.merchantId, ctx.user.tenantId ?? ""));
    const [{ totalPoints }] = await db.select({ totalPoints: sql<number>`sum(total_points)` })
      .from(loyaltyV3Members).where(eq(loyaltyV3Members.merchantId, ctx.user.tenantId ?? ""));
    return {
      totalPrograms: Number(programs),
      totalMembers: Number(members),
      totalPointsIssued: Number(totalPoints ?? 0),
    };
  }),
});

// ─── 7. OpenSearch Audit Trail ────────────────────────────────────────────────
export const openSearchAuditRouter = router({
  search: protectedProcedure
    .input(z.object({
      query: z.string().default("*"),
      from: z.string().optional(),
      to: z.string().optional(),
      actor: z.string().optional(),
      action: z.string().optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = ctx.user.tenantId ?? "";
      const fromDate = input.from ?? new Date(Date.now() - 30 * 86400_000).toISOString();
      const toDate = input.to ?? new Date().toISOString();

      // Try OpenSearch first, fall back to DB
      const osResult = await searchAuditTrailViaOpenSearch(merchantId, input.query, { from: fromDate, to: toDate });
      if (osResult) {
        return {
          events: osResult.events as unknown[],
          total: osResult.total,
          source: "opensearch" as const,
        };
      }

      // DB fallback
      const db = (await getDb())!;
      const { sql: sqlFn } = await import("drizzle-orm");
      const offset = (input.page - 1) * input.limit;
      const result = await db.execute(
        sqlFn`SELECT * FROM audit_events
              WHERE merchant_id = ${merchantId}
              ${input.action ? sqlFn`AND action = ${input.action}` : sqlFn``}
              ${input.actor ? sqlFn`AND actor_id = ${input.actor}` : sqlFn``}
              AND created_at BETWEEN ${new Date(fromDate)} AND ${new Date(toDate)}
              ORDER BY created_at DESC
              LIMIT ${input.limit} OFFSET ${offset}`
      );
      const countResult = await db.execute(
        sqlFn`SELECT COUNT(*) as total FROM audit_events
              WHERE merchant_id = ${merchantId}
              AND created_at BETWEEN ${new Date(fromDate)} AND ${new Date(toDate)}`
      );
      return {
        events: (result.rows ?? []).map((r: any) => ({
          id: r.id,
          userId: r.actor_id,
          actorName: r.actor_name,
          action: r.action,
          resource: r.resource,
          resourceId: r.resource_id,
          ipAddress: r.ip_address,
          createdAt: r.created_at,
        })),
        total: Number((countResult.rows?.[0] as any)?.total ?? 0),
        source: "database" as const,
      };
    }),

  indexEvent: protectedProcedure
    .input(z.object({
      action: z.string(),
      resource: z.string(),
      resourceId: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await indexAuditEventViaOpenSearch({
        merchantId: ctx.user.tenantId ?? "",
        userId: ctx.user.openId,
        ...input,
        timestamp: new Date().toISOString(),
      });
      return { indexed: result?.indexed ?? false, id: result?.id ?? "" };
    }),

  getActionTypes: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const { sql: sqlFn } = await import("drizzle-orm");
    const result = await db.execute(
      sqlFn`SELECT DISTINCT action FROM audit_events WHERE merchant_id = ${ctx.user.tenantId ?? ""} ORDER BY action`
    );
    return (result.rows ?? []).map((r: any) => r.action as string);
  }),

  getActors: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const { sql: sqlFn } = await import("drizzle-orm");
    const result = await db.execute(
      sqlFn`SELECT DISTINCT actor_id, actor_name FROM audit_events WHERE merchant_id = ${ctx.user.tenantId ?? ""} ORDER BY actor_name`
    );
    return (result.rows ?? []).map((r: any) => ({ id: r.actor_id as string, name: r.actor_name as string }));
  }),
});

// ─── 8. Tenant Provisioning (Temporal-backed) ─────────────────────────────────
export const tenantProvisionRouter = router({
  provision: protectedProcedure
    .input(z.object({
      tenantName: z.string().min(1).max(200),
      tenantType: z.enum(["merchant", "partner", "enterprise", "platform"]),
      adminEmail: z.string().email(),
      adminName: z.string().min(1),
      billingTier: z.enum(["starter", "growth", "scale", "enterprise"]).default("starter"),
      features: z.array(z.string()).default([]),
      country: z.string().length(2).default("NG"),
      currency: z.string().length(3).default("NGN"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Call Temporal-backed middleware bridge
      const result = await provisionTenantViaMiddleware(
        input.tenantName,
        input.billingTier,
        input.adminEmail,
        input.country
      );

      if (result) {
        return {
          success: true,
          tenantId: result.tenantId,
          workflowId: (result as any).workflowId ?? null,
          status: result.status,
          message: "Tenant provisioning workflow started. TigerBeetle accounts, Keycloak realm, and billing config will be created atomically.",
        };
      }

      // Fallback: create tenant config in DB directly
      const db = (await getDb())!;
      // DB fallback: use tenantConfig table (existing schema)
      const tenantId = crypto.randomUUID();
      const [row] = await db.insert(tenantConfig).values({
        tenantId: tenantId,
        updatedBy: ctx.user.openId,
      }).returning();
      return {
        success: true,
        tenantId: row.tenantId,
        workflowId: null,
        status: "provisioning_db_fallback",
        message: "Tenant config created in database. Middleware bridge unavailable — manual provisioning required.",
      };
    }),

  getStatus: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      // Poll Temporal workflow status via bridge
      const { getTenantUsageViaMiddleware } = await import("../middlewareBridge");
      const result = await getTenantUsageViaMiddleware(input.workflowId);
      if (result) return { status: "running", details: result };
      return { status: "unknown", details: null };
    }),

  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(tenantConfig)
        .orderBy(desc(tenantConfig.updatedAt))
        .offset(offset).limit(input.limit);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(tenantConfig);
      return { tenants: rows, total: Number(count) };
    }),
});
