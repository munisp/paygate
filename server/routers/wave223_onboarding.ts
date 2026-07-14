/**
 * Wave 223 — Comprehensive Stakeholder Onboarding Router
 * Covers: DFSP, PISP, PSP/Acquirer, POS Operator, Regulator, Settlement Bank
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, desc, and } from "drizzle-orm";
import {
  dfspOnboardingSessions,
  pispOnboardingSessions,
  pspOnboardingSessions,
  posOperatorOnboardingSessions,
  settlementBanks,
} from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── DFSP Onboarding ────────────────────────────────────────────────────────────
const dfspOnboardingRouter = router({
  start: protectedProcedure
    .input(z.object({
      institutionName: z.string().min(2),
      institutionType: z.enum(["commercial_bank", "microfinance_bank", "mobile_money", "fintech", "neobank", "cooperative"]),
      contactEmail: z.string().email(),
      contactPhone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const id = uid("dfsp_onb");
      await db.insert(dfspOnboardingSessions).values({
        id,
        institutionName: input.institutionName,
        institutionType: input.institutionType,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        currentStep: 1,
        status: "draft",
      });
      return { sessionId: id };
    }),

  updateStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().min(1).max(6),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(dfspOnboardingSessions)
        .set({ ...input.data, currentStep: input.step, updatedAt: new Date() })
        .where(eq(dfspOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [session] = await db.select().from(dfspOnboardingSessions)
        .where(eq(dfspOnboardingSessions.id, input.sessionId)).limit(1);
      if (!session) throw new Error("Session not found");
      await db.update(dfspOnboardingSessions)
        .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(dfspOnboardingSessions.id, input.sessionId));
      await notifyOwner({
        title: "New DFSP Onboarding Submission",
        content: `${session.institutionName} (${session.institutionType}) has submitted a DFSP onboarding application. Review at /admin/dfsp-onboarding/${input.sessionId}`,
      });
      return { success: true };
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [session] = await db.select().from(dfspOnboardingSessions)
        .where(eq(dfspOnboardingSessions.id, input.sessionId)).limit(1);
      return session ?? null;
    }),

  listSessions: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = input.status
        ? [eq(dfspOnboardingSessions.status, input.status)]
        : [];
      return db.select().from(dfspOnboardingSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(dfspOnboardingSessions.createdAt))
        .limit(100);
    }),

  approve: protectedProcedure
    .input(z.object({ sessionId: z.string(), dfspId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(dfspOnboardingSessions)
        .set({ status: "approved", approvedAt: new Date(), dfspId: input.dfspId, updatedAt: new Date() })
        .where(eq(dfspOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  reject: protectedProcedure
    .input(z.object({ sessionId: z.string(), reason: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(dfspOnboardingSessions)
        .set({ status: "rejected", rejectedAt: new Date(), rejectionReason: input.reason, updatedAt: new Date() })
        .where(eq(dfspOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),
});

// ── PISP Onboarding ────────────────────────────────────────────────────────────
const pispOnboardingRouter = router({
  start: protectedProcedure
    .input(z.object({
      companyName: z.string().min(2),
      contactEmail: z.string().email(),
      businessDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const id = uid("pisp_onb");
      await db.insert(pispOnboardingSessions).values({
        id,
        companyName: input.companyName,
        contactEmail: input.contactEmail,
        businessDescription: input.businessDescription ?? null,
        currentStep: 1,
        status: "draft",
      });
      return { sessionId: id };
    }),

  updateStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().min(1).max(5),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(pispOnboardingSessions)
        .set({ ...input.data, currentStep: input.step, updatedAt: new Date() })
        .where(eq(pispOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [session] = await db.select().from(pispOnboardingSessions)
        .where(eq(pispOnboardingSessions.id, input.sessionId)).limit(1);
      if (!session) throw new Error("Session not found");
      await db.update(pispOnboardingSessions)
        .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(pispOnboardingSessions.id, input.sessionId));
      await notifyOwner({
        title: "New PISP Onboarding Submission",
        content: `${session.companyName} has submitted a PISP onboarding application.`,
      });
      return { success: true };
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [session] = await db.select().from(pispOnboardingSessions)
        .where(eq(pispOnboardingSessions.id, input.sessionId)).limit(1);
      return session ?? null;
    }),

  listSessions: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = input.status
        ? [eq(pispOnboardingSessions.status, input.status)]
        : [];
      return db.select().from(pispOnboardingSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(pispOnboardingSessions.createdAt))
        .limit(100);
    }),
});

// ── PSP / Acquirer Onboarding ─────────────────────────────────────────────────
const pspOnboardingRouter = router({
  start: protectedProcedure
    .input(z.object({
      companyName: z.string().min(2),
      pspType: z.enum(["acquirer", "issuer", "payment_facilitator", "aggregator"]),
      contactEmail: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const id = uid("psp_onb");
      await db.insert(pspOnboardingSessions).values({
        id,
        companyName: input.companyName,
        pspType: input.pspType,
        contactEmail: input.contactEmail,
        currentStep: 1,
        status: "draft",
      });
      return { sessionId: id };
    }),

  updateStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().min(1).max(5),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(pspOnboardingSessions)
        .set({ ...input.data, currentStep: input.step, updatedAt: new Date() })
        .where(eq(pspOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [session] = await db.select().from(pspOnboardingSessions)
        .where(eq(pspOnboardingSessions.id, input.sessionId)).limit(1);
      if (!session) throw new Error("Session not found");
      await db.update(pspOnboardingSessions)
        .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(pspOnboardingSessions.id, input.sessionId));
      await notifyOwner({
        title: "New PSP Onboarding Submission",
        content: `${session.companyName} (${session.pspType}) has submitted a PSP onboarding application.`,
      });
      return { success: true };
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [session] = await db.select().from(pspOnboardingSessions)
        .where(eq(pspOnboardingSessions.id, input.sessionId)).limit(1);
      return session ?? null;
    }),

  listSessions: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = input.status
        ? [eq(pspOnboardingSessions.status, input.status)]
        : [];
      return db.select().from(pspOnboardingSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(pspOnboardingSessions.createdAt))
        .limit(100);
    }),
});

// ── POS Operator Onboarding ───────────────────────────────────────────────────
const posOperatorOnboardingRouter = router({
  start: protectedProcedure
    .input(z.object({
      operatorName: z.string().min(2),
      contactEmail: z.string().email(),
      contactPhone: z.string().optional(),
      terminalCount: z.number().min(1).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const id = uid("pos_onb");
      await db.insert(posOperatorOnboardingSessions).values({
        id,
        merchantId: ctx.user.tenantId ?? null,
        operatorName: input.operatorName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        terminalCount: input.terminalCount,
        currentStep: 1,
        status: "draft",
      });
      return { sessionId: id };
    }),

  updateStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().min(1).max(4),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(posOperatorOnboardingSessions)
        .set({ ...input.data, currentStep: input.step, updatedAt: new Date() })
        .where(eq(posOperatorOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [session] = await db.select().from(posOperatorOnboardingSessions)
        .where(eq(posOperatorOnboardingSessions.id, input.sessionId)).limit(1);
      if (!session) throw new Error("Session not found");
      await db.update(posOperatorOnboardingSessions)
        .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(posOperatorOnboardingSessions.id, input.sessionId));
      await notifyOwner({
        title: "New POS Operator Onboarding",
        content: `${session.operatorName} has submitted a POS operator onboarding request for ${session.terminalCount} terminal(s).`,
      });
      return { success: true };
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [session] = await db.select().from(posOperatorOnboardingSessions)
        .where(eq(posOperatorOnboardingSessions.id, input.sessionId)).limit(1);
      return session ?? null;
    }),

  listSessions: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = input.status
        ? [eq(posOperatorOnboardingSessions.status, input.status)]
        : [];
      return db.select().from(posOperatorOnboardingSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(posOperatorOnboardingSessions.createdAt))
        .limit(100);
    }),
});

// ── Settlement Bank Management ────────────────────────────────────────────────
const settlementBankRouter = router({
  list: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(settlementBanks).orderBy(desc(settlementBanks.createdAt)).limit(100);
  }),

  create: protectedProcedure
    .input(z.object({
      bankCode: z.string().min(3).max(10),
      bankName: z.string().min(2),
      nipCode: z.string().optional(),
      swiftCode: z.string().optional(),
      cbnLicenseNumber: z.string().optional(),
      settlementAccountNumber: z.string().optional(),
      settlementAccountName: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      isRtgsEnabled: z.boolean().default(false),
      isNipEnabled: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const id = uid("sbank");
      await db.insert(settlementBanks).values({ id, ...input, status: "active" });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(settlementBanks)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(settlementBanks.id, input.id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(settlementBanks)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(eq(settlementBanks.id, input.id));
      return { success: true };
    }),
});

// ── Main Wave 223 Router ──────────────────────────────────────────────────────
export const wave223Router = router({
  dfspOnboarding: dfspOnboardingRouter,
  pispOnboarding: pispOnboardingRouter,
  pspOnboarding: pspOnboardingRouter,
  posOperatorOnboarding: posOperatorOnboardingRouter,
  settlementBanks: settlementBankRouter,
});
