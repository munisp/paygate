/**
 * PayGate Demo Data Seed
 * Run: DATABASE_URL="postgresql://paygate:paygate@localhost:5432/paygate" node seed.mjs
 *
 * Seeds: 1 owner user, 1 merchant, 50 customers (via transactions), 200 transactions,
 * 20 payouts, 5 disputes, 3 virtual cards, 4 payment links, 3 API keys,
 * 2 webhooks, 3 team members.
 */

import pg from "pg";
import { randomUUID, randomBytes } from "crypto";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://paygate:paygate@localhost:5432/paygate";

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();
console.log("Connected to PostgreSQL");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => randomUUID();
const ref = (prefix) =>
  `${prefix}_${randomBytes(6).toString("hex").toUpperCase()}`;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randAmount = (min, max) => randInt(min * 100, max * 100); // kobo/cents
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const hoursAgo = (n) => new Date(Date.now() - n * 3600000);

const MERCHANT_ID = "mch_acme_001";
// Use the real Manus owner open_id so the merchant portal works after OAuth login
const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID || "demo_owner_" + randomBytes(4).toString("hex");

// Nigerian names and companies for realism
const firstNames = [
  "Adaeze","Chukwuemeka","Fatima","Oluwaseun","Ngozi","Emeka","Amaka",
  "Babatunde","Chidinma","Tunde","Aisha","Obinna","Kemi","Femi","Zainab",
  "Chidi","Blessing","Seun","Nneka","Yusuf","Ifeoma","Damilola","Nkechi",
  "Rotimi","Chiamaka","Biodun","Adaora","Kunle","Chioma","Taiwo",
];
const lastNames = [
  "Okafor","Adeleke","Musa","Okonkwo","Bello","Nwosu","Adeyemi","Ibrahim",
  "Eze","Abubakar","Obi","Olawale","Nwachukwu","Adebayo","Suleiman",
  "Chukwu","Osei","Mensah","Diallo","Kamara","Traore","Kofi","Asante",
  "Dlamini","Nkosi","Mokoena","Sithole","Ndlovu","Khumalo","Zulu",
];
const companies = [
  "Acme Corp","TechHub Lagos","Konga Stores","Jumia Merchant","FlutterCo",
  "Paystack Partner","Cowrywise","Piggyvest Vendor","Andela Client",
  "Flutterwave Demo","Carbon Finance","FairMoney Merchant","Kuda Business",
  "Moniepoint Partner","OPay Merchant","PalmPay Vendor","Interswitch Demo",
];
const channels = ["card","bank_transfer","mobile_money","ussd","qr","bnpl"];
const txStatuses = ["pending","processing","completed","completed","completed","failed","reversed"];
const currencies = ["NGN","GHS","KES","ZAR","UGX"];

function randomName() {
  return `${pick(firstNames)} ${pick(lastNames)}`;
}
function randomEmail(name) {
  return `${name.toLowerCase().replace(" ", ".")}@${pick(["gmail.com","yahoo.com","outlook.com","company.ng"])}`;
}

// ─── 1. Owner user ────────────────────────────────────────────────────────────

console.log("Seeding owner user...");
const ownerRes = await client.query(
  `INSERT INTO users (open_id, name, email, login_method, role, tenant_id, last_signed_in, created_at, updated_at)
   VALUES ($1,$2,$3,'manus','admin','ten_default',NOW(),NOW(),NOW())
   ON CONFLICT (open_id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, tenant_id='ten_default'
   RETURNING id`,
  [OWNER_OPEN_ID, "Demo Owner", "demo@paygate.ng"]
);
const ownerId = ownerRes.rows[0].id;
console.log(`  Owner user id=${ownerId}, open_id=${OWNER_OPEN_ID}`);

// ─── 2. Merchant ──────────────────────────────────────────────────────────────

console.log("Seeding merchant...");
await client.query(
  `INSERT INTO merchants
     (id, owner_id, tenant_id, business_name, business_type, email, phone, country, currency,
      status, is_live, onboarding_step, webhook_url, created_at, updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
   ON CONFLICT (id) DO NOTHING`,
  [
    MERCHANT_ID, ownerId, "ten_default", "Acme Payments Ltd", "fintech",
    "payments@acme.ng", "+2348012345678", "NG", "NGN",
    "active", true, 5,
    "https://webhook.acme.ng/paygate",
  ]
);
console.log(`  Merchant id=${MERCHANT_ID}`);

// ─── 3. Transactions (200) ────────────────────────────────────────────────────

console.log("Seeding 200 transactions...");
const customerPool = Array.from({ length: 50 }, () => {
  const name = randomName();
  return { name, email: randomEmail(name), phone: `+234${randInt(7000000000, 9099999999)}` };
});

for (let i = 0; i < 200; i++) {
  const customer = pick(customerPool);
  const status = pick(txStatuses);
  const channel = pick(channels);
  const currency = i < 160 ? "NGN" : pick(currencies);
  const amount = randAmount(500, 250000);
  const fee = Math.round(amount * 0.015);
  const net = amount - fee;
  const createdAt = daysAgo(randInt(0, 90));
  const completedAt = status === "completed" ? new Date(createdAt.getTime() + randInt(1000, 300000)) : null;

  await client.query(
    `INSERT INTO transactions
       (id, merchant_id, tenant_id, reference, amount, currency, status, channel,
        customer_email, customer_name, customer_phone, description,
        fee_amount, net_amount, metadata, completed_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (id) DO NOTHING`,
    [
      uid(), MERCHANT_ID, "ten_default", ref("TXN"), amount, currency, status, channel,
      customer.email, customer.name, customer.phone,
      pick(["Payment for services","Product purchase","Subscription fee","Invoice settlement","Order payment"]),
      fee, net,
      JSON.stringify({ source: "demo_seed", batch: i }),
      completedAt, createdAt, createdAt,
    ]
  );
}
console.log("  200 transactions seeded");

// ─── 4. Customers (derived from transactions, stored as unique emails) ─────────
// Customers are implicit via transactions; no separate customers table needed.
// The customers.list tRPC procedure aggregates from transactions.

// ─── 5. Payouts (20) ─────────────────────────────────────────────────────────

console.log("Seeding 20 payouts...");
const payoutStatuses = ["pending","processing","completed","completed","completed","failed"];
const bankNames = [
  "Access Bank","GTBank","First Bank","Zenith Bank","UBA",
  "Fidelity Bank","Sterling Bank","Polaris Bank","Wema Bank","Stanbic IBTC",
];
for (let i = 0; i < 20; i++) {
  const status = pick(payoutStatuses);
  const amount = randAmount(50000, 5000000);
  const fee = Math.round(amount * 0.005);
  const net = amount - fee;
  const createdAt = daysAgo(randInt(0, 60));
  const completedAt = status === "completed" ? new Date(createdAt.getTime() + randInt(3600000, 86400000)) : null;

  await client.query(
    `INSERT INTO payouts
       (id, merchant_id, tenant_id, reference, amount, currency, status,
        bank_code, account_number, account_name,
        narration, fee_amount, processed_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (id) DO NOTHING`,
    [
      uid(), MERCHANT_ID, "ten_default", ref("PYT"), amount, "NGN", status,
      pick(["044","058","011","057","033","070","232","076","035","039"]),
      `${randInt(1000000000, 9999999999)}`,
      randomName(),
      pick(["Merchant settlement","Weekly payout","Monthly settlement","Revenue withdrawal"]),
      fee, completedAt, createdAt, createdAt,
    ]
  );
}
console.log("  20 payouts seeded");

// ─── 6. Disputes (5) ─────────────────────────────────────────────────────────

console.log("Seeding 5 disputes...");
const disputeStatuses = ["open","under_review","resolved_merchant","resolved_customer","closed"];
const disputeReasons = [
  "Customer claims item not received",
  "Unauthorized transaction reported",
  "Duplicate charge detected",
  "Product not as described",
  "Subscription cancelled but charged",
];
for (let i = 0; i < 5; i++) {
  const amount = randAmount(5000, 100000);
  const dueDate = new Date(Date.now() + randInt(3, 14) * 86400000);
  await client.query(
    `INSERT INTO disputes
       (id, merchant_id, tenant_id, reference, amount, currency, status, reason, due_date, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [
      uid(), MERCHANT_ID, "ten_default", ref("DSP"), amount, "NGN",
      disputeStatuses[i], disputeReasons[i],
      dueDate, daysAgo(randInt(1, 15)), daysAgo(randInt(0, 5)),
    ]
  );
}
console.log("  5 disputes seeded");

// ─── 7. Virtual Cards (3) ─────────────────────────────────────────────────────

console.log("Seeding 3 virtual cards...");
const cardData = [
  { pan: "4532 **** **** 1234", brand: "visa",       currency: "USD", label: "Marketing Spend",  balance: 250000,  limit: 1000000 },
  { pan: "5399 **** **** 5678", brand: "mastercard", currency: "USD", label: "SaaS Subscriptions", balance: 75000, limit: 500000  },
  { pan: "4916 **** **** 9012", brand: "visa",       currency: "GBP", label: "Travel & Expenses", balance: 180000, limit: 750000  },
];
for (const card of cardData) {
  await client.query(
    `INSERT INTO virtual_cards
       (id, merchant_id, tenant_id, masked_pan, brand, expiry_month, expiry_year, currency, status, balance, spend_limit, label, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO NOTHING`,
    [
      uid(), MERCHANT_ID, "ten_default", card.pan, card.brand,
      randInt(1, 12), 2027, card.currency, "active",
      card.balance, card.limit, card.label,
      daysAgo(randInt(10, 60)), daysAgo(randInt(0, 5)),
    ]
  );
}
console.log("  3 virtual cards seeded");

// ─── 8. Payment Links (4) ─────────────────────────────────────────────────────

console.log("Seeding 4 payment links...");
const linkData = [
  { title: "Monthly Subscription",  slug: "sub-monthly",   amount: 500000,  desc: "Monthly SaaS subscription plan" },
  { title: "One-time Setup Fee",    slug: "setup-fee",     amount: 2500000, desc: "One-time onboarding and setup" },
  { title: "Pay What You Want",     slug: "flexible-pay",  amount: null,    desc: "Flexible amount donation or payment" },
  { title: "Annual Enterprise Plan",slug: "enterprise-yr", amount: 12000000,desc: "Annual enterprise license" },
];
for (const link of linkData) {
  await client.query(
    `INSERT INTO payment_links
       (id, merchant_id, tenant_id, slug, title, description, amount, currency, is_active, usage_count, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (tenant_id, slug) DO NOTHING`,
    [
      uid(), MERCHANT_ID, "ten_default", link.slug, link.title, link.desc,
      link.amount, "NGN", true, randInt(0, 150),
      daysAgo(randInt(5, 30)), daysAgo(randInt(0, 3)),
    ]
  );
}
console.log("  4 payment links seeded");

// ─── 9. API Keys (3) ──────────────────────────────────────────────────────────

console.log("Seeding 3 API keys...");
const keyData = [
  { name: "Production Key",    env: "live", prefix: "pk_live" },
  { name: "Test Key",          env: "test", prefix: "pk_test" },
  { name: "CI/CD Integration", env: "test", prefix: "pk_test" },
];
for (const k of keyData) {
  const keyHash = randomBytes(32).toString("hex");
  await client.query(
    `INSERT INTO api_keys
       (id, merchant_id, tenant_id, name, key_hash, key_prefix, environment, is_active, last_used_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      uid(), MERCHANT_ID, "ten_default", k.name, keyHash,
      `${k.prefix}_${keyHash.substring(0, 8)}`,
      k.env, true,
      k.env === "live" ? hoursAgo(randInt(1, 48)) : null,
      daysAgo(randInt(10, 90)),
    ]
  );
}
console.log("  3 API keys seeded");

// ─── 10. Webhooks (2) ─────────────────────────────────────────────────────────

console.log("Seeding 2 webhooks...");
const webhookData = [
  {
    url: "https://webhook.acme.ng/paygate/events",
    events: ["payment.success","payment.failed","payout.completed","dispute.opened"],
  },
  {
    url: "https://hooks.zapier.com/hooks/catch/demo/paygate",
    events: ["payment.success","payout.completed"],
  },
];
for (const wh of webhookData) {
  await client.query(
    `INSERT INTO webhooks
       (id, merchant_id, tenant_id, url, events, secret, is_active, last_delivered_at, failure_count, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [
      uid(), MERCHANT_ID, "ten_default", wh.url,
      JSON.stringify(wh.events),
      `whsec_${randomBytes(24).toString("hex")}`,
      true, hoursAgo(randInt(1, 12)), 0,
      daysAgo(randInt(20, 60)), daysAgo(randInt(0, 2)),
    ]
  );
}
console.log("  2 webhooks seeded");

// ─── 11. Team Members (3) ─────────────────────────────────────────────────────

console.log("Seeding 3 team members...");
const teamData = [
  { email: "dev@acme.ng",     name: "Emeka Okafor",   role: "developer", status: "active"   },
  { email: "finance@acme.ng", name: "Ngozi Adeleke",  role: "viewer",    status: "active"   },
  { email: "cto@acme.ng",     name: "Tunde Bello",    role: "admin",     status: "invited"  },
];
for (const tm of teamData) {
  await client.query(
    `INSERT INTO team_members
       (merchant_id, tenant_id, email, name, role, status, joined_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT DO NOTHING`,
    [
      MERCHANT_ID, "ten_default", tm.email, tm.name, tm.role, tm.status,
      tm.status === "active" ? daysAgo(randInt(5, 30)) : null,
      daysAgo(randInt(10, 60)), daysAgo(randInt(0, 5)),
    ]
  );
}
console.log("  3 team members seeded");

// ─── Summary ──────────────────────────────────────────────────────────────────

const counts = await client.query(`
  SELECT
    (SELECT COUNT(*) FROM users)         AS users,
    (SELECT COUNT(*) FROM merchants)     AS merchants,
    (SELECT COUNT(*) FROM transactions)  AS transactions,
    (SELECT COUNT(*) FROM payouts)       AS payouts,
    (SELECT COUNT(*) FROM disputes)      AS disputes,
    (SELECT COUNT(*) FROM virtual_cards) AS virtual_cards,
    (SELECT COUNT(*) FROM payment_links) AS payment_links,
    (SELECT COUNT(*) FROM api_keys)      AS api_keys,
    (SELECT COUNT(*) FROM webhooks)      AS webhooks,
    (SELECT COUNT(*) FROM team_members)  AS team_members
`);

console.log("\n✅ Seed complete. Database counts:");
console.table(counts.rows[0]);
console.log(`\nDemo login open_id: ${OWNER_OPEN_ID}`);
console.log(`Merchant ID:        ${MERCHANT_ID}`);

await client.end();
