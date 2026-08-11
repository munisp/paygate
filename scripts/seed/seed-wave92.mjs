/**
 * seed-wave92.mjs — Sprint v92 Seed Data
 * Seeds: gold_sip_plans, consumer_loyalty_profiles, webhook_live_events,
 *        business_rules, lifecycle_workflows, background_jobs
 */
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL || process.env.PG_DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

async function seed() {
  console.log("🌱 Seeding wave92 data...");

  // Parse MySQL connection string
  const url = new URL(DB_URL);
  const conn = await createConnection({
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });

  try {
    // ─── Gold SIP Plans ─────────────────────────────────────────────────────
    console.log("  → gold_sip_plans...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS gold_sip_plans (
        id VARCHAR(36) PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        amount_ngn BIGINT NOT NULL,
        frequency ENUM('daily','weekly','monthly') DEFAULT 'monthly',
        status ENUM('active','paused','completed','cancelled') DEFAULT 'active',
        grams_accumulated DECIMAL(10,6) DEFAULT 0,
        total_invested BIGINT DEFAULT 0,
        current_value BIGINT DEFAULT 0,
        start_date DATE NOT NULL,
        next_debit_date DATE,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    const sipPlans = [
      ["sip-001", 1, "Monthly Gold Savings", 50000, "monthly", "active", 4.820000, 450000, 474870, "2025-01-01", "2026-05-01"],
      ["sip-002", 1, "Weekly Micro-Gold", 10000, "weekly", "active", 1.930000, 190000, 190105, "2025-06-01", "2026-04-28"],
      ["sip-003", 2, "Daily Gold Accumulator", 2000, "daily", "active", 0.620000, 60000, 61050, "2026-01-01", "2026-04-24"],
      ["sip-004", 3, "Quarterly Gold SIP", 150000, "monthly", "paused", 9.150000, 900000, 951750, "2024-07-01", "2026-05-01"],
    ];
    for (const plan of sipPlans) {
      await conn.execute(
        `INSERT IGNORE INTO gold_sip_plans (id, user_id, name, amount_ngn, frequency, status, grams_accumulated, total_invested, current_value, start_date, next_debit_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...plan, Date.now(), Date.now()]
      );
    }
    console.log(`    ✓ ${sipPlans.length} gold SIP plans`);

    // ─── Consumer Loyalty Profiles ───────────────────────────────────────────
    console.log("  → consumer_loyalty_profiles...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS consumer_loyalty_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        points INT DEFAULT 0,
        tier ENUM('Bronze','Silver','Gold','Platinum') DEFAULT 'Bronze',
        cashback_balance_kobo BIGINT DEFAULT 0,
        total_earned_points INT DEFAULT 0,
        total_redeemed_points INT DEFAULT 0,
        last_activity_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    const loyaltyProfiles = [
      [1, 3750, "Silver", 375000, 4250, 500],
      [2, 12500, "Platinum", 1250000, 15000, 2500],
      [3, 850, "Bronze", 85000, 1200, 350],
      [4, 5200, "Gold", 520000, 6000, 800],
      [5, 1100, "Silver", 110000, 1500, 400],
    ];
    for (const [userId, points, tier, cashback, totalEarned, totalRedeemed] of loyaltyProfiles) {
      await conn.execute(
        `INSERT IGNORE INTO consumer_loyalty_profiles (user_id, points, tier, cashback_balance_kobo, total_earned_points, total_redeemed_points, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, points, tier, cashback, totalEarned, totalRedeemed, Date.now(), Date.now(), Date.now()]
      );
    }
    console.log(`    ✓ ${loyaltyProfiles.length} consumer loyalty profiles`);

    // ─── Webhook Live Events Log ─────────────────────────────────────────────
    console.log("  → webhook_live_events...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS webhook_live_events (
        id VARCHAR(64) PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        source VARCHAR(50) NOT NULL,
        status ENUM('success','failed','pending') DEFAULT 'pending',
        payload JSON,
        latency_ms INT DEFAULT 0,
        retries INT DEFAULT 0,
        merchant_id INT,
        created_at BIGINT NOT NULL
      )
    `);

    const eventTypes = ["payment.success","payment.failed","subscription.renewed","payout.completed","dispute.opened","kyc.approved","refund.processed"];
    const sources = ["stripe","paystack","flutterwave","nibss","internal"];
    for (let i = 0; i < 20; i++) {
      const evtType = eventTypes[i % eventTypes.length];
      const src = sources[i % sources.length];
      const status = i % 7 === 0 ? "failed" : "success";
      await conn.execute(
        `INSERT IGNORE INTO webhook_live_events (id, event_type, source, status, payload, latency_ms, retries, merchant_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `evt_seed_${i.toString().padStart(3, "0")}`,
          evtType, src, status,
          JSON.stringify({ amount: (i + 1) * 5000, currency: "NGN", reference: `REF-SEED-${i}` }),
          50 + i * 30, status === "failed" ? 2 : 0, 1,
          Date.now() - i * 60000
        ]
      );
    }
    console.log("    ✓ 20 webhook live events");

    // ─── Business Rules ──────────────────────────────────────────────────────
    console.log("  → business_rules...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS business_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        rule_type ENUM('limit','threshold','approval','block','notify') NOT NULL,
        condition_json JSON NOT NULL,
        action_json JSON NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        priority INT DEFAULT 100,
        created_by INT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    const businessRules = [
      ["High Value Transaction Alert", "payments", "notify", '{"amount_ngn":{"gt":500000}}', '{"notify":["admin","compliance"],"channel":"email"}', true, 10],
      ["Daily Transaction Limit", "payments", "limit", '{"daily_count":{"gt":50}}', '{"block":true,"message":"Daily limit exceeded"}', true, 20],
      ["Suspicious IP Block", "security", "block", '{"risk_score":{"gt":80}}', '{"block":true,"flag_for_review":true}', true, 5],
      ["KYC Required for Large Transfers", "compliance", "approval", '{"amount_ngn":{"gt":1000000},"kyc_status":{"eq":"pending"}}', '{"require_kyc":true,"hold_transaction":true}', true, 15],
      ["Auto-Approve Low Risk Payouts", "payouts", "approval", '{"risk_score":{"lt":20},"amount_ngn":{"lt":100000}}', '{"auto_approve":true}', true, 50],
      ["Fraud Ring Auto-Freeze", "fraud", "block", '{"fraud_ring_score":{"gt":90}}', '{"freeze_account":true,"notify":["fraud_team"]}', true, 1],
      ["SIP Debit Retry Policy", "gold_sip", "threshold", '{"retry_count":{"lt":3},"failure_reason":{"eq":"insufficient_funds"}}', '{"retry_after_hours":24,"max_retries":3}', true, 30],
    ];
    for (const [name, category, ruleType, condition, action, isActive, priority] of businessRules) {
      await conn.execute(
        `INSERT IGNORE INTO business_rules (name, category, rule_type, condition_json, action_json, is_active, priority, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, category, ruleType, condition, action, isActive, priority, 1, Date.now(), Date.now()]
      );
    }
    console.log(`    ✓ ${businessRules.length} business rules`);

    // ─── Lifecycle Workflows ─────────────────────────────────────────────────
    console.log("  → lifecycle_workflows...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS lifecycle_workflows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        trigger_event VARCHAR(100) NOT NULL,
        steps_json JSON NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        execution_count INT DEFAULT 0,
        last_executed_at BIGINT,
        created_at BIGINT NOT NULL
      )
    `);

    const workflows = [
      ["Merchant Onboarding Flow", "merchant", "merchant.registered", '[{"step":1,"action":"send_welcome_email"},{"step":2,"action":"create_sandbox_account"},{"step":3,"action":"schedule_kyb_review"},{"step":4,"action":"assign_account_manager"}]', true, 45],
      ["Payment Dispute Resolution", "dispute", "dispute.opened", '[{"step":1,"action":"notify_merchant"},{"step":2,"action":"freeze_funds"},{"step":3,"action":"request_evidence"},{"step":4,"action":"escalate_if_no_response_48h"}]', true, 12],
      ["Subscription Renewal", "subscription", "subscription.due", '[{"step":1,"action":"attempt_charge"},{"step":2,"action":"retry_on_failure"},{"step":3,"action":"send_dunning_email"},{"step":4,"action":"cancel_after_3_failures"}]', true, 234],
      ["KYC Verification Pipeline", "user", "kyc.submitted", '[{"step":1,"action":"auto_check_bvn"},{"step":2,"action":"auto_check_nin"},{"step":3,"action":"manual_review_if_failed"},{"step":4,"action":"approve_or_reject"}]', true, 89],
      ["Payout Approval Workflow", "payout", "payout.requested", '[{"step":1,"action":"risk_score_check"},{"step":2,"action":"auto_approve_if_low_risk"},{"step":3,"action":"manual_review_if_high_risk"},{"step":4,"action":"disburse"}]', true, 156],
      ["Gold SIP Execution", "gold_sip", "sip.debit_due", '[{"step":1,"action":"check_wallet_balance"},{"step":2,"action":"debit_wallet"},{"step":3,"action":"purchase_gold"},{"step":4,"action":"update_portfolio"},{"step":5,"action":"send_confirmation"}]', true, 78],
    ];
    for (const [name, entityType, trigger, steps, isActive, execCount] of workflows) {
      await conn.execute(
        `INSERT IGNORE INTO lifecycle_workflows (name, entity_type, trigger_event, steps_json, is_active, execution_count, last_executed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, entityType, trigger, steps, isActive, execCount, Date.now() - Math.floor(Math.random() * 86400000), Date.now()]
      );
    }
    console.log(`    ✓ ${workflows.length} lifecycle workflows`);

    // ─── Background Jobs ─────────────────────────────────────────────────────
    console.log("  → background_jobs...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        job_type ENUM('cron','one_time','triggered') NOT NULL,
        cron_expression VARCHAR(100),
        status ENUM('idle','running','completed','failed') DEFAULT 'idle',
        last_run_at BIGINT,
        next_run_at BIGINT,
        run_count INT DEFAULT 0,
        error_count INT DEFAULT 0,
        last_error TEXT,
        created_at BIGINT NOT NULL
      )
    `);

    const jobs = [
      ["Settlement SLA Monitor", "cron", "*/15 * * * *", "idle", 1440, 0],
      ["Fraud Ring Auto-Freeze", "cron", "*/30 * * * *", "idle", 720, 0],
      ["SIP Debit Processor", "cron", "0 9 * * *", "idle", 90, 2],
      ["Digest Email Sender", "cron", "0 8 * * 1", "idle", 12, 0],
      ["Webhook Failure Alerts", "cron", "*/60 * * * *", "idle", 360, 1],
      ["Slow Query Logger", "cron", "*/5 * * * *", "idle", 2016, 0],
      ["USDC Balance Monitor", "cron", "*/15 * * * *", "idle", 1440, 3],
      ["Subscription Renewal Check", "cron", "0 0 * * *", "idle", 30, 0],
      ["Gold Price Sync", "cron", "*/5 * * * *", "idle", 2016, 0],
      ["KYC Expiry Check", "cron", "0 6 * * *", "idle", 90, 0],
    ];
    for (const [name, jobType, cron, status, runCount, errorCount] of jobs) {
      await conn.execute(
        `INSERT IGNORE INTO background_jobs (name, job_type, cron_expression, status, last_run_at, next_run_at, run_count, error_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, jobType, cron, status, Date.now() - 900000, Date.now() + 900000, runCount, errorCount, Date.now()]
      );
    }
    console.log(`    ✓ ${jobs.length} background jobs`);

    console.log("\n✅ Wave92 seed complete!");
    console.log("   Tables: gold_sip_plans, consumer_loyalty_profiles, webhook_live_events, business_rules, lifecycle_workflows, background_jobs");
  } finally {
    await conn.end();
  }
}

seed().catch((err) => { console.error("Seed failed:", err.message); process.exit(1); });
