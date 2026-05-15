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
import { getSessionCookieOptions } from "./cookies";
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

// ─── Allowed origin validation ────────────────────────────────────────────────
// Prevents open-redirect attacks on the login initiation endpoint.
// Add your on-premise domain(s) to the ALLOWED_ORIGINS env var (comma-separated).

function isOriginAllowed(rawOrigin: string, serverOrigin: string): boolean {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Always allow the server's own origin
  if (rawOrigin === serverOrigin) return true;

  // Explicit allowlist from env
  if (allowedOrigins.includes(rawOrigin)) return true;

  // Safe patterns for local development
  const SAFE_DEV_PATTERNS = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
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
