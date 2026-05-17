/**
 * seed-wave170.mjs — Idempotent demo data for Wave 170 tables
 *
 * Tables seeded:
 *   - liveness_sessions        (KYC liveness replay viewer)
 *   - kyb_verifications        (KYB verification records)
 *   - kyb_steps                (KYB step progress)
 *   - kyb_documents            (KYB document uploads)
 *   - keycloak_events          (Keycloak auth event log)
 *   - audit_events             (Audit trail)
 *   - partner_onboarding_sessions (Partner onboarding)
 *
 * Usage:
 *   node seed-wave170.mjs            # live run
 *   node seed-wave170.mjs --dry-run  # preview SQL without writing
 */

import pg from "pg";
import crypto from "crypto";
import "dotenv/config";

const DRY_RUN = process.argv.includes("--dry-run");
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("❌  DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

const errors = [];
function recordError(table, err) {
  errors.push({ table, message: err.message });
  console.error(`  ✗ ${table}: ${err.message}`);
}

async function q(label, sql, params = []) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] ${label}`);
    console.log(`    SQL: ${sql.slice(0, 120)}${sql.length > 120 ? "…" : ""}`);
    return;
  }
  await pool.query(sql, params);
  console.log(`  ✓ ${label}`);
}

// ─── Resolve a real merchant ID from DB ───────────────────────────────────────
async function getFirstMerchantId() {
  if (DRY_RUN) return "merchant_demo_001";
  const res = await pool.query("SELECT id FROM merchants LIMIT 1");
  return res.rows[0]?.id ?? "merchant_demo_001";
}

async function getFirstKycSubmissionId() {
  if (DRY_RUN) return null;
  const res = await pool.query("SELECT id FROM kyc_submissions LIMIT 1");
  return res.rows[0]?.id ?? null;
}

// ─── Seed Functions ───────────────────────────────────────────────────────────

async function seedLivenessSessions(merchantId, submissionId) {
  console.log("\n📸  liveness_sessions");
  const sessions = [
    {
      id: "ls_demo_001",
      merchant_id: merchantId,
      submission_id: submissionId,
      session_ref: "ref_passive_001",
      mode: "passive",
      decision: "real",
      liveness_score: 0.94,
      confidence_score: 0.91,
      frame_count: 3,
      device_type: "desktop",
      duration_ms: 1240,
      ip_address: "102.89.45.12",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      created_at: daysAgo(2),
    },
    {
      id: "ls_demo_002",
      merchant_id: merchantId,
      submission_id: submissionId,
      session_ref: "ref_active_001",
      mode: "active",
      challenge_type: "blink",
      decision: "real",
      liveness_score: 0.88,
      confidence_score: 0.85,
      frame_count: 5,
      device_type: "mobile",
      duration_ms: 2800,
      ip_address: "197.211.58.99",
      user_agent: "Mozilla/5.0 (Linux; Android 12; Pixel 6)",
      created_at: daysAgo(1),
    },
    {
      id: "ls_demo_003",
      merchant_id: merchantId,
      submission_id: null,
      session_ref: "ref_spoof_001",
      mode: "passive",
      decision: "spoof",
      liveness_score: 0.21,
      confidence_score: 0.78,
      spoof_type: "print_attack",
      frame_count: 3,
      device_type: "mobile",
      duration_ms: 980,
      ip_address: "41.58.112.7",
      user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)",
      created_at: daysAgo(0),
    },
  ];

  for (const s of sessions) {
    try {
      await q(
        `liveness_sessions: ${s.id} (${s.mode}/${s.decision})`,
        `INSERT INTO liveness_sessions
           (id, merchant_id, submission_id, session_ref, mode, challenge_type, decision,
            liveness_score, confidence_score, spoof_type, frame_count, device_type,
            duration_ms, ip_address, user_agent, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO NOTHING`,
        [
          s.id, s.merchant_id, s.submission_id, s.session_ref, s.mode,
          s.challenge_type ?? null, s.decision, s.liveness_score, s.confidence_score,
          s.spoof_type ?? null, s.frame_count, s.device_type, s.duration_ms,
          s.ip_address, s.user_agent, s.created_at,
        ]
      );
    } catch (err) { recordError("liveness_sessions", err); }
  }
}

async function seedKybVerifications(merchantId) {
  console.log("\n🏢  kyb_verifications + kyb_steps");
  const verifications = [
    {
      verification_id: "kyb_demo_001",
      merchant_id: merchantId,
      business_name: "Acme Payments Ltd",
      rc_number: "RC1234567",
      tax_id: "TIN-98765432",
      business_type: "limited_company",
      industry_code: "6419",
      status: "approved",
      risk_level: "low",
      initiated_by: "admin",
      started_at: daysAgo(10),
      created_at: daysAgo(10),
      updated_at: daysAgo(8),
    },
    {
      verification_id: "kyb_demo_002",
      merchant_id: merchantId,
      business_name: "QuickPay Solutions",
      rc_number: "RC9876543",
      tax_id: "TIN-12345678",
      business_type: "sole_proprietorship",
      industry_code: "6411",
      status: "pending",
      risk_level: "medium",
      initiated_by: "merchant",
      started_at: daysAgo(2),
      created_at: daysAgo(2),
      updated_at: daysAgo(1),
    },
  ];

  for (const v of verifications) {
    try {
      await q(
        `kyb_verifications: ${v.verification_id} (${v.business_name})`,
        `INSERT INTO kyb_verifications
           (verification_id, merchant_id, business_name, rc_number, tax_id, business_type,
            industry_code, status, risk_level, initiated_by, started_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (verification_id) DO NOTHING`,
        [
          v.verification_id, v.merchant_id, v.business_name, v.rc_number, v.tax_id,
          v.business_type, v.industry_code, v.status, v.risk_level, v.initiated_by,
          v.started_at, v.created_at, v.updated_at,
        ]
      );
    } catch (err) { recordError("kyb_verifications", err); }
  }

  // KYB Steps for kyb_demo_001
  const steps = [
    { id: uid(), verification_id: "kyb_demo_001", step_name: "cac_lookup", status: "completed", notes: "RC verified with CAC registry" },
    { id: uid(), verification_id: "kyb_demo_001", step_name: "tin_verification", status: "completed", notes: "TIN matched FIRS records" },
    { id: uid(), verification_id: "kyb_demo_001", step_name: "director_kyc", status: "completed", notes: "2 of 2 directors verified" },
    { id: uid(), verification_id: "kyb_demo_002", step_name: "cac_lookup", status: "pending", notes: null },
    { id: uid(), verification_id: "kyb_demo_002", step_name: "tin_verification", status: "pending", notes: null },
  ];

  for (const s of steps) {
    try {
      await q(
        `kyb_steps: ${s.step_name} for ${s.verification_id}`,
        `INSERT INTO kyb_steps (id, verification_id, step_name, status, notes, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.verification_id, s.step_name, s.status, s.notes]
      );
    } catch (err) { recordError("kyb_steps", err); }
  }
}

async function seedKeycloakEvents() {
  console.log("\n🔑  keycloak_events");
  const events = [
    { event_type: "LOGIN", user_id: "kc_user_001", ip_address: "102.89.45.12", geo_country: "NG", geo_city: "Lagos", received_at: daysAgo(0) },
    { event_type: "LOGIN", user_id: "kc_user_002", ip_address: "197.211.58.99", geo_country: "NG", geo_city: "Abuja", received_at: daysAgo(0) },
    { event_type: "LOGIN_ERROR", user_id: "kc_user_003", ip_address: "41.58.112.7", geo_country: "GH", geo_city: "Accra", error: "invalid_user_credentials", received_at: daysAgo(0) },
    { event_type: "LOGOUT", user_id: "kc_user_001", ip_address: "102.89.45.12", geo_country: "NG", geo_city: "Lagos", received_at: daysAgo(1) },
    { event_type: "LOGIN", user_id: "kc_user_004", ip_address: "8.8.8.8", geo_country: "US", geo_city: "Mountain View", geo_anomaly_acknowledged: false, received_at: daysAgo(1) },
  ];

  for (const e of events) {
    try {
      await q(
        `keycloak_events: ${e.event_type} for ${e.user_id}`,
        `INSERT INTO keycloak_events
           (event_type, user_id, ip_address, geo_country, geo_city, geo_anomaly_acknowledged, error, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          e.event_type, e.user_id, e.ip_address, e.geo_country, e.geo_city,
          e.geo_anomaly_acknowledged ?? false, e.error ?? null, e.received_at,
        ]
      );
    } catch (err) { recordError("keycloak_events", err); }
  }
}

async function seedAuditEvents(merchantId) {
  console.log("\n📋  audit_events");
  const events = [
    { actor_id: "admin_001", actor_name: "System Admin", actor_email: "admin@paygate.ng", action: "kyc.submission.approved", resource: "kyc_submission", resource_id: "kyc_sub_demo_001", metadata: { decision: "approved", score: 94 } },
    { actor_id: "admin_001", actor_name: "System Admin", actor_email: "admin@paygate.ng", action: "kyb.verification.started", resource: "kyb_verification", resource_id: "kyb_demo_002", metadata: { business_name: "QuickPay Solutions" } },
    { actor_id: "merchant_001", actor_name: "Merchant Owner", actor_email: "owner@acmepayments.ng", action: "api_key.created", resource: "api_key", resource_id: "key_demo_001", metadata: { key_type: "live" } },
    { actor_id: "system", actor_name: "Heartbeat", actor_email: null, action: "nightly_audit.completed", resource: "system", resource_id: null, metadata: { score: 100, grade: "A+", p0Failures: 0 } },
  ];

  for (const e of events) {
    try {
      await q(
        `audit_events: ${e.action}`,
        `INSERT INTO audit_events
           (merchant_id, actor_id, actor_name, actor_email, action, resource, resource_id, metadata, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [merchantId, e.actor_id, e.actor_name, e.actor_email, e.action, e.resource, e.resource_id, JSON.stringify(e.metadata)]
      );
    } catch (err) { recordError("audit_events", err); }
  }
}

async function seedPartnerOnboardingSessions(merchantId) {
  console.log("\n🤝  partner_onboarding_sessions");
  const sessions = [
    {
      id: "pos_demo_001",
      merchant_id: merchantId,
      status: "completed",
      created_at: daysAgo(14),
      updated_at: daysAgo(12),
    },
    {
      id: "pos_demo_002",
      merchant_id: merchantId,
      status: "in_progress",
      created_at: daysAgo(3),
      updated_at: daysAgo(1),
    },
  ];

  for (const s of sessions) {
    try {
      // Check column names dynamically — schema may vary
      const colCheck = await (DRY_RUN ? Promise.resolve({ rows: [] }) : pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='partner_onboarding_sessions'`
      ));
      const cols = colCheck.rows.map(r => r.column_name);
      const hasStatus = cols.includes("status") || DRY_RUN;
      const sql = hasStatus
        ? `INSERT INTO partner_onboarding_sessions (id, merchant_id, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`
        : `INSERT INTO partner_onboarding_sessions (id, merchant_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`;
      const params = hasStatus
        ? [s.id, s.merchant_id, s.status, s.created_at, s.updated_at]
        : [s.id, s.merchant_id, s.created_at, s.updated_at];
      await q(`partner_onboarding_sessions: ${s.id}`, sql, params);
    } catch (err) { recordError("partner_onboarding_sessions", err); }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌱  seed-wave170.mjs — ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE"}`);
  console.log("─".repeat(60));

  const merchantId = await getFirstMerchantId();
  const submissionId = await getFirstKycSubmissionId();

  console.log(`  Merchant ID : ${merchantId}`);
  console.log(`  Submission  : ${submissionId ?? "(none found)"}`);

  await seedLivenessSessions(merchantId, submissionId);
  await seedKybVerifications(merchantId);
  await seedKeycloakEvents();
  await seedAuditEvents(merchantId);
  await seedPartnerOnboardingSessions(merchantId);

  console.log("\n" + "─".repeat(60));
  if (errors.length === 0) {
    console.log(`✅  seed-wave170 complete${DRY_RUN ? " (dry-run)" : ""} — no errors`);
  } else {
    console.log(`⚠️  seed-wave170 complete with ${errors.length} error(s):`);
    errors.forEach(e => console.log(`   • ${e.table}: ${e.message}`));
  }

  if (!DRY_RUN) await pool.end();
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
