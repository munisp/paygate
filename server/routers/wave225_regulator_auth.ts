/**
 * Wave 225 — Regulator Magic-Link Authentication
 *
 * Flow:
 * 1. Admin calls `regulatorAuth.requestMagicLink({ email, origin })` → looks up
 *    regulator by contactEmail, generates a signed token, stores it in
 *    regulator_magic_tokens, and sends an email via nodemailer.
 * 2. Regulator clicks the link → `regulatorAuth.verifyMagicLink({ token })`
 *    validates the token, creates a regulatorSession row, and sets a
 *    `regulator_session` cookie.
 * 3. All regulator portal procedures check the cookie via `regulatorAuth.me`.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  nexthubRegulators,
  regulatorMagicTokens,
  regulatorSessions,
} from "../../drizzle/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { env } from "../_core/env";
import nodemailer from "nodemailer";

// ─── Email helper ────────────────────────────────────────────────────────────
async function sendMagicLinkEmail(
  to: string,
  regulatorName: string,
  magicLink: string
) {
  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });

  await transporter.sendMail({
    from: `"PayGate Regulatory Portal" <${env.smtpUser}>`,
    to,
    subject: "Your PayGate Regulatory Portal Access Link",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1e293b">Regulatory Portal Access</h2>
        <p>Hello <strong>${regulatorName}</strong>,</p>
        <p>You requested access to the PayGate Regulatory Portal. Click the button
           below to log in. This link expires in <strong>30 minutes</strong> and
           can only be used once.</p>
        <a href="${magicLink}"
           style="display:inline-block;margin:16px 0;padding:12px 24px;
                  background:#3b82f6;color:#fff;border-radius:6px;
                  text-decoration:none;font-weight:600">
          Access Regulatory Portal
        </a>
        <p style="color:#64748b;font-size:13px">
          If you did not request this link, please ignore this email.
          The link will expire automatically.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#94a3b8;font-size:12px">PayGate — Regulatory Compliance Portal</p>
      </div>
    `,
  });
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const regulatorAuthRouter = router({
  /**
   * Admin-only: Send a magic link to a regulator's registered email.
   */
  requestMagicLink: protectedProcedure
    .input(z.object({ email: z.string().email(), origin: z.string().url() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Find regulator by contactEmail
      const [regulator] = await db
        .select()
        .from(nexthubRegulators)
        .where(eq(nexthubRegulators.contactEmail, input.email))
        .limit(1);

      if (!regulator) {
        // Return success anyway to prevent email enumeration
        return { sent: true };
      }

      // Generate a secure random token
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await db.insert(regulatorMagicTokens).values({
        id: randomBytes(8).toString("hex"),
        regulatorId: regulator.id,
        email: input.email,
        token,
        expiresAt,
      });

      const magicLink = `${input.origin}/regulator/verify?token=${token}`;

      try {
        await sendMagicLinkEmail(input.email, regulator.regulatorName, magicLink);
      } catch (err) {
        console.error("[regulatorAuth] Failed to send magic link email:", err);
      }

      return {
        sent: true,
        // Only expose the link in development to aid testing
        magicLink: !env.isProduction ? magicLink : undefined,
      };
    }),

  /**
   * Public: Verify a magic-link token and create a regulator session.
   */
  verifyMagicLink: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const now = new Date();

      // Find valid, unused, non-expired token
      const [magicToken] = await db
        .select()
        .from(regulatorMagicTokens)
        .where(
          and(
            eq(regulatorMagicTokens.token, input.token),
            isNull(regulatorMagicTokens.usedAt),
            gt(regulatorMagicTokens.expiresAt, now)
          )
        )
        .limit(1);

      if (!magicToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or expired magic link.",
        });
      }

      // Mark token as used
      await db
        .update(regulatorMagicTokens)
        .set({ usedAt: now })
        .where(eq(regulatorMagicTokens.id, magicToken.id));

      // Create session (8 hours)
      const sessionToken = randomBytes(32).toString("hex");
      const sessionExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000);

      await db.insert(regulatorSessions).values({
        id: randomBytes(8).toString("hex"),
        regulatorId: magicToken.regulatorId,
        email: magicToken.email,
        sessionToken,
        expiresAt: sessionExpiry,
      });

      // Set httpOnly cookie
      if (ctx.res) {
        ctx.res.cookie("regulator_session", sessionToken, {
          httpOnly: true,
          secure: env.isProduction,
          sameSite: "lax",
          maxAge: 8 * 60 * 60 * 1000,
          path: "/",
        });
      }

      return { success: true, expiresAt: sessionExpiry };
    }),

  /**
   * Public: Validate the current regulator session cookie.
   */
  me: publicProcedure.query(async ({ ctx }) => {
    const sessionToken = (ctx.req as any)?.cookies?.["regulator_session"];
    if (!sessionToken) return null;

    const db = await getDb();
    const now = new Date();

    const [session] = await db
      .select()
      .from(regulatorSessions)
      .where(
        and(
          eq(regulatorSessions.sessionToken, sessionToken),
          gt(regulatorSessions.expiresAt, now)
        )
      )
      .limit(1);

    if (!session) return null;

    const [regulator] = await db
      .select()
      .from(nexthubRegulators)
      .where(eq(nexthubRegulators.id, session.regulatorId))
      .limit(1);

    return regulator
      ? {
          regulatorId: regulator.id,
          regulatorName: regulator.regulatorName,
          jurisdiction: regulator.jurisdiction,
          dataAccessLevel: regulator.dataAccessLevel,
          email: session.email,
          expiresAt: session.expiresAt,
        }
      : null;
  }),

  /**
   * Public: Log out the current regulator session.
   */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const sessionToken = (ctx.req as any)?.cookies?.["regulator_session"];
    if (sessionToken) {
      const db = await getDb();
      await db
        .delete(regulatorSessions)
        .where(eq(regulatorSessions.sessionToken, sessionToken));
    }
    if (ctx.res) {
      ctx.res.clearCookie("regulator_session", { path: "/" });
    }
    return { success: true };
  }),
});
