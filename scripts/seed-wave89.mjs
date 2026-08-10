/**
 * seed-wave89.mjs — Seed data for Sprint v88/v89 new tables:
 *   - claim_documents
 *   - portfolio_rebalancing_orders
 *   - corridor_live_stats
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL ?? process.env.PG_DATABASE_URL ?? "";

async function main() {
  if (!DB_URL) {
    console.warn("[seed-wave89] No DATABASE_URL set — skipping seed");
    process.exit(0);
  }

  // Support both MySQL (DATABASE_URL) and PostgreSQL (PG_DATABASE_URL)
  const isPostgres = DB_URL.startsWith("postgres");

  if (isPostgres) {
    await seedPostgres(DB_URL);
  } else {
    await seedMySQL(DB_URL);
  }
}

async function seedPostgres(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const q = (text, values = []) => client.query(text, values);

  console.log("[seed-wave89] Seeding claim_documents...");
  await q(`
    INSERT INTO claim_documents (id, claim_id, uploaded_by, filename, file_key, file_url, mime_type, file_size_bytes, document_type, status, created_at)
    VALUES
      ('cd_001', 'ins_claim_001', 'user_001', 'hospital_receipt.pdf', 'claims/cd_001/hospital_receipt.pdf', 'https://cdn.paygate.ng/claims/cd_001/hospital_receipt.pdf', 'application/pdf', 245760, 'receipt', 'approved', NOW() - INTERVAL '5 days'),
      ('cd_002', 'ins_claim_001', 'user_001', 'doctor_report.pdf', 'claims/cd_002/doctor_report.pdf', 'https://cdn.paygate.ng/claims/cd_002/doctor_report.pdf', 'application/pdf', 189440, 'medical_report', 'approved', NOW() - INTERVAL '4 days'),
      ('cd_003', 'ins_claim_002', 'user_002', 'police_report.pdf', 'claims/cd_003/police_report.pdf', 'https://cdn.paygate.ng/claims/cd_003/police_report.pdf', 'application/pdf', 512000, 'police_report', 'pending', NOW() - INTERVAL '2 days'),
      ('cd_004', 'ins_claim_002', 'user_002', 'vehicle_photos.jpg', 'claims/cd_004/vehicle_photos.jpg', 'https://cdn.paygate.ng/claims/cd_004/vehicle_photos.jpg', 'image/jpeg', 1048576, 'photo', 'pending', NOW() - INTERVAL '2 days'),
      ('cd_005', 'ins_claim_003', 'user_003', 'fire_damage_report.pdf', 'claims/cd_005/fire_damage_report.pdf', 'https://cdn.paygate.ng/claims/cd_005/fire_damage_report.pdf', 'application/pdf', 320000, 'damage_report', 'under_review', NOW() - INTERVAL '1 day')
    ON CONFLICT (id) DO NOTHING
  `);

  console.log("[seed-wave89] Seeding portfolio_rebalancing_orders...");
  await q(`
    INSERT INTO portfolio_rebalancing_orders (id, user_id, target_gold_pct, target_mutual_funds_pct, target_pension_pct, current_gold_pct, current_mutual_funds_pct, current_pension_pct, status, notes, created_at, updated_at)
    VALUES
      ('ro_001', 'user_001', 30, 50, 20, 25, 55, 20, 'completed', 'Quarterly rebalance Q1 2026', NOW() - INTERVAL '30 days', NOW() - INTERVAL '29 days'),
      ('ro_002', 'user_001', 35, 45, 20, 30, 50, 20, 'completed', 'Mid-quarter adjustment', NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days'),
      ('ro_003', 'user_002', 20, 60, 20, 18, 62, 20, 'pending', 'Reduce gold exposure', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
      ('ro_004', 'user_003', 40, 40, 20, 35, 45, 20, 'executing', 'Increase gold allocation', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour'),
      ('ro_005', 'user_004', 25, 55, 20, 25, 55, 20, 'cancelled', 'Market conditions changed', NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days')
    ON CONFLICT (id) DO NOTHING
  `);

  console.log("[seed-wave89] Seeding corridor_live_stats...");
  await q(`
    INSERT INTO corridor_live_stats (id, source_country, dest_country, source_currency, dest_currency, fx_rate, fx_markup_pct, daily_volume_usd, daily_limit_usd, tx_count_today, avg_processing_ms, is_enabled, last_updated, created_at, updated_at)
    VALUES
      ('corr_001', 'NG', 'GB', 'NGN', 'GBP', 0.000527, 2.5, 125000, 500000, 47, 1850, 1, NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '90 days', NOW()),
      ('corr_002', 'NG', 'US', 'NGN', 'USD', 0.000625, 2.5, 287000, 1000000, 112, 2100, 1, NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '90 days', NOW()),
      ('corr_003', 'NG', 'GH', 'NGN', 'GHS', 0.0071, 1.8, 45000, 200000, 28, 950, 1, NOW() - INTERVAL '8 minutes', NOW() - INTERVAL '90 days', NOW()),
      ('corr_004', 'NG', 'KE', 'NGN', 'KES', 0.0812, 1.8, 32000, 150000, 19, 1200, 1, NOW() - INTERVAL '12 minutes', NOW() - INTERVAL '90 days', NOW()),
      ('corr_005', 'NG', 'ZA', 'NGN', 'ZAR', 0.01148, 2.0, 18000, 100000, 11, 1650, 1, NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '90 days', NOW()),
      ('corr_006', 'NG', 'EU', 'NGN', 'EUR', 0.000578, 2.5, 95000, 400000, 38, 2300, 1, NOW() - INTERVAL '7 minutes', NOW() - INTERVAL '90 days', NOW()),
      ('corr_007', 'NG', 'CN', 'NGN', 'CNY', 0.00453, 3.0, 8000, 50000, 5, 3200, 0, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '90 days', NOW()),
      ('corr_008', 'NG', 'IN', 'NGN', 'INR', 0.0521, 2.2, 12000, 75000, 8, 1900, 1, NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '90 days', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await client.end();
  console.log("[seed-wave89] ✅ All wave89 tables seeded successfully");
}

async function seedMySQL(url) {
  const conn = await createConnection(url);

  console.log("[seed-wave89] Seeding claim_documents (MySQL)...");
  await conn.execute(`
    INSERT IGNORE INTO claim_documents (id, claim_id, uploaded_by, filename, file_key, file_url, mime_type, file_size_bytes, document_type, status, created_at)
    VALUES
      ('cd_001', 'ins_claim_001', 'user_001', 'hospital_receipt.pdf', 'claims/cd_001/hospital_receipt.pdf', 'https://cdn.paygate.ng/claims/cd_001/hospital_receipt.pdf', 'application/pdf', 245760, 'receipt', 'approved', NOW()),
      ('cd_002', 'ins_claim_001', 'user_001', 'doctor_report.pdf', 'claims/cd_002/doctor_report.pdf', 'https://cdn.paygate.ng/claims/cd_002/doctor_report.pdf', 'application/pdf', 189440, 'medical_report', 'approved', NOW()),
      ('cd_003', 'ins_claim_002', 'user_002', 'police_report.pdf', 'claims/cd_003/police_report.pdf', 'https://cdn.paygate.ng/claims/cd_003/police_report.pdf', 'application/pdf', 512000, 'police_report', 'pending', NOW()),
      ('cd_004', 'ins_claim_002', 'user_002', 'vehicle_photos.jpg', 'claims/cd_004/vehicle_photos.jpg', 'https://cdn.paygate.ng/claims/cd_004/vehicle_photos.jpg', 'image/jpeg', 1048576, 'photo', 'pending', NOW()),
      ('cd_005', 'ins_claim_003', 'user_003', 'fire_damage_report.pdf', 'claims/cd_005/fire_damage_report.pdf', 'https://cdn.paygate.ng/claims/cd_005/fire_damage_report.pdf', 'application/pdf', 320000, 'damage_report', 'under_review', NOW())
  `);

  await conn.end();
  console.log("[seed-wave89] ✅ MySQL wave89 tables seeded successfully");
}

main().catch(err => {
  console.error("[seed-wave89] Error:", err.message);
  process.exit(1);
});
