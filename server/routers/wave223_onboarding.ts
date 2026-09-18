/**
 * Wave 223 — Comprehensive Stakeholder Onboarding Router
 * Covers: DFSP, PISP, PSP/Acquirer, POS Operator, Regulator, Settlement Bank
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb, execRaw } from "../db";
import { eq, desc, and, sql } from "drizzle-orm";
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

/** Strip status-flow / identity columns a free-form onboarding payload must never overwrite. */
function sanitizeOnboardingData(data: Record<string, any>): Record<string, any> {
  const {
    id: _id, status: _s, submittedAt: _sa, reviewedBy: _rb, reviewedAt: _ra,
    createdAt: _ca, currentStep: _cs, ...safe
  } = data as any;
  return safe;
}

// ─── Platform-admin gate (DB re-check of users.role; fail closed) ────────────
// Settlement-bank directory writes are platform-level administration: the
// caller's session role is NOT trusted — the role is re-read from the users
// table on every call (same pattern as wave29Router.requirePlatformAdmin).
async function requirePlatformAdmin(ctx: any): Promise<void> {
  const openId = ctx?.user?.openId;
  if (!openId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const rows = await execRaw(db, `SELECT role FROM users WHERE open_id = $1 LIMIT 1`, [openId]);
  if (!rows.length || (rows[0] as any).role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform admin access required" });
  }
}

// ─── G6: onboarding-session ownership ────────────────────────────────────────
// Sessions carry created_by_user_id (migration 0105). Non-admin callers may
// only touch their own sessions; legacy NULL-owner rows are admin-only.

/** Non-throwing admin re-check + caller identity for ownership decisions. */
async function callerScope(ctx: any): Promise<{ isAdmin: boolean; userId: string }> {
  const openId = ctx?.user?.openId;
  if (!openId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const rows = await execRaw(db, `SELECT role FROM users WHERE open_id = $1 LIMIT 1`, [openId]);
  return { isAdmin: rows.length > 0 && (rows[0] as any).role === "admin", userId: String(ctx.user.id) };
}

/** Throws NOT_FOUND unless the caller owns the session (or is platform admin). */
async function assertSessionAccess(ctx: any, table: string, sessionId: string): Promise<void> {
  const db = (await getDb())!;
  const { isAdmin, userId } = await callerScope(ctx);
  if (isAdmin) return;
  // `table` is an internal constant — never user input.
  const rows = await execRaw(db, `SELECT created_by_user_id FROM ${table} WHERE id = $1 LIMIT 1`, [sessionId]);
  const owner = rows.length ? (rows[0] as any).created_by_user_id : undefined;
  if (owner == null || owner !== userId) {
    // NOT_FOUND (not FORBIDDEN) — do not leak the existence of others' sessions.
    throw new TRPCError({ code: "NOT_FOUND", message: "Onboarding session not found" });
  }
}

/** Stamp the creator on a freshly started session (column added by 0105). */
async function stampSessionOwner(db: any, table: string, sessionId: string, userId: string): Promise<void> {
  await execRaw(db, `UPDATE ${table} SET created_by_user_id = $1 WHERE id = $2`, [userId, sessionId]);
}

/** drizzle WHERE fragment restricting a list query to the caller's sessions. */
async function listScopeCond(ctx: any) {
  const { isAdmin, userId } = await callerScope(ctx);
  return isAdmin ? undefined : sql`created_by_user_id = ${userId}`;
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
    .mutation(async ({ ctx, input }) => {
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
      await stampSessionOwner(db, "dfsp_onboarding_sessions", id, String(ctx.user.id));
      return { sessionId: id };
    }),

  updateStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().min(1).max(6),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "dfsp_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      await db.update(dfspOnboardingSessions)
        .set({ ...sanitizeOnboardingData(input.data), currentStep: input.step, updatedAt: new Date() })
        .where(eq(dfspOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "dfsp_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      const [session] = await db.select().from(dfspOnboardingSessions)
        .where(eq(dfspOnboardingSessions.id, input.sessionId)).limit(1);
      if (!session) throw new Error("Session not found");
      await db.update(dfspOnboardingSessions)
        .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(dfspOnboardingSessions.id, input.sessionId));
      await notifyOwner({
        title: "New DFSP Onboarding Submission",
        // G8: /admin/dfsp-onboarding/:id does not exist — link the KYC review page.
        content: `${session.institutionName} (${session.institutionType}) has submitted a DFSP onboarding application. Review at /admin/kyc`,
      });
      return { success: true };
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "dfsp_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      const [session] = await db.select().from(dfspOnboardingSessions)
        .where(eq(dfspOnboardingSessions.id, input.sessionId)).limit(1);
      return session ?? null;
    }),

  listSessions: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      // G6: non-admins see only their own sessions; platform admins see all.
      const scopeCond = await listScopeCond(ctx);
      const conditions = [
        ...(input.status ? [eq(dfspOnboardingSessions.status, input.status)] : []),
        ...(scopeCond ? [scopeCond] : []),
      ];
      return db.select().from(dfspOnboardingSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(dfspOnboardingSessions.createdAt))
        .limit(100);
    }),

  approve: protectedProcedure
    .input(z.object({ sessionId: z.string(), dfspId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requirePlatformAdmin(ctx);
      const db = (await getDb())!;
      await db.update(dfspOnboardingSessions)
        .set({ status: "approved", approvedAt: new Date(), dfspId: input.dfspId, updatedAt: new Date() })
        .where(eq(dfspOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  reject: protectedProcedure
    .input(z.object({ sessionId: z.string(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requirePlatformAdmin(ctx);
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
    .mutation(async ({ ctx, input }) => {
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
      await stampSessionOwner(db, "pisp_onboarding_sessions", id, String(ctx.user.id));
      return { sessionId: id };
    }),

  updateStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().min(1).max(5),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "pisp_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      await db.update(pispOnboardingSessions)
        .set({ ...sanitizeOnboardingData(input.data), currentStep: input.step, updatedAt: new Date() })
        .where(eq(pispOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "pisp_onboarding_sessions", input.sessionId);
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
    .query(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "pisp_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      const [session] = await db.select().from(pispOnboardingSessions)
        .where(eq(pispOnboardingSessions.id, input.sessionId)).limit(1);
      return session ?? null;
    }),

  listSessions: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const scopeCond = await listScopeCond(ctx);
      const conditions = [
        ...(input.status ? [eq(pispOnboardingSessions.status, input.status)] : []),
        ...(scopeCond ? [scopeCond] : []),
      ];
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
    .mutation(async ({ ctx, input }) => {
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
      await stampSessionOwner(db, "psp_onboarding_sessions", id, String(ctx.user.id));
      return { sessionId: id };
    }),

  updateStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().min(1).max(5),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "psp_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      await db.update(pspOnboardingSessions)
        .set({ ...sanitizeOnboardingData(input.data), currentStep: input.step, updatedAt: new Date() })
        .where(eq(pspOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "psp_onboarding_sessions", input.sessionId);
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
    .query(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "psp_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      const [session] = await db.select().from(pspOnboardingSessions)
        .where(eq(pspOnboardingSessions.id, input.sessionId)).limit(1);
      return session ?? null;
    }),

  listSessions: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const scopeCond = await listScopeCond(ctx);
      const conditions = [
        ...(input.status ? [eq(pspOnboardingSessions.status, input.status)] : []),
        ...(scopeCond ? [scopeCond] : []),
      ];
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
      await stampSessionOwner(db, "pos_operator_onboarding_sessions", id, String(ctx.user.id));
      return { sessionId: id };
    }),

  updateStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().min(1).max(4),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "pos_operator_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      await db.update(posOperatorOnboardingSessions)
        .set({ ...sanitizeOnboardingData(input.data), currentStep: input.step, updatedAt: new Date() })
        .where(eq(posOperatorOnboardingSessions.id, input.sessionId));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "pos_operator_onboarding_sessions", input.sessionId);
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
    .query(async ({ ctx, input }) => {
      await assertSessionAccess(ctx, "pos_operator_onboarding_sessions", input.sessionId);
      const db = (await getDb())!;
      const [session] = await db.select().from(posOperatorOnboardingSessions)
        .where(eq(posOperatorOnboardingSessions.id, input.sessionId)).limit(1);
      return session ?? null;
    }),

  listSessions: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const scopeCond = await listScopeCond(ctx);
      const conditions = [
        ...(input.status ? [eq(posOperatorOnboardingSessions.status, input.status)] : []),
        ...(scopeCond ? [scopeCond] : []),
      ];
      return db.select().from(posOperatorOnboardingSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(posOperatorOnboardingSessions.createdAt))
        .limit(100);
    }),
});

// ── Settlement Bank Management ────────────────────────────────────────────────
const settlementBankRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // Platform settlement-bank directory (includes settlementAccountNumber/
    // settlementAccountName) — platform-admin only (DB re-check), same gate
    // as the create/update/delete mutations below.
    await requirePlatformAdmin(ctx);
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
    .mutation(async ({ ctx, input }) => {
      // Platform settlement-bank directory write — platform-admin only (DB re-check).
      await requirePlatformAdmin(ctx);
      const db = (await getDb())!;
      const id = uid("sbank");
      await db.insert(settlementBanks).values({ id, ...input, status: "active" });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      // Explicit field whitelist (matches the admin-gated variant in
      // wave223_extensions.ts settlementBanks.create) — replaces the previous
      // mass-assignment z.record(z.string(), z.any()) which could write ANY column.
      data: z.object({
        bankName: z.string().optional(),
        bankCode: z.string().optional(),
        nipCode: z.string().optional(),
        swiftCode: z.string().optional(),
        settlementAccountNumber: z.string().optional(),
        settlementAccountName: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        isRtgsEnabled: z.boolean().optional(),
        isNipEnabled: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      // Platform settlement-bank directory write — platform-admin only (DB re-check).
      await requirePlatformAdmin(ctx);
      const db = (await getDb())!;
      const [row] = await db.update(settlementBanks)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(settlementBanks.id, input.id))
        .returning({ id: settlementBanks.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Settlement bank not found" });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Platform settlement-bank directory write — platform-admin only (DB re-check).
      await requirePlatformAdmin(ctx);
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
