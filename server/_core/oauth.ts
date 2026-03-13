/**
 * OAuth / OIDC route registration for the PayGate Merchant Portal.
 *
 * Strategy:
 *  - If KEYCLOAK_URL is configured → use Keycloak Authorization Code flow (RS256 JWT).
 *  - Otherwise → fall back to Manus OAuth (legacy sandbox behaviour).
 *
 * Both paths ultimately issue the same internal HS256 session cookie so the
 * rest of the application (protectedProcedure, ctx.user) is unchanged.
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
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

// ─── Keycloak OIDC callback ───────────────────────────────────────────────────

async function handleKeycloakCallback(req: Request, res: Response) {
  const code = getQueryParam(req, "code");
  const state = getQueryParam(req, "state");

  if (!code || !state) {
    res.status(400).json({ error: "code and state are required" });
    return;
  }

  try {
    // state = base64(redirectUri) — same convention as Manus OAuth
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

// ─── Manus OAuth callback (legacy fallback) ───────────────────────────────────

async function handleManusCallback(req: Request, res: Response) {
  const code = getQueryParam(req, "code");
  const state = getQueryParam(req, "state");

  if (!code || !state) {
    res.status(400).json({ error: "code and state are required" });
    return;
  }

  try {
    const tokenResponse = await sdk.exchangeCodeForToken(code, state);
    const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

    if (!userInfo.openId) {
      res.status(400).json({ error: "openId missing from user info" });
      return;
    }

    await db.upsertUser({
      openId: userInfo.openId,
      name: userInfo.name || null,
      email: userInfo.email ?? null,
      loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
      lastSignedIn: new Date(),
      tenantId: "ten_default",
    });

    const sessionToken = await sdk.createSessionToken(userInfo.openId, {
      name: userInfo.name || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.redirect(302, "/dashboard");
  } catch (error) {
    console.error("[OAuth] Manus callback failed", error);
    res.status(500).json({ error: "OAuth callback failed" });
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerOAuthRoutes(app: Express) {
  const useKeycloak = !!ENV.keycloakUrl;

  if (useKeycloak) {
    console.log(`[Auth] Keycloak OIDC enabled — realm: ${ENV.keycloakRealm}`);

    // Initiate Keycloak login — frontend redirects to this endpoint
    app.get("/api/auth/keycloak/login", (req: Request, res: Response) => {
      const origin = getQueryParam(req, "origin") ?? `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${origin}/api/oauth/callback`;
      const state = Buffer.from(redirectUri).toString("base64");
      res.redirect(302, buildAuthorizationUrl(redirectUri, state));
    });
  } else {
    console.log("[Auth] Keycloak not configured — using Manus OAuth fallback");
  }

  // Unified callback endpoint — handles both Keycloak and Manus OAuth
  app.get("/api/oauth/callback", (req: Request, res: Response) => {
    if (ENV.keycloakUrl) {
      return handleKeycloakCallback(req, res);
    }
    return handleManusCallback(req, res);
  });
}
