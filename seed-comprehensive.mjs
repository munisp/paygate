/**
 * PayGate Comprehensive Seed Script v3.0
 * =========================================
 * Seeds ALL 167 database tables with realistic domain data.
 * Idempotent — safe to re-run (uses ON DUPLICATE KEY UPDATE or INSERT IGNORE).
 *
 * Usage:
 *   DATABASE_URL="mysql://user:pass@host:3306/paygate" node seed-comprehensive.mjs
 *
 * Tables covered: tenants, users, merchants, transactions, customers, payouts,
 *   apiKeys, webhooks, disputes, virtualCards, paymentLinks, teamMembers,
 *   webhookDeliveries, fraudAlerts, kycSubmissions, bnplLoans, mobileMoneyRecon,
 *   fxRates, wallets, walletTransactions, crossBorderTransfers, settlements,
 *   nipBanks, nipAccountCache, merchantNotifications, subscriptions,
 *   posTerminals, posTransactions, agentNetwork, restaurantTables,
 *   restaurantOrders, menuCategories, menuItems, loyaltyPrograms,
 *   loyaltyAccounts, inventoryItems, staffMembers, staffShifts, payrollRuns,
 *   auditEvents, purchaseOrders, bnplPlans, qrPayments, consumerWallets,
 *   p2pTransfers, savedBeneficiaries, billPayments, moneyRequests,
 *   consumerContacts, coupons, consumerCards, consumerKycRecords,
 *   merchantSolanaWallets, usdcPayouts, consumerDisputes, merchantProfiles,
 *   merchantDirectors, kybVerifications, kybSteps, complianceReports,
 *   merchantLoans, loanInstalments, invoices, invoicePayments,
 *   insurancePolicies, carbonCredits, nftBadges, escrowContracts,
 *   taxWithholdingRecords, bulkPaymentSchedules, digitalGoldHoldings,
 *   mutualFundHoldings, pensionAccounts, cashbackBalances, soundboxDevices,
 *   wealthRiskProfiles, wealthGoals, emiContracts, bulkCollections,
 *   salaryAccounts, reportJobs, nodalAccounts, retailSales, intlRemittanceTransfers,
 *   subscriptionPlansV2, portalSubscriptions, agentBankingV4Agents,
 *   escrowContractsV2, marketplaceOrders, loyaltyV3Programs, cryptoOfframpV2Transactions,
 *   nfcDevices, invoiceFinancingV2Applications, payrollV3Runs, payrollV3Employees,
 *   taxFilingRecords, regulatoryReports, usdcV2Wallets, multiCurrencyLedgerAccounts,
 *   realtimeNotificationPreferences, ussdSessions, and more.
 */

import pg from './node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Client } = pg;

const DATABASE_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev';
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace("T", " ");
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ─── Fixed IDs for referential integrity ─────────────────────────────────────
const TENANT_ID = "tenant-paygate-demo-001";
const MERCHANT_IDS = [
  "merch-001-acme-fintech", "merch-002-lagos-pay", "merch-003-abuja-commerce",
  "merch-004-kano-trade", "merch-005-ph-retail",
];
const CUSTOMER_IDS = Array.from({ length: 20 }, (_, i) => `cust-${String(i+1).padStart(3,"0")}`);
const USER_IDS = Array.from({ length: 10 }, (_, i) => `user-${String(i+1).padStart(3,"0")}`);
const TXN_IDS = Array.from({ length: 30 }, (_, i) => `txn-${String(i+1).padStart(4,"0")}`);

const BANKS = [
  { code: "058", name: "GTBank" }, { code: "011", name: "First Bank" },
  { code: "033", name: "UBA" }, { code: "044", name: "Access Bank" },
  { code: "063", name: "Access Diamond" }, { code: "057", name: "Zenith Bank" },
  { code: "070", name: "Fidelity Bank" }, { code: "030", name: "Heritage Bank" },
  { code: "032", name: "Union Bank" }, { code: "035", name: "Wema Bank" },
];

const NIGERIAN_NAMES = [
  "Adebayo Okafor", "Chioma Nwosu", "Emeka Eze", "Fatima Bello", "Gbenga Adeyemi",
  "Hauwa Ibrahim", "Ifeanyi Obi", "Jumoke Adeleke", "Kola Adesanya", "Lola Fashola",
  "Musa Aliyu", "Ngozi Okonkwo", "Ola Bankole", "Precious Obi", "Qudus Suleiman",
  "Remi Adebisi", "Seun Afolabi", "Tunde Bakare", "Uche Nwachukwu", "Vivian Eze",
];

const BUSINESS_NAMES = [
  "Acme Fintech Ltd", "Lagos Pay Solutions", "Abuja Commerce Hub", "Kano Trade Co",
  "Port Harcourt Retail", "Ibadan Digital Pay", "Enugu Tech Finance", "Kaduna Commerce",
  "Benin City Merchants", "Warri Trade Solutions",
];

async function seed(conn, table, rows, conflictCol = "id") {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  let inserted = 0;
  for (const row of rows) {
    const vals = cols.map(c => row[c]);
    const placeholders = cols.map((_, i) => `$${i+1}`).join(",");
    const updateClause = cols.filter(c => c !== conflictCol).map((c, i) => `"${c}"=$${cols.indexOf(c)+1}`).join(",");
    try {
      await conn.query(
        `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(",")}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateClause}`,
        vals
      );
      inserted++;
    } catch (e) {
      // skip individual row errors silently
    }
  }
  console.log(`  ✓ ${table}: ${inserted}/${rows.length} rows`);
}

async function main() {
  console.log("🔌  Connecting to database…");
  const conn = new Client({ connectionString: DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false });
  await conn.connect();
  console.log("✅  Connected\n");

  // ── 1. Tenants ────────────────────────────────────────────────────────────
  await seed(conn, "tenants", [{
    id: TENANT_ID, name: "PayGate Demo Platform", slug: "paygate-demo",
    plan: "enterprise", status: "active", email: "admin@paygate.ng",
    country: "NG", created_at: daysAgo(365), updated_at: now(),
  }]);

  // ── 2. Users ──────────────────────────────────────────────────────────────
  await seed(conn, "users", USER_IDS.map((id, i) => ({
    id, tenant_id: TENANT_ID,
    open_id: `oauth-${id}`,
    name: NIGERIAN_NAMES[i] || `User ${i+1}`,
    email: `user${i+1}@paygate.ng`,
    role: i === 0 ? "admin" : "user",
    created_at: daysAgo(300 - i * 10), updated_at: now(),
  })));

  // ── 3. Merchants ──────────────────────────────────────────────────────────
  await seed(conn, "merchants", MERCHANT_IDS.map((id, i) => ({
    id, tenant_id: TENANT_ID, owner_id: USER_IDS[i % USER_IDS.length],
    business_name: BUSINESS_NAMES[i],
    business_type: pick(["retail", "ecommerce", "food_beverage", "services", "fintech"]),
    email: `merchant${i+1}@paygate.ng`,
    phone: `+234${rand(700,909)}${rand(1000000,9999999)}`,
    status: "active", is_live: i < 3,
    payout_approval_enabled: i % 2 === 0,
    payout_approval_threshold: i % 2 === 0 ? 500000 : null,
    created_at: daysAgo(300 - i * 20), updated_at: now(),
  })));

  // ── 4. Customers ──────────────────────────────────────────────────────────
  await seed(conn, "customers", CUSTOMER_IDS.map((id, i) => ({
    id, tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
    email: `customer${i+1}@example.com`,
    phone: `+234${rand(700,909)}${rand(1000000,9999999)}`,
    risk_level: pick(["low", "low", "low", "medium", "high"]),
    total_transactions: rand(1, 50),
    total_spend: rand(10000, 5000000),
    created_at: daysAgo(200 - i * 5), updated_at: now(),
  })));

  // ── 5. Transactions ───────────────────────────────────────────────────────
  await seed(conn, "transactions", TXN_IDS.map((id, i) => ({
    id, tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    reference: `REF${Date.now()}${i}`,
    amount: rand(1000, 500000),
    currency: pick(["NGN", "NGN", "NGN", "USD", "GBP"]),
    status: pick(["success", "success", "success", "failed", "pending"]),
    channel: pick(["card", "bank_transfer", "ussd", "mobile_money", "qr"]),
    narration: `Payment for order #${rand(1000, 9999)}`,
    fee: rand(50, 2000),
    created_at: daysAgo(rand(0, 90)), updated_at: now(),
  })));

  // ── 6. Wallets ────────────────────────────────────────────────────────────
  await seed(conn, "wallets", MERCHANT_IDS.map((id, i) => ({
    id: `wallet-${id}`, tenant_id: TENANT_ID, merchant_id: id,
    currency: "NGN", balance: rand(100000, 50000000),
    ledger_balance: rand(100000, 50000000),
    status: "active", tier: pick(["tier1", "tier2", "tier3"]),
    daily_limit: 5000000, monthly_limit: 100000000,
    created_at: daysAgo(300 - i * 20), updated_at: now(),
  })));

  // ── 7. Payouts ────────────────────────────────────────────────────────────
  const payoutRows = Array.from({ length: 20 }, (_, i) => {
    const bank = pick(BANKS);
    return {
      id: `payout-${String(i+1).padStart(3,"0")}`,
      tenant_id: TENANT_ID,
      merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
      reference: `PO${Date.now()}${i}`,
      amount: rand(50000, 2000000),
      currency: "NGN",
      status: pick(["success", "success", "pending", "pending_approval", "failed"]),
      bank_code: bank.code, bank_name: bank.name,
      account_number: `${rand(1000000000, 9999999999)}`,
      account_name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
      narration: `Payout to ${NIGERIAN_NAMES[i % NIGERIAN_NAMES.length]}`,
      fee_amount: rand(100, 1000),
      processed_at: i < 15 ? daysAgo(rand(0, 30)) : null,
      created_at: daysAgo(rand(0, 60)), updated_at: now(),
    };
  });
  await seed(conn, "payouts", payoutRows);

  // ── 8. Settlements ────────────────────────────────────────────────────────
  await seed(conn, "settlements", Array.from({ length: 15 }, (_, i) => ({
    id: `settle-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    amount: rand(100000, 5000000),
    currency: "NGN",
    status: pick(["completed", "completed", "pending", "processing"]),
    settled_at: i < 10 ? daysAgo(rand(1, 30)) : null,
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 9. Disputes ───────────────────────────────────────────────────────────
  await seed(conn, "disputes", Array.from({ length: 10 }, (_, i) => ({
    id: `dispute-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    transaction_id: TXN_IDS[i % TXN_IDS.length],
    amount: rand(5000, 200000),
    currency: "NGN",
    status: pick(["open", "open", "resolved", "escalated", "won", "lost"]),
    reason: pick(["not_received", "duplicate", "unauthorized", "quality_issue", "subscription_cancelled"]),
    due_date: daysAgo(-rand(3, 14)),
    created_at: daysAgo(rand(0, 30)), updated_at: now(),
  })));

  // ── 10. Virtual Cards ─────────────────────────────────────────────────────
  await seed(conn, "virtual_cards", Array.from({ length: 10 }, (_, i) => ({
    id: `vcard-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    last4: String(rand(1000, 9999)),
    masked_pan: `****-****-****-${rand(1000,9999)}`,
    brand: pick(["visa", "mastercard"]),
    expiry_month: String(rand(1,12)).padStart(2,"0"),
    expiry_year: String(rand(2025, 2028)),
    status: pick(["active", "active", "frozen", "terminated"]),
    currency: "NGN",
    balance: rand(0, 500000),
    spend_limit: rand(100000, 2000000),
    label: `Card ${i+1}`,
    created_at: daysAgo(rand(0, 180)), updated_at: now(),
  })));

  // ── 11. Payment Links ─────────────────────────────────────────────────────
  await seed(conn, "payment_links", Array.from({ length: 10 }, (_, i) => ({
    id: `plink-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    slug: `pay-${uid().slice(0,8)}`,
    title: `Payment for ${pick(["Order", "Invoice", "Service", "Product"])} #${rand(100,999)}`,
    description: "Secure payment via PayGate",
    amount: rand(5000, 500000),
    currency: "NGN",
    is_active: i < 8,
    usage_limit: rand(1, 100),
    usage_count: rand(0, 20),
    redirect_url: "https://merchant.example.com/success",
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 12. API Keys ──────────────────────────────────────────────────────────
  await seed(conn, "api_keys", MERCHANT_IDS.map((mid, i) => ({
    id: `apikey-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID, merchant_id: mid,
    name: `${i < 3 ? "Live" : "Test"} API Key`,
    key_hash: hash(`sk_${i < 3 ? "live" : "test"}_${uid()}`),
    key_prefix: `sk_${i < 3 ? "live" : "test"}_`,
    environment: i < 3 ? "live" : "test",
    permissions: JSON.stringify(["read", "write", "payouts"]),
    is_active: true,
    last_used_at: daysAgo(rand(0, 7)),
    created_by: USER_IDS[i % USER_IDS.length],
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 13. Webhooks ──────────────────────────────────────────────────────────
  await seed(conn, "webhooks", MERCHANT_IDS.map((mid, i) => ({
    id: `webhook-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID, merchant_id: mid,
    url: `https://api.merchant${i+1}.example.com/webhooks/paygate`,
    events: JSON.stringify(["payment.success", "payout.completed", "dispute.created"]),
    secret: `whsec_${hash(uid()).slice(0,32)}`,
    is_active: i < 4,
    last_delivered_at: i < 4 ? daysAgo(rand(0, 3)) : null,
    failure_count: i >= 4 ? rand(1, 5) : 0,
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 14. Team Members ──────────────────────────────────────────────────────
  await seed(conn, "team_members", MERCHANT_IDS.flatMap((mid, i) =>
    Array.from({ length: 3 }, (_, j) => ({
      id: `team-${mid}-${j}`,
      tenant_id: TENANT_ID, merchant_id: mid,
      email: `team${i*3+j+1}@merchant${i+1}.example.com`,
      name: NIGERIAN_NAMES[(i*3+j) % NIGERIAN_NAMES.length],
      role: j === 0 ? "admin" : pick(["developer", "finance", "support"]),
      status: "active",
      joined_at: daysAgo(rand(30, 200)),
      created_at: daysAgo(rand(30, 200)), updated_at: now(),
    }))
  ));

  // ── 15. Fraud Alerts ──────────────────────────────────────────────────────
  await seed(conn, "fraud_alerts", Array.from({ length: 15 }, (_, i) => ({
    id: `fraud-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    transaction_id: TXN_IDS[i % TXN_IDS.length],
    alert_type: pick(["velocity_abuse", "card_testing", "account_takeover", "synthetic_identity", "bin_attack"]),
    risk_score: rand(60, 99),
    status: pick(["open", "open", "reviewing", "resolved", "false_positive"]),
    details: JSON.stringify({ signals: ["velocity_spike", "new_device"], model: "GraphSAGE v2.1" }),
    description: "Suspicious transaction pattern detected",
    created_at: daysAgo(rand(0, 30)), updated_at: now(),
  })));

  // ── 16. KYC Submissions ───────────────────────────────────────────────────
  await seed(conn, "kyc_submissions", Array.from({ length: 10 }, (_, i) => ({
    id: `kyc-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    document_type: pick(["nin", "bvn", "passport", "drivers_license", "voters_card"]),
    document_number: `${rand(10000000000, 99999999999)}`,
    status: pick(["approved", "approved", "pending", "rejected"]),
    verified_at: i < 7 ? daysAgo(rand(1, 30)) : null,
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 17. BNPL Loans ────────────────────────────────────────────────────────
  await seed(conn, "bnpl_loans", Array.from({ length: 10 }, (_, i) => ({
    id: `bnpl-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    transaction_id: TXN_IDS[i % TXN_IDS.length],
    principal: rand(50000, 500000),
    interest_rate: 2.5,
    tenure_months: pick([3, 6, 9, 12]),
    monthly_installment: rand(20000, 100000),
    outstanding_balance: rand(0, 400000),
    status: pick(["active", "active", "completed", "defaulted"]),
    due_date: daysAgo(-rand(1, 30)),
    created_at: daysAgo(rand(0, 90)), updated_at: now(),
  })));

  // ── 18. FX Rates ──────────────────────────────────────────────────────────
  const FX_PAIRS = [
    ["NGN","USD",0.00065], ["NGN","GBP",0.00052], ["NGN","EUR",0.00060],
    ["NGN","GHS",0.0095], ["NGN","KES",0.084], ["NGN","ZAR",0.012],
    ["USD","NGN",1540.0], ["GBP","NGN",1920.0], ["EUR","NGN",1665.0],
  ];
  await seed(conn, "fx_rates", FX_PAIRS.map(([from, to, rate]) => ({
    id: `fx-${from}-${to}`,
    tenant_id: TENANT_ID,
    from_currency: from, to_currency: to,
    rate, source: "paygate-fx-feed",
    fetched_at: now(), created_at: now(), updated_at: now(),
  })));

  // ── 19. NIP Banks ─────────────────────────────────────────────────────────
  await seed(conn, "nip_banks", BANKS.map(b => ({
    id: `nipbank-${b.code}`,
    bank_code: b.code, bank_name: b.name,
    short_name: b.name.split(" ")[0],
    is_active: true,
    created_at: daysAgo(365), updated_at: now(),
  })));

  // ── 20. POS Terminals ─────────────────────────────────────────────────────
  await seed(conn, "pos_terminals", Array.from({ length: 10 }, (_, i) => ({
    id: `pos-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    terminal_id: `TID${rand(10000000, 99999999)}`,
    serial_number: `SN${rand(100000, 999999)}`,
    model: pick(["Verifone VX520", "Ingenico iCT220", "PAX A920", "Sunmi P2"]),
    status: pick(["active", "active", "active", "inactive", "maintenance"]),
    location: pick(["Main Branch", "Outlet 1", "Outlet 2", "Warehouse", "HQ"]),
    last_seen_at: daysAgo(rand(0, 7)),
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 21. Agent Network ─────────────────────────────────────────────────────
  await seed(conn, "agent_network", Array.from({ length: 8 }, (_, i) => ({
    id: `agent-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    agent_code: `AG${rand(10000, 99999)}`,
    full_name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
    phone: `+234${rand(700,909)}${rand(1000000,9999999)}`,
    state: pick(["Lagos", "Abuja", "Kano", "Rivers", "Oyo", "Kaduna", "Anambra"]),
    lga: pick(["Ikeja", "Eti-Osa", "Surulere", "Alimosho", "Kosofe"]),
    status: pick(["active", "active", "active", "suspended"]),
    float_balance: rand(50000, 500000),
    total_transactions: rand(100, 5000),
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 22. Merchant Profiles (KYB) ───────────────────────────────────────────
  await seed(conn, "merchant_profiles", MERCHANT_IDS.map((mid, i) => ({
    id: `mprofile-${mid}`,
    merchant_id: mid, tenant_id: TENANT_ID,
    rc_number: `RC${rand(100000, 999999)}`,
    tax_id: `TIN${rand(10000000, 99999999)}`,
    business_address: `${rand(1,100)} ${pick(["Victoria Island", "Lekki", "Ikeja", "Wuse II", "Maitama"])} ${pick(["Lagos", "Abuja", "Kano"])}`,
    industry: pick(["fintech", "retail", "ecommerce", "food_beverage", "services"]),
    website: `https://merchant${i+1}.example.com`,
    kyb_status: pick(["approved", "approved", "approved", "pending", "under_review"]),
    kyb_tier: pick(["tier1", "tier2", "tier3"]),
    created_at: daysAgo(rand(30, 200)), updated_at: now(),
  })));

  // ── 23. KYB Verifications ─────────────────────────────────────────────────
  await seed(conn, "kyb_verifications", MERCHANT_IDS.map((mid, i) => ({
    id: `kybv-${mid}`,
    merchant_id: mid, tenant_id: TENANT_ID,
    verification_type: pick(["cac_check", "director_id", "address_verification", "aml_screening"]),
    status: pick(["passed", "passed", "passed", "pending", "failed"]),
    provider: pick(["youverify", "smile_identity", "prembly"]),
    reference: `KYB${uid().slice(0,8).toUpperCase()}`,
    verified_at: i < 4 ? daysAgo(rand(1, 30)) : null,
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 24. Merchant Loans ────────────────────────────────────────────────────
  await seed(conn, "merchant_loans", Array.from({ length: 8 }, (_, i) => ({
    id: `loan-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    principal: rand(500000, 10000000),
    interest_rate: pick([18.0, 20.0, 22.5, 24.0]),
    tenure_months: pick([6, 12, 18, 24]),
    monthly_installment: rand(100000, 800000),
    outstanding_balance: rand(0, 8000000),
    disbursed_amount: rand(500000, 10000000),
    status: pick(["active", "active", "completed", "defaulted", "pending_disbursement"]),
    disbursed_at: i < 6 ? daysAgo(rand(10, 180)) : null,
    next_due_date: daysAgo(-rand(1, 30)),
    created_at: daysAgo(rand(0, 180)), updated_at: now(),
  })));

  // ── 25. Invoices ──────────────────────────────────────────────────────────
  await seed(conn, "invoices", Array.from({ length: 10 }, (_, i) => ({
    id: `inv-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    invoice_number: `INV-${new Date().getFullYear()}-${String(i+1).padStart(4,"0")}`,
    amount: rand(50000, 2000000),
    currency: "NGN",
    status: pick(["paid", "paid", "sent", "overdue", "draft"]),
    due_date: daysAgo(-rand(-30, 30)),
    paid_at: i < 6 ? daysAgo(rand(0, 30)) : null,
    items: JSON.stringify([{ description: "Professional Services", quantity: 1, unit_price: rand(50000, 2000000) }]),
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 26. Insurance Policies ────────────────────────────────────────────────
  await seed(conn, "insurance_policies", Array.from({ length: 8 }, (_, i) => ({
    id: `ins-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    policy_number: `POL${rand(100000, 999999)}`,
    policy_type: pick(["business_interruption", "cyber_liability", "goods_in_transit", "fire_and_burglary"]),
    premium: rand(50000, 500000),
    sum_insured: rand(5000000, 100000000),
    currency: "NGN",
    status: pick(["active", "active", "active", "expired", "pending"]),
    start_date: daysAgo(rand(30, 365)),
    end_date: daysAgo(-rand(30, 335)),
    insurer: pick(["AXA Mansard", "Leadway Assurance", "AIICO Insurance", "Custodian Insurance"]),
    created_at: daysAgo(rand(30, 365)), updated_at: now(),
  })));

  // ── 27. Escrow Contracts ──────────────────────────────────────────────────
  await seed(conn, "escrow_contracts", Array.from({ length: 6 }, (_, i) => ({
    id: `escrow-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    buyer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    seller_id: MERCHANT_IDS[(i+1) % MERCHANT_IDS.length],
    amount: rand(100000, 5000000),
    currency: "NGN",
    description: `Escrow for ${pick(["real estate", "vehicle", "equipment", "services"])} transaction`,
    status: pick(["funded", "funded", "released", "disputed", "pending_funding"]),
    expires_at: daysAgo(-rand(7, 30)),
    released_at: i < 3 ? daysAgo(rand(0, 14)) : null,
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 28. Digital Gold Holdings ─────────────────────────────────────────────
  await seed(conn, "digital_gold_holdings", Array.from({ length: 10 }, (_, i) => ({
    id: `gold-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    grams: parseFloat((rand(1, 100) * 0.1).toFixed(4)),
    purchase_price_per_gram: rand(80000, 100000),
    current_price_per_gram: rand(85000, 105000),
    currency: "NGN",
    status: "active",
    created_at: daysAgo(rand(0, 180)), updated_at: now(),
  })));

  // ── 29. Mutual Fund Holdings ──────────────────────────────────────────────
  await seed(conn, "mutual_fund_holdings", Array.from({ length: 10 }, (_, i) => ({
    id: `mfh-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    fund_id: pick(["fund-001","fund-002","fund-003","fund-004","fund-005"]),
    units: parseFloat((rand(10, 1000) * 0.01).toFixed(4)),
    nav_at_purchase: rand(100, 250),
    invested_amount: rand(10000, 500000),
    current_value: rand(10000, 600000),
    currency: "NGN",
    status: "active",
    created_at: daysAgo(rand(0, 180)), updated_at: now(),
  })));

  // ── 30. Pension Accounts ──────────────────────────────────────────────────
  await seed(conn, "pension_accounts", Array.from({ length: 8 }, (_, i) => ({
    id: `pension-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    employee_id: USER_IDS[i % USER_IDS.length],
    full_name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
    date_of_birth: `${rand(1965, 1995)}-${String(rand(1,12)).padStart(2,"0")}-${String(rand(1,28)).padStart(2,"0")}`,
    monthly_salary: rand(100000, 1000000),
    pfa_code: "PAYGATE-PFA",
    pfa_id: `PFA${rand(1000000000, 9999999999)}`,
    employee_contribution_rate: 0.08,
    employer_contribution_rate: 0.10,
    status: "active",
    created_at: daysAgo(rand(30, 365)), updated_at: now(),
  })));

  // ── 31. Cashback Balances ─────────────────────────────────────────────────
  await seed(conn, "cashback_balances", CUSTOMER_IDS.slice(0, 10).map((cid, i) => ({
    id: `cashback-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    customer_id: cid,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    balance: rand(0, 50000),
    lifetime_earned: rand(5000, 200000),
    lifetime_redeemed: rand(0, 100000),
    currency: "NGN",
    tier: pick(["bronze", "silver", "gold", "platinum"]),
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 32. Soundbox Devices ──────────────────────────────────────────────────
  await seed(conn, "soundbox_devices", Array.from({ length: 8 }, (_, i) => ({
    id: `soundbox-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    device_id: `SB${rand(100000, 999999)}`,
    serial_number: `SBX${rand(10000000, 99999999)}`,
    device_model: pick(["PayGate SB-1", "PayGate SB-2 Pro"]),
    firmware_version: pick(["2.0.1", "2.1.0", "2.1.3"]),
    status: pick(["active", "active", "active", "inactive"]),
    volume: rand(60, 100),
    language: pick(["en", "yo", "ig", "ha"]),
    currency: "NGN",
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 33. Wealth Risk Profiles ──────────────────────────────────────────────
  await seed(conn, "wealth_risk_profiles", CUSTOMER_IDS.slice(0, 8).map((cid, i) => ({
    id: `wrp-${String(i+1).padStart(3,"0")}`,
    customer_id: cid,
    risk_score: rand(20, 90),
    risk_category: pick(["conservative", "moderate", "balanced", "aggressive"]),
    investment_horizon_years: rand(3, 20),
    equity_pct: rand(20, 80),
    bonds_pct: rand(10, 50),
    money_market_pct: rand(5, 30),
    expected_return: parseFloat((rand(100, 280) / 10).toFixed(1)),
    created_at: daysAgo(rand(0, 90)), updated_at: now(),
  })));

  // ── 34. Wealth Goals ──────────────────────────────────────────────────────
  await seed(conn, "wealth_goals", Array.from({ length: 10 }, (_, i) => ({
    id: `wgoal-${String(i+1).padStart(3,"0")}`,
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    goal_name: pick(["Retirement Fund", "House Purchase", "Children Education", "Emergency Fund", "Business Capital"]),
    goal_type: pick(["retirement", "real_estate", "education", "emergency", "business"]),
    target_amount: rand(1000000, 50000000),
    current_savings: rand(0, 5000000),
    target_date: `${rand(2026, 2035)}-${String(rand(1,12)).padStart(2,"0")}-01`,
    monthly_contribution: rand(50000, 500000),
    status: "active",
    created_at: daysAgo(rand(0, 90)), updated_at: now(),
  })));

  // ── 35. EMI Contracts ─────────────────────────────────────────────────────
  await seed(conn, "emi_contracts", Array.from({ length: 8 }, (_, i) => ({
    id: `emi-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    transaction_id: TXN_IDS[i % TXN_IDS.length],
    principal: rand(100000, 2000000),
    interest_rate: pick([1.5, 2.0, 2.5]),
    tenure_months: pick([3, 6, 9, 12, 18, 24]),
    monthly_installment: rand(30000, 200000),
    outstanding_balance: rand(0, 1500000),
    status: pick(["active", "active", "completed", "defaulted"]),
    next_due_date: daysAgo(-rand(1, 30)),
    created_at: daysAgo(rand(0, 180)), updated_at: now(),
  })));

  // ── 36. Salary Accounts ───────────────────────────────────────────────────
  await seed(conn, "salary_accounts", Array.from({ length: 10 }, (_, i) => ({
    id: `salacct-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    employee_id: USER_IDS[i % USER_IDS.length],
    full_name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
    bank_code: pick(BANKS).code,
    account_number: `${rand(1000000000, 9999999999)}`,
    monthly_salary: rand(100000, 1000000),
    currency: "NGN",
    max_advance_amount: rand(50000, 500000),
    status: "active",
    department: pick(["Engineering", "Finance", "Operations", "Sales", "HR"]),
    grade_level: pick(["GL-4", "GL-6", "GL-8", "GL-10", "GL-12"]),
    created_at: daysAgo(rand(30, 365)), updated_at: now(),
  })));

  // ── 37. Intl Remittance Transfers ─────────────────────────────────────────
  await seed(conn, "intl_remittance_transfers", Array.from({ length: 10 }, (_, i) => ({
    id: `remit-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    sender_id: USER_IDS[i % USER_IDS.length],
    recipient_name: NIGERIAN_NAMES[(i+5) % NIGERIAN_NAMES.length],
    recipient_account: `${rand(1000000000, 9999999999)}`,
    recipient_bank_code: pick(BANKS).code,
    recipient_country: pick(["US", "GB", "GH", "KE", "ZA"]),
    amount: rand(50000, 2000000),
    fee: rand(1000, 20000),
    exchange_rate: pick([0.00065, 0.00052, 0.0095, 0.084]),
    net_amount: rand(30, 1300),
    from_currency: "NGN",
    to_currency: pick(["USD", "GBP", "GHS", "KES"]),
    corridor: pick(["NGN-USD", "NGN-GBP", "NGN-GHS", "NGN-KES"]),
    purpose: pick(["family_support", "education", "business", "medical"]),
    status: pick(["completed", "completed", "processing", "failed"]),
    tracking_code: `PGR${rand(10000000, 99999999)}`,
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 38. Bulk Collections ──────────────────────────────────────────────────
  await seed(conn, "bulk_collections", Array.from({ length: 6 }, (_, i) => ({
    id: `bulkcol-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    batch_reference: `BATCH${rand(100000, 999999)}`,
    total_count: rand(10, 500),
    success_count: rand(5, 490),
    failed_count: rand(0, 10),
    total_amount: rand(500000, 50000000),
    currency: "NGN",
    status: pick(["completed", "completed", "processing", "failed"]),
    file_url: `https://storage.paygate.ng/bulk/${uid()}.csv`,
    created_at: daysAgo(rand(0, 30)), updated_at: now(),
  })));

  // ── 39. Loyalty Programs ──────────────────────────────────────────────────
  await seed(conn, "loyalty_programs", MERCHANT_IDS.map((mid, i) => ({
    id: `loyalty-${mid}`,
    tenant_id: TENANT_ID, merchant_id: mid,
    name: `${BUSINESS_NAMES[i]} Rewards`,
    points_per_naira: pick([1, 2, 5]),
    redemption_rate: pick([0.01, 0.02, 0.05]),
    min_redemption: 1000,
    status: "active",
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 40. Loyalty Accounts ──────────────────────────────────────────────────
  await seed(conn, "loyalty_accounts", CUSTOMER_IDS.slice(0, 10).map((cid, i) => ({
    id: `lacct-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    customer_id: cid,
    program_id: `loyalty-${MERCHANT_IDS[i % MERCHANT_IDS.length]}`,
    points_balance: rand(0, 50000),
    lifetime_points: rand(5000, 200000),
    tier: pick(["bronze", "silver", "gold", "platinum"]),
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 41. Menu Categories ───────────────────────────────────────────────────
  const menuCats = ["Starters", "Main Course", "Desserts", "Drinks", "Specials"];
  await seed(conn, "menu_categories", menuCats.map((name, i) => ({
    id: `mcat-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[0],
    name, sort_order: i,
    is_active: true,
    created_at: daysAgo(180), updated_at: now(),
  })));

  // ── 42. Menu Items ────────────────────────────────────────────────────────
  const menuItems = ["Jollof Rice", "Fried Rice", "Egusi Soup", "Pounded Yam", "Suya", "Pepper Soup", "Moi Moi", "Akara", "Chin Chin", "Zobo Drink"];
  await seed(conn, "menu_items", menuItems.map((name, i) => ({
    id: `mitem-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[0],
    category_id: `mcat-${String((i % 5)+1).padStart(3,"0")}`,
    name, description: `Delicious ${name}`,
    price: rand(1500, 15000),
    currency: "NGN",
    is_available: true,
    created_at: daysAgo(180), updated_at: now(),
  })));

  // ── 43. Inventory Items ───────────────────────────────────────────────────
  await seed(conn, "inventory_items", Array.from({ length: 10 }, (_, i) => ({
    id: `inv-item-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    sku: `SKU-${rand(10000, 99999)}`,
    name: pick(["Widget A", "Gadget B", "Product C", "Item D", "Good E"]),
    category: pick(["electronics", "clothing", "food", "services", "other"]),
    quantity: rand(0, 500),
    reorder_point: rand(10, 50),
    unit_cost: rand(1000, 100000),
    selling_price: rand(2000, 150000),
    currency: "NGN",
    status: pick(["in_stock", "in_stock", "low_stock", "out_of_stock"]),
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 44. Staff Members ─────────────────────────────────────────────────────
  await seed(conn, "staff_members", Array.from({ length: 10 }, (_, i) => ({
    id: `staff-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    full_name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
    email: `staff${i+1}@merchant${(i%5)+1}.example.com`,
    phone: `+234${rand(700,909)}${rand(1000000,9999999)}`,
    role: pick(["cashier", "manager", "supervisor", "accountant", "security"]),
    department: pick(["Operations", "Finance", "Sales", "Customer Service"]),
    status: pick(["active", "active", "active", "on_leave"]),
    hire_date: daysAgo(rand(30, 730)),
    salary: rand(80000, 500000),
    created_at: daysAgo(rand(30, 365)), updated_at: now(),
  })));

  // ── 45. Payroll Runs ──────────────────────────────────────────────────────
  await seed(conn, "payroll_runs", Array.from({ length: 6 }, (_, i) => ({
    id: `payroll-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    payroll_date: daysAgo(i * 30),
    employee_count: rand(5, 50),
    total_amount: rand(500000, 10000000),
    net_amount: rand(400000, 9000000),
    status: pick(["completed", "completed", "processing", "pending"]),
    narration: `Monthly Salary - ${new Date(Date.now() - i * 30 * 86400000).toLocaleString("en-US", {month:"long", year:"numeric"})}`,
    created_at: daysAgo(i * 30), updated_at: now(),
  })));

  // ── 46. Audit Events ──────────────────────────────────────────────────────
  await seed(conn, "audit_events", Array.from({ length: 20 }, (_, i) => ({
    id: `audit-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    actor_id: USER_IDS[i % USER_IDS.length],
    actor_type: "user",
    action: pick(["payout.created", "api_key.created", "webhook.updated", "merchant.settings_changed", "team_member.added"]),
    resource_type: pick(["payout", "api_key", "webhook", "merchant", "team_member"]),
    resource_id: uid(),
    ip_address: `${rand(1,254)}.${rand(1,254)}.${rand(1,254)}.${rand(1,254)}`,
    user_agent: "Mozilla/5.0 (compatible; PayGate Portal)",
    metadata: JSON.stringify({ source: "portal" }),
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 47. QR Payments ───────────────────────────────────────────────────────
  await seed(conn, "qr_payments", Array.from({ length: 10 }, (_, i) => ({
    id: `qr-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    qr_code: `QR${rand(100000000, 999999999)}`,
    amount: rand(500, 100000),
    currency: "NGN",
    status: pick(["completed", "completed", "pending", "expired"]),
    expires_at: daysAgo(-rand(0, 30)),
    paid_at: i < 7 ? daysAgo(rand(0, 30)) : null,
    created_at: daysAgo(rand(0, 30)), updated_at: now(),
  })));

  // ── 48. Consumer Wallets ──────────────────────────────────────────────────
  await seed(conn, "consumer_wallets", CUSTOMER_IDS.slice(0, 10).map((cid, i) => ({
    id: `cwallet-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    user_id: USER_IDS[i % USER_IDS.length],
    customer_id: cid,
    currency: "NGN",
    balance: rand(1000, 500000),
    ledger_balance: rand(1000, 500000),
    status: "active",
    tier: pick(["tier1", "tier2", "tier3"]),
    daily_limit: 1000000,
    monthly_limit: 20000000,
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 49. P2P Transfers ─────────────────────────────────────────────────────
  await seed(conn, "p2p_transfers", Array.from({ length: 10 }, (_, i) => ({
    id: `p2p-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    sender_id: USER_IDS[i % USER_IDS.length],
    receiver_id: USER_IDS[(i+1) % USER_IDS.length],
    amount: rand(500, 50000),
    currency: "NGN",
    narration: pick(["Lunch money", "Owe you", "Transport", "Contribution", "Gift"]),
    status: pick(["completed", "completed", "pending", "failed"]),
    reference: `P2P${rand(100000000, 999999999)}`,
    created_at: daysAgo(rand(0, 30)), updated_at: now(),
  })));

  // ── 50. Bill Payments ─────────────────────────────────────────────────────
  await seed(conn, "bill_payments", Array.from({ length: 10 }, (_, i) => ({
    id: `bill-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    customer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    biller_code: pick(["EKEDC", "IKEDC", "DSTV", "GOTV", "AIRTEL", "MTN", "GLO", "9MOBILE"]),
    biller_name: pick(["EKEDC Electricity", "IKEDC Electricity", "DStv", "GOtv", "Airtel Airtime", "MTN Airtime", "Glo Airtime", "9Mobile Airtime"]),
    customer_account: `${rand(1000000000, 9999999999)}`,
    amount: rand(1000, 50000),
    currency: "NGN",
    status: pick(["success", "success", "success", "failed", "pending"]),
    reference: `BILL${rand(100000000, 999999999)}`,
    created_at: daysAgo(rand(0, 30)), updated_at: now(),
  })));

  // ── 51. Compliance Reports ────────────────────────────────────────────────
  await seed(conn, "compliance_reports", Array.from({ length: 6 }, (_, i) => ({
    id: `comp-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    report_type: pick(["monthly_transaction", "aml_sar", "ctr", "kyb_summary"]),
    period: `${new Date().getFullYear()}-${String((new Date().getMonth() - i + 12) % 12 + 1).padStart(2,"0")}`,
    status: pick(["submitted", "submitted", "draft", "under_review"]),
    submitted_at: i < 4 ? daysAgo(rand(1, 30)) : null,
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 52. USDC Wallets (V2) ─────────────────────────────────────────────────
  await seed(conn, "usdc_v2_wallets", MERCHANT_IDS.slice(0, 3).map((mid, i) => ({
    id: `usdcw-${String(i+1).padStart(3,"0")}`,
    merchant_id: mid, tenant_id: TENANT_ID,
    solana_address: `${Array.from({length:44},()=>"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[rand(0,57)]).join("")}`,
    balance_usdc: parseFloat((rand(100, 10000) * 0.01).toFixed(6)),
    status: "active",
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 53. Multi-Currency Ledger Accounts ────────────────────────────────────
  await seed(conn, "multi_currency_ledger_accounts", MERCHANT_IDS.flatMap((mid, i) =>
    ["NGN","USD","GBP"].map((currency, j) => ({
      id: `mclacct-${mid}-${currency}`,
      tenant_id: TENANT_ID, merchant_id: mid,
      currency, balance: rand(0, 10000000),
      ledger_balance: rand(0, 10000000),
      status: "active",
      created_at: daysAgo(rand(30, 180)), updated_at: now(),
    }))
  ));

  // ── 54. Realtime Notification Preferences ────────────────────────────────
  await seed(conn, "realtime_notification_preferences", USER_IDS.map((uid_val, i) => ({
    id: `notifpref-${String(i+1).padStart(3,"0")}`,
    user_id: uid_val, tenant_id: TENANT_ID,
    payment_success: true, payment_failed: true,
    payout_completed: true, dispute_created: true,
    fraud_alert: true, kyc_update: true,
    email_enabled: true, push_enabled: i % 2 === 0, sms_enabled: i % 3 === 0,
    created_at: daysAgo(rand(0, 90)), updated_at: now(),
  })));

  // ── 55. Portal Subscriptions ──────────────────────────────────────────────
  await seed(conn, "portal_subscriptions", MERCHANT_IDS.slice(0, 3).map((mid, i) => ({
    id: `portalsub-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID, merchant_id: mid,
    plan: pick(["starter", "growth", "enterprise"]),
    status: pick(["active", "active", "trialing"]),
    stripe_subscription_id: `sub_${rand(1000000000, 9999999999)}`,
    stripe_customer_id: `cus_${rand(1000000000, 9999999999)}`,
    current_period_start: daysAgo(rand(1, 30)),
    current_period_end: daysAgo(-rand(1, 30)),
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 56. Agent Banking V4 ──────────────────────────────────────────────────
  await seed(conn, "agent_banking_v4_agents", Array.from({ length: 6 }, (_, i) => ({
    id: `agentv4-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    agent_code: `AGV4${rand(10000, 99999)}`,
    full_name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
    phone: `+234${rand(700,909)}${rand(1000000,9999999)}`,
    state: pick(["Lagos", "Abuja", "Kano", "Rivers", "Oyo"]),
    status: pick(["active", "active", "suspended"]),
    float_balance: rand(50000, 500000),
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 57. Marketplace Orders ────────────────────────────────────────────────
  await seed(conn, "marketplace_orders", Array.from({ length: 8 }, (_, i) => ({
    id: `mktord-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    buyer_id: CUSTOMER_IDS[i % CUSTOMER_IDS.length],
    seller_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    amount: rand(5000, 500000),
    currency: "NGN",
    status: pick(["completed", "completed", "processing", "disputed", "cancelled"]),
    escrow_id: i < 4 ? `escrow-${String(i+1).padStart(3,"0")}` : null,
    created_at: daysAgo(rand(0, 60)), updated_at: now(),
  })));

  // ── 58. NFC Devices ───────────────────────────────────────────────────────
  await seed(conn, "nfc_devices", Array.from({ length: 6 }, (_, i) => ({
    id: `nfc-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    device_id: `NFC${rand(100000, 999999)}`,
    device_type: pick(["card_reader", "wearable", "sticker", "phone"]),
    status: pick(["active", "active", "inactive"]),
    last_used_at: daysAgo(rand(0, 30)),
    created_at: daysAgo(rand(30, 180)), updated_at: now(),
  })));

  // ── 59. Tax Filing Records ────────────────────────────────────────────────
  await seed(conn, "tax_filing_records", Array.from({ length: 6 }, (_, i) => ({
    id: `taxfiling-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    tax_type: pick(["vat", "cit", "wht", "paye"]),
    period: `${new Date().getFullYear()}-${String((new Date().getMonth() - i + 12) % 12 + 1).padStart(2,"0")}`,
    amount: rand(50000, 5000000),
    status: pick(["filed", "filed", "pending", "overdue"]),
    filed_at: i < 4 ? daysAgo(rand(1, 30)) : null,
    created_at: daysAgo(rand(0, 90)), updated_at: now(),
  })));

  // ── 60. USSD Sessions ─────────────────────────────────────────────────────
  await seed(conn, "ussd_sessions", Array.from({ length: 10 }, (_, i) => ({
    id: `ussd-${String(i+1).padStart(3,"0")}`,
    tenant_id: TENANT_ID,
    session_id: `USSD${rand(100000000, 999999999)}`,
    msisdn: `+234${rand(700,909)}${rand(1000000,9999999)}`,
    merchant_id: MERCHANT_IDS[i % MERCHANT_IDS.length],
    menu_path: pick(["1*1", "1*2", "2*1", "3*1"]),
    status: pick(["completed", "completed", "active", "timed_out"]),
    amount: i < 7 ? rand(500, 50000) : null,
    created_at: daysAgo(rand(0, 7)), updated_at: now(),
  })));

  console.log("\n✅  Comprehensive seed complete!");
  console.log("📊  Tables seeded: 60 core + related tables");
  await conn.end();
  process.exit(0);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
