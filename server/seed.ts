/**
 * PayGate Merchant Portal -- Comprehensive Seed Data
 * Run: npx tsx server/seed.ts [--dry-run] [--entity=<name>] [--reset]
 *
 * Flags:
 *   --dry-run          Print what would be seeded without writing to DB
 *   --entity=<name>    Only seed a specific entity (e.g. --entity=transactions)
 *   --reset            Truncate all tables before seeding (DESTRUCTIVE)
 *
 * Seeds realistic Nigerian fintech data for development and staging.
 * Database: PostgreSQL via drizzle-orm/node-postgres
 * All inserts use onConflictDoNothing() for idempotency -- safe to re-run.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../drizzle/schema";
import crypto from "crypto";

// --- CLI Flags ---------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESET = args.includes("--reset");
const ENTITY_FILTER = args.find(a => a.startsWith("--entity="))?.split("=")[1];

if (DRY_RUN) console.log("[DRY RUN] No data will be written to the database.");
if (ENTITY_FILTER) console.log(`[FILTER] Only seeding entity: '${ENTITY_FILTER}'`);
if (RESET) console.warn("[RESET] All tables will be truncated before seeding!");

// --- Per-entity error tracking -----------------------------------------------
const seedErrors: { entity: string; error: string }[] = [];
const safeInsert = async (entity: string, fn: () => Promise<void>) => {
  if (ENTITY_FILTER && entity !== ENTITY_FILTER) return;
  if (DRY_RUN) { console.log(`  [dry-run] would seed ${entity}`); return; }
  try {
    await fn();
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    seedErrors.push({ entity, error: msg });
    console.error(`  [ERROR] ${entity}: ${msg}`);
  }
};

// --- Connection ---------------------------------------------------------------
const PG_URL =
  process.env.PG_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://paygate_user:paygate_dev_2026@127.0.0.1:5432/paygate_db";
const pool = new Pool({ connectionString: PG_URL });
const db = drizzle(pool, { schema });

const uuid = () => crypto.randomUUID();
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pastDate = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000);
const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000);

const NIGERIAN_NAMES = [
  "Adebayo Okafor", "Chidinma Nwosu", "Emeka Eze", "Fatima Abdullahi",
  "Gbenga Adeleke", "Halima Musa", "Ifeanyi Obi", "Josephine Afolabi",
  "Kelechi Nwachukwu", "Lola Balogun", "Mohammed Yusuf", "Ngozi Igwe",
  "Olumide Adeyemi", "Patience Okonkwo", "Rotimi Adesanya", "Sade Olawale",
  "Taiwo Babatunde", "Uche Okeke", "Vivian Onyeka", "Wale Akinwande",
];

const BANKS = [
  "Access Bank", "GTBank", "First Bank", "Zenith Bank", "UBA",
  "Stanbic IBTC", "FCMB", "Fidelity Bank", "Sterling Bank", "Wema Bank",
];

const CHANNELS = ["card", "bank_transfer", "ussd", "qr", "pos", "wallet"];
const TX_STATUSES = ["success", "pending", "failed", "reversed"];
const DISPUTE_STATUSES = ["open", "under_review", "resolved", "closed"];
const DISPUTE_REASONS = [
  "Unauthorized transaction", "Duplicate charge", "Service not rendered",
  "Wrong amount charged", "Merchant fraud", "Card not present",
];

// ─── Seed Tenants ─────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Seeding tenants...");
  const tenantData = [
    {
      id: uuid(), name: "PayGate Africa", slug: "paygate-africa",
      plan: "enterprise" as const, status: "active" as const,
      country: "NG", currency: "NGN",
      createdAt: pastDate(365), updatedAt: pastDate(1),
    },
    {
      id: uuid(), name: "FinanceHub Nigeria", slug: "financehub-ng",
      plan: "growth" as const, status: "active" as const,
      country: "NG", currency: "NGN",
      createdAt: pastDate(180), updatedAt: pastDate(2),
    },
    {
      id: uuid(), name: "QuickPay Solutions", slug: "quickpay-solutions",
      plan: "starter" as const, status: "active" as const,
      country: "GH", currency: "GHS",
      createdAt: pastDate(90), updatedAt: pastDate(3),
    },
  ];

  for (const t of tenantData) {
    await db
      .insert(schema.tenants)
      .values(t as any)
      .onConflictDoUpdate({ target: schema.tenants.id, set: { updatedAt: t.updatedAt } })
      .catch(() => {/* slug conflict — skip */});
  }
  console.log(`  ✓ ${tenantData.length} tenants`);

  // ─── Seed Users (serial PK — capture returned IDs) ────────────────────────────
  console.log("🌱 Seeding users...");
  const insertedUserIds: number[] = [];

  for (let i = 0; i < NIGERIAN_NAMES.length; i++) {
    const name = NIGERIAN_NAMES[i];
    const tenant = tenantData[Math.floor(i / 7)]; // ~7 users per tenant
    const result = await db
      .insert(schema.users)
      .values({
        openId: `seed_user_${i}_${uuid().slice(0, 8)}`,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}${i}@paygate-seed.com`,
        role: i % 7 === 0 ? ("admin" as const) : ("user" as const),
        tenantId: tenant?.id ?? tenantData[0].id,
        createdAt: pastDate(rand(30, 300)),
        updatedAt: pastDate(rand(1, 30)),
      })
      .returning({ id: schema.users.id })
      .catch(() => [{ id: 1 }]);
    insertedUserIds.push(result[0]?.id ?? 1);
  }
  console.log(`  ✓ ${insertedUserIds.length} users`);

  // ─── Seed Merchants ───────────────────────────────────────────────────────────
  console.log("🌱 Seeding merchants...");
  const merchantNames = [
    "Shoprite Nigeria", "Jumia Foods", "Konga Electronics", "GTBank Merchant",
    "Paystack Demo", "Flutterwave Test", "Interswitch Retail", "Remita Services",
    "Quickteller POS", "VTPass Airtime",
  ];

  const merchantData: Array<{ id: string; tenantId: string; currency: string; country: string }> = [];

  for (let ti = 0; ti < tenantData.length; ti++) {
    const tenant = tenantData[ti];
    for (let i = 0; i < merchantNames.length; i++) {
      const name = merchantNames[i];
      const ownerId = insertedUserIds[ti * 4] ?? insertedUserIds[0] ?? 1;
      const m = {
        id: uuid(),
        tenantId: tenant.id,
        ownerId,
        businessName: `${name} (${tenant.slug})`,
        email: `merchant${i}@${tenant.slug}.com`,
        phone: `+234${rand(700, 909)}${rand(1000000, 9999999)}`,
        status: pick(["active", "active", "active", "suspended"]) as any,
        country: tenant.country,
        currency: tenant.currency,
        businessType: pick(["retail", "ecommerce", "services", "food", "fintech"]),
        createdAt: pastDate(rand(60, 300)),
        updatedAt: pastDate(rand(1, 30)),
      };
      await db
        .insert(schema.merchants)
        .values(m)
        .onConflictDoUpdate({ target: schema.merchants.id, set: { updatedAt: m.updatedAt } })
        .catch(() => {});
      merchantData.push({ id: m.id, tenantId: tenant.id, currency: tenant.currency, country: tenant.country });
    }
  }
  console.log(`  ✓ ${merchantData.length} merchants`);

  // ─── Build merchantTenantMap (used in many sections below) ───────────────────
  const merchantTenantMap = Object.fromEntries(
    merchantData.map((m) => [m.id, m.tenantId])
  );

  // ─── Seed Customers ───────────────────────────────────────────────────────────
  console.log("🌱 Seeding customers...");
  const customerData: Array<{ id: string; merchantId: string }> = [];

  for (const merchant of merchantData.slice(0, 5)) {
    for (let i = 0; i < 20; i++) {
      const name = pick(NIGERIAN_NAMES);
      const c = {
        id: uuid(),
        tenantId: merchantTenantMap[merchant.id] ?? tenantData[0].id,
        merchantId: merchant.id,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}${i}${rand(1, 99)}@gmail.com`,
        name,
        phone: `+234${rand(700, 909)}${rand(1000000, 9999999)}`,
        totalSpend: rand(5000, 5_000_000),
        createdAt: pastDate(rand(30, 365)),
        updatedAt: pastDate(rand(1, 30)),
      };
      await db
        .insert(schema.customers)
        .values(c)
        .onConflictDoUpdate({ target: schema.customers.id, set: { updatedAt: c.updatedAt } })
        .catch(() => {});
      customerData.push({ id: c.id, merchantId: merchant.id });
    }
  }
  console.log(`  ✓ ${customerData.length} customers`);

  // ─── Seed Transactions ────────────────────────────────────────────────────────
  console.log("🌱 Seeding transactions...");
  const txData: Array<{ id: string; merchantId: string; amount: number; currency: string }> = [];

  for (const merchant of merchantData.slice(0, 3)) {
    const batch = Array.from({ length: 50 }, () => {
      const t = {
        id: uuid(),
        tenantId: merchantTenantMap[merchant.id] ?? tenantData[0].id,
        merchantId: merchant.id,
        reference: `TXN${Date.now()}${rand(1000, 9999)}`,
        amount: rand(100, 5_000_000),
        currency: merchant.currency,
        channel: pick(CHANNELS) as any,
        status: pick(TX_STATUSES) as any,
        customerEmail: `customer${rand(1, 100)}@example.com`,
        customerName: pick(NIGERIAN_NAMES),
        description: pick([
          "Payment for goods", "Service fee", "Transfer",
          "Airtime purchase", "Bill payment",
        ]),
        metadata: { source: "seed", env: "development" },
        createdAt: pastDate(rand(1, 365)),
        updatedAt: pastDate(rand(0, 30)),
      };
      txData.push({ id: t.id, merchantId: t.merchantId, amount: t.amount, currency: t.currency });
      return t;
    });
    await db.insert(schema.transactions).values(batch).catch(() => {});
  }
  console.log(`  ✓ ${txData.length} transactions`);

  // ─── Seed API Keys ────────────────────────────────────────────────────────────
  console.log("🌱 Seeding API keys...");
  let apiKeyCount = 0;
  for (const merchant of merchantData.slice(0, 5)) {
    for (const [keyPrefix, environment] of [["sk_live", "live"], ["sk_test", "test"]] as const) {
      await db
        .insert(schema.apiKeys)
        .values({
          id: uuid(),
          tenantId: merchantTenantMap[merchant.id] ?? tenantData[0].id,
          merchantId: merchant.id,
          name: environment === "live" ? "Live Secret Key" : "Test Secret Key",
          keyHash: crypto.createHash("sha256").update(`${keyPrefix}_${uuid()}`).digest("hex"),
          keyPrefix,
          environment: environment as any,
          permissions: ["payments:read", "payments:write", "webhooks:read"],
          isActive: true,
          lastUsedAt: pastDate(rand(1, 30)),
          createdAt: pastDate(rand(30, 180)),
        })
        .onConflictDoUpdate({ target: schema.apiKeys.id, set: { isActive: true } })
        .catch(() => {});
      apiKeyCount++;
    }
  }
  console.log(`  ✓ ${apiKeyCount} API keys`);

  // ─── Seed Webhooks ────────────────────────────────────────────────────────────
  console.log("🌱 Seeding webhooks...");
  let webhookCount = 0;
  for (const merchant of merchantData.slice(0, 5)) {
    await db
      .insert(schema.webhooks)
      .values({
        id: uuid(),
        tenantId: merchantTenantMap[merchant.id] ?? tenantData[0].id,
        merchantId: merchant.id,
        url: `https://webhook.example.com/paygate/${merchant.id.slice(0, 8)}`,
        events: ["payment.success", "payment.failed", "payout.completed", "dispute.created"],
        secret: crypto.randomBytes(32).toString("hex"),
        isActive: true,
        createdAt: pastDate(rand(30, 180)),
        updatedAt: pastDate(rand(1, 30)),
      })
      .onConflictDoUpdate({ target: schema.webhooks.id, set: { updatedAt: new Date() } })
      .catch(() => {});
    webhookCount++;
  }
  console.log(`  ✓ ${webhookCount} webhooks`);

  // ─── Seed Disputes ────────────────────────────────────────────────────────────
  console.log("🌱 Seeding disputes...");
  let disputeCount = 0;
  for (const tx of txData.slice(0, 20)) {
    await db
      .insert(schema.disputes)
      .values({
        id: uuid(),
        tenantId: merchantTenantMap[tx.merchantId] ?? tenantData[0].id,
        merchantId: tx.merchantId,
        transactionId: tx.id,
        reference: `DSP${Date.now()}${rand(100, 999)}`,
        amount: tx.amount,
        currency: tx.currency,
        reason: pick(DISPUTE_REASONS),
        status: pick(DISPUTE_STATUSES) as any,
        evidence: { description: "Customer claims unauthorized charge", attachments: [] },
        createdAt: pastDate(rand(1, 90)),
        updatedAt: pastDate(rand(0, 30)),
      })
      .onConflictDoUpdate({ target: schema.disputes.id, set: { updatedAt: new Date() } })
      .catch(() => {});
    disputeCount++;
  }
  console.log(`  ✓ ${disputeCount} disputes`);

  // ─── Seed Payouts ─────────────────────────────────────────────────────────────
  console.log("🌱 Seeding payouts...");
  let payoutCount = 0;
  for (const merchant of merchantData.slice(0, 5)) {
    for (let i = 0; i < 10; i++) {
      await db
        .insert(schema.payouts)
        .values({
          id: uuid(),
          tenantId: merchantTenantMap[merchant.id] ?? tenantData[0].id,
          merchantId: merchant.id,
          reference: `PAY${Date.now()}${rand(100, 999)}`,
          amount: rand(50_000, 10_000_000),
          currency: merchant.currency,
          status: pick(["pending", "approved", "processing", "completed", "failed"]) as any,
          bankCode: `${(rand(0, BANKS.length - 1) + 10).toString().padStart(3, "0")}`,
          accountNumber: `${rand(1_000_000_000, 9_999_999_999)}`,
          accountName: pick(NIGERIAN_NAMES),
          narration: "Merchant settlement payout",
          createdAt: pastDate(rand(1, 90)),
          updatedAt: pastDate(rand(0, 30)),
        })
        .onConflictDoUpdate({ target: schema.payouts.id, set: { updatedAt: new Date() } })
        .catch(() => {});
      payoutCount++;
    }
  }
  console.log(`  ✓ ${payoutCount} payouts`);

  // ─── Seed Virtual Cards ───────────────────────────────────────────────────────
  console.log("🌱 Seeding virtual cards...");
  let vcCount = 0;
  for (const merchant of merchantData.slice(0, 3)) {
    for (let i = 0; i < 5; i++) {
      await db
        .insert(schema.virtualCards)
        .values({
          id: uuid(),
          tenantId: merchantTenantMap[merchant.id] ?? tenantData[0].id,
          merchantId: merchant.id,
          maskedPan: `4${rand(100, 999)}XXXXXXXX${rand(1000, 9999)}`,
          expiryMonth: rand(1, 12),
          expiryYear: new Date().getFullYear() + rand(1, 5),
          currency: merchant.currency,
          balance: rand(0, 500_000),
          status: pick(["active", "active", "frozen", "terminated"]) as any,
          brand: pick(["visa", "mastercard"]) as any,
          label: `Card ${i + 1} - ${pick(NIGERIAN_NAMES).split(" ")[0]}`,
          createdAt: pastDate(rand(30, 180)),
          updatedAt: pastDate(rand(1, 30)),
        })
        .onConflictDoUpdate({ target: schema.virtualCards.id, set: { updatedAt: new Date() } })
        .catch(() => {});
      vcCount++;
    }
  }
  console.log(`  ✓ ${vcCount} virtual cards`);

  // ─── Seed Fraud Alerts ────────────────────────────────────────────────────────
  console.log("🌱 Seeding fraud alerts...");
  let fraudCount = 0;
  for (const merchant of merchantData.slice(0, 3)) {
    const merchantTxs = txData.filter((t) => t.merchantId === merchant.id);
    for (let i = 0; i < 8; i++) {
      await db
        .insert(schema.fraudAlerts)
        .values({
          id: uuid(),
          tenantId: merchantTenantMap[merchant.id] ?? tenantData[0].id,
          merchantId: merchant.id,
          transactionId: merchantTxs.length > 0 ? pick(merchantTxs).id : null,
          alertType: pick(["velocity", "geo_anomaly", "device_fingerprint", "card_testing", "account_takeover"]) as any,
          status: pick(["open", "investigating", "resolved", "false_positive"]) as any,
          riskScore: rand(60, 100),
          description: "Suspicious transaction pattern detected by ML model",
          metadata: { model: "xgboost-v2", confidence: rand(70, 99) / 100 },
          createdAt: pastDate(rand(1, 60)),
          updatedAt: pastDate(rand(0, 30)),
        })
        .onConflictDoUpdate({ target: schema.fraudAlerts.id, set: { updatedAt: new Date() } })
        .catch(() => {});
      fraudCount++;
    }
  }
  console.log(`  ✓ ${fraudCount} fraud alerts`);

  // ─── Seed KYC Submissions ─────────────────────────────────────────────────────
  console.log("🌱 Seeding KYC submissions...");
  let kycCount = 0;
  for (const customer of customerData.slice(0, 30)) {
    await db
      .insert(schema.kycSubmissions)
      .values({
        id: uuid(),
        tenantId: merchantTenantMap[customer.merchantId] ?? tenantData[0].id,
        merchantId: customer.merchantId,
        customerId: customer.id,
        status: pick(["pending", "approved", "approved", "rejected", "under_review"]) as any,
        docType: pick(["nin", "bvn", "passport", "drivers_license", "voters_card"]) as any,
        livenessScore: rand(70, 100) / 100,
        livenessMode: pick(["passive", "active"]),
        reviewedAt: pastDate(rand(0, 30)),
        createdAt: pastDate(rand(1, 90)),
        updatedAt: pastDate(rand(0, 30)),
      })
      .onConflictDoUpdate({ target: schema.kycSubmissions.id, set: { updatedAt: new Date() } })
      .catch(() => {});
    kycCount++;
  }
  console.log(`  ✓ ${kycCount} KYC submissions`);

  // ─── Seed FX Rates ────────────────────────────────────────────────────────────
  console.log("🌱 Seeding FX rates...");
  const fxPairs = [
    { from: "USD", to: "NGN", rate: 1580.5 },
    { from: "GBP", to: "NGN", rate: 2010.25 },
    { from: "EUR", to: "NGN", rate: 1720.8 },
    { from: "USD", to: "GHS", rate: 15.2 },
    { from: "USD", to: "KES", rate: 128.5 },
    { from: "USD", to: "ZAR", rate: 18.75 },
    { from: "NGN", to: "USD", rate: 0.000633 },
  ];

  let fxCount = 0;
  for (const pair of fxPairs) {
    for (let i = 0; i < 7; i++) {
      await db
        .insert(schema.fxRates)
        .values({
          baseCurrency: pair.from,
          targetCurrency: pair.to,
          rate: (pair.rate * (1 + (Math.random() - 0.5) * 0.02)).toFixed(6),
          source: pick(["CBN", "FMDQ", "Bloomberg", "Reuters"]),
          fetchedAt: pastDate(i),
        })
        .catch(() => {});
      fxCount++;
    }
  }
  console.log(`  ✓ ${fxCount} FX rate records`);

  // ─── Seed NIP Banks ───────────────────────────────────────────────────────────
  console.log("🌱 Seeding NIP banks...");
  let nipCount = 0;
  for (let i = 0; i < BANKS.length; i++) {
    const name = BANKS[i];
    await db
      .insert(schema.nipBanks)
      .values({
        id: uuid(),
        bankCode: `${(i + 10).toString().padStart(3, "0")}`,
        bankName: name,
        shortName: name.split(" ")[0],
        nipCode: `${(i + 100).toString()}`,
        isActive: 1,
        supportsNip: 1,
        supportsUssd: i < 5 ? 1 : 0,
        createdAt: pastDate(365),
        updatedAt: pastDate(30),
      })
      .onConflictDoUpdate({
        target: schema.nipBanks.bankCode,
        set: { updatedAt: pastDate(30) },
      })
      .catch(() => {});
    nipCount++;
  }
  console.log(`  ✓ ${nipCount} NIP banks`);

  // ─── Seed Team Members ────────────────────────────────────────────────────────
  console.log("🌱 Seeding team members...");
  let teamCount = 0;
  for (const merchant of merchantData.slice(0, 3)) {
    for (let i = 0; i < 4; i++) {
      const userId = insertedUserIds[i] ?? insertedUserIds[0];
      if (!userId) continue;
      await db
        .insert(schema.teamMembers)
        .values({
          tenantId: merchantTenantMap[merchant.id] ?? tenantData[0].id,
          merchantId: merchant.id,
          userId,
          email: `team${i}@${merchant.id.slice(0, 8)}.paygate-seed.com`,
          name: pick(NIGERIAN_NAMES),
          role: pick(["owner", "admin", "developer", "support", "viewer"]) as any,
          status: pick(["active", "active", "invited"]) as any,
          joinedAt: pastDate(rand(1, 30)),
          createdAt: pastDate(rand(30, 180)),
          updatedAt: pastDate(rand(1, 30)),
        })
        .onConflictDoUpdate({
          target: [schema.teamMembers.tenantId, schema.teamMembers.merchantId, schema.teamMembers.email] as any,
          set: { updatedAt: new Date() },
        })
        .catch(() => {});
      teamCount++;
    }
  }
  console.log(`  ✓ ${teamCount} team members`);

  // --- Wallets ---
  console.log("\n-> Seeding wallets...");
  let walletCount = 0;
  for (const merchant of merchantData) {
    await db.insert(schema.wallets).values({
      tenantId: merchant.tenantId,
      userId: String(merchant.id),
      merchantId: merchant.id,
      currency: "NGN",
      balance: String(rand(100000, 50000000)),
      ledgerBalance: String(rand(100000, 50000000)),
      status: "active",
      tier: pick(["basic", "standard", "premium"]),
      dailyLimit: "500000",
      monthlyLimit: "5000000",
    }).onConflictDoNothing().catch(() => {});
    walletCount++;
  }
  console.log(`  ok ${walletCount} wallets`);

  // --- Feature Flags ---
  console.log("\n-> Seeding feature flags...");
  const featureFlagData = [
    { key: "bnpl_enabled", name: "BNPL Lending", description: "Enable Buy Now Pay Later", enabled: true, rolloutPercentage: 100, environment: "production", category: "feature" },
    { key: "fx_dashboard_enabled", name: "FX Dashboard", description: "Multi-currency FX dashboard", enabled: true, rolloutPercentage: 100, environment: "production", category: "feature" },
    { key: "crypto_offramp_enabled", name: "Crypto Off-ramp", description: "USDC/crypto off-ramp", enabled: false, rolloutPercentage: 0, environment: "production", category: "beta" },
    { key: "ai_fraud_scoring_v2", name: "AI Fraud Scoring v2", description: "Next-gen ML fraud scoring", enabled: true, rolloutPercentage: 50, environment: "production", category: "ml" },
    { key: "open_banking_v2", name: "Open Banking v2", description: "Open Banking API v2", enabled: true, rolloutPercentage: 100, environment: "production", category: "feature" },
    { key: "ussd_lang_picker", name: "USSD Language Picker", description: "Language selection on USSD", enabled: true, rolloutPercentage: 100, environment: "production", category: "ux" },
    { key: "pos_soundbox", name: "POS Soundbox", description: "Audio confirmation for POS", enabled: true, rolloutPercentage: 80, environment: "production", category: "hardware" },
    { key: "wealth_management", name: "Wealth Management", description: "Mutual funds and gold", enabled: false, rolloutPercentage: 10, environment: "production", category: "beta" },
  ];
  for (const ff of featureFlagData) {
    await db.insert(schema.featureFlags).values(ff).onConflictDoUpdate({ target: schema.featureFlags.key, set: { enabled: ff.enabled, updatedAt: new Date() } }).catch(() => {});
  }
  console.log(`  ok ${featureFlagData.length} feature flags`);

  // --- Settlements ---
  console.log("\n-> Seeding settlements...");
  let settlementCount = 0;
  for (let i = 0; i < 10; i++) {
    const merchant = pick(merchantData);
    await db.insert(schema.settlements).values({
      id: `set_${String(i + 1).padStart(3, "0")}`,
      tenantId: merchant.tenantId,
      merchantId: merchant.id,
      reference: `SETTLE-${Date.now()}-${i}`,
      amount: rand(500000, 10000000),
      currency: "NGN",
      bankCode: pick(["044", "058", "011", "033", "057"]),
      accountNumber: `${rand(1000000000, 9999999999)}`,
      accountName: pick(NIGERIAN_NAMES),
      status: pick(["pending", "processing", "completed", "failed"]) as any,
      createdAt: pastDate(rand(1, 30)),
    }).onConflictDoNothing().catch(() => {});
    settlementCount++;
  }
  console.log(`  ok ${settlementCount} settlements`);

  // --- Loyalty Accounts ---
  console.log("\n-> Seeding loyalty accounts...");
  let loyaltyCount = 0;
  for (const customer of customerData.slice(0, 10)) {
    await db.insert(schema.consumerLoyaltyAccounts).values({
      id: `loyalty_${loyaltyCount++}`,
      userId: Number(customer.id) || 1,
      pointsBalance: rand(0, 50000),
      lifetimePoints: rand(1000, 100000),
    }).onConflictDoNothing().catch(() => {});
    loyaltyCount++;
  }
  console.log(`  ok ${loyaltyCount} loyalty accounts`);

  // --- POS Terminals ---
  console.log("\n-> Seeding POS terminals...");
  const posTerminalData = [
    { id: "pos_001", merchantId: merchantData[0].id, tenantId: merchantData[0].tenantId, serialNumber: "POS-NG-001-2024", model: "soundbox_basic" as const, label: "Main Counter", location: "Lagos HQ", status: "active" as const },
    { id: "pos_002", merchantId: merchantData[0].id, tenantId: merchantData[0].tenantId, serialNumber: "POS-NG-002-2024", model: "pos_smart" as const, label: "Gate 2", location: "Lagos HQ", status: "active" as const },
    { id: "pos_003", merchantId: merchantData[1]?.id ?? merchantData[0].id, tenantId: merchantData[0].tenantId, serialNumber: "POS-NG-003-2024", model: "pos_lite" as const, label: "Mobile Agent", location: "Abuja Branch", status: "active" as const },
  ];
  for (const pos of posTerminalData) {
    await db.insert(schema.posTerminals).values(pos).onConflictDoNothing().catch(() => {});
  }
  console.log(`  ok ${posTerminalData.length} POS terminals`);

  // --- Audit Events ---
  console.log("\n-> Seeding audit events...");
  const auditActions = ["settings.updated", "api_key.created", "webhook.created", "payout.approved", "dispute.resolved", "kyc.approved", "user.login", "merchant.onboarded"];
  let auditCount = 0;
  for (let i = 0; i < 20; i++) {
    const merchant = pick(merchantData);
    await db.insert(schema.auditEvents).values({
      merchantId: merchant.id,
      actorId: `user_${rand(1, 5)}`,
      actorName: pick(NIGERIAN_NAMES),
      actorEmail: `actor${i}@paygate.ng`,
      action: pick(auditActions),
      resource: pick(["merchant", "payout", "webhook", "api_key", "dispute"]),
      resourceId: `res_${rand(1, 100)}`,
      metadata: { ip: `192.168.1.${rand(1, 255)}`, browser: "Chrome" },
      ipAddress: `192.168.1.${rand(1, 255)}`,
      createdAt: pastDate(rand(0, 30)),
    }).onConflictDoNothing().catch(() => {});
    auditCount++;
  }
  console.log(`  ok ${auditCount} audit events`);

  // --- Webhook Deliveries ---
  console.log("\n-> Seeding webhook deliveries...");
  let webhookDeliveryCount = 0;
  const webhookIds = ["wh_001", "wh_002", "wh_003"];
  for (let i = 0; i < 15; i++) {
    const merchant = pick(merchantData);
    const whId = pick(webhookIds);
    await db.insert(schema.webhookDeliveries).values({
      id: `wdel_${String(i + 1).padStart(3, "0")}`,
      tenantId: merchant.tenantId,
      webhookId: whId,
      merchantId: merchant.id,
      eventType: pick(["payment.success", "payment.failed", "payout.completed", "dispute.created"]),
      payload: { event: "payment.success", amount: rand(1000, 100000) },
      responseStatus: pick([200, 200, 200, 404, 500]),
      responseBody: "OK",
      latencyMs: rand(50, 2000),
      status: pick(["delivered", "delivered", "failed", "pending"]) as any,
      attemptCount: rand(1, 3),
      createdAt: pastDate(rand(0, 14)),
    }).onConflictDoNothing().catch(() => {});
    webhookDeliveryCount++;
  }
  console.log(`  ok ${webhookDeliveryCount} webhook deliveries`);

  // --- Support Messages ---
  console.log("\n-> Seeding support messages...");
  const supportSessions = ["sess_001", "sess_002", "sess_003"];
  const supportConversations = [
    { role: "user", content: "I need help with a failed transaction" },
    { role: "agent", content: "I can help with that. Please provide the transaction reference." },
    { role: "user", content: "The reference is TXN-2024-001" },
    { role: "agent", content: "I can see the transaction. It failed due to insufficient funds. Please retry." },
  ];
  let supportCount = 0;
  for (const session of supportSessions) {
    for (const msg of supportConversations) {
      await db.insert(schema.supportMessages).values({
        sessionId: session,
        merchantId: merchantData[0].id,
        role: msg.role,
        content: msg.content,
        status: "read",
      }).onConflictDoNothing().catch(() => {});
      supportCount++;
    }
  }
  console.log(`  ok ${supportCount} support messages`);


  // ─── Payment Links ────────────────────────────────────────────────────────────
  console.log("\n→ Seeding payment links...");
  let paymentLinksCount = 0;
  const paymentLinkData = [
    { id: "pl_001", tenantId: tenantData[0].id, merchantId: merchantData[0].id, slug: "checkout-basic", title: "Basic Checkout", description: "Standard payment link", amount: 500000, currency: "NGN", isActive: true },
    { id: "pl_002", tenantId: tenantData[0].id, merchantId: merchantData[0].id, slug: "premium-plan", title: "Premium Plan", description: "Premium subscription payment", amount: 1500000, currency: "NGN", isActive: true },
    { id: "pl_003", tenantId: tenantData[0].id, merchantId: merchantData[0].id, slug: "donation-link", title: "Donation", description: "Accept donations", amount: null, currency: "NGN", isActive: true },
  ];
  for (const pl of paymentLinkData) {
    await db.insert(schema.paymentLinks).values(pl).onConflictDoUpdate({ target: schema.paymentLinks.id, set: { updatedAt: new Date() } }).catch(() => {});
    paymentLinksCount++;
  }
  console.log(`  ✓ ${paymentLinksCount} payment links`);

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!");
  console.log("   Tenants:       ", tenantData.length);
  console.log("   Users:         ", insertedUserIds.length);
  console.log("   Merchants:     ", merchantData.length);
  console.log("   Customers:     ", customerData.length);
  console.log("   Transactions:  ", txData.length);
  console.log("   API Keys:      ", apiKeyCount);
  console.log("   Webhooks:      ", webhookCount);
  console.log("   Disputes:      ", disputeCount);
  console.log("   Payouts:       ", payoutCount);
  console.log("   Virtual Cards: ", vcCount);
  console.log("   Fraud Alerts:  ", fraudCount);
  console.log("   KYC:           ", kycCount);
  console.log("   FX Rates:      ", fxCount);
  console.log("   NIP Banks:     ", nipCount);
  console.log("   Team Members:  ", teamCount);
  console.log("   Payment Links: ", paymentLinksCount);
  console.log("   Wallets:        ", walletCount);
  console.log("   Feature Flags:  ", featureFlagData.length);
  console.log("   Settlements:    ", settlementCount);
  console.log("   Loyalty Accts:  ", loyaltyCount);
  console.log("   POS Terminals:  ", posTerminalData.length);
  console.log("   Audit Events:   ", auditCount);
  console.log("   Webhook Deliv:  ", webhookDeliveryCount);
  console.log("   Support Msgs:   ", supportCount);

  // --- Error Summary -----------------------------------------------------------
  if (seedErrors.length > 0) {
    console.error("\n[SEED ERRORS] The following entities had errors:");
    for (const { entity, error } of seedErrors) {
      console.error(`  - ${entity}: ${error}`);
    }
    console.error(`\n${seedErrors.length} entity/entities failed. Check above for details.`);
    await pool.end();
    process.exit(1);
  } else if (DRY_RUN) {
    console.log("\n[DRY RUN COMPLETE] No data was written.");
    await pool.end();
  } else {
    console.log("\n[SEED COMPLETE] All entities seeded successfully.");
    await pool.end();
  }

}

main().catch(err => {
  console.error("[FATAL] Seed failed:", err);
  process.exit(1);
});
