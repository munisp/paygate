#!/usr/bin/env node
/**
 * Wave 32 Seed Script (PostgreSQL) — uses actual DB column names
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Pool } = require("/home/ubuntu/paygate-merchant-portal/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js");
import { randomUUID } from "crypto";

const DB_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new Pool({ connectionString: DB_URL });
const q = (sql, p = []) => pool.query(sql, p);

async function main() {
  console.log("🌱 Seeding Wave 32 tables...");

  // ── 1. Plan Limits ──────────────────────────────────────────────────────────
  console.log("  → plan_limits");
  const plans = [
    { plan: "free",       maxApiCalls: 1000,      maxTxVolume: 1000,      maxUsers: 2,   maxCorridors: 1,   maxWebhooks: 2,   maxApiKeys: 1,   price: 0,   features: ["Basic dashboard", "Email support"] },
    { plan: "starter",    maxApiCalls: 10000,     maxTxVolume: 10000,     maxUsers: 5,   maxCorridors: 3,   maxWebhooks: 5,   maxApiKeys: 3,   price: 49,  features: ["All Free", "Webhooks", "API access", "Chat support"] },
    { plan: "growth",     maxApiCalls: 100000,    maxTxVolume: 100000,    maxUsers: 20,  maxCorridors: 10,  maxWebhooks: 20,  maxApiKeys: 10,  price: 199, features: ["All Starter", "FX corridors", "Analytics", "Priority support"] },
    { plan: "business",   maxApiCalls: 1000000,   maxTxVolume: 1000000,   maxUsers: 100, maxCorridors: 50,  maxWebhooks: 100, maxApiKeys: 50,  price: 799, features: ["All Growth", "BNPL", "SSO", "Account manager"] },
    { plan: "enterprise", maxApiCalls: 999999999, maxTxVolume: 999999999, maxUsers: 999999, maxCorridors: 999, maxWebhooks: 999, maxApiKeys: 999, price: 0, features: ["Unlimited", "Custom limits", "SLA", "On-premise"] },
  ];
  for (const p of plans) {
    await q(
      `INSERT INTO plan_limits (id, plan, max_api_calls_per_month, max_tx_volume_usd_per_month, max_users, max_corridors, max_webhooks, max_api_keys, price_usd_per_month, features, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
       ON CONFLICT (plan) DO UPDATE SET max_api_calls_per_month=EXCLUDED.max_api_calls_per_month, price_usd_per_month=EXCLUDED.price_usd_per_month, features=EXCLUDED.features`,
      [randomUUID(), p.plan, p.maxApiCalls, p.maxTxVolume, p.maxUsers, p.maxCorridors, p.maxWebhooks, p.maxApiKeys, p.price, JSON.stringify(p.features)]
    );
  }
  console.log(`    ✓ ${plans.length} plans seeded`);

  // ── 2. Tenant Corridors (actual cols: fee_pct, min_amount, max_amount) ──────
  console.log("  → tenant_corridors");
  const corridors = [
    { tenant: "ten_paygate_default", src: "NGN", dst: "USD", fee: 1.5, min: 1,  max: 10000 },
    { tenant: "ten_paygate_default", src: "NGN", dst: "GBP", fee: 1.8, min: 1,  max: 8000  },
    { tenant: "ten_paygate_default", src: "NGN", dst: "EUR", fee: 1.6, min: 1,  max: 9000  },
    { tenant: "ten_paygate_default", src: "USD", dst: "NGN", fee: 0.5, min: 10, max: 50000 },
    { tenant: "ten_paygate_default", src: "GBP", dst: "NGN", fee: 0.5, min: 10, max: 40000 },
    { tenant: "ten_paygate_default", src: "NGN", dst: "KES", fee: 2.0, min: 1,  max: 5000  },
    { tenant: "ten_paygate_default", src: "NGN", dst: "GHS", fee: 1.9, min: 1,  max: 4000  },
    { tenant: "ten_paygate_default", src: "NGN", dst: "ZAR", fee: 1.7, min: 1,  max: 6000  },
  ];
  for (const c of corridors) {
    await q(
      `INSERT INTO tenant_corridors (tenant_id, source_currency, dest_currency, is_enabled, fee_pct, min_amount, max_amount, created_at, updated_at)
       VALUES ($1,$2,$3,true,$4,$5,$6,NOW(),NOW())
       ON CONFLICT DO NOTHING`,
      [c.tenant, c.src, c.dst, c.fee, c.min, c.max]
    );
  }
  console.log(`    ✓ ${corridors.length} corridors seeded`);

  // ── 3a. Seed invite_codes first (FK dependency) ──────────────────────────
  console.log("  → invite_codes (pre-seed for FK)");
  const preInviteCodes = [
    { code: "PG-KUDA2024", type: "partner", maxUses: 1, plan: "growth" },
    { code: "PG-FLWV2024", type: "partner", maxUses: 1, plan: "growth" },
    { code: "PG-PSTK2024", type: "partner", maxUses: 1, plan: "starter" },
    { code: "PG-MNIE2024", type: "partner", maxUses: 1, plan: "starter" },
    { code: "PG-OPAY2024", type: "partner", maxUses: 1, plan: "business" },
    { code: "PG-PALM2024", type: "partner", maxUses: 1, plan: "growth" },
    { code: "PG-CRBN2024", type: "partner", maxUses: 1, plan: "growth" },
    { code: "PG-PIGV2024", type: "partner", maxUses: 1, plan: "starter" },
    { code: "PG-TAPT2024", type: "partner", maxUses: 1, plan: "business" },
    { code: "PG-CWRY2024", type: "partner", maxUses: 1, plan: "starter" },
  ];
  const expires0 = new Date(); expires0.setFullYear(expires0.getFullYear() + 1);
  for (const ic of preInviteCodes) {
    await q(
      `INSERT INTO invite_codes (code, type, uses_remaining, uses_total, max_uses, expires_at, plan, notes, is_active, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,0,$4,$5,$6,$7,true,'system',NOW(),NOW())
       ON CONFLICT (code) DO NOTHING`,
      [ic.code, ic.type, ic.maxUses, ic.maxUses, expires0, ic.plan, "Pre-seeded for partner onboarding"]
    );
  }
  console.log(`    ✓ ${preInviteCodes.length} invite codes pre-seeded`);

  // ── 3. Partner Onboarding Sessions ─────────────────────────────────────────
  // actual cols: id, invite_code, step, company_name, company_email, status, tenant_id, ...
  console.log("  → partner_onboarding_sessions");
  // step is integer (1=invite_code, 2=company_info, 3=branding, 4=fee_structure, 5=review, 6=complete)
  const sessions = [
    { company: "Kuda Technologies Ltd",  email: "onboard@kuda.com",          step: 6, status: "approved",     inviteCode: "PG-KUDA2024",  country: "NG", biz: "fintech" },
    { company: "Flutterwave Nigeria",     email: "onboard@flutterwave.com",   step: 4, status: "in_progress", inviteCode: "PG-FLWV2024",  country: "NG", biz: "payments" },
    { company: "Paystack Payments",       email: "onboard@paystack.com",      step: 3, status: "in_progress", inviteCode: "PG-PSTK2024",  country: "NG", biz: "payments" },
    { company: "Moniepoint Inc",          email: "onboard@moniepoint.com",    step: 2, status: "pending",     inviteCode: "PG-MNIE2024",  country: "NG", biz: "banking" },
    { company: "OPay Digital Services",   email: "onboard@opay.ng",           step: 6, status: "approved",     inviteCode: "PG-OPAY2024",  country: "NG", biz: "mobile_money" },
    { company: "PalmPay Limited",         email: "onboard@palmpay.com",       step: 5, status: "review",      inviteCode: "PG-PALM2024",  country: "NG", biz: "mobile_money" },
    { company: "Carbon (One Finance)",    email: "onboard@carbon.ng",         step: 6, status: "approved",     inviteCode: "PG-CRBN2024",  country: "NG", biz: "lending" },
    { company: "Cowrywise Financial",     email: "onboard@cowrywise.com",     step: 1, status: "pending",     inviteCode: "PG-CWRY2024",   country: "NG", biz: "investment" },
    { company: "Piggyvest Technologies",  email: "onboard@piggyvest.com",     step: 2, status: "pending",     inviteCode: "PG-PIGV2024",  country: "NG", biz: "savings" },
    { company: "TeamApt (Moniepoint)",    email: "onboard@teamapt.com",       step: 6, status: "approved",     inviteCode: "PG-TAPT2024",  country: "NG", biz: "agency_banking" },
  ];
  for (const s of sessions) {
    await q(
      `INSERT INTO partner_onboarding_sessions (id, invite_code, step, company_name, company_email, company_country, business_type, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       ON CONFLICT DO NOTHING`,
      [randomUUID(), s.inviteCode, s.step, s.company, s.email, s.country, s.biz, s.status]
    );
  }
  console.log(`    ✓ ${sessions.length} onboarding sessions seeded`);

  // ── 4. Billing Invoices ─────────────────────────────────────────────────────
  console.log("  → billing_invoices");
  const tenants = ["ten_paygate_default", "ten_kuda_001", "ten_flwv_002", "ten_pstk_003", "ten_opay_004"];
  const statuses = ["paid", "paid", "paid", "open", "open", "draft", "void"];
  const planPrices = { free: 0, starter: 49, growth: 199, business: 799 };
  const planNames = Object.keys(planPrices);
  let invCount = 0;
  for (let i = 0; i < 30; i++) {
    const tenant = tenants[i % tenants.length];
    const status = statuses[i % statuses.length];
    const plan = planNames[i % planNames.length];
    const amount = planPrices[plan];
    const month = new Date();
    month.setMonth(month.getMonth() - (i % 6));
    const period = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    const invoiceNum = `INV-${period}-${String(i + 1).padStart(4, "0")}`;
    const dueDate = new Date(month);
    dueDate.setDate(dueDate.getDate() + 30);
    await q(
      `INSERT INTO billing_invoices (id, tenant_id, invoice_number, amount_usd, billing_period, status, due_date, paid_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       ON CONFLICT (invoice_number) DO NOTHING`,
      [randomUUID(), tenant, invoiceNum, amount, period, status, dueDate, status === "paid" ? new Date() : null]
    );
    invCount++;
  }
  console.log(`    ✓ ${invCount} billing invoices seeded`);

  // ── 5. SSO Configs ──────────────────────────────────────────────────────────
  console.log("  → sso_configs");
  const ssoConfigs = [
    { tenant: "ten_paygate_default", protocol: "oidc",  enabled: true,  clientId: "paygate-oidc-client", discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration", scopes: "openid email profile" },
    { tenant: "ten_kuda_001",        protocol: "saml",  enabled: true,  entityId: "https://sso.kuda.com/saml/metadata", ssoUrl: "https://sso.kuda.com/saml/sso", sloUrl: "https://sso.kuda.com/saml/slo" },
    { tenant: "ten_flwv_002",        protocol: "oauth2", enabled: false, clientId: "flwv-oauth2-client", discoveryUrl: "https://auth.flutterwave.com/.well-known/openid-configuration" },
    { tenant: "ten_opay_004",        protocol: "oidc",  enabled: true,  clientId: "opay-oidc-client", discoveryUrl: "https://accounts.opay.ng/.well-known/openid-configuration", scopes: "openid email profile phone" },
  ];
  for (const s of ssoConfigs) {
    await q(
      `INSERT INTO sso_configs (id, tenant_id, protocol, is_enabled, entity_id, sso_url, slo_url, client_id, client_secret, discovery_url, scopes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       ON CONFLICT DO NOTHING`,
      [randomUUID(), s.tenant, s.protocol, s.enabled, s.entityId || null, s.ssoUrl || null, s.sloUrl || null, s.clientId || null, null, s.discoveryUrl || null, s.scopes || null]
    );
  }
  console.log(`    ✓ ${ssoConfigs.length} SSO configs seeded`);

  // ── 6. Stripe Subscriptions ─────────────────────────────────────────────────
  // actual cols: id, user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, trial_end
  console.log("  → stripe_subscriptions");
  const subStatuses = ["active", "active", "active", "trialing", "past_due", "canceled"];
  const subPlans = ["starter", "growth", "business", "starter", "growth", "free"];
  for (let i = 1; i <= 20; i++) {
    const status = subStatuses[i % subStatuses.length];
    const plan = subPlans[i % subPlans.length];
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await q(
      `INSERT INTO stripe_subscriptions (id, user_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,NOW(),NOW())
       ON CONFLICT DO NOTHING`,
      [randomUUID(), i, `sub_test_${randomUUID().replace(/-/g, "").slice(0, 14)}`, `cus_test_${randomUUID().replace(/-/g, "").slice(0, 14)}`, `price_test_${plan}`, plan, status, periodStart, periodEnd]
    );
  }
  console.log("    ✓ 20 stripe subscriptions seeded");

  // ── 7. BNPL Repayment Schedules ─────────────────────────────────────────────
  // actual cols: id, application_id, instalment_number, due_date, principal_amount, interest_amount, total_amount, outstanding_balance, status, paid_at
  console.log("  → bnpl_repayment_schedules");
  // Use dummy application IDs if no real BNPL applications exist
  const { rows: apps } = await pool.query("SELECT id FROM bnpl_applications LIMIT 5").catch(() => ({ rows: [] }));
  const appList = apps.length > 0 ? apps : [
    { id: randomUUID() }, { id: randomUUID() }, { id: randomUUID() },
  ];

  let schedCount = 0;
  for (const app of appList) {
    const totalInstalments = 6;
    const principalPerInstalment = 50000;
    const interestPerInstalment = 2500;
    let outstanding = totalInstalments * (principalPerInstalment + interestPerInstalment);
    for (let n = 1; n <= totalInstalments; n++) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + n - 1);
      const isPaid = n <= 2;
      const isOverdue = n === 3;
      const status = isPaid ? "paid" : isOverdue ? "overdue" : "pending";
      const total = principalPerInstalment + interestPerInstalment;
      outstanding -= isPaid ? total : 0;
      await q(
        `INSERT INTO bnpl_repayment_schedules (application_id, instalment_number, due_date, principal_amount, interest_amount, total_amount, outstanding_balance, status, paid_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT DO NOTHING`,
        [app.id, n, dueDate, principalPerInstalment, interestPerInstalment, total, outstanding, status, isPaid ? new Date() : null]
      );
      schedCount++;
    }
  }
  console.log(`    ✓ ${schedCount} BNPL repayment schedules seeded`);

  // ── 8. Invite Codes ─────────────────────────────────────────────────────────
  // actual cols: id, code, type, uses_remaining, uses_total, max_uses, expires_at, created_by, tenant_id, plan, notes, is_active
  console.log("  → invite_codes");
  const inviteCodes = [
    { code: "PG-EARLY2024", type: "partner",    maxUses: 100,  plan: "growth",      notes: "Early adopter partner program 2024" },
    { code: "PG-BETA2024",  type: "partner",    maxUses: 50,   plan: "starter",     notes: "Beta testing partners" },
    { code: "PG-VIP2024",   type: "partner",    maxUses: 10,   plan: "business",    notes: "VIP enterprise partners" },
    { code: "PG-DEV2024",   type: "developer",  maxUses: 200,  plan: "starter",     notes: "Developer community program" },
    { code: "PG-ENT2024",   type: "enterprise", maxUses: 5,    plan: "enterprise",  notes: "Enterprise pilot program" },
    { code: "PG-PROMO25",   type: "partner",    maxUses: 500,  plan: "growth",      notes: "2025 promotional campaign" },
    { code: "PG-LAUNCH25",  type: "partner",    maxUses: 1000, plan: "free",        notes: "Product launch 2025" },
  ];
  for (const ic of inviteCodes) {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    await q(
      `INSERT INTO invite_codes (code, type, uses_remaining, uses_total, max_uses, expires_at, plan, notes, is_active, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,0,$4,$5,$6,$7,true,'system',NOW(),NOW())
       ON CONFLICT (code) DO UPDATE SET is_active=true`,
      [ic.code, ic.type, ic.maxUses, ic.maxUses, expires, ic.plan, ic.notes]
    );
  }
  console.log(`    ✓ ${inviteCodes.length} invite codes seeded`);

  await pool.end();
  console.log("\n✅ Wave 32 seed complete!");
}

main().catch(err => {
  console.error("Seed failed:", err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
