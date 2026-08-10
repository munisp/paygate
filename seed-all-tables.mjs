/**
 * seed-all-tables.mjs
 * Comprehensive seed for all 91 empty tables in PayGate PostgreSQL database.
 * Uses exact column names and types from the live schema.
 */
import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.PG_DATABASE_URL || 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev',
  ssl: false,
});

const q = (sql, params = []) => pool.query(sql, params);
const uid = () => randomUUID();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const kobo = (n) => n * 100;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);
const phone = () => `080${rand(10000000, 99999999)}`;
const bvn = () => `${rand(10000000000, 99999999999)}`;
const nin = () => `${rand(10000000000, 99999999999)}`;
const acct = () => `${rand(1000000000, 9999999999)}`;
const bankCodes = ['058', '011', '033', '044', '050', '070', '076', '221', '232', '301'];
const bankNames = ['GTBank', 'First Bank', 'UBA', 'Access Bank', 'EcoBank', 'Fidelity', 'Polaris', 'Stanbic', 'Sterling', 'Keystone'];
const currencies = ['NGN', 'USD', 'GBP', 'EUR'];
const statuses = ['active', 'inactive', 'pending'];

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getRefs() {
  const [mRes, cRes, uRes, wRes, subRes, invRes] = await Promise.all([
    q("SELECT id FROM merchants LIMIT 5"),
    q("SELECT id FROM customers LIMIT 10"),
    q("SELECT id FROM users LIMIT 5"),
    q("SELECT id::text FROM wallets LIMIT 5"),
    q("SELECT id FROM subscription_plans_v2 LIMIT 3"),
    q("SELECT invoice_id as id FROM invoices LIMIT 5"),
  ]);
  const cwRes = await q("SELECT id FROM consumer_wallets LIMIT 5");
  const subRes2 = await q("SELECT id FROM subscriptions LIMIT 5");
  const kybRes2 = await q("SELECT verification_id as id FROM kyb_verifications LIMIT 5");
  const ccRes = await q("SELECT credit_id as id FROM carbon_credits LIMIT 5");
  return {
    mids: mRes.rows.map(r => r.id),
    cids: cRes.rows.map(r => r.id),
    uids: uRes.rows.map(r => r.id),
    wids: wRes.rows.map(r => r.id),
    subPlanIds: subRes.rows.map(r => r.id),
    invoiceIds: invRes.rows.map(r => r.id),
    cwids: cwRes.rows.map(r => r.id),
    subIds: subRes2.rows.map(r => r.id),
    kybVerifIds: kybRes2.rows.map(r => r.id),
    carbonCreditIds: ccRes.rows.map(r => r.id),
  };
}

// ─── Seed Functions ─────────────────────────────────────────────────────────

async function seedAgentNetwork(refs) {
  const { mids } = refs;
  for (let i = 0; i < 10; i++) {
    const superAgent = pick(mids);
    const subAgent = pick(mids.filter(m => m !== superAgent)) || pick(mids);
    await q(`INSERT INTO agent_network (super_agent_merchant_id, sub_agent_merchant_id, status, joined_at, total_volume_kobo, transaction_count, fraud_incidents, settlement_rate)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [superAgent, subAgent, pick(["active","suspended","pending"]), daysAgo(rand(1,180)), kobo(rand(50000,5000000)), rand(100,5000), rand(0,5), rand(85,100)]);
  }
}

async function seedBulkCollections(refs) {
  const { mids, cids } = refs;
  for (let i = 0; i < 8; i++) {
    const batchId = uid();
    const mid = pick(mids);
    const total = rand(5, 50);
    await q(`INSERT INTO bulk_collections (id, merchant_id, name, description, due_date, status, total_amount_kobo, count, collected, collected_amount_kobo, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [batchId, mid, `Batch-${i+1}-${new Date().getFullYear()}`, 'Bulk collection batch', daysFromNow(rand(1,30)), pick(['completed','processing','failed']), kobo(rand(100000,5000000)), total, total - rand(0,3), kobo(rand(50000,4000000)), daysAgo(rand(1,90)), new Date()]);
    for (let j = 0; j < Math.min(5, total); j++) {
      await q(`INSERT INTO bulk_collection_items (id, collection_id, customer_name, customer_email, customer_phone, amount_kobo, status, payment_link_url, paid_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [uid(), batchId, `Customer ${j+1}`, `customer${j+1}@example.ng`, phone(), kobo(rand(5000,500000)), pick(['paid','failed','pending']), `https://pay.paygate.ng/link/${uid()}`, j < 3 ? daysAgo(rand(0,5)) : null, daysAgo(rand(1,30))]);
    }
  }
}

async function seedCashback(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    await q(`INSERT INTO cashback_balances (id, merchant_id, cashback_balance_kobo, total_earned_kobo, total_redeemed_kobo, pending_kobo, tier, cashback_rate, max_cashback_kobo, min_transaction_kobo, enabled, updated_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [uid(), mid, kobo(rand(1000,50000)), kobo(rand(10000,200000)), kobo(rand(0,50000)), kobo(rand(0,10000)), pick(['bronze','silver','gold','platinum']), '0.015', kobo(50000), kobo(10000), 1, new Date(), daysAgo(rand(30,365))]);
    for (let i = 0; i < 5; i++) {
      await q(`INSERT INTO cashback_transactions (id, merchant_id, type, amount_kobo, description, related_transaction_id, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [uid(), mid, pick(['earn','redeem','expire']), kobo(rand(100,5000)), 'Cashback on transaction', uid(), pick(['completed','pending']), daysAgo(rand(1,60))]);
    }
  }
}

async function seedConsumerTables(refs) {
  const { uids, mids, cids, cwids } = refs;
  // consumer_cards
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_cards (id, user_id, wallet_id, masked_pan, card_brand, expiry_month, expiry_year, cardholder_name, spending_limit_kobo, is_active, is_frozen, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [uid(), uid_, refs.cwids.length ? pick(refs.cwids) : uid(), `****${rand(1000,9999)}`, pick(['Visa','Mastercard','Verve']), `${rand(1,12)}`.padStart(2,'0'), `${rand(2025,2029)}`, 'Test User', kobo(rand(50000,500000)), true, false, daysAgo(rand(1,365))]);
  }
  // consumer_contacts
  for (const uid_ of uids) {
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO consumer_contacts (id, user_id, contact_user_id, nickname, phone, account_number, bank_code, bank_name, is_favorite, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [uid(), uid_, pick(uids.filter(u => u !== uid_)) || uid_, `Contact ${i+1}`, phone(), acct(), pick(bankCodes), pick(bankNames), i === 0, daysAgo(rand(1,180))]);
    }
  }
  // consumer_kyc_records
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_kyc_records (id, user_id, phone, bvn, nin, selfie_url, id_doc_url, status, provider_ref, rejection_reason, verified_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [uid(), uid_, phone(), bvn(), nin(), 'https://cdn.paygate.ng/kyc/selfie.jpg', 'https://cdn.paygate.ng/kyc/id.jpg', pick(['verified','pending','rejected']), uid(), null, daysAgo(rand(1,90)), daysAgo(rand(90,365)), new Date()]);
  }
  // consumer_pins
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_pins (user_id, pin_hash, failed_attempts, locked_until, updated_at)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [uid_, '$2b$10$hashedpin1234567890abcdefghijklmnop', 0, null, new Date()]);
  }
  // consumer_phone_verifications
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_phone_verifications (id, user_id, phone, otp_hash, expires_at, verified, attempts, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [uid(), uid_, phone(), '$2b$10$hashedotp1234567890abcdefghijk', daysFromNow(1), true, 1, daysAgo(rand(1,30))]);
  }
  // consumer_loyalty_accounts
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_loyalty_accounts (id, user_id, points_balance, lifetime_points, tier, updated_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [uid(), uid_, rand(100,10000), rand(1000,50000), pick(['bronze','silver','gold','platinum']), new Date(), daysAgo(rand(30,365))]);
  }
  // consumer_loyalty_txns
  for (const uid_ of uids) {
    for (let i = 0; i < 5; i++) {
      await q(`INSERT INTO consumer_loyalty_txns (id, user_id, type, points, description, reference_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [uid(), uid_, pick(['earn','redeem','expire','bonus']), rand(10,500), pick(['Purchase reward','Referral bonus','Birthday bonus','Redemption']), uid(), daysAgo(rand(1,90))]);
    }
  }
  // consumer_disputes
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_disputes (id, user_id, wallet_txn_id, merchant_dispute_id, subject, description, category, status, resolution, evidence_urls, resolved_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [uid(), uid_, null, uid(), 'Unauthorized transaction', 'I did not authorize this payment', pick(['unauthorized','duplicate','service_not_rendered']), pick(['open','resolved','escalated']), null, null, null, daysAgo(rand(1,30)), new Date()]);
  }
   // consumer_fraud_flags
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_fraud_flags (id, user_id, wallet_txn_id, risk_score, flag_reason, flag_type, status, reviewed_at, reviewed_by, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      [uid(), uid_, null, rand(1,100), pick(['unusual_location','high_amount','velocity']), pick(['automated','manual']), pick(['open','resolved','false_positive']), null, null, JSON.stringify({ip:'192.168.1.1'}), daysAgo(rand(1,30))]);
  }
  // consumer_insurance_policies
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_insurance_policies (id, merchant_id, customer_id, product_id, product_name, provider, premium_kobo, coverage_kobo, status, start_date, end_date, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [uid(), pick(mids), pick(cids), uid(), pick(['Life Cover','Health Shield','Device Guard']), pick(['Leadway','AXA Mansard','AIICO']), kobo(rand(500,5000)), kobo(rand(100000,5000000)), pick(['active','expired','cancelled']), daysAgo(rand(30,365)), daysFromNow(rand(30,365)), JSON.stringify({}), daysAgo(rand(30,365))]);
  }
  // consumer_insurance_claims
  for (let i = 0; i < 5; i++) {
    await q(`INSERT INTO consumer_insurance_claims (id, policy_id, merchant_id, description, claim_amount_kobo, approved_amount_kobo, status, evidence_urls, resolved_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [uid(), uid(), pick(mids), 'Claim for covered event', kobo(rand(10000,500000)), kobo(rand(5000,400000)), pick(['pending','approved','rejected']), JSON.stringify(['https://cdn.paygate.ng/evidence/1.jpg']), null, daysAgo(rand(1,60))]);
  }
  // consumer_recurring_payments
  for (const uid_ of uids) {
    await q(`INSERT INTO consumer_recurring_payments (id, user_id, type, biller_code, customer_reference, recipient_account_number, recipient_bank_code, recipient_name, amount_kobo, currency, frequency, next_run_at, last_run_at, run_count, max_runs, is_active, label, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT DO NOTHING`,
      [uid(), uid_, pick(['airtime','data','electricity','cable']), 'DSTV', `CUST${rand(100000,999999)}`, acct(), pick(bankCodes), 'Recurring Payee', kobo(rand(1000,50000)), 'NGN', pick(['daily','weekly','monthly']), daysFromNow(rand(1,30)), daysAgo(rand(1,30)), rand(1,12), 24, true, 'Monthly DSTV', daysAgo(rand(30,180))]);
  }
  // consumer_split_sessions
  const splitSessionIds = [];
  for (const uid_ of uids) {
    const sid = uid();
    splitSessionIds.push(sid);
    await q(`INSERT INTO consumer_split_sessions (id, creator_id, title, total_amount_kobo, currency, status, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [sid, uid_, `Split: ${pick(['Dinner','Trip','Party','Rent'])}`, kobo(rand(5000,200000)), 'NGN', pick(['open','completed','expired']), daysFromNow(rand(1,7)), daysAgo(rand(1,30))]);
  }
  // consumer_split_participants
  for (const sid of splitSessionIds) {
    for (const uid_ of uids.slice(0, 3)) {
      await q(`INSERT INTO consumer_split_participants (id, session_id, user_id, name, share_amount_kobo, status, paid_at, wallet_txn_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [uid(), sid, uid_, 'Participant', kobo(rand(1000,20000)), pick(['paid','pending']), daysAgo(rand(0,5)), uid(), daysAgo(rand(1,10))]);
    }
  }
  // consumer_wallet_txns
  for (const uid_ of uids) {
    for (let i = 0; i < 10; i++) {
      await q(`INSERT INTO consumer_wallet_txns (id, wallet_id, user_id, type, amount_kobo, currency, balance_after_kobo, description, reference, counterparty_name, counterparty_account, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
        [uid(), uid(), uid_, pick(['credit','debit']), kobo(rand(500,100000)), 'NGN', kobo(rand(10000,500000)), pick(['Transfer','Airtime','Bill payment','P2P']), uid(), `${pick(['John','Jane','Emeka','Amaka'])} ${pick(['Okafor','Bello','Adeyemi'])}`, acct(), 'completed', daysAgo(rand(1,90))]);
    }
  }
  // p2p_transfers
  for (let i = 0; i < 15; i++) {
    const sender = pick(uids);
    await q(`INSERT INTO p2p_transfers (id, sender_id, sender_wallet_id, recipient_account_number, recipient_bank_code, recipient_bank_name, recipient_name, amount_kobo, currency, narration, nip_session_id, nip_ref, status, failure_reason, completed_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING`,
      [uid(), sender, uid(), acct(), pick(bankCodes), pick(bankNames), `${pick(['Chidi','Ngozi','Tunde'])} ${pick(['Obi','Eze','Adewale'])}`, kobo(rand(1000,500000)), 'NGN', 'Payment', uid(), uid(), pick(['completed','failed','pending']), null, daysAgo(rand(0,5)), daysAgo(rand(1,30)), new Date()]);
  }
  // money_requests
  for (let i = 0; i < 10; i++) {
    await q(`INSERT INTO money_requests (id, requester_id, amount_kobo, currency, note, status, payer_user_id, payer_name, paid_at, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      [uid(), pick(uids), kobo(rand(500,50000)), 'NGN', pick(['For lunch','Rent share','Trip contribution']), pick(['pending','paid','expired']), pick(uids), 'Payer Name', null, daysFromNow(rand(1,7)), daysAgo(rand(1,14))]);
  }
  // saved_beneficiaries
  for (const uid_ of uids) {
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO saved_beneficiaries (id, user_id, account_number, bank_code, bank_name, account_name, nickname, transfer_count, last_used_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [uid(), uid_, acct(), pick(bankCodes), pick(bankNames), `${pick(['Amaka','Emeka','Tunde'])} ${pick(['Obi','Eze'])}`, `Bene ${i+1}`, rand(1,20), daysAgo(rand(1,30)), daysAgo(rand(30,180))]);
    }
  }
  // privacy_settings
  for (const mid of mids) {
    await q(`INSERT INTO privacy_settings (id, merchant_id, privacy_mode, hide_business_name, hide_bank_details, use_private_alias, private_alias, updated_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [uid(), mid, pick(['standard','enhanced','maximum']), 0, 0, 0, `alias-${mid.slice(0,8)}`, new Date(), daysAgo(rand(30,365))]);
  }
  // privacy_aliases
  for (const mid of mids) {
    await q(`INSERT INTO privacy_aliases (id, merchant_id, alias, expires_at, status, usage_count, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [uid(), mid, `pg-${uid().slice(0,8)}`, daysFromNow(rand(7,90)), 'active', rand(0,50), daysAgo(rand(1,30))]);
  }
  // realtime_notification_preferences
  for (const mid of mids) {
    await q(`INSERT INTO realtime_notification_preferences (id, merchant_id, webhook_enabled, email_enabled, sms_enabled, push_enabled, in_app_enabled, event_payment, event_dispute, event_payout, event_fraud, event_kyc, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
      [uid(), mid, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, daysAgo(rand(30,365)), new Date()]);
  }
  // split_bill_sessions
  for (let i = 0; i < 5; i++) {
    const sid = uid();
    await q(`INSERT INTO split_bill_sessions (id, order_id, merchant_id, total_kobo, split_count, paid_count, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [sid, uid(), pick(mids), kobo(rand(5000,100000)), rand(2,6), rand(0,6), pick(['open','completed']), daysAgo(rand(1,30))]);
    for (let j = 0; j < 3; j++) {
      await q(`INSERT INTO split_bill_shares (session_id, share_kobo, payment_link_id, paid_at, share_index)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [sid, kobo(rand(1000,20000)), uid(), j < 2 ? daysAgo(rand(0,3)) : null, j]);
    }
  }
  // red_envelopes
  for (const uid_ of uids) {
    const envId = uid();
    await q(`INSERT INTO red_envelopes (id, sender_id, sender_wallet_id, total_amount_kobo, currency, slots, claimed_slots, message, status, expires_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [envId, uid_, uid(), kobo(rand(5000,100000)), 'NGN', rand(3,10), rand(0,3), pick(['Happy New Year!','Congratulations!','Eid Mubarak!']), pick(['active','completed','expired']), daysFromNow(rand(1,7)), daysAgo(rand(1,30)), new Date()]);
    await q(`INSERT INTO red_envelope_claims (id, envelope_id, claimant_id, claimant_wallet_id, amount_kobo, claimed_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [uid(), envId, pick(uids), uid(), kobo(rand(500,10000)), daysAgo(rand(0,3))]);
  }
}

async function seedCrossBorder(refs) {
  const { mids, wids } = refs;
  for (let i = 0; i < 10; i++) {
    const mid = pick(mids);
    await q(`INSERT INTO cross_border_transfers (merchant_id, wallet_id, transfer_id, quote_id, source_currency, target_currency, source_amount, target_amount, exchange_rate, fee, corridor, rail, status, sender_name, sender_account, receiver_name, receiver_account, receiver_fsp_id, error_code, error_description, completed_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) ON CONFLICT DO NOTHING`,
      [mid, rand(1,5), uid(), uid(), 'NGN', pick(['USD','GBP','EUR','GHS','KES']), `${rand(10000,500000)}`, `${rand(100,2000)}`, `${(rand(1400,1600)/1000).toFixed(4)}`, `${rand(100,1000)}`, pick(['NG-US','NG-UK','NG-GH','NG-KE']), pick(['swift','mojaloop','ripple']), pick(['completed','pending','failed']), 'Sender Name', acct(), 'Receiver Name', acct(), 'FSP001', null, null, daysAgo(rand(0,5)), daysAgo(rand(1,30))]); // cross_border no tenant_id column
  }
}

async function seedDigitalGold(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    await q(`INSERT INTO digital_gold_holdings (id, merchant_id, gold_grams, purchased_grams, avg_purchase_price_per_gram, current_price_per_gram, current_value_kobo, unrealized_pnl_kobo, last_updated, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [uid(), mid, `${(rand(1,100)/10).toFixed(2)}`, `${(rand(5,200)/10).toFixed(2)}`, kobo(rand(60000,80000)), kobo(rand(65000,85000)), kobo(rand(100000,5000000)), kobo(rand(-50000,200000)), new Date(), daysAgo(rand(30,365))]);
    for (let i = 0; i < 5; i++) {
      await q(`INSERT INTO digital_gold_transactions (id, merchant_id, type, gold_grams, amount_kobo, price_per_gram, status, reference, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [uid(), mid, pick(['buy','sell','sip']), `${(rand(1,50)/10).toFixed(2)}`, kobo(rand(10000,500000)), kobo(rand(60000,80000)), 'completed', uid(), daysAgo(rand(1,90))]);
    }
    await q(`INSERT INTO gold_sip_plans (id, merchant_id, amount_kobo, frequency, status, next_run_at, total_invested_kobo, total_gold_grams, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [uid(), mid, kobo(rand(5000,50000)), pick(['weekly','monthly']), pick(['active','paused']), daysFromNow(rand(1,30)), kobo(rand(50000,500000)), `${(rand(5,50)/10).toFixed(2)}`, daysAgo(rand(30,180)), new Date()]);
  }
}

async function seedEMI(refs) {
  const { mids, cids } = refs;
  for (let i = 0; i < 8; i++) {
    const contractId = uid();
    const mid = pick(mids);
    const tenure = pick([3, 6, 9, 12, 18, 24]);
    const principal = kobo(rand(50000,500000));
    const monthly = Math.floor(principal / tenure);
    await q(`INSERT INTO emi_contracts (id, merchant_id, customer_id, order_id, plan_id, tenure, principal_kobo, interest_rate, processing_fee_kobo, total_amount_kobo, monthly_installment_kobo, paid_installments, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
      [contractId, mid, pick(cids), uid(), uid(), tenure, principal, '2.5', kobo(rand(500,2000)), principal + kobo(rand(5000,50000)), monthly, rand(0,tenure), pick(['active','completed','defaulted']), daysAgo(rand(30,365)), new Date()]);
    for (let j = 1; j <= Math.min(tenure, 6); j++) {
      await q(`INSERT INTO emi_installments (id, emi_contract_id, installment_no, due_date, amount_kobo, paid_amount_kobo, status, paid_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [uid(), contractId, j, daysFromNow(j * 30 - 30), monthly, j <= 3 ? monthly : 0, j <= 3 ? 'paid' : 'pending', j <= 3 ? daysAgo(rand(1,30)) : null, daysAgo(rand(30,365))]);
    }
  }
}

async function seedInsurance(refs) {
  const { mids, cids } = refs;
  for (let i = 0; i < 10; i++) {
    await q(`INSERT INTO insurance_policies (policy_id, customer_id, merchant_id, product_id, product_name, provider, premium_kobo, coverage_type, status, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      [uid(), pick(cids), pick(mids), uid(), pick(['Life Cover','Health Shield','Device Guard','Travel Insurance']), pick(['Leadway','AXA Mansard','AIICO','Cornerstone']), kobo(rand(500,10000)), pick(['life','health','device','travel']), pick(['active','expired','cancelled']), daysFromNow(rand(30,365)), daysAgo(rand(30,365))]);
  }
}

async function seedIntlRemittance(refs) {
  const { mids } = refs;
  for (let i = 0; i < 10; i++) {
    await q(`INSERT INTO intl_remittance_transfers (id, merchant_id, corridor_id, send_amount_usd, receive_amount, receive_currency, exchange_rate, fee_usd, recipient_name, recipient_account_number, recipient_bank_code, recipient_country, purpose, tracking_number, status, provider, estimated_delivery, delivered_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ON CONFLICT DO NOTHING`,
      [uid(), pick(mids), `NG-${pick(['US','UK','GH','KE'])}`, `${rand(100,5000)}`, `${rand(50000,2500000)}`, pick(['NGN','GHS','KES']), `${(rand(1400,1600)/1000).toFixed(4)}`, `${rand(5,50)}`, `${pick(['John','Jane','Emeka'])} ${pick(['Smith','Obi','Mensah'])}`, acct(), pick(bankCodes), pick(['US','GB','GH','KE']), pick(['family_support','business','education']), `TRK${rand(100000,999999)}`, pick(['completed','pending','failed']), pick(['Western Union','MoneyGram','Flutterwave']), daysFromNow(rand(1,3)), daysAgo(rand(0,2)), daysAgo(rand(1,30)), new Date()]);
  }
}

async function seedInventoryTransactions(refs) {
  const invRes = await q("SELECT id FROM inventory_items LIMIT 10");
  const itemIds = invRes.rows.map(r => r.id);
  if (!itemIds.length) return;
  for (let i = 0; i < 20; i++) {
    await q(`INSERT INTO inventory_transactions (item_id, type, quantity, order_id, note, created_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [pick(itemIds), pick(['sale','restock','adjustment','return']), rand(1,50), uid(), 'Inventory movement', daysAgo(rand(1,90))]);
  }
}

async function seedInvoiceFinancingV2(refs) {
  const { mids, invoiceIds } = refs;
  for (let i = 0; i < 8; i++) {
    const invoiceAmt = rand(500000, 5000000);
    const requested = Math.floor(invoiceAmt * 0.8);
    await q(`INSERT INTO invoice_financing_v2_applications (id, merchant_id, invoice_id, invoice_amount, requested_amount, approved_amount, interest_rate, tenor_days, status, disbursed_at, repaid_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [uid(), pick(mids), invoiceIds.length ? pick(invoiceIds) : uid(), invoiceAmt, requested, Math.floor(requested * 0.95), '3.5', pick([30,60,90]), pick(['pending','approved','disbursed','repaid','rejected']), daysAgo(rand(0,30)), null, daysAgo(rand(30,90)), new Date()]);
  }
}

async function seedInvoicePayments(refs) {
  const { invoiceIds } = refs;
  for (const invId of invoiceIds) {
    await q(`INSERT INTO invoice_payments (id, invoice_id, amount_kobo, method, reference, paid_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [uid(), invId, kobo(rand(50000,500000)), pick(['bank_transfer','card','ussd']), uid(), daysAgo(rand(1,30))]);
  }
}

async function seedRestaurant(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    // kds_stations
    await q(`INSERT INTO kds_stations (id, merchant_id, name, categories, active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [uid(), mid, 'Main Kitchen', JSON.stringify(['starters','mains','desserts']), true, daysAgo(rand(30,180))]);
    // menu_categories
    const catIds = [];
    for (const cat of ['Starters', 'Main Course', 'Desserts', 'Drinks']) {
      const catId = uid();
      catIds.push(catId);
      await q(`INSERT INTO menu_categories (id, merchant_id, name, display_order, created_at)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [catId, mid, cat, catIds.length, daysAgo(rand(30,180))]);
    }
    // menu_items
    const menuItemIds = [];
    const menuItems = ['Jollof Rice', 'Fried Rice', 'Pounded Yam', 'Egusi Soup', 'Suya', 'Puff Puff', 'Chapman', 'Zobo'];
    for (let i = 0; i < 6; i++) {
      const itemId = uid();
      menuItemIds.push(itemId);
      await q(`INSERT INTO menu_items (id, category_id, merchant_id, name, description, price_kobo, available, image_url, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [itemId, pick(catIds), mid, menuItems[i], `Delicious ${menuItems[i]}`, kobo(rand(1500,15000)), true, 'https://cdn.paygate.ng/menu/item.jpg', daysAgo(rand(30,180))]);
    }
    // restaurant_orders
    const tableRes = await q("SELECT id FROM restaurant_tables WHERE merchant_id = $1 LIMIT 3", [mid]);
    const tableIds = tableRes.rows.map(r => r.id);
    for (let i = 0; i < 5; i++) {
      const orderId = uid();
      await q(`INSERT INTO restaurant_orders (id, merchant_id, table_id, status, covers, total_kobo, notes, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [orderId, mid, tableIds.length ? pick(tableIds) : null, 'paid', rand(1,8), kobo(rand(5000,100000)), null, daysAgo(rand(1,30)), new Date()]);
      for (let j = 0; j < rand(2,5); j++) {
        await q(`INSERT INTO restaurant_order_items (order_id, name, qty, unit_price_kobo, course_number, status, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [orderId, pick(menuItems), rand(1,4), kobo(rand(1500,15000)), rand(1,3), 'served', null]);
      }
    }
  }
}

async function seedLoyalty(refs) {
  const { mids, cids } = refs;
  for (const mid of mids) {
    const progId = uid();
    await q(`INSERT INTO loyalty_programs (id, merchant_id, points_per_kobo, redeem_rate, active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [progId, mid, rand(1,5), rand(100,500), true, daysAgo(rand(30,365))]);
    for (const cid of cids.slice(0, 5)) {
      const accId = uid();
      await q(`INSERT INTO loyalty_accounts (id, merchant_id, customer_id, points_balance, lifetime_points, created_at)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [accId, mid, parseInt(cid.replace('cust_','')) || rand(1,10), rand(100,10000), rand(1000,50000), daysAgo(rand(30,365))]);
      for (let i = 0; i < 5; i++) {
        await q(`INSERT INTO loyalty_transactions (account_id, type, points, order_id, note, created_at)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [accId, pick(['earn','redeem','bonus']), rand(10,500), uid(), 'Points transaction', daysAgo(rand(1,90))]);
      }
    }
  }
}

async function seedCoupons(refs) {
  const { mids, uids } = refs;
  for (let i = 0; i < 10; i++) {
    const couponId = uid();
    await q(`INSERT INTO coupons (id, code, type, value, min_amount_kobo, max_discount_kobo, usage_limit, usage_count, per_user_limit, valid_from, valid_until, is_active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [couponId, `SAVE${rand(10,99)}`, pick(['percentage','fixed']), rand(5,50), kobo(rand(1000,10000)), kobo(rand(5000,50000)), rand(50,500), rand(0,100), 1, daysAgo(rand(30,90)), daysFromNow(rand(30,180)), true, daysAgo(rand(30,90))]);
    for (const uid_ of uids.slice(0, 3)) {
      await q(`INSERT INTO coupon_redemptions (id, coupon_id, user_id, amount_saved_kobo, reference_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [uid(), couponId, uid_, kobo(rand(100,5000)), uid(), daysAgo(rand(1,30))]);
    }
  }
}

async function seedMutualFunds(refs) {
  const { mids } = refs;
  const funds = ['Stanbic IBTC Money Market', 'ARM Discovery Fund', 'FBN Fixed Income', 'Zenith Equity Fund', 'GTBank Dollar Fund'];
  for (const mid of mids) {
    for (let i = 0; i < 3; i++) {
      const holdingId = uid();
      await q(`INSERT INTO mutual_fund_holdings (id, merchant_id, fund_id, fund_name, units, avg_nav_at_purchase, current_nav, invested_amount_kobo, current_value_kobo, unrealized_pnl_kobo, last_updated, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [holdingId, mid, uid(), pick(funds), `${(rand(100,10000)/10).toFixed(4)}`, `${kobo(rand(100,1000))}`, `${kobo(rand(100,1000))}`, kobo(rand(40000,450000)), kobo(rand(50000,500000)), kobo(rand(-10000,100000)), new Date(), daysAgo(rand(30,365))]);
      for (let j = 0; j < 5; j++) {
        await q(`INSERT INTO mutual_fund_transactions (id, merchant_id, fund_id, type, amount_kobo, units, nav_at_transaction, status, reference, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
          [uid(), mid, uid(), pick(['buy','sell','dividend']), kobo(rand(5000,100000)), `${(rand(10,500)/10).toFixed(4)}`, `${kobo(rand(100,1000))}`, 'completed', uid(), daysAgo(rand(1,90))]);
      }
    }
  }
}

async function seedPension(refs) {
  const { mids } = refs;
  const pfas = ['Stanbic IBTC Pension', 'ARM Pension', 'Leadway Pensure', 'AXA Mansard Pension', 'AIICO Pension'];
  for (const mid of mids) {
    const accId = uid();
    await q(`INSERT INTO pension_accounts (id, merchant_id, rsa_pin, pfa, fund_type, balance_kobo, employer_contribution_kobo, employee_contribution_kobo, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      [accId, mid, `PEN${rand(100000000000, 999999999999)}`, pick(pfas), pick(['fund_1','fund_2','fund_3','fund_4']), kobo(rand(500000,5000000)), kobo(rand(200000,2000000)), kobo(rand(100000,1000000)), 'active', daysAgo(rand(30,365)), new Date()]);
    for (let i = 0; i < 6; i++) {
      await q(`INSERT INTO pension_contributions (id, pension_account_id, merchant_id, amount_kobo, type, status, reference, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [uid(), accId, mid, kobo(rand(20000,200000)), pick(['employer','employee','voluntary']), 'completed', uid(), daysAgo(rand(1,180))]);
    }
  }
}

async function seedSalaryAccounts(refs) {
  const { mids } = refs;
  const names = ['Chukwuemeka Obi', 'Ngozi Adeyemi', 'Tunde Bello', 'Amaka Eze', 'Ibrahim Musa', 'Fatima Sule'];
  for (const mid of mids) {
    for (let i = 0; i < 4; i++) {
      const salAccId = uid();
      await q(`INSERT INTO salary_accounts (id, merchant_id, employee_id, employee_name, employee_email, account_number, bank_code, bank_name, salary_kobo, balance_kobo, advance_used_kobo, max_advance_kobo, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
        [salAccId, mid, uid(), names[i % names.length], `employee${i}@company.ng`, acct(), pick(bankCodes), pick(bankNames), kobo(rand(150000,1500000)), kobo(rand(50000,500000)), kobo(rand(0,100000)), kobo(rand(100000,500000)), 'active', daysAgo(rand(30,365)), new Date()]);
      for (let j = 0; j < 3; j++) {
        await q(`INSERT INTO salary_transactions (id, salary_account_id, merchant_id, type, amount_kobo, description, reference, status, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          [uid(), salAccId, mid, pick(['salary_credit','advance','repayment']), kobo(rand(50000,500000)), pick(['Monthly salary','Salary advance','Advance repayment']), uid(), 'completed', daysAgo(rand(1,90))]);
      }
    }
  }
}

async function seedSoundbox(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    for (let i = 0; i < 2; i++) {
      await q(`INSERT INTO soundbox_devices (id, merchant_id, device_id, name, status, volume, language, custom_message, last_seen, total_transactions, total_volume_kobo, registered_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
        [uid(), mid, `SB-${rand(100000,999999)}`, `Soundbox ${i+1}`, pick(['online','offline','idle']), rand(50,100), pick(['en','yo','ha','ig']), 'Payment received!', daysAgo(rand(0,3)), rand(100,5000), kobo(rand(500000,5000000)), daysAgo(rand(30,180)), daysAgo(rand(30,180))]);
    }
  }
}

async function seedWealthManagement(refs) {
  const { mids } = refs;
  const goalNames = ['Emergency Fund', 'House Purchase', 'Car Purchase', 'Children Education', 'Retirement', 'Business Capital'];
  for (const mid of mids) {
    await q(`INSERT INTO wealth_risk_profiles (id, merchant_id, risk_score, risk_category, investment_horizon, last_assessed, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [uid(), mid, rand(1,10), pick(['conservative','moderate','aggressive']), pick(['short','medium','long']), daysAgo(rand(1,90)), daysAgo(rand(30,365))]);
    for (let i = 0; i < 3; i++) {
      const target = kobo(rand(100000,5000000));
      const current = kobo(rand(0, Math.floor(target/100)));
      await q(`INSERT INTO wealth_goals (id, merchant_id, name, category, target_amount_kobo, current_amount_kobo, deadline, status, progress_pct, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [uid(), mid, goalNames[i % goalNames.length], pick(['savings','investment','emergency']), target, current, daysFromNow(rand(90,1095)), pick(['active','completed','paused']), `${((current/target)*100).toFixed(1)}`, daysAgo(rand(30,365)), new Date()]);
    }
  }
}

async function seedCrypto(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    // usdc_v2_wallets
    await q(`INSERT INTO usdc_v2_wallets (id, merchant_id, wallet_address, network, balance_usdc, balance_ngn, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [uid(), mid, `0x${Array.from({length:40}, () => '0123456789abcdef'[rand(0,15)]).join('')}`, pick(['ethereum','polygon','solana']), `${(rand(0,10000)/100).toFixed(2)}`, rand(0, 10000000), 'active', daysAgo(rand(30,365)), new Date()]);
    // usdc_v2_transactions
    for (let i = 0; i < 5; i++) {
      await q(`INSERT INTO usdc_v2_transactions (id, merchant_id, type, amount_usdc, amount_ngn, tx_hash, from_address, to_address, network, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [uid(), mid, pick(['receive','send','offramp','onramp']), `${(rand(10,1000)/100).toFixed(2)}`, rand(10000,1000000), `0x${Array.from({length:64}, () => '0123456789abcdef'[rand(0,15)]).join('')}`, `0x${Array.from({length:40}, () => '0123456789abcdef'[rand(0,15)]).join('')}`, `0x${Array.from({length:40}, () => '0123456789abcdef'[rand(0,15)]).join('')}`, pick(['ethereum','polygon']), 'confirmed', daysAgo(rand(1,90))]);
    }
    // merchant_solana_wallets
    await q(`INSERT INTO merchant_solana_wallets (id, merchant_id, wallet_address, label, network, is_active, verified_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [uid(), mid, `${Array.from({length:44}, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[rand(0,57)]).join('')}`, 'Primary Solana Wallet', 'mainnet', true, daysAgo(rand(1,90)), daysAgo(rand(30,180)), new Date()]);
    // crypto_offramp_v2_transactions
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO crypto_offramp_v2_transactions (id, merchant_id, crypto_asset, crypto_amount, fiat_currency, fiat_amount, exchange_rate, bank_code, account_number, status, tx_hash, wallet_address, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
        [uid(), mid, pick(['USDC','USDT','BTC','ETH']), `${(rand(10,1000)/100).toFixed(6)}`, 'NGN', rand(10000,1000000), `${rand(1400,1600)}`, pick(bankCodes), acct(), pick(['completed','pending','failed']), `0x${Array.from({length:64}, () => '0123456789abcdef'[rand(0,15)]).join('')}`, `0x${Array.from({length:40}, () => '0123456789abcdef'[rand(0,15)]).join('')}`, daysAgo(rand(1,90)), new Date()]);
    }
  }
}

async function seedNFC(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    for (let i = 0; i < 8; i++) {
      await q(`INSERT INTO nfc_transactions (id, merchant_id, device_id, amount, currency, card_scheme, masked_pan, status, response_code, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [uid(), mid, `NFC-${rand(1000,9999)}`, rand(100,100000), 'NGN', pick(['Visa','Mastercard','Verve']), `****${rand(1000,9999)}`, pick(['approved','declined']), pick(['00','51','05']), daysAgo(rand(1,30))]);
    }
  }
}

async function seedRetailPOS(refs) {
  const { mids, cids } = refs;
  for (const mid of mids) {
    await q(`INSERT INTO retail_pos_configs (id, merchant_id, store_name, store_address, currency, tax_rate, receipt_footer, enable_inventory_alerts, low_stock_threshold, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      [uid(), mid, 'PayGate Store', '123 Lagos Island, Lagos', 'NGN', '7.5', 'Thank you for shopping with us!', 1, 10, daysAgo(rand(30,180)), new Date()]);
    for (let i = 0; i < 10; i++) {
      await q(`INSERT INTO retail_sales (id, merchant_id, customer_id, items, subtotal_kobo, tax_kobo, total_kobo, payment_method, receipt_url, reference, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [uid(), mid, pick(cids), JSON.stringify([{name:'Product A',qty:rand(1,5),price:kobo(rand(500,10000))}]), kobo(rand(1000,50000)), kobo(rand(100,5000)), kobo(rand(1100,55000)), pick(['cash','card','transfer','ussd']), `https://cdn.paygate.ng/receipts/${uid()}.pdf`, uid(), 'completed', daysAgo(rand(1,90))]);
    }
  }
}

async function seedNIPBanks() {
  const banks = [
    ['058', 'Guaranty Trust Bank', 'GTBank', '058', 'commercial', 1, 1, 1],
    ['011', 'First Bank of Nigeria', 'First Bank', '011', 'commercial', 1, 1, 1],
    ['033', 'United Bank for Africa', 'UBA', '033', 'commercial', 1, 1, 1],
    ['044', 'Access Bank', 'Access', '044', 'commercial', 1, 1, 1],
    ['050', 'EcoBank Nigeria', 'EcoBank', '050', 'commercial', 1, 1, 1],
    ['070', 'Fidelity Bank', 'Fidelity', '070', 'commercial', 1, 1, 1],
    ['076', 'Polaris Bank', 'Polaris', '076', 'commercial', 1, 1, 1],
    ['221', 'Stanbic IBTC Bank', 'Stanbic', '221', 'commercial', 1, 1, 0],
    ['232', 'Sterling Bank', 'Sterling', '232', 'commercial', 1, 1, 1],
    ['301', 'Jaiz Bank', 'Jaiz', '301', 'non-interest', 1, 1, 0],
    ['082', 'Keystone Bank', 'Keystone', '082', 'commercial', 1, 1, 1],
    ['032', 'Union Bank', 'Union', '032', 'commercial', 1, 1, 1],
    ['035', 'Wema Bank', 'Wema', '035', 'commercial', 1, 1, 1],
    ['215', 'Unity Bank', 'Unity', '215', 'commercial', 1, 1, 1],
    ['100', 'Suntrust Bank', 'Suntrust', '100', 'commercial', 1, 0, 0],
    ['101', 'Providus Bank', 'Providus', '101', 'commercial', 1, 1, 0],
    ['102', 'Titan Trust Bank', 'Titan', '102', 'commercial', 1, 1, 0],
    ['103', 'Globus Bank', 'Globus', '103', 'commercial', 1, 0, 0],
    ['104', 'Lotus Bank', 'Lotus', '104', 'non-interest', 1, 0, 0],
    ['105', 'Premium Trust Bank', 'Premium', '105', 'commercial', 1, 0, 0],
  ];
  for (const [code, name, short, nip, cat, active, supNip, supUssd] of banks) {
    await q(`INSERT INTO nip_banks (id, bank_code, bank_name, short_name, nip_code, category, is_active, supports_nip, supports_ussd, logo_url, last_synced_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [uid(), code, name, short, nip, cat, active, supNip, supUssd, `https://cdn.paygate.ng/banks/${code}.png`, new Date(), daysAgo(rand(30,365)), new Date()]);
  }
}

async function seedNodalTransactions(refs) {
  const { mids } = refs;
  const nodalRes = await q("SELECT id FROM nodal_accounts LIMIT 3");
  const nodalIds = nodalRes.rows.map(r => r.id);
  if (!nodalIds.length) return;
  for (let i = 0; i < 15; i++) {
    await q(`INSERT INTO nodal_transactions (id, nodal_account_id, merchant_id, type, amount_kobo, narration, counterparty_name, counterparty_account, counterparty_bank, reference, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [uid(), pick(nodalIds), pick(mids), pick(['credit','debit']), kobo(rand(10000,1000000)), 'Nodal settlement', `${pick(['Emeka','Ngozi'])} ${pick(['Obi','Eze'])}`, acct(), pick(bankNames), uid(), 'completed', daysAgo(rand(1,30))]);
  }
}

async function seedSettlements(refs) {
  const { mids } = refs;
  for (let i = 0; i < 10; i++) {
    const mid = pick(mids);
    await q(`INSERT INTO settlements (id, tenant_id, merchant_id, reference, amount, currency, bank_code, account_number, account_name, status, sla_deadline_at, sla_breached_at, sla_alert_sent_at, workflow_id, bridge_ref, failure_reason, initiated_at, processed_at, completed_at, created_at, updated_at, severity, resolved_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) ON CONFLICT DO NOTHING`,
      [uid(), 'tenant-paygate-demo-001', mid, uid(), kobo(rand(100000,5000000)), 'NGN', pick(bankCodes), acct(), 'Merchant Account', pick(['pending','processing','completed','failed','sla_breached']), daysFromNow(1), null, null, uid(), uid(), null, daysAgo(rand(1,5)), daysAgo(rand(0,3)), daysAgo(rand(0,2)), daysAgo(rand(1,30)), new Date(), 'low', null]);
  }
}

async function seedSplitRules(refs) {
  const { mids } = refs;
  for (let i = 0; i < 5; i++) {
    const ruleId = uid();
    await q(`INSERT INTO split_rules (rule_id, rule_name, description, recipients, created_by, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [ruleId, `Split Rule ${i+1}`, 'Revenue split between merchant and platform', JSON.stringify([{account:acct(),bank:pick(bankCodes),percentage:80},{account:acct(),bank:pick(bankCodes),percentage:20}]), pick(mids), 1, daysAgo(rand(30,180)), new Date()]);
    await q(`INSERT INTO split_payments (split_payment_id, split_rule_id, total_amount_kobo, reference, legs, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [uid(), ruleId, kobo(rand(10000,500000)), uid(), JSON.stringify([{amount:kobo(rand(8000,400000)),status:'completed'},{amount:kobo(rand(2000,100000)),status:'completed'}]), 'completed', daysAgo(rand(1,30)), new Date()]);
  }
}

async function seedStaffShifts(refs) {
  const staffRes = await q("SELECT id FROM staff_members LIMIT 10");
  const staffIds = staffRes.rows.map(r => r.id);
  const { mids } = refs;
  if (!staffIds.length) return;
  for (const staffId of staffIds) {
    for (let i = 0; i < 5; i++) {
      const clockIn = daysAgo(rand(1,30));
      const clockOut = new Date(clockIn.getTime() + rand(6,10) * 3600000);
      await q(`INSERT INTO staff_shifts (staff_id, merchant_id, clock_in, clock_out, tips_kobo, hours_worked, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [staffId, pick(mids), clockIn, clockOut, kobo(rand(0,5000)), rand(6,10), clockIn]);
    }
  }
}

async function seedSubscriptions(refs) {
  const { mids, cids } = refs;
  const { subPlanIds } = refs;
  if (!subPlanIds.length) return;
  for (let i = 0; i < 10; i++) {
    const subId = uid();
    const mid = pick(mids);
    await q(`INSERT INTO subscription_subscribers (id, plan_id, merchant_id, customer_id, customer_name, customer_email, status, start_date, next_billing_date, cancelled_at, paused_at, total_paid_kobo, stripe_subscription_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
      [subId, pick(subPlanIds), mid, pick(cids), `Customer ${i+1}`, `customer${i+1}@example.com`, pick(['active','cancelled','paused']), daysAgo(rand(30,365)), daysFromNow(rand(1,30)), null, null, kobo(rand(10000,500000)), null, daysAgo(rand(30,365)), new Date()]);
    for (let j = 0; j < 3; j++) {
      await q(`INSERT INTO subscription_charges (id, subscription_id, merchant_id, amount_kobo, currency, status, nip_session_id, failure_reason, charged_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [uid(), refs.subIds.length ? pick(refs.subIds) : subId, mid, kobo(rand(1000,50000)), 'NGN', pick(['success','failed']), uid(), null, daysAgo(rand(1,90))]);
    }
  }
}

async function seedSuperAgentV2(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    await q(`INSERT INTO super_agent_v2_networks (id, merchant_id, network_name, total_agents, active_agents, total_float, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [uid(), mid, `${mid.slice(0,8)} Agent Network`, rand(10,500), rand(5,400), rand(1000000,100000000), 'active', daysAgo(rand(30,180))]);
  }
}

async function seedTaxFilings(refs) {
  const { mids } = refs;
  const taxTypes = ['VAT','WHT','CIT','PAYE','CGT'];
  for (const mid of mids) {
    for (const taxType of taxTypes) {
      await q(`INSERT INTO tax_filing_records (id, merchant_id, tax_type, period, taxable_amount, tax_amount, status, filed_at, receipt_number, due_date, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [uid(), mid, taxType, `Q${rand(1,4)}-${new Date().getFullYear()}`, rand(1000000,50000000), rand(50000,5000000), pick(['filed','pending','overdue']), daysAgo(rand(1,90)), `RCP${rand(100000,999999)}`, daysFromNow(rand(1,90)), daysAgo(rand(30,180)), new Date()]);
    }
  }
}

async function seedUSSD(refs) {
  const { mids } = refs;
  for (let i = 0; i < 15; i++) {
    await q(`INSERT INTO ussd_sessions (id, merchant_id, tenant_id, session_id, msisdn, service_code, status, steps, last_input, amount_kobo, currency, started_at, ended_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
      [uid(), pick(mids), 'tenant-paygate-demo-001', uid(), phone(), '*737#', pick(['active','completed','failed','timeout']), rand(1,8), '1', rand(100,100000), 'NGN', daysAgo(rand(1,30)), daysAgo(rand(0,30)), daysAgo(rand(1,30))]);
  }
}

async function seedWebhooks(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    const epId = uid();
    await q(`INSERT INTO webhook_endpoints (endpoint_id, merchant_id, url, secret, events, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [epId, mid, `https://api.${mid.slice(0,8)}.example.com/webhooks`, uid(), JSON.stringify(['payment.success','payment.failed','payout.completed','dispute.opened']), 1, daysAgo(rand(30,180)), new Date()]);
    for (let i = 0; i < 5; i++) {
      await q(`INSERT INTO webhook_delivery_log (id, endpoint_id, merchant_id, event_type, payload, status_code, success, attempt, delivered_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [uid(), epId, mid, pick(['payment.success','payment.failed','payout.completed']), JSON.stringify({event:'payment.success',data:{amount:rand(1000,100000)}}), pick([200,200,200,500]), pick([1,1,1,0]), 1, daysAgo(rand(0,5)), daysAgo(rand(1,30))]);
    }
  }
}

async function seedRegulatorySandbox(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    await q(`INSERT INTO regulatory_sandbox_configs (id, merchant_id, sandbox_type, config, is_active, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [uid(), mid, pick(['cbn_sandbox','nibss_test','mojaloop_pilot']), JSON.stringify({mode:'test',maxTransactionKobo:100000,allowedBanks:['058','011']}), 1, daysFromNow(rand(30,180)), daysAgo(rand(30,90))]);
  }
}

async function seedScheduledReports(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    for (const type of ['transactions','settlements','reconciliation','fraud']) {
      await q(`INSERT INTO scheduled_reports (id, merchant_id, type, frequency, format, email, status, last_run_at, next_run_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [uid(), mid, type, pick(['daily','weekly','monthly']), pick(['pdf','csv','xlsx']), `reports@${mid.slice(0,8)}.ng`, 'active', daysAgo(rand(1,7)), daysFromNow(rand(1,7)), daysAgo(rand(30,90))]);
    }
  }
}

async function seedSDKTokens(refs) {
  const { mids } = refs;
  for (const mid of mids) {
    await q(`INSERT INTO sdk_tokens (token_id, merchant_id, token_hash, expires_at, scopes, is_revoked, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [uid(), mid, uid(), daysFromNow(rand(30,365)), JSON.stringify(['payments','payouts','webhooks']), 0, daysAgo(rand(1,90))]);
  }
}

async function seedMerchantDirectors(refs) {
  const { mids } = refs;
  const directorNames = ['Adewale Okafor', 'Ngozi Eze', 'Ibrahim Musa', 'Chioma Obi', 'Tunde Adeyemi'];
  for (const mid of mids) {
    for (let i = 0; i < 2; i++) {
      await q(`INSERT INTO merchant_directors (id, merchant_id, full_name, bvn, nin, date_of_birth, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [uid(), mid, directorNames[i % directorNames.length], bvn(), nin(), `${rand(1960,1990)}-${String(rand(1,12)).padStart(2,'0')}-${String(rand(1,28)).padStart(2,'0')}`, daysAgo(rand(30,365))]);
    }
  }
}

async function seedCarbonCredits(refs) {
  const { mids } = refs;
  const { carbonCreditIds } = refs;
  if (!carbonCreditIds.length) return;
  for (const mid of mids) {
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO carbon_credit_transactions_v2 (id, merchant_id, credit_id, type, quantity, total_amount, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [uid(), mid, pick(carbonCreditIds), pick(['purchase','retire','transfer']), rand(1,100), rand(10000,1000000), 'completed', daysAgo(rand(1,90))]);
    }
  }
}

async function seedKYBSteps(refs) {
  const { kybVerifIds } = refs;
  if (!kybVerifIds.length) return;
  const steps = ['business_registration','director_verification','bank_statement','utility_bill','cac_document'];
  for (const kybId of kybVerifIds) {
    for (const step of steps) {
      await q(`INSERT INTO kyb_steps (id, verification_id, step_name, status, notes, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [uid(), kybId, step, pick(['pending','completed','rejected']), null, new Date()]);
    }
  }
}

async function seedMarketplaceOrders(refs) {
  const { mids } = refs;
  for (let i = 0; i < 10; i++) {
    const seller = pick(mids);
    const buyer = pick(mids.filter(m => m !== seller)) || pick(mids);
    await q(`INSERT INTO marketplace_orders (id, merchant_id, buyer_email, seller_merchant_id, items, subtotal, platform_fee, total_amount, currency, status, payment_method, escrow_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
      [uid(), buyer, `buyer${i}@example.com`, seller, JSON.stringify([{name:'Product',qty:rand(1,5),price:rand(5000,100000)}]), rand(5000,100000), rand(250,5000), rand(5250,105000), 'NGN', pick(['pending','completed','disputed','refunded']), pick(['card','transfer']), uid(), daysAgo(rand(1,30)), new Date()]);
  }
}

async function seedConsumerOutbox(refs) {
  const { uids } = refs;
  for (let i = 0; i < 10; i++) {
    await q(`INSERT INTO consumer_outbox (id, aggregate_id, event_type, payload, status, attempts, processed_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [uid(), pick(uids), pick(['wallet.credited','wallet.debited','kyc.verified','transfer.completed']), JSON.stringify({amount:rand(1000,100000),currency:'NGN'}), pick(['processed','pending','failed']), rand(1,3), daysAgo(rand(0,5)), daysAgo(rand(1,30))]);
  }
}

async function seedConsumerIdempotency(refs) {
  const { uids } = refs;
  for (const uid_ of uids) {
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO consumer_idempotency_keys (id, user_id, idempotency_key, operation, response_payload, expires_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [uid(), uid_, uid(), pick(['transfer','topup','bill_payment']), JSON.stringify({status:'success',reference:uid()}), daysFromNow(rand(1,7)), daysAgo(rand(1,7))]);
    }
  }
}

async function seedNIPResolutionErrors(refs) {
  const { mids } = refs;
  for (let i = 0; i < 10; i++) {
    await q(`INSERT INTO nip_resolution_errors (tenant_id, merchant_id, bank_code, account_number, attempt_number, error_code, error_message, error_source, resolved_at, resolved_account_name, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      ['tenant-001', pick(mids), pick(bankCodes), acct(), rand(1,3), pick(['NIP001','NIP002','NIP003']), 'Account not found', 'nibss', daysAgo(rand(0,5)), 'Resolved Account Name', daysAgo(rand(1,30))]);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting comprehensive seed for all 91 empty tables...');
  try {
    const refs = await getRefs();
    console.log(`Found: ${refs.mids.length} merchants, ${refs.cids.length} customers, ${refs.uids.length} users`);

    const steps = [
      ['agent_network', () => seedAgentNetwork(refs)],
      ['bulk_collections + items', () => seedBulkCollections(refs)],
      ['cashback_balances + transactions', () => seedCashback(refs)],
      ['consumer tables (cards, contacts, kyc, pins, loyalty, disputes, fraud, insurance, recurring, split, wallet_txns, p2p, money_requests, beneficiaries, privacy, notifications, red_envelopes)', () => seedConsumerTables(refs)],
      ['cross_border_transfers', () => seedCrossBorder(refs)],
      ['digital_gold (holdings, transactions, sip_plans)', () => seedDigitalGold(refs)],
      ['emi_contracts + installments', () => seedEMI(refs)],
      ['insurance_policies', () => seedInsurance(refs)],
      ['intl_remittance_transfers', () => seedIntlRemittance(refs)],
      ['inventory_transactions', () => seedInventoryTransactions(refs)],
      ['invoice_financing_v2_applications', () => seedInvoiceFinancingV2(refs)],
      ['invoice_payments', () => seedInvoicePayments(refs)],
      ['restaurant (kds, menu_categories, menu_items, orders, order_items)', () => seedRestaurant(refs)],
      ['loyalty (programs, accounts, transactions)', () => seedLoyalty(refs)],
      ['coupons + redemptions', () => seedCoupons(refs)],
      ['mutual_fund (holdings, transactions)', () => seedMutualFunds(refs)],
      ['pension (accounts, contributions)', () => seedPension(refs)],
      ['salary (accounts, transactions)', () => seedSalaryAccounts(refs)],
      ['soundbox_devices', () => seedSoundbox(refs)],
      ['wealth (goals, risk_profiles)', () => seedWealthManagement(refs)],
      ['crypto (usdc_v2_wallets, usdc_v2_txns, solana_wallets, offramp_txns)', () => seedCrypto(refs)],
      ['nfc_transactions', () => seedNFC(refs)],
      ['retail_pos (configs, sales)', () => seedRetailPOS(refs)],
      ['nip_banks', () => seedNIPBanks()],
      ['nip_resolution_errors', () => seedNIPResolutionErrors(refs)],
      ['nodal_transactions', () => seedNodalTransactions(refs)],
      ['settlements', () => seedSettlements(refs)],
      ['split_rules + split_payments', () => seedSplitRules(refs)],
      ['staff_shifts', () => seedStaffShifts(refs)],
      ['subscription (subscribers, charges)', () => seedSubscriptions(refs)],
      ['super_agent_v2_networks', () => seedSuperAgentV2(refs)],
      ['tax_filing_records', () => seedTaxFilings(refs)],
      ['ussd_sessions', () => seedUSSD(refs)],
      ['webhook (endpoints, delivery_log)', () => seedWebhooks(refs)],
      ['regulatory_sandbox_configs', () => seedRegulatorySandbox(refs)],
      ['scheduled_reports', () => seedScheduledReports(refs)],
      ['sdk_tokens', () => seedSDKTokens(refs)],
      ['merchant_directors', () => seedMerchantDirectors(refs)],
      ['carbon_credit_transactions_v2', () => seedCarbonCredits(refs)],
      ['kyb_steps', () => seedKYBSteps(refs)],
      ['marketplace_orders', () => seedMarketplaceOrders(refs)],
      ['consumer_outbox', () => seedConsumerOutbox(refs)],
      ['consumer_idempotency_keys', () => seedConsumerIdempotency(refs)],
    ];

    for (const [label, fn] of steps) {
      process.stdout.write(`  Seeding ${label}...`);
      try {
        await fn();
        console.log(' ✅');
      } catch (err) {
        console.log(` ❌ ${err.message}`);
      }
    }

    // Final count
    const countRes = await q("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'");
    const rowsRes = await q(`
      SELECT SUM(n_live_tup) as total_rows
      FROM pg_stat_user_tables
    `);
    console.log(`\n✅ Seed complete!`);
    console.log(`   Tables: ${countRes.rows[0].count}`);
    console.log(`   Total rows: ${rowsRes.rows[0].total_rows}`);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
