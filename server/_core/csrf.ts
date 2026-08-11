/**
 * CSRF Origin Guard
 * ─────────────────────────────────────────────────────────────────────────────
 * tRPC session auth is COOKIE-based (session cookie `app_session_id`, set with
 * SameSite=None so cross-site embeddings work — see server/_core/cookies.ts and
 * sdk.authenticateRequest). SameSite=None means the browser WILL attach the
 * session cookie to cross-site requests, so cookie-authenticated mutations are
 * CSRF-exposed and an explicit check is required.
 *
 * Policy (fail closed) for mutating methods (POST/PUT/PATCH/DELETE):
 *  1. Requests authenticated with an `Authorization: Bearer …` header are
 *     CSRF-immune (the token is not ambiently attached by browsers) → pass.
 *  2. Requests that carry cookies must present an `Origin` (or `Referer`)
 *     header whose origin is:
 *       - same-origin with the request Host / X-Forwarded-Host, or
 *       - in the allowlist: ALLOWED_ORIGINS env (comma-separated, same source
 *         as the CORS middleware) plus MERCHANT_PORTAL_URL, plus localhost
 *         dev origins outside production.
 *  3. Cookie-bearing mutations with no Origin/Referer or a non-allowlisted
 *     origin → 403.
 *
 * Requests without cookies and without a Bearer token pass through — they are
 * unauthenticated and will be rejected by tRPC `protectedProcedure` anyway.
 *
 * Mount BEFORE the tRPC handler (see server/_core/index.ts).
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Origins that may perform cookie-authenticated mutations. */
function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const o of process.env.ALLOWED_ORIGINS?.split(",") ?? []) {
    const trimmed = o.trim();
    if (trimmed) origins.add(trimmed);
  }
  const portalUrl = process.env.MERCHANT_PORTAL_URL?.trim();
  if (portalUrl) {
    try {
      origins.add(new URL(portalUrl).origin);
    } catch { /* ignore malformed config */ }
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:3000");
    origins.add("http://127.0.0.1:5173");
  }
  return origins;
}

/** Origin string (scheme://host[:port]) from an Origin or Referer header. */
function originOf(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  try {
    return new URL(headerValue).origin;
  } catch {
    return null;
  }
}

/** Same-origin check against Host (preferring X-Forwarded-Host behind proxies). */
function isSameOrigin(req: Request, origin: string): boolean {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(",")[0]?.trim()
    || req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const csrfOriginGuard: RequestHandler = function csrfOriginGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  // 1. Bearer-token requests are not ambiently authenticated → CSRF N/A.
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return next();
  }

  // 2. No cookies → not cookie-authenticated; tRPC auth will reject if needed.
  if (!req.headers.cookie) return next();

  // 3. Cookie-authenticated mutation: require an allowlisted Origin/Referer.
  const origin = originOf(req.headers.origin as string | undefined)
    ?? originOf(req.headers.referer as string | undefined);

  if (!origin) {
    res.status(403).json({
      error: "CSRF check failed: mutating cookie-authenticated requests require an Origin header",
    });
    return;
  }

  if (isSameOrigin(req, origin) || allowedOrigins().has(origin)) {
    return next();
  }

  res.status(403).json({
    error: "CSRF check failed: origin is not allowed to perform cookie-authenticated mutations",
  });
};
