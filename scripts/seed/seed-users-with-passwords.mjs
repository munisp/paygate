/**
 * seed-users-with-passwords.mjs
 * ================================
 * Seeds admin and demo merchant users with bcrypt-hashed passwords
 * so the email/password login on the dashboard works.
 *
 * Usage:
 *   node seed-users-with-passwords.mjs
 *
 * Credentials created:
 *   admin@paygate.ng        / Admin@PayGate2026!
 *   merchant@acme.ng        / merchant123
 *   demo@paygate.ng         / Demo@PayGate2026!
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mysql = require("./node_modules/.pnpm/mysql2@3.19.1_@types+node@24.7.0/node_modules/mysql2/promise.js");
const bcrypt = require("./node_modules/bcryptjs/index.js");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌  DATABASE_URL is not set");
  process.exit(1);
}

const BCRYPT_ROUNDS = 12;

const USERS = [
  {
    openId: "paygate-admin-default",
    email: "admin@paygate.ng",
    name: "PayGate Admin",
    role: "admin",
    password: "Admin@PayGate2026!",
    loginMethod: "email",
  },
  {
    openId: "paygate-merchant-acme",
    email: "merchant@acme.ng",
    name: "Acme Merchant",
    role: "user",
    password: "merchant123",
    loginMethod: "email",
  },
  {
    openId: "paygate-demo-default",
    email: "demo@paygate.ng",
    name: "PayGate Demo Merchant",
    role: "user",
    password: "Demo@PayGate2026!",
    loginMethod: "email",
  },
];

async function main() {
  console.log("🔌  Connecting to database…");
  const conn = await mysql.createConnection(DB_URL);

  for (const u of USERS) {
    const [existing] = await conn.execute(
      "SELECT id, passwordHash FROM users WHERE email = ? OR openId = ? LIMIT 1",
      [u.email, u.openId]
    );

    const passwordHash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);

    if (existing.length === 0) {
      // Insert new user
      await conn.execute(
        `INSERT INTO users (openId, email, name, role, loginMethod, passwordHash, createdAt, updatedAt, lastSignedIn)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [u.openId, u.email, u.name, u.role, u.loginMethod, passwordHash]
      );
      console.log(`✅  Created user: ${u.email} (role=${u.role})`);
    } else {
      // Update existing user — set/reset password hash and ensure role is correct
      await conn.execute(
        `UPDATE users SET passwordHash = ?, loginMethod = ?, role = ?, name = ?, updatedAt = NOW()
         WHERE email = ? OR openId = ?`,
        [passwordHash, u.loginMethod, u.role, u.name, u.email, u.openId]
      );
      console.log(`🔄  Updated user: ${u.email} (role=${u.role}) — password reset`);
    }
  }

  // Also seed a demo merchant record for the demo user if merchants table exists
  try {
    const [tables] = await conn.execute("SHOW TABLES LIKE 'merchants'");
    if (tables.length > 0) {
      const [demoUser] = await conn.execute(
        "SELECT id FROM users WHERE email = 'merchant@acme.ng' LIMIT 1"
      );
      if (demoUser.length > 0) {
        const userId = demoUser[0].id;
        const [existingMerchant] = await conn.execute(
          "SELECT id FROM merchants WHERE ownerId = ? LIMIT 1",
          [userId]
        );
        if (existingMerchant.length === 0) {
          await conn.execute(
            `INSERT INTO merchants (name, slug, ownerId, status, currency, country, createdAt, updatedAt)
             VALUES ('PayGate Demo Merchant', 'paygate-demo', ?, 'active', 'NGN', 'NG', NOW(), NOW())`,
            [userId]
          );
          console.log("✅  Created demo merchant record for merchant@acme.ng");
        } else {
          console.log("ℹ️   Merchant record already exists for merchant@acme.ng");
        }
      }
    }
  } catch (err) {
    console.log("ℹ️   Could not seed merchant record:", err.message);
  }

  await conn.end();
  console.log("\n🎉  User seed complete.");
  console.log("\n📋  Login credentials:");
  for (const u of USERS) {
    console.log(`   ${u.email.padEnd(28)} / ${u.password}`);
  }
}

main().catch((err) => {
  console.error("❌  Seed failed:", err.message);
  process.exit(1);
});
