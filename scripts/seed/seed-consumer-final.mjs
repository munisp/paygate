#!/usr/bin/env node
/**
 * seed-consumer-final.mjs
 * Seeds the 11 remaining empty consumer tables
 */
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
  connectionString: process.env.PG_DATABASE_URL || 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev',
  ssl: false,
});

const q = (sql, params) => pool.query(sql, params);
const uid = () => crypto.randomUUID();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const kobo = (n) => n * 100;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);
const acct = () => `${rand(1000000000, 9999999999)}`;
const bankCodes = ['058','011','033','044','050','070','076','221','232'];
const bankNames = ['GTBank','First Bank','UBA','Access Bank','EcoBank','Fidelity','Polaris','Stanbic','Sterling'];

async function main() {
  console.log('🌱 Seeding 11 remaining consumer tables...\n');

  // Get reference data
  const usersRes = await q("SELECT id FROM users LIMIT 10");
  const userIds = usersRes.rows.map(r => r.id);
  const walletsRes = await q("SELECT id FROM consumer_wallets LIMIT 5");
  const walletIds = walletsRes.rows.map(r => r.id);
  const menuItemsRes = await q("SELECT id FROM menu_items LIMIT 10");
  const menuItemIds = menuItemsRes.rows.map(r => r.id);
  const merchantsRes = await q("SELECT id FROM merchants LIMIT 5");
  const merchantIds = merchantsRes.rows.map(r => r.id);
  const ordersRes = await q("SELECT id FROM restaurant_orders LIMIT 5");
  const orderIds = ordersRes.rows.map(r => r.id);

  const results = [];

  // 1. money_requests
  try {
    let count = 0;
    for (const uid_ of userIds) {
      await q(`INSERT INTO money_requests (id, requester_id, amount_kobo, currency, note, status, payer_user_id, payer_name, paid_at, expires_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [uid(), uid_, kobo(rand(500,50000)), 'NGN', pick(['For lunch','Rent split','Shared taxi']), pick(['pending','paid','expired']), pick(userIds), 'Emeka Obi', null, daysFromNow(rand(1,7)), daysAgo(rand(1,30))]);
      count++;
    }
    results.push(`✅ money_requests: ${count} rows`);
  } catch(e) { results.push(`❌ money_requests: ${e.message}`); }

  // 2. p2p_transfers
  try {
    let count = 0;
    for (const uid_ of userIds) {
      for (let i = 0; i < 3; i++) {
        await q(`INSERT INTO p2p_transfers (id, sender_id, sender_wallet_id, recipient_account_number, recipient_bank_code, recipient_bank_name, recipient_name, amount_kobo, currency, narration, nip_session_id, nip_ref, status, failure_reason, completed_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING`,
          [uid(), uid_, pick(walletIds), acct(), pick(bankCodes), pick(bankNames), 'Recipient Name', kobo(rand(500,100000)), 'NGN', pick(['Transfer','Payment','Loan repayment']), uid(), uid(), pick(['completed','pending','failed']), null, daysAgo(rand(0,5)), daysAgo(rand(1,30)), new Date()]);
        count++;
      }
    }
    results.push(`✅ p2p_transfers: ${count} rows`);
  } catch(e) { results.push(`❌ p2p_transfers: ${e.message}`); }

  // 3. privacy_aliases
  try {
    let count = 0;
    for (const mid of merchantIds) {
      await q(`INSERT INTO privacy_aliases (id, merchant_id, alias, expires_at, status, usage_count, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [uid(), mid, `alias-${Math.random().toString(36).slice(2,10)}`, daysFromNow(rand(30,365)), 'active', rand(0,50), daysAgo(rand(1,90))]);
      count++;
    }
    results.push(`✅ privacy_aliases: ${count} rows`);
  } catch(e) { results.push(`❌ privacy_aliases: ${e.message}`); }

  // 4. privacy_settings
  try {
    let count = 0;
    for (const mid of merchantIds) {
      await q(`INSERT INTO privacy_settings (id, merchant_id, privacy_mode, hide_business_name, hide_bank_details, use_private_alias, private_alias, updated_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [uid(), mid, pick(['public','private','alias_only']), 0, 0, 1, `pg-${Math.random().toString(36).slice(2,8)}`, new Date(), daysAgo(rand(1,90))]);
      count++;
    }
    results.push(`✅ privacy_settings: ${count} rows`);
  } catch(e) { results.push(`❌ privacy_settings: ${e.message}`); }

  // 5. realtime_notification_preferences
  try {
    let count = 0;
    for (const mid of merchantIds) {
      await q(`INSERT INTO realtime_notification_preferences (id, merchant_id, webhook_enabled, email_enabled, sms_enabled, push_enabled, in_app_enabled, event_payment, event_dispute, event_payout, event_fraud, event_kyc, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
        [uid(), mid, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, daysAgo(rand(1,90)), new Date()]);
      count++;
    }
    results.push(`✅ realtime_notification_preferences: ${count} rows`);
  } catch(e) { results.push(`❌ realtime_notification_preferences: ${e.message}`); }

  // 6. recipe_ingredients
  try {
    let count = 0;
    for (const itemId of menuItemIds) {
      for (let i = 0; i < 3; i++) {
        await q(`INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, quantity_per_serving)
          VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [itemId, uid(), rand(1,5)]);
        count++;
      }
    }
    results.push(`✅ recipe_ingredients: ${count} rows`);
  } catch(e) { results.push(`❌ recipe_ingredients: ${e.message}`); }

  // 7. red_envelopes + red_envelope_claims
  try {
    let envCount = 0, claimCount = 0;
    for (const uid_ of userIds) {
      const envId = uid();
      await q(`INSERT INTO red_envelopes (id, sender_id, sender_wallet_id, total_amount_kobo, currency, slots, claimed_slots, message, status, expires_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [envId, uid_, pick(walletIds), kobo(rand(5000,100000)), 'NGN', rand(5,20), rand(0,5), pick(['Happy New Year!','Congrats!','Eid Mubarak!']), pick(['active','expired','exhausted']), daysFromNow(rand(1,7)), daysAgo(rand(1,30)), new Date()]);
      envCount++;
      // Claims
      for (let i = 0; i < 2; i++) {
        await q(`INSERT INTO red_envelope_claims (id, envelope_id, claimant_id, claimant_wallet_id, amount_kobo, claimed_at)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [uid(), envId, pick(userIds), pick(walletIds), kobo(rand(100,5000)), daysAgo(rand(0,5))]);
        claimCount++;
      }
    }
    results.push(`✅ red_envelopes: ${envCount} rows, red_envelope_claims: ${claimCount} rows`);
  } catch(e) { results.push(`❌ red_envelopes: ${e.message}`); }

  // 8. saved_beneficiaries
  try {
    let count = 0;
    for (const uid_ of userIds) {
      for (let i = 0; i < 3; i++) {
        await q(`INSERT INTO saved_beneficiaries (id, user_id, account_number, bank_code, bank_name, account_name, nickname, transfer_count, last_used_at, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
          [uid(), uid_, acct(), pick(bankCodes), pick(bankNames), pick(['Emeka Obi','Ngozi Eze','Tunde Bello','Amaka Nwosu']), pick(['Emeka','Ngozi','Tunde',null]), rand(1,20), daysAgo(rand(0,30)), daysAgo(rand(30,180))]);
        count++;
      }
    }
    results.push(`✅ saved_beneficiaries: ${count} rows`);
  } catch(e) { results.push(`❌ saved_beneficiaries: ${e.message}`); }

  // 9. split_bill_sessions + split_bill_shares
  try {
    let sessCount = 0, shareCount = 0;
    for (const orderId of orderIds) {
      const mid = pick(merchantIds);
      const sessId = uid();
      const splitCount = rand(2,5);
      await q(`INSERT INTO split_bill_sessions (id, order_id, merchant_id, total_kobo, split_count, paid_count, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [sessId, orderId, mid, kobo(rand(5000,50000)), splitCount, rand(0,splitCount), pick(['pending','partial','completed']), daysAgo(rand(1,30))]);
      sessCount++;
      for (let i = 0; i < splitCount; i++) {
        await q(`INSERT INTO split_bill_shares (session_id, share_kobo, payment_link_id, paid_at, share_index)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [sessId, kobo(rand(1000,10000)), uid(), rand(0,1) ? daysAgo(rand(0,5)) : null, i]);
        shareCount++;
      }
    }
    results.push(`✅ split_bill_sessions: ${sessCount} rows, split_bill_shares: ${shareCount} rows`);
  } catch(e) { results.push(`❌ split_bill_sessions: ${e.message}`); }

  // Print results
  console.log('\nResults:');
  results.forEach(r => console.log(' ', r));

  // Final count
  const rowsRes = await q(`SELECT SUM(n_live_tup) as total_rows FROM pg_stat_user_tables`);
  console.log(`\n✅ Total rows in DB: ${rowsRes.rows[0].total_rows}`);

  await pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
