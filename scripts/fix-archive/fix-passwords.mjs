/**
 * fix-passwords.mjs
 * Safely updates admin/merchant/demo user passwords using parameterized queries
 * to avoid shell $ interpolation issues.
 */
import bcrypt from "bcryptjs";
import pg from "pg";

const { Client } = pg;

// Dev-only fix script: the fallback below targets the LOCAL embedded dev PG
// (127.0.0.1) only. For any non-localhost database set PG_DATABASE_URL explicitly.
const DB_URL = process.env.PG_DATABASE_URL ?? "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev";

// Dev/demo passwords for local development users only. Override via env to avoid
// writing well-known passwords (e.g. PAYGATE_ADMIN_PASSWORD=... node fix-passwords.mjs).
const USERS = [
  { email: "admin@paygate.ng",    password: process.env.PAYGATE_ADMIN_PASSWORD ?? "admin123",       name: "PayGate Admin",    role: "admin" },
  { email: "merchant@acme.ng",    password: process.env.PAYGATE_MERCHANT_PASSWORD ?? "merchant123", name: "Acme Merchant",    role: "user" },
  { email: "demo@paygate.ng",     password: process.env.PAYGATE_DEMO_PASSWORD ?? "demo123",         name: "Demo User",        role: "user" },
];

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log("Connected to PostgreSQL");

  for (const u of USERS) {
    // Generate a fresh bcrypt hash (cost 12)
    const hash = await bcrypt.hash(u.password, 12);
    console.log(`\n[${u.email}]`);
    console.log(`  Hash length: ${hash.length}, starts with: ${hash.substring(0, 10)}`);

    // Verify the hash before writing
    const ok = await bcrypt.compare(u.password, hash);
    if (!ok) throw new Error(`Hash verification failed for ${u.email}!`);
    console.log(`  Pre-write verify: ✓`);

    // Use parameterized query — no shell interpolation risk
    const res = await client.query(
      `UPDATE users SET password_hash = $1, login_method = 'email' WHERE email = $2 RETURNING id, email, role`,
      [hash, u.email]
    );

    if (res.rowCount === 0) {
      // User doesn't exist — insert them
      const insertRes = await client.query(
        `INSERT INTO users (open_id, email, name, role, login_method, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'email', $5, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET password_hash = $5, login_method = 'email'
         RETURNING id, email, role`,
        [`local-${u.email}`, u.email, u.name, u.role, hash]
      );
      console.log(`  Inserted:`, insertRes.rows[0]);
    } else {
      console.log(`  Updated:`, res.rows[0]);
    }

    // Post-write verify — read back and check
    const readBack = await client.query(
      `SELECT LENGTH(password_hash) as len, LEFT(password_hash, 10) as prefix FROM users WHERE email = $1`,
      [u.email]
    );
    const row = readBack.rows[0];
    console.log(`  DB hash length: ${row.len}, prefix: ${row.prefix}`);
    if (row.len !== 60) {
      throw new Error(`Hash was corrupted in DB! Length is ${row.len}, expected 60`);
    }
    console.log(`  DB write verified ✓`);
  }

  await client.end();
  console.log("\n✅ All passwords updated successfully");
  console.log("\nLogin credentials:");
  for (const u of USERS) {
    console.log(`  ${u.email} / ${u.password}`);
  }
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
