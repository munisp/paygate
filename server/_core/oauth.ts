/**
 * OAuth / OIDC route registration for the PayGate Merchant Portal.
 *
 * This platform is designed for on-premise / private-cloud deployment.
 * Keycloak is the ONLY supported identity provider — there is no Manus OAuth
 * dependency or any other cloud-hosted auth service.
 *
 * Auth flow:
 *   1. Browser → GET /api/auth/keycloak/login
 *      Server builds Keycloak Authorization URL and redirects the browser.
 *   2. Keycloak → GET /api/oauth/callback?code=...&state=...
 *      Server exchanges code for tokens, verifies the RS256 access token,
 *      upserts the user in the local DB, issues an HS256 session cookie,
 *      and redirects to /dashboard.
 *   3. All subsequent requests carry the session cookie.
 *      context.ts verifies it locally — no outbound cloud call required.
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions, getIdTokenCookieOptions, ID_TOKEN_COOKIE_NAME } from "./cookies";
import { ENV } from "./env";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  verifyAccessToken,
  extractRole,
  createSessionToken,
} from "./keycloak";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}
// ─── Allowed origin validation ───────────────────────────────────────────────────
// Prevents open-redirect attacks on the login initiation endpoint.
//
// Production hardening rules:
//   1. Wildcard (*) and empty string values in ALLOWED_ORIGINS are rejected.
//   2. In production (NODE_ENV=production), localhost/127.x patterns are rejected.
//   3. Every allowed origin must be a valid URL with https:// scheme in production.
//
// Set ALLOWED_ORIGINS in your .env as a comma-separated list of exact origins:
//   ALLOWED_ORIGINS=https://portal.acme.ng,https://portal-staging.acme.ng

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Parse and validate the ALLOWED_ORIGINS env var. */
function parseAllowedOrigins(): string[] {
  const raw = (process.env.ALLOWED_ORIGINS ?? "");
  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Reject wildcard entries — they defeat the purpose of the allowlist
  const wildcards = origins.filter((o) => o === "*" || o === "**");
  if (wildcards.length > 0) {
    console.error(
      "[Auth] SECURITY: ALLOWED_ORIGINS contains wildcard entries ('*'). " +
      "Wildcards are not permitted — specify exact origins instead. " +
      "Offending entries have been removed."
    );
  }

  const safe = origins.filter((o) => o !== "*" && o !== "**");

  // In production, warn about http:// origins (should be https://)
  if (IS_PRODUCTION) {
    const insecure = safe.filter((o) => o.startsWith("http://") && !o.includes("localhost") && !o.includes("127."));
    if (insecure.length > 0) {
      console.warn(
        "[Auth] WARNING: ALLOWED_ORIGINS contains http:// (non-TLS) origins in production: " +
        insecure.join(", ") +
        ". Consider switching to https://."
      );
    }
  }

  return safe;
}

/** Cached allowed origins list (parsed once at startup). */
const ALLOWED_ORIGINS_LIST: string[] = parseAllowedOrigins();

function isOriginAllowed(rawOrigin: string, serverOrigin: string): boolean {
  // Reject obviously invalid or empty origins
  if (!rawOrigin || rawOrigin === "null" || rawOrigin === "undefined") return false;

  // Always allow the server's own origin
  if (rawOrigin === serverOrigin) return true;

  // Explicit allowlist from env
  if (ALLOWED_ORIGINS_LIST.includes(rawOrigin)) return true;

  // In production: no localhost/127.x fallback
  if (IS_PRODUCTION) return false;

  // Safe patterns for local development only
  const SAFE_DEV_PATTERNS = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    // Manus sandbox preview URLs (dev only)
    /^https:\/\/\d+-[a-z0-9]+-[a-z0-9]+\.us2\.manus\.computer$/,
  ];
  if (SAFE_DEV_PATTERNS.some((p) => p.test(rawOrigin))) return true;

  return false;
}

// ─── Keycloak OIDC callback ───────────────────────────────────────────────────

async function handleKeycloakCallback(req: Request, res: Response) {
  const code = getQueryParam(req, "code");
  const state = getQueryParam(req, "state");

  if (!code || !state) {
    res.status(400).json({ error: "code and state are required" });
    return;
  }

  try {
    // state = base64(redirectUri)
    const redirectUri = Buffer.from(state, "base64").toString("utf8");

    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const claims = await verifyAccessToken(tokens.accessToken);

    const openId = claims.sub;
    const name = claims.name ?? claims.preferred_username ?? "";
    const email = claims.email ?? null;
    const role = extractRole(claims);

    await db.upsertUser({
      openId,
      name: name || null,
      email,
      loginMethod: "keycloak",
      lastSignedIn: new Date(),
      tenantId: "ten_default",
      role,
    });

    const sessionToken = await createSessionToken(openId, name);
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    // Store the Keycloak id_token in a short-lived httpOnly cookie.
    // This is used exclusively as id_token_hint on the Keycloak end-session
    // endpoint so the user is not shown a "do you want to log out?" page.
    // The cookie expires with the Keycloak access token (default 5 min).
    if (tokens.idToken) {
      const idTokenOptions = getIdTokenCookieOptions(req, tokens.expiresIn || 300);
      res.cookie(ID_TOKEN_COOKIE_NAME, tokens.idToken, idTokenOptions);
    }

    res.redirect(302, "/dashboard");
  } catch (error) {
    console.error("[Keycloak] Callback failed", error);
    res.status(500).json({ error: "Keycloak callback failed" });
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerOAuthRoutes(app: Express) {
  if (!ENV.keycloakUrl) {
    // In development without Keycloak configured, warn loudly but continue
    // so the email/password login path (auth.login tRPC procedure) still works.
    console.warn(
      "[Auth] WARNING: KEYCLOAK_URL is not set. " +
      "SSO login will be unavailable. " +
      "Set KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, and KEYCLOAK_CLIENT_SECRET " +
      "for production on-premise deployment."
    );
  } else {
    console.log(`[Auth] Keycloak OIDC enabled — ${ENV.keycloakUrl}/realms/${ENV.keycloakRealm}`);
  }

  // Log allowed origins at startup for operator visibility
  if (ALLOWED_ORIGINS_LIST.length > 0) {
    console.log(`[Auth] ALLOWED_ORIGINS: ${ALLOWED_ORIGINS_LIST.join(", ")}`);
  } else if (IS_PRODUCTION) {
    console.warn(
      "[Auth] WARNING: ALLOWED_ORIGINS is empty in production. " +
      "Only the server's own origin will be accepted for OAuth redirects. " +
      "Set ALLOWED_ORIGINS=https://your-portal-domain.com to allow external origins."
    );
  } else {
    console.log("[Auth] ALLOWED_ORIGINS not set — localhost and 127.x are allowed in development.");
  }

  // ── Initiate Keycloak login ──────────────────────────────────────────────
  // Frontend redirects to this endpoint to start the Authorization Code flow.
  // Also kept at the legacy path /api/oauth/keycloak/login for backwards compat.
  const keycloakLoginHandler = (req: Request, res: Response) => {
    if (!ENV.keycloakUrl) {
      res.status(503).json({
        error: "Keycloak not configured",
        hint: "Set KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET",
      });
      return;
    }

    const serverOrigin = `${req.protocol}://${req.get("host")}`;
    const rawOrigin = getQueryParam(req, "origin") ?? serverOrigin;
    const origin = isOriginAllowed(rawOrigin, serverOrigin) ? rawOrigin : serverOrigin;

    const redirectUri = `${origin}/api/oauth/callback`;
    const state = Buffer.from(redirectUri).toString("base64");
    res.redirect(302, buildAuthorizationUrl(redirectUri, state));
  };

  app.get("/api/auth/keycloak/login", keycloakLoginHandler);
  // Legacy path kept for backwards compatibility with existing bookmarks / clients
  app.get("/api/oauth/keycloak/login", keycloakLoginHandler);

  // ── OAuth callback (Keycloak Authorization Code response) ───────────────
  app.get("/api/oauth/callback", (req: Request, res: Response) => {
    return handleKeycloakCallback(req, res);
  });
}
