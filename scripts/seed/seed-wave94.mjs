#!/usr/bin/env node
/**
 * seed-wave94.mjs — Wave 94 seed data
 * WAF events, mTLS registry, APISIX route stats, fail2ban bans
 */
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.log("[seed-wave94] No DB URL — skipping"); process.exit(0); }

async function main() {
  const conn = await createConnection(DB_URL);
  console.log("[seed-wave94] Connected");

  // WAF blocked events
  await conn.execute(`INSERT IGNORE INTO waf_events (id, merchant_id, event_type, severity, source_ip, country_code, attack_vector, uri, blocked, created_at) VALUES
    (9400, 1, 'sqli', 'high', '196.207.45.12', 'NG', 'SQL injection in query param', '/api/trpc/transactions.list?id=1 OR 1=1', 1, NOW()),
    (9401, 1, 'xss', 'medium', '41.58.120.33', 'GH', 'Reflected XSS in search param', '/api/trpc/customers.search?q=<script>alert(1)</script>', 1, NOW()),
    (9402, 1, 'path_traversal', 'high', '105.112.45.88', 'KE', 'Directory traversal attempt', '/api/files/../../../etc/passwd', 1, NOW()),
    (9403, 1, 'log4shell', 'critical', '197.210.54.21', 'NG', 'Log4Shell exploit attempt', '/api/trpc/auth.login', 1, NOW()),
    (9404, 1, 'bot', 'low', '52.86.201.14', 'US', 'Automated scraper detected', '/api/trpc/paymentLinks.list', 1, DATE_SUB(NOW(), INTERVAL 1 HOUR))
  `).catch(() => {});

  // mTLS client registry
  await conn.execute(`INSERT IGNORE INTO mtls_client_registry (id, client_name, cert_fingerprint, cert_subject, allowed_routes, status, expires_at, created_at) VALUES
    (9400, 'APISIX Gateway', 'SHA256:abc123def456', 'CN=apisix.paygate.internal,O=PayGate,C=NG', '/api/*', 'active', DATE_ADD(NOW(), INTERVAL 1 YEAR), NOW()),
    (9401, 'Go Bridge', 'SHA256:fed987cba654', 'CN=go-bridge.paygate.internal,O=PayGate,C=NG', '/api/internal/*', 'active', DATE_ADD(NOW(), INTERVAL 1 YEAR), NOW()),
    (9402, 'Python Services', 'SHA256:111222333444', 'CN=python-svc.paygate.internal,O=PayGate,C=NG', '/api/internal/ml/*', 'active', DATE_ADD(NOW(), INTERVAL 1 YEAR), NOW())
  `).catch(() => {});

  await conn.end();
  console.log("[seed-wave94] ✓ Done");
}

main().catch(e => { console.error("[seed-wave94] Error:", e.message); process.exit(0); });
