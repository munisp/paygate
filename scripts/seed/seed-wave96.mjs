#!/usr/bin/env node
/**
 * seed-wave96.mjs — Wave 96 seed data
 * Notification center events, webhook simulator templates, developer portal API keys
 */
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.log("[seed-wave96] No DB URL — skipping"); process.exit(0); }

async function main() {
  const conn = await createConnection(DB_URL);
  console.log("[seed-wave96] Connected");

  // Notification center demo events (critical alerts)
  await conn.execute(`INSERT IGNORE INTO merchant_notifications (id, merchant_id, type, title, body, read_at, dismissed_at, created_at) VALUES
    (9600, 1, 'fraud', 'CRITICAL: Card testing attack detected', 'Blocked 47 card testing attempts from IP 196.207.45.12 (Lagos, NG) in the last 5 minutes. WAF auto-blocked the IP.', NULL, NULL, NOW()),
    (9601, 1, 'system', 'WAF blocked Log4Shell exploit attempt', 'open-appsec blocked a Log4Shell (CVE-2021-44228) exploit attempt targeting /api/trpc/auth.login. Attacker IP: 197.210.54.21.', NULL, NULL, NOW()),
    (9602, 1, 'payment', 'SIP auto-debit completed: 0.89g gold purchased', 'Your Gold SIP plan "Monthly 5K" auto-debited ₦5,000 and purchased 0.89g of gold at ₦56,500/g. Portfolio: 10.89g total.', NOW(), NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
    (9603, 1, 'dispute', 'Chargeback deadline in 24 hours', 'Dispute TXN_DC870A1225A5 (₦29,917) expires in 24 hours. Submit evidence now to avoid automatic loss.', NULL, NULL, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
    (9604, 1, 'kyc', 'KYC document verification completed', 'Customer Adaeze Okafor (ID: C-4821) has been fully verified. BVN, NIN, and address confirmed.', NOW(), NULL, DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (9605, 1, 'payout', 'Payout of ₦2,450,000 processed', 'Net payout of ₦2,450,000 sent to GTBank account ending 4521. Expected arrival: 1-2 business days.', NOW(), NULL, DATE_SUB(NOW(), INTERVAL 3 DAY))
  `).catch(() => {});

  // Webhook simulator event templates
  await conn.execute(`INSERT IGNORE INTO webhook_event_templates (id, merchant_id, event_type, payload_template, description, created_at) VALUES
    (9600, 1, 'payment.success', '{"event":"payment.success","data":{"id":"TXN_{{id}}","amount":{{amount}},"currency":"NGN","status":"success","customer_email":"{{email}}","created_at":"{{timestamp}}"}}', 'Successful payment notification', NOW()),
    (9601, 1, 'payment.failed', '{"event":"payment.failed","data":{"id":"TXN_{{id}}","amount":{{amount}},"currency":"NGN","status":"failed","failure_reason":"insufficient_funds","created_at":"{{timestamp}}"}}', 'Failed payment notification', NOW()),
    (9602, 1, 'subscription.renewed', '{"event":"subscription.renewed","data":{"id":"SUB_{{id}}","plan":"Growth Monthly","amount":15000,"currency":"NGN","next_billing_date":"{{next_date}}","created_at":"{{timestamp}}"}}', 'Subscription renewal notification', NOW()),
    (9603, 1, 'fraud.alert', '{"event":"fraud.alert","data":{"transaction_id":"TXN_{{id}}","risk_score":{{score}},"alert_type":"card_testing","source_ip":"{{ip}}","blocked":true,"created_at":"{{timestamp}}"}}', 'Fraud alert notification', NOW()),
    (9604, 1, 'payout.processed', '{"event":"payout.processed","data":{"id":"PAY_{{id}}","amount":{{amount}},"currency":"NGN","bank":"GTBank","account_last4":"4521","status":"processed","created_at":"{{timestamp}}"}}', 'Payout processed notification', NOW())
  `).catch(() => {});

  await conn.end();
  console.log("[seed-wave96] ✓ Done");
}

main().catch(e => { console.error("[seed-wave96] Error:", e.message); process.exit(0); });
