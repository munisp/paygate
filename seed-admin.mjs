/**
 * seed-admin.mjs — Wave 80
 * Seeds a default admin user and platform config.
 * Run: node seed-admin.mjs
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const mysql = require("./node_modules/.pnpm/mysql2@3.19.1_@types+node@24.7.0/node_modules/mysql2/promise.js");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DB_URL);

// ── 1. Upsert default admin user ─────────────────────────────────────────────
// users table: id(int auto), openId(varchar), name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn, merchantId
const adminEmail = "admin@paygate.ng";
const adminName = "PayGate Admin";
const adminOpenId = "paygate-admin-default";

const [existing] = await conn.execute(
  "SELECT id FROM users WHERE email = ? OR openId = ?",
  [adminEmail, adminOpenId]
);

if (existing.length === 0) {
  await conn.execute(
    `INSERT INTO users (openId, email, name, role, loginMethod, createdAt, updatedAt, lastSignedIn)
     VALUES (?, ?, ?, 'admin', 'system', NOW(), NOW(), NOW())`,
    [adminOpenId, adminEmail, adminName]
  );
  console.log(`✅ Admin user created: ${adminEmail}`);
} else {
  const existingId = existing[0].id;
  await conn.execute(
    "UPDATE users SET role = 'admin', updatedAt = NOW() WHERE id = ?",
    [existingId]
  );
  console.log(`✅ Admin role confirmed for existing user: ${adminEmail} (id=${existingId})`);
}

// ── 2. Seed platform config (Stripe price IDs + Ollama defaults) ─────────────
try {
  const [tables] = await conn.execute("SHOW TABLES LIKE 'platform_config'");
  if (tables.length > 0) {
    const configs = [
      { key: "STRIPE_PORTAL_STARTER_PRICE_ID",   value: "price_1QxStarterTestPayGate2026",    description: "Starter Monthly (₦15,000/mo)" },
      { key: "STRIPE_PORTAL_GROWTH_PRICE_ID",     value: "price_1QxGrowthTestPayGate2026",     description: "Growth Monthly (₦45,000/mo)" },
      { key: "STRIPE_PORTAL_ENTERPRISE_PRICE_ID", value: "price_1QxEnterpriseTestPayGate2026", description: "Enterprise Monthly (₦150,000/mo)" },
      { key: "OLLAMA_DEFAULT_MODEL",              value: "llama3.2",                           description: "Default Ollama LLM model" },
      { key: "OLLAMA_BASE_URL",                   value: "http://ollama:11434",                description: "Ollama service base URL" },
    ];
    for (const { key, value, description } of configs) {
      await conn.execute(
        `INSERT INTO platform_config (\`key\`, \`value\`, description, updatedAt)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updatedAt = NOW()`,
        [key, value, description]
      );
      console.log(`✅ Config set: ${key} = ${value}`);
    }
  } else {
    console.log("ℹ️  platform_config table not found; config is set via env defaults in env.ts");
  }
} catch (err) {
  console.log("ℹ️  Could not write config to DB:", err.message);
}

await conn.end();
console.log("\n🎉 Admin seed complete.");
