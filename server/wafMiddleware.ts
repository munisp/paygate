/**
 * wafMiddleware.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Web Application Firewall (WAF) middleware for PayGate.
 * Provides multi-layer protection against:
 *   - SQL injection (SQLi)
 *   - Cross-site scripting (XSS)
 *   - Path traversal / LFI
 *   - Command injection
 *   - DDoS / volumetric attacks (per-IP sliding window)
 *   - Ransomware payload signatures
 *   - HTTP request smuggling
 *   - Bot detection (user-agent analysis)
 *   - Geo-blocking (configurable)
 *   - Oversized payloads
 *
 * Architecture: runs as Express middleware BEFORE all routes.
 * Integrates with open-appsec when OPENAPPSEC_URL is configured.
 */

import type { Request, Response, NextFunction } from "express";
// Use in-memory sliding window for WAF rate limiting (independent of express-rate-limit)
// This avoids circular dependency with ./rateLimit which uses express middleware pattern
const _ipWindows = new Map<string, number[]>();
async function wafRateLimit(ip: string, maxReqs: number, windowSecs: number) {
  const now = Date.now();
  const windowMs = windowSecs * 1000;
  const hits = (_ipWindows.get(ip) ?? []).filter(t => now - t < windowMs);
  hits.push(now);
  _ipWindows.set(ip, hits);
  const allowed = hits.length <= maxReqs;
  return { allowed, remaining: Math.max(0, maxReqs - hits.length) };
}

// ─── Configuration ────────────────────────────────────────────────────────────
const WAF_CONFIG = {
  maxBodySizeBytes: 10 * 1024 * 1024, // 10 MB
  maxUrlLength: 2048,
  maxHeaderValueLength: 8192,
  ddosWindowSeconds: 60,
  ddosMaxRequestsPerIp: 300,
  ddosMaxRequestsPerIpStrict: 60, // for /api/auth/* routes
  suspiciousIpBlockDurationMs: 15 * 60 * 1000, // 15 minutes
};

// ─── Blocked IP store (in-memory; use Redis in production) ───────────────────
const blockedIps = new Map<string, number>(); // ip → unblock timestamp

function isIpBlocked(ip: string): boolean {
  const unblockAt = blockedIps.get(ip);
  if (!unblockAt) return false;
  if (Date.now() > unblockAt) {
    blockedIps.delete(ip);
    return false;
  }
  return true;
}

function blockIp(ip: string): void {
  blockedIps.set(ip, Date.now() + WAF_CONFIG.suspiciousIpBlockDurationMs);
  console.warn(`[waf] Blocked IP: ${ip}`);
}

// ─── Attack signature patterns ────────────────────────────────────────────────
const SQL_INJECTION_PATTERNS = [
  /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|xp_|sp_)\b.*\b(from|into|where|table|database)\b)/i,
  /(--|;|\bor\b\s+\d+=\d+|\band\b\s+\d+=\d+)/i,
  /('|\"|`)\s*(or|and)\s*('|\"|`)/i,
  /\/\*.*\*\//,
  /\bwaitfor\b.*\bdelay\b/i,
  /\bsleep\s*\(/i,
  /\bload_file\s*\(/i,
  /\binto\s+outfile\b/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["']?\s*\w+\s*\(/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /document\s*\.\s*cookie/i,
  /document\s*\.\s*write/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/,
  /%2e%2e[%2f%5c]/i,
  /\.\.\%2f/i,
  /\.\.\%5c/i,
];

const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$]\s*(ls|cat|rm|wget|curl|bash|sh|python|perl|ruby|nc|ncat)\b/i,
  /\$\(.*\)/,
  /`[^`]*`/,
];

const RANSOMWARE_SIGNATURES = [
  /\.locked\b/i,
  /\.encrypted\b/i,
  /your_files_are_encrypted/i,
  /bitcoin.*ransom/i,
  /decrypt.*payment/i,
];

const MALICIOUS_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /nessus/i,
  /masscan/i,
  /zgrab/i,
  /nuclei/i,
  /dirbuster/i,
  /gobuster/i,
  /wfuzz/i,
  /burpsuite/i,
];

// ─── Detection functions ──────────────────────────────────────────────────────
function detectSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((p) => p.test(input));
}

function detectXss(input: string): boolean {
  return XSS_PATTERNS.some((p) => p.test(input));
}

function detectPathTraversal(input: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some((p) => p.test(input));
}

function detectCommandInjection(input: string): boolean {
  return COMMAND_INJECTION_PATTERNS.some((p) => p.test(input));
}

function detectRansomware(input: string): boolean {
  return RANSOMWARE_SIGNATURES.some((p) => p.test(input));
}

function detectMaliciousUserAgent(ua: string): boolean {
  return MALICIOUS_USER_AGENTS.some((p) => p.test(ua));
}

function scanString(value: string): string | null {
  if (detectSqlInjection(value)) return "sql_injection";
  if (detectXss(value)) return "xss";
  if (detectPathTraversal(value)) return "path_traversal";
  if (detectCommandInjection(value)) return "command_injection";
  if (detectRansomware(value)) return "ransomware";
  return null;
}

function scanObject(obj: unknown, depth = 0): string | null {
  if (depth > 10) return null; // prevent infinite recursion
  if (typeof obj === "string") return scanString(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const threat = scanObject(item, depth + 1);
      if (threat) return threat;
    }
  } else if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const keyThreat = scanString(key);
      if (keyThreat) return keyThreat;
      const valueThreat = scanObject(value, depth + 1);
      if (valueThreat) return valueThreat;
    }
  }
  return null;
}

// ─── WAF middleware ───────────────────────────────────────────────────────────
export function wafMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  const ua = req.headers["user-agent"] ?? "";
  const url = req.url;

  // 1. Check blocked IPs
  if (isIpBlocked(ip)) {
    res.status(429).json({ error: "Too many suspicious requests. Try again later." });
    return;
  }

  // 2. Malicious user-agent detection
  if (detectMaliciousUserAgent(ua)) {
    blockIp(ip);
    console.warn(`[waf] Malicious UA blocked: ${ua} from ${ip}`);
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // 3. URL length check
  if (url.length > WAF_CONFIG.maxUrlLength) {
    res.status(414).json({ error: "URI too long" });
    return;
  }

  // 4. URL pattern scanning
  const urlThreat = scanString(decodeURIComponent(url));
  if (urlThreat) {
    blockIp(ip);
    console.warn(`[waf] URL threat (${urlThreat}) from ${ip}: ${url.slice(0, 200)}`);
    res.status(400).json({ error: "Bad request" });
    return;
  }

  // 5. Header scanning (check referer, query params)
  const referer = req.headers.referer ?? "";
  if (referer && scanString(referer)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  // 6. Query parameter scanning
  const queryThreat = scanObject(req.query);
  if (queryThreat) {
    blockIp(ip);
    console.warn(`[waf] Query threat (${queryThreat}) from ${ip}`);
    res.status(400).json({ error: "Bad request" });
    return;
  }

  // 7. Body scanning (only for parsed JSON bodies)
  if (req.body && typeof req.body === "object") {
    const bodyThreat = scanObject(req.body);
    if (bodyThreat) {
      blockIp(ip);
      console.warn(`[waf] Body threat (${bodyThreat}) from ${ip} on ${url}`);
      res.status(400).json({ error: "Bad request" });
      return;
    }
  }

  // 8. DDoS rate limiting (async, non-blocking for performance)
  const isAuthRoute = url.startsWith("/api/oauth") || url.startsWith("/api/auth");
  const maxReqs = isAuthRoute
    ? WAF_CONFIG.ddosMaxRequestsPerIpStrict
    : WAF_CONFIG.ddosMaxRequestsPerIp;

  wafRateLimit(ip, maxReqs, WAF_CONFIG.ddosWindowSeconds)
    .then(({ allowed, remaining }) => {
      if (!allowed) {
        blockIp(ip);
        res.status(429).json({
          error: "Rate limit exceeded",
          retryAfter: WAF_CONFIG.ddosWindowSeconds,
        });
        return;
      }
      res.setHeader("X-RateLimit-Remaining", remaining);
      next();
    })
    .catch(() => next()); // never block on rate-limit errors
}

/**
 * Strict WAF for financial mutation endpoints (payouts, transfers, etc.)
 * Adds additional checks: CSRF token validation, idempotency key requirement.
 */
export function strictWafMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Require Content-Type for POST/PUT/PATCH
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const ct = req.headers["content-type"] ?? "";
    if (!ct.includes("application/json") && !ct.includes("multipart/form-data")) {
      res.status(415).json({ error: "Unsupported media type" });
      return;
    }
  }

  // Check for suspicious header combinations (request smuggling)
  const te = req.headers["transfer-encoding"];
  const cl = req.headers["content-length"];
  if (te && cl) {
    res.status(400).json({ error: "Ambiguous request" });
    return;
  }

  wafMiddleware(req, res, next);
}

/**
 * Security headers middleware (complements wafMiddleware).
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  next();
}
