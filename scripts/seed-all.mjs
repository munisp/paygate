#!/usr/bin/env node
/**
 * seed-all.mjs — Master seed orchestrator for PayGate platform
 * Runs all seed scripts in dependency order.
 * Usage: node scripts/seed-all.mjs
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(script, label) {
  console.log(`\n[seed-all] ▶ ${label}`);
  try {
    execSync(`npx tsx ${script}`, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development" },
    });
    console.log(`[seed-all] ✓ ${label} complete`);
  } catch (err) {
    console.error(`[seed-all] ✗ ${label} failed:`, err.message);
    // Non-fatal: continue with remaining seeds
  }
}

const seeds = [
  ["scripts/seed-pg-bootstrap.mjs", "Bootstrap (users, merchants, roles)"],
  ["scripts/seed-pg-production.mjs", "Production data (transactions, settlements)"],
  ["scripts/seed-production-admin.mjs", "Admin users & permissions"],
  ["scripts/seed-wave24.mjs", "Wave 24 (KYC, disputes, fraud)"],
  ["scripts/seed-wave25.mjs", "Wave 25 (payouts, virtual cards)"],
  ["scripts/seed-wave30.mjs", "Wave 30 (PTSP, POS terminals)"],
  ["scripts/seed-wave32.mjs", "Wave 32 (BNPL, loyalty, carbon)"],
  ["scripts/seed-wave34.mjs", "Wave 34 (agent banking, USSD)"],
  ["scripts/seed-wave38.mjs", "Wave 38 (FX, remittance, ISO20022)"],
  ["scripts/seed-ai-tables.mjs", "AI/ML tables (embeddings, insights)"],
  ["scripts/seed-complete-all-tables.mjs", "Complete all remaining tables"],
];

console.log("[seed-all] Starting PayGate platform seed...");
console.log(`[seed-all] Running ${seeds.length} seed scripts`);

for (const [script, label] of seeds) {
  run(script, label);
}

console.log("\n[seed-all] ✓ All seeds complete!");
