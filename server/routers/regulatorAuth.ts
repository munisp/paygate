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
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { nexthubRegulators, regulatorSessions } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import {
  getSessionCookieOptions,
  ID_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../_core/cookies";
import { ENV } from "../_core/env";

/** Resolve the active regulator profile for the authenticated principal. */
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

export const regulatorAuthRouter = router({
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
