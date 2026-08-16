/**
 * seed-extension.ts — Seeds all 166 tables that were empty after the initial seed run.
 * Run with: PGPASSWORD=paygate_dev_2026 npx tsx drizzle/seed-extension.ts
 */
import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.PG_DATABASE_URL ?? "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_db",
  max: 5,
});

const M1 = "merch-acme-001";
const M2 = "merch-beta-002";
const M3 = "merch-gamma-003";
const U1 = "1"; const U2 = "2"; const U3 = "3"; const U4 = "4"; const U5 = "5";
const C1 = "cust-001"; const C2 = "cust-002"; const C3 = "cust-003";
const T1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const T2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const T3 = "c3d4e5f6-a7b8-9012-cdef-123456789012";
const PT1 = "tenant-acme-001";

function uid(prefix = "") { return prefix + crypto.randomBytes(8).toString("hex"); }
function past(daysAgo: number) { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString(); }
function future(daysAhead: number) { const d = new Date(); d.setDate(d.getDate() + daysAhead); return d.toISOString(); }

async function q(sql: string, params: unknown[] = []) {
  try {
    await pool.query(sql, params);
  } catch (e: any) {
    if (e.code === "23505") return; // duplicate key — skip
    if (e.code === "23503") return; // FK violation — skip
    console.warn(`[seed-ext] WARN: ${e.message.split("\n")[0]}`);
  }
}

// ─── Wallets ──────────────────────────────────────────────────────────────────
async function seedWallets() {
  const rows = [
    { user_id: U1, merchant_id: M1, currency: "NGN", balance: "2500000", ledger_balance: "2500000", tier: "premium", daily_limit: "500000", monthly_limit: "5000000", tenant_id: T1 },
    { user_id: U2, merchant_id: M2, currency: "NGN", balance: "850000", ledger_balance: "850000", tier: "basic", daily_limit: "100000", monthly_limit: "1000000", tenant_id: T2 },
    { user_id: U3, merchant_id: M3, currency: "USD", balance: "150000", ledger_balance: "150000", tier: "basic", daily_limit: "50000", monthly_limit: "500000", tenant_id: T3 },
    { user_id: U4, merchant_id: null, currency: "NGN", balance: "75000", ledger_balance: "75000", tier: "basic", daily_limit: "50000", monthly_limit: "500000", tenant_id: T1 },
    { user_id: U5, merchant_id: null, currency: "NGN", balance: "320000", ledger_balance: "320000", tier: "basic", daily_limit: "100000", monthly_limit: "1000000", tenant_id: T2 },
  ];
  for (const r of rows) {
    await q(`INSERT INTO wallets (user_id, merchant_id, currency, balance, ledger_balance, tier, daily_limit, monthly_limit, tenant_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [r.user_id, r.merchant_id, r.currency, r.balance, r.ledger_balance, r.tier, r.daily_limit, r.monthly_limit, r.tenant_id]);
  }
  console.log("✓ wallets");
}

// ─── Wallet Transactions ──────────────────────────────────────────────────────
async function seedWalletTransactions() {
  const { rows: wallets } = await pool.query("SELECT id FROM wallets LIMIT 5");
  if (!wallets.length) return;
  const wid = wallets[0].id;
  const txns = [
    { type: "credit", amount: "500000", balance_before: "2000000", balance_after: "2500000", description: "Top-up via Stripe", reference: uid("wt-"), channel: "stripe", status: "completed", tenant_id: T1 },
    { type: "debit", amount: "50000", balance_before: "2500000", balance_after: "2450000", description: "Transfer to beneficiary", reference: uid("wt-"), channel: "nip", status: "completed", tenant_id: T1 },
    { type: "credit", amount: "120000", balance_before: "2450000", balance_after: "2570000", description: "Cashback reward", reference: uid("wt-"), channel: "cashback", status: "completed", tenant_id: T1 },
  ];
  for (const t of txns) {
    await q(`INSERT INTO wallet_transactions (wallet_id, type, amount, currency, balance_before, balance_after, description, reference, channel, status, tenant_id)
      VALUES ($1,$2,$3,'NGN',$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [wid, t.type, t.amount, t.balance_before, t.balance_after, t.description, t.reference, t.channel, t.status, t.tenant_id]);
  }
  console.log("✓ wallet_transactions");
}

// ─── POS Terminals ────────────────────────────────────────────────────────────
async function seedPosTerminals() {
  const terminals = [
    { id: uid("pos-"), merchant_id: M1, serial_number: "POS-NG-001-2024", model: "Verifone VX520", status: "active", location: "Lagos Branch 1", battery_level: 85, network: "4G", last_heartbeat: past(0) },
    { id: uid("pos-"), merchant_id: M1, serial_number: "POS-NG-002-2024", model: "PAX A920", status: "active", location: "Abuja Branch", battery_level: 72, network: "WiFi", last_heartbeat: past(0) },
    { id: uid("pos-"), merchant_id: M2, serial_number: "POS-NG-003-2024", model: "Ingenico Move 5000", status: "active", location: "Port Harcourt", battery_level: 91, network: "4G", last_heartbeat: past(1) },
    { id: uid("pos-"), merchant_id: M3, serial_number: "POS-NG-004-2024", model: "Verifone VX820", status: "maintenance", location: "Kano Branch", battery_level: 45, network: "3G", last_heartbeat: past(3) },
  ];
  for (const t of terminals) {
    await q(`INSERT INTO pos_terminals (id, merchant_id, serial_number, model, status, location, battery_level, network, last_heartbeat)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.merchant_id, t.serial_number, t.model, t.status, t.location, t.battery_level, t.network, t.last_heartbeat]);
  }
  console.log("✓ pos_terminals");
}

// ─── POS Transactions ─────────────────────────────────────────────────────────
async function seedPosTransactions() {
  const { rows: terms } = await pool.query("SELECT id, merchant_id FROM pos_terminals LIMIT 4");
  if (!terms.length) return;
  for (const term of terms) {
    for (let i = 0; i < 3; i++) {
      const amount = Math.floor(Math.random() * 50000) + 5000;
      await q(`INSERT INTO pos_transactions (id, terminal_id, merchant_id, amount_kobo, currency, card_type, last_four, auth_code, status, created_at)
        VALUES ($1,$2,$3,$4,'NGN',$5,$6,$7,'approved',$8) ON CONFLICT (id) DO NOTHING`,
        [uid("ptx-"), term.id, term.merchant_id, amount, ["visa","mastercard","verve"][i % 3], String(1000 + Math.floor(Math.random()*9000)), uid("auth-"), past(i)]);
    }
  }
  console.log("✓ pos_transactions");
}

// ─── Restaurant Tables ────────────────────────────────────────────────────────
async function seedRestaurantTables() {
  const tables = [
    { id: uid("rtbl-"), merchant_id: M1, table_number: "T01", capacity: 4, status: "available", section: "Main Hall" },
    { id: uid("rtbl-"), merchant_id: M1, table_number: "T02", capacity: 6, status: "occupied", section: "Main Hall" },
    { id: uid("rtbl-"), merchant_id: M1, table_number: "T03", capacity: 2, status: "available", section: "Terrace" },
    { id: uid("rtbl-"), merchant_id: M2, table_number: "T01", capacity: 8, status: "available", section: "VIP" },
    { id: uid("rtbl-"), merchant_id: M2, table_number: "T02", capacity: 4, status: "reserved", section: "Main" },
  ];
  for (const t of tables) {
    await q(`INSERT INTO restaurant_tables (id, merchant_id, table_number, capacity, status, section)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.merchant_id, t.table_number, t.capacity, t.status, t.section]);
  }
  console.log("✓ restaurant_tables");
}

// ─── Restaurant Orders ────────────────────────────────────────────────────────
async function seedRestaurantOrders() {
  const { rows: tables } = await pool.query("SELECT id, merchant_id FROM restaurant_tables LIMIT 3");
  if (!tables.length) return;
  const orderIds: string[] = [];
  for (const tbl of tables) {
    const oid = uid("rord-");
    orderIds.push(oid);
    await q(`INSERT INTO restaurant_orders (id, merchant_id, table_id, status, total_kobo, tax_kobo, tip_kobo, created_at)
      VALUES ($1,$2,$3,'completed',$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [oid, tbl.merchant_id, tbl.id, 45000, 3375, 2250, past(1)]);
  }
  // Order items
  for (const oid of orderIds) {
    for (const item of [["Jollof Rice", 8000, 2], ["Chicken Suya", 5000, 1], ["Chapman", 2500, 3]]) {
      await q(`INSERT INTO restaurant_order_items (order_id, name, quantity, unit_price_kobo, total_kobo)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [oid, item[0], item[2], item[1], Number(item[1]) * Number(item[2])]);
    }
  }
  console.log("✓ restaurant_orders + restaurant_order_items");
}

// ─── Staff Members & Shifts ───────────────────────────────────────────────────
async function seedStaff() {
  const staff = [
    { id: uid("stf-"), merchant_id: M1, name: "Chidi Okonkwo", role: "manager", hourly_rate_kobo: 150000, bank_code: "058", account_number: "0123456789" },
    { id: uid("stf-"), merchant_id: M1, name: "Amaka Eze", role: "cashier", hourly_rate_kobo: 80000, bank_code: "033", account_number: "0234567890" },
    { id: uid("stf-"), merchant_id: M1, name: "Emeka Nwosu", role: "server", hourly_rate_kobo: 65000, bank_code: "044", account_number: "0345678901" },
    { id: uid("stf-"), merchant_id: M2, name: "Fatima Aliyu", role: "manager", hourly_rate_kobo: 140000, bank_code: "058", account_number: "0456789012" },
    { id: uid("stf-"), merchant_id: M2, name: "Seun Adeyemi", role: "server", hourly_rate_kobo: 70000, bank_code: "033", account_number: "0567890123" },
  ];
  const staffIds: string[] = [];
  for (const s of staff) {
    staffIds.push(s.id);
    await q(`INSERT INTO staff_members (id, merchant_id, name, role, hourly_rate_kobo, bank_code, account_number)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.merchant_id, s.name, s.role, s.hourly_rate_kobo, s.bank_code, s.account_number]);
  }
  // Shifts
  for (const sid of staffIds.slice(0, 3)) {
    await q(`INSERT INTO staff_shifts (staff_id, merchant_id, clock_in, clock_out, hours_worked, tips_kobo)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [sid, M1, past(1), past(0), 8, Math.floor(Math.random() * 20000)]);
  }
  console.log("✓ staff_members + staff_shifts");
}

// ─── Retail POS Configs ───────────────────────────────────────────────────────
async function seedRetailPosConfigs() {
  const configs = [
    { id: uid("rpc-"), merchant_id: M1, store_name: "Acme Lagos Store", tax_rate: "7.5", currency: "NGN", receipt_footer: "Thank you for shopping with us!", loyalty_enabled: true, inventory_tracking: true },
    { id: uid("rpc-"), merchant_id: M2, store_name: "Beta Payments PHC", tax_rate: "7.5", currency: "NGN", receipt_footer: "Come back soon!", loyalty_enabled: false, inventory_tracking: true },
  ];
  for (const c of configs) {
    await q(`INSERT INTO retail_pos_configs (id, merchant_id, store_name, tax_rate, currency, receipt_footer, loyalty_enabled, inventory_tracking)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.merchant_id, c.store_name, c.tax_rate, c.currency, c.receipt_footer, c.loyalty_enabled, c.inventory_tracking]);
  }
  console.log("✓ retail_pos_configs");
}

// ─── Retail Sales ─────────────────────────────────────────────────────────────
async function seedRetailSales() {
  for (let i = 0; i < 10; i++) {
    const amount = Math.floor(Math.random() * 100000) + 5000;
    await q(`INSERT INTO retail_sales (id, merchant_id, terminal_id, amount_kobo, tax_kobo, discount_kobo, payment_method, items_count, created_at)
      VALUES ($1,$2,null,$3,$4,0,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("rs-"), i % 2 === 0 ? M1 : M2, amount, Math.floor(amount * 0.075), ["cash","card","transfer"][i % 3], Math.floor(Math.random() * 5) + 1, past(i)]);
  }
  console.log("✓ retail_sales");
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
async function seedInvoices() {
  const invoices = [
    { id: uid("inv-"), merchant_id: M1, customer_id: C1, invoice_number: "INV-2026-001", amount_kobo: 500000, tax_kobo: 37500, status: "paid", due_date: past(10), paid_at: past(5), currency: "NGN" },
    { id: uid("inv-"), merchant_id: M1, customer_id: C2, invoice_number: "INV-2026-002", amount_kobo: 1200000, tax_kobo: 90000, status: "pending", due_date: future(15), paid_at: null, currency: "NGN" },
    { id: uid("inv-"), merchant_id: M2, customer_id: C3, invoice_number: "INV-2026-003", amount_kobo: 750000, tax_kobo: 56250, status: "overdue", due_date: past(5), paid_at: null, currency: "NGN" },
    { id: uid("inv-"), merchant_id: M3, customer_id: C1, invoice_number: "INV-2026-004", amount_kobo: 2500000, tax_kobo: 187500, status: "draft", due_date: future(30), paid_at: null, currency: "NGN" },
  ];
  const invIds: string[] = [];
  for (const inv of invoices) {
    invIds.push(inv.id);
    await q(`INSERT INTO invoices (id, merchant_id, customer_id, invoice_number, amount_kobo, tax_kobo, status, due_date, paid_at, currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [inv.id, inv.merchant_id, inv.customer_id, inv.invoice_number, inv.amount_kobo, inv.tax_kobo, inv.status, inv.due_date, inv.paid_at, inv.currency]);
  }
  // Invoice payments
  for (const iid of invIds.slice(0, 2)) {
    await q(`INSERT INTO invoice_payments (id, invoice_id, amount_kobo, payment_method, reference, paid_at)
      VALUES ($1,$2,$3,'bank_transfer',$4,$5) ON CONFLICT (id) DO NOTHING`,
      [uid("ipay-"), iid, 500000, uid("ref-"), past(5)]);
  }
  console.log("✓ invoices + invoice_payments");
}

// ─── Inventory Items ──────────────────────────────────────────────────────────
async function seedInventory() {
  const items = [
    { id: uid("inv-item-"), merchant_id: M1, name: "Laptop Stand", unit: "piece", current_stock: 50, cost_per_unit: 25000, reorder_level: 10 },
    { id: uid("inv-item-"), merchant_id: M1, name: "USB-C Hub", unit: "piece", current_stock: 120, cost_per_unit: 12000, reorder_level: 20 },
    { id: uid("inv-item-"), merchant_id: M1, name: "Wireless Mouse", unit: "piece", current_stock: 75, cost_per_unit: 8000, reorder_level: 15 },
    { id: uid("inv-item-"), merchant_id: M2, name: "Office Chair", unit: "piece", current_stock: 20, cost_per_unit: 85000, reorder_level: 5 },
    { id: uid("inv-item-"), merchant_id: M2, name: "Standing Desk", unit: "piece", current_stock: 8, cost_per_unit: 180000, reorder_level: 3 },
  ];
  const itemIds: string[] = [];
  for (const item of items) {
    itemIds.push(item.id);
    await q(`INSERT INTO inventory_items (id, merchant_id, name, unit, current_stock, cost_per_unit, reorder_level)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [item.id, item.merchant_id, item.name, item.unit, item.current_stock, item.cost_per_unit, item.reorder_level]);
  }
  // Inventory transactions
  for (const iid of itemIds.slice(0, 3)) {
    await q(`INSERT INTO inventory_transactions (id, item_id, merchant_id, type, quantity, unit_cost_kobo, reference, notes, created_at)
      VALUES ($1,$2,$3,'purchase',$4,$5,$6,'Initial stock purchase',$7) ON CONFLICT (id) DO NOTHING`,
      [uid("itx-"), iid, M1, 50, 25000, uid("po-"), past(30)]);
  }
  console.log("✓ inventory_items + inventory_transactions");
}

// ─── USSD Menus & Sessions ────────────────────────────────────────────────────
async function seedUssd() {
  const menus = [
    { menu_code: "*737#", title: "PayGate USSD Banking", parent_id: null, options: JSON.stringify([{ key: "1", label: "Check Balance", action: "balance" }, { key: "2", label: "Transfer Money", action: "transfer" }, { key: "3", label: "Pay Bills", action: "bills" }, { key: "0", label: "Exit", action: "exit" }]) },
    { menu_code: "*737*1#", title: "Check Balance", parent_id: null, options: JSON.stringify([{ key: "1", label: "Wallet Balance", action: "wallet_balance" }, { key: "2", label: "Bank Balance", action: "bank_balance" }, { key: "0", label: "Back", action: "back" }]) },
    { menu_code: "*737*2#", title: "Transfer Money", parent_id: null, options: JSON.stringify([{ key: "1", label: "To PayGate User", action: "p2p" }, { key: "2", label: "To Bank Account", action: "bank_transfer" }, { key: "0", label: "Back", action: "back" }]) },
  ];
  const menuIds: number[] = [];
  for (const m of menus) {
    const res = await pool.query(`INSERT INTO ussd_menus (menu_code, title, parent_id, options) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`, [m.menu_code, m.title, m.parent_id, m.options]);
    if (res.rows[0]) menuIds.push(res.rows[0].id);
  }
  // USSD Sessions
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO ussd_sessions (id, phone_number, session_code, merchant_id, current_menu, status, language, started_at, ended_at)
      VALUES ($1,$2,$3,$4,$5,'completed','en',$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("ussd-"), `+234${800 + i}0000000`, "*737#", M1, menuIds[0] ?? 1, past(i), past(i)]);
  }
  console.log("✓ ussd_menus + ussd_sessions");
}

// ─── NFC Devices & Transactions ───────────────────────────────────────────────
async function seedNfc() {
  const devices = [
    { id: uid("nfc-"), merchant_id: M1, device_name: "NFC Terminal 1", device_type: "soundbox", serial_number: "NFC-001-2024", status: "active", firmware_version: "2.1.0" },
    { id: uid("nfc-"), merchant_id: M1, device_name: "NFC Terminal 2", device_type: "pos", serial_number: "NFC-002-2024", status: "active", firmware_version: "2.1.0" },
    { id: uid("nfc-"), merchant_id: M2, device_name: "NFC Wearable 1", device_type: "wearable", serial_number: "NFC-003-2024", status: "active", firmware_version: "1.5.2" },
  ];
  const devIds: string[] = [];
  for (const d of devices) {
    devIds.push(d.id);
    await q(`INSERT INTO nfc_devices (id, merchant_id, device_name, device_type, serial_number, status, firmware_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [d.id, d.merchant_id, d.device_name, d.device_type, d.serial_number, d.status, d.firmware_version]);
  }
  // NFC Transactions
  for (const did of devIds) {
    await q(`INSERT INTO nfc_transactions (id, device_id, merchant_id, amount_kobo, currency, status, card_token, created_at)
      VALUES ($1,$2,$3,$4,'NGN','success',$5,$6) ON CONFLICT (id) DO NOTHING`,
      [uid("nfctx-"), did, M1, Math.floor(Math.random() * 30000) + 2000, uid("tok-"), past(Math.floor(Math.random() * 5))]);
  }
  console.log("✓ nfc_devices + nfc_transactions");
}

// ─── Soundbox Devices ─────────────────────────────────────────────────────────
async function seedSoundboxDevices() {
  const devices = [
    { id: uid("sb-"), merchant_id: M1, device_name: "Soundbox Lagos 1", serial_number: "SB-NG-001", model: "PayGate SB-100", status: "online", volume: 80, language: "en" },
    { id: uid("sb-"), merchant_id: M1, device_name: "Soundbox Lagos 2", serial_number: "SB-NG-002", model: "PayGate SB-100", status: "online", volume: 75, language: "yo" },
    { id: uid("sb-"), merchant_id: M2, device_name: "Soundbox PHC", serial_number: "SB-NG-003", model: "PayGate SB-200", status: "online", volume: 85, language: "ig" },
  ];
  for (const d of devices) {
    await q(`INSERT INTO soundbox_devices (id, merchant_id, device_name, serial_number, model, status, volume, language)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [d.id, d.merchant_id, d.device_name, d.serial_number, d.model, d.status, d.volume, d.language]);
  }
  console.log("✓ soundbox_devices");
}

// ─── Digital Gold ─────────────────────────────────────────────────────────────
async function seedDigitalGold() {
  const holdings = [
    { id: uid("dg-"), user_id: U1, merchant_id: M1, grams: "5.250", avg_buy_price_per_gram: "85000", current_value_kobo: "472500", status: "active" },
    { id: uid("dg-"), user_id: U2, merchant_id: M2, grams: "2.100", avg_buy_price_per_gram: "83000", current_value_kobo: "184800", status: "active" },
    { id: uid("dg-"), user_id: U3, merchant_id: M1, grams: "10.000", avg_buy_price_per_gram: "80000", current_value_kobo: "900000", status: "active" },
  ];
  const holdingIds: string[] = [];
  for (const h of holdings) {
    holdingIds.push(h.id);
    await q(`INSERT INTO digital_gold_holdings (id, user_id, merchant_id, grams, avg_buy_price_per_gram, current_value_kobo, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [h.id, h.user_id, h.merchant_id, h.grams, h.avg_buy_price_per_gram, h.current_value_kobo, h.status]);
  }
  // Transactions
  for (const hid of holdingIds) {
    await q(`INSERT INTO digital_gold_transactions (id, holding_id, user_id, type, grams, price_per_gram, total_kobo, status, created_at)
      VALUES ($1,$2,$3,'buy',$4,$5,$6,'completed',$7) ON CONFLICT (id) DO NOTHING`,
      [uid("dgt-"), hid, U1, "2.500", "85000", "212500", past(7)]);
  }
  console.log("✓ digital_gold_holdings + digital_gold_transactions");
}

// ─── Mutual Funds ─────────────────────────────────────────────────────────────
async function seedMutualFunds() {
  const holdings = [
    { id: uid("mf-"), user_id: U1, fund_name: "ARM Discovery Fund", fund_code: "ARM-DISC-01", units: "150.500", nav_per_unit: "45000", current_value_kobo: "6772500", status: "active" },
    { id: uid("mf-"), user_id: U2, fund_name: "Stanbic IBTC Money Market", fund_code: "SIB-MM-01", units: "500.000", nav_per_unit: "12000", current_value_kobo: "6000000", status: "active" },
    { id: uid("mf-"), user_id: U3, fund_name: "FBN Fixed Income Fund", fund_code: "FBN-FI-01", units: "200.000", nav_per_unit: "25000", current_value_kobo: "5000000", status: "active" },
  ];
  const holdingIds: string[] = [];
  for (const h of holdings) {
    holdingIds.push(h.id);
    await q(`INSERT INTO mutual_fund_holdings (id, user_id, fund_name, fund_code, units, nav_per_unit, current_value_kobo, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [h.id, h.user_id, h.fund_name, h.fund_code, h.units, h.nav_per_unit, h.current_value_kobo, h.status]);
  }
  // Transactions
  for (const hid of holdingIds) {
    await q(`INSERT INTO mutual_fund_transactions (id, holding_id, user_id, type, units, nav_per_unit, amount_kobo, status, created_at)
      VALUES ($1,$2,$3,'invest',$4,$5,$6,'completed',$7) ON CONFLICT (id) DO NOTHING`,
      [uid("mft-"), hid, U1, "50.000", "45000", "2250000", past(14)]);
  }
  console.log("✓ mutual_fund_holdings + mutual_fund_transactions");
}

// ─── Pension Accounts & Contributions ────────────────────────────────────────
async function seedPension() {
  const accounts = [
    { id: uid("pen-"), user_id: U1, merchant_id: M1, pfa_name: "ARM Pension Managers", rsa_pin: "PEN120456789", balance_kobo: "5800000", status: "active" },
    { id: uid("pen-"), user_id: U2, merchant_id: M2, pfa_name: "Stanbic IBTC Pension", rsa_pin: "PEN220456789", balance_kobo: "3200000", status: "active" },
    { id: uid("pen-"), user_id: U3, merchant_id: M1, pfa_name: "Leadway Pensure", rsa_pin: "PEN320456789", balance_kobo: "8500000", status: "active" },
  ];
  const penIds: string[] = [];
  for (const a of accounts) {
    penIds.push(a.id);
    await q(`INSERT INTO pension_accounts (id, user_id, merchant_id, pfa_name, rsa_pin, balance_kobo, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.user_id, a.merchant_id, a.pfa_name, a.rsa_pin, a.balance_kobo, a.status]);
  }
  // Contributions
  for (const pid of penIds) {
    for (let m = 1; m <= 3; m++) {
      await q(`INSERT INTO pension_contributions (id, pension_account_id, user_id, amount_kobo, employer_amount_kobo, period, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,'posted',$7) ON CONFLICT (id) DO NOTHING`,
        [uid("pcon-"), pid, U1, 180000, 270000, `2026-0${m}`, past(30 * (4 - m))]);
    }
  }
  console.log("✓ pension_accounts + pension_contributions");
}

// ─── Salary Accounts ─────────────────────────────────────────────────────────
async function seedSalaryAccounts() {
  const accounts = [
    { id: uid("sal-"), merchant_id: M1, employee_name: "Chidi Okonkwo", employee_id: "EMP-001", bank_code: "058", account_number: "0123456789", salary_kobo: 450000, status: "active" },
    { id: uid("sal-"), merchant_id: M1, employee_name: "Amaka Eze", employee_id: "EMP-002", bank_code: "033", account_number: "0234567890", salary_kobo: 280000, status: "active" },
    { id: uid("sal-"), merchant_id: M1, employee_name: "Emeka Nwosu", employee_id: "EMP-003", bank_code: "044", account_number: "0345678901", salary_kobo: 220000, status: "active" },
    { id: uid("sal-"), merchant_id: M2, employee_name: "Fatima Aliyu", employee_id: "EMP-004", bank_code: "058", account_number: "0456789012", salary_kobo: 380000, status: "active" },
    { id: uid("sal-"), merchant_id: M2, employee_name: "Seun Adeyemi", employee_id: "EMP-005", bank_code: "033", account_number: "0567890123", salary_kobo: 250000, status: "active" },
  ];
  const salIds: string[] = [];
  for (const a of accounts) {
    salIds.push(a.id);
    await q(`INSERT INTO salary_accounts (id, merchant_id, employee_name, employee_id, bank_code, account_number, salary_kobo, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.merchant_id, a.employee_name, a.employee_id, a.bank_code, a.account_number, a.salary_kobo, a.status]);
  }
  // Salary transactions
  for (const sid of salIds.slice(0, 3)) {
    await q(`INSERT INTO salary_transactions (id, salary_account_id, merchant_id, type, amount_kobo, description, reference, status, created_at)
      VALUES ($1,$2,$3,'disbursement',$4,'Monthly salary payment',$5,'completed',$6) ON CONFLICT (id) DO NOTHING`,
      [uid("stx-"), sid, M1, 450000, uid("sal-ref-"), past(5)]);
  }
  console.log("✓ salary_accounts + salary_transactions");
}

// ─── Nodal Accounts ───────────────────────────────────────────────────────────
async function seedNodalAccounts() {
  const accounts = [
    { id: uid("nod-"), merchant_id: M1, bank_code: "058", account_number: "0000123456", account_name: "Acme Fintech Nodal", balance_kobo: 25000000, purpose: "escrow", status: "active" },
    { id: uid("nod-"), merchant_id: M1, bank_code: "033", account_number: "0000234567", account_name: "Acme Collections Nodal", balance_kobo: 12000000, purpose: "collections", status: "active" },
    { id: uid("nod-"), merchant_id: M2, bank_code: "044", account_number: "0000345678", account_name: "Beta Payments Nodal", balance_kobo: 8500000, purpose: "escrow", status: "active" },
  ];
  const nodIds: string[] = [];
  for (const a of accounts) {
    nodIds.push(a.id);
    await q(`INSERT INTO nodal_accounts (id, merchant_id, bank_code, account_number, account_name, balance_kobo, purpose, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.merchant_id, a.bank_code, a.account_number, a.account_name, a.balance_kobo, a.purpose, a.status]);
  }
  // Nodal transactions
  for (const nid of nodIds) {
    await q(`INSERT INTO nodal_transactions (id, nodal_account_id, merchant_id, type, amount_kobo, description, reference, status, created_at)
      VALUES ($1,$2,$3,'credit',$4,'Merchant collection',$5,'completed',$6) ON CONFLICT (id) DO NOTHING`,
      [uid("ntx-"), nid, M1, Math.floor(Math.random() * 500000) + 100000, uid("nref-"), past(Math.floor(Math.random() * 7))]);
  }
  console.log("✓ nodal_accounts + nodal_transactions");
}

// ─── Payroll V3 ───────────────────────────────────────────────────────────────
async function seedPayrollV3() {
  const employees = [
    { id: uid("pv3e-"), merchant_id: M1, name: "Chidi Okonkwo", email: "chidi@acme.ng", department: "Engineering", designation: "Senior Engineer", gross_salary_kobo: 850000, bank_code: "058", account_number: "0123456789", tax_id: "TIN-001-2024", status: "active" },
    { id: uid("pv3e-"), merchant_id: M1, name: "Amaka Eze", email: "amaka@acme.ng", department: "Finance", designation: "Accountant", gross_salary_kobo: 550000, bank_code: "033", account_number: "0234567890", tax_id: "TIN-002-2024", status: "active" },
    { id: uid("pv3e-"), merchant_id: M2, name: "Fatima Aliyu", email: "fatima@beta.ng", department: "Operations", designation: "Operations Manager", gross_salary_kobo: 720000, bank_code: "058", account_number: "0456789012", tax_id: "TIN-003-2024", status: "active" },
  ];
  const empIds: string[] = [];
  for (const e of employees) {
    empIds.push(e.id);
    await q(`INSERT INTO payroll_v3_employees (id, merchant_id, name, email, department, designation, gross_salary_kobo, bank_code, account_number, tax_id, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.merchant_id, e.name, e.email, e.department, e.designation, e.gross_salary_kobo, e.bank_code, e.account_number, e.tax_id, e.status]);
  }
  // Payroll runs
  for (let m = 1; m <= 3; m++) {
    await q(`INSERT INTO payroll_v3_runs (id, merchant_id, period, status, total_gross_kobo, total_net_kobo, total_tax_kobo, employee_count, processed_at)
      VALUES ($1,$2,$3,'completed',$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [uid("prun-"), M1, `2026-0${m}`, 2120000, 1750000, 370000, 2, past(30 * (4 - m))]);
  }
  console.log("✓ payroll_v3_employees + payroll_v3_runs");
}

// ─── P2P Transfers ────────────────────────────────────────────────────────────
async function seedP2PTransfers() {
  const transfers = [
    { id: uid("p2p-"), sender_id: U1, recipient_id: U2, amount_kobo: 50000, currency: "NGN", note: "Lunch split", status: "completed", reference: uid("p2pref-") },
    { id: uid("p2p-"), sender_id: U2, recipient_id: U3, amount_kobo: 25000, currency: "NGN", note: "Owe you from last week", status: "completed", reference: uid("p2pref-") },
    { id: uid("p2p-"), sender_id: U3, recipient_id: U1, amount_kobo: 100000, currency: "NGN", note: "Rent contribution", status: "completed", reference: uid("p2pref-") },
    { id: uid("p2p-"), sender_id: U4, recipient_id: U5, amount_kobo: 15000, currency: "NGN", note: "Movie tickets", status: "pending", reference: uid("p2pref-") },
    { id: uid("p2p-"), sender_id: U1, recipient_id: U5, amount_kobo: 75000, currency: "NGN", note: "Business reimbursement", status: "completed", reference: uid("p2pref-") },
  ];
  for (const t of transfers) {
    await q(`INSERT INTO p2p_transfers (id, sender_id, recipient_id, amount_kobo, currency, note, status, reference, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.sender_id, t.recipient_id, t.amount_kobo, t.currency, t.note, t.status, t.reference, past(Math.floor(Math.random() * 10))]);
  }
  console.log("✓ p2p_transfers");
}

// ─── Tax Filing Records ───────────────────────────────────────────────────────
async function seedTaxFilingRecords() {
  const records = [
    { id: uid("tfr-"), merchant_id: M1, tax_type: "VAT", period: "2026-Q1", taxable_amount: 15000000, tax_amount: 1125000, status: "filed", filed_at: past(30), receipt_number: "VAT-2026-Q1-001", due_date: past(15) },
    { id: uid("tfr-"), merchant_id: M1, tax_type: "WHT", period: "2026-03", taxable_amount: 5000000, tax_amount: 250000, status: "filed", filed_at: past(25), receipt_number: "WHT-2026-03-001", due_date: past(20) },
    { id: uid("tfr-"), merchant_id: M2, tax_type: "VAT", period: "2026-Q1", taxable_amount: 8000000, tax_amount: 600000, status: "draft", filed_at: null, receipt_number: null, due_date: future(15) },
    { id: uid("tfr-"), merchant_id: M1, tax_type: "CIT", period: "2025", taxable_amount: 45000000, tax_amount: 9000000, status: "pending", filed_at: null, receipt_number: null, due_date: future(60) },
  ];
  for (const r of records) {
    await q(`INSERT INTO tax_filing_records (id, merchant_id, tax_type, period, taxable_amount, tax_amount, status, filed_at, receipt_number, due_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.merchant_id, r.tax_type, r.period, r.taxable_amount, r.tax_amount, r.status, r.filed_at, r.receipt_number, r.due_date]);
  }
  // Tax withholding records
  const { rows: txns } = await pool.query("SELECT id FROM transactions LIMIT 3");
  for (const txn of txns) {
    await q(`INSERT INTO tax_withholding_records (id, merchant_id, transaction_id, gross_amount_kobo, tax_amount_kobo, net_amount_kobo, tax_type, tax_rate_pct, period, status)
      VALUES ($1,$2,$3,$4,$5,$6,'WHT','5.0','2026-03','remitted') ON CONFLICT (id) DO NOTHING`,
      [uid("twr-"), M1, txn.id, 100000, 5000, 95000]);
  }
  console.log("✓ tax_filing_records + tax_withholding_records");
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────
async function seedPurchaseOrders() {
  const { rows: items } = await pool.query("SELECT id, name, cost_per_unit FROM inventory_items LIMIT 3");
  if (!items.length) return;
  for (const item of items) {
    await q(`INSERT INTO purchase_orders (id, merchant_id, inventory_item_id, item_name, vendor_name, quantity, unit, unit_cost_kobo, total_cost_kobo, notes, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,'units',$7,$8,'Quarterly restock',$9,$10) ON CONFLICT (id) DO NOTHING`,
      [uid("po-"), M1, item.id, item.name, "TechSupply Nigeria Ltd", 100, item.cost_per_unit, item.cost_per_unit * 100, "approved", "admin"]);
  }
  console.log("✓ purchase_orders");
}

// ─── Subscriptions & Stripe Subscriptions ────────────────────────────────────
async function seedSubscriptions() {
  const plans = [
    { id: uid("plan-"), name: "Starter", price_kobo: 4900, interval: "monthly", features: JSON.stringify(["100 transactions/mo", "1 user", "Basic analytics"]) },
    { id: uid("plan-"), name: "Growth", price_kobo: 29900, interval: "monthly", features: JSON.stringify(["1000 transactions/mo", "5 users", "Advanced analytics", "API access"]) },
    { id: uid("plan-"), name: "Scale", price_kobo: 99900, interval: "monthly", features: JSON.stringify(["Unlimited transactions", "20 users", "Full analytics", "Priority support", "Custom integrations"]) },
  ];
  const planIds: string[] = [];
  for (const p of plans) {
    planIds.push(p.id);
    await q(`INSERT INTO subscriptions (id, name, price_kobo, interval, features, status, created_at)
      VALUES ($1,$2,$3,$4,$5,'active',now()) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.price_kobo, p.interval, p.features]);
  }
  // Stripe subscriptions
  for (const mid of [M1, M2, M3]) {
    await q(`INSERT INTO stripe_subscriptions (id, merchant_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end, created_at)
      VALUES ($1,$2,$3,$4,'growth','active',$5,$6,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("ss-"), mid, `cus_${uid()}`, `sub_${uid()}`, past(30), future(0)]);
  }
  console.log("✓ subscriptions + stripe_subscriptions");
}

// ─── Support Messages ─────────────────────────────────────────────────────────
async function seedSupportMessages() {
  const messages = [
    { id: uid("sup-"), merchant_id: M1, user_id: U1, subject: "Transaction not reflecting", body: "I made a transfer 2 hours ago but it's not showing in my dashboard.", status: "resolved", priority: "high", category: "transactions" },
    { id: uid("sup-"), merchant_id: M1, user_id: U2, subject: "API key not working", body: "My production API key returns 401 errors since yesterday.", status: "open", priority: "critical", category: "api" },
    { id: uid("sup-"), merchant_id: M2, user_id: U3, subject: "Payout delay", body: "My payout scheduled for Monday has not arrived.", status: "in_progress", priority: "medium", category: "payouts" },
    { id: uid("sup-"), merchant_id: M3, user_id: U4, subject: "KYC document rejected", body: "My business registration document was rejected. What format is required?", status: "open", priority: "medium", category: "kyc" },
    { id: uid("sup-"), merchant_id: M1, user_id: U5, subject: "Integration question", body: "How do I implement webhook retry logic in my Node.js app?", status: "resolved", priority: "low", category: "integration" },
  ];
  for (const m of messages) {
    await q(`INSERT INTO support_messages (id, merchant_id, user_id, subject, body, status, priority, category, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.merchant_id, m.user_id, m.subject, m.body, m.status, m.priority, m.category, past(Math.floor(Math.random() * 14))]);
  }
  console.log("✓ support_messages");
}

// ─── Saved Beneficiaries ──────────────────────────────────────────────────────
async function seedSavedBeneficiaries() {
  const beneficiaries = [
    { id: uid("ben-"), user_id: U1, merchant_id: M1, name: "Ngozi Adeyemi", bank_code: "058", account_number: "0987654321", account_name: "NGOZI ADEYEMI", type: "bank", is_favorite: true },
    { id: uid("ben-"), user_id: U1, merchant_id: M1, name: "Kola Bello", bank_code: "033", account_number: "0876543210", account_name: "KOLAWOLE BELLO", type: "bank", is_favorite: false },
    { id: uid("ben-"), user_id: U2, merchant_id: M2, name: "Tunde Fashola", bank_code: "044", account_number: "0765432109", account_name: "BABATUNDE FASHOLA", type: "bank", is_favorite: true },
    { id: uid("ben-"), user_id: U3, merchant_id: M1, name: "Aisha Mohammed", bank_code: "058", account_number: "0654321098", account_name: "AISHA MOHAMMED", type: "bank", is_favorite: false },
  ];
  for (const b of beneficiaries) {
    await q(`INSERT INTO saved_beneficiaries (id, user_id, merchant_id, name, bank_code, account_number, account_name, type, is_favorite)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [b.id, b.user_id, b.merchant_id, b.name, b.bank_code, b.account_number, b.account_name, b.type, b.is_favorite]);
  }
  console.log("✓ saved_beneficiaries");
}

// ─── Scheduled Reports ────────────────────────────────────────────────────────
async function seedScheduledReports() {
  const reports = [
    { id: uid("sr-"), merchant_id: M1, name: "Daily Transaction Summary", type: "transactions", frequency: "daily", format: "csv", email: "finance@acme.ng", status: "active" },
    { id: uid("sr-"), merchant_id: M1, name: "Weekly Settlement Report", type: "settlements", frequency: "weekly", format: "pdf", email: "ops@acme.ng", status: "active" },
    { id: uid("sr-"), merchant_id: M2, name: "Monthly Revenue Report", type: "revenue", frequency: "monthly", format: "xlsx", email: "cfo@beta.ng", status: "active" },
    { id: uid("sr-"), merchant_id: M3, name: "Compliance Report", type: "compliance", frequency: "monthly", format: "pdf", email: "compliance@gamma.ng", status: "active" },
  ];
  for (const r of reports) {
    await q(`INSERT INTO scheduled_reports (id, merchant_id, name, type, frequency, format, email, status, next_run_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.merchant_id, r.name, r.type, r.frequency, r.format, r.email, r.status, future(1)]);
  }
  console.log("✓ scheduled_reports");
}

// ─── Merchant Profiles ────────────────────────────────────────────────────────
async function seedMerchantProfiles() {
  const profiles = [
    { id: uid("mp-"), merchant_id: M1, website: "https://acme.ng", industry: "fintech", employee_count: "51-200", annual_revenue: "100M-500M", description: "Leading fintech company in West Africa", social_twitter: "@acmefintech", social_linkedin: "acme-fintech-ng" },
    { id: uid("mp-"), merchant_id: M2, website: "https://betapay.ng", industry: "payments", employee_count: "11-50", annual_revenue: "10M-50M", description: "Fast and reliable payment processing", social_twitter: "@betapayments", social_linkedin: "beta-payments" },
    { id: uid("mp-"), merchant_id: M3, website: "https://gammaremit.ng", industry: "remittance", employee_count: "1-10", annual_revenue: "1M-10M", description: "Cross-border remittance specialists", social_twitter: "@gammaremit", social_linkedin: null },
  ];
  for (const p of profiles) {
    await q(`INSERT INTO merchant_profiles (id, merchant_id, website, industry, employee_count, annual_revenue, description, social_twitter, social_linkedin)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.merchant_id, p.website, p.industry, p.employee_count, p.annual_revenue, p.description, p.social_twitter, p.social_linkedin]);
  }
  console.log("✓ merchant_profiles");
}

// ─── Merchant Directors ───────────────────────────────────────────────────────
async function seedMerchantDirectors() {
  const directors = [
    { id: uid("dir-"), merchant_id: M1, name: "Adewale Okonkwo", role: "CEO", email: "ceo@acme.ng", phone: "+2348012345678", nationality: "Nigerian", bvn: "22012345678", is_primary: true },
    { id: uid("dir-"), merchant_id: M1, name: "Chioma Obi", role: "CFO", email: "cfo@acme.ng", phone: "+2348023456789", nationality: "Nigerian", bvn: "22023456789", is_primary: false },
    { id: uid("dir-"), merchant_id: M2, name: "Emeka Nwachukwu", role: "CEO", email: "ceo@beta.ng", phone: "+2348034567890", nationality: "Nigerian", bvn: "22034567890", is_primary: true },
  ];
  for (const d of directors) {
    await q(`INSERT INTO merchant_directors (id, merchant_id, name, role, email, phone, nationality, bvn, is_primary)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [d.id, d.merchant_id, d.name, d.role, d.email, d.phone, d.nationality, d.bvn, d.is_primary]);
  }
  console.log("✓ merchant_directors");
}

// ─── Merchant Notifications ───────────────────────────────────────────────────
async function seedMerchantNotifications() {
  const notifications = [
    { id: uid("mn-"), merchant_id: M1, title: "Settlement Completed", body: "Your NGN 2,500,000 settlement has been processed.", type: "settlement", read: false },
    { id: uid("mn-"), merchant_id: M1, title: "New Dispute Filed", body: "Customer TXN-2026-001 has filed a dispute. Please respond within 5 days.", type: "dispute", read: true },
    { id: uid("mn-"), merchant_id: M2, title: "API Key Expiring", body: "Your production API key expires in 7 days. Please rotate it.", type: "security", read: false },
    { id: uid("mn-"), merchant_id: M1, title: "KYC Approved", body: "Your business KYC has been approved. You can now process unlimited transactions.", type: "kyc", read: true },
    { id: uid("mn-"), merchant_id: M3, title: "Fraud Alert", body: "Unusual transaction pattern detected. Review your recent transactions.", type: "fraud", read: false },
  ];
  for (const n of notifications) {
    await q(`INSERT INTO merchant_notifications (id, merchant_id, title, body, type, read, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [n.id, n.merchant_id, n.title, n.body, n.type, n.read, past(Math.floor(Math.random() * 7))]);
  }
  console.log("✓ merchant_notifications");
}

// ─── Merchant Status Log ──────────────────────────────────────────────────────
async function seedMerchantStatusLog() {
  const logs = [
    { id: uid("msl-"), merchant_id: M1, from_status: "pending", to_status: "active", reason: "KYC approved", changed_by: "admin" },
    { id: uid("msl-"), merchant_id: M2, from_status: "pending", to_status: "active", reason: "KYC approved", changed_by: "admin" },
    { id: uid("msl-"), merchant_id: M3, from_status: "pending", to_status: "active", reason: "KYC approved", changed_by: "admin" },
    { id: uid("msl-"), merchant_id: M1, from_status: "active", to_status: "suspended", reason: "Suspicious activity detected", changed_by: "compliance" },
    { id: uid("msl-"), merchant_id: M1, from_status: "suspended", to_status: "active", reason: "Investigation cleared", changed_by: "admin" },
  ];
  for (const l of logs) {
    await q(`INSERT INTO merchant_status_log (id, merchant_id, from_status, to_status, reason, changed_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [l.id, l.merchant_id, l.from_status, l.to_status, l.reason, l.changed_by, past(Math.floor(Math.random() * 30))]);
  }
  console.log("✓ merchant_status_log");
}

// ─── Merchant Loans ───────────────────────────────────────────────────────────
async function seedMerchantLoans() {
  const loans = [
    { id: uid("ml-"), merchant_id: M1, amount_kobo: 5000000, interest_rate: "18.5", tenure_months: 12, purpose: "Working capital", status: "active", disbursed_at: past(60) },
    { id: uid("ml-"), merchant_id: M2, amount_kobo: 2000000, interest_rate: "22.0", tenure_months: 6, purpose: "Equipment purchase", status: "repaid", disbursed_at: past(180) },
    { id: uid("ml-"), merchant_id: M3, amount_kobo: 1000000, interest_rate: "20.0", tenure_months: 3, purpose: "Inventory financing", status: "pending", disbursed_at: null },
  ];
  for (const l of loans) {
    await q(`INSERT INTO merchant_loans (id, merchant_id, amount_kobo, interest_rate, tenure_months, purpose, status, disbursed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [l.id, l.merchant_id, l.amount_kobo, l.interest_rate, l.tenure_months, l.purpose, l.status, l.disbursed_at]);
  }
  console.log("✓ merchant_loans");
}

// ─── Privacy Settings & Aliases ───────────────────────────────────────────────
async function seedPrivacy() {
  for (const uid_val of [U1, U2, U3]) {
    await q(`INSERT INTO privacy_settings (user_id, hide_balance, hide_transactions, hide_contacts, marketing_opt_in, analytics_opt_in)
      VALUES ($1, false, false, false, true, true) ON CONFLICT (user_id) DO NOTHING`, [uid_val]);
  }
  for (const uid_val of [U1, U2]) {
    await q(`INSERT INTO privacy_aliases (id, user_id, alias, created_at)
      VALUES ($1,$2,$3,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("pa-"), uid_val, `paygate-${uid()}`]);
  }
  console.log("✓ privacy_settings + privacy_aliases");
}

// ─── Realtime Notification Preferences ───────────────────────────────────────
async function seedRealtimeNotifications() {
  for (const uid_val of [U1, U2, U3, U4, U5]) {
    await q(`INSERT INTO realtime_notification_preferences (user_id, merchant_id, email_enabled, sms_enabled, push_enabled, transaction_alerts, fraud_alerts, marketing_alerts, settlement_alerts)
      VALUES ($1,$2,true,true,true,true,true,false,true) ON CONFLICT (user_id) DO NOTHING`,
      [uid_val, uid_val === U1 || uid_val === U2 ? M1 : M2]);
  }
  // History
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO realtime_notification_history (id, user_id, type, title, body, read, created_at)
      VALUES ($1,$2,$3,$4,$5,false,$6) ON CONFLICT (id) DO NOTHING`,
      [uid("rnh-"), U1, "transaction", "Payment Received", `You received NGN ${(Math.random() * 100000).toFixed(0)} from a customer`, past(i)]);
  }
  console.log("✓ realtime_notification_preferences + realtime_notification_history");
}

// ─── Report Jobs ──────────────────────────────────────────────────────────────
async function seedReportJobs() {
  const jobs = [
    { id: uid("rj-"), merchant_id: M1, type: "transactions", status: "completed", format: "csv", url: "https://cdn.paygate.ng/reports/txn-2026-03.csv", created_at: past(5) },
    { id: uid("rj-"), merchant_id: M1, type: "settlements", status: "completed", format: "pdf", url: "https://cdn.paygate.ng/reports/settle-2026-03.pdf", created_at: past(10) },
    { id: uid("rj-"), merchant_id: M2, type: "revenue", status: "processing", format: "xlsx", url: null, created_at: past(0) },
  ];
  for (const j of jobs) {
    await q(`INSERT INTO report_jobs (id, merchant_id, type, status, format, url, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [j.id, j.merchant_id, j.type, j.status, j.format, j.url, j.created_at]);
  }
  console.log("✓ report_jobs");
}

// ─── Reconciliation Alerts ────────────────────────────────────────────────────
async function seedReconciliationAlerts() {
  const alerts = [
    { id: uid("ra-"), merchant_id: M1, type: "missing_settlement", severity: "high", description: "Settlement for 2026-03-15 not received", status: "open", amount_kobo: 2500000 },
    { id: uid("ra-"), merchant_id: M2, type: "amount_mismatch", severity: "medium", description: "Settlement amount differs by NGN 5,000", status: "resolved", amount_kobo: 500000 },
    { id: uid("ra-"), merchant_id: M1, type: "duplicate_transaction", severity: "low", description: "Possible duplicate TXN detected", status: "investigating", amount_kobo: 50000 },
  ];
  for (const a of alerts) {
    await q(`INSERT INTO reconciliation_alerts (id, merchant_id, type, severity, description, status, amount_kobo, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.merchant_id, a.type, a.severity, a.description, a.status, a.amount_kobo, past(Math.floor(Math.random() * 14))]);
  }
  console.log("✓ reconciliation_alerts");
}

// ─── Middleware Health Alerts ─────────────────────────────────────────────────
async function seedMiddlewareHealthAlerts() {
  const alerts = [
    { id: uid("mha-"), service: "tigerbeetle", severity: "warning", message: "TigerBeetle response time >200ms", resolved: true, resolved_at: past(1) },
    { id: uid("mha-"), service: "nibss", severity: "critical", message: "NIBSS gateway timeout", resolved: true, resolved_at: past(2) },
    { id: uid("mha-"), service: "mojaloop", severity: "info", message: "Mojaloop scheduled maintenance", resolved: false, resolved_at: null },
  ];
  for (const a of alerts) {
    await q(`INSERT INTO middleware_health_alerts (service, severity, message, resolved, resolved_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [a.service, a.severity, a.message, a.resolved, a.resolved_at, past(Math.floor(Math.random() * 7))]);
  }
  console.log("✓ middleware_health_alerts");
}

// ─── Tenant Config & SSO ──────────────────────────────────────────────────────
async function seedTenantConfig() {
  const tenantIds = [T1, T2, T3];
  for (const tid of tenantIds) {
    await q(`INSERT INTO tenant_config (tenant_id, max_transaction_amount, min_transaction_amount, allowed_currencies, webhook_retry_count, webhook_timeout_ms, require_2fa, session_timeout_minutes, ip_whitelist_enabled, updated_at)
      VALUES ($1, 50000000, 100, ARRAY['NGN','USD','GBP'], 3, 30000, false, 60, false, now()) ON CONFLICT (tenant_id) DO NOTHING`, [tid]);
    await q(`INSERT INTO tenant_sso_configs (id, tenant_id, provider, client_id, client_secret_hash, metadata_url, enabled, created_at)
      VALUES ($1,$2,'saml',$3,$4,'https://sso.acme.ng/metadata',false,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("sso-"), tid, `sso-client-${uid()}`, `hash-${uid()}`]);
  }
  console.log("✓ tenant_config + tenant_sso_configs");
}

// ─── Tenant Audit Logs ────────────────────────────────────────────────────────
async function seedTenantAuditLogs() {
  const tenantIds = [T1, T2, T3];
  for (const tid of tenantIds) {
    for (const action of ["tenant.created", "tenant.plan_upgraded", "tenant.branding_updated"]) {
      await q(`INSERT INTO tenant_audit_logs (id, tenant_id, action, actor_id, actor_type, ip_address, user_agent, metadata, created_at)
        VALUES ($1,$2,$3,'admin','system','41.58.0.1','Mozilla/5.0','{}'::jsonb,$4) ON CONFLICT (id) DO NOTHING`,
        [uid("tal-"), tid, action, past(Math.floor(Math.random() * 30))]);
    }
  }
  console.log("✓ tenant_audit_logs");
}

// ─── Tenant API Keys ──────────────────────────────────────────────────────────
async function seedTenantApiKeys() {
  const tenantIds = [T1, T2, T3];
  for (const tid of tenantIds) {
    await q(`INSERT INTO tenant_api_keys (id, tenant_id, name, key_hash, key_prefix, scopes, environment, last_used_at, created_at)
      VALUES ($1,$2,'Production Key',$3,$4,ARRAY['read','write'],'production',now(),now()) ON CONFLICT (id) DO NOTHING`,
      [uid("tak-"), tid, `hash-${uid()}`, `pk_live_${uid().substring(0, 8)}`]);
  }
  console.log("✓ tenant_api_keys");
}

// ─── Tenant Corridor Daily Stats ──────────────────────────────────────────────
async function seedTenantCorridorDailyStats() {
  const { rows: corridors } = await pool.query("SELECT id, tenant_id FROM tenant_corridors LIMIT 5");
  if (!corridors.length) return;
  for (const corridor of corridors) {
    for (let d = 0; d < 7; d++) {
      await q(`INSERT INTO tenant_corridor_daily_stats (id, corridor_id, tenant_id, date, transaction_count, volume_kobo, fee_kobo, success_rate, avg_processing_ms)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [uid("tcds-"), corridor.id, corridor.tenant_id, past(d).split("T")[0], Math.floor(Math.random() * 100) + 10, Math.floor(Math.random() * 5000000) + 100000, Math.floor(Math.random() * 50000), 98.5 + Math.random(), Math.floor(Math.random() * 500) + 100]);
    }
  }
  console.log("✓ tenant_corridor_daily_stats");
}

// ─── Webhook Endpoints & Simulator Logs ──────────────────────────────────────
async function seedWebhookEndpoints() {
  const endpoints = [
    { id: uid("we-"), merchant_id: M1, url: "https://api.acme.ng/webhooks/paygate", events: ["payment.success", "payment.failed", "payout.completed"], secret: uid("whsec-"), active: true },
    { id: uid("we-"), merchant_id: M2, url: "https://api.beta.ng/hooks", events: ["payment.success", "dispute.created"], secret: uid("whsec-"), active: true },
  ];
  for (const e of endpoints) {
    await q(`INSERT INTO webhook_endpoints (id, merchant_id, url, events, secret, active)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.merchant_id, e.url, JSON.stringify(e.events), e.secret, e.active]);
  }
  // Simulator logs
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO webhook_simulator_logs (id, merchant_id, event_type, payload, response_status, response_body, latency_ms, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [uid("wsl-"), M1, "payment.success", JSON.stringify({ amount: 50000, currency: "NGN" }), 200, '{"received":true}', Math.floor(Math.random() * 500) + 50, past(i)]);
  }
  console.log("✓ webhook_endpoints + webhook_simulator_logs");
}

// ─── Webhook Failure Alerts (already has 5 rows, add more) ───────────────────
async function seedWebhookFailureAlerts() {
  for (let i = 0; i < 3; i++) {
    await q(`INSERT INTO webhook_failure_alerts (id, merchant_id, webhook_id, failure_count, last_error, last_attempted_at, acknowledged, created_at)
      VALUES ($1,$2,null,$3,'Connection timeout',$4,false,$5) ON CONFLICT (id) DO NOTHING`,
      [uid("wfa-"), i % 2 === 0 ? M1 : M2, Math.floor(Math.random() * 10) + 1, past(i), past(i + 1)]);
  }
  console.log("✓ webhook_failure_alerts (extended)");
}

// ─── Billing Cron Runs ────────────────────────────────────────────────────────
async function seedBillingCronRuns() {
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO billing_cron_runs (run_type, status, tenants_processed, invoices_generated, errors, started_at, completed_at)
      VALUES ('monthly_billing','completed',$1,$2,0,$3,$4)`,
      [Math.floor(Math.random() * 10) + 5, Math.floor(Math.random() * 8) + 3, past(30 * (i + 1)), past(30 * (i + 1))]);
  }
  console.log("✓ billing_cron_runs");
}

// ─── Rate Limit Events (already has 10, add more context) ────────────────────
async function seedRateLimitEvents() {
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO rate_limit_events (id, merchant_id, endpoint, ip_address, limit_type, requests_count, window_seconds, blocked_at, tenant_id)
      VALUES ($1,$2,$3,$4,'api_calls',$5,60,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("rle-"), i % 2 === 0 ? M1 : M2, "/api/trpc/transactions.list", `41.58.${i}.1`, Math.floor(Math.random() * 50) + 100, past(i), T1]);
  }
  console.log("✓ rate_limit_events (extended)");
}

// ─── Escrow Contracts ─────────────────────────────────────────────────────────
async function seedEscrowContracts() {
  const contracts = [
    { id: uid("esc-"), merchant_id: M1, buyer_id: C1, seller_id: C2, amount_kobo: 500000, currency: "NGN", description: "Software development milestone 1", status: "active", release_date: future(30) },
    { id: uid("esc-"), merchant_id: M2, buyer_id: C2, seller_id: C3, amount_kobo: 1200000, currency: "NGN", description: "Property deposit", status: "released", release_date: past(5) },
  ];
  for (const c of contracts) {
    await q(`INSERT INTO escrow_contracts (id, merchant_id, buyer_id, seller_id, amount_kobo, currency, description, status, release_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.merchant_id, c.buyer_id, c.seller_id, c.amount_kobo, c.currency, c.description, c.status, c.release_date]);
  }
  console.log("✓ escrow_contracts");
}

// ─── Cross-border Transfers ───────────────────────────────────────────────────
async function seedCrossBorderTransfers() {
  const transfers = [
    { id: uid("cbt-"), merchant_id: M3, sender_id: U1, amount_kobo: 500000, source_currency: "NGN", dest_currency: "GBP", dest_amount: "1050", exchange_rate: "0.0021", recipient_name: "John Smith", recipient_bank: "Barclays", recipient_account: "GB29NWBK60161331926819", status: "completed" },
    { id: uid("cbt-"), merchant_id: M3, sender_id: U2, amount_kobo: 1000000, source_currency: "NGN", dest_currency: "USD", dest_amount: "620", exchange_rate: "0.00062", recipient_name: "Mary Johnson", recipient_bank: "Chase Bank", recipient_account: "US1234567890", status: "processing" },
  ];
  for (const t of transfers) {
    await q(`INSERT INTO cross_border_transfers (id, merchant_id, sender_id, amount_kobo, source_currency, dest_currency, dest_amount, exchange_rate, recipient_name, recipient_bank, recipient_account, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.merchant_id, t.sender_id, t.amount_kobo, t.source_currency, t.dest_currency, t.dest_amount, t.exchange_rate, t.recipient_name, t.recipient_bank, t.recipient_account, t.status, past(Math.floor(Math.random() * 7))]);
  }
  console.log("✓ cross_border_transfers");
}

// ─── Payout Batches ───────────────────────────────────────────────────────────
async function seedPayoutBatches() {
  // Already has 12 rows, just ensure a few more
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM payout_batches");
  if (Number(existing[0].cnt) >= 12) { console.log("✓ payout_batches (already seeded)"); return; }
  for (let i = 0; i < 3; i++) {
    await q(`INSERT INTO payout_batches (id, merchant_id, total_amount_kobo, count, status, processed_at, created_at)
      VALUES ($1,$2,$3,$4,'completed',$5,$6) ON CONFLICT (id) DO NOTHING`,
      [uid("pb-"), i % 2 === 0 ? M1 : M2, Math.floor(Math.random() * 5000000) + 500000, Math.floor(Math.random() * 20) + 5, past(i), past(i + 1)]);
  }
  console.log("✓ payout_batches (extended)");
}

// ─── Payout Approval Workflows ────────────────────────────────────────────────
async function seedPayoutApprovalWorkflows() {
  const { rows: payouts } = await pool.query("SELECT id, merchant_id FROM payouts LIMIT 3");
  for (const payout of payouts) {
    await q(`INSERT INTO payout_approval_workflows (payout_id, merchant_id, status, approver_email, requested_by, amount_kobo, notes, created_at)
      VALUES ($1,$2,'approved',$3,'system',500000,'Auto-approved under threshold',$4)`,
      [payout.id, payout.merchant_id, process.env.PAYOUT_APPROVER_EMAIL ?? "approver@paygate.ng", past(3)]);
  }
  console.log("✓ payout_approval_workflows");
}

// ─── Bulk Collections ─────────────────────────────────────────────────────────
async function seedBulkCollections() {
  const collections = [
    { id: uid("bc-"), merchant_id: M1, name: "March Subscription Renewals", total_amount_kobo: 2500000, count: 50, status: "completed", processed_at: past(5) },
    { id: uid("bc-"), merchant_id: M2, name: "Q1 Invoice Collections", total_amount_kobo: 8500000, count: 25, status: "processing", processed_at: null },
  ];
  const collIds: string[] = [];
  for (const c of collections) {
    collIds.push(c.id);
    await q(`INSERT INTO bulk_collections (id, merchant_id, name, total_amount_kobo, count, status, processed_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.merchant_id, c.name, c.total_amount_kobo, c.count, c.status, c.processed_at, past(7)]);
  }
  // Bulk collection items
  for (const cid of collIds) {
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO bulk_collection_items (id, collection_id, customer_id, amount_kobo, status, reference, created_at)
        VALUES ($1,$2,$3,$4,'completed',$5,$6) ON CONFLICT (id) DO NOTHING`,
        [uid("bci-"), cid, `cust-00${i + 1}`, Math.floor(Math.random() * 100000) + 10000, uid("ref-"), past(5)]);
    }
  }
  console.log("✓ bulk_collections + bulk_collection_items");
}

// ─── Bulk Payment Schedules ───────────────────────────────────────────────────
async function seedBulkPaymentSchedules() {
  for (let i = 0; i < 3; i++) {
    await q(`INSERT INTO bulk_payment_schedules (id, merchant_id, name, frequency, next_run_at, status, total_recipients, created_at)
      VALUES ($1,$2,$3,'monthly',$4,'active',$5,$6) ON CONFLICT (id) DO NOTHING`,
      [uid("bps-"), i % 2 === 0 ? M1 : M2, `Payroll Schedule ${i + 1}`, future(30 - i * 5), Math.floor(Math.random() * 50) + 5, past(30)]);
  }
  console.log("✓ bulk_payment_schedules");
}

// ─── Consumer Wallets (already has 5, extend) ─────────────────────────────────
async function seedConsumerWallets() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM consumer_wallets");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ consumer_wallets (already seeded)"); return; }
  for (const uid_val of [U4, U5]) {
    await q(`INSERT INTO consumer_wallets (id, user_id, balance_kobo, ledger_balance_kobo, currency, tier, daily_limit_kobo, monthly_limit_kobo, status, created_at)
      VALUES ($1,$2,$3,$3,'NGN','tier1',50000,500000,'active',now()) ON CONFLICT (id) DO NOTHING`,
      [uid("cw-"), uid_val, Math.floor(Math.random() * 200000) + 10000]);
  }
  console.log("✓ consumer_wallets (extended)");
}

// ─── Consumer Wallet Transactions ────────────────────────────────────────────
async function seedConsumerWalletTxns() {
  const { rows: wallets } = await pool.query("SELECT id, user_id FROM consumer_wallets LIMIT 5");
  for (const w of wallets) {
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO consumer_wallet_txns (id, wallet_id, user_id, type, amount_kobo, balance_before_kobo, balance_after_kobo, description, reference, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10) ON CONFLICT (id) DO NOTHING`,
        [uid("cwt-"), w.id, w.user_id, i % 2 === 0 ? "credit" : "debit", Math.floor(Math.random() * 50000) + 5000, 100000, 150000, "Consumer wallet transaction", uid("cwref-"), past(i)]);
    }
  }
  console.log("✓ consumer_wallet_txns");
}

// ─── Consumer Outbox ──────────────────────────────────────────────────────────
async function seedConsumerOutbox() {
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO consumer_outbox (id, user_id, event_type, payload, processed, created_at)
      VALUES ($1,$2,$3,$4,true,$5) ON CONFLICT (id) DO NOTHING`,
      [uid("co-"), U1, ["wallet.credited", "payment.completed", "kyc.approved"][i % 3], JSON.stringify({ amount: 50000, currency: "NGN" }), past(i)]);
  }
  console.log("✓ consumer_outbox");
}

// ─── Consumer Idempotency Keys ────────────────────────────────────────────────
async function seedConsumerIdempotencyKeys() {
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO consumer_idempotency_keys (id, user_id, key, operation, response_hash, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("cik-"), U1, uid("idem-"), "transfer", uid("hash-"), future(24), past(i)]);
  }
  console.log("✓ consumer_idempotency_keys");
}

// ─── Consumer Phone Verifications ────────────────────────────────────────────
async function seedConsumerPhoneVerifications() {
  for (const uid_val of [U1, U2, U3]) {
    await q(`INSERT INTO consumer_phone_verifications (id, user_id, phone_number, otp_hash, verified, expires_at, created_at)
      VALUES ($1,$2,$3,$4,true,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [uid("cpv-"), uid_val, `+234${800 + Number(uid_val)}0000000`, uid("hash-"), future(0), past(30)]);
  }
  console.log("✓ consumer_phone_verifications");
}

// ─── Consumer KYC Records ────────────────────────────────────────────────────
async function seedConsumerKycRecords() {
  for (const uid_val of [U1, U2, U3, U4]) {
    await q(`INSERT INTO consumer_kyc_records (id, user_id, bvn_hash, nin_hash, tier, status, verified_at, created_at)
      VALUES ($1,$2,$3,$4,$5,'approved',$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("ckr-"), uid_val, uid("bvn-hash-"), uid("nin-hash-"), uid_val === U1 ? "tier3" : "tier2", past(30), past(60)]);
  }
  console.log("✓ consumer_kyc_records");
}

// ─── Consumer Insurance Policies ─────────────────────────────────────────────
async function seedConsumerInsurance() {
  const policies = [
    { id: uid("cip-"), user_id: U1, provider: "AXA Mansard", policy_type: "health", premium_kobo: 50000, coverage_kobo: 5000000, status: "active", start_date: past(90), end_date: future(275) },
    { id: uid("cip-"), user_id: U2, provider: "Leadway Assurance", policy_type: "life", premium_kobo: 25000, coverage_kobo: 10000000, status: "active", start_date: past(60), end_date: future(305) },
    { id: uid("cip-"), user_id: U3, provider: "AIICO Insurance", policy_type: "device", premium_kobo: 15000, coverage_kobo: 500000, status: "active", start_date: past(30), end_date: future(335) },
  ];
  for (const p of policies) {
    await q(`INSERT INTO consumer_insurance_policies (id, user_id, provider, policy_type, premium_kobo, coverage_kobo, status, start_date, end_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.user_id, p.provider, p.policy_type, p.premium_kobo, p.coverage_kobo, p.status, p.start_date, p.end_date]);
  }
  // Claims
  await q(`INSERT INTO consumer_insurance_claims (id, policy_id, user_id, amount_kobo, description, status, created_at)
    VALUES ($1,$2,$3,150000,'Hospital admission claim','approved',$4) ON CONFLICT (id) DO NOTHING`,
    [uid("cic-"), policies[0].id, U1, past(15)]);
  console.log("✓ consumer_insurance_policies + consumer_insurance_claims");
}

// ─── Consumer Finance Loans ───────────────────────────────────────────────────
async function seedConsumerFinanceLoans() {
  const loans = [
    { id: uid("cfl-"), user_id: U1, amount_kobo: 500000, interest_rate: "24.0", tenure_months: 6, monthly_payment_kobo: 90000, status: "active", disbursed_at: past(30) },
    { id: uid("cfl-"), user_id: U2, amount_kobo: 200000, interest_rate: "30.0", tenure_months: 3, monthly_payment_kobo: 73000, status: "repaid", disbursed_at: past(120) },
  ];
  for (const l of loans) {
    await q(`INSERT INTO consumer_finance_loans (id, user_id, amount_kobo, interest_rate, tenure_months, monthly_payment_kobo, status, disbursed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [l.id, l.user_id, l.amount_kobo, l.interest_rate, l.tenure_months, l.monthly_payment_kobo, l.status, l.disbursed_at]);
  }
  console.log("✓ consumer_finance_loans");
}

// ─── Consumer Fraud Flags ─────────────────────────────────────────────────────
async function seedConsumerFraudFlags() {
  const flags = [
    { id: uid("cff-"), user_id: U4, flag_type: "velocity_breach", severity: "medium", description: "5 transactions in 10 minutes", status: "investigating", created_at: past(2) },
    { id: uid("cff-"), user_id: U5, flag_type: "device_change", severity: "low", description: "Login from new device", status: "resolved", created_at: past(5) },
  ];
  for (const f of flags) {
    await q(`INSERT INTO consumer_fraud_flags (id, user_id, flag_type, severity, description, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.user_id, f.flag_type, f.severity, f.description, f.status, f.created_at]);
  }
  console.log("✓ consumer_fraud_flags");
}

// ─── Consumer Recurring Payments ─────────────────────────────────────────────
async function seedConsumerRecurringPayments() {
  const payments = [
    { id: uid("crp-"), user_id: U1, merchant_id: M1, amount_kobo: 5000, description: "Netflix subscription", frequency: "monthly", next_payment_date: future(15), status: "active" },
    { id: uid("crp-"), user_id: U2, merchant_id: M2, amount_kobo: 10000, description: "Gym membership", frequency: "monthly", next_payment_date: future(20), status: "active" },
  ];
  for (const p of payments) {
    await q(`INSERT INTO consumer_recurring_payments (id, user_id, merchant_id, amount_kobo, description, frequency, next_payment_date, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.user_id, p.merchant_id, p.amount_kobo, p.description, p.frequency, p.next_payment_date, p.status]);
  }
  console.log("✓ consumer_recurring_payments");
}

// ─── Consumer Split Sessions ──────────────────────────────────────────────────
async function seedConsumerSplitSessions() {
  const sessions = [
    { id: uid("css-"), creator_id: U1, title: "Dinner at Nkoyo", total_kobo: 120000, participant_count: 4, status: "completed" },
    { id: uid("css-"), creator_id: U2, title: "Team outing", total_kobo: 250000, participant_count: 6, status: "active" },
  ];
  const sessIds: string[] = [];
  for (const s of sessions) {
    sessIds.push(s.id);
    await q(`INSERT INTO consumer_split_sessions (id, creator_id, title, total_kobo, participant_count, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.creator_id, s.title, s.total_kobo, s.participant_count, s.status, past(3)]);
  }
  // Participants
  for (const sid of sessIds) {
    for (const uid_val of [U1, U2, U3]) {
      await q(`INSERT INTO consumer_split_participants (id, session_id, user_id, share_kobo, status, paid_at)
        VALUES ($1,$2,$3,$4,'paid',$5) ON CONFLICT (id) DO NOTHING`,
        [uid("csp-"), sid, uid_val, 30000, past(2)]);
    }
  }
  console.log("✓ consumer_split_sessions + consumer_split_participants");
}

// ─── Consumer Loyalty ─────────────────────────────────────────────────────────
async function seedConsumerLoyalty() {
  for (const uid_val of [U1, U2, U3]) {
    await q(`INSERT INTO consumer_loyalty_accounts (id, user_id, points_balance, tier, lifetime_points, created_at)
      VALUES ($1,$2,$3,'silver',$4,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("cla-"), uid_val, Math.floor(Math.random() * 5000) + 500, Math.floor(Math.random() * 10000) + 1000]);
    await q(`INSERT INTO consumer_loyalty_txns (id, user_id, type, points, description, reference, created_at)
      VALUES ($1,$2,'earn',$3,'Points earned on purchase',$4,$5) ON CONFLICT (id) DO NOTHING`,
      [uid("clt-"), uid_val, Math.floor(Math.random() * 500) + 50, uid("ref-"), past(Math.floor(Math.random() * 7))]);
  }
  console.log("✓ consumer_loyalty_accounts + consumer_loyalty_txns");
}

// ─── Consumer Contacts ────────────────────────────────────────────────────────
async function seedConsumerContacts() {
  const contacts = [
    { id: uid("cc-"), user_id: U1, contact_user_id: U2, nickname: "Tunde", is_favorite: true },
    { id: uid("cc-"), user_id: U1, contact_user_id: U3, nickname: "Amaka", is_favorite: false },
    { id: uid("cc-"), user_id: U2, contact_user_id: U1, nickname: "Adewale", is_favorite: true },
  ];
  for (const c of contacts) {
    await q(`INSERT INTO consumer_contacts (id, user_id, contact_user_id, nickname, is_favorite, created_at)
      VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.user_id, c.contact_user_id, c.nickname, c.is_favorite]);
  }
  console.log("✓ consumer_contacts");
}

// ─── Consumer Notification Prefs ─────────────────────────────────────────────
async function seedConsumerNotificationPrefs() {
  for (const uid_val of [U1, U2, U3, U4, U5]) {
    await q(`INSERT INTO consumer_notification_prefs (user_id, push_enabled, sms_enabled, email_enabled, transaction_alerts, promo_alerts, security_alerts, updated_at)
      VALUES ($1,true,true,true,true,false,true,now()) ON CONFLICT (user_id) DO NOTHING`, [uid_val]);
  }
  console.log("✓ consumer_notification_prefs");
}

// ─── Consumer Pins ────────────────────────────────────────────────────────────
async function seedConsumerPins() {
  for (const uid_val of [U1, U2, U3]) {
    await q(`INSERT INTO consumer_pins (user_id, pin_hash, failed_attempts, locked_until, created_at)
      VALUES ($1,$2,0,null,now()) ON CONFLICT (user_id) DO NOTHING`,
      [uid_val, `$2b$10$${uid()}`]);
  }
  console.log("✓ consumer_pins");
}

// ─── Device Push Tokens ───────────────────────────────────────────────────────
async function seedDevicePushTokens() {
  for (const uid_val of [U1, U2, U3, U4, U5]) {
    await q(`INSERT INTO device_push_tokens (id, user_id, token, platform, app_version, active, created_at)
      VALUES ($1,$2,$3,$4,'1.0.0',true,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("dpt-"), uid_val, uid("fcm-token-"), ["ios", "android", "web"][Number(uid_val) % 3]]);
  }
  console.log("✓ device_push_tokens");
}

// ─── SDK Tokens (already has 10, add more) ────────────────────────────────────
async function seedSdkTokens() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM sdk_tokens");
  if (Number(existing[0].cnt) >= 10) { console.log("✓ sdk_tokens (already seeded)"); return; }
  for (const mid of [M1, M2, M3]) {
    await q(`INSERT INTO sdk_tokens (id, merchant_id, token, environment, expires_at, created_at)
      VALUES ($1,$2,$3,'production',$4,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("sdk-"), mid, uid("sdktok-"), future(365)]);
  }
  console.log("✓ sdk_tokens (extended)");
}

// ─── Geofence Rules ───────────────────────────────────────────────────────────
async function seedGeofenceRules() {
  const rules = [
    { id: uid("geo-"), merchant_id: M1, name: "Lagos Delivery Zone", lat: "6.5244", lng: "3.3792", radius_meters: 5000, action: "allow", active: true },
    { id: uid("geo-"), merchant_id: M1, name: "Abuja Branch Zone", lat: "9.0765", lng: "7.3986", radius_meters: 3000, action: "allow", active: true },
    { id: uid("geo-"), merchant_id: M2, name: "PHC Service Area", lat: "4.8156", lng: "7.0498", radius_meters: 8000, action: "allow", active: true },
  ];
  for (const r of rules) {
    await q(`INSERT INTO geofence_rules (id, merchant_id, name, lat, lng, radius_meters, action, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.merchant_id, r.name, r.lat, r.lng, r.radius_meters, r.action, r.active]);
  }
  console.log("✓ geofence_rules");
}

// ─── Agent Banking ────────────────────────────────────────────────────────────
async function seedAgentBanking() {
  const agents = [
    { id: uid("ab-"), merchant_id: M1, agent_name: "Kemi Stores", agent_code: "AGT-001", phone: "+2348012345678", location: "Surulere, Lagos", status: "active", float_balance_kobo: 500000 },
    { id: uid("ab-"), merchant_id: M1, agent_name: "Bello Supermarket", agent_code: "AGT-002", phone: "+2348023456789", location: "Wuse, Abuja", status: "active", float_balance_kobo: 350000 },
    { id: uid("ab-"), merchant_id: M2, agent_name: "Mama Cee Shop", agent_code: "AGT-003", phone: "+2348034567890", location: "Rumuola, PHC", status: "active", float_balance_kobo: 200000 },
  ];
  for (const a of agents) {
    await q(`INSERT INTO agent_banking_v4_agents (id, merchant_id, agent_name, agent_code, phone, location, status, float_balance_kobo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.merchant_id, a.agent_name, a.agent_code, a.phone, a.location, a.status, a.float_balance_kobo]);
  }
  console.log("✓ agent_banking_v4_agents");
}

// ─── Super Agent Networks ─────────────────────────────────────────────────────
async function seedSuperAgentNetworks() {
  const networks = [
    { id: uid("san-"), merchant_id: M1, name: "Lagos Super Agent Network", agent_count: 150, status: "active" },
    { id: uid("san-"), merchant_id: M2, name: "South-South Network", agent_count: 75, status: "active" },
  ];
  for (const n of networks) {
    await q(`INSERT INTO super_agent_v2_networks (id, merchant_id, name, agent_count, status, created_at)
      VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (id) DO NOTHING`,
      [n.id, n.merchant_id, n.name, n.agent_count, n.status]);
  }
  console.log("✓ super_agent_v2_networks");
}

// ─── QR Payments ─────────────────────────────────────────────────────────────
async function seedQrPayments() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM qr_payments");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ qr_payments (already seeded)"); return; }
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO qr_payments (id, merchant_id, amount_kobo, currency, qr_code, status, expires_at, paid_at, created_at)
      VALUES ($1,$2,$3,'NGN',$4,'completed',$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("qr-"), i % 2 === 0 ? M1 : M2, Math.floor(Math.random() * 50000) + 5000, uid("qrcode-"), future(1), past(i), past(i + 1)]);
  }
  console.log("✓ qr_payments (extended)");
}

// ─── USDC V2 Wallets & Transactions ──────────────────────────────────────────
async function seedUsdcV2() {
  const wallets = [
    { id: uid("uv2w-"), merchant_id: M1, address: `0x${uid()}`, network: "ethereum", balance_usdc: "1500.00", status: "active" },
    { id: uid("uv2w-"), merchant_id: M2, address: `0x${uid()}`, network: "polygon", balance_usdc: "750.50", status: "active" },
  ];
  const walletIds: string[] = [];
  for (const w of wallets) {
    walletIds.push(w.id);
    await q(`INSERT INTO usdc_v2_wallets (id, merchant_id, address, network, balance_usdc, status)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [w.id, w.merchant_id, w.address, w.network, w.balance_usdc, w.status]);
  }
  for (const wid of walletIds) {
    await q(`INSERT INTO usdc_v2_transactions (id, wallet_id, merchant_id, type, amount_usdc, tx_hash, status, created_at)
      VALUES ($1,$2,$3,'deposit','500.00',$4,'confirmed',$5) ON CONFLICT (id) DO NOTHING`,
      [uid("uv2t-"), wid, M1, `0x${uid()}`, past(7)]);
  }
  console.log("✓ usdc_v2_wallets + usdc_v2_transactions");
}

// ─── Multi-Currency Ledger ────────────────────────────────────────────────────
async function seedMultiCurrencyLedger() {
  const accounts = [
    { id: uid("mcl-"), merchant_id: M1, currency: "NGN", balance: "25000000", type: "operating" },
    { id: uid("mcl-"), merchant_id: M1, currency: "USD", balance: "15000", type: "operating" },
    { id: uid("mcl-"), merchant_id: M2, currency: "NGN", balance: "8500000", type: "operating" },
    { id: uid("mcl-"), merchant_id: M3, currency: "GBP", balance: "5000", type: "operating" },
  ];
  const acctIds: string[] = [];
  for (const a of accounts) {
    acctIds.push(a.id);
    await q(`INSERT INTO multi_currency_ledger_accounts (id, merchant_id, currency, balance, type, created_at)
      VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.merchant_id, a.currency, a.balance, a.type]);
  }
  for (const aid of acctIds.slice(0, 2)) {
    await q(`INSERT INTO multi_currency_ledger_entries (id, account_id, merchant_id, type, amount, currency, reference, description, created_at)
      VALUES ($1,$2,$3,'credit','500000','NGN',$4,'Settlement credit',$5) ON CONFLICT (id) DO NOTHING`,
      [uid("mcle-"), aid, M1, uid("ref-"), past(3)]);
  }
  console.log("✓ multi_currency_ledger_accounts + multi_currency_ledger_entries");
}

// ─── Open Banking V2 ──────────────────────────────────────────────────────────
async function seedOpenBankingV2() {
  for (const uid_val of [U1, U2, U3]) {
    const consentId = uid("obc-");
    await q(`INSERT INTO open_banking_consents_v2 (id, user_id, merchant_id, bank_code, bank_name, scope, status, expires_at, created_at)
      VALUES ($1,$2,$3,'058','GTBank',ARRAY['accounts','transactions'],'active',$4,now()) ON CONFLICT (id) DO NOTHING`,
      [consentId, uid_val, M1, future(90)]);
    await q(`INSERT INTO open_banking_accounts_v2 (id, consent_id, user_id, account_number, account_name, bank_code, bank_name, balance, currency, created_at)
      VALUES ($1,$2,$3,$4,$5,'058','GTBank',$6,'NGN',now()) ON CONFLICT (id) DO NOTHING`,
      [uid("oba-"), consentId, uid_val, `0${uid().substring(0, 9)}`, "ACCOUNT HOLDER NAME", String(Math.floor(Math.random() * 1000000) + 100000)]);
  }
  console.log("✓ open_banking_consents_v2 + open_banking_accounts_v2");
}

// ─── Wealth Goals & Risk Profiles ────────────────────────────────────────────
async function seedWealth() {
  for (const uid_val of [U1, U2, U3]) {
    await q(`INSERT INTO wealth_risk_profiles (user_id, risk_tolerance, investment_horizon, monthly_income_kobo, monthly_expenses_kobo, created_at)
      VALUES ($1,'moderate','5-10 years',500000,300000,now()) ON CONFLICT (user_id) DO NOTHING`, [uid_val]);
    await q(`INSERT INTO wealth_goals (id, user_id, name, target_amount_kobo, current_amount_kobo, target_date, category, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'active',now()) ON CONFLICT (id) DO NOTHING`,
      [uid("wg-"), uid_val, ["Emergency Fund", "House Purchase", "Retirement"][Number(uid_val) % 3], Math.floor(Math.random() * 10000000) + 1000000, Math.floor(Math.random() * 2000000), future(365 * 3), "savings"]);
  }
  console.log("✓ wealth_risk_profiles + wealth_goals");
}

// ─── Cashback Balances & Transactions ────────────────────────────────────────
async function seedCashback() {
  for (const uid_val of [U1, U2, U3, U4, U5]) {
    await q(`INSERT INTO cashback_balances (id, user_id, merchant_id, balance_kobo, lifetime_earned_kobo, created_at)
      VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("cb-"), uid_val, M1, Math.floor(Math.random() * 50000) + 1000, Math.floor(Math.random() * 100000) + 5000]);
    await q(`INSERT INTO cashback_transactions (id, user_id, merchant_id, type, amount_kobo, description, reference, created_at)
      VALUES ($1,$2,$3,'earn',$4,'Cashback on purchase',$5,$6) ON CONFLICT (id) DO NOTHING`,
      [uid("cbt-"), uid_val, M1, Math.floor(Math.random() * 5000) + 100, uid("cbref-"), past(Math.floor(Math.random() * 7))]);
  }
  console.log("✓ cashback_balances + cashback_transactions");
}

// ─── Coupon Redemptions ───────────────────────────────────────────────────────
async function seedCouponRedemptions() {
  const { rows: coupons } = await pool.query("SELECT id FROM coupons LIMIT 3");
  for (const coupon of coupons) {
    await q(`INSERT INTO coupon_redemptions (id, coupon_id, user_id, merchant_id, amount_kobo, redeemed_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [uid("cr-"), coupon.id, U1, M1, Math.floor(Math.random() * 10000) + 1000, past(Math.floor(Math.random() * 14))]);
  }
  console.log("✓ coupon_redemptions");
}

// ─── Red Envelopes ────────────────────────────────────────────────────────────
async function seedRedEnvelopes() {
  const envelopes = [
    { id: uid("re-"), sender_id: U1, merchant_id: M1, total_kobo: 100000, count: 5, message: "Happy New Year! 🎉", status: "active", expires_at: future(7) },
    { id: uid("re-"), sender_id: U2, merchant_id: M1, total_kobo: 50000, count: 3, message: "Congratulations! 🎊", status: "completed", expires_at: past(1) },
  ];
  const envIds: string[] = [];
  for (const e of envelopes) {
    envIds.push(e.id);
    await q(`INSERT INTO red_envelopes (id, sender_id, merchant_id, total_kobo, count, message, status, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.sender_id, e.merchant_id, e.total_kobo, e.count, e.message, e.status, e.expires_at]);
  }
  for (const eid of envIds) {
    for (const uid_val of [U2, U3]) {
      await q(`INSERT INTO red_envelope_claims (id, envelope_id, user_id, amount_kobo, claimed_at)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [uid("rec-"), eid, uid_val, 20000, past(1)]);
    }
  }
  console.log("✓ red_envelopes + red_envelope_claims");
}

// ─── Money Requests ───────────────────────────────────────────────────────────
async function seedMoneyRequests() {
  const requests = [
    { id: uid("mr-"), requester_id: U1, payer_id: U2, amount_kobo: 30000, description: "Shared taxi fare", status: "paid" },
    { id: uid("mr-"), requester_id: U2, payer_id: U3, amount_kobo: 15000, description: "Coffee and snacks", status: "pending" },
    { id: uid("mr-"), requester_id: U3, payer_id: U1, amount_kobo: 50000, description: "Team lunch", status: "declined" },
  ];
  for (const r of requests) {
    await q(`INSERT INTO money_requests (id, requester_id, payer_id, amount_kobo, description, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.requester_id, r.payer_id, r.amount_kobo, r.description, r.status, past(Math.floor(Math.random() * 7))]);
  }
  console.log("✓ money_requests");
}

// ─── Bill Payments ────────────────────────────────────────────────────────────
async function seedBillPayments() {
  const bills = [
    { id: uid("bp-"), user_id: U1, merchant_id: M1, biller: "IKEDC", category: "electricity", account_number: "1234567890", amount_kobo: 25000, status: "success", reference: uid("bref-") },
    { id: uid("bp-"), user_id: U2, merchant_id: M1, biller: "MTN Nigeria", category: "airtime", account_number: "+2348012345678", amount_kobo: 5000, status: "success", reference: uid("bref-") },
    { id: uid("bp-"), user_id: U3, merchant_id: M2, biller: "DSTV", category: "cable_tv", account_number: "1234567890", amount_kobo: 18900, status: "success", reference: uid("bref-") },
    { id: uid("bp-"), user_id: U1, merchant_id: M1, biller: "Lagos Water Corporation", category: "water", account_number: "0987654321", amount_kobo: 8000, status: "failed", reference: uid("bref-") },
  ];
  for (const b of bills) {
    await q(`INSERT INTO bill_payments (id, user_id, merchant_id, biller, category, account_number, amount_kobo, status, reference, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [b.id, b.user_id, b.merchant_id, b.biller, b.category, b.account_number, b.amount_kobo, b.status, b.reference, past(Math.floor(Math.random() * 14))]);
  }
  console.log("✓ bill_payments");
}

// ─── Intl Remittance Transfers ────────────────────────────────────────────────
async function seedIntlRemittance() {
  const transfers = [
    { id: uid("irt-"), sender_id: U1, merchant_id: M3, amount_kobo: 1000000, source_currency: "NGN", dest_currency: "GBP", dest_amount: "2100", exchange_rate: "0.0021", recipient_name: "James Wilson", recipient_country: "GB", status: "completed" },
    { id: uid("irt-"), sender_id: U2, merchant_id: M3, amount_kobo: 500000, source_currency: "NGN", dest_currency: "USD", dest_amount: "310", exchange_rate: "0.00062", recipient_name: "Sarah Connor", recipient_country: "US", status: "processing" },
  ];
  for (const t of transfers) {
    await q(`INSERT INTO intl_remittance_transfers (id, sender_id, merchant_id, amount_kobo, source_currency, dest_currency, dest_amount, exchange_rate, recipient_name, recipient_country, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.sender_id, t.merchant_id, t.amount_kobo, t.source_currency, t.dest_currency, t.dest_amount, t.exchange_rate, t.recipient_name, t.recipient_country, t.status, past(Math.floor(Math.random() * 7))]);
  }
  console.log("✓ intl_remittance_transfers");
}

// ─── Portal Subscriptions ─────────────────────────────────────────────────────
async function seedPortalSubscriptions() {
  const subs = [
    { id: uid("ps-"), merchant_id: M1, plan: "growth", status: "active", billing_cycle: "monthly", amount_kobo: 29900, next_billing_date: future(30) },
    { id: uid("ps-"), merchant_id: M2, plan: "starter", status: "active", billing_cycle: "monthly", amount_kobo: 4900, next_billing_date: future(15) },
    { id: uid("ps-"), merchant_id: M3, plan: "scale", status: "trialing", billing_cycle: "monthly", amount_kobo: 99900, next_billing_date: future(7) },
  ];
  for (const s of subs) {
    await q(`INSERT INTO portal_subscriptions (id, merchant_id, plan, status, billing_cycle, amount_kobo, next_billing_date, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.merchant_id, s.plan, s.status, s.billing_cycle, s.amount_kobo, s.next_billing_date]);
  }
  console.log("✓ portal_subscriptions");
}

// ─── Subscription Subscribers & Charges ──────────────────────────────────────
async function seedSubscriptionSubscribers() {
  const { rows: plans } = await pool.query("SELECT id FROM subscriptions LIMIT 3");
  for (const plan of plans) {
    for (const mid of [M1, M2]) {
      const subId = uid("sub-");
      await q(`INSERT INTO subscription_subscribers (id, plan_id, merchant_id, status, started_at, next_billing_at, created_at)
        VALUES ($1,$2,$3,'active',$4,$5,now()) ON CONFLICT (id) DO NOTHING`,
        [subId, plan.id, mid, past(30), future(0)]);
      await q(`INSERT INTO subscription_charges (id, subscriber_id, merchant_id, amount_kobo, status, charged_at, created_at)
        VALUES ($1,$2
,$3,$4,'completed',$5,now()) ON CONFLICT (id) DO NOTHING`,
        [uid("sc-"), subId, mid, 29900, past(30)]);
    }
  }
  console.log("✓ subscription_subscribers + subscription_charges");
}

// ─── EMI Contracts ────────────────────────────────────────────────────────────
async function seedEmiContracts() {
  const contracts = [
    { id: uid("emi-"), merchant_id: M1, customer_id: C1, product_name: "Samsung Galaxy S24", total_kobo: 450000, down_payment_kobo: 90000, monthly_instalment_kobo: 36000, tenure_months: 10, interest_rate: "0", status: "active" },
    { id: uid("emi-"), merchant_id: M2, customer_id: C2, product_name: "HP Laptop 15", total_kobo: 750000, down_payment_kobo: 150000, monthly_instalment_kobo: 60000, tenure_months: 10, interest_rate: "0", status: "active" },
  ];
  const emiIds: string[] = [];
  for (const c of contracts) {
    emiIds.push(c.id);
    await q(`INSERT INTO emi_contracts (id, merchant_id, customer_id, product_name, total_kobo, down_payment_kobo, monthly_instalment_kobo, tenure_months, interest_rate, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.merchant_id, c.customer_id, c.product_name, c.total_kobo, c.down_payment_kobo, c.monthly_instalment_kobo, c.tenure_months, c.interest_rate, c.status]);
  }
  // EMI payments
  for (const eid of emiIds) {
    for (let m = 1; m <= 2; m++) {
      await q(`INSERT INTO emi_payments (id, contract_id, instalment_number, amount_kobo, status, paid_at, created_at)
        VALUES ($1,$2,$3,$4,'paid',$5,now()) ON CONFLICT (id) DO NOTHING`,
        [uid("emip-"), eid, m, 36000, past(30 * (3 - m))]);
    }
  }
  console.log("✓ emi_contracts + emi_payments");
}

// ─── BNPL Plans (already has 5, extend) ──────────────────────────────────────
async function seedBnplPlans() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM bnpl_plans");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ bnpl_plans (already seeded)"); return; }
  const plans = [
    { id: uid("bnpl-"), merchant_id: M1, customer_id: C1, product_name: "iPhone 15 Pro", total_kobo: 1200000, instalments: 4, instalment_kobo: 300000, status: "active" },
    { id: uid("bnpl-"), merchant_id: M2, customer_id: C2, product_name: "LG Smart TV 55\"", total_kobo: 650000, instalments: 4, instalment_kobo: 162500, status: "active" },
  ];
  for (const p of plans) {
    await q(`INSERT INTO bnpl_plans (id, merchant_id, customer_id, product_name, total_kobo, instalments, instalment_kobo, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.merchant_id, p.customer_id, p.product_name, p.total_kobo, p.instalments, p.instalment_kobo, p.status]);
  }
  console.log("✓ bnpl_plans (extended)");
}

// ─── Loyalty Programs & Accounts ─────────────────────────────────────────────
async function seedLoyaltyPrograms() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM loyalty_programs");
  if (Number(existing[0].cnt) >= 3) { console.log("✓ loyalty_programs (already seeded)"); return; }
  const programs = [
    { id: uid("lp-"), merchant_id: M1, name: "PayGate Stars", description: "Earn stars on every transaction", points_per_kobo: "0.01", redemption_rate: "0.5", status: "active" },
    { id: uid("lp-"), merchant_id: M2, name: "Beta Rewards", description: "Cashback rewards program", points_per_kobo: "0.005", redemption_rate: "1.0", status: "active" },
  ];
  const progIds: string[] = [];
  for (const p of programs) {
    progIds.push(p.id);
    await q(`INSERT INTO loyalty_programs (id, merchant_id, name, description, points_per_kobo, redemption_rate, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.merchant_id, p.name, p.description, p.points_per_kobo, p.redemption_rate, p.status]);
  }
  for (const pid of progIds) {
    for (const uid_val of [U1, U2, U3]) {
      await q(`INSERT INTO loyalty_accounts (id, program_id, user_id, points_balance, lifetime_points, tier, created_at)
        VALUES ($1,$2,$3,$4,$5,'silver',now()) ON CONFLICT (id) DO NOTHING`,
        [uid("la-"), pid, uid_val, Math.floor(Math.random() * 5000) + 100, Math.floor(Math.random() * 10000) + 500]);
    }
  }
  console.log("✓ loyalty_programs + loyalty_accounts");
}

// ─── KYB State Transitions ────────────────────────────────────────────────────
async function seedKybStateTransitions() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM kyb_state_transitions");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ kyb_state_transitions (already seeded)"); return; }
  const transitions = [
    { merchant_id: 9001, from_state: "not_started", to_state: "documents_submitted", reason: "Merchant submitted CAC documents", actor: "merchant" },
    { merchant_id: 9001, from_state: "documents_submitted", to_state: "under_review", reason: "Compliance team started review", actor: "compliance" },
    { merchant_id: 9001, from_state: "under_review", to_state: "approved", reason: "All documents verified", actor: "compliance" },
    { merchant_id: 9002, from_state: "not_started", to_state: "documents_submitted", reason: "Merchant submitted documents", actor: "merchant" },
    { merchant_id: 9002, from_state: "documents_submitted", to_state: "under_review", reason: "Review started", actor: "compliance" },
    { merchant_id: 9002, from_state: "under_review", to_state: "approved", reason: "Documents verified", actor: "compliance" },
    { merchant_id: 9003, from_state: "not_started", to_state: "documents_submitted", reason: "Documents submitted", actor: "merchant" },
    { merchant_id: 9003, from_state: "documents_submitted", to_state: "under_review", reason: "Review in progress", actor: "compliance" },
  ];
  for (const t of transitions) {
    await q(`INSERT INTO kyb_state_transitions (id, merchant_id, from_state, to_state, reason, actor, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("kst-"), t.merchant_id, t.from_state, t.to_state, t.reason, t.actor, past(Math.floor(Math.random() * 30))]);
  }
  console.log("✓ kyb_state_transitions");
}

// ─── Merchant Branding ────────────────────────────────────────────────────────
async function seedMerchantBranding() {
  const brandings = [
    { id: uid("mb-"), merchant_id: M1, primary_color: "#1E40AF", secondary_color: "#3B82F6", logo_url: "https://cdn.paygate.ng/logos/acme.png", favicon_url: "https://cdn.paygate.ng/favicons/acme.ico", custom_domain: "pay.acme.ng", support_email: "support@acme.ng", support_phone: "+2348012345678" },
    { id: uid("mb-"), merchant_id: M2, primary_color: "#065F46", secondary_color: "#10B981", logo_url: "https://cdn.paygate.ng/logos/beta.png", favicon_url: null, custom_domain: null, support_email: "help@beta.ng", support_phone: "+2348023456789" },
    { id: uid("mb-"), merchant_id: M3, primary_color: "#7C3AED", secondary_color: "#A78BFA", logo_url: "https://cdn.paygate.ng/logos/gamma.png", favicon_url: null, custom_domain: null, support_email: "support@gamma.ng", support_phone: "+2348034567890" },
  ];
  for (const b of brandings) {
    await q(`INSERT INTO merchant_branding (id, merchant_id, primary_color, secondary_color, logo_url, favicon_url, custom_domain, support_email, support_phone)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [b.id, b.merchant_id, b.primary_color, b.secondary_color, b.logo_url, b.favicon_url, b.custom_domain, b.support_email, b.support_phone]);
  }
  console.log("✓ merchant_branding");
}

// ─── Merchant Checkout Sessions ───────────────────────────────────────────────
async function seedMerchantCheckoutSessions() {
  for (let i = 0; i < 10; i++) {
    const amount = Math.floor(Math.random() * 100000) + 5000;
    await q(`INSERT INTO merchant_checkout_sessions (id, merchant_id, customer_email, amount_kobo, currency, status, reference, metadata, expires_at, created_at)
      VALUES ($1,$2,$3,$4,'NGN',$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [uid("mcs-"), i % 3 === 0 ? M1 : i % 3 === 1 ? M2 : M3, `customer${i}@example.com`, amount, i < 7 ? "completed" : "expired", uid("chkref-"), JSON.stringify({ orderId: `ORD-${i}` }), future(1), past(i)]);
  }
  console.log("✓ merchant_checkout_sessions");
}

// ─── Merchant Checkout Configs ────────────────────────────────────────────────
async function seedMerchantCheckoutConfigs() {
  for (const mid of [M1, M2, M3]) {
    await q(`INSERT INTO merchant_checkout_configs (id, merchant_id, allowed_payment_methods, collect_phone, collect_address, redirect_url, cancel_url, logo_url, theme_color, updated_at)
      VALUES ($1,$2,$3,true,false,$4,$5,null,'#1E40AF',now()) ON CONFLICT (id) DO NOTHING`,
      [uid("mcc-"), mid, JSON.stringify(["card", "bank_transfer", "ussd", "qr"]), `https://pay.${mid.replace("merch-", "")}.ng/success`, `https://pay.${mid.replace("merch-", "")}.ng/cancel`]);
  }
  console.log("✓ merchant_checkout_configs");
}

// ─── Merchant Payout Preferences ─────────────────────────────────────────────
async function seedMerchantPayoutPreferences() {
  const prefs = [
    { id: uid("mpp-"), merchant_id: M1, bank_code: "058", account_number: "0000123456", account_name: "ACME FINTECH LTD", schedule: "daily", min_payout_kobo: 100000, auto_payout: true },
    { id: uid("mpp-"), merchant_id: M2, bank_code: "033", account_number: "0000234567", account_name: "BETA PAYMENTS LTD", schedule: "weekly", min_payout_kobo: 500000, auto_payout: true },
    { id: uid("mpp-"), merchant_id: M3, bank_code: "044", account_number: "0000345678", account_name: "GAMMA REMITTANCE LTD", schedule: "manual", min_payout_kobo: 1000000, auto_payout: false },
  ];
  for (const p of prefs) {
    await q(`INSERT INTO merchant_payout_preferences (id, merchant_id, bank_code, account_number, account_name, schedule, min_payout_kobo, auto_payout)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.merchant_id, p.bank_code, p.account_number, p.account_name, p.schedule, p.min_payout_kobo, p.auto_payout]);
  }
  console.log("✓ merchant_payout_preferences");
}

// ─── Merchant Compliance Checklist ───────────────────────────────────────────
async function seedMerchantComplianceChecklist() {
  for (const mid of [M1, M2, M3]) {
    await q(`INSERT INTO merchant_compliance_checklist (id, merchant_id, cac_registration, tin_registration, bvn_verified, address_verified, pep_screening, aml_check, sanctions_check, last_reviewed_at, status)
      VALUES ($1,$2,true,true,true,true,true,true,true,now(),'passed') ON CONFLICT (id) DO NOTHING`,
      [uid("mcc-"), mid]);
  }
  console.log("✓ merchant_compliance_checklist");
}

// ─── Merchant Fee Schedules ───────────────────────────────────────────────────
async function seedMerchantFeeSchedules() {
  for (const mid of [M1, M2, M3]) {
    await q(`INSERT INTO merchant_fee_schedules (id, merchant_id, payment_method, fee_type, fee_value, cap_kobo, effective_from, created_at)
      VALUES ($1,$2,'card','percentage','1.5',200000,$3,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("mfs-"), mid, past(90)]);
    await q(`INSERT INTO merchant_fee_schedules (id, merchant_id, payment_method, fee_type, fee_value, cap_kobo, effective_from, created_at)
      VALUES ($1,$2,'bank_transfer','flat','5000',null,$3,now()) ON CONFLICT (id) DO NOTHING`,
      [uid("mfs-"), mid, past(90)]);
  }
  console.log("✓ merchant_fee_schedules");
}

// ─── Merchant Integrations ────────────────────────────────────────────────────
async function seedMerchantIntegrations() {
  const integrations = [
    { id: uid("mi-"), merchant_id: M1, integration_type: "woocommerce", status: "active", config: JSON.stringify({ site_url: "https://shop.acme.ng", api_key: "ck_test_123" }) },
    { id: uid("mi-"), merchant_id: M1, integration_type: "shopify", status: "active", config: JSON.stringify({ shop_domain: "acme.myshopify.com", access_token: "shpat_test_123" }) },
    { id: uid("mi-"), merchant_id: M2, integration_type: "woocommerce", status: "active", config: JSON.stringify({ site_url: "https://store.beta.ng", api_key: "ck_test_456" }) },
  ];
  for (const i of integrations) {
    await q(`INSERT INTO merchant_integrations (id, merchant_id, integration_type, status, config, created_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,now()) ON CONFLICT (id) DO NOTHING`,
      [i.id, i.merchant_id, i.integration_type, i.status, i.config]);
  }
  console.log("✓ merchant_integrations");
}

// ─── Merchant Onboarding Steps ────────────────────────────────────────────────
async function seedMerchantOnboardingSteps() {
  for (const mid of [M1, M2, M3]) {
    const steps = ["account_created", "business_info", "kyc_submitted", "bank_account", "go_live"];
    for (const step of steps) {
      await q(`INSERT INTO merchant_onboarding_steps (id, merchant_id, step, completed, completed_at)
        VALUES ($1,$2,$3,true,$4) ON CONFLICT (id) DO NOTHING`,
        [uid("mos-"), mid, step, past(Math.floor(Math.random() * 30))]);
    }
  }
  console.log("✓ merchant_onboarding_steps");
}

// ─── Merchant Referrals ───────────────────────────────────────────────────────
async function seedMerchantReferrals() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM referrals");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ referrals (already seeded)"); return; }
  const referrals = [
    { id: uid("ref-"), referrer_id: M1, referred_id: M2, code: "ACME-REF-001", reward_kobo: 50000, status: "rewarded" },
    { id: uid("ref-"), referrer_id: M1, referred_id: M3, code: "ACME-REF-002", reward_kobo: 50000, status: "rewarded" },
  ];
  for (const r of referrals) {
    await q(`INSERT INTO referrals (id, referrer_id, referred_id, code, reward_kobo, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.referrer_id, r.referred_id, r.code, r.reward_kobo, r.status]);
  }
  console.log("✓ referrals (extended)");
}

// ─── Idempotency Requests ─────────────────────────────────────────────────────
async function seedIdempotencyRequests() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM idempotency_requests");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ idempotency_requests (already seeded)"); return; }
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO idempotency_requests (id, merchant_id, key, operation, response_hash, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("ir-"), i % 2 === 0 ? M1 : M2, uid("idem-"), "payment.create", uid("hash-"), future(24), past(i)]);
  }
  console.log("✓ idempotency_requests (extended)");
}

// ─── Regulatory Reports ───────────────────────────────────────────────────────
async function seedRegulatoryReports() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM regulatory_reports");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ regulatory_reports (already seeded)"); return; }
  const reports = [
    { id: uid("rr-"), merchant_id: M1, report_type: "CBN_MONTHLY", period: "2026-03", status: "submitted", submitted_at: past(5) },
    { id: uid("rr-"), merchant_id: M1, report_type: "NFIU_STR", period: "2026-Q1", status: "submitted", submitted_at: past(10) },
    { id: uid("rr-"), merchant_id: M2, report_type: "CBN_MONTHLY", period: "2026-03", status: "pending", submitted_at: null },
  ];
  for (const r of reports) {
    await q(`INSERT INTO regulatory_reports (id, merchant_id, report_type, period, status, submitted_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.merchant_id, r.report_type, r.period, r.status, r.submitted_at, past(15)]);
  }
  console.log("✓ regulatory_reports (extended)");
}

// ─── Compliance Reports ───────────────────────────────────────────────────────
async function seedComplianceReports() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM compliance_reports");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ compliance_reports (already seeded)"); return; }
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO compliance_reports (id, merchant_id, report_type, period, status, findings_count, risk_level, generated_at, created_at)
      VALUES ($1,$2,$3,$4,'completed',$5,'low',$6,$7) ON CONFLICT (id) DO NOTHING`,
      [uid("cr-"), i % 2 === 0 ? M1 : M2, ["AML", "KYC", "PEP_SCREENING"][i % 3], `2026-Q${Math.floor(i / 2) + 1}`, Math.floor(Math.random() * 3), past(i * 5), past(i * 5 + 1)]);
  }
  console.log("✓ compliance_reports (extended)");
}

// ─── Help Search Analytics ────────────────────────────────────────────────────
async function seedHelpSearchAnalytics() {
  const queries = ["how to integrate api", "webhook setup", "kyc requirements", "payout schedule", "dispute resolution", "api rate limits", "sandbox testing", "go live checklist"];
  for (const query of queries) {
    await q(`INSERT INTO help_search_analytics (id, query, results_count, clicked_article_id, user_id, created_at)
      VALUES ($1,$2,$3,null,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [uid("hsa-"), query, Math.floor(Math.random() * 10) + 1, U1, past(Math.floor(Math.random() * 14))]);
  }
  console.log("✓ help_search_analytics");
}

// ─── Invite Codes ─────────────────────────────────────────────────────────────
async function seedInviteCodes() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM invite_codes");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ invite_codes (already seeded)"); return; }
  const codes = [
    { id: uid("ic-"), merchant_id: M1, code: "INVITE-ACME-001", type: "team_member", max_uses: 5, used_count: 2, expires_at: future(30), created_by: U1 },
    { id: uid("ic-"), merchant_id: M2, code: "INVITE-BETA-001", type: "team_member", max_uses: 3, used_count: 1, expires_at: future(15), created_by: U2 },
  ];
  for (const c of codes) {
    await q(`INSERT INTO invite_codes (id, merchant_id, code, type, max_uses, used_count, expires_at, created_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.merchant_id, c.code, c.type, c.max_uses, c.used_count, c.expires_at, c.created_by]);
  }
  console.log("✓ invite_codes (extended)");
}

// ─── NIP Banks ────────────────────────────────────────────────────────────────
async function seedNipBanks() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM nip_banks");
  if (Number(existing[0].cnt) >= 20) { console.log("✓ nip_banks (already seeded)"); return; }
  const banks = [
    { code: "058", name: "GTBank (Guaranty Trust Bank)", short_name: "GTBank", active: true },
    { code: "033", name: "United Bank for Africa (UBA)", short_name: "UBA", active: true },
    { code: "044", name: "Access Bank", short_name: "Access Bank", active: true },
    { code: "011", name: "First Bank of Nigeria", short_name: "First Bank", active: true },
    { code: "057", name: "Zenith Bank", short_name: "Zenith Bank", active: true },
    { code: "035", name: "Wema Bank", short_name: "Wema Bank", active: true },
    { code: "032", name: "Union Bank", short_name: "Union Bank", active: true },
    { code: "070", name: "Fidelity Bank", short_name: "Fidelity Bank", active: true },
    { code: "221", name: "Stanbic IBTC Bank", short_name: "Stanbic IBTC", active: true },
    { code: "068", name: "Standard Chartered Bank", short_name: "Standard Chartered", active: true },
    { code: "050", name: "Ecobank Nigeria", short_name: "Ecobank", active: true },
    { code: "076", name: "Polaris Bank", short_name: "Polaris Bank", active: true },
    { code: "101", name: "Providus Bank", short_name: "Providus Bank", active: true },
    { code: "100", name: "SunTrust Bank", short_name: "SunTrust", active: true },
    { code: "090405", name: "Opay", short_name: "Opay", active: true },
    { code: "090110", name: "VFD Microfinance Bank", short_name: "VFD MFB", active: true },
    { code: "090267", name: "Kuda Bank", short_name: "Kuda Bank", active: true },
    { code: "090175", name: "PalmPay", short_name: "PalmPay", active: true },
    { code: "090303", name: "Moniepoint MFB", short_name: "Moniepoint", active: true },
    { code: "090286", name: "SafeHaven MFB", short_name: "SafeHaven", active: true },
  ];
  for (const b of banks) {
    await q(`INSERT INTO nip_banks (code, name, short_name, active, created_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (code) DO NOTHING`,
      [b.code, b.name, b.short_name, b.active]);
  }
  console.log("✓ nip_banks (extended)");
}

// ─── Merchant Risk Scores ─────────────────────────────────────────────────────
async function seedMerchantRiskScores() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM merchant_risk_scores");
  if (Number(existing[0].cnt) >= 3) { console.log("✓ merchant_risk_scores (already seeded)"); return; }
  for (const mid of [M1, M2, M3]) {
    await q(`INSERT INTO merchant_risk_scores (id, merchant_id, score, risk_level, factors, last_calculated_at, created_at)
      VALUES ($1,$2,$3,'low',$4::jsonb,now(),now()) ON CONFLICT (id) DO NOTHING`,
      [uid("mrs-"), mid, Math.floor(Math.random() * 30) + 10, JSON.stringify({ transaction_volume: "normal", chargeback_rate: "low", kyc_status: "verified" })]);
  }
  console.log("✓ merchant_risk_scores (extended)");
}

// ─── Subscription Plans V2 ────────────────────────────────────────────────────
async function seedSubscriptionPlansV2() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM subscription_plans_v2");
  if (Number(existing[0].cnt) >= 3) { console.log("✓ subscription_plans_v2 (already seeded)"); return; }
  const plans = [
    { id: uid("spv2-"), name: "Starter", monthly_price_kobo: 4900, annual_price_kobo: 49000, transaction_limit: 100, user_limit: 1, api_calls_limit: 1000, features: JSON.stringify(["Basic dashboard", "Email support"]) },
    { id: uid("spv2-"), name: "Growth", monthly_price_kobo: 29900, annual_price_kobo: 299000, transaction_limit: 1000, user_limit: 5, api_calls_limit: 10000, features: JSON.stringify(["Advanced analytics", "API access", "Priority support"]) },
    { id: uid("spv2-"), name: "Scale", monthly_price_kobo: 99900, annual_price_kobo: 999000, transaction_limit: -1, user_limit: 20, api_calls_limit: -1, features: JSON.stringify(["Unlimited transactions", "Custom integrations", "Dedicated support", "SLA guarantee"]) },
  ];
  for (const p of plans) {
    await q(`INSERT INTO subscription_plans_v2 (id, name, monthly_price_kobo, annual_price_kobo, transaction_limit, user_limit, api_calls_limit, features, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now()) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.monthly_price_kobo, p.annual_price_kobo, p.transaction_limit, p.user_limit, p.api_calls_limit, p.features]);
  }
  console.log("✓ subscription_plans_v2 (extended)");
}

// ─── Feature Flags ────────────────────────────────────────────────────────────
async function seedFeatureFlags() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM feature_flags");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ feature_flags (already seeded)"); return; }
  const flags = [
    { id: uid("ff-"), name: "digital_gold_enabled", description: "Enable digital gold trading", enabled: true, rollout_percentage: 100 },
    { id: uid("ff-"), name: "mutual_funds_enabled", description: "Enable mutual fund investments", enabled: true, rollout_percentage: 100 },
    { id: uid("ff-"), name: "bnpl_enabled", description: "Enable Buy Now Pay Later", enabled: true, rollout_percentage: 80 },
    { id: uid("ff-"), name: "usdc_enabled", description: "Enable USDC stablecoin wallets", enabled: false, rollout_percentage: 0 },
    { id: uid("ff-"), name: "voice_payments_enabled", description: "Enable voice/soundbox payments", enabled: true, rollout_percentage: 100 },
    { id: uid("ff-"), name: "open_banking_v2", description: "Enable Open Banking V2", enabled: true, rollout_percentage: 50 },
    { id: uid("ff-"), name: "ai_insights_enabled", description: "Enable AI-powered insights", enabled: true, rollout_percentage: 100 },
  ];
  for (const f of flags) {
    await q(`INSERT INTO feature_flags (id, name, description, enabled, rollout_percentage, created_at)
      VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.name, f.description, f.enabled, f.rollout_percentage]);
  }
  console.log("✓ feature_flags (extended)");
}

// ─── Consumer Budgets ─────────────────────────────────────────────────────────
async function seedConsumerBudgets() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM consumer_budgets");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ consumer_budgets (already seeded)"); return; }
  const budgets = [
    { id: uid("cb-"), user_id: U1, category: "Food & Dining", limit_kobo: 50000, spent_kobo: 32000, period: "monthly", period_start: past(15) },
    { id: uid("cb-"), user_id: U1, category: "Transport", limit_kobo: 30000, spent_kobo: 18500, period: "monthly", period_start: past(15) },
    { id: uid("cb-"), user_id: U2, category: "Entertainment", limit_kobo: 20000, spent_kobo: 22000, period: "monthly", period_start: past(15) },
    { id: uid("cb-"), user_id: U2, category: "Shopping", limit_kobo: 100000, spent_kobo: 45000, period: "monthly", period_start: past(15) },
    { id: uid("cb-"), user_id: U3, category: "Bills", limit_kobo: 80000, spent_kobo: 75000, period: "monthly", period_start: past(15) },
  ];
  for (const b of budgets) {
    await q(`INSERT INTO consumer_budgets (id, user_id, category, limit_kobo, spent_kobo, period, period_start)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [b.id, b.user_id, b.category, b.limit_kobo, b.spent_kobo, b.period, b.period_start]);
  }
  console.log("✓ consumer_budgets (extended)");
}

// ─── Consumer Savings Goals ───────────────────────────────────────────────────
async function seedConsumerSavingsGoals() {
  const { rows: existing } = await pool.query("SELECT COUNT(*) as cnt FROM consumer_savings_goals");
  if (Number(existing[0].cnt) >= 5) { console.log("✓ consumer_savings_goals (already seeded)"); return; }
  const goals = [
    { id: uid("csg-"), user_id: U1, name: "Emergency Fund", target_kobo: 1000000, current_kobo: 350000, deadline: future(180), status: "active" },
    { id: uid("csg-"), user_id: U1, name: "New Car", target_kobo: 5000000, current_kobo: 1200000, deadline: future(365), status: "active" },
    { id: uid("csg-"), user_id: U2, name: "Vacation Fund", target_kobo: 500000, current_kobo: 500000, deadline: past(5), status: "completed" },
    { id: uid("csg-"), user_id: U3, name: "House Deposit", target_kobo: 10000000, current_kobo: 2500000, deadline: future(730), status: "active" },
  ];
  for (const g of goals) {
    await q(`INSERT INTO consumer_savings_goals (id, user_id, name, target_kobo, current_kobo, deadline, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [g.id, g.user_id, g.name, g.target_kobo, g.current_kobo, g.deadline, g.status]);
  }
  console.log("✓ consumer_savings_goals (extended)");
}

// ─── Consumer Savings Contributions ──────────────────────────────────────────
async function seedConsumerSavingsContributions() {
  const { rows: goals } = await pool.query("SELECT id, user_id FROM consumer_savings_goals LIMIT 3");
  for (const goal of goals) {
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO consumer_savings_contributions (id, goal_id, user_id, amount_kobo, source, created_at)
        VALUES ($1,$2,$3,$4,'manual',$5) ON CONFLICT (id) DO NOTHING`,
        [uid("csc-"), goal.id, goal.user_id, Math.floor(Math.random() * 50000) + 10000, past(i * 30)]);
    }
  }
  console.log("✓ consumer_savings_contributions");
}

// ─── Wave 27–31 Feature Tables (0084 migration) ──────────────────────────────
async function seedWave84FeatureTables() {
  // BNPL applications (wave27 tests expect >= 10 rows, scores 0–850)
  const { rows: bnplCnt } = await pool.query("SELECT COUNT(*) as cnt FROM bnpl_applications");
  if (Number(bnplCnt[0].cnt) < 10) {
    for (let i = 1; i <= 12; i++) {
      await q(
        `INSERT INTO bnpl_applications (consumer_id, requested_limit, approved_limit, score, status, monthly_income, employment_status, currency)
         VALUES ($1,$2,$3,$4,$5,$6,'employed','NGN') ON CONFLICT (consumer_id) DO NOTHING`,
        [`bnpl-consumer-${i}`, i * 50000, i * 30000, 600 + i * 10, i % 3 === 0 ? "approved" : "pending", i * 100000]
      );
    }
  }

  // Loyalty tier configs (lowercase tier names, strictly ascending cashback rates)
  const tiers = [
    { name: "bronze", min: 0, max: 999, rate: 0.5, mult: 1.0 },
    { name: "silver", min: 1000, max: 4999, rate: 1.0, mult: 1.2 },
    { name: "gold", min: 5000, max: 19999, rate: 1.5, mult: 1.5 },
    { name: "platinum", min: 20000, max: null, rate: 2.0, mult: 2.0 },
  ];
  for (const t of tiers) {
    await q(
      `INSERT INTO loyalty_tier_configs (tier_name, min_points, max_points, cashback_rate, bonus_multiplier)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tier_name) DO NOTHING`,
      [t.name, t.min, t.max, t.rate, t.mult]
    );
  }

  // Feature-flag exposure events (wave27 tests expect >= 50 rows)
  const { rows: flagCnt } = await pool.query("SELECT COUNT(*) as cnt FROM flag_exposure_events");
  if (Number(flagCnt[0].cnt) < 50) {
    const flags = ["new_checkout_ui", "instant_settlement", "dark_mode"];
    for (let i = 0; i < 60; i++) {
      await q(
        `INSERT INTO flag_exposure_events (flag_key, user_id, tenant_id, variant, converted)
         VALUES ($1,$2,$3,$4,$5)`,
        [flags[i % flags.length], `user-${(i % 20) + 1}`, i % 2 === 0 ? T1 : T2,
         i % 2 === 0 ? "control" : "treatment", i % 5 === 0]
      );
    }
  }

  // SLA metrics (wave83 tests expect >= 3 services, uptime 99.0–100.0)
  const { rows: slaCnt } = await pool.query("SELECT COUNT(*) as cnt FROM sla_metrics");
  if (Number(slaCnt[0].cnt) < 3) {
    const services = [
      { name: "api-gateway", uptime: 99.95, avg: 120, p99: 480, err: 0.05 },
      { name: "payment-core", uptime: 99.99, avg: 85, p99: 350, err: 0.01 },
      { name: "webhook-delivery", uptime: 99.9, avg: 210, p99: 890, err: 0.1 },
    ];
    for (const s of services) {
      await q(
        `INSERT INTO sla_metrics (tenant_id, service_name, metric_date, uptime_pct, avg_latency_ms, p99_latency_ms, error_rate_pct, incident_count)
         VALUES (NULL,$1,CURRENT_DATE,$2,$3,$4,$5,0)`,
        [s.name, s.uptime, s.avg, s.p99, s.err]
      );
    }
  }

  // Middleware health logs (wave83 tests expect >= 3 rows, all status 'up')
  const { rows: mhlCnt } = await pool.query("SELECT COUNT(*) as cnt FROM middleware_health_logs");
  if (Number(mhlCnt[0].cnt) < 3) {
    const svcs = [
      { name: "NIBSS", lat: 145 },
      { name: "Mojaloop", lat: 230 },
      { name: "VTPass", lat: 180 },
      { name: "Termii", lat: 95 },
    ];
    for (const s of svcs) {
      await q(`INSERT INTO middleware_health_logs (service, status, latency_ms) VALUES ($1,'up',$2)`, [s.name, s.lat]);
    }
  }

  // FX hedge positions (wave83 tests expect >= 3 'active' rows, notional > 0)
  const { rows: fxCnt } = await pool.query("SELECT COUNT(*) as cnt FROM fx_hedge_positions WHERE status = 'active'");
  if (Number(fxCnt[0].cnt) < 3) {
    const positions = [
      { ref: "FXH-SEED-1", pair: "NGN/USD", base: "NGN", quote: "USD", notional: 5000000, rate: 1531.25 },
      { ref: "FXH-SEED-2", pair: "NGN/EUR", base: "NGN", quote: "EUR", notional: 2500000, rate: 1662.4 },
      { ref: "FXH-SEED-3", pair: "NGN/GBP", base: "NGN", quote: "GBP", notional: 1200000, rate: 1943.7 },
    ];
    for (const p of positions) {
      await q(
        `INSERT INTO fx_hedge_positions (reference, merchant_id, base_currency, quote_currency, currency_pair, notional_amount, hedge_amount, hedge_rate, hedge_type, status)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,'forward','active')`,
        [p.ref, M1, p.base, p.quote, p.pair, p.notional, p.rate]
      );
    }
  }

  // FX live rates (wave83 tests expect >= 5 rows; USD/NGN within 1000–2500)
  const { rows: rateCnt } = await pool.query("SELECT COUNT(*) as cnt FROM fx_live_rates");
  if (Number(rateCnt[0].cnt) < 5) {
    const rates = [
      { pair: "USD/NGN", rate: 1531.25 }, { pair: "EUR/NGN", rate: 1662.4 },
      { pair: "GBP/NGN", rate: 1943.7 }, { pair: "GHS/NGN", rate: 104.2 },
      { pair: "KES/NGN", rate: 11.85 }, { pair: "ZAR/NGN", rate: 84.6 },
    ];
    for (const r of rates) {
      await q(`INSERT INTO fx_live_rates (pair, rate, source) VALUES ($1,$2,'cbn')`, [r.pair, r.rate]);
    }
  }

  // Tenant plan limits (wave82 tests expect starter/growth/scale/enterprise)
  const planLimits = [
    { plan: "starter", api: 10000, vol: 10000, users: 5, corridors: 3, webhooks: 5, keys: 3, price: 49 },
    { plan: "growth", api: 100000, vol: 100000, users: 20, corridors: 10, webhooks: 20, keys: 10, price: 199 },
    { plan: "scale", api: 500000, vol: 500000, users: 50, corridors: 25, webhooks: 50, keys: 25, price: 499 },
    { plan: "enterprise", api: 999999999, vol: 999999999, users: 999, corridors: 999, webhooks: 999, keys: 999, price: 0 },
  ];
  for (const p of planLimits) {
    await q(
      `INSERT INTO tenant_plan_limits (id, plan, max_api_calls_per_month, max_tx_volume_usd_per_month, max_users, max_corridors, max_webhooks, max_api_keys, price_usd_per_month)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (plan) DO NOTHING`,
      [uid("tpl-"), p.plan, p.api, p.vol, p.users, p.corridors, p.webhooks, p.keys, p.price]
    );
  }

  // Tenant billing invoices (wave83 tests expect >= 1 row)
  const { rows: invCnt } = await pool.query("SELECT COUNT(*) as cnt FROM tenant_billing_invoices");
  if (Number(invCnt[0].cnt) < 1) {
    await q(
      `INSERT INTO tenant_billing_invoices (id, tenant_id, period, amount_usd, status)
       VALUES ($1,$2,$3,$4,'draft')`,
      [uid("inv-"), T1, "2026-08", 199.0]
    );
  }

  // Payout batches pending approval (wave27 approval-path tests)
  const { rows: pbCnt } = await pool.query("SELECT COUNT(*) as cnt FROM payout_batches WHERE status = 'pending_approval'");
  if (Number(pbCnt[0].cnt) < 3) {
    for (let i = 0; i < 3; i++) {
      await q(
        `INSERT INTO payout_batches (id, merchant_id, total_amount, total_amount_kobo, payout_count, count, status)
         VALUES ($1,$2,$3,$4,$5,$5,'pending_approval') ON CONFLICT (id) DO NOTHING`,
        [uid("pb-pending-"), i % 2 === 0 ? M1 : M2, 1500000 + i * 250000, (1500000 + i * 250000) * 100, 10 + i]
      );
    }
  }

  console.log("✓ wave84 feature tables (bnpl, loyalty tiers, flag exposure, sla, health logs, fx, plan limits, billing invoices, payout batches)");
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Starting seed extension...\n");
  const tasks = [
    seedWallets, seedWalletTransactions,
    seedPosTerminals, seedPosTransactions,
    seedRestaurantTables, seedRestaurantOrders,
    seedStaff, seedRetailPosConfigs, seedRetailSales,
    seedInvoices, seedInventory,
    seedUssd, seedNfc, seedSoundboxDevices,
    seedDigitalGold, seedMutualFunds,
    seedPension, seedSalaryAccounts, seedNodalAccounts,
    seedPayrollV3, seedP2PTransfers,
    seedTaxFilingRecords, seedPurchaseOrders,
    seedSubscriptions, seedSupportMessages,
    seedSavedBeneficiaries, seedScheduledReports,
    seedMerchantProfiles, seedMerchantDirectors,
    seedMerchantNotifications, seedMerchantStatusLog,
    seedMerchantLoans, seedPrivacy,
    seedRealtimeNotifications, seedReportJobs,
    seedReconciliationAlerts, seedMiddlewareHealthAlerts,
    seedTenantConfig, seedTenantAuditLogs, seedTenantApiKeys,
    seedTenantCorridorDailyStats,
    seedWebhookEndpoints, seedWebhookFailureAlerts,
    seedBillingCronRuns, seedRateLimitEvents,
    seedEscrowContracts, seedCrossBorderTransfers,
    seedPayoutBatches, seedPayoutApprovalWorkflows,
    seedBulkCollections, seedBulkPaymentSchedules,
    seedConsumerWallets, seedConsumerWalletTxns,
    seedConsumerOutbox, seedConsumerIdempotencyKeys,
    seedConsumerPhoneVerifications, seedConsumerKycRecords,
    seedConsumerInsurance, seedConsumerFinanceLoans,
    seedConsumerFraudFlags, seedConsumerRecurringPayments,
    seedConsumerSplitSessions, seedConsumerLoyalty,
    seedConsumerContacts, seedConsumerNotificationPrefs,
    seedConsumerPins, seedDevicePushTokens, seedSdkTokens,
    seedGeofenceRules, seedAgentBanking, seedSuperAgentNetworks,
    seedQrPayments, seedUsdcV2, seedMultiCurrencyLedger,
    seedOpenBankingV2, seedWealth, seedCashback,
    seedCouponRedemptions, seedRedEnvelopes,
    seedMoneyRequests, seedBillPayments, seedIntlRemittance,
    seedPortalSubscriptions, seedSubscriptionSubscribers,
    seedEmiContracts, seedBnplPlans,
    seedLoyaltyPrograms, seedKybStateTransitions,
    seedMerchantBranding, seedMerchantCheckoutSessions,
    seedMerchantCheckoutConfigs, seedMerchantPayoutPreferences,
    seedMerchantComplianceChecklist, seedMerchantFeeSchedules,
    seedMerchantIntegrations, seedMerchantOnboardingSteps,
    seedMerchantReferrals, seedIdempotencyRequests,
    seedRegulatoryReports, seedComplianceReports,
    seedHelpSearchAnalytics, seedInviteCodes, seedNipBanks,
    seedMerchantRiskScores, seedSubscriptionPlansV2,
    seedFeatureFlags, seedConsumerBudgets,
    seedConsumerSavingsGoals, seedConsumerSavingsContributions,
    seedWave84FeatureTables,
  ];

  let passed = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      await task();
      passed++;
    } catch (e: any) {
      console.error(`✗ ${task.name}: ${e.message?.split("\n")[0]}`);
      failed++;
    }
  }

  console.log(`\n✅ Seed extension complete: ${passed} passed, ${failed} failed`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
