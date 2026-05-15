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
import { createHmac, timingSafeEqual } from "crypto";
import {
  getSessionCookieOptions,
  getIdTokenCookieOptions,
  ID_TOKEN_COOKIE_NAME,
  getRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
} from "./cookies";
import { ENV } from "./env";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  verifyAccessToken,
  extractRole,
  createSessionToken,
  refreshAccessToken,
} from "./keycloak";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// A lightweight token-bucket rate limiter keyed by IP address.
// This is intentionally simple — for high-traffic deployments, replace with
// a Redis-backed rate limiter (e.g. rate-limiter-flexible).

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

class RateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  readonly maxRequests: number;
  readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    // Prune stale buckets every 5 minutes to prevent memory leaks
    setInterval(() => this.prune(), 5 * 60 * 1000).unref();
  }

  /** Returns true if the request is allowed, false if rate-limited. */
  check(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart > this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (bucket.count >= this.maxRequests) {
      return false;
    }

    bucket.count++;
    return true;
  }

  private prune() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart > this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}

// Rate limits (per IP, per time window)
const loginRateLimit = new RateLimiter(20, 60_000);   // 20 login initiations / min
const callbackRateLimit = new RateLimiter(20, 60_000); // 20 callback exchanges / min
const refreshRateLimit = new RateLimiter(10, 60_000);  // 10 silent refreshes / min
const webhookRateLimit = new RateLimiter(200, 60_000); // 200 webhook events / min

function getClientIp(req: Request): string {
  // Trust X-Forwarded-For when behind a reverse proxy (nginx, Traefik, etc.)
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

function rateLimitMiddleware(limiter: RateLimiter, endpointName: string) {
  return (req: Request, res: Response, next: () => void) => {
    const ip = getClientIp(req);
    if (!limiter.check(ip)) {
      console.warn(`[Auth] Rate limit exceeded for ${endpointName} from ${ip}`);
      // RFC 6585 / RFC 9110: include Retry-After and X-RateLimit-* headers
      res.setHeader("Retry-After", String(Math.ceil(limiter.windowMs / 1000)));
      res.setHeader("X-RateLimit-Limit", String(limiter.maxRequests));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil((Date.now() + limiter.windowMs) / 1000)));
      res.status(429).json({
        error: "Too many requests",
        hint: `Rate limit exceeded for ${endpointName}. Please wait before retrying.`,
        retryAfterSeconds: Math.ceil(limiter.windowMs / 1000),
      });
      return;
    }
    next();
  };
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

  // Validate state parameter entropy — must decode to a valid HTTPS/HTTP URL
  // and have at least 32 bytes of base64-encoded content to prevent state forgery.
  // A valid state is base64(redirectUri) where redirectUri is at minimum
  // "http://x" (8 chars), so the base64 must be at least 12 chars.
  if (state.length < 12) {
    console.warn("[Keycloak] Callback rejected: state parameter too short (possible forgery)");
    res.status(400).json({ error: "Invalid state parameter" });
    return;
  }

  let decodedState: string;
  try {
    decodedState = Buffer.from(state, "base64").toString("utf8");
  } catch {
    res.status(400).json({ error: "Invalid state encoding" });
    return;
  }

  if (!decodedState.startsWith("http://") && !decodedState.startsWith("https://")) {
    console.warn("[Keycloak] Callback rejected: state decodes to non-HTTP URI (possible open-redirect)");
    res.status(400).json({ error: "Invalid state parameter" });
    return;
  }

  try {
    // state = base64(redirectUri)
    const redirectUri = decodedState;

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

    // Store the Keycloak refresh_token in a long-lived httpOnly cookie.
    // The /api/auth/refresh endpoint reads this to silently re-issue the
    // session JWT when the access token expires, without requiring re-login.
    if (tokens.refreshToken) {
      const refreshOptions = getRefreshTokenCookieOptions(req);
      res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, refreshOptions);
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

  app.get(
    "/api/auth/keycloak/login",
    rateLimitMiddleware(loginRateLimit, "/api/auth/keycloak/login"),
    keycloakLoginHandler
  );
  // Legacy path kept for backwards compatibility with existing bookmarks / clients
  app.get(
    "/api/oauth/keycloak/login",
    rateLimitMiddleware(loginRateLimit, "/api/oauth/keycloak/login"),
    keycloakLoginHandler
  );

  // ── OAuth callback (Keycloak Authorization Code response) ───────────────
  app.get(
    "/api/oauth/callback",
    rateLimitMiddleware(callbackRateLimit, "/api/oauth/callback"),
    (req: Request, res: Response) => {
      return handleKeycloakCallback(req, res);
    }
  );

  // ── Keycloak event listener webhook ────────────────────────────────────────
  // Keycloak's HTTP Event Listener SPI POSTs auth events (LOGIN, LOGOUT,
  // LOGIN_ERROR, etc.) to this endpoint. We verify the request using an
  // HMAC-SHA256 signature in the X-Keycloak-Signature header, then persist
  // the event to the keycloak_events table for compliance reporting.
  //
  // Configuration in Keycloak Admin UI:
  //   Realm Settings → Events → Event Listeners → add "http-event-listener"
  //   Provider config: url = <PORTAL_URL>/api/internal/keycloak-events
  //                    secret = value of KEYCLOAK_WEBHOOK_SECRET env var
  //
  // Alternatively, set it in paygate-realm.json → eventsListeners.
  app.post(
    "/api/internal/keycloak-events",
    rateLimitMiddleware(webhookRateLimit, "/api/internal/keycloak-events"),
    async (req: Request, res: Response) => {
      const webhookSecret = ENV.keycloakWebhookSecret || undefined;

      // Verify HMAC signature if a secret is configured
      if (webhookSecret) {
        const signature = req.headers["x-keycloak-signature"] as string | undefined;
        if (!signature) {
          console.warn("[Keycloak Events] Missing X-Keycloak-Signature header");
          res.status(401).json({ error: "Missing signature" });
          return;
        }
        try {
          const rawBody = JSON.stringify(req.body);
          const expected = createHmac("sha256", webhookSecret)
            .update(rawBody)
            .digest("hex");
          const expectedBuf = Buffer.from(expected, "utf8");
          const actualBuf = Buffer.from(signature, "utf8");
          const valid =
            expectedBuf.length === actualBuf.length &&
            timingSafeEqual(expectedBuf, actualBuf);
          if (!valid) {
            console.warn("[Keycloak Events] Invalid signature");
            res.status(401).json({ error: "Invalid signature" });
            return;
          }
        } catch {
          res.status(400).json({ error: "Signature verification failed" });
          return;
        }
      }

      const body = req.body as Record<string, unknown>;
      const eventType = (body.type ?? body.eventType ?? "UNKNOWN") as string;

      // Log to console for operator visibility
      const isError = eventType.endsWith("_ERROR");
      if (isError) {
        console.warn(`[Keycloak Events] ${eventType}`, {
          userId: body.userId,
          ipAddress: body.ipAddress,
          error: body.error,
        });
      } else {
        console.log(`[Keycloak Events] ${eventType}`, {
          userId: body.userId,
          sessionId: body.sessionId,
          ipAddress: body.ipAddress,
        });
      }

      // Persist to DB (fire-and-forget — errors are swallowed in logKeycloakEvent)
      await db.logKeycloakEvent({
        eventType,
        realmId: body.realmId as string | undefined,
        clientId: body.clientId as string | undefined,
        userId: body.userId as string | undefined,
        sessionId: body.sessionId as string | undefined,
        ipAddress: body.ipAddress as string | undefined,
        error: body.error as string | undefined,
        details: body.details as Record<string, unknown> | undefined,
      });

      // ── Geo-based anomaly detection: alert on new-country login ────────────
      if (eventType === "LOGIN" && body.userId && body.ipAddress) {
        try {
          const knownCountries = await db.getKnownCountriesForUser(body.userId as string, 1);
          // Only alert if user has prior logins (not first-ever login)
          if (knownCountries.length > 0) {
            // Get the country of the event we just stored
            const recentEvents = await db.getKeycloakEvents({
              limit: 1,
              userId: body.userId as string,
              eventType: "LOGIN",
            });
            const latestCountry = recentEvents[0]?.geo_country;
            if (latestCountry && !knownCountries.includes(latestCountry)) {
              const { notifyOwner } = await import("./notification");
              await notifyOwner({
                title: "🌍 New Country Login Detected",
                content: `User ${body.userId} logged in from ${latestCountry} (IP: ${body.ipAddress}). Known countries: ${knownCountries.join(", ")}.`,
              });
              console.warn("[Keycloak Events] New-country login alert", {
                userId: body.userId,
                country: latestCountry,
                knownCountries,
              });
            }
          }
        } catch (geoErr) {
          console.error("[Keycloak Events] Geo anomaly check failed", geoErr);
        }
      }

      // Also mirror to the existing audit_events table for cross-system correlation
      if (body.userId) {
        await db.logAuditEvent({
          merchantId: "platform",
          actorId: body.userId as string,
          actorName: (body.details as Record<string, unknown> | undefined)?.username as string ?? "unknown",
          action: eventType,
          resource: "auth",
          resourceId: body.sessionId as string | undefined,
          metadata: {
            realmId: body.realmId,
            clientId: body.clientId,
            ipAddress: body.ipAddress,
            error: body.error,
          },
          ipAddress: body.ipAddress as string | undefined,
        });
      }

      res.json({ ok: true });
    }
  );

  // ── Silent token refresh ─────────────────────────────────────────────────
  // Called by the frontend when the session JWT is approaching expiry.
  // Reads the refresh_token cookie, exchanges it with Keycloak for a new
  // access token, and re-issues the portal session JWT + id_token cookie.
  // Returns 401 if the refresh_token is missing or expired (force re-login).
  app.post(
    "/api/auth/refresh",
    rateLimitMiddleware(refreshRateLimit, "/api/auth/refresh"),
    async (req: Request, res: Response) => {
      const storedRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;

      if (!storedRefreshToken) {
        res.status(401).json({ error: "No refresh token — please log in again" });
        return;
      }

      if (!ENV.keycloakUrl) {
        res.status(503).json({ error: "Keycloak not configured" });
        return;
      }

      try {
        const tokens = await refreshAccessToken(storedRefreshToken);
        const claims = await verifyAccessToken(tokens.accessToken);

        const openId = claims.sub;
        const name = claims.name ?? claims.preferred_username ?? "";

        // Re-issue the portal session JWT
        const sessionToken = await createSessionToken(openId, name);
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        // Rotate the id_token cookie
        if (tokens.idToken) {
          const idTokenOptions = getIdTokenCookieOptions(req, tokens.expiresIn || 300);
          res.cookie(ID_TOKEN_COOKIE_NAME, tokens.idToken, idTokenOptions);
        }

        // Rotate the refresh_token cookie if Keycloak issued a new one
        if (tokens.refreshToken) {
          const refreshOptions = getRefreshTokenCookieOptions(req);
          res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, refreshOptions);
        }

        res.json({ ok: true, expiresIn: tokens.expiresIn });
      } catch (error) {
        console.error("[Auth] Token refresh failed", error);
        // Clear all auth cookies — the user must re-authenticate
        const cookieOptions = getSessionCookieOptions(req);
        res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        res.clearCookie(ID_TOKEN_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: "/api/auth", sameSite: "none", secure: true, maxAge: -1 });
        res.status(401).json({ error: "Token refresh failed — please log in again" });
      }
    }
  );
}
