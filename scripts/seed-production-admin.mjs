/**
 * PayGate Production Admin Seeder
 * ================================
 * Run ONCE against a fresh production database to create the first super-admin
 * and seed essential platform configuration.
 *
 * Usage:
 *   DATABASE_URL="mysql://user:pass@host:3306/paygate" \
 *   ADMIN_EMAIL="admin@yourcompany.com" \
 *   ADMIN_NAME="Platform Admin" \
 *   node scripts/seed-production-admin.mjs
 *
 * Requirements:
 *   - DATABASE_URL must point to the production MySQL/TiDB instance
 *   - Run `pnpm db:push` first to ensure all tables exist
 *   - This script is idempotent: re-running it will skip existing records
 */

import mysql from "mysql2/promise";
import crypto from "crypto";

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME } = process.env;

if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is required");
  process.exit(1);
}
if (!ADMIN_EMAIL) {
  console.error("❌  ADMIN_EMAIL is required");
  process.exit(1);
}

const adminName = ADMIN_NAME || "Platform Admin";

async function main() {
  console.log("🔌  Connecting to database…");
  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    // ── 1. Check if admin already exists ────────────────────────────────────
    const [existing] = await conn.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [ADMIN_EMAIL]
    );
    if (existing.length > 0) {
      console.log(`ℹ️   Admin user ${ADMIN_EMAIL} already exists — skipping.`);
      return;
    }

    // ── 2. Create admin user ─────────────────────────────────────────────────
    const userId = crypto.randomUUID();
    const now = Date.now();

    await conn.execute(
      `INSERT INTO users (id, email, name, role, open_id, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', ?, ?, ?)`,
      [userId, ADMIN_EMAIL, adminName, `admin_${userId}`, now, now]
    );
    console.log(`✅  Created admin user: ${adminName} <${ADMIN_EMAIL}>`);

    // ── 3. Seed platform configuration defaults ──────────────────────────────
    const configRows = [
      ["platform.name", "PayGate", "string"],
      ["platform.currency", "NGN", "string"],
      ["platform.timezone", "Africa/Lagos", "string"],
      ["platform.transaction_fee_pct", "1.5", "number"],
      ["platform.max_daily_transfer_ngn", "5000000", "number"],
      ["platform.kyc_required", "true", "boolean"],
      ["platform.maintenance_mode", "false", "boolean"],
    ];

    for (const [key, value, type] of configRows) {
      const [cfgExisting] = await conn.execute(
        "SELECT id FROM platform_config WHERE config_key = ? LIMIT 1",
        [key]
      ).catch(() => [[]]); // table may not exist yet — skip gracefully

      if (cfgExisting.length === 0) {
        await conn.execute(
          `INSERT INTO platform_config (config_key, config_value, value_type, updated_at)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
          [key, value, type, now]
        ).catch(err => {
          // platform_config table may not exist — log and continue
          if (err.code !== "ER_NO_SUCH_TABLE") throw err;
          console.warn(`⚠️   platform_config table not found — skipping config seed`);
        });
      }
    }
    console.log("✅  Platform configuration defaults seeded");

    // ── 4. Summary ───────────────────────────────────────────────────────────
    console.log("\n🎉  Production seed complete!");
    console.log("─────────────────────────────────────────────");
    console.log(`  Admin email : ${ADMIN_EMAIL}`);
    console.log(`  Admin name  : ${adminName}`);
    console.log(`  User ID     : ${userId}`);
    console.log("─────────────────────────────────────────────");
    console.log("\nNext steps:");
    console.log("  1. Log in to the admin portal with your Manus OAuth account");
    console.log("  2. Promote your account to admin via the Database panel:");
    console.log(`     UPDATE users SET role = 'admin' WHERE email = '${ADMIN_EMAIL}';`);
    console.log("  3. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Settings → Secrets");
    console.log("  4. Click Publish in the Management UI to go live\n");

  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("❌  Seed failed:", err.message);
  process.exit(1);
});
