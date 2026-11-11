/**
 * Regulator Auth Router — session identity for the Regulatory Oversight Portal.
 *
 * Backing client: client/src/pages/regulator/RegulatorDashboard.tsx
 *   - regulatorAuth.me     → must return { regulatorName, jurisdiction, ... }
 *                            or null/throw so the client redirects to login.
 *   - regulatorAuth.logout → standard session invalidation (same cookie
 *                            clearing as auth.logout) plus invalidation of any
 *                            regulator_sessions rows for the regulator identity.
 *
 * Regulator principals are platform users whose email is registered as the
 * contact email of an active row in nexthub_regulators. There is no separate
 * regulator credential backend; the portal session is the standard app session.
 */
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { db } from "../db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
import { nexthubRegulators, regulatorMagicTokens, regulatorSessions } from "../../drizzle/schema";
import { sendEmail } from "../emailService";
import { logger } from "../logger";
import { COOKIE_NAME } from "../../shared/const";
import {
  getSessionCookieOptions,
  ID_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../_core/cookies";
import { ENV } from "../_core/env";

/**
 * Resolve the active regulator profile for the authenticated principal.
 * A2-HIGH-1 writer note: nexthub_regulators rows are provisioned by platform
 * ops (seed migrations / hub operator onboarding) — regulator accounts are
 * never self-registered, so there is intentionally no runtime writer here.
 */
async function resolveRegulator(email: string | null) {
  if (!email) return null;
  const [regulator] = await db
    .select()
    .from(nexthubRegulators)
    .where(
      and(
        eq(nexthubRegulators.contactEmail, email),
        eq(nexthubRegulators.status, "active")
      )
    )
    .limit(1);
  return regulator ?? null;
}

const MAGIC_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const REGULATOR_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export const regulatorAuthRouter = router({
  /**
   * Issue a regulator magic-link token. The token is PERSISTED to
   * regulator_magic_tokens (durable, single-use, 15-minute TTL) and emailed
   * to the registered regulator contact. Fails loudly when the email is not a
   * registered regulator or when delivery fails — a persisted-but-undelivered
   * token is deleted so no stray valid tokens accumulate.
   */
  requestMagicLink: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const regulator = await resolveRegulator(email);
      if (!regulator) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active regulator profile is associated with this email.",
        });
      }
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + MAGIC_TOKEN_TTL_MS);
      const [row] = await db
        .insert(regulatorMagicTokens)
        .values({
          regulatorId: regulator.id,
          email,
          token,
          expiresAt,
          createdAt: new Date(),
        })
        .returning();

      const portalBase = process.env.REGULATOR_PORTAL_URL ?? ENV.merchantPortalUrl ?? "";
      const loginUrl = `${portalBase}/regulator/login?token=${token}`;
      const sent = await sendEmail({
        to: email,
        subject: "PayGate Regulatory Portal — your sign-in link",
        html:
          `<p>Hello ${regulator.regulatorName},</p>` +
          `<p>Use this one-time link to sign in to the PayGate Regulatory ` +
          `Oversight Portal (valid for 15 minutes):</p>` +
          `<p><a href="${loginUrl}">${loginUrl}</a></p>` +
          `<p>If you did not request this link, ignore this email.</p>`,
      });
      if (!sent) {
        // Delivery failed — remove the undeliverable token and fail loudly.
        await db
          .delete(regulatorMagicTokens)
          .where(eq(regulatorMagicTokens.id, row.id))
          .catch((e) =>
            logger.error("[regulatorAuth] failed to retract undelivered magic token:", e)
          );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Magic-link email could not be delivered — no token was issued.",
        });
      }
      return { success: true, expiresAt };
    }),

  /**
   * Consume a magic-link token. Verifies the token exists, is unused, and is
   * unexpired; marks it used (single-use invalidation) and creates a durable
   * regulator_sessions row. The portal session itself remains the standard
   * app session (see module docstring) — the returned sessionToken is the
   * durable record of this login event.
   */
  verifyMagicToken: publicProcedure
    .input(z.object({ token: z.string().min(32).max(128) }))
    .mutation(async ({ input }) => {
      const [row] = await db
        .select()
        .from(regulatorMagicTokens)
        .where(eq(regulatorMagicTokens.token, input.token))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid magic-link token." });
      }
      if (row.usedAt) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "This magic-link token has already been used.",
        });
      }
      if (row.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "This magic-link token has expired.",
        });
      }
      // Consume + invalidate atomically: only the first concurrent claim wins.
      const [claimed] = await db
        .update(regulatorMagicTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(regulatorMagicTokens.id, row.id),
            isNull(regulatorMagicTokens.usedAt)
          )
        )
        .returning();
      if (!claimed) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "This magic-link token has already been used.",
        });
      }
      const sessionToken = randomBytes(32).toString("hex");
      const [session] = await db
        .insert(regulatorSessions)
        .values({
          regulatorId: row.regulatorId,
          email: row.email,
          sessionToken,
          expiresAt: new Date(Date.now() + REGULATOR_SESSION_TTL_MS),
          createdAt: new Date(),
        })
        .returning();
      const regulator = await db
        .select()
        .from(nexthubRegulators)
        .where(eq(nexthubRegulators.id, row.regulatorId))
        .limit(1);
      return {
        success: true,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
        regulator: regulator[0]
          ? {
              id: regulator[0].id,
              regulatorCode: regulator[0].regulatorCode,
              regulatorName: regulator[0].regulatorName,
              jurisdiction: regulator[0].jurisdiction,
            }
          : null,
      };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const regulator = await resolveRegulator(ctx.user.email ?? null);
    if (!regulator) {
      // The principal is authenticated but holds no regulator mandate.
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "No active regulator profile is associated with this account. " +
          "Regulator access must be granted in nexthub_regulators.",
      });
    }
    return {
      id: regulator.id,
      regulatorCode: regulator.regulatorCode,
      regulatorName: regulator.regulatorName,
      jurisdiction: regulator.jurisdiction,
      regulatoryType: regulator.regulatoryType,
      contactEmail: regulator.contactEmail,
      dataAccessLevel: regulator.dataAccessLevel,
      status: regulator.status,
    };
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    // Invalidate any server-side regulator sessions for this identity.
    const regulator = await resolveRegulator(ctx.user.email ?? null);
    if (regulator) {
      await db
        .delete(regulatorSessions)
        .where(eq(regulatorSessions.regulatorId, regulator.id));
    }

    // Standard session invalidation — identical to auth.logout.
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    ctx.res.clearCookie(ID_TOKEN_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    ctx.res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      path: "/api/auth",
      sameSite: "none",
      secure: true,
      maxAge: -1,
    });

    if (ENV.keycloakUrl) {
      const { buildEndSessionUrl } = await import("../_core/keycloak");
      const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const postLogoutRedirectUri = `${origin}/`;
      const idTokenHint = ctx.req.cookies?.[ID_TOKEN_COOKIE_NAME] as
        | string
        | undefined;
      const ssoLogoutUrl = buildEndSessionUrl(postLogoutRedirectUri, idTokenHint);
      return { success: true, ssoLogoutUrl } as const;
    }

    return { success: true, ssoLogoutUrl: null } as const;
  }),
});
