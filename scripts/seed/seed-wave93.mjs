#!/usr/bin/env node
/**
 * seed-wave93.mjs — Wave 93 seed data
 * Gold SIP snapshots, fraud alert events, analytics export records
 */
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.log("[seed-wave93] No DB URL — skipping"); process.exit(0); }

async function main() {
  const conn = await createConnection(DB_URL);
  console.log("[seed-wave93] Connected");

  // Gold SIP portfolio snapshots
  await conn.execute(`INSERT IGNORE INTO gold_sip_snapshots (id, plan_id, merchant_id, snapshot_date, grams_accumulated, total_invested_ngn, current_value_ngn, gold_price_per_gram, pnl_ngn, pnl_pct, created_at) VALUES
    (9300, 1, 1, DATE_SUB(CURDATE(), INTERVAL 3 MONTH), 2.5, 125000, 138000, 55200, 13000, 10.4, NOW()),
    (9301, 1, 1, DATE_SUB(CURDATE(), INTERVAL 2 MONTH), 5.0, 250000, 278000, 55600, 28000, 11.2, NOW()),
    (9302, 1, 1, DATE_SUB(CURDATE(), INTERVAL 1 MONTH), 7.5, 375000, 420000, 56000, 45000, 12.0, NOW()),
    (9303, 1, 1, CURDATE(), 10.0, 500000, 565000, 56500, 65000, 13.0, NOW())
  `).catch(() => {});

  // Fraud alert events
  await conn.execute(`INSERT IGNORE INTO fraud_alert_events (id, merchant_id, transaction_id, alert_type, severity, risk_score, source_ip, country_code, description, status, created_at) VALUES
    (9300, 1, NULL, 'card_testing', 'high', 88, '196.207.45.12', 'NG', 'Multiple small-amount card tests detected from single IP', 'open', NOW()),
    (9301, 1, NULL, 'velocity_abuse', 'critical', 95, '41.58.120.33', 'GH', 'Unusual transaction velocity: 47 transactions in 2 minutes', 'investigating', NOW()),
    (9302, 1, NULL, 'account_takeover', 'medium', 72, '105.112.45.88', 'KE', 'Login from new device + immediate high-value transfer', 'resolved', DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (9303, 1, NULL, 'synthetic_identity', 'high', 85, '197.210.54.21', 'NG', 'BVN mismatch with provided identity documents', 'open', NOW())
  `).catch(() => {});

  // Analytics export records
  await conn.execute(`INSERT IGNORE INTO analytics_exports (id, merchant_id, export_type, date_from, date_to, file_url, file_size_bytes, row_count, status, created_at) VALUES
    (9300, 1, 'revenue', DATE_SUB(CURDATE(), INTERVAL 30 DAY), CURDATE(), 'https://cdn.paygate.ng/exports/revenue_30d.csv', 245760, 1842, 'completed', NOW()),
    (9301, 1, 'transactions', DATE_SUB(CURDATE(), INTERVAL 7 DAY), CURDATE(), 'https://cdn.paygate.ng/exports/txn_7d.csv', 98304, 523, 'completed', DATE_SUB(NOW(), INTERVAL 1 DAY)),
    (9302, 1, 'customers', DATE_SUB(CURDATE(), INTERVAL 90 DAY), CURDATE(), 'https://cdn.paygate.ng/exports/customers_90d.csv', 512000, 3201, 'completed', DATE_SUB(NOW(), INTERVAL 3 DAY))
  `).catch(() => {});

  await conn.end();
  console.log("[seed-wave93] ✓ Done");
}

main().catch(e => { console.error("[seed-wave93] Error:", e.message); process.exit(0); });
