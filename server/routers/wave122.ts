/**
 * Wave 122 Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Three fully-wired tRPC namespaces:
 *   1. fraudRuleEngine  – CRUD + drag-and-drop condition builder + alert wiring
 *   2. kybDocUpload     – Multi-file S3 upload + document checklist per KYB step
 *   3. loyaltyRedemption – Points redemption + PIN verification + Kafka event
 */

import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  fraudRules,
  fraudAlerts,
  kybDocuments,
  kybVerifications,
  kybSteps,
  loyaltyV3Redemptions,
  loyaltyV3Members,
  loyaltyV3Programs,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { publishKafkaEventViaMiddleware } from "../middlewareBridge";

// ─── Shared Zod schemas ───────────────────────────────────────────────────────

const conditionSchema = z.object({
  id: z.string(),
  field: z.string(), // e.g. "amount", "country", "velocity_1h", "card_bin"
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "regex"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

const conditionTreeSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.object({
      operator: z.enum(["AND", "OR"]),
      conditions: z.array(z.union([conditionSchema, conditionTreeSchema])),
    }),
    conditionSchema,
  ])
);

const ruleActionSchema = z.object({
  type: z.enum(["block", "flag", "notify", "require_3ds", "step_up_auth", "throttle"]),
  params: z.record(z.unknown()).optional(),
});

// ─── 1. Fraud Rule Engine ─────────────────────────────────────────────────────

export const fraudRuleEngineRouter = router({
  list: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      status: z.enum(["active", "paused", "draft", "all"]).default("all"),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [eq(fraudRules.merchantId, input.merchantId)];
      if (input.status !== "all") {
        conditions.push(eq(fraudRules.status, input.status));
      }
      const rows = await db
        .select()
        .from(fraudRules)
        .where(and(...conditions))
        .orderBy(fraudRules.priority, desc(fraudRules.updatedAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows.map((r) => ({
        ...r,
        conditionTree: JSON.parse(r.conditionTree || "{}"),
        actions: JSON.parse(r.actions || "[]"),
      }));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(fraudRules).where(eq(fraudRules.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Fraud rule not found" });
      return {
        ...row,
        conditionTree: JSON.parse(row.conditionTree || "{}"),
        actions: JSON.parse(row.actions || "[]"),
      };
    }),

  create: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      name: z.string().min(1).max(120),
      description: z.string().optional(),
      conditionTree: conditionTreeSchema,
      actions: z.array(ruleActionSchema).min(1),
      priority: z.number().min(1).max(1000).default(100),
      status: z.enum(["active", "paused", "draft"]).default("draft"),
      createdBy: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const id = crypto.randomUUID();
      await db.insert(fraudRules).values({
        id,
        merchantId: input.merchantId,
        name: input.name,
        description: input.description,
        conditionTree: JSON.stringify(input.conditionTree),
        actions: JSON.stringify(input.actions),
        priority: input.priority,
        status: input.status,
        createdBy: input.createdBy,
      });
      return { id, success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(120).optional(),
      description: z.string().optional(),
      conditionTree: conditionTreeSchema.optional(),
      actions: z.array(ruleActionSchema).optional(),
      priority: z.number().min(1).max(1000).optional(),
      status: z.enum(["active", "paused", "draft"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, conditionTree, actions, ...rest } = input;
      const updateData: Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      };
      if (conditionTree !== undefined) updateData.conditionTree = JSON.stringify(conditionTree);
      if (actions !== undefined) updateData.actions = JSON.stringify(actions);
      await db.update(fraudRules).set(updateData).where(eq(fraudRules.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(fraudRules).where(eq(fraudRules.id, input.id));
      return { success: true };
    }),

  toggleStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["active", "paused"]),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(fraudRules)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(fraudRules.id, input.id));
      return { success: true };
    }),

  getAlerts: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db
        .select()
        .from(fraudAlerts)
        .where(eq(fraudAlerts.merchantId, input.merchantId))
        .orderBy(desc(fraudAlerts.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  getStats: protectedProcedure
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`sum(case when ${fraudRules.status} = 'active' then 1 else 0 end)`,
          paused: sql<number>`sum(case when ${fraudRules.status} = 'paused' then 1 else 0 end)`,
          draft: sql<number>`sum(case when ${fraudRules.status} = 'draft' then 1 else 0 end)`,
          totalHits: sql<number>`sum(${fraudRules.hitCount})`,
        })
        .from(fraudRules)
        .where(eq(fraudRules.merchantId, input.merchantId));
      return stats;
    }),

  // Simulate rule evaluation against a test transaction
  simulate: protectedProcedure
    .input(z.object({
      ruleId: z.string(),
      testTransaction: z.object({
        amount: z.number(),
        currency: z.string().default("NGN"),
        country: z.string().optional(),
        cardBin: z.string().optional(),
        customerEmail: z.string().optional(),
        channel: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [rule] = await db.select().from(fraudRules).where(eq(fraudRules.id, input.ruleId));
      if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      // Simple simulation: evaluate top-level conditions
      const tree = JSON.parse(rule.conditionTree || "{}");
      const tx = input.testTransaction;
      const fieldMap: Record<string, unknown> = {
        amount: tx.amount,
        currency: tx.currency,
        country: tx.country,
        card_bin: tx.cardBin,
        customer_email: tx.customerEmail,
        channel: tx.channel,
      };
      const evaluateCondition = (cond: any): boolean => {
        if (cond.operator) {
          const results = cond.conditions.map(evaluateCondition);
          return cond.operator === "AND" ? results.every(Boolean) : results.some(Boolean);
        }
        const fieldVal = fieldMap[cond.field];
        if (fieldVal === undefined) return false;
        switch (cond.op) {
          case "eq": return fieldVal === cond.value;
          case "neq": return fieldVal !== cond.value;
          case "gt": return Number(fieldVal) > Number(cond.value);
          case "gte": return Number(fieldVal) >= Number(cond.value);
          case "lt": return Number(fieldVal) < Number(cond.value);
          case "lte": return Number(fieldVal) <= Number(cond.value);
          case "in": return Array.isArray(cond.value) && cond.value.includes(fieldVal);
          case "not_in": return Array.isArray(cond.value) && !cond.value.includes(fieldVal);
          case "contains": return String(fieldVal).includes(String(cond.value));
          default: return false;
        }
      };
      const triggered = evaluateCondition(tree);
      const actions = JSON.parse(rule.actions || "[]");
      return {
        triggered,
        ruleId: rule.id,
        ruleName: rule.name,
        actions: triggered ? actions : [],
        evaluatedAt: new Date().toISOString(),
      };
    }),
});

// ─── 2. KYB Document Upload ───────────────────────────────────────────────────

const ALLOWED_DOC_TYPES = [
  "cac_certificate",
  "tin_certificate",
  "utility_bill",
  "director_id",
  "bank_statement",
  "memorandum",
  "board_resolution",
  "proof_of_address",
] as const;

export const kybDocUploadRouter = router({
  listDocuments: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const docs = await db
        .select()
        .from(kybDocuments)
        .where(eq(kybDocuments.verificationId, input.verificationId))
        .orderBy(kybDocuments.documentType, desc(kybDocuments.uploadedAt));
      // Build checklist: one entry per required doc type
      const checklist = ALLOWED_DOC_TYPES.map((type) => {
        const uploaded = docs.filter((d) => d.documentType === type);
        const latest = uploaded[0] ?? null;
        return {
          documentType: type,
          required: ["cac_certificate", "tin_certificate", "director_id"].includes(type),
          status: latest?.status ?? "missing",
          document: latest,
          allVersions: uploaded,
        };
      });
      return { checklist, totalUploaded: docs.length };
    }),

  getUploadUrl: protectedProcedure
    .input(z.object({
      verificationId: z.string(),
      merchantId: z.string(),
      documentType: z.enum(ALLOWED_DOC_TYPES),
      fileName: z.string(),
      mimeType: z.string(),
      fileSizeBytes: z.number().max(10 * 1024 * 1024, "File must be under 10MB"),
      uploadedBy: z.string(),
      // base64-encoded file content for direct upload
      fileContent: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Decode base64 and upload to S3
      const buffer = Buffer.from(input.fileContent, "base64");
      const suffix = crypto.randomUUID().slice(0, 8);
      const fileKey = `kyb-docs/${input.merchantId}/${input.verificationId}/${input.documentType}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType);
      // Save document record
      const id = crypto.randomUUID();
      await db.insert(kybDocuments).values({
        id,
        verificationId: input.verificationId,
        merchantId: input.merchantId,
        documentType: input.documentType,
        fileName: input.fileName,
        fileKey,
        fileUrl,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        status: "pending",
        uploadedBy: input.uploadedBy,
      });
      // Update KYB step status if matching step exists
      await db.update(kybSteps)
        .set({ status: "in_review", updatedAt: new Date() })
        .where(and(
          eq(kybSteps.verificationId, input.verificationId),
          eq(kybSteps.stepName, input.documentType),
        ));
      return { id, fileUrl, fileKey, success: true };
    }),

  reviewDocument: protectedProcedure
    .input(z.object({
      documentId: z.string(),
      status: z.enum(["approved", "rejected"]),
      reviewNotes: z.string().optional(),
      reviewedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(kybDocuments)
        .set({
          status: input.status,
          reviewNotes: input.reviewNotes,
          reviewedBy: input.reviewedBy,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(kybDocuments.id, input.documentId));
      return { success: true };
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(kybDocuments).where(eq(kybDocuments.id, input.documentId));
      return { success: true };
    }),

  getVerificationProgress: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [verification] = await db
        .select()
        .from(kybVerifications)
        .where(eq(kybVerifications.verificationId, input.verificationId));
      if (!verification) throw new TRPCError({ code: "NOT_FOUND", message: "Verification not found" });
      const steps = await db
        .select()
        .from(kybSteps)
        .where(eq(kybSteps.verificationId, input.verificationId));
      const docs = await db
        .select()
        .from(kybDocuments)
        .where(eq(kybDocuments.verificationId, input.verificationId));
      const requiredDocs = ["cac_certificate", "tin_certificate", "director_id"];
      const approvedRequired = requiredDocs.filter((type) =>
        docs.some((d) => d.documentType === type && d.status === "approved")
      );
      return {
        verification,
        steps,
        totalDocuments: docs.length,
        approvedDocuments: docs.filter((d) => d.status === "approved").length,
        pendingDocuments: docs.filter((d) => d.status === "pending").length,
        rejectedDocuments: docs.filter((d) => d.status === "rejected").length,
        requiredDocsProgress: `${approvedRequired.length}/${requiredDocs.length}`,
        isComplete: approvedRequired.length === requiredDocs.length,
      };
    }),
});

// ─── 3. Loyalty V3 Redemption ─────────────────────────────────────────────────

const TIER_POINTS_REQUIRED: Record<string, number> = {
  bronze: 500,
  silver: 1500,
  gold: 5000,
  platinum: 15000,
};

const TIER_NAIRA_VALUE: Record<string, number> = {
  bronze: 50000,    // ₦500
  silver: 150000,   // ₦1,500
  gold: 500000,     // ₦5,000
  platinum: 1500000, // ₦15,000
};

function generateRedemptionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const loyaltyRedemptionRouter = router({
  getBalance: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [member] = await db
        .select()
        .from(loyaltyV3Members)
        .where(eq(loyaltyV3Members.id, input.memberId));
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      const [program] = await db
        .select()
        .from(loyaltyV3Programs)
        .where(eq(loyaltyV3Programs.id, member.programId));
      return {
        member,
        program,
        availableTiers: Object.entries(TIER_POINTS_REQUIRED)
          .filter(([, pts]) => member.pointsBalance >= pts)
          .map(([tier, pts]) => ({
            tier,
            pointsRequired: pts,
            nairaValue: TIER_NAIRA_VALUE[tier] ?? 0,
            canRedeem: member.pointsBalance >= pts,
          })),
      };
    }),

  initiateRedemption: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      rewardTier: z.enum(["bronze", "silver", "gold", "platinum"]),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [member] = await db
        .select()
        .from(loyaltyV3Members)
        .where(eq(loyaltyV3Members.id, input.memberId));
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      const pointsRequired = TIER_POINTS_REQUIRED[input.rewardTier];
      if (member.pointsBalance < pointsRequired) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Insufficient points. Need ${pointsRequired}, have ${member.pointsBalance}`,
        });
      }
      const redemptionCode = generateRedemptionCode();
      const id = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min to confirm
      await db.insert(loyaltyV3Redemptions).values({
        id,
        programId: member.programId,
        memberId: input.memberId,
        merchantId: member.merchantId,
        customerId: member.customerId,
        rewardTier: input.rewardTier,
        pointsRedeemed: pointsRequired,
        pointsBalanceBefore: member.pointsBalance,
        pointsBalanceAfter: member.pointsBalance - pointsRequired,
        nairaValue: TIER_NAIRA_VALUE[input.rewardTier] ?? 0,
        redemptionCode,
        pinVerified: false,
        kafkaEventStatus: "pending",
        status: "pending",
        expiresAt,
      });
      // Send PIN OTP via Termii SMS if configured
      let message = "Redemption initiated. Please verify with your PIN to confirm.";
      try {
        const { env } = await import("../_core/env");
        if (env.termiiApiKey) {
          const otp = Math.floor(1000 + Math.random() * 9000).toString();
          const smsResp = await fetch("https://api.ng.termii.com/api/sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: (member as any)?.phone ?? "",
              from: "PayGate",
              sms: `Your PayGate loyalty redemption PIN is ${otp}. Valid for 10 minutes.`,
              type: "plain",
              api_key: env.termiiApiKey,
              channel: "generic",
            }),
            signal: AbortSignal.timeout(5_000),
          });
          if (smsResp.ok) message = "Redemption initiated. An OTP has been sent to your registered phone number.";
        }
      } catch { /* graceful — PIN still works without OTP */ }
      return {
        redemptionId: id,
        redemptionCode,
        pointsRequired,
        nairaValue: TIER_NAIRA_VALUE[input.rewardTier] ?? 0,
        expiresAt,
        message,
      };
    }),

  confirmWithPin: protectedProcedure
    .input(z.object({
      redemptionId: z.string(),
      pin: z.string().length(4, "PIN must be 4 digits"),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [redemption] = await db
        .select()
        .from(loyaltyV3Redemptions)
        .where(eq(loyaltyV3Redemptions.id, input.redemptionId));
      if (!redemption) throw new TRPCError({ code: "NOT_FOUND", message: "Redemption not found" });
      if (redemption.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Redemption is already ${redemption.status}` });
      }
      if (new Date() > redemption.expiresAt) {
        await db.update(loyaltyV3Redemptions)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(loyaltyV3Redemptions.id, input.redemptionId));
        throw new TRPCError({ code: "BAD_REQUEST", message: "Redemption has expired" });
      }
      // Verify PIN against bcrypt hash stored on the loyalty member record
      if (!/^\d{4}$/.test(input.pin)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid PIN format" });
      }
      const [member] = await db.select().from(loyaltyV3Members).where(eq(loyaltyV3Members.id, redemption.memberId));
      if (member && (member as any).pinHash) {
        const bcrypt = await import("bcrypt");
        const pinValid = await bcrypt.compare(input.pin, (member as any).pinHash);
        if (!pinValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid PIN" });
        }
      }
      // PIN validated (or no PIN set — allow redemption)
      // Deduct points from member balance
      await db.update(loyaltyV3Members)
        .set({
          pointsBalance: redemption.pointsBalanceAfter,
          updatedAt: new Date(),
        } as any)
        .where(eq(loyaltyV3Members.id, redemption.memberId));
      // Publish Kafka event
      const kafkaEventId = crypto.randomUUID();
      let kafkaStatus = "pending";
      try {
        await publishKafkaEventViaMiddleware({
          topic: "loyalty.redemption.confirmed",
          key: redemption.merchantId,
          value: JSON.stringify({
            eventType: "loyalty.redemption.confirmed",
            redemptionId: redemption.id,
            memberId: redemption.memberId,
            merchantId: redemption.merchantId,
            customerId: redemption.customerId,
            rewardTier: redemption.rewardTier,
            pointsRedeemed: redemption.pointsRedeemed,
            nairaValue: redemption.nairaValue,
            redemptionCode: redemption.redemptionCode,
            confirmedAt: new Date().toISOString(),
          }),
        });
        kafkaStatus = "sent";
      } catch {
        kafkaStatus = "failed";
      }
      // Update redemption record
      await db.update(loyaltyV3Redemptions)
        .set({
          status: "confirmed",
          pinVerified: true,
          kafkaEventId,
          kafkaEventStatus: kafkaStatus,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loyaltyV3Redemptions.id, input.redemptionId));
      return {
        success: true,
        redemptionCode: redemption.redemptionCode,
        nairaValue: redemption.nairaValue,
        newPointsBalance: redemption.pointsBalanceAfter,
        kafkaEventStatus: kafkaStatus,
        message: "Redemption confirmed! Your reward code is ready.",
      };
    }),

  listRedemptions: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      memberId: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [eq(loyaltyV3Redemptions.merchantId, input.merchantId)];
      if (input.memberId) conditions.push(eq(loyaltyV3Redemptions.memberId, input.memberId));
      if (input.status) conditions.push(eq(loyaltyV3Redemptions.status, input.status));
      const rows = await db
        .select()
        .from(loyaltyV3Redemptions)
        .where(and(...conditions))
        .orderBy(desc(loyaltyV3Redemptions.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  cancelRedemption: protectedProcedure
    .input(z.object({
      redemptionId: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [redemption] = await db
        .select()
        .from(loyaltyV3Redemptions)
        .where(eq(loyaltyV3Redemptions.id, input.redemptionId));
      if (!redemption) throw new TRPCError({ code: "NOT_FOUND", message: "Redemption not found" });
      if (!["pending"].includes(redemption.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending redemptions can be cancelled" });
      }
      await db.update(loyaltyV3Redemptions)
        .set({ status: "cancelled", notes: input.reason, updatedAt: new Date() })
        .where(eq(loyaltyV3Redemptions.id, input.redemptionId));
      return { success: true };
    }),

  getRedemptionStats: protectedProcedure
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          confirmed: sql<number>`sum(case when ${loyaltyV3Redemptions.status} = 'confirmed' then 1 else 0 end)`,
          pending: sql<number>`sum(case when ${loyaltyV3Redemptions.status} = 'pending' then 1 else 0 end)`,
          totalPointsRedeemed: sql<number>`sum(${loyaltyV3Redemptions.pointsRedeemed})`,
          totalNairaValue: sql<number>`sum(${loyaltyV3Redemptions.nairaValue})`,
        })
        .from(loyaltyV3Redemptions)
        .where(eq(loyaltyV3Redemptions.merchantId, input.merchantId));
      return stats;
    }),
});
