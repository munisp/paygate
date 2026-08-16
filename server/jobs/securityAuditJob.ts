/**
 * Nightly Security Audit — Heartbeat Job
 *
 * Endpoint: POST /api/scheduled/security-audit
 * Schedule: 0 0 2 * * * (daily at 02:00 UTC)
 *
 * Runs a set of REAL, runtime-verifiable security posture checks and
 * persists the outcome to `security_audit_snapshots` (merchantId="platform").
 * Every check inspects actual server state — no assumed/fabricated results.
 * A check that cannot be evaluated scores 0 and is marked not_evaluated
 * (truthful failure), never silently passed.
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { securityAuditSnapshots } from "../../drizzle/schema";
import { logger } from "../logger";

interface AuditFinding {
  id: string;
  name: string;
  severity: "p0" | "p1" | "p2";
  status: "pass" | "fail" | "not_evaluated";
  detail: string;
}

/** Each check returns pass/fail based on real, observable server state. */
async function runChecks(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const isProd = process.env.NODE_ENV === "production";

  // 1. Simulation mode must never be on in production.
  const simOn = process.env.PAYGATE_SIMULATION_MODE === "true";
  findings.push({
    id: "simulation-mode",
    name: "Simulation mode disabled in production",
    severity: "p0",
    status: isProd && simOn ? "fail" : "pass",
    detail: simOn
      ? `PAYGATE_SIMULATION_MODE=true (NODE_ENV=${process.env.NODE_ENV ?? "unset"})`
      : "PAYGATE_SIMULATION_MODE is not enabled",
  });

  // 2. Database connectivity (real probe).
  try {
    const db = await getDb();
    if (!db) throw new Error("getDb returned null");
    await db.execute("SELECT 1" as any);
    findings.push({
      id: "database",
      name: "Database reachable",
      severity: "p0",
      status: "pass",
      detail: "SELECT 1 succeeded",
    });
  } catch (e: any) {
    findings.push({
      id: "database",
      name: "Database reachable",
      severity: "p0",
      status: "fail",
      detail: `probe failed: ${e?.message ?? e}`,
    });
  }

  // 3. Critical secrets must be configured (existence only — never log values).
  const requiredEnv = ["DATABASE_URL", "INTERNAL_API_KEY", "STRIPE_WEBHOOK_SECRET"];
  const missing = requiredEnv.filter((k) => !process.env[k]);
  findings.push({
    id: "secrets-configured",
    name: "Critical secrets configured",
    severity: "p0",
    status: missing.length === 0 ? "pass" : isProd ? "fail" : "not_evaluated",
    detail:
      missing.length === 0
        ? "all required env vars present"
        : `missing: ${missing.join(", ")}`,
  });

  // 4. JWT/session secret strength — must not be a short/default value.
  const jwt = process.env.JWT_SECRET ?? "";
  findings.push({
    id: "jwt-secret",
    name: "JWT secret entropy",
    severity: "p1",
    status: jwt.length >= 32 ? "pass" : jwt.length === 0 ? "not_evaluated" : "fail",
    detail:
      jwt.length === 0
        ? "JWT_SECRET unset"
        : jwt.length >= 32
          ? "sufficient length"
          : "too short (<32 chars)",
  });

  // 5. CORS allowlist must not be wildcard in production.
  const origins = process.env.ALLOWED_ORIGINS ?? "";
  const wildcard = origins.trim() === "*" || origins.split(",").some((o) => o.trim() === "*");
  findings.push({
    id: "cors-allowlist",
    name: "CORS allowlist is explicit",
    severity: "p1",
    status: wildcard && isProd ? "fail" : wildcard ? "not_evaluated" : "pass",
    detail: wildcard
      ? "wildcard origin configured"
      : origins
        ? "explicit allowlist"
        : "ALLOWED_ORIGINS unset (defaults deny cross-origin cookies)",
  });

  // 6. TLS termination expectation — in production, plain HTTP listen is a finding
  //    unless an explicit TLS-terminating proxy flag is set.
  const behindProxy = process.env.TRUST_PROXY === "true" || process.env.TLS_TERMINATED === "true";
  findings.push({
    id: "tls-termination",
    name: "TLS termination documented",
    severity: "p2",
    status: !isProd || behindProxy ? "pass" : "not_evaluated",
    detail: behindProxy
      ? "proxy TLS termination flag set"
      : isProd
        ? "no TRUST_PROXY/TLS_TERMINATED flag — verify ingress terminates TLS"
        : "non-production",
  });

  return findings;
}

function gradeFor(score: number): string {
  if (score >= 97) return "A+";
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return "D";
}

export async function runSecurityAudit(triggeredBy: string = "nightly"): Promise<{
  score: number;
  grade: string;
  p0Failures: number;
  findings: AuditFinding[];
}> {
  const findings = await runChecks();
  // Weighted score: p0 checks weigh 3, p1 weigh 2, p2 weigh 1.
  const weights = { p0: 3, p1: 2, p2: 1 } as const;
  let got = 0;
  let max = 0;
  for (const f of findings) {
    const w = weights[f.severity];
    max += w;
    if (f.status === "pass") got += w;
    // not_evaluated scores 0 — truthful, never assumed
  }
  const score = max === 0 ? 0 : Math.round((got / max) * 100);
  const p0Failures = findings.filter((f) => f.severity === "p0" && f.status === "fail").length;

  const db = await getDb();
  if (!db) throw new Error("[securityAuditJob] database unavailable — cannot persist snapshot");
  await db.insert(securityAuditSnapshots).values({
    merchantId: "platform",
    overallScore: score,
    findings: findings as any,
    triggeredBy,
  });

  const result = { score, grade: gradeFor(score), p0Failures, findings };
  logger.info(
    `[securityAuditJob] run complete score=${score} grade=${result.grade} p0Failures=${p0Failures} triggeredBy=${triggeredBy}`,
  );
  return result;
}

/** Heartbeat HTTP handler — cron-authenticated like other scheduled jobs. */
export async function securityAuditJobHandler(req: Request, res: Response) {
  try {
    // Authenticate the Heartbeat cron caller via Authorization header —
    // sdk.* session calls are confined to server/_core auth plumbing.
    const authHeader = req.headers.authorization ?? "";
    const apiKey = process.env.BUILT_IN_FORGE_API_KEY ?? "";
    const internalKey = process.env.MIDDLEWARE_INTERNAL_KEY ?? "";
    const isCron =
      (apiKey !== "" && authHeader === `Bearer ${apiKey}`) ||
      (internalKey !== "" && authHeader === `Bearer ${internalKey}`) ||
      (apiKey !== "" && req.headers["x-cron-secret"] === apiKey);
    if (!isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }
    const result = await runSecurityAudit("nightly");
    return res.json({ ok: true, ...result, runAt: new Date().toISOString() });
  } catch (e: any) {
    logger.error(`[securityAuditJob] failed: ${e?.message ?? e}`);
    return res.status(500).json({ ok: false, error: "security audit failed" });
  }
}
