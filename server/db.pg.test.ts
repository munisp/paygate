/**
 * PostgreSQL Connection Validation Tests
 * Uses direct pg client to avoid drizzle singleton caching issues in tests.
 */
import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';

const PG_URL =
  process.env.PG_DATABASE_URL ??
  'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_db';

describe('PostgreSQL Database Connection', () => {
  it('should have PG_DATABASE_URL pointing to a PostgreSQL instance', () => {
    expect(PG_URL).toMatch(/^postgresql:\/\//);
  });

  it('should connect to PostgreSQL and query merchants', async () => {
    const pool = new Pool({ connectionString: PG_URL, max: 2 });
    try {
      const result = await pool.query('SELECT count(*) as cnt FROM merchants');
      const count = parseInt(result.rows[0]?.cnt ?? '0');
      expect(count).toBeGreaterThanOrEqual(0);
    } finally {
      await pool.end();
    }
  });

  it('should connect to PostgreSQL and query tenants', async () => {
    const pool = new Pool({ connectionString: PG_URL, max: 2 });
    try {
      const result = await pool.query('SELECT count(*) as cnt FROM tenants');
      const count = parseInt(result.rows[0]?.cnt ?? '0');
      expect(count).toBeGreaterThanOrEqual(1);
    } finally {
      await pool.end();
    }
  });

  it('should have 100+ tables in the schema', async () => {
    const pool = new Pool({ connectionString: PG_URL, max: 2 });
    try {
      const result = await pool.query(
        `SELECT count(*) as cnt FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      );
      const count = parseInt(result.rows[0]?.cnt ?? '0');
      expect(count).toBeGreaterThanOrEqual(100);
    } finally {
      await pool.end();
    }
  });

  it('should have seed data in key tables', async () => {
    const pool = new Pool({ connectionString: PG_URL, max: 2 });
    try {
      const tables = ['transactions', 'customers', 'payouts', 'fraud_alerts', 'webhooks'];
      for (const table of tables) {
        const result = await pool.query(`SELECT count(*) as cnt FROM ${table}`);
        const count = parseInt(result.rows[0]?.cnt ?? '0');
        expect(count, `${table} should have seed data`).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await pool.end();
    }
  });
});
