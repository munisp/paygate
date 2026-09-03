/**
 * seed-wave102.mjs — Production seed data for Wave 102 orphaned tables
 * Tables: loyalty_ledger, carbon_credits, escrow_contracts, carbon_credits_v2,
 *         escrow_contracts_v2, loyalty_v3_programs, loyalty_v3_members
 *
 * Usage: node seed-wave102.mjs
 *        pnpm seed:wave102
 */
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

// TLS: DB certificate verification is ON by default (secure). Set
// SEED_TLS_INSECURE=true to disable verification for self-signed dev DBs only.
const SEED_TLS_INSECURE = process.env.SEED_TLS_INSECURE === 'true';
if (SEED_TLS_INSECURE) console.warn('⚠️  SEED_TLS_INSECURE=true — DB TLS certificate verification DISABLED (dev only)');
const SEED_SSL = SEED_TLS_INSECURE ? { rejectUnauthorized: false } : true;

const DB_URL = process.env.DATABASE_URL || process.env.PG_DATABASE_URL;
if (!DB_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: SEED_SSL,
});

console.log("✅ Connected to PostgreSQL database\n");

// ─── Helper ──────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 8);
}
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000);
}
function daysFromNow(n) {
  return new Date(Date.now() + n * 86400000);
}

// ─── 1. Loyalty Ledger ───────────────────────────────────────────────────────
// Columns: id, account_id, entry_type, points, balance_after, description,
//          reference_id, created_at
console.log("[1/7] Seeding loyalty_ledger...");
const loyaltyRows = [
  { id: uid(), account_id: "acc_cust_001", entry_type: "earn", points: 1250, balance_after: 1250, description: "Purchase reward — order ORD-001", reference_id: "txn_aaa001" },
  { id: uid(), account_id: "acc_cust_001", entry_type: "redeem", points: -200, balance_after: 1050, description: "Redeemed for ₦200 discount", reference_id: "red_bbb001" },
  { id: uid(), account_id: "acc_cust_002", entry_type: "earn", points: 430, balance_after: 430, description: "Referral bonus — referred cust_003", reference_id: "ref_bbb002" },
  { id: uid(), account_id: "acc_cust_003", entry_type: "earn", points: 80, balance_after: 80, description: "First purchase reward", reference_id: "txn_ccc003" },
  { id: uid(), account_id: "acc_cust_004", entry_type: "earn", points: 5000, balance_after: 5000, description: "Annual milestone bonus", reference_id: "mile_ddd004" },
  { id: uid(), account_id: "acc_cust_004", entry_type: "expire", points: -500, balance_after: 4500, description: "Points expired — 12-month expiry", reference_id: null },
];
for (const row of loyaltyRows) {
  await pool.query(
    `INSERT INTO loyalty_ledger (id, account_id, entry_type, points, balance_after, description, reference_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.account_id, row.entry_type, row.points, row.balance_after, row.description, row.reference_id]
  ).catch(e => console.warn(`  ⚠ loyalty_ledger skip: ${e.message}`));
}
console.log(`  ✓ ${loyaltyRows.length} loyalty ledger entries\n`);

// ─── 2. Carbon Credits ───────────────────────────────────────────────────────
// Columns: credit_id, merchant_id, project_id, project_name, tonnes,
//          price_per_tonne_kobo, total_kobo, vintage, standard, status,
//          retired_at, created_at
console.log("[2/7] Seeding carbon_credits...");
const carbonRows = [
  { credit_id: uid(), merchant_id: "merchant_demo_001", project_id: "PROJ-NG-001", project_name: "Mangrove Restoration Nigeria", tonnes: "100", price_per_tonne_kobo: 120000, total_kobo: 12000000, vintage: "2023", standard: "VCS", status: "active", retired_at: null },
  { credit_id: uid(), merchant_id: "merchant_demo_001", project_id: "PROJ-KE-042", project_name: "Solar Cookstoves Kenya", tonnes: "50", price_per_tonne_kobo: 180000, total_kobo: 9000000, vintage: "2024", standard: "Gold Standard", status: "active", retired_at: null },
  { credit_id: uid(), merchant_id: "merchant_demo_002", project_id: "PROJ-GH-015", project_name: "Reforestation Ghana", tonnes: "200", price_per_tonne_kobo: 90000, total_kobo: 18000000, vintage: "2022", standard: "CDM", status: "retired", retired_at: daysAgo(30) },
  { credit_id: uid(), merchant_id: "merchant_demo_002", project_id: "PROJ-NG-088", project_name: "Wind Farm Jigawa", tonnes: "75", price_per_tonne_kobo: 200000, total_kobo: 15000000, vintage: "2024", standard: "VCS", status: "pending", retired_at: null },
];
for (const row of carbonRows) {
  await pool.query(
    `INSERT INTO carbon_credits (credit_id, merchant_id, project_id, project_name, tonnes, price_per_tonne_kobo, total_kobo, vintage, standard, status, retired_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (credit_id) DO NOTHING`,
    [row.credit_id, row.merchant_id, row.project_id, row.project_name, row.tonnes, row.price_per_tonne_kobo, row.total_kobo, row.vintage, row.standard, row.status, row.retired_at]
  ).catch(e => console.warn(`  ⚠ carbon_credits skip: ${e.message}`));
}
console.log(`  ✓ ${carbonRows.length} carbon credit records\n`);

// ─── 3. Escrow Contracts ─────────────────────────────────────────────────────
// Columns: escrow_id, buyer_merchant_id, seller_merchant_id, amount_kobo,
//          currency, conditions, status, released_at, expires_at,
//          created_at, updated_at
console.log("[3/7] Seeding escrow_contracts...");
const escrowRows = [
  {
    escrow_id: uid(), buyer_merchant_id: "merchant_demo_001", seller_merchant_id: "vendor_001",
    amount_kobo: 50000000, currency: "NGN", status: "funded",
    conditions: JSON.stringify([{ type: "buyer_approval", description: "Buyer must approve delivery", fulfilled: false }]),
    released_at: null, expires_at: daysFromNow(30),
  },
  {
    escrow_id: uid(), buyer_merchant_id: "merchant_demo_001", seller_merchant_id: "vendor_002",
    amount_kobo: 120000000, currency: "NGN", status: "released",
    conditions: JSON.stringify([{ type: "milestone_completion", description: "All milestones complete", fulfilled: true }]),
    released_at: daysAgo(5), expires_at: daysAgo(90),
  },
  {
    escrow_id: uid(), buyer_merchant_id: "merchant_demo_002", seller_merchant_id: "vendor_003",
    amount_kobo: 25000000, currency: "NGN", status: "disputed",
    conditions: JSON.stringify([{ type: "buyer_approval", description: "Buyer must approve delivery", fulfilled: false }]),
    released_at: null, expires_at: daysAgo(7),
  },
  {
    escrow_id: uid(), buyer_merchant_id: "merchant_demo_002", seller_merchant_id: "vendor_004",
    amount_kobo: 75000000, currency: "NGN", status: "funded",
    conditions: JSON.stringify([{ type: "milestone_completion", description: "3 milestones required", fulfilled: false }]),
    released_at: null, expires_at: daysFromNow(45),
  },
];
for (const row of escrowRows) {
  await pool.query(
    `INSERT INTO escrow_contracts (escrow_id, buyer_merchant_id, seller_merchant_id, amount_kobo, currency, conditions, status, released_at, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
     ON CONFLICT (escrow_id) DO NOTHING`,
    [row.escrow_id, row.buyer_merchant_id, row.seller_merchant_id, row.amount_kobo, row.currency, row.conditions, row.status, row.released_at, row.expires_at]
  ).catch(e => console.warn(`  ⚠ escrow_contracts skip: ${e.message}`));
}
console.log(`  ✓ ${escrowRows.length} escrow contracts\n`);

// ─── 4. Carbon Credits V2 ────────────────────────────────────────────────────
// Columns: id, merchant_id, project_name, project_type, country, vintage_year,
//          quantity, price_per_tonne, status, certification_body, serial_number, created_at
console.log("[4/7] Seeding carbon_credits_v2...");
const carbonV2Rows = [
  { id: uid(), merchant_id: "merchant_demo_001", project_name: "Lagos Urban Forest", project_type: "reforestation", country: "NG", vintage_year: 2024, quantity: 150, price_per_tonne: 1500, status: "available", certification_body: "Gold Standard", serial_number: "GS-NG-2024-001-150" },
  { id: uid(), merchant_id: "merchant_demo_001", project_name: "Kano Solar Farm", project_type: "renewable_energy", country: "NG", vintage_year: 2023, quantity: 80, price_per_tonne: 2200, status: "available", certification_body: "Verra", serial_number: "VCS-NG-2023-002-080" },
  { id: uid(), merchant_id: "merchant_demo_002", project_name: "Niger Delta Mangroves", project_type: "blue_carbon", country: "NG", vintage_year: 2024, quantity: 300, price_per_tonne: 1800, status: "pending_verification", certification_body: "Gold Standard", serial_number: null },
];
for (const row of carbonV2Rows) {
  await pool.query(
    `INSERT INTO carbon_credits_v2 (id, merchant_id, project_name, project_type, country, vintage_year, quantity, price_per_tonne, status, certification_body, serial_number, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.merchant_id, row.project_name, row.project_type, row.country, row.vintage_year, row.quantity, row.price_per_tonne, row.status, row.certification_body, row.serial_number]
  ).catch(e => console.warn(`  ⚠ carbon_credits_v2 skip: ${e.message}`));
}
console.log(`  ✓ ${carbonV2Rows.length} carbon credits V2\n`);

// ─── 5. Escrow Contracts V2 ──────────────────────────────────────────────────
// Columns: id, merchant_id, buyer_id, seller_id, title, description, amount,
//          currency, status, release_conditions, dispute_reason, milestones,
//          expires_at, released_at, created_at
console.log("[5/7] Seeding escrow_contracts_v2...");
const escrowV2Rows = [
  {
    id: uid(), merchant_id: "merchant_demo_001", buyer_id: "cust_001", seller_id: "vendor_001",
    title: "Equipment Purchase — Industrial Generator",
    description: "Purchase of 200KVA industrial generator for Abuja warehouse",
    amount: 2000000, currency: "NGN", status: "active",
    release_conditions: JSON.stringify([{ type: "document_upload", description: "Bill of lading", fulfilled: false }, { type: "inspection_passed", description: "Quality inspection", fulfilled: false }]),
    dispute_reason: null,
    milestones: JSON.stringify([{ name: "Delivery", amount: 1000000, status: "pending" }, { name: "Installation", amount: 1000000, status: "pending" }]),
    expires_at: daysFromNow(60), released_at: null,
  },
  {
    id: uid(), merchant_id: "merchant_demo_002", buyer_id: "cust_005", seller_id: "vendor_005",
    title: "Real Estate — Commercial Property Lagos",
    description: "Commercial property acquisition in Victoria Island",
    amount: 15000000, currency: "NGN", status: "funded",
    release_conditions: JSON.stringify([{ type: "title_transfer", description: "Certificate of occupancy transferred", fulfilled: true }, { type: "payment_confirmed", description: "Full payment confirmed", fulfilled: true }]),
    dispute_reason: null,
    milestones: JSON.stringify([{ name: "Title Transfer", amount: 15000000, status: "completed" }]),
    expires_at: daysFromNow(90), released_at: null,
  },
];
for (const row of escrowV2Rows) {
  await pool.query(
    `INSERT INTO escrow_contracts_v2 (id, merchant_id, buyer_id, seller_id, title, description, amount, currency, status, release_conditions, dispute_reason, milestones, expires_at, released_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.merchant_id, row.buyer_id, row.seller_id, row.title, row.description, row.amount, row.currency, row.status, row.release_conditions, row.dispute_reason, row.milestones, row.expires_at, row.released_at]
  ).catch(e => console.warn(`  ⚠ escrow_contracts_v2 skip: ${e.message}`));
}
console.log(`  ✓ ${escrowV2Rows.length} escrow contracts V2\n`);

// ─── 6. Loyalty V3 Programs ──────────────────────────────────────────────────
// Columns: id, merchant_id, program_name, points_per_naira, redemption_rate,
//          expiry_days, tiers, status, total_members, total_points_issued, created_at
console.log("[6/7] Seeding loyalty_v3_programs...");
const loyaltyV3ProgramRows = [
  {
    id: uid(), merchant_id: "merchant_demo_001", program_name: "PayGate Gold Rewards",
    points_per_naira: 1, redemption_rate: 100, expiry_days: 365,
    tiers: JSON.stringify([{ name: "Bronze", minPoints: 0, multiplier: 1 }, { name: "Silver", minPoints: 500, multiplier: 1.5 }, { name: "Gold", minPoints: 2000, multiplier: 2 }, { name: "Platinum", minPoints: 10000, multiplier: 3 }]),
    status: "active", total_members: 3, total_points_issued: 6760,
  },
  {
    id: uid(), merchant_id: "merchant_demo_002", program_name: "Merchant Cashback Club",
    points_per_naira: 2, redemption_rate: 50, expiry_days: 180,
    tiers: JSON.stringify([{ name: "Standard", minPoints: 0, multiplier: 1 }, { name: "Premium", minPoints: 1000, multiplier: 2 }]),
    status: "active", total_members: 1, total_points_issued: 200,
  },
];
for (const row of loyaltyV3ProgramRows) {
  await pool.query(
    `INSERT INTO loyalty_v3_programs (id, merchant_id, program_name, points_per_naira, redemption_rate, expiry_days, tiers, status, total_members, total_points_issued, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.merchant_id, row.program_name, row.points_per_naira, row.redemption_rate, row.expiry_days, row.tiers, row.status, row.total_members, row.total_points_issued]
  ).catch(e => console.warn(`  ⚠ loyalty_v3_programs skip: ${e.message}`));
}
console.log(`  ✓ ${loyaltyV3ProgramRows.length} loyalty V3 programs\n`);

// ─── 7. Loyalty V3 Members ───────────────────────────────────────────────────
// Columns: id, program_id, merchant_id, customer_id, customer_email,
//          points_balance, lifetime_points, tier, joined_at
console.log("[7/7] Seeding loyalty_v3_members...");
const loyaltyV3MemberRows = [
  { id: uid(), program_id: "prog_v3_gold_001", merchant_id: "merchant_demo_001", customer_id: "cust_001", customer_email: "alice@demo.com", points_balance: 3500, lifetime_points: 5200, tier: "gold" },
  { id: uid(), program_id: "prog_v3_gold_001", merchant_id: "merchant_demo_001", customer_id: "cust_002", customer_email: "bob@demo.com", points_balance: 850, lifetime_points: 1200, tier: "silver" },
  { id: uid(), program_id: "prog_v3_gold_001", merchant_id: "merchant_demo_001", customer_id: "cust_003", customer_email: "carol@demo.com", points_balance: 12000, lifetime_points: 18000, tier: "platinum" },
  { id: uid(), program_id: "prog_v3_cashback_002", merchant_id: "merchant_demo_002", customer_id: "cust_004", customer_email: "dave@demo.com", points_balance: 200, lifetime_points: 200, tier: "bronze" },
];
for (const row of loyaltyV3MemberRows) {
  await pool.query(
    `INSERT INTO loyalty_v3_members (id, program_id, merchant_id, customer_id, customer_email, points_balance, lifetime_points, tier, joined_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.program_id, row.merchant_id, row.customer_id, row.customer_email, row.points_balance, row.lifetime_points, row.tier]
  ).catch(e => console.warn(`  ⚠ loyalty_v3_members skip: ${e.message}`));
}
console.log(`  ✓ ${loyaltyV3MemberRows.length} loyalty V3 members\n`);

await pool.end();
console.log("✅ seed-wave102.mjs complete — 7 tables seeded with 26 rows total");
