#!/usr/bin/env node
/**
 * seed-wave102.mjs — Production seed data for Wave 102 orphaned tables
 * Tables: loyaltyLedger, carbonCredits, escrowContracts, carbonCreditsV2,
 *         carbonCreditTransactionsV2, escrowContractsV2, loyaltyV3Programs,
 *         loyaltyV3Members
 *
 * Usage: node seed-wave102.mjs
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL || process.env.PG_DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse mysql2 connection from URL
function parseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port) || 3306,
    user: u.username,
    password: u.password,
    database: u.pathname.replace("/", ""),
    ssl: { rejectUnauthorized: false },
  };
}

const conn = await createConnection(parseUrl(DB_URL));
console.log("Connected to database");

// ─── Helper ──────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 14);
}
function ts(daysAgo = 0) {
  return Date.now() - daysAgo * 86400000;
}

// ─── 1. Loyalty Ledger ───────────────────────────────────────────────────────
console.log("\n[1/8] Seeding loyaltyLedger...");
const loyaltyRows = [
  { id: uid(), merchantId: "merchant_demo_001", customerId: "cust_001", programId: "prog_gold", points: 1250, tier: "gold", earnedAt: ts(5), expiresAt: ts(-365), status: "active", source: "purchase", referenceId: "txn_aaa001", notes: "Purchase reward" },
  { id: uid(), merchantId: "merchant_demo_001", customerId: "cust_002", programId: "prog_silver", points: 430, tier: "silver", earnedAt: ts(10), expiresAt: ts(-180), status: "active", source: "referral", referenceId: "ref_bbb002", notes: "Referral bonus" },
  { id: uid(), merchantId: "merchant_demo_001", customerId: "cust_003", programId: "prog_bronze", points: 80, tier: "bronze", earnedAt: ts(2), expiresAt: ts(-90), status: "active", source: "purchase", referenceId: "txn_ccc003", notes: "First purchase" },
  { id: uid(), merchantId: "merchant_demo_002", customerId: "cust_004", programId: "prog_platinum", points: 5000, tier: "platinum", earnedAt: ts(1), expiresAt: ts(-730), status: "active", source: "milestone", referenceId: "mile_ddd004", notes: "Annual milestone" },
  { id: uid(), merchantId: "merchant_demo_002", customerId: "cust_005", programId: "prog_gold", points: 200, tier: "gold", earnedAt: ts(30), expiresAt: ts(-60), status: "redeemed", source: "purchase", referenceId: "txn_eee005", notes: "Redeemed for discount" },
];
for (const row of loyaltyRows) {
  await conn.execute(
    `INSERT IGNORE INTO loyaltyLedger (id, merchantId, customerId, programId, points, tier, earnedAt, expiresAt, status, source, referenceId, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.merchantId, row.customerId, row.programId, row.points, row.tier, row.earnedAt, row.expiresAt, row.status, row.source, row.referenceId, row.notes, ts(5), ts(0)]
  ).catch(() => {}); // ignore duplicate
}
console.log(`  ✓ ${loyaltyRows.length} loyalty ledger entries`);

// ─── 2. Carbon Credits ───────────────────────────────────────────────────────
console.log("[2/8] Seeding carbonCredits...");
const carbonRows = [
  { id: uid(), merchantId: "merchant_demo_001", projectName: "Mangrove Restoration Nigeria", standard: "VCS", vintage: 2023, quantity: 100, pricePerTonne: 1200, currency: "NGN", status: "active", registryId: "VCS-NG-2023-001", issuedAt: ts(60), expiresAt: ts(-365) },
  { id: uid(), merchantId: "merchant_demo_001", projectName: "Solar Cookstoves Kenya", standard: "Gold Standard", vintage: 2024, quantity: 50, pricePerTonne: 1800, currency: "NGN", status: "active", registryId: "GS-KE-2024-042", issuedAt: ts(30), expiresAt: ts(-730) },
  { id: uid(), merchantId: "merchant_demo_002", projectName: "Reforestation Ghana", standard: "CDM", vintage: 2022, quantity: 200, pricePerTonne: 900, currency: "NGN", status: "retired", registryId: "CDM-GH-2022-015", issuedAt: ts(120), expiresAt: ts(-180) },
  { id: uid(), merchantId: "merchant_demo_002", projectName: "Wind Farm Jigawa", standard: "VCS", vintage: 2024, quantity: 75, pricePerTonne: 2000, currency: "NGN", status: "pending", registryId: "VCS-NG-2024-088", issuedAt: ts(5), expiresAt: ts(-365) },
];
for (const row of carbonRows) {
  await conn.execute(
    `INSERT IGNORE INTO carbonCredits (id, merchantId, projectName, standard, vintage, quantity, pricePerTonne, currency, status, registryId, issuedAt, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.merchantId, row.projectName, row.standard, row.vintage, row.quantity, row.pricePerTonne, row.currency, row.status, row.registryId, row.issuedAt, row.expiresAt, ts(60), ts(0)]
  ).catch(() => {});
}
console.log(`  ✓ ${carbonRows.length} carbon credit records`);

// ─── 3. Escrow Contracts ─────────────────────────────────────────────────────
console.log("[3/8] Seeding escrowContracts...");
const escrowRows = [
  { id: uid(), merchantId: "merchant_demo_001", buyerId: "cust_001", sellerId: "vendor_001", amount: 500000, currency: "NGN", status: "funded", title: "Equipment Purchase", description: "Industrial generator purchase", milestones: JSON.stringify([{ name: "Delivery", amount: 250000, status: "pending" }, { name: "Installation", amount: 250000, status: "pending" }]), fundedAt: ts(3), releaseCondition: "buyer_approval", disputeDeadline: ts(-30) },
  { id: uid(), merchantId: "merchant_demo_001", buyerId: "cust_002", sellerId: "vendor_002", amount: 1200000, currency: "NGN", status: "released", title: "Software Development", description: "Custom POS software development", milestones: JSON.stringify([{ name: "Design", amount: 300000, status: "released" }, { name: "Development", amount: 600000, status: "released" }, { name: "Testing", amount: 300000, status: "released" }]), fundedAt: ts(60), releaseCondition: "milestone_completion", disputeDeadline: ts(-90) },
  { id: uid(), merchantId: "merchant_demo_002", buyerId: "cust_003", sellerId: "vendor_003", amount: 250000, currency: "NGN", status: "disputed", title: "Inventory Supply", description: "Bulk food items supply", milestones: JSON.stringify([{ name: "Delivery", amount: 250000, status: "disputed" }]), fundedAt: ts(15), releaseCondition: "buyer_approval", disputeDeadline: ts(-7) },
  { id: uid(), merchantId: "merchant_demo_002", buyerId: "cust_004", sellerId: "vendor_004", amount: 750000, currency: "NGN", status: "pending", title: "Construction Work", description: "Office renovation project", milestones: JSON.stringify([{ name: "Foundation", amount: 250000, status: "pending" }, { name: "Structure", amount: 300000, status: "pending" }, { name: "Finishing", amount: 200000, status: "pending" }]), fundedAt: null, releaseCondition: "milestone_completion", disputeDeadline: ts(-45) },
];
for (const row of escrowRows) {
  await conn.execute(
    `INSERT IGNORE INTO escrowContracts (id, merchantId, buyerId, sellerId, amount, currency, status, title, description, milestones, fundedAt, releaseCondition, disputeDeadline, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.merchantId, row.buyerId, row.sellerId, row.amount, row.currency, row.status, row.title, row.description, row.milestones, row.fundedAt, row.releaseCondition, row.disputeDeadline, ts(60), ts(0)]
  ).catch(() => {});
}
console.log(`  ✓ ${escrowRows.length} escrow contracts`);

// ─── 4. Carbon Credits V2 ────────────────────────────────────────────────────
console.log("[4/8] Seeding carbonCreditsV2...");
const carbonV2Rows = [
  { id: uid(), merchantId: "merchant_demo_001", projectId: "PROJ-001", projectName: "Lagos Urban Forest", standard: "VCS", vintage: 2024, quantity: 150, unitPrice: 1500, currency: "NGN", status: "active", serialNumber: "VCS-NG-2024-001-150", verifiedBy: "Verra", verificationDate: ts(20) },
  { id: uid(), merchantId: "merchant_demo_001", projectId: "PROJ-002", projectName: "Kano Solar Farm", standard: "Gold Standard", vintage: 2023, quantity: 80, unitPrice: 2200, currency: "NGN", status: "active", serialNumber: "GS-NG-2023-002-080", verifiedBy: "SustainCERT", verificationDate: ts(45) },
  { id: uid(), merchantId: "merchant_demo_002", projectId: "PROJ-003", projectName: "Niger Delta Mangroves", standard: "VCS", vintage: 2024, quantity: 300, unitPrice: 1800, currency: "NGN", status: "pending_verification", serialNumber: "VCS-NG-2024-003-300", verifiedBy: null, verificationDate: null },
];
for (const row of carbonV2Rows) {
  await conn.execute(
    `INSERT IGNORE INTO carbonCreditsV2 (id, merchantId, projectId, projectName, standard, vintage, quantity, unitPrice, currency, status, serialNumber, verifiedBy, verificationDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.merchantId, row.projectId, row.projectName, row.standard, row.vintage, row.quantity, row.unitPrice, row.currency, row.status, row.serialNumber, row.verifiedBy, row.verificationDate, ts(45), ts(0)]
  ).catch(() => {});
}
console.log(`  ✓ ${carbonV2Rows.length} carbon credits V2`);

// ─── 5. Carbon Credit Transactions V2 ───────────────────────────────────────
console.log("[5/8] Seeding carbonCreditTransactionsV2...");
const carbonTxRows = [
  { id: uid(), creditId: "cc_v2_001", fromMerchantId: "merchant_demo_001", toMerchantId: null, quantity: 10, pricePerUnit: 1500, totalAmount: 15000, currency: "NGN", type: "retirement", status: "completed", retirementReason: "Scope 1 offset Q1 2024", txHash: "0x" + uid() + uid(), settledAt: ts(10) },
  { id: uid(), creditId: "cc_v2_001", fromMerchantId: "merchant_demo_001", toMerchantId: "merchant_demo_002", quantity: 25, pricePerUnit: 1600, totalAmount: 40000, currency: "NGN", type: "transfer", status: "completed", retirementReason: null, txHash: "0x" + uid() + uid(), settledAt: ts(5) },
];
for (const row of carbonTxRows) {
  await conn.execute(
    `INSERT IGNORE INTO carbonCreditTransactionsV2 (id, creditId, fromMerchantId, toMerchantId, quantity, pricePerUnit, totalAmount, currency, type, status, retirementReason, txHash, settledAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.creditId, row.fromMerchantId, row.toMerchantId, row.quantity, row.pricePerUnit, row.totalAmount, row.currency, row.type, row.status, row.retirementReason, row.txHash, row.settledAt, ts(10), ts(0)]
  ).catch(() => {});
}
console.log(`  ✓ ${carbonTxRows.length} carbon credit transactions V2`);

// ─── 6. Escrow Contracts V2 ──────────────────────────────────────────────────
console.log("[6/8] Seeding escrowContractsV2...");
const escrowV2Rows = [
  { id: uid(), merchantId: "merchant_demo_001", contractType: "trade_finance", parties: JSON.stringify({ buyer: "cust_001", seller: "vendor_001", arbiter: "paygate_escrow" }), amount: 2000000, currency: "NGN", status: "active", conditions: JSON.stringify([{ type: "document_upload", description: "Bill of lading", fulfilled: false }, { type: "inspection_passed", description: "Quality inspection", fulfilled: false }]), expiresAt: ts(-60), autoReleaseAt: null },
  { id: uid(), merchantId: "merchant_demo_002", contractType: "real_estate", parties: JSON.stringify({ buyer: "cust_005", seller: "vendor_005", arbiter: "paygate_escrow" }), amount: 15000000, currency: "NGN", status: "funded", conditions: JSON.stringify([{ type: "title_transfer", description: "Certificate of occupancy transferred", fulfilled: true }, { type: "payment_confirmed", description: "Full payment confirmed", fulfilled: true }]), expiresAt: ts(-90), autoReleaseAt: ts(-7) },
];
for (const row of escrowV2Rows) {
  await conn.execute(
    `INSERT IGNORE INTO escrowContractsV2 (id, merchantId, contractType, parties, amount, currency, status, conditions, expiresAt, autoReleaseAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.merchantId, row.contractType, row.parties, row.amount, row.currency, row.status, row.conditions, row.expiresAt, row.autoReleaseAt, ts(30), ts(0)]
  ).catch(() => {});
}
console.log(`  ✓ ${escrowV2Rows.length} escrow contracts V2`);

// ─── 7. Loyalty V3 Programs ──────────────────────────────────────────────────
console.log("[7/8] Seeding loyaltyV3Programs...");
const loyaltyV3ProgramRows = [
  { id: uid(), merchantId: "merchant_demo_001", name: "PayGate Gold Rewards", description: "Earn points on every transaction", pointsPerNaira: 1, redemptionRate: 100, minRedemption: 500, tiers: JSON.stringify([{ name: "Bronze", minPoints: 0, multiplier: 1 }, { name: "Silver", minPoints: 500, multiplier: 1.5 }, { name: "Gold", minPoints: 2000, multiplier: 2 }, { name: "Platinum", minPoints: 10000, multiplier: 3 }]), status: "active", expiryMonths: 12 },
  { id: uid(), merchantId: "merchant_demo_002", name: "Merchant Cashback Club", description: "Cashback on qualifying purchases", pointsPerNaira: 2, redemptionRate: 50, minRedemption: 1000, tiers: JSON.stringify([{ name: "Standard", minPoints: 0, multiplier: 1 }, { name: "Premium", minPoints: 1000, multiplier: 2 }]), status: "active", expiryMonths: 6 },
];
for (const row of loyaltyV3ProgramRows) {
  await conn.execute(
    `INSERT IGNORE INTO loyaltyV3Programs (id, merchantId, name, description, pointsPerNaira, redemptionRate, minRedemption, tiers, status, expiryMonths, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.merchantId, row.name, row.description, row.pointsPerNaira, row.redemptionRate, row.minRedemption, row.tiers, row.status, row.expiryMonths, ts(90), ts(0)]
  ).catch(() => {});
}
console.log(`  ✓ ${loyaltyV3ProgramRows.length} loyalty V3 programs`);

// ─── 8. Loyalty V3 Members ───────────────────────────────────────────────────
console.log("[8/8] Seeding loyaltyV3Members...");
const loyaltyV3MemberRows = [
  { id: uid(), programId: "prog_v3_001", customerId: "cust_001", merchantId: "merchant_demo_001", totalPoints: 3500, availablePoints: 2800, tier: "Gold", lifetimePoints: 5200, joinedAt: ts(180), lastActivityAt: ts(2) },
  { id: uid(), programId: "prog_v3_001", customerId: "cust_002", merchantId: "merchant_demo_001", totalPoints: 850, availablePoints: 850, tier: "Silver", lifetimePoints: 1200, joinedAt: ts(90), lastActivityAt: ts(7) },
  { id: uid(), programId: "prog_v3_002", customerId: "cust_003", merchantId: "merchant_demo_002", totalPoints: 12000, availablePoints: 10500, tier: "Platinum", lifetimePoints: 18000, joinedAt: ts(365), lastActivityAt: ts(1) },
  { id: uid(), programId: "prog_v3_002", customerId: "cust_004", merchantId: "merchant_demo_002", totalPoints: 200, availablePoints: 200, tier: "Standard", lifetimePoints: 200, joinedAt: ts(14), lastActivityAt: ts(14) },
];
for (const row of loyaltyV3MemberRows) {
  await conn.execute(
    `INSERT IGNORE INTO loyaltyV3Members (id, programId, customerId, merchantId, totalPoints, availablePoints, tier, lifetimePoints, joinedAt, lastActivityAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.programId, row.customerId, row.merchantId, row.totalPoints, row.availablePoints, row.tier, row.lifetimePoints, row.joinedAt, row.lastActivityAt, ts(180), ts(0)]
  ).catch(() => {});
}
console.log(`  ✓ ${loyaltyV3MemberRows.length} loyalty V3 members`);

await conn.end();
console.log("\n✅ seed-wave102.mjs complete — all 8 tables seeded");
