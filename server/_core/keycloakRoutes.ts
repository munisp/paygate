/**
 * Keycloak OIDC Express routes
 *
 * Registers three routes on the Express app:
 *   GET  /api/oauth/keycloak/login     — redirect to Keycloak authorization endpoint
 *   GET  /api/oauth/keycloak/callback  — exchange code, upsert user, set session cookie
 *   GET  /api/oauth/keycloak/logout    — clear session cookie and redirect to Keycloak end-session
 *
 * The session cookie format is identical to the Manus OAuth flow so that
 * protectedProcedure / ctx.user works transparently for both login methods.
 */

import type { Express } from "express";
import { ENV } from "./env";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  verifyAccessToken,
  extractRole,
  createSessionToken,
  getEndSessionEndpoint,
  COOKIE_NAME,
} from "./keycloak";
import { getSessionCookieOptions } from "./cookies";
import { ONE_YEAR_MS } from "../../shared/const";

const CALLBACK_PATH = "/api/oauth/keycloak/callback";

function getRedirectUri(req: any): string {
  // Use the origin from the request so it works in both dev and production
  const origin = req.headers.origin ?? `${req.protocol}://${req.headers.host}`;
  return `${origin}${CALLBACK_PATH}`;
}

export function registerKeycloakRoutes(app: Express): void {
  // Only register routes when Keycloak is configured
  if (!ENV.keycloakUrl || !ENV.keycloakClientId) {
    console.log("[Keycloak] KEYCLOAK_URL not set — SSO routes disabled");
    return;
  }

  // ─── GET /api/oauth/keycloak/login ──────────────────────────────────────────
  app.get("/api/oauth/keycloak/login", (req: any, res: any) => {
    try {
      const rawReturnPath = (req.query.returnPath as string) ?? "/dashboard";
      // SECURITY: only allow relative paths to prevent open redirect
      const returnPath = (typeof rawReturnPath === "string" && /^\/[^/]/.test(rawReturnPath) && !rawReturnPath.includes(":"))
        ? rawReturnPath
        : "/dashboard";
      // Encode returnPath in state so we can redirect after callback
      const state = Buffer.from(JSON.stringify({ returnPath, ts: Date.now() })).toString("base64url");
      const redirectUri = getRedirectUri(req);
      const authUrl = buildAuthorizationUrl(redirectUri, state);
      res.redirect(authUrl);
    } catch (err: any) {
      console.error("[Keycloak] Login redirect error:", err.message);
      res.status(500).json({ error: "SSO login unavailable" });
    }
  });

  // ─── GET /api/oauth/keycloak/callback ───────────────────────────────────────
  app.get(CALLBACK_PATH, async (req: any, res: any) => {
    const { code, state, error: oidcError } = req.query as Record<string, string>;

    if (oidcError) {
      console.error("[Keycloak] OIDC error:", oidcError);
      return res.redirect(`/?error=sso_${encodeURIComponent(oidcError)}`);
    }

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    try {
      const redirectUri = getRedirectUri(req);
      const tokens = await exchangeCodeForTokens(code, redirectUri);
      const claims = await verifyAccessToken(tokens.accessToken);

      const openId = claims.sub;
      const name = claims.name ?? claims.preferred_username ?? claims.email ?? openId;
      const email = claims.email ?? null;
      const role = extractRole(claims);

      // Upsert user in database
      const { getDb, schema } = await import("../db");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const existing = await db.select().from(schema.users)
          .where(eq(schema.users.openId, openId)).limit(1);

        if (existing.length === 0) {
          // First SSO login — provision user
          await db.insert(schema.users).values({
            openId,
            name,
            email,
            role,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).onConflictDoNothing();
          console.log(`[Keycloak] Provisioned new SSO user: ${openId} (${email ?? "no email"})`);
        } else {
          // Update name/email/role on subsequent logins
          await db.update(schema.users)
            .set({ name, email, role, updatedAt: new Date() })
            .where(eq(schema.users.openId, openId));
        }
      }

      // Issue session cookie (same format as Manus OAuth)
      const sessionToken = await createSessionToken(openId, name ?? "");
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS / 1000 });

      // Decode returnPath from state — SECURITY: only allow relative paths (prevent open redirect)
      let returnPath = "/dashboard";
      try {
        if (state) {
          const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
          const raw = decoded.returnPath;
          // Only accept paths starting with / but not // (protocol-relative) and no colon (no absolute URLs)
          if (typeof raw === "string" && /^\/[^/]/.test(raw) && !raw.includes(":")) {
            returnPath = raw;
          }
        }
      } catch { /* ignore malformed state */ }

      console.log(`[Keycloak] SSO login successful: ${openId} → ${returnPath}`);
      res.redirect(returnPath);
    } catch (err: any) {
      console.error("[Keycloak] Callback error:", err.message);
      res.redirect(`/?error=sso_callback_failed`);
    }
  });

  // ─── GET /api/oauth/keycloak/logout ─────────────────────────────────────────
  app.get("/api/oauth/keycloak/logout", (req: any, res: any) => {
    try {
      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      const origin = req.headers.origin ?? `${req.protocol}://${req.headers.host}`;
      const postLogoutUri = encodeURIComponent(`${origin}/`);
      const endSessionUrl = `${getEndSessionEndpoint()}?post_logout_redirect_uri=${postLogoutUri}&client_id=${ENV.keycloakClientId}`;
      res.redirect(endSessionUrl);
    } catch (err: any) {
      console.error("[Keycloak] Logout error:", err.message);
      res.redirect("/");
    }
  });

  console.log(`[Keycloak] SSO routes registered (realm: ${ENV.keycloakRealm}, client: ${ENV.keycloakClientId})`);
}
