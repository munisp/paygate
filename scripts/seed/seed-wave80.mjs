/**
 * Wave 80 Seed Script
 * Seeds all 20 Wave 80 feature tables with realistic demo data.
 * Run: node seed-wave80.mjs
 */
import "dotenv/config";
import pg from "pg";
import { randomUUID } from "crypto";

const { Pool } = pg;

// Fallbacks below target the LOCAL embedded dev DB (127.0.0.1) only — safe for dev/test seeds.
function resolveDbUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return process.env.PG_DATABASE_URL ?? "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev";
  if (url.startsWith("postgresql://") || url.startsWith("postgres://")) return url;
  return process.env.PG_DATABASE_URL ?? "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev";
}

const pool = new Pool({
  connectionString: resolveDbUrl(),
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const MERCHANT_ID = "demo-merchant-001";
const NOW = new Date();
const ago = (days) => new Date(NOW - days * 86400000);

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ─── 1. Open Banking V2 ───────────────────────────────────────────────────
    console.log("Seeding open_banking_consents_v2...");
    await client.query(`
      INSERT INTO open_banking_consents_v2 (id, merchant_id, bank_code, bank_name, scopes, status, consent_token, expires_at, created_at, updated_at)
      VALUES
        ($1, $2, '058', 'GTBank', 'accounts,transactions', 'active', 'tok_gtb_001', $3, $4, $4),
        ($5, $2, '044', 'Access Bank', 'accounts', 'active', 'tok_acc_001', $6, $7, $7),
        ($8, $2, '057', 'Zenith Bank', 'accounts,transactions', 'revoked', NULL, $9, $10, $10)
      ON CONFLICT (id) DO NOTHING
    `, [
      randomUUID(), MERCHANT_ID, ago(-30), ago(60),
      randomUUID(), ago(-20), ago(70),
      randomUUID(), ago(-90), ago(-10),
    ]);

    console.log("Seeding open_banking_accounts_v2...");
    await client.query(`
      INSERT INTO open_banking_accounts_v2 (id, merchant_id, consent_id, bank_code, account_number, account_type, currency, balance, last_sync_at, created_at)
      VALUES
        ($1, $2, $3, '058', '0123456789', 'current', 'NGN', 1250000, $4, $4),
        ($5, $2, $6, '044', '9876543210', 'savings', 'NGN', 850000, $7, $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, randomUUID(), ago(1), randomUUID(), randomUUID(), ago(2)]);

    // ─── 2. Carbon Credits V2 ─────────────────────────────────────────────────
    console.log("Seeding carbon_credits_v2...");
    const cc1 = randomUUID(), cc2 = randomUUID(), cc3 = randomUUID();
    await client.query(`
      INSERT INTO carbon_credits_v2 (id, merchant_id, project_name, project_type, country, vintage_year, quantity, price_per_tonne, status, certification_body, serial_number, created_at)
      VALUES
        ($1, $2, 'Lagos Solar Farm', 'renewable_energy', 'NG', 2023, 500, 1200, 'available', 'Gold Standard', 'GS-NG-2023-001', $3),
        ($4, $2, 'Niger Delta Reforestation', 'forestry', 'NG', 2022, 1000, 950, 'available', 'VCS', 'VCS-NG-2022-001', $5),
        ($6, $2, 'Kano Wind Power', 'renewable_energy', 'NG', 2023, 250, 1400, 'retired', 'Gold Standard', 'GS-NG-2023-002', $7)
      ON CONFLICT (id) DO NOTHING
    `, [cc1, MERCHANT_ID, ago(30), cc2, ago(60), cc3, ago(90)]);

    console.log("Seeding carbon_credit_transactions_v2...");
    await client.query(`
      INSERT INTO carbon_credit_transactions_v2 (id, merchant_id, credit_id, type, quantity, total_amount, status, created_at)
      VALUES
        ($1, $2, $3, 'purchase', 500, 600000, 'completed', $4),
        ($5, $2, $6, 'retire', 250, 0, 'completed', $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, cc1, ago(30), randomUUID(), cc3, ago(10)]);

    // ─── 3. Agent Banking V4 ─────────────────────────────────────────────────
    console.log("Seeding agent_banking_v4_agents...");
    await client.query(`
      INSERT INTO agent_banking_v4_agents (id, merchant_id, agent_code, agent_name, phone, state, lga, status, tier, float_balance, daily_limit, total_transactions, total_volume, created_at, updated_at)
      VALUES
        ($1, $2, 'AGT-001', 'Chukwuemeka Obi', '+2348012345678', 'Lagos', 'Ojo', 'active', 'gold', 250000, 500000, 1240, 18500000, $3, $3),
        ($4, $2, 'AGT-002', 'Amina Bello', '+2348023456789', 'FCT', 'Wuse', 'active', 'silver', 180000, 300000, 840, 9200000, $5, $5),
        ($6, $2, 'AGT-003', 'Taiwo Adeyemi', '+2348034567890', 'Oyo', 'Ibadan North', 'suspended', 'standard', 50000, 200000, 320, 3100000, $7, $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(45), randomUUID(), ago(30), randomUUID(), ago(20)]);

    // ─── 4. Super Agent V2 ────────────────────────────────────────────────────
    console.log("Seeding super_agent_v2_networks...");
    await client.query(`
      INSERT INTO super_agent_v2_networks (id, merchant_id, network_name, total_agents, active_agents, total_float, status, created_at)
      VALUES
        ($1, $2, 'Lagos Metro Network', 45, 42, 12500000, 'active', $3),
        ($4, $2, 'Abuja Capital Network', 28, 25, 7200000, 'active', $5)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(60), randomUUID(), ago(45)]);

    // ─── 5. Escrow V2 ─────────────────────────────────────────────────────────
    console.log("Seeding escrow_contracts_v2...");
    await client.query(`
      INSERT INTO escrow_contracts_v2 (id, merchant_id, buyer_id, seller_id, title, description, amount, currency, status, release_conditions, created_at, updated_at)
      VALUES
        ($1, $2, 'buyer-001', 'seller-001', 'Website Development Contract', 'Full-stack web app development', 1500000, 'NGN', 'funded', 'Delivery of working application', $3, $3),
        ($4, $2, 'buyer-002', 'seller-002', 'Bulk Goods Purchase', 'Electronics wholesale order', 3200000, 'NGN', 'released', 'Goods delivered and inspected', $5, $5),
        ($6, $2, 'buyer-003', 'seller-003', 'Freelance Design Work', 'Brand identity package', 450000, 'NGN', 'pending', 'Final deliverables approved', $7, $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(20), randomUUID(), ago(45), randomUUID(), ago(5)]);

    // ─── 6. Marketplace Pay ───────────────────────────────────────────────────
    console.log("Seeding marketplace_orders...");
    await client.query(`
      INSERT INTO marketplace_orders (id, merchant_id, buyer_email, seller_merchant_id, items, subtotal, platform_fee, total_amount, currency, status, payment_method, created_at, updated_at)
      VALUES
        ($1, $2, 'buyer1@example.com', 'seller-001', '[{"name":"Laptop","qty":1,"price":450000}]', 450000, 22500, 472500, 'NGN', 'completed', 'card', $3, $3),
        ($4, $2, 'buyer2@example.com', 'seller-002', '[{"name":"Phone","qty":2,"price":120000}]', 240000, 12000, 252000, 'NGN', 'pending', 'bank_transfer', $5, $5),
        ($6, $2, 'buyer3@example.com', 'seller-001', '[{"name":"Headphones","qty":1,"price":35000}]', 35000, 1750, 36750, 'NGN', 'refunded', 'card', $7, $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(10), randomUUID(), ago(3), randomUUID(), ago(15)]);

    // ─── 7. Loyalty V3 ────────────────────────────────────────────────────────
    console.log("Seeding loyalty_v3_programs...");
    const loyaltyProgramId = randomUUID();
    await client.query(`
      INSERT INTO loyalty_v3_programs (id, merchant_id, program_name, points_per_naira, redemption_rate, expiry_days, tiers, status, total_members, total_points_issued, created_at)
      VALUES ($1, $2, 'PayGate Rewards', 1, 100, 365, '["bronze","silver","gold"]', 'active', 3, 16300, $3)
      ON CONFLICT (id) DO NOTHING
    `, [loyaltyProgramId, MERCHANT_ID, ago(90)]);

    console.log("Seeding loyalty_v3_members...");
    await client.query(`
      INSERT INTO loyalty_v3_members (id, program_id, merchant_id, customer_id, customer_email, points_balance, lifetime_points, tier, joined_at)
      VALUES
        ($1, $2, $3, 'cust-alice', 'alice@example.com', 4500, 12000, 'gold', $4),
        ($5, $2, $3, 'cust-bob', 'bob@example.com', 1200, 3500, 'silver', $6),
        ($7, $2, $3, 'cust-carol', 'carol@example.com', 250, 800, 'bronze', $8)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), loyaltyProgramId, MERCHANT_ID, ago(60), randomUUID(), ago(45), randomUUID(), ago(30)]);

    // ─── 8. Crypto Offramp V2 ─────────────────────────────────────────────────
    console.log("Seeding crypto_offramp_v2_transactions...");
    await client.query(`
      INSERT INTO crypto_offramp_v2_transactions (id, merchant_id, crypto_asset, crypto_amount, fiat_currency, fiat_amount, exchange_rate, bank_code, account_number, status, tx_hash, wallet_address, created_at, updated_at)
      VALUES
        ($1, $2, 'USDT', '500.00', 'NGN', 790000, '1580.00', '058', '0123456789', 'completed', '0xtxhash001', '0xabc123def456', $3, $3),
        ($4, $2, 'USDC', '200.00', 'NGN', 314000, '1570.00', '044', '9876543210', 'pending', NULL, '0xdef456ghi789', $5, $5),
        ($6, $2, 'BTC', '0.01', 'NGN', 950000, '95000000.00', '033', '5432109876', 'completed', '0xtxhash002', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', $7, $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(5), randomUUID(), ago(2), randomUUID(), ago(15)]);

    // ─── 9. NFC Pay ───────────────────────────────────────────────────────────
    console.log("Seeding nfc_devices...");
    const nfcDev1 = randomUUID(), nfcDev2 = randomUUID(), nfcDev3 = randomUUID();
    await client.query(`
      INSERT INTO nfc_devices (id, merchant_id, device_id, device_name, device_type, status, last_seen, total_transactions, total_volume, created_at)
      VALUES
        ($1, $2, 'DEV-POS-001', 'POS Terminal 1', 'pos_terminal', 'active', $3, 420, 8500000, $4),
        ($5, $2, 'DEV-MOB-001', 'Mobile NFC Reader', 'android', 'active', $6, 280, 4200000, $7),
        ($8, $2, 'DEV-WRB-001', 'Wristband Reader', 'wearable', 'inactive', $9, 45, 650000, $10)
      ON CONFLICT (id) DO NOTHING
    `, [nfcDev1, MERCHANT_ID, ago(0.1), ago(30), nfcDev2, ago(0.5), ago(20), nfcDev3, ago(5), ago(45)]);

    console.log("Seeding nfc_transactions...");
    await client.query(`
      INSERT INTO nfc_transactions (id, merchant_id, device_id, amount, currency, card_scheme, masked_pan, status, response_code, created_at)
      VALUES
        ($1, $2, 'DEV-POS-001', 15000, 'NGN', 'mastercard', '****1234', 'approved', '00', $3),
        ($4, $2, 'DEV-MOB-001', 8500, 'NGN', 'visa', '****5678', 'approved', '00', $5),
        ($6, $2, 'DEV-POS-001', 25000, 'NGN', 'verve', '****9012', 'declined', '51', $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(1), randomUUID(), ago(2), randomUUID(), ago(3)]);

    // ─── 10. Invoice Financing V2 ─────────────────────────────────────────────
    console.log("Seeding invoice_financing_v2_applications...");
    await client.query(`
      INSERT INTO invoice_financing_v2_applications (id, merchant_id, invoice_id, invoice_amount, requested_amount, approved_amount, interest_rate, tenor_days, status, created_at, updated_at)
      VALUES
        ($1, $2, 'INV-2024-001', 2000000, 1500000, 1500000, '3.5', 30, 'disbursed', $3, $3),
        ($4, $2, 'INV-2024-002', 5000000, 3500000, NULL, '3.5', 60, 'pending', $5, $5),
        ($6, $2, 'INV-2024-003', 1200000, 900000, 900000, '4.0', 45, 'approved', $7, $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(45), randomUUID(), ago(5), randomUUID(), ago(20)]);

    // ─── 11. Payroll V3 ───────────────────────────────────────────────────────
    console.log("Seeding payroll_v3_employees...");
    await client.query(`
      INSERT INTO payroll_v3_employees (id, merchant_id, employee_id, full_name, email, department, bank_code, account_number, gross_salary, status, created_at)
      VALUES
        ($1, $2, 'EMP-001', 'Emeka Nwosu', 'emeka@paygate.ng', 'Engineering', '058', '0123456789', 450000, 'active', $3),
        ($4, $2, 'EMP-002', 'Fatima Abubakar', 'fatima@paygate.ng', 'Finance', '044', '9876543210', 380000, 'active', $5),
        ($6, $2, 'EMP-003', 'Tunde Okafor', 'tunde@paygate.ng', 'Sales', '033', '5432109876', 320000, 'active', $7),
        ($8, $2, 'EMP-004', 'Ngozi Eze', 'ngozi@paygate.ng', 'HR', '058', '1234567890', 350000, 'active', $9)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(90), randomUUID(), ago(90), randomUUID(), ago(90), randomUUID(), ago(90)]);

    console.log("Seeding payroll_v3_runs...");
    await client.query(`
      INSERT INTO payroll_v3_runs (id, merchant_id, run_name, period, total_employees, total_gross, total_deductions, total_net, status, processed_at, created_at)
      VALUES
        ($1, $2, 'March 2024 Payroll', '2024-03', 4, 1500000, 225000, 1275000, 'completed', $3, $4),
        ($5, $2, 'April 2024 Payroll', '2024-04', 4, 1500000, 225000, 1275000, 'draft', NULL, $6)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(10), ago(10), randomUUID(), ago(2)]);

    // ─── 12. Tax Filing ───────────────────────────────────────────────────────
    console.log("Seeding tax_filing_records...");
    await client.query(`
      INSERT INTO tax_filing_records (id, merchant_id, tax_type, period, taxable_amount, tax_amount, status, filed_at, receipt_number, due_date, created_at, updated_at)
      VALUES
        ($1, $2, 'VAT', 'Q1-2024', 3000000, 450000, 'filed', $3, 'VAT-2024-Q1-001', '2024-04-21', $4, $4),
        ($5, $2, 'CIT', 'FY-2023', 15000000, 2100000, 'filed', $6, 'CIT-2023-001', '2024-06-30', $7, $7),
        ($8, $2, 'WHT', 'Q1-2024', 850000, 85000, 'pending', NULL, NULL, '2024-04-21', $9, $9),
        ($10, $2, 'VAT', 'Q2-2024', 3500000, 525000, 'draft', NULL, NULL, '2024-07-21', $11, $11)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(30), ago(30), randomUUID(), ago(15), ago(15), randomUUID(), ago(5), randomUUID(), ago(1)]);

    // ─── 13. Regulatory Reporting ─────────────────────────────────────────────
    console.log("Seeding regulatory_reports...");
    await client.query(`
      INSERT INTO regulatory_reports (id, merchant_id, report_type, period, regulator, status, submitted_at, acknowledged_at, notes, created_at, updated_at)
      VALUES
        ($1, $2, 'CBN_MONTHLY', 'Q1-2024', 'CBN', 'submitted', $3, $4, 'Quarterly AML/CTR report', $5, $5),
        ($6, $2, 'NFIU_SAR', 'March-2024', 'NFIU', 'submitted', $7, NULL, 'Suspicious activity report', $8, $8),
        ($9, $2, 'CBN_ANNUAL', 'FY-2023', 'CBN', 'draft', NULL, NULL, 'Annual return filing', $10, $10)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(20), ago(18), ago(20), randomUUID(), ago(25), ago(25), randomUUID(), ago(3)]);

    // ─── 14. USDC V2 ──────────────────────────────────────────────────────────
    console.log("Seeding usdc_v2_wallets...");
    await client.query(`
      INSERT INTO usdc_v2_wallets (id, merchant_id, wallet_address, network, balance_usdc, balance_ngn, status, created_at, updated_at)
      VALUES ($1, $2, '0xPayGate123456789abcdef', 'polygon', '5000.00', 7900000, 'active', $3, $3)
      ON CONFLICT (merchant_id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(90)]);

    console.log("Seeding usdc_v2_transactions...");
    await client.query(`
      INSERT INTO usdc_v2_transactions (id, merchant_id, type, amount_usdc, amount_ngn, tx_hash, from_address, to_address, network, status, created_at)
      VALUES
        ($1, $2, 'receive', '1000.00', NULL, '0xtxhash001', '0xSender001', '0xPayGate123456789abcdef', 'polygon', 'confirmed', $3),
        ($4, $2, 'send', '500.00', NULL, '0xtxhash002', '0xPayGate123456789abcdef', '0xRecipient001', 'polygon', 'confirmed', $5),
        ($6, $2, 'convert', '200.00', 316000, NULL, '0xPayGate123456789abcdef', NULL, 'polygon', 'completed', $7)
      ON CONFLICT (id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(30), randomUUID(), ago(20), randomUUID(), ago(10)]);

    // ─── 15. Multi-Currency Ledger ────────────────────────────────────────────
    console.log("Seeding multi_currency_ledger_accounts...");
    const mclAccounts = [
      [randomUUID(), MERCHANT_ID, 'NGN', 12500000, 12000000, 500000],
      [randomUUID(), MERCHANT_ID, 'USD', 8500, 8000, 500],
      [randomUUID(), MERCHANT_ID, 'GBP', 3200, 3000, 200],
      [randomUUID(), MERCHANT_ID, 'EUR', 5100, 4800, 300],
    ];
    for (const [id, mid, currency, balance, available, reserved] of mclAccounts) {
      await client.query(`
        INSERT INTO multi_currency_ledger_accounts (id, merchant_id, currency, balance, available_balance, reserved_balance, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7)
        ON CONFLICT (id) DO NOTHING
      `, [id, mid, currency, balance, available, reserved, ago(60)]);
    }

    // ─── 16. Realtime Notification Preferences ────────────────────────────────
    console.log("Seeding realtime_notification_preferences...");
    await client.query(`
      INSERT INTO realtime_notification_preferences (id, merchant_id, webhook_enabled, email_enabled, sms_enabled, push_enabled, in_app_enabled, event_payment, event_dispute, event_payout, event_fraud, event_kyc, created_at, updated_at)
      VALUES ($1, $2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, $3, $3)
      ON CONFLICT (merchant_id) DO NOTHING
    `, [randomUUID(), MERCHANT_ID, ago(30)]);

    await client.query("COMMIT");
    console.log("\n✅ Wave 80 seed completed successfully!");
    console.log("Tables seeded:");
    console.log("  - open_banking_consents_v2 (3 records)");
    console.log("  - open_banking_accounts_v2 (2 records)");
    console.log("  - carbon_credits_v2 (3 records)");
    console.log("  - carbon_credit_transactions_v2 (2 records)");
    console.log("  - agent_banking_v4_agents (3 records)");
    console.log("  - super_agent_v2_networks (2 records)");
    console.log("  - escrow_contracts_v2 (3 records)");
    console.log("  - marketplace_orders (3 records)");
    console.log("  - loyalty_v3_programs (1 record)");
    console.log("  - loyalty_v3_members (3 records)");
    console.log("  - crypto_offramp_v2_transactions (3 records)");
    console.log("  - nfc_devices (3 records)");
    console.log("  - nfc_transactions (3 records)");
    console.log("  - invoice_financing_v2_applications (3 records)");
    console.log("  - payroll_v3_employees (4 records)");
    console.log("  - payroll_v3_runs (2 records)");
    console.log("  - tax_filing_records (4 records)");
    console.log("  - regulatory_reports (3 records)");
    console.log("  - usdc_v2_wallets (1 record)");
    console.log("  - usdc_v2_transactions (3 records)");
    console.log("  - multi_currency_ledger_accounts (4 records)");
    console.log("  - realtime_notification_preferences (1 record)");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
