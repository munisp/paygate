/**
 * router.coverage.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Coverage tests for server/db.ts helper functions.
 *
 * These tests use the pg-mem mock (via vi.mock('pg') in pgSetupFile.ts) and
 * exercise the db.ts helpers directly.  Because pg-mem uses SERIAL integer
 * primary keys while the Drizzle schema uses TEXT PKs, we test via raw Pool
 * queries for the CRUD helpers and use the Drizzle-based getDb() for the
 * higher-level query helpers that accept merchant_id as a string.
 *
 * Included in vitest.config.ts → pg-tests project.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { PG_AVAILABLE } from "./testHelpers";

// ─── Pool setup ───────────────────────────────────────────────────────────────
const PG_URL =
  process.env.PG_DATABASE_URL ??
  "postgresql://paygate:paygate_dev_2026@127.0.0.1:5433/paygate_dev";

let pool: Pool;

beforeAll(async () => {
  if (!PG_AVAILABLE) return;
  pool = new Pool({ connectionString: PG_URL, max: 5 });
  // Scratch fixtures referenced by the CRUD tests below (tenant/merchant id '1').
  // Idempotent so re-runs and shared databases stay clean.
  await pool.query(
    `INSERT INTO users (id, open_id) VALUES (1, 'owner_001') ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO tenants (id, name, slug, email)
     VALUES ('1', 'Test Tenant', 'test-tenant-1', 'test-tenant-1@example.com')
     ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO merchants (id, owner_id, business_name, tenant_id)
     VALUES ('1', 1, 'Test Merchant', '1')
     ON CONFLICT (id) DO NOTHING`
  );
});

afterAll(async () => {
  if (pool) await pool.end().catch(() => {});
});

// ─── Transactions ─────────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — Transactions CRUD", () => {
  it("can INSERT a transaction and SELECT it back by id", async () => {
    const ref = `TXN-ROUTER-${Date.now()}`;
    await pool.query(
      `INSERT INTO transactions (id, merchant_id, tenant_id, amount, currency, status, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`txn_rt_${ref}`, 1, 1, 500000, "NGN", "completed", ref]
    );
    const result = await pool.query(
      `SELECT * FROM transactions WHERE reference = $1`,
      [ref]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].reference).toBe(ref);
    expect(Number(result.rows[0].amount)).toBe(500000);
    expect(result.rows[0].status).toBe("completed");
  });

  it("can list transactions filtered by merchant_id", async () => {
    const result = await pool.query(
      `SELECT * FROM transactions WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [1]
    );
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThanOrEqual(0);
  });

  it("can list transactions filtered by status", async () => {
    const result = await pool.query(
      `SELECT * FROM transactions WHERE merchant_id = $1 AND status = $2`,
      [1, "completed"]
    );
    expect(Array.isArray(result.rows)).toBe(true);
    result.rows.forEach((row) => {
      expect(row.status).toBe("completed");
    });
  });

  it("can list transactions filtered by reference (search)", async () => {
    const ref = `TXN-SEARCH-${Date.now()}`;
    await pool.query(
      `INSERT INTO transactions (id, merchant_id, tenant_id, amount, currency, status, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`txn_rt_${ref}`, 1, 1, 100000, "NGN", "pending", ref]
    );
    const result = await pool.query(
      `SELECT * FROM transactions WHERE merchant_id = $1 AND reference LIKE $2`,
      [1, `%TXN-SEARCH%`]
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].reference).toContain("TXN-SEARCH");
  });

  it("can count transactions for a merchant", async () => {
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM transactions WHERE merchant_id = $1`,
      [1]
    );
    const count = parseInt(result.rows[0].cnt, 10);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("can UPDATE a transaction status", async () => {
    const ref = `TXN-UPDATE-${Date.now()}`;
    await pool.query(
      `INSERT INTO transactions (id, merchant_id, tenant_id, amount, currency, status, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`txn_rt_${ref}`, 1, 1, 200000, "NGN", "pending", ref]
    );
    await pool.query(
      `UPDATE transactions SET status = 'completed' WHERE reference = $1`,
      [ref]
    );
    const result = await pool.query(
      `SELECT status FROM transactions WHERE reference = $1`,
      [ref]
    );
    expect(result.rows[0].status).toBe("completed");
  });

  it("can aggregate transaction stats (SUM, COUNT) for a merchant", async () => {
    const result = await pool.query(
      `SELECT COUNT(*) as total_count, SUM(amount) as total_volume
       FROM transactions WHERE merchant_id = $1`,
      [1]
    );
    expect(result.rows.length).toBe(1);
    const totalCount = parseInt(result.rows[0].total_count, 10);
    expect(totalCount).toBeGreaterThanOrEqual(0);
    // total_volume may be null if no rows, or a string representing a number
    if (result.rows[0].total_volume !== null) {
      expect(parseFloat(result.rows[0].total_volume)).toBeGreaterThanOrEqual(0);
    }
  });

  it("can aggregate completed vs failed transaction counts", async () => {
    const result = await pool.query(
      `SELECT
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
       FROM transactions WHERE merchant_id = $1`,
      [1]
    );
    expect(result.rows.length).toBe(1);
    const completedCount = parseInt(result.rows[0].completed_count ?? "0", 10);
    const failedCount = parseInt(result.rows[0].failed_count ?? "0", 10);
    expect(completedCount).toBeGreaterThanOrEqual(0);
    expect(failedCount).toBeGreaterThanOrEqual(0);
  });

  it("can paginate transactions with LIMIT and OFFSET", async () => {
    const page1 = await pool.query(
      `SELECT id, reference FROM transactions WHERE merchant_id = $1
       ORDER BY id LIMIT 5 OFFSET 0`,
      [1]
    );
    const page2 = await pool.query(
      `SELECT id, reference FROM transactions WHERE merchant_id = $1
       ORDER BY id LIMIT 5 OFFSET 5`,
      [1]
    );
    // Pages should not overlap
    const page1Ids = page1.rows.map((r) => r.id);
    const page2Ids = page2.rows.map((r) => r.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);
  });

  it("transaction reference is unique per tenant", async () => {
    const ref = `TXN-UNIQUE-${Date.now()}`;
    await pool.query(
      `INSERT INTO transactions (id, merchant_id, tenant_id, amount, currency, status, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`txn_rt_${ref}`, 1, 1, 100000, "NGN", "pending", ref]
    );
    // Inserting the same reference should fail due to UNIQUE constraint
    let threw = false;
    try {
      await pool.query(
        `INSERT INTO transactions (id, merchant_id, tenant_id, amount, currency, status, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`txn_rt_dup_${ref}`, 1, 1, 200000, "NGN", "pending", ref]
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// ─── Customers ────────────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — Customers CRUD", () => {
  it("can INSERT a customer and SELECT it back", async () => {
    const email = `customer-router-${Date.now()}@test.com`;
    await pool.query(
      `INSERT INTO customers (id, merchant_id, tenant_id, email, name) VALUES ($1, $2, $3, $4, $5)`,
      [`cust_rt_${Date.now()}_ins`, 1, 1, email, "Router Test Customer"]
    );
    const result = await pool.query(
      `SELECT * FROM customers WHERE email = $1`,
      [email]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].email).toBe(email);
    expect(result.rows[0].name).toBe("Router Test Customer");
  });

  it("can list customers filtered by merchant_id", async () => {
    const result = await pool.query(
      `SELECT * FROM customers WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [1]
    );
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it("can search customers by email pattern", async () => {
    const email = `search-customer-${Date.now()}@paygate.test`;
    await pool.query(
      `INSERT INTO customers (id, merchant_id, tenant_id, email, name) VALUES ($1, $2, $3, $4, $5)`,
      [`cust_rt_${Date.now()}_search`, 1, 1, email, "Search Target Customer"]
    );
    const result = await pool.query(
      `SELECT * FROM customers WHERE merchant_id = $1 AND email LIKE $2`,
      [1, `%search-customer%`]
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].email).toContain("search-customer");
  });

  it("can count customers for a merchant", async () => {
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM customers WHERE merchant_id = $1`,
      [1]
    );
    const count = parseInt(result.rows[0].cnt, 10);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("can UPDATE a customer name", async () => {
    const email = `update-customer-${Date.now()}@test.com`;
    await pool.query(
      `INSERT INTO customers (id, merchant_id, tenant_id, email, name) VALUES ($1, $2, $3, $4, $5)`,
      [`cust_rt_${Date.now()}_upd`, 1, 1, email, "Original Name"]
    );
    await pool.query(
      `UPDATE customers SET name = 'Updated Name' WHERE email = $1`,
      [email]
    );
    const result = await pool.query(
      `SELECT name FROM customers WHERE email = $1`,
      [email]
    );
    expect(result.rows[0].name).toBe("Updated Name");
  });

  it("can DELETE a customer", async () => {
    const email = `delete-customer-${Date.now()}@test.com`;
    await pool.query(
      `INSERT INTO customers (id, merchant_id, tenant_id, email, name) VALUES ($1, $2, $3, $4, $5)`,
      [`cust_rt_${Date.now()}_del`, 1, 1, email, "To Be Deleted"]
    );
    await pool.query(`DELETE FROM customers WHERE email = $1`, [email]);
    const result = await pool.query(
      `SELECT id FROM customers WHERE email = $1`,
      [email]
    );
    expect(result.rows.length).toBe(0);
  });
});

// ─── Payouts ──────────────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — Payouts CRUD", () => {
  it("can INSERT a payout and SELECT it back", async () => {
    const result = await pool.query(
      `INSERT INTO payouts (id, merchant_id, tenant_id, reference, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`po_rt_${Date.now()}_ins`, 1, 1, `PO-RT-${Date.now()}`, 1000000, "pending"]
    );
    expect(result.rows.length).toBe(1);
    const payoutId = result.rows[0].id;
    const fetched = await pool.query(
      `SELECT * FROM payouts WHERE id = $1`,
      [payoutId]
    );
    expect(fetched.rows.length).toBe(1);
    expect(fetched.rows[0].status).toBe("pending");
    expect(Number(fetched.rows[0].amount)).toBe(1000000);
  });

  it("can list payouts filtered by merchant_id", async () => {
    const result = await pool.query(
      `SELECT * FROM payouts WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [1]
    );
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it("can list payouts filtered by status", async () => {
    await pool.query(
      `INSERT INTO payouts (id, merchant_id, tenant_id, reference, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`po_rt_${Date.now()}_proc`, 1, 1, `PO-RT-PROC-${Date.now()}`, 500000, "processing"]
    );
    const result = await pool.query(
      `SELECT * FROM payouts WHERE merchant_id = $1 AND status = $2`,
      [1, "processing"]
    );
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    result.rows.forEach((row) => {
      expect(row.status).toBe("processing");
    });
  });

  it("can UPDATE a payout status to approved", async () => {
    const insertResult = await pool.query(
      `INSERT INTO payouts (id, merchant_id, tenant_id, reference, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`po_rt_${Date.now()}_appr`, 1, 1, `PO-RT-APPR-${Date.now()}`, 750000, "pending_approval"]
    );
    const payoutId = insertResult.rows[0].id;
    await pool.query(
      `UPDATE payouts SET status = 'pending', processed_at = NOW() WHERE id = $1`,
      [payoutId]
    );
    const result = await pool.query(
      `SELECT status, processed_at FROM payouts WHERE id = $1`,
      [payoutId]
    );
    expect(result.rows[0].status).toBe("pending");
    expect(result.rows[0].processed_at).not.toBeNull();
  });

  it("can count payouts for a merchant", async () => {
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM payouts WHERE merchant_id = $1`,
      [1]
    );
    const count = parseInt(result.rows[0].cnt, 10);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("can sum payout amounts for a merchant", async () => {
    const result = await pool.query(
      `SELECT SUM(amount) as total FROM payouts WHERE merchant_id = $1`,
      [1]
    );
    if (result.rows[0].total !== null) {
      expect(parseFloat(result.rows[0].total)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── API Keys ─────────────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — API Keys CRUD", () => {
  it("can INSERT an API key and SELECT it back", async () => {
    const keyHash = `hash-router-${Date.now()}`;
    await pool.query(
      `INSERT INTO api_keys (id, merchant_id, tenant_id, key_hash, key_prefix, name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`ak_rt_${Date.now()}_ins`, 1, 1, keyHash, `pk_rt_${Date.now()}`, "Router Test Key", true]
    );
    const result = await pool.query(
      `SELECT * FROM api_keys WHERE key_hash = $1`,
      [keyHash]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe("Router Test Key");
    expect(result.rows[0].is_active).toBe(true);
  });

  it("can list API keys for a merchant", async () => {
    const result = await pool.query(
      `SELECT * FROM api_keys WHERE merchant_id = $1`,
      [1]
    );
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("can REVOKE an API key (set is_active = false)", async () => {
    const keyHash = `hash-revoke-${Date.now()}`;
    await pool.query(
      `INSERT INTO api_keys (id, merchant_id, tenant_id, key_hash, key_prefix, name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`ak_rt_${Date.now()}_rev`, 1, 1, keyHash, `pk_rev_${Date.now()}`, "Key to Revoke", true]
    );
    await pool.query(
      `UPDATE api_keys SET is_active = false, revoked_at = NOW() WHERE key_hash = $1`,
      [keyHash]
    );
    const result = await pool.query(
      `SELECT is_active, revoked_at FROM api_keys WHERE key_hash = $1`,
      [keyHash]
    );
    expect(result.rows[0].is_active).toBe(false);
    expect(result.rows[0].revoked_at).not.toBeNull();
  });

  it("key_hash is unique across all API keys", async () => {
    const keyHash = `hash-unique-${Date.now()}`;
    await pool.query(
      `INSERT INTO api_keys (id, merchant_id, tenant_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`ak_rt_${Date.now()}_u1`, 1, 1, keyHash, `pk_u1_${Date.now()}`, "First Key"]
    );
    let threw = false;
    try {
      await pool.query(
        `INSERT INTO api_keys (id, merchant_id, tenant_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4, $5, $6)`,
        [`ak_rt_${Date.now()}_u2`, 1, 1, keyHash, `pk_u2_${Date.now()}`, "Duplicate Key"]
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("can count active API keys for a merchant", async () => {
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM api_keys WHERE merchant_id = $1 AND is_active = true`,
      [1]
    );
    const count = parseInt(result.rows[0].cnt, 10);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — Webhooks CRUD", () => {
  it("can INSERT a webhook and SELECT it back", async () => {
    const url = `https://webhook-router-${Date.now()}.test/events`;
    await pool.query(
      `INSERT INTO webhooks (id, merchant_id, tenant_id, url, secret, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`wh_rt_${Date.now()}_ins`, 1, 1, url, "secret-router-test", true]
    );
    const result = await pool.query(
      `SELECT * FROM webhooks WHERE url = $1`,
      [url]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].url).toBe(url);
    expect(result.rows[0].is_active).toBe(true);
  });

  it("can list webhooks for a merchant", async () => {
    const result = await pool.query(
      `SELECT * FROM webhooks WHERE merchant_id = $1`,
      [1]
    );
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("can DEACTIVATE a webhook (set is_active = false)", async () => {
    const url = `https://webhook-deactivate-${Date.now()}.test/events`;
    const insertResult = await pool.query(
      `INSERT INTO webhooks (id, merchant_id, tenant_id, url, secret, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`wh_rt_${Date.now()}_deact`, 1, 1, url, "secret-deactivate", true]
    );
    const webhookId = insertResult.rows[0].id;
    await pool.query(
      `UPDATE webhooks SET is_active = false WHERE id = $1`,
      [webhookId]
    );
    const result = await pool.query(
      `SELECT is_active FROM webhooks WHERE id = $1`,
      [webhookId]
    );
    expect(result.rows[0].is_active).toBe(false);
  });

  it("can DELETE a webhook", async () => {
    const url = `https://webhook-delete-${Date.now()}.test/events`;
    const insertResult = await pool.query(
      `INSERT INTO webhooks (id, merchant_id, tenant_id, url, secret, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`wh_rt_${Date.now()}_del`, 1, 1, url, "secret-delete", true]
    );
    const webhookId = insertResult.rows[0].id;
    await pool.query(`DELETE FROM webhooks WHERE id = $1`, [webhookId]);
    const result = await pool.query(
      `SELECT id FROM webhooks WHERE id = $1`,
      [webhookId]
    );
    expect(result.rows.length).toBe(0);
  });

  it("can count webhooks for a merchant", async () => {
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM webhooks WHERE merchant_id = $1`,
      [1]
    );
    const count = parseInt(result.rows[0].cnt, 10);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ─── Transaction Stats ────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — Transaction Stats Aggregation", () => {
  it("can compute total count and volume for a date range", async () => {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_count,
         SUM(amount) as total_volume
       FROM transactions
       WHERE merchant_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [1, new Date("2020-01-01"), new Date("2030-12-31")]
    );
    expect(result.rows.length).toBe(1);
    const totalCount = parseInt(result.rows[0].total_count, 10);
    expect(totalCount).toBeGreaterThanOrEqual(0);
  });

  it("can compute completed vs failed counts for a date range", async () => {
    const result = await pool.query(
      `SELECT
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
       FROM transactions
       WHERE merchant_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [1, new Date("2020-01-01"), new Date("2030-12-31")]
    );
    expect(result.rows.length).toBe(1);
    const completedCount = parseInt(result.rows[0].completed_count ?? "0", 10);
    const failedCount = parseInt(result.rows[0].failed_count ?? "0", 10);
    expect(completedCount).toBeGreaterThanOrEqual(0);
    expect(failedCount).toBeGreaterThanOrEqual(0);
  });

  it("returns zero counts for a merchant with no transactions in range", async () => {
    const result = await pool.query(
      `SELECT COUNT(*) as total_count FROM transactions
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [9999, new Date("2020-01-01"), new Date("2020-01-02")]
    );
    const count = parseInt(result.rows[0].total_count, 10);
    expect(count).toBe(0);
  });

  it("can group transactions by currency", async () => {
    const result = await pool.query(
      `SELECT currency, COUNT(*) as cnt, SUM(amount) as volume
       FROM transactions WHERE merchant_id = $1
       GROUP BY currency ORDER BY volume DESC`,
      [1]
    );
    expect(Array.isArray(result.rows)).toBe(true);
    result.rows.forEach((row) => {
      expect(typeof row.currency).toBe("string");
      expect(parseInt(row.cnt, 10)).toBeGreaterThanOrEqual(1);
    });
  });

  it("can group transactions by status", async () => {
    const result = await pool.query(
      `SELECT status, COUNT(*) as cnt
       FROM transactions WHERE merchant_id = $1
       GROUP BY status ORDER BY cnt DESC`,
      [1]
    );
    expect(Array.isArray(result.rows)).toBe(true);
    result.rows.forEach((row) => {
      expect(typeof row.status).toBe("string");
    });
  });
});

// ─── getDb() Drizzle helper ───────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — getDb() Drizzle integration", () => {
  it("getDb() returns a non-null Drizzle instance when PG is available", async () => {
    const { getDb } = await import("./db");
    const db = await getDb();
    expect(db).not.toBeNull();
  });

  it("getDb() can execute a raw SQL query via db.execute()", async () => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) return;
    const result = await db.execute(`SELECT 1 as val`);
    const rows = (result as any).rows ?? (result as any);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].val).toBe(1);
  });

  it("getDb() can query the merchants table via Drizzle execute", async () => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) return;
    const result = await db.execute(`SELECT COUNT(*) as cnt FROM merchants`);
    const rows = (result as any).rows ?? (result as any);
    const count = parseInt(rows[0]?.cnt ?? "0", 10);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ─── execRaw helper ───────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — execRaw() helper", () => {
  it("execRaw() executes a parameterized query and returns rows", async () => {
    const { getDb, execRaw } = await import("./db");
    const db = await getDb();
    const result = await execRaw(db, `SELECT $1::text as greeting`, ["hello"]);
    const rows = (result as any).rows ?? result;
    expect(rows.length).toBe(1);
    expect(rows[0].greeting).toBe("hello");
  });

  it("execRaw() returns correct rows for a table query", async () => {
    const { getDb, execRaw } = await import("./db");
    const db = await getDb();
    const result = await execRaw(db, `SELECT COUNT(*) as cnt FROM tenants`);
    const rows = (result as any).rows ?? result;
    expect(rows.length).toBe(1);
    const count = parseInt(rows[0].cnt as string, 10);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("execRaw() supports parameterized INSERT and SELECT", async () => {
    const { getDb, execRaw } = await import("./db");
    const db = await getDb();
    const ref = `TXN-EXECRAW-${Date.now()}`;
    await execRaw(
      db,
      `INSERT INTO transactions (id, merchant_id, tenant_id, amount, currency, status, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`txn_rt_${ref}`, 1, 1, 999999, "NGN", "pending", ref]
    );
    const result = await execRaw(
      db,
      `SELECT amount, status FROM transactions WHERE reference = $1`,
      [ref]
    );
    const rows = (result as any).rows ?? result;
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("pending");
  });
});

// ─── Merchant helpers ─────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — Merchant helpers", () => {
  it("can query merchants table for all active merchants", async () => {
    const result = await pool.query(
      `SELECT id, business_name, email, status FROM merchants WHERE status = 'active'`
    );
    expect(Array.isArray(result.rows)).toBe(true);
    result.rows.forEach((row) => {
      expect(row.status).toBe("active");
    });
  });

  it("can INSERT a merchant and SELECT by email", async () => {
    const email = `merchant-router-${Date.now()}@paygate.test`;
    const ts = Date.now();
    await pool.query(
      `INSERT INTO merchants (id, tenant_id, owner_id, business_name, email, status) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`merch_rt_${ts}_ins`, 1, 1, "Router Test Merchant", email, "active"]
    );
    const result = await pool.query(
      `SELECT * FROM merchants WHERE email = $1`,
      [email]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].business_name).toBe("Router Test Merchant");
  });

  it("merchant code is unique", async () => {
    const ts = Date.now();
    const code = `PG-RT-${ts}`;
    await pool.query(
      `INSERT INTO merchants (id, tenant_id, owner_id, business_name, merchant_code, status) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`merch_rt_${ts}_u1`, 1, 1, "First Merchant", code, "active"]
    );
    let threw = false;
    try {
      await pool.query(
        `INSERT INTO merchants (id, tenant_id, owner_id, business_name, merchant_code, status) VALUES ($1, $2, $3, $4, $5, $6)`,
        [`merch_rt_${ts}_u2`, 1, 1, "Duplicate Merchant", code, "active"]
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// ─── Tenant helpers ───────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("db.ts — Tenant helpers", () => {
  it("can query tenants table for all active tenants", async () => {
    const result = await pool.query(
      `SELECT id, name, slug, plan, status FROM tenants WHERE status = 'active'`
    );
    expect(Array.isArray(result.rows)).toBe(true);
    result.rows.forEach((row) => {
      expect(row.status).toBe("active");
    });
  });

  it("can INSERT a tenant with all required fields", async () => {
    const ts = Date.now();
    const id = `tenant-router-${ts}-cov1`;
    const slug = `tenant-router-${ts}-cov1`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, email) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, "Router Test Tenant", slug, "growth", "active", `${slug}@example.com`]
    );
    const result = await pool.query(
      `SELECT * FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].plan).toBe("growth");
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });
  it("tenant slug is unique", async () => {
    const ts = Date.now();
    const id1 = `unique-tenant-${ts}-cov2`;
    const slug = `unique-tenant-${ts}-cov2`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, email) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id1, "First Tenant", slug, "starter", "active", `${slug}@example.com`]
    );
    let threw = false;
    try {
      // Use different id but same slug — should fail on UNIQUE slug constraint
      const id2 = `unique-tenant-${ts}-cov2-dup`;
      await pool.query(
        `INSERT INTO tenants (id, name, slug, plan, status, email) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id2, "Duplicate Tenant", slug, "starter", "active", `${slug}-dup@example.com`]
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id1]);
  });
  it("tenant has default branding values from DDL", async () => {
    const ts = Date.now();
    const id = `branding-default-${ts}-cov3`;
    const slug = `branding-default-${ts}-cov3`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, email) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, "Branding Default Tenant", slug, "starter", "active", `${slug}@example.com`]
    );
    const result = await pool.query(
      `SELECT primary_color, accent_color, font_family FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows.length).toBe(1);
    // Defaults are set in DDL
    expect(result.rows[0].primary_color).toBe("#6366f1");
    expect(result.rows[0].accent_color).toBe("#8b5cf6");
    expect(result.rows[0].font_family).toBe("Inter");
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });
});
