#!/usr/bin/env node
/**
 * seed-fix-final.mjs
 * Fixes the 3 remaining seed issues:
 * 1. consumer_wallet_txns — needs real consumer_wallets IDs
 * 2. cross_border_transfers — no tenant_id column (was wrong assumption)
 * 3. coupon_redemptions — needs real coupon IDs from DB
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
const phone = () => `080${rand(10000000, 99999999)}`;
const bankCodes = ['058','011','033','044','050','070','076','221','232','301'];
const bankNames = ['GTBank','First Bank','UBA','Access Bank','EcoBank','Fidelity','Polaris','Stanbic','Sterling','Jaiz'];
const acct = () => `${rand(1000000000, 9999999999)}`;

async function main() {
  console.log('🔧 Fixing 3 remaining seed issues...\n');

  try {
    // 1. Get real consumer_wallets IDs
    const cwRes = await q("SELECT id, user_id FROM consumer_wallets LIMIT 10");
    const cwRows = cwRes.rows;
    console.log(`Found ${cwRows.length} consumer wallets`);

    if (cwRows.length > 0) {
      // Seed consumer_wallet_txns using real wallet IDs
      let txnCount = 0;
      for (const cw of cwRows) {
        for (let i = 0; i < 5; i++) {
          const txnId = `cwt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
          await q(`INSERT INTO consumer_wallet_txns (id, wallet_id, user_id, type, amount_kobo, currency, balance_after_kobo, description, reference, counterparty_name, counterparty_account, status, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
            [txnId, cw.id, cw.user_id, pick(['credit','debit']), kobo(rand(500,50000)), 'NGN', kobo(rand(10000,500000)), pick(['Transfer received','Bill payment','Airtime purchase','Transfer sent']), uid(), pick(['Emeka Obi','Ngozi Eze','Tunde Bello']), acct(), 'completed', daysAgo(rand(1,90))]);
          txnCount++;
        }
      }
      console.log(`✅ consumer_wallet_txns: ${txnCount} rows inserted`);
    }

    // cross_border_transfers — has tenant_id NOT NULL and serial integer id
    const midRes = await q("SELECT id FROM merchants LIMIT 5");
    const mids = midRes.rows.map(r => r.id);
    let cbtCount = 0;
    for (let i = 0; i < 15; i++) {
      const mid = pick(mids);
      await q(`INSERT INTO cross_border_transfers (merchant_id, wallet_id, transfer_id, quote_id, source_currency, target_currency, source_amount, target_amount, exchange_rate, fee, corridor, rail, status, sender_name, sender_account, receiver_name, receiver_account, receiver_fsp_id, error_code, error_description, completed_at, created_at, updated_at, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) ON CONFLICT DO NOTHING`,
        [mid, null, uid(), uid(), 'NGN', pick(['USD','GBP','EUR','GHS','KES']), `${rand(10000,500000)}`, `${rand(100,2000)}`, `${(rand(1400,1600)/1000).toFixed(4)}`, `${rand(100,1000)}`, pick(['NG-US','NG-UK','NG-GH','NG-KE']), pick(['swift','mojaloop','ripple']), pick(['completed','pending','failed']), 'Sender Name', acct(), 'Receiver Name', acct(), 'FSP001', null, null, daysAgo(rand(0,5)), daysAgo(rand(1,30)), new Date(), 'tenant-paygate-demo-001']);
      cbtCount++;
    }
    console.log(`✅ cross_border_transfers: ${cbtCount} rows inserted`);

    // 3. coupon_redemptions — get real coupon IDs from DB
    const couponRes = await q("SELECT id FROM coupons LIMIT 20");
    const couponIds = couponRes.rows.map(r => r.id);
    console.log(`Found ${couponIds.length} coupons`);

    if (couponIds.length > 0) {
      const userRes = await q("SELECT id FROM users LIMIT 5");
      const userIds = userRes.rows.map(r => r.id);
      let redemptionCount = 0;
      for (const couponId of couponIds) {
        for (let i = 0; i < 2; i++) {
          await q(`INSERT INTO coupon_redemptions (id, coupon_id, user_id, amount_saved_kobo, reference_id, created_at)
            VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
            [uid(), couponId, pick(userIds), kobo(rand(100,5000)), uid(), daysAgo(rand(1,30))]);
          redemptionCount++;
        }
      }
      console.log(`✅ coupon_redemptions: ${redemptionCount} rows inserted`);
    }

    // Final count
    const rowsRes = await q(`SELECT SUM(n_live_tup) as total_rows FROM pg_stat_user_tables`);
    console.log(`\n✅ Fix complete! Total rows in DB: ${rowsRes.rows[0].total_rows}`);

  } catch (err) {
    console.error('❌ Fix failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
