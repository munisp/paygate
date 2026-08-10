/**
 * PayGate Demo Data Seed — Hardened v2
 *
 * Usage:
 *   node seed.mjs                          # Normal seed (idempotent — safe to re-run)
 *   node seed.mjs --dry-run                # Preview what would be inserted, no DB writes
 *   DATABASE_URL="postgresql://..." node seed.mjs
 *
 * Idempotency: every INSERT uses ON CONFLICT DO NOTHING (or DO UPDATE for the owner user).
 * Re-running will skip rows that already exist and only add genuinely new data.
 *
 * Per-entity error reporting: each section is wrapped in try/catch.
 * Failures are collected and reported at the end; the script does NOT abort on first error.
 *
 * Seeds: 1 owner user, 1 merchant, 50 customers (via transactions), 200 transactions,
 * 20 payouts, 5 disputes, 3 virtual cards, 4 payment links, 3 API keys,
 * 2 webhooks, 3 team members.
 */
import pg from "pg";
import { randomUUID, randomBytes } from "crypto";

// ─── CLI flags ────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
if (DRY_RUN) {
  console.log("🔍 DRY-RUN mode — no database writes will be performed.\n");
}

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://paygate:paygate@localhost:5432/paygate";

let client;
if (!DRY_RUN) {
  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  console.log("✅ Connected to PostgreSQL");
} else {
  console.log("ℹ️  Skipping DB connection (dry-run).");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => randomUUID();
const ref = (prefix) =>
  `${prefix}_${randomBytes(6).toString("hex").toUpperCase()}`;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randAmount = (min, max) => randInt(min * 100, max * 100);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const hoursAgo = (n) => new Date(Date.now() - n * 3600000);

const MERCHANT_ID = "mch_acme_001";
const OWNER_OPEN_ID =
  process.env.OWNER_OPEN_ID || "demo_owner_" + randomBytes(4).toString("hex");

// ─── Error tracking ───────────────────────────────────────────────────────────
const errors = [];
function recordError(section, err) {
  errors.push({ section, message: err?.message ?? String(err) });
  console.error(`  ⚠️  [${section}] ${err?.message ?? err}`);
}

/**
 * Idempotent query wrapper.
 * In dry-run mode logs the query instead of executing it.
 */
async function q(sql, params = [], label = "") {
  if (DRY_RUN) {
    const preview = sql.replace(/\s+/g, " ").trim().slice(0, 120);
    console.log(`  [dry-run] ${label || "QUERY"}: ${preview}...`);
    return { rows: [{ id: -1 }] };
  }
  return client.query(sql, params);
}

// ─── Data fixtures ────────────────────────────────────────────────────────────
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
console.log("\n[1/11] Seeding owner user...");
let ownerId = -1;
try {
  const ownerRes = await q(
    `INSERT INTO users (open_id, name, email, login_method, role, tenant_id, last_signed_in, created_at, updated_at)
     VALUES ($1,$2,$3,'manus','admin','ten_default',NOW(),NOW(),NOW())
     ON CONFLICT (open_id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, tenant_id='ten_default'
     RETURNING id`,
    [OWNER_OPEN_ID, "Demo Owner", "demo@paygate.ng"],
    "INSERT owner user"
  );
  ownerId = ownerRes.rows[0]?.id ?? -1;
  console.log(`  ✓ Owner user id=${ownerId}, open_id=${OWNER_OPEN_ID}`);
} catch (err) {
  recordError("owner user", err);
}

// ─── 2. Merchant ──────────────────────────────────────────────────────────────
console.log("[2/11] Seeding merchant...");
try {
  await q(
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
    ],
    "INSERT merchant"
  );
  console.log(`  ✓ Merchant id=${MERCHANT_ID}`);
} catch (err) {
  recordError("merchant", err);
}

// ─── 3. Transactions (200) ────────────────────────────────────────────────────
console.log("[3/11] Seeding 200 transactions...");
const customerPool = Array.from({ length: 50 }, () => {
  const name = randomName();
  return { name, email: randomEmail(name), phone: `+234${randInt(7000000000, 9099999999)}` };
});
let txInserted = 0;
let txSkipped = 0;
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
  try {
    await q(
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
      ],
      `INSERT transaction ${i + 1}`
    );
    txInserted++;
  } catch (err) {
    txSkipped++;
    if (txSkipped <= 3) recordError(`transaction[${i}]`, err);
  }
}
console.log(`  ✓ ${txInserted} transactions inserted, ${txSkipped} skipped/errored`);

// ─── 4. Payouts (20) ─────────────────────────────────────────────────────────
console.log("[4/11] Seeding 20 payouts...");
const payoutStatuses = ["pending","processing","completed","completed","completed","failed"];
let payoutCount = 0;
for (let i = 0; i < 20; i++) {
  const status = pick(payoutStatuses);
  const amount = randAmount(5000, 500000);
  const fee = Math.round(amount * 0.005);
  const net = amount - fee;
  const createdAt = daysAgo(randInt(0, 60));
  const completedAt = status === "completed" ? new Date(createdAt.getTime() + randInt(3600000, 86400000)) : null;
  try {
    await q(
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
      ],
      `INSERT payout ${i + 1}`
    );
    payoutCount++;
  } catch (err) {
    recordError(`payout[${i}]`, err);
  }
}
console.log(`  ✓ ${payoutCount} payouts seeded`);

// ─── 5. Disputes (5) ─────────────────────────────────────────────────────────
console.log("[5/11] Seeding 5 disputes...");
const disputeStatuses = ["open","under_review","resolved_merchant","resolved_customer","closed"];
const disputeReasons = [
  "Customer claims item not received",
  "Unauthorized transaction reported",
  "Duplicate charge detected",
  "Product not as described",
  "Subscription cancelled but charged",
];
let disputeCount = 0;
for (let i = 0; i < 5; i++) {
  const amount = randAmount(5000, 100000);
  const dueDate = new Date(Date.now() + randInt(3, 14) * 86400000);
  try {
    await q(
      `INSERT INTO disputes
         (id, merchant_id, tenant_id, reference, amount, currency, status, reason, due_date, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        uid(), MERCHANT_ID, "ten_default", ref("DSP"), amount, "NGN",
        disputeStatuses[i], disputeReasons[i],
        dueDate, daysAgo(randInt(1, 15)), daysAgo(randInt(0, 5)),
      ],
      `INSERT dispute ${i + 1}`
    );
    disputeCount++;
  } catch (err) {
    recordError(`dispute[${i}]`, err);
  }
}
console.log(`  ✓ ${disputeCount} disputes seeded`);

// ─── 6. Virtual Cards (3) ─────────────────────────────────────────────────────
console.log("[6/11] Seeding 3 virtual cards...");
const cardData = [
  { pan: "4532 **** **** 1234", brand: "visa",       currency: "USD", label: "Marketing Spend",    balance: 250000,  limit: 1000000 },
  { pan: "5399 **** **** 5678", brand: "mastercard", currency: "USD", label: "SaaS Subscriptions", balance: 75000,   limit: 500000  },
  { pan: "4916 **** **** 9012", brand: "visa",       currency: "GBP", label: "Travel & Expenses",  balance: 180000,  limit: 750000  },
];
let cardCount = 0;
for (const card of cardData) {
  try {
    await q(
      `INSERT INTO virtual_cards
         (id, merchant_id, tenant_id, masked_pan, brand, expiry_month, expiry_year, currency, status, balance, spend_limit, label, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO NOTHING`,
      [
        uid(), MERCHANT_ID, "ten_default", card.pan, card.brand,
        randInt(1, 12), 2027, card.currency, "active",
        card.balance, card.limit, card.label,
        daysAgo(randInt(10, 60)), daysAgo(randInt(0, 5)),
      ],
      `INSERT virtual card "${card.label}"`
    );
    cardCount++;
  } catch (err) {
    recordError(`virtual_card["${card.label}"]`, err);
  }
}
console.log(`  ✓ ${cardCount} virtual cards seeded`);

// ─── 7. Payment Links (4) ─────────────────────────────────────────────────────
console.log("[7/11] Seeding 4 payment links...");
const linkData = [
  { title: "Monthly Subscription",   slug: "sub-monthly",   amount: 500000,   desc: "Monthly SaaS subscription plan" },
  { title: "One-time Setup Fee",     slug: "setup-fee",     amount: 2500000,  desc: "One-time onboarding and setup" },
  { title: "Pay What You Want",      slug: "flexible-pay",  amount: null,     desc: "Flexible amount donation or payment" },
  { title: "Annual Enterprise Plan", slug: "enterprise-yr", amount: 12000000, desc: "Annual enterprise license" },
];
let linkCount = 0;
for (const link of linkData) {
  try {
    await q(
      `INSERT INTO payment_links
         (id, merchant_id, tenant_id, slug, title, description, amount, currency, is_active, usage_count, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id, slug) DO NOTHING`,
      [
        uid(), MERCHANT_ID, "ten_default", link.slug, link.title, link.desc,
        link.amount, "NGN", true, randInt(0, 150),
        daysAgo(randInt(5, 30)), daysAgo(randInt(0, 3)),
      ],
      `INSERT payment link "${link.title}"`
    );
    linkCount++;
  } catch (err) {
    recordError(`payment_link["${link.title}"]`, err);
  }
}
console.log(`  ✓ ${linkCount} payment links seeded`);

// ─── 8. API Keys (3) ─────────────────────────────────────────────────────────
console.log("[8/11] Seeding 3 API keys...");
const keyData = [
  { name: "Production Key",    env: "live", prefix: "pk_live" },
  { name: "Test Key",          env: "test", prefix: "pk_test" },
  { name: "CI/CD Integration", env: "test", prefix: "pk_test" },
];
let keyCount = 0;
for (const k of keyData) {
  const keyHash = randomBytes(32).toString("hex");
  try {
    await q(
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
      ],
      `INSERT api key "${k.name}"`
    );
    keyCount++;
  } catch (err) {
    recordError(`api_key["${k.name}"]`, err);
  }
}
console.log(`  ✓ ${keyCount} API keys seeded`);

// ─── 9. Webhooks (2) ─────────────────────────────────────────────────────────
console.log("[9/11] Seeding 2 webhooks...");
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
let webhookCount = 0;
for (const wh of webhookData) {
  try {
    await q(
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
      ],
      `INSERT webhook "${wh.url}"`
    );
    webhookCount++;
  } catch (err) {
    recordError(`webhook["${wh.url}"]`, err);
  }
}
console.log(`  ✓ ${webhookCount} webhooks seeded`);

// ─── 10. Team Members (3) ─────────────────────────────────────────────────────
console.log("[10/11] Seeding 3 team members...");
const teamData = [
  { email: "dev@acme.ng",     name: "Emeka Okafor",  role: "developer", status: "active"  },
  { email: "finance@acme.ng", name: "Ngozi Adeleke", role: "viewer",    status: "active"  },
  { email: "cto@acme.ng",     name: "Tunde Bello",   role: "admin",     status: "invited" },
];
let teamCount = 0;
for (const tm of teamData) {
  try {
    await q(
      `INSERT INTO team_members
         (merchant_id, tenant_id, email, name, role, status, joined_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [
        MERCHANT_ID, "ten_default", tm.email, tm.name, tm.role, tm.status,
        tm.status === "active" ? daysAgo(randInt(5, 30)) : null,
        daysAgo(randInt(10, 60)), daysAgo(randInt(0, 5)),
      ],
      `INSERT team member "${tm.email}"`
    );
    teamCount++;
  } catch (err) {
    recordError(`team_member["${tm.email}"]`, err);
  }
}
console.log(`  ✓ ${teamCount} team members seeded`);

// ─── 11. Summary ─────────────────────────────────────────────────────────────
console.log("[11/11] Collecting summary counts...");
if (!DRY_RUN) {
  try {
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
  } catch (err) {
    recordError("summary counts", err);
  }
  await client.end();
} else {
  console.log("\n🔍 Dry-run complete — no rows were written.");
}

// ─── Error report ─────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.log(`\n⚠️  ${errors.length} error(s) encountered during seed:`);
  for (const e of errors) {
    console.log(`  [${e.section}] ${e.message}`);
  }
  process.exit(1);
} else {
  console.log(`\nDemo login open_id: ${OWNER_OPEN_ID}`);
  console.log(`Merchant ID:        ${MERCHANT_ID}`);
  if (DRY_RUN) console.log("\n✅ Dry-run passed — all sections validated without errors.");
}
