/**
 * Wave 226 — Admin Regulator Management Router
 *
 * Admin-only procedures for managing nexthub regulators:
 * - List all regulators with session status
 * - Send magic-link access email to a regulator
 * - Revoke all active sessions for a regulator
 * - View magic-link audit log
 * - Get summary stats
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { nexthubRegulators, regulatorMagicTokens, regulatorSessions } from "../../drizzle/schema";
import { eq, desc, and, gt, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { env } from "../_core/env";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";

async function sendMagicLinkEmail(to: string, regulatorName: string, magicLink: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.isProduction,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
  await transporter.sendMail({
    from: `"PayGate NextHub" <noreply@paygate.ng>`,
    to,
    subject: "Your Regulatory Portal Access Link",
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#1e40af;">PayGate Regulatory Portal</h2>
        <p>Hello <strong>${regulatorName}</strong>,</p>
        <p>An administrator has sent you a secure access link valid for <strong>30 minutes</strong>.</p>
        <p style="margin:24px 0;">
          <a href="${magicLink}" style="background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
            Access Regulatory Portal
          </a>
        </p>
        <p style="color:#64748b;font-size:13px;">If you did not expect this email, please ignore it.</p>
      </div>
    `,
  });
}

export const adminRegulatorsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    const db = await getDb();
    const now = new Date();
    const regulators = await db.select().from(nexthubRegulators).orderBy(desc(nexthubRegulators.createdAt));
    const sessionCounts = await db
      .select({ email: regulatorSessions.email, count: sql<number>`count(*)::int` })
      .from(regulatorSessions).where(gt(regulatorSessions.expiresAt, now)).groupBy(regulatorSessions.email);
    const pendingTokens = await db
      .select({ email: regulatorMagicTokens.email, count: sql<number>`count(*)::int` })
      .from(regulatorMagicTokens)
      .where(and(isNull(regulatorMagicTokens.usedAt), gt(regulatorMagicTokens.expiresAt, now)))
      .groupBy(regulatorMagicTokens.email);
    const sessionMap = new Map(sessionCounts.map(s => [s.email, s.count]));
    const pendingMap = new Map(pendingTokens.map(t => [t.email, t.count]));
    return regulators.map(r => ({
      ...r,
      hasActiveSession: (sessionMap.get(r.contactEmail ?? "") ?? 0) > 0,
      hasPendingToken: (pendingMap.get(r.contactEmail ?? "") ?? 0) > 0,
    }));
  }),

  sendMagicLink: protectedProcedure
    .input(z.object({ regulatorId: z.string(), origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      const db = await getDb();
      const [regulator] = await db.select().from(nexthubRegulators).where(eq(nexthubRegulators.id, input.regulatorId)).limit(1);
      if (!regulator) throw new TRPCError({ code: "NOT_FOUND", message: "Regulator not found" });
      if (!regulator.contactEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Regulator has no contact email" });
      if (regulator.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send link to inactive regulator" });
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const magicLink = `${input.origin}/regulator/verify?token=${token}`;
      await db.insert(regulatorMagicTokens).values({ id: crypto.randomUUID(), regulatorId: regulator.id, email: regulator.contactEmail, token, expiresAt });
      if (env.isProduction) {
        await sendMagicLinkEmail(regulator.contactEmail, regulator.regulatorName, magicLink);
      } else {
        console.info(`[wave226] Magic link for ${regulator.contactEmail}: ${magicLink}`);
      }
      return { sent: true, email: regulator.contactEmail, regulatorName: regulator.regulatorName, magicLink: !env.isProduction ? magicLink : undefined, expiresAt };
    }),

  revokeAccess: protectedProcedure
    .input(z.object({ regulatorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      const db = await getDb();
      const [regulator] = await db.select().from(nexthubRegulators).where(eq(nexthubRegulators.id, input.regulatorId)).limit(1);
      if (!regulator) throw new TRPCError({ code: "NOT_FOUND", message: "Regulator not found" });
      if (!regulator.contactEmail) return { revokedSessions: 0, invalidatedTokens: 0, regulatorName: regulator.regulatorName };
      const deletedSessions = await db.delete(regulatorSessions).where(eq(regulatorSessions.email, regulator.contactEmail)).returning();
      const invalidated = await db.update(regulatorMagicTokens).set({ usedAt: new Date() })
        .where(and(eq(regulatorMagicTokens.email, regulator.contactEmail), isNull(regulatorMagicTokens.usedAt))).returning();
      return { revokedSessions: deletedSessions.length, invalidatedTokens: invalidated.length, regulatorName: regulator.regulatorName };
    }),

  getMagicLinkAudit: protectedProcedure
    .input(z.object({ regulatorId: z.string(), limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      const db = await getDb();
      const tokens = await db.select().from(regulatorMagicTokens)
        .where(eq(regulatorMagicTokens.regulatorId, input.regulatorId))
        .orderBy(desc(regulatorMagicTokens.createdAt)).limit(input.limit);
      return tokens.map(t => ({
        id: t.id, email: t.email, createdAt: t.createdAt, expiresAt: t.expiresAt, usedAt: t.usedAt,
        status: t.usedAt ? "used" : t.expiresAt < new Date() ? "expired" : "pending",
      }));
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    const db = await getDb();
    const now = new Date();
    const [[total], [active], [activeSessions], [pendingTokens]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(nexthubRegulators),
      db.select({ count: sql<number>`count(*)::int` }).from(nexthubRegulators).where(eq(nexthubRegulators.status, "active")),
      db.select({ count: sql<number>`count(*)::int` }).from(regulatorSessions).where(gt(regulatorSessions.expiresAt, now)),
      db.select({ count: sql<number>`count(*)::int` }).from(regulatorMagicTokens).where(and(isNull(regulatorMagicTokens.usedAt), gt(regulatorMagicTokens.expiresAt, now))),
    ]);
    return { totalRegulators: total?.count ?? 0, activeRegulators: active?.count ?? 0, activeSessions: activeSessions?.count ?? 0, pendingTokens: pendingTokens?.count ?? 0 };
  }),
});
