/**
 * Wave 122 Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Three fully-wired tRPC namespaces:
 *   1. fraudRuleEngine  – CRUD + drag-and-drop condition builder + alert wiring
 *   2. kybDocUpload     – Multi-file S3 upload + document checklist per KYB step
 *   3. loyaltyRedemption – Points redemption + PIN verification + Kafka event
 */

import { z } from "zod";
import { randomInt } from "node:crypto";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import {
  fraudRules,
  fraudAlerts,
  kybDocuments,
  kybVerifications,
  kybSteps,
  loyaltyV3Redemptions,
  loyaltyV3Members,
  loyaltyV3Programs,
  consumerPins,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { publishKafkaEventViaMiddleware } from "../middlewareBridge";

/**
 * Resolve the caller's merchant from the server-side session (never from
 * client-supplied input). Same pattern as chargebackLifecycle.ts.
 */
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

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
  params: z.record(z.string(), z.unknown()).optional(),
});

// ─── 1. Fraud Rule Engine ─────────────────────────────────────────────────────

export const fraudRuleEngineRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["active", "paused", "draft", "all"]).default("all"),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const conditions = [eq(fraudRules.merchantId, merchantId)];
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
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [row] = await db.select().from(fraudRules).where(and(eq(fraudRules.id, input.id), eq(fraudRules.merchantId, merchantId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Fraud rule not found" });
      return {
        ...row,
        conditionTree: JSON.parse(row.conditionTree || "{}"),
        actions: JSON.parse(row.actions || "[]"),
      };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(120),
      description: z.string().optional(),
      conditionTree: conditionTreeSchema,
      actions: z.array(ruleActionSchema).min(1),
      priority: z.number().min(1).max(1000).default(100),
      status: z.enum(["active", "paused", "draft"]).default("draft"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // merchantId/createdBy come from the session — a caller can no longer
      // plant rules (or attribute them) under another merchant.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const id = crypto.randomUUID();
      await db.insert(fraudRules).values({
        id,
        merchantId,
        name: input.name,
        description: input.description,
        conditionTree: JSON.stringify(input.conditionTree),
        actions: JSON.stringify(input.actions),
        priority: input.priority,
        status: input.status,
        createdBy: String(ctx.user.id),
      }) as any;
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
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const { id, conditionTree, actions, ...rest } = input;
      const updateData: Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      };
      if (conditionTree !== undefined) updateData.conditionTree = JSON.stringify(conditionTree);
      if (actions !== undefined) updateData.actions = JSON.stringify(actions);
      await db.update(fraudRules).set(updateData).where(and(eq(fraudRules.id, id), eq(fraudRules.merchantId, merchantId)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      await db.delete(fraudRules).where(and(eq(fraudRules.id, input.id), eq(fraudRules.merchantId, merchantId)));
      return { success: true };
    }),

  toggleStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["active", "paused"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      await db.update(fraudRules)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(fraudRules.id, input.id), eq(fraudRules.merchantId, merchantId)));
      return { success: true };
    }),

  getAlerts: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const rows = await db
        .select()
        .from(fraudAlerts)
        .where(eq(fraudAlerts.merchantId, merchantId))
        .orderBy(desc(fraudAlerts.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`sum(case when ${fraudRules.status} = 'active' then 1 else 0 end)`,
          paused: sql<number>`sum(case when ${fraudRules.status} = 'paused' then 1 else 0 end)`,
          draft: sql<number>`sum(case when ${fraudRules.status} = 'draft' then 1 else 0 end)`,
          totalHits: sql<number>`sum(${fraudRules.hitCount})`,
        })
        .from(fraudRules)
        .where(eq(fraudRules.merchantId, merchantId));
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
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [rule] = await db.select().from(fraudRules).where(and(eq(fraudRules.id, input.ruleId), eq(fraudRules.merchantId, merchantId)));
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
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Documents contain sensitive KYB PII — scope to the caller's merchant.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const docs = await db
        .select()
        .from(kybDocuments)
        .where(and(eq(kybDocuments.verificationId, input.verificationId), eq(kybDocuments.merchantId, merchantId)))
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
      documentType: z.enum(ALLOWED_DOC_TYPES),
      fileName: z.string(),
      mimeType: z.string(),
      fileSizeBytes: z.number().max(10 * 1024 * 1024, "File must be under 10MB"),
      // base64-encoded file content for direct upload
      fileContent: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // merchantId/uploader from the session — never trust client input.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      // The verification must belong to this merchant.
      const [verification] = await db
        .select()
        .from(kybVerifications)
        .where(and(eq(kybVerifications.verificationId, input.verificationId), eq(kybVerifications.merchantId, merchantId)));
      if (!verification) throw new TRPCError({ code: "NOT_FOUND", message: "Verification not found" });
      // Decode base64 and upload to S3. Sanitize every storage-key segment so
      // crafted IDs cannot escape the kyb-docs/ prefix (safeName pattern).
      const safeSegment = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
      const buffer = Buffer.from(input.fileContent, "base64");
      const suffix = crypto.randomUUID().slice(0, 8);
      const fileKey = `kyb-docs/${safeSegment(merchantId)}/${safeSegment(input.verificationId)}/${input.documentType}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, input.mimeType);
      // Save document record
      const id = crypto.randomUUID();
      await db.insert(kybDocuments).values({
        id,
        verificationId: input.verificationId,
        merchantId,
        documentType: input.documentType,
        fileName: input.fileName,
        fileKey,
        fileUrl,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        status: "pending",
        uploadedBy: String(ctx.user.id),
      }) as any;
      // Update KYB step status if matching step exists
      await db.update(kybSteps)
        .set({ status: "in_review", updatedAt: new Date() })
        .where(and(
          eq(kybSteps.verificationId, input.verificationId),
          eq(kybSteps.stepName, input.documentType),
        ));
      return { id, fileUrl, fileKey, success: true };
    }),

  // Reviewer action — approves/rejects KYB documents across merchants, so it
  // is admin-gated and the reviewer identity comes from the session, never
  // from client input.
  reviewDocument: adminProcedure
    .input(z.object({
      documentId: z.string(),
      status: z.enum(["approved", "rejected"]),
      reviewNotes: z.string().optional(),
      // Accepted for backwards compatibility but IGNORED — the reviewer is the
      // authenticated admin.
      reviewedBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(kybDocuments)
        .set({
          status: input.status,
          reviewNotes: input.reviewNotes,
          reviewedBy: String(ctx.user.id),
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(kybDocuments.id, input.documentId));
      return { success: true };
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      await db.delete(kybDocuments).where(and(eq(kybDocuments.id, input.documentId), eq(kybDocuments.merchantId, merchantId)));
      return { success: true };
    }),

  getVerificationProgress: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Verification progress reveals KYB status/PII — scope to the caller's merchant.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [verification] = await db
        .select()
        .from(kybVerifications)
        .where(and(eq(kybVerifications.verificationId, input.verificationId), eq(kybVerifications.merchantId, merchantId)));
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
  // CSPRNG — this code authorizes value transfer, so Math.random is not acceptable.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[randomInt(chars.length)]).join("");
}

export const loyaltyRedemptionRouter = router({
  getBalance: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Points balances are merchant-side program data — scope to the caller's
      // merchant so an arbitrary memberId cannot be read cross-tenant.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [member] = await db
        .select()
        .from(loyaltyV3Members)
        .where(and(eq(loyaltyV3Members.id, input.memberId), eq(loyaltyV3Members.merchantId, merchantId)));
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
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // The loyalty program is merchant-side: the member must belong to the
      // caller's merchant, otherwise anyone could drain another merchant's
      // members' points.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [member] = await db
        .select()
        .from(loyaltyV3Members)
        .where(and(eq(loyaltyV3Members.id, input.memberId), eq(loyaltyV3Members.merchantId, merchantId)));
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
      }) as any;
      // Send PIN OTP via Termii SMS if configured
      let message = "Redemption initiated. Please verify with your PIN to confirm.";
      try {
        const { env } = await import("../_core/env");
        if (env.termiiApiKey) {
          // CSPRNG OTP. NOTE: loyalty_v3_members has no phone column, so this
          // SMS currently has no reachable destination — see report.
          const otp = randomInt(1000, 10000).toString();
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
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      const [redemption] = await db
        .select()
        .from(loyaltyV3Redemptions)
        .where(eq(loyaltyV3Redemptions.id, input.redemptionId));
      if (!redemption) throw new TRPCError({ code: "NOT_FOUND", message: "Redemption not found" });
      // Ownership: merchant-side confirm (redemption belongs to the caller's
      // merchant) or the consumer who owns the redemption. Previously ctx was
      // never checked — anyone could confirm any redemption.
      const merchant = await getMerchantByOwnerId(user.id);
      const isMerchantSide = !!merchant && redemption.merchantId === merchant.id;
      const isOwner = redemption.customerId === String(user.id);
      if (!isMerchantSide && !isOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This redemption does not belong to you" });
      }
      if (redemption.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Redemption is already ${redemption.status}` });
      }
      if (new Date() > redemption.expiresAt) {
        await db.update(loyaltyV3Redemptions)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(loyaltyV3Redemptions.id, input.redemptionId));
        throw new TRPCError({ code: "BAD_REQUEST", message: "Redemption has expired" });
      }
      if (!/^\d{4}$/.test(input.pin)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid PIN format" });
      }
      // Verify the caller's transaction PIN (consumer_pins, wave68 pattern):
      // attempt counter with a 15-minute lockout after 5 failures, and NO
      // silent bypass — a missing PIN means "set up your PIN first", never allow.
      const [pinRecord] = await db.select().from(consumerPins).where(eq(consumerPins.userId, user.id)).limit(1);
      if (!pinRecord) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please set your transaction PIN first" });
      }
      if (pinRecord.lockedUntil && pinRecord.lockedUntil > new Date()) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "PIN locked. Try again later." });
      }
      const bcrypt = await import("bcryptjs");
      const pinValid = await bcrypt.compare(input.pin, pinRecord.pinHash);
      if (!pinValid) {
        const fails = pinRecord.failedAttempts + 1;
        const lockedUntil = fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await db.update(consumerPins).set({ failedAttempts: fails, lockedUntil }).where(eq(consumerPins.userId, user.id));
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid PIN" });
      }
      await db.update(consumerPins).set({ failedAttempts: 0, lockedUntil: null }).where(eq(consumerPins.userId, user.id));
      // S15b: atomically CLAIM the redemption (pending → confirmed) with the
      // status predicate INSIDE the guarded update, in the SAME transaction
      // as the points deduction. A concurrent double-confirm loses the claim
      // race (CONFLICT) instead of double-deducting points; a failed
      // deduction rolls the claim back.
      const member = await db.transaction(async (tx) => {
        const [claimed] = await tx.update(loyaltyV3Redemptions)
          .set({ status: "confirmed", pinVerified: true, confirmedAt: new Date(), updatedAt: new Date() })
          .where(and(
            eq(loyaltyV3Redemptions.id, input.redemptionId),
            eq(loyaltyV3Redemptions.status, "pending"),
          ))
          .returning({ id: loyaltyV3Redemptions.id });
        if (!claimed) {
          throw new TRPCError({ code: "CONFLICT", message: "Redemption was already confirmed by a concurrent request" });
        }
        // Deduct points with a guarded atomic decrement (balance checked in
        // the same UPDATE — no stale pointsBalanceAfter, no overdraw race).
        const [deducted] = await tx.update(loyaltyV3Members)
          .set({
            pointsBalance: sql`${loyaltyV3Members.pointsBalance} - ${redemption.pointsRedeemed}`,
            updatedAt: new Date(),
          } as any)
          .where(and(
            eq(loyaltyV3Members.id, redemption.memberId),
            gte(loyaltyV3Members.pointsBalance, redemption.pointsRedeemed),
          ))
          .returning();
        if (!deducted) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient points balance" });
        }
        return deducted;
      });
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
      // Enrich the (already claimed, status=confirmed) redemption record with
      // the Kafka publication metadata — status is NOT re-flipped here.
      await db.update(loyaltyV3Redemptions)
        .set({
          kafkaEventId,
          kafkaEventStatus: kafkaStatus,
          updatedAt: new Date(),
        })
        .where(eq(loyaltyV3Redemptions.id, input.redemptionId));
      return {
        success: true,
        redemptionCode: redemption.redemptionCode,
        nairaValue: redemption.nairaValue,
        newPointsBalance: member.pointsBalance,
        kafkaEventStatus: kafkaStatus,
        message: "Redemption confirmed! Your reward code is ready.",
      };
    }),

  listRedemptions: protectedProcedure
    .input(z.object({
      memberId: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const conditions = [eq(loyaltyV3Redemptions.merchantId, merchantId)];
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
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [redemption] = await db
        .select()
        .from(loyaltyV3Redemptions)
        .where(and(eq(loyaltyV3Redemptions.id, input.redemptionId), eq(loyaltyV3Redemptions.merchantId, merchantId)));
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
    .query(async ({ ctx }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          confirmed: sql<number>`sum(case when ${loyaltyV3Redemptions.status} = 'confirmed' then 1 else 0 end)`,
          pending: sql<number>`sum(case when ${loyaltyV3Redemptions.status} = 'pending' then 1 else 0 end)`,
          totalPointsRedeemed: sql<number>`sum(${loyaltyV3Redemptions.pointsRedeemed})`,
          totalNairaValue: sql<number>`sum(${loyaltyV3Redemptions.nairaValue})`,
        })
        .from(loyaltyV3Redemptions)
        .where(eq(loyaltyV3Redemptions.merchantId, merchantId));
      return stats;
    }),
});
