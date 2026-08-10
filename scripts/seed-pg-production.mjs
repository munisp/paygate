#!/usr/bin/env node
/**
 * PayGate Merchant Portal — PostgreSQL Production Seed Script
 *
 * Runs the full seed pipeline in order:
 *   1. seed-pg-bootstrap.mjs  — tenants, users, merchants, customers
 *   2. seed-pg-all-tables.mjs — all 167 tables with realistic data
 *
 * Usage:
 *   node scripts/seed-pg-production.mjs
 *   PG_DATABASE_URL=postgresql://... node scripts/seed-pg-production.mjs
 */
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = { ...process.env };

console.log('🌱 PayGate PostgreSQL Production Seed Pipeline');
console.log('================================================');

function run(script, label) {
  console.log(`\n▶ ${label}...`);
  try {
    execSync(`node ${script}`, { env, stdio: 'inherit' });
    console.log(`✅ ${label} complete`);
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message);
    process.exit(1);
  }
}

run(join(__dirname, 'seed-pg-bootstrap.mjs'), 'Bootstrap (tenants, users, merchants)');
run(join(__dirname, 'seed-pg-all-tables.mjs'), 'All tables (167 tables)');

console.log('\n✅ Full seed pipeline complete!');
