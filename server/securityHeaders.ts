/**
 * PayGate Security Headers Middleware
 *
 * Applies production-grade HTTP security headers to all responses.
 * Mount this BEFORE all other middleware in server/_core/index.ts.
 *
 * Usage:
 *   import { securityHeaders } from "../securityHeaders";
 *   app.use(securityHeaders);
 */

import type { Request, Response, NextFunction } from "express";
import { ENV } from "./_core/env";

// ─── CORS allowed origins ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS: string[] = [
  // Production domain — update when custom domain is configured
  ...(process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? []),
  // Dev origins
  "http://localhost:3000",
  "http://localhost:5173",
];

// ─── Content Security Policy ──────────────────────────────────────────────────
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://api.stripe.com https://*.paygate.africa wss://*.paygate.africa https://*.manus.space wss://*.manus.space",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

// ─── Security headers middleware ──────────────────────────────────────────────
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Strict Transport Security (HTTPS only)
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  // Prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Clickjacking protection
  res.setHeader("X-Frame-Options", "DENY");

  // XSS protection (legacy browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self https://js.stripe.com)"
  );

  // Content Security Policy
  res.setHeader("Content-Security-Policy", CSP_DIRECTIVES);

  // Remove server fingerprint
  res.removeHeader("X-Powered-By");

  next();
}

// ─── CORS middleware ──────────────────────────────────────────────────────────
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-Idempotency-Key,X-Request-ID"
    );
    res.setHeader("Access-Control-Max-Age", "3600");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

// ─── Request ID middleware ────────────────────────────────────────────────────
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id =
    (req.headers["x-request-id"] as string) ||
    crypto.randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("X-Request-ID", id);
  next();
}
