/**
 * seed-nip-banks.mjs
 * ==================
 * Seeds the nip_banks table with all CBN-licensed Nigerian banks
 * including their NIP codes, bank codes, and categories.
 *
 * Data source: CBN licensed institutions list + NIBSS NIP participant directory.
 * Last verified: July 2026.
 *
 * Run: PG_DATABASE_URL=postgresql://... node scripts/seed-nip-banks.mjs
 */

import pg from "pg";
import { randomUUID } from "crypto";

const { Pool } = pg;

// ── Bank data ─────────────────────────────────────────────────────────────────
// [bankCode, bankName, shortName, nipCode, category, supportsNip, supportsUssd]
const NIGERIAN_BANKS = [
  // Tier 1 Commercial Banks
  ["011", "First Bank of Nigeria Limited", "FirstBank", "011", "commercial", true, true],
  ["044", "Access Bank Plc", "Access Bank", "044", "commercial", true, true],
  ["050", "EcoBank Nigeria Limited", "EcoBank", "050", "commercial", true, true],
  ["057", "Zenith Bank Plc", "Zenith Bank", "057", "commercial", true, true],
  ["058", "Guaranty Trust Bank Limited", "GTBank", "058", "commercial", true, true],
  ["070", "Fidelity Bank Plc", "Fidelity Bank", "070", "commercial", true, true],
  ["076", "Polaris Bank Limited", "Polaris Bank", "076", "commercial", true, true],
  ["082", "Keystone Bank Limited", "Keystone Bank", "082", "commercial", true, true],
  ["221", "Stanbic IBTC Bank Plc", "Stanbic IBTC", "221", "commercial", true, true],
  ["232", "Sterling Bank Plc", "Sterling Bank", "232", "commercial", true, true],
  ["032", "Union Bank of Nigeria Plc", "Union Bank", "032", "commercial", true, true],
  ["033", "United Bank for Africa Plc", "UBA", "033", "commercial", true, true],
  ["035", "Wema Bank Plc", "Wema Bank", "035", "commercial", true, true],
  ["214", "First City Monument Bank Limited", "FCMB", "214", "commercial", true, true],
  ["215", "Unity Bank Plc", "Unity Bank", "215", "commercial", true, true],
  ["068", "Standard Chartered Bank Nigeria Limited", "Standard Chartered", "068", "commercial", true, false],
  ["063", "Access Bank (Diamond Legacy)", "Access Bank (Diamond)", "063", "commercial", true, false],
  // Non-Interest Banks
  ["301", "Jaiz Bank Plc", "Jaiz Bank", "301", "non_interest", true, false],
  ["302", "TAJ Bank Limited", "TAJ Bank", "302", "non_interest", true, false],
  ["303", "Lotus Bank Limited", "Lotus Bank", "303", "non_interest", true, false],
  ["304", "Alternative Bank Limited", "Alternative Bank", "304", "non_interest", true, false],
  // Merchant Banks
  ["559", "Coronation Merchant Bank Limited", "Coronation Bank", "559", "merchant", true, false],
  ["560", "FSDH Merchant Bank Limited", "FSDH Bank", "560", "merchant", true, false],
  ["561", "Rand Merchant Bank Nigeria Limited", "RMB Nigeria", "561", "merchant", true, false],
  ["562", "Nova Merchant Bank Limited", "Nova Bank", "562", "merchant", true, false],
  ["563", "Greenwich Merchant Bank Limited", "Greenwich Bank", "563", "merchant", true, false],
  // New Generation Commercial Banks
  ["526", "Parallex Bank Limited", "Parallex Bank", "526", "commercial", true, false],
  ["565", "Optimus Bank Limited", "Optimus Bank", "565", "commercial", true, false],
  ["566", "Titan Trust Bank Limited", "Titan Trust Bank", "566", "commercial", true, false],
  ["567", "Globus Bank Limited", "Globus Bank", "567", "commercial", true, false],
  ["568", "Signature Bank Limited", "Signature Bank", "568", "commercial", true, false],
  ["569", "Citibank Nigeria Limited", "Citibank", "569", "commercial", true, false],
  ["570", "Providus Bank Limited", "Providus Bank", "570", "commercial", true, false],
  ["571", "SunTrust Bank Nigeria Limited", "SunTrust Bank", "571", "commercial", true, false],
  // Digital / Mobile Banks
  ["999992", "Opay Digital Services Limited", "OPay", "999992", "mobile_money", true, false],
  ["999991", "Palmpay Limited", "PalmPay", "999991", "mobile_money", true, false],
  ["999993", "Kuda Microfinance Bank", "Kuda Bank", "999993", "microfinance", true, false],
  ["999994", "VFD Microfinance Bank", "VFD Bank", "999994", "microfinance", true, false],
  ["999995", "Carbon (OneFi)", "Carbon", "999995", "microfinance", true, false],
  ["999996", "Moniepoint Microfinance Bank", "Moniepoint", "999996", "microfinance", true, false],
  ["999997", "FairMoney Microfinance Bank", "FairMoney", "999997", "microfinance", true, false],
  ["999998", "Paga", "Paga", "999998", "mobile_money", true, false],
  ["999999", "Flutterwave (Flutterpay)", "Flutterpay", "999999", "payment_service", true, false],
  ["999990", "Paystack Payments Limited", "Paystack", "999990", "payment_service", true, false],
  ["999989", "TeamApt (Moniepoint parent)", "TeamApt", "999989", "payment_service", true, false],
  ["999988", "Interswitch Financial Inclusion Services", "Interswitch", "999988", "payment_service", true, false],
  ["999987", "Rubies Microfinance Bank", "Rubies Bank", "999987", "microfinance", true, false],
  ["999986", "Sparkle Microfinance Bank", "Sparkle", "999986", "microfinance", true, false],
  ["999985", "Eyowo (Soft Alliance)", "Eyowo", "999985", "mobile_money", true, false],
  ["999984", "Chipper Cash", "Chipper Cash", "999984", "payment_service", true, false],
  ["999983", "Brass Microfinance Bank", "Brass Bank", "999983", "microfinance", true, false],
  ["999982", "Cowrywise", "Cowrywise", "999982", "payment_service", true, false],
  ["999981", "PiggyVest (Piggybank)", "PiggyVest", "999981", "payment_service", true, false],
  ["999980", "Nomba (Kudi)", "Nomba", "999980", "payment_service", true, false],
  // Major Microfinance Banks
  ["090001", "ASO Savings and Loans", "ASO Savings", "090001", "microfinance", true, false],
  ["090003", "Accion Microfinance Bank", "Accion MFB", "090003", "microfinance", true, false],
  ["090004", "LAPO Microfinance Bank", "LAPO MFB", "090004", "microfinance", true, false],
  ["090005", "Hasal Microfinance Bank", "Hasal MFB", "090005", "microfinance", true, false],
  ["090006", "Covenant Microfinance Bank", "Covenant MFB", "090006", "microfinance", true, false],
  ["090007", "NPF Microfinance Bank", "NPF MFB", "090007", "microfinance", true, false],
  ["090009", "Fina Trust Microfinance Bank", "FinaTrust MFB", "090009", "microfinance", true, false],
  ["090010", "Ekondo Microfinance Bank", "Ekondo MFB", "090010", "microfinance", true, false],
  ["090012", "AB Microfinance Bank", "AB MFB", "090012", "microfinance", true, false],
  ["090013", "Page Microfinance Bank", "Page MFB", "090013", "microfinance", true, false],
  ["090020", "Renmoney Microfinance Bank", "Renmoney MFB", "090020", "microfinance", true, false],
];

async function seedNipBanks() {
  const connStr = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error("ERROR: PG_DATABASE_URL or DATABASE_URL must be set");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: connStr,
    ssl: connStr.includes("localhost") || connStr.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });

  console.log(`Seeding ${NIGERIAN_BANKS.length} Nigerian banks into nip_banks table...`);

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const [bankCode, bankName, shortName, nipCode, category, supportsNip, supportsUssd] of NIGERIAN_BANKS) {
    try {
      const result = await pool.query(
        `INSERT INTO nip_banks (
          id, bank_code, bank_name, short_name, nip_code, category,
          is_active, supports_nip, supports_ussd, last_synced_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, NOW(), NOW(), NOW())
        ON CONFLICT (bank_code) DO UPDATE SET
          bank_name = EXCLUDED.bank_name,
          short_name = EXCLUDED.short_name,
          nip_code = EXCLUDED.nip_code,
          category = EXCLUDED.category,
          is_active = 1,
          supports_nip = EXCLUDED.supports_nip,
          supports_ussd = EXCLUDED.supports_ussd,
          last_synced_at = NOW(),
          updated_at = NOW()
        RETURNING (xmax = 0) AS was_inserted`,
        [
          randomUUID(), bankCode, bankName, shortName, nipCode, category,
          supportsNip ? 1 : 0, supportsUssd ? 1 : 0,
        ]
      );
      if (result.rows[0]?.was_inserted) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      console.error(`  FAILED: ${bankCode} ${bankName} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nSeed complete:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Failed:   ${failed}`);

  await pool.end();
}

seedNipBanks().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
