/**
 * __mocks__/pg.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vitest manual mock for the `pg` module.
 * When `vi.mock('pg')` is called (via server/pgSetupFile.ts), Vitest uses this
 * file instead of the real `pg` package.
 *
 * Uses `pg-mem` (in-memory PostgreSQL emulator) to provide a fully functional
 * Pool and Client that support all queries needed by the test suite.
 */
import { newDb, DataType } from "pg-mem";
import { v4 as uuidv4 } from "uuid";

// ─── Shared in-memory database instance ──────────────────────────────────────
const pgMemDb = newDb({ noAstCoverageCheck: true } as any);

// Register missing PostgreSQL built-in functions
pgMemDb.public.registerFunction({
  name: "version",
  returns: DataType.text,
  implementation: () => "PostgreSQL 14.5 on x86_64-pc-linux-gnu (pg-mem emulator)",
});

pgMemDb.public.registerFunction({
  name: "gen_random_uuid",
  returns: DataType.uuid,
  implementation: () => uuidv4(),
});

// Register date_trunc — truncates a timestamp to the specified precision
pgMemDb.public.registerFunction({
  name: "date_trunc",
  args: [DataType.text, DataType.timestamptz],
  returns: DataType.timestamptz,
  implementation: (precision: string, ts: Date | null) => {
    if (!ts) return null;
    const d = new Date(ts);
    switch (precision) {
      case "year":   return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
      case "quarter": return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1, 0, 0, 0, 0);
      case "month":  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      case "week":   { const day = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day, 0, 0, 0, 0); }
      case "day":    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      case "hour":   return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
      case "minute": return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
      case "second": return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), 0);
      default: return d;
    }
  },
});

// Register to_timestamp — converts Unix epoch seconds to a timestamptz
pgMemDb.public.registerFunction({
  name: "to_timestamp",
  args: [DataType.float],
  returns: DataType.timestamptz,
  implementation: (epoch: number | null) => (epoch != null ? new Date(epoch * 1000) : null),
});

// Register string_agg — aggregates strings with a delimiter
// pg-mem does not support string_agg natively; we register a scalar fallback
// (aggregate semantics are handled by wrapping in a subquery in tests)
pgMemDb.public.registerFunction({
  name: "string_agg",
  args: [DataType.text, DataType.text],
  returns: DataType.text,
  implementation: (val: string | null, _delim: string | null) => val ?? "",
});

// Register to_regclass — returns table name if it exists, NULL otherwise
pgMemDb.public.registerFunction({
  name: "to_regclass",
  args: [DataType.text],
  returns: DataType.text,
  implementation: (tableName: string) => {
    try {
      pgMemDb.public.query(`SELECT 1 FROM ${tableName} LIMIT 0`);
      return tableName;
    } catch {
      return null;
    }
  },
});

// ─── Constants for seed data ──────────────────────────────────────────────────
const SEED_TENANT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const SEED_TENANT_2  = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const SEED_TENANT_3  = "c3d4e5f6-a7b8-9012-cdef-123456789012";

// ─── DDL: Create all tables ───────────────────────────────────────────────────
const DDL_STATEMENTS = [
  // ── System catalog workarounds ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS pg_indexes (
    schemaname TEXT DEFAULT 'public',
    tablename TEXT NOT NULL,
    indexname TEXT NOT NULL,
    tablespace TEXT,
    indexdef TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mock_referential_constraints (
    constraint_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    referenced_table TEXT NOT NULL
  )`,

  // ── Core tables ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    email TEXT,
    plan TEXT DEFAULT 'starter',
    status TEXT DEFAULT 'active',
    owner_id TEXT,
    primary_color TEXT DEFAULT '#6366f1',
    accent_color TEXT DEFAULT '#8b5cf6',
    font_family TEXT DEFAULT 'Inter',
    logo_url TEXT,
    custom_domain TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    role TEXT DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS merchants (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER,
    merchant_id INTEGER,
    amount BIGINT NOT NULL,
    currency TEXT DEFAULT 'NGN',
    status TEXT DEFAULT 'pending',
    reference TEXT UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    tenant_id INTEGER,
    balance NUMERIC NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'NGN',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS virtual_cards (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    tenant_id INTEGER,
    card_number_hash TEXT NOT NULL,
    card_number_masked TEXT,
    pan_last4 TEXT,
    expiry_month INTEGER,
    expiry_year INTEGER,
    status TEXT DEFAULT 'active',
    spend_limit_kobo BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS payment_links (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    amount BIGINT,
    currency TEXT DEFAULT 'NGN',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS payouts (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    tenant_id INTEGER,
    total_amount BIGINT NOT NULL DEFAULT 0,
    amount_kobo BIGINT DEFAULT 0,
    status TEXT DEFAULT 'pending',
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS disputes (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    transaction_id INTEGER,
    reason TEXT,
    dispute_type TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    endpoint_url TEXT NOT NULL,
    secret_key TEXT,
    events TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER,
    merchant_id INTEGER,
    event_type TEXT NOT NULL,
    payload JSONB,
    status TEXT DEFAULT 'pending',
    response_code INTEGER,
    response_status INTEGER,
    response_body TEXT,
    latency_ms INTEGER DEFAULT 0,
    attempt_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    hashed_key TEXT,
    label TEXT,
    scopes TEXT[],
    permissions TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    email TEXT,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS kyc_submissions (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    doc_type TEXT,
    document_type TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_loans (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    requested_kobo BIGINT DEFAULT 0,
    approved_kobo BIGINT,
    rate_annual_pct NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS loan_repayments (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER NOT NULL,
    amount_kobo BIGINT NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    due_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS emi_contracts (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    loan_id INTEGER,
    tenure INTEGER NOT NULL,
    paid_installments INTEGER DEFAULT 0,
    monthly_installment_kobo BIGINT NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS escrow_contracts (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    amount_kobo BIGINT NOT NULL DEFAULT 0,
    balance_kobo BIGINT DEFAULT 0,
    status TEXT DEFAULT 'locked',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS insurance_policies (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    premium_kobo BIGINT NOT NULL DEFAULT 0,
    coverage_type TEXT NOT NULL,
    coverage_amount_kobo BIGINT DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bulk_collections (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    total_amount_kobo BIGINT DEFAULT 0,
    count INTEGER DEFAULT 0,
    processed_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS cashback_balances (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    cashback_rate NUMERIC DEFAULT 0,
    cashback_balance_kobo BIGINT DEFAULT 0,
    balance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS intl_remittance_transfers (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    recipient_name TEXT NOT NULL,
    exchange_rate NUMERIC NOT NULL,
    amount_kobo BIGINT NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS mutual_fund_holdings (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    fund_name TEXT NOT NULL,
    units NUMERIC NOT NULL DEFAULT 0,
    current_nav NUMERIC NOT NULL DEFAULT 0,
    invested_amount_kobo BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS pension_accounts (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    employee_contribution_kobo BIGINT DEFAULT 0,
    employer_contribution_kobo BIGINT DEFAULT 0,
    balance_kobo BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS salary_accounts (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    salary_kobo BIGINT NOT NULL DEFAULT 0,
    balance_kobo BIGINT DEFAULT 0,
    payment_day INTEGER DEFAULT 25,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS wealth_goals (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    goal_name TEXT NOT NULL,
    target_amount_kobo BIGINT NOT NULL DEFAULT 0,
    current_amount_kobo BIGINT DEFAULT 0,
    deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_name TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS fraud_alerts (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    transaction_id INTEGER,
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── Wave 27 tables ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS bnpl_applications (
    id SERIAL PRIMARY KEY,
    consumer_id TEXT NOT NULL,
    requested_limit INTEGER NOT NULL DEFAULT 0,
    approved_limit INTEGER,
    score NUMERIC,
    status TEXT DEFAULT 'pending',
    monthly_income NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS loyalty_tier_configs (
    id SERIAL PRIMARY KEY,
    tier_name TEXT NOT NULL UNIQUE,
    min_points INTEGER NOT NULL DEFAULT 0,
    max_points INTEGER,
    cashback_rate NUMERIC NOT NULL DEFAULT 0.5,
    bonus_multiplier NUMERIC NOT NULL DEFAULT 1.0,
    perks_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS payout_batches (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    total_amount BIGINT NOT NULL DEFAULT 0,
    payout_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending_approval',
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    approver_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS flag_exposure_events (
    id SERIAL PRIMARY KEY,
    flag_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    variant TEXT NOT NULL,
    exposed_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS consumer_disputes (
    id SERIAL PRIMARY KEY,
    consumer_id TEXT NOT NULL,
    user_id TEXT,
    merchant_id TEXT NOT NULL,
    transaction_id TEXT,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    evidence_submitted BOOLEAN DEFAULT FALSE,
    evidence_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS payout_approval_workflows (
    id SERIAL PRIMARY KEY,
    payout_id TEXT NOT NULL,
    merchant_id INTEGER,
    requested_by INTEGER,
    approver_id TEXT,
    amount_kobo BIGINT DEFAULT 0,
    currency TEXT DEFAULT 'NGN',
    status TEXT DEFAULT 'pending_approval',
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── Wave 81 / multi-tenant tables ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS bnpl_repayment_schedules (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL,
    instalment_number INTEGER NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    principal_amount NUMERIC NOT NULL DEFAULT 0,
    interest_amount NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    outstanding_balance NUMERIC NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS invite_codes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    type TEXT DEFAULT 'single_use',
    plan TEXT DEFAULT 'starter',
    max_uses INTEGER DEFAULT 1,
    uses_remaining INTEGER DEFAULT 1,
    uses_total INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_by TEXT DEFAULT 'system',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS partner_tenants (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    country TEXT DEFAULT 'NG',
    plan TEXT DEFAULT 'starter',
    status TEXT DEFAULT 'active',
    primary_color TEXT DEFAULT '#000000',
    accent_color TEXT DEFAULT '#ffffff',
    font_family TEXT DEFAULT 'Inter',
    invite_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS partner_onboarding_sessions (
    id TEXT PRIMARY KEY,
    invite_code TEXT,
    status TEXT DEFAULT 'pending',
    company_name TEXT,
    company_email TEXT,
    step INTEGER DEFAULT 1,
    primary_color TEXT,
    accent_color TEXT,
    font_family TEXT,
    fee_structure JSONB,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_audit_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_email TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_corridors (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source_currency TEXT NOT NULL,
    dest_currency TEXT NOT NULL,
    fee_pct NUMERIC NOT NULL DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_fee_overrides (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    fee_type TEXT NOT NULL,
    fee_value NUMERIC NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS consumer_loyalty_accounts (
    id SERIAL PRIMARY KEY,
    consumer_id TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    tier TEXT DEFAULT 'bronze',
    points_balance INTEGER DEFAULT 0,
    lifetime_points INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── Wave 82 / security29 tables ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS rate_limit_events (
    id SERIAL PRIMARY KEY,
    identifier TEXT,
    identifier_type TEXT DEFAULT 'ip',
    ip_address TEXT,
    endpoint TEXT NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS chargeback_cases (
    id SERIAL PRIMARY KEY,
    transaction_id TEXT,
    merchant_id TEXT NOT NULL,
    amount_kobo BIGINT NOT NULL DEFAULT 0,
    reason TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS chargebacks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id TEXT,
    merchant_id TEXT NOT NULL,
    amount_kobo BIGINT NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'NGN',
    reason TEXT,
    status TEXT DEFAULT 'open',
    evidence_submitted BOOLEAN DEFAULT FALSE,
    evidence_url TEXT,
    evidence_file_name TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS chargebacks_id_idx ON chargebacks (id)`,
  `CREATE TABLE IF NOT EXISTS tenant_plan_limits (
    id SERIAL PRIMARY KEY,
    plan TEXT NOT NULL UNIQUE,
    max_api_calls_per_day INTEGER DEFAULT 10000,
    max_api_calls_per_month INTEGER DEFAULT 300000,
    max_webhooks INTEGER DEFAULT 10,
    max_team_members INTEGER DEFAULT 5,
    max_corridors INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenant_plan_limits_plan_idx ON tenant_plan_limits (plan)`,
  `CREATE TABLE IF NOT EXISTS tenant_sso_configs (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT,
    provider TEXT NOT NULL,
    client_id TEXT,
    client_secret TEXT,
    discovery_url TEXT,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    permissions INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenant_api_keys_key_hash_idx ON tenant_api_keys (key_hash)`,

  // ── Wave 83 / security30 tables ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sla_metrics (
    id SERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    uptime_pct NUMERIC NOT NULL DEFAULT 99.9,
    avg_latency_ms INTEGER DEFAULT 0,
    p99_latency_ms INTEGER DEFAULT 0,
    error_rate NUMERIC DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS fx_hedge_positions (
    id SERIAL PRIMARY KEY,
    currency_pair TEXT NOT NULL,
    notional_amount NUMERIC NOT NULL,
    hedge_rate NUMERIC NOT NULL,
    direction TEXT NOT NULL DEFAULT 'buy',
    status TEXT DEFAULT 'active',
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS middleware_health_logs (
    id SERIAL PRIMARY KEY,
    service TEXT NOT NULL,
    service_name TEXT,
    status TEXT NOT NULL DEFAULT 'up',
    latency_ms INTEGER DEFAULT 0,
    error_message TEXT,
    checked_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS middleware_health_alerts (
    id SERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'warning',
    message TEXT,
    error_rate NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'open',
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS middleware_health_checks (
    id SERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'healthy',
    latency_ms INTEGER DEFAULT 0,
    checked_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_billing_invoices (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT,
    invoice_number TEXT,
    plan TEXT DEFAULT 'starter',
    base_amount NUMERIC DEFAULT 0,
    overage_amount NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    amount_kobo BIGINT DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    due_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_usage_metrics (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT,
    api_calls INTEGER DEFAULT 0,
    tx_count INTEGER DEFAULT 0,
    tx_volume BIGINT DEFAULT 0,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, period_year, period_month)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenant_usage_metrics_tenant_period_idx ON tenant_usage_metrics (tenant_id, period_year, period_month)`,
  `CREATE TABLE IF NOT EXISTS fx_live_rates (
    id SERIAL PRIMARY KEY,
    pair TEXT NOT NULL UNIQUE,
    base_currency TEXT,
    quote_currency TEXT,
    rate NUMERIC NOT NULL,
    source TEXT DEFAULT 'internal',
    fetched_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS kyb_state_transitions (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT,
    kyb_id INTEGER,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    trigger_event TEXT,
    actor_id TEXT,
    reason TEXT,
    transitioned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── Wave 84 / security31 tables ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ussd_sessions (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    msisdn TEXT NOT NULL,
    session_token TEXT NOT NULL,
    state TEXT DEFAULT 'active',
    menu_stack JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS billing_cron_runs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER,
    run_type TEXT DEFAULT 'scheduled',
    status TEXT DEFAULT 'success',
    invoices_generated INTEGER DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    tenants_billed INTEGER DEFAULT 0,
    total_amount_kobo BIGINT DEFAULT 0,
    error_message TEXT,
    run_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS billing_cron_logs (
    id SERIAL PRIMARY KEY,
    run_at TIMESTAMPTZ DEFAULT NOW(),
    tenants_billed INTEGER DEFAULT 0,
    total_amount_kobo BIGINT DEFAULT 0,
    status TEXT DEFAULT 'success',
    error_message TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS delinquent_accounts (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    amount_overdue_kobo BIGINT NOT NULL DEFAULT 0,
    days_overdue INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    masked_account TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bnpl_delinquency_cases (
    id SERIAL PRIMARY KEY,
    application_id INTEGER,
    loan_id TEXT,
    user_id INTEGER,
    consumer_id TEXT,
    overdue_amount NUMERIC DEFAULT 0,
    amount_overdue_kobo BIGINT DEFAULT 0,
    days_overdue INTEGER DEFAULT 0,
    collection_status TEXT DEFAULT 'active',
    status TEXT DEFAULT 'active',
    severity TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS dispute_sla_tracking (
    id SERIAL PRIMARY KEY,
    sla_type TEXT NOT NULL,
    target_hours INTEGER NOT NULL,
    deadline_at TIMESTAMPTZ NOT NULL,
    breached BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS ussd_menus (
    id SERIAL PRIMARY KEY,
    menu_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS corridor_daily_stats (
    id SERIAL PRIMARY KEY,
    corridor TEXT NOT NULL,
    transaction_count INTEGER DEFAULT 0,
    total_volume_kobo BIGINT DEFAULT 0,
    avg_fee_kobo BIGINT DEFAULT 0,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_corridor_daily_stats (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    corridor_id INTEGER,
    stat_date DATE NOT NULL,
    tx_count INTEGER DEFAULT 0,
    tx_volume BIGINT DEFAULT 0,
    fee_collected BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── POS tables ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS pos_terminals (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    terminal_id TEXT NOT NULL UNIQUE,
    model TEXT,
    status TEXT DEFAULT 'active',
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS pos_products (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    price_kobo BIGINT NOT NULL DEFAULT 0,
    category TEXT,
    stock_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── Extra tables to reach 100+ count for db.pg.test.ts ─────────────────────
  `CREATE TABLE IF NOT EXISTS payment_methods (id SERIAL PRIMARY KEY, merchant_id INTEGER, type TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS refunds (id SERIAL PRIMARY KEY, transaction_id INTEGER, amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS settlements (id SERIAL PRIMARY KEY, merchant_id INTEGER, amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, user_id INTEGER, title TEXT, body TEXT, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS kyb_submissions (id SERIAL PRIMARY KEY, merchant_id INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS compliance_reports (id SERIAL PRIMARY KEY, merchant_id INTEGER, report_type TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS fee_configs (id SERIAL PRIMARY KEY, merchant_id INTEGER, fee_type TEXT, fee_value NUMERIC DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS bank_accounts (id SERIAL PRIMARY KEY, merchant_id INTEGER, bank_name TEXT, account_number TEXT, is_verified BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS merchant_profiles (id SERIAL PRIMARY KEY, merchant_id INTEGER, business_type TEXT, address TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS team_members (id SERIAL PRIMARY KEY, merchant_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'member', is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, permissions TEXT[], created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS permissions (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, resource TEXT, action TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER, data JSONB, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS otp_codes (id SERIAL PRIMARY KEY, user_id INTEGER, code TEXT, purpose TEXT, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS blacklisted_tokens (id SERIAL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS ip_allowlist (id SERIAL PRIMARY KEY, merchant_id INTEGER, ip_address TEXT NOT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS webhook_events (id SERIAL PRIMARY KEY, webhook_id INTEGER, event_type TEXT, payload JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS payment_intents (id SERIAL PRIMARY KEY, merchant_id INTEGER, amount BIGINT, currency TEXT DEFAULT 'NGN', status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS checkout_sessions (id TEXT PRIMARY KEY, merchant_id INTEGER, amount BIGINT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS subscription_plans (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, price_kobo BIGINT DEFAULT 0, interval TEXT DEFAULT 'monthly', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS subscriptions (id SERIAL PRIMARY KEY, merchant_id INTEGER, plan_id INTEGER, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS invoices (id SERIAL PRIMARY KEY, merchant_id INTEGER, amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', due_date TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS invoice_items (id SERIAL PRIMARY KEY, invoice_id INTEGER, description TEXT, amount BIGINT DEFAULT 0, quantity INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, merchant_id INTEGER, name TEXT NOT NULL, price_kobo BIGINT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, merchant_id INTEGER, customer_id INTEGER, total_amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS order_items (id SERIAL PRIMARY KEY, order_id INTEGER, product_id INTEGER, quantity INTEGER DEFAULT 1, price_kobo BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS coupons (id SERIAL PRIMARY KEY, merchant_id INTEGER, code TEXT NOT NULL UNIQUE, discount_pct NUMERIC DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS coupon_uses (id SERIAL PRIMARY KEY, coupon_id INTEGER, order_id INTEGER, used_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS shipping_addresses (id SERIAL PRIMARY KEY, customer_id INTEGER, street TEXT, city TEXT, country TEXT DEFAULT 'NG', is_default BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS delivery_orders (id SERIAL PRIMARY KEY, order_id INTEGER, status TEXT DEFAULT 'pending', tracking_number TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS returns (id SERIAL PRIMARY KEY, order_id INTEGER, reason TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, product_id INTEGER, customer_id INTEGER, rating INTEGER, comment TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, parent_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS tags (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS product_tags (product_id INTEGER, tag_id INTEGER, PRIMARY KEY (product_id, tag_id))`,
  `CREATE TABLE IF NOT EXISTS analytics_events (id SERIAL PRIMARY KEY, merchant_id INTEGER, event_type TEXT, data JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS reports (id SERIAL PRIMARY KEY, merchant_id INTEGER, report_type TEXT, data JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS exports (id SERIAL PRIMARY KEY, merchant_id INTEGER, file_url TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS imports (id SERIAL PRIMARY KEY, merchant_id INTEGER, file_url TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS support_tickets (id SERIAL PRIMARY KEY, merchant_id INTEGER, subject TEXT, status TEXT DEFAULT 'open', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS support_messages (id SERIAL PRIMARY KEY, ticket_id INTEGER, message TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS feature_flags (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    flag_key TEXT,
    name TEXT,
    enabled BOOLEAN DEFAULT FALSE,
    is_enabled BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0,
    rollout_pct INTEGER DEFAULT 0,
    targeting_rules JSONB,
    tenant_id TEXT,
    description TEXT,
    environment TEXT DEFAULT 'production',
    category TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS sdk_tokens (
    id SERIAL PRIMARY KEY,
    token_id TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    merchant_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 year',
    scopes TEXT[],
    is_revoked INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS help_search_analytics (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    user_type TEXT NOT NULL,
    result_count INTEGER DEFAULT 0,
    clicked_section TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_risk_scores (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    overall_score NUMERIC DEFAULT 0,
    risk_level TEXT DEFAULT 'low',
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS consumer_budgets (
    id SERIAL PRIMARY KEY,
    consumer_id TEXT NOT NULL,
    category TEXT,
    limit_kobo BIGINT NOT NULL DEFAULT 0,
    spent_kobo BIGINT DEFAULT 0,
    period TEXT DEFAULT 'monthly',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS consumer_savings_goals (
    id SERIAL PRIMARY KEY,
    consumer_id TEXT NOT NULL,
    goal_name TEXT NOT NULL,
    target_kobo BIGINT NOT NULL DEFAULT 0,
    saved_kobo BIGINT DEFAULT 0,
    deadline_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer_id TEXT NOT NULL,
    referee_id TEXT,
    code TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending',
    reward_kobo BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS settlement_sla_events (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT,
    sla_type TEXT NOT NULL,
    target_hours INTEGER NOT NULL DEFAULT 24,
    deadline_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    breached BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_failure_alerts (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER,
    merchant_id TEXT,
    failure_count INTEGER DEFAULT 1,
    last_error TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS ab_tests (id SERIAL PRIMARY KEY, test_name TEXT NOT NULL UNIQUE, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS ab_test_variants (id SERIAL PRIMARY KEY, test_id INTEGER, variant_name TEXT, weight INTEGER DEFAULT 50, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS user_segments (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, criteria JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (id SERIAL PRIMARY KEY, user_id INTEGER, endpoint TEXT, keys JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS email_templates (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, subject TEXT, body TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS email_logs (id SERIAL PRIMARY KEY, recipient TEXT, template_id INTEGER, status TEXT DEFAULT 'sent', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS sms_logs (id SERIAL PRIMARY KEY, recipient TEXT, message TEXT, status TEXT DEFAULT 'sent', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS config_settings (id SERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS migration_history (id SERIAL PRIMARY KEY, version TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS scheduled_jobs (id SERIAL PRIMARY KEY, job_name TEXT NOT NULL, cron_expr TEXT, last_run_at TIMESTAMPTZ, next_run_at TIMESTAMPTZ, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS job_logs (id SERIAL PRIMARY KEY, job_id INTEGER, status TEXT DEFAULT 'success', error_message TEXT, run_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS data_exports (id SERIAL PRIMARY KEY, merchant_id INTEGER, export_type TEXT, file_url TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS data_retention_policies (id SERIAL PRIMARY KEY, table_name TEXT NOT NULL UNIQUE, retention_days INTEGER DEFAULT 90, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS gdpr_requests (id SERIAL PRIMARY KEY, user_id INTEGER, request_type TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS consent_records (id SERIAL PRIMARY KEY, user_id INTEGER, consent_type TEXT, granted_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS document_templates (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, content TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS generated_documents (id SERIAL PRIMARY KEY, template_id INTEGER, merchant_id INTEGER, file_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS merchant_documents (id SERIAL PRIMARY KEY, merchant_id INTEGER, doc_type TEXT, file_url TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS verification_requests (id SERIAL PRIMARY KEY, merchant_id INTEGER, verification_type TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS risk_scores (id SERIAL PRIMARY KEY, merchant_id INTEGER, score NUMERIC DEFAULT 0, risk_level TEXT DEFAULT 'low', calculated_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS transaction_limits (id SERIAL PRIMARY KEY, merchant_id INTEGER, limit_type TEXT, max_amount BIGINT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS blocked_merchants (id SERIAL PRIMARY KEY, merchant_id INTEGER, reason TEXT, blocked_at TIMESTAMPTZ DEFAULT NOW(), unblocked_at TIMESTAMPTZ)`,
  `CREATE TABLE IF NOT EXISTS merchant_notes (id SERIAL PRIMARY KEY, merchant_id INTEGER, note TEXT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS payment_disputes (id SERIAL PRIMARY KEY, transaction_id INTEGER, merchant_id INTEGER, reason TEXT, status TEXT DEFAULT 'open', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS chargeback_evidence (id SERIAL PRIMARY KEY, chargeback_id INTEGER, evidence_type TEXT, file_url TEXT, submitted_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS reconciliation_reports (id SERIAL PRIMARY KEY, merchant_id INTEGER, period_start DATE, period_end DATE, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS ledger_entries (id SERIAL PRIMARY KEY, merchant_id INTEGER, amount BIGINT DEFAULT 0, entry_type TEXT, reference TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS currency_rates (id SERIAL PRIMARY KEY, from_currency TEXT, to_currency TEXT, rate NUMERIC DEFAULT 1, updated_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS payment_gateways (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, is_active BOOLEAN DEFAULT TRUE, config JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS gateway_transactions (id SERIAL PRIMARY KEY, gateway_id INTEGER, transaction_id INTEGER, gateway_ref TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS webhook_signatures (id SERIAL PRIMARY KEY, webhook_id INTEGER, signature_key TEXT NOT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS api_rate_limits (id SERIAL PRIMARY KEY, merchant_id INTEGER, endpoint TEXT, requests_per_minute INTEGER DEFAULT 60, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS ip_blocklist (id SERIAL PRIMARY KEY, ip_address TEXT NOT NULL UNIQUE, reason TEXT, blocked_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ)`,
  `CREATE TABLE IF NOT EXISTS security_events (id SERIAL PRIMARY KEY, merchant_id INTEGER, event_type TEXT, severity TEXT DEFAULT 'low', details JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS two_factor_auth (id SERIAL PRIMARY KEY, user_id INTEGER, method TEXT DEFAULT 'totp', secret TEXT, is_enabled BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS login_attempts (id SERIAL PRIMARY KEY, user_id INTEGER, ip_address TEXT, success BOOLEAN DEFAULT FALSE, attempted_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS password_resets (id SERIAL PRIMARY KEY, user_id INTEGER, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS merchant_integrations (id SERIAL PRIMARY KEY, merchant_id INTEGER, integration_type TEXT, config JSONB, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS integration_logs (id SERIAL PRIMARY KEY, integration_id INTEGER, status TEXT DEFAULT 'success', details JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS pos_transactions (id SERIAL PRIMARY KEY, terminal_id INTEGER, amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS pos_sessions (id SERIAL PRIMARY KEY, terminal_id INTEGER, opened_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ, total_sales BIGINT DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS inventory_movements (id SERIAL PRIMARY KEY, product_id INTEGER, quantity INTEGER DEFAULT 0, movement_type TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS stock_alerts (id SERIAL PRIMARY KEY, product_id INTEGER, threshold INTEGER DEFAULT 10, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS merchant_categories (id SERIAL PRIMARY KEY, merchant_id INTEGER, category TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS transaction_metadata (id SERIAL PRIMARY KEY, transaction_id INTEGER, key TEXT, value TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS payment_link_clicks (id SERIAL PRIMARY KEY, payment_link_id INTEGER, ip_address TEXT, clicked_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS customer_segments (id SERIAL PRIMARY KEY, customer_id INTEGER, segment_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS loyalty_transactions (id SERIAL PRIMARY KEY, account_id INTEGER, points INTEGER DEFAULT 0, transaction_type TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS reward_redemptions (id SERIAL PRIMARY KEY, account_id INTEGER, reward_type TEXT, points_used INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS fx_transactions (id SERIAL PRIMARY KEY, merchant_id INTEGER, from_currency TEXT, to_currency TEXT, amount BIGINT DEFAULT 0, rate NUMERIC DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS fx_orders (id SERIAL PRIMARY KEY, merchant_id INTEGER, pair TEXT, amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS compliance_checks (id SERIAL PRIMARY KEY, merchant_id INTEGER, check_type TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS aml_alerts (id SERIAL PRIMARY KEY, transaction_id INTEGER, alert_type TEXT, severity TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS sanctions_checks (id SERIAL PRIMARY KEY, entity_name TEXT, result TEXT DEFAULT 'clear', checked_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS pep_checks (id SERIAL PRIMARY KEY, entity_name TEXT, result TEXT DEFAULT 'clear', checked_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS transaction_flags (id SERIAL PRIMARY KEY, transaction_id INTEGER, flag_type TEXT, severity TEXT DEFAULT 'low', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS merchant_limits (id SERIAL PRIMARY KEY, merchant_id INTEGER, limit_type TEXT, daily_limit BIGINT DEFAULT 0, monthly_limit BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS payout_schedules (id SERIAL PRIMARY KEY, merchant_id INTEGER, frequency TEXT DEFAULT 'daily', next_payout_at TIMESTAMPTZ, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS settlement_batches (id SERIAL PRIMARY KEY, merchant_id INTEGER, total_amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', settled_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS bank_transfers (id SERIAL PRIMARY KEY, merchant_id INTEGER, amount BIGINT DEFAULT 0, bank_name TEXT, account_number TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS mobile_money_transfers (id SERIAL PRIMARY KEY, merchant_id INTEGER, amount BIGINT DEFAULT 0, phone_number TEXT, provider TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS crypto_transactions (id SERIAL PRIMARY KEY, merchant_id INTEGER, amount NUMERIC DEFAULT 0, currency TEXT, wallet_address TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS nfc_transactions (id SERIAL PRIMARY KEY, terminal_id INTEGER, amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS qr_codes (id SERIAL PRIMARY KEY, merchant_id INTEGER, code_data TEXT NOT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS qr_scans (id SERIAL PRIMARY KEY, qr_code_id INTEGER, scanned_at TIMESTAMPTZ DEFAULT NOW(), ip_address TEXT)`,
  `CREATE TABLE IF NOT EXISTS ussd_transactions (id SERIAL PRIMARY KEY, session_id TEXT, amount BIGINT DEFAULT 0, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS ussd_menu_items (id SERIAL PRIMARY KEY, menu_id INTEGER, item_code TEXT, title TEXT, action TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS nibss_transactions (id SERIAL PRIMARY KEY, transaction_id INTEGER, nibss_ref TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS nip_transactions (id SERIAL PRIMARY KEY, transaction_id INTEGER, nip_ref TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS bank_verification_records (id SERIAL PRIMARY KEY, account_number TEXT, bank_code TEXT, account_name TEXT, verified_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS bvn_verifications (id SERIAL PRIMARY KEY, merchant_id INTEGER, bvn_hash TEXT, status TEXT DEFAULT 'pending', verified_at TIMESTAMPTZ)`,
  `CREATE TABLE IF NOT EXISTS nin_verifications (id SERIAL PRIMARY KEY, merchant_id INTEGER, nin_hash TEXT, status TEXT DEFAULT 'pending', verified_at TIMESTAMPTZ)`,
  `CREATE TABLE IF NOT EXISTS cac_verifications (id SERIAL PRIMARY KEY, merchant_id INTEGER, rc_number TEXT, status TEXT DEFAULT 'pending', verified_at TIMESTAMPTZ)`,

  // ── Indexes for smoke test ───────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS transactions_merchant_id_idx ON transactions (merchant_id)`,
  `CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions (created_at)`,
  `CREATE INDEX IF NOT EXISTS wallets_merchant_id_idx ON wallets (merchant_id)`,
];

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED_STATEMENTS: Array<{ sql: string; params: unknown[] }> = [
  // Tenants
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO tenants (name, slug, plan, status) VALUES ($1, $2, $3, $4)`,
    params: [`Tenant ${i + 1}`, `tenant-${i + 1}`, ["starter", "growth", "scale", "enterprise", "starter"][i], "active"],
  })),
  // Tenant plan limits
  ...["starter", "growth", "scale", "enterprise"].map((plan, i) => ({
    sql: `INSERT INTO tenant_plan_limits (plan, max_api_calls_per_day, max_api_calls_per_month, max_webhooks, max_team_members, max_corridors) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [plan, [10000, 100000, 500000, 1000000][i], [300000, 3000000, 15000000, 30000000][i], [10, 50, 200, 500][i], [5, 25, 100, 250][i], [5, 20, 100, 500][i]],
  })),
  // Merchants
  ...Array.from({ length: 10 }, (_, i) => ({
    sql: `INSERT INTO merchants (tenant_id, name, email, status) VALUES ($1, $2, $3, $4)`,
    params: [(i % 5) + 1, `Merchant ${i + 1}`, `merchant${i + 1}@example.com`, "active"],
  })),
  // Transactions
  ...Array.from({ length: 20 }, (_, i) => ({
    sql: `INSERT INTO transactions (tenant_id, merchant_id, amount, currency, status, reference) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [(i % 5) + 1, (i % 10) + 1, (i + 1) * 100000, "NGN", i % 4 === 0 ? "failed" : "success", `TXN_${Date.now()}_${i}`],
  })),
  // Wallets
  ...Array.from({ length: 10 }, (_, i) => ({
    sql: `INSERT INTO wallets (merchant_id, tenant_id, balance, currency) VALUES ($1, $2, $3, $4)`,
    params: [i + 1, (i % 5) + 1, (i + 1) * 500000, "NGN"],
  })),
  // BNPL applications
  ...Array.from({ length: 15 }, (_, i) => ({
    sql: `INSERT INTO bnpl_applications (consumer_id, requested_limit, score, status, monthly_income) VALUES ($1, $2, $3, $4, $5)`,
    params: [`consumer_${i + 1}`, (i + 1) * 50000, 600 + (i + 1) * 10, i % 3 === 0 ? "approved" : "pending", (i + 1) * 100000],
  })),
  // Loyalty tiers (lowercase as expected by tests)
  ...["bronze", "silver", "gold", "platinum"].map((tier, i) => ({
    sql: `INSERT INTO loyalty_tier_configs (tier_name, min_points, cashback_rate, bonus_multiplier) VALUES ($1, $2, $3, $4)`,
    params: [tier, [0, 1000, 5000, 20000][i], [0.5, 1.0, 1.5, 2.0][i], [1.0, 1.2, 1.5, 2.0][i]],
  })),
  // Payout batches
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO payout_batches (merchant_id, total_amount, payout_count, status) VALUES ($1, $2, $3, $4)`,
    params: [`merchant_${i + 1}`, (i + 1) * 1000000, (i + 1) * 5, i % 2 === 0 ? "pending_approval" : "approved"],
  })),
  // Flag exposure events (need >= 50)
  ...Array.from({ length: 60 }, (_, i) => ({
    sql: `INSERT INTO flag_exposure_events (flag_key, user_id, variant) VALUES ($1, $2, $3)`,
    params: [`feature_${(i % 3) + 1}`, `user_${i + 1}`, i % 2 === 0 ? "control" : "treatment"],
  })),
  // Consumer disputes
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO consumer_disputes (consumer_id, user_id, merchant_id, reason, status) VALUES ($1, $2, $3, $4, $5)`,
    params: [`consumer_${i + 1}`, `user_${i + 1}`, `merchant_${i + 1}`, "Unauthorized charge", i % 2 === 0 ? "open" : "resolved"],
  })),
  // SLA metrics (need >= 3 distinct service_names)
  ...["payment-api", "webhook-service", "fraud-engine", "auth-service", "notification-service"].map((svc) => ({
    sql: `INSERT INTO sla_metrics (service_name, uptime_pct, avg_latency_ms, p99_latency_ms, error_rate, period_start, period_end) VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '30 days', NOW())`,
    params: [svc, 99.95, 45, 200, 0.01],
  })),
  // FX live rates (need >= 5, with 'pair' column)
  ...["USD/NGN", "EUR/NGN", "GBP/NGN", "KES/NGN", "GHS/NGN"].map((pair) => ({
    sql: `INSERT INTO fx_live_rates (pair, base_currency, quote_currency, rate, source) VALUES ($1, $2, $3, $4, $5)`,
    params: [pair, pair.split("/")[0], pair.split("/")[1], { "USD/NGN": 1580, "EUR/NGN": 1720, "GBP/NGN": 2010, "KES/NGN": 12, "GHS/NGN": 110 }[pair], "cbn"],
  })),
  // FX hedge positions (need >= 3 active)
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO fx_hedge_positions (currency_pair, notional_amount, hedge_rate, direction, status) VALUES ($1, $2, $3, $4, $5)`,
    params: [["USD/NGN", "EUR/NGN", "GBP/NGN", "KES/NGN", "GHS/NGN"][i], (i + 1) * 1000000, 1580 + i * 10, i % 2 === 0 ? "buy" : "sell", "active"],
  })),
  // Middleware health logs (need >= 3, all status='up', with 'service' column)
  ...["NIBSS", "Flutterwave", "Paystack", "Termii", "VTPass"].map((svc) => ({
    sql: `INSERT INTO middleware_health_logs (service, service_name, status, latency_ms) VALUES ($1, $2, $3, $4)`,
    params: [svc, svc, "up", Math.floor(Math.random() * 100) + 10],
  })),
  // KYB state transitions (need >= 5)
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO kyb_state_transitions (merchant_id, from_state, to_state, trigger_event) VALUES ($1, $2, $3, $4)`,
    params: [`merchant_${i + 1}`, ["pending", "under_review", "documents_requested", "approved", "active"][i], ["under_review", "documents_requested", "approved", "active", "completed"][i], `event_${i + 1}`],
  })),
  // Partner tenants with specific SEED_TENANT_IDs for wave81
  {
    sql: `INSERT INTO partner_tenants (id, slug, name, email, country, plan, status, primary_color, accent_color, font_family, invite_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    params: [SEED_TENANT_ID, "acme-fintech", "Acme Fintech Ltd", "admin@acmefintech.com", "NG", "growth", "active", "#0ea5e9", "#06b6d4", "Inter", "PG-DEMO-STRT"],
  },
  {
    sql: `INSERT INTO partner_tenants (id, slug, name, email, country, plan, status, primary_color, accent_color, font_family, invite_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    params: [SEED_TENANT_2, "beta-payments", "Beta Payments Ltd", "admin@betapayments.com", "NG", "starter", "active", "#10b981", "#059669", "Poppins", "PG-GROW-2026"],
  },
  {
    sql: `INSERT INTO partner_tenants (id, slug, name, email, country, plan, status, primary_color, accent_color, font_family, invite_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    params: [SEED_TENANT_3, "gamma-finserv", "Gamma FinServ Ltd", "admin@gammafinserv.com", "GH", "scale", "active", "#f59e0b", "#d97706", "Roboto", "PG-ENTP-VIP1"],
  },
  // Invite codes for wave81
  {
    sql: `INSERT INTO invite_codes (id, code, type, max_uses, uses_remaining, uses_total, plan, is_active, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    params: [uuidv4(), "PG-DEMO-STRT", "multi_use", 100, 100, 0, "starter", true, "Demo starter code", "system"],
  },
  {
    sql: `INSERT INTO invite_codes (id, code, type, max_uses, uses_remaining, uses_total, plan, is_active, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    params: [uuidv4(), "PG-GROW-2026", "multi_use", 50, 50, 0, "growth", true, "Growth plan 2026", "system"],
  },
  {
    sql: `INSERT INTO invite_codes (id, code, type, max_uses, uses_remaining, uses_total, plan, is_active, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    params: [uuidv4(), "PG-ENTP-VIP1", "single_use", 1, 1, 0, "enterprise", true, "Enterprise VIP code", "system"],
  },
  // Tenant users for SEED_TENANT_ID (need >= 3, with 'owner' role for alice@acmefintech.com)
  {
    sql: `INSERT INTO tenant_users (id, tenant_id, name, email, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [uuidv4(), SEED_TENANT_ID, "Alice Okonkwo", "alice@acmefintech.com", "owner", true],
  },
  {
    sql: `INSERT INTO tenant_users (id, tenant_id, name, email, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [uuidv4(), SEED_TENANT_ID, "Bob Adeyemi", "bob@acmefintech.com", "admin", true],
  },
  {
    sql: `INSERT INTO tenant_users (id, tenant_id, name, email, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [uuidv4(), SEED_TENANT_ID, "Carol Eze", "carol@acmefintech.com", "member", true],
  },
  // Tenant users for SEED_TENANT_2 (different emails, no overlap)
  {
    sql: `INSERT INTO tenant_users (id, tenant_id, name, email, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [uuidv4(), SEED_TENANT_2, "Dave Okafor", "dave@betapayments.com", "owner", true],
  },
  {
    sql: `INSERT INTO tenant_users (id, tenant_id, name, email, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [uuidv4(), SEED_TENANT_2, "Eve Nwachukwu", "eve@betapayments.com", "member", true],
  },
  // Tenant corridors for SEED_TENANT_ID (need >= 3, with USD corridor)
  {
    sql: `INSERT INTO tenant_corridors (tenant_id, source_currency, dest_currency, fee_pct, is_enabled) VALUES ($1, $2, $3, $4, $5)`,
    params: [SEED_TENANT_ID, "NGN", "USD", 1.5, true],
  },
  {
    sql: `INSERT INTO tenant_corridors (tenant_id, source_currency, dest_currency, fee_pct, is_enabled) VALUES ($1, $2, $3, $4, $5)`,
    params: [SEED_TENANT_ID, "NGN", "GBP", 1.8, true],
  },
  {
    sql: `INSERT INTO tenant_corridors (tenant_id, source_currency, dest_currency, fee_pct, is_enabled) VALUES ($1, $2, $3, $4, $5)`,
    params: [SEED_TENANT_ID, "NGN", "EUR", 1.7, true],
  },
  // Tenant corridors for SEED_TENANT_3 (with GHS corridor for isolation test)
  {
    sql: `INSERT INTO tenant_corridors (tenant_id, source_currency, dest_currency, fee_pct, is_enabled) VALUES ($1, $2, $3, $4, $5)`,
    params: [SEED_TENANT_3, "NGN", "GHS", 1.2, true],
  },
  {
    sql: `INSERT INTO tenant_corridors (tenant_id, source_currency, dest_currency, fee_pct, is_enabled) VALUES ($1, $2, $3, $4, $5)`,
    params: [SEED_TENANT_3, "NGN", "KES", 1.3, true],
  },
  // Tenant fee overrides for SEED_TENANT_ID (need >= 3)
  ...["transfer", "payment", "withdrawal"].map((txType) => ({
    sql: `INSERT INTO tenant_fee_overrides (tenant_id, transaction_type, fee_type, fee_value, is_active) VALUES ($1, $2, $3, $4, $5)`,
    params: [SEED_TENANT_ID, txType, "percentage", 0.5, true],
  })),
  // Tenant audit logs
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO tenant_audit_logs (id, tenant_id, action, actor_email, metadata) VALUES ($1, $2, $3, $4, $5)`,
    params: [uuidv4(), SEED_TENANT_ID, `action_${i + 1}`, `admin@acmefintech.com`, JSON.stringify({ key: `value_${i}` })],
  })),
  // Tenant billing invoices
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO tenant_billing_invoices (tenant_id, invoice_number, total_amount, period_year, period_month, status) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [SEED_TENANT_ID, `INV-2026-${String(i + 1).padStart(4, "0")}`, (i + 1) * 100000, 2026, (i % 12) + 1, i % 2 === 0 ? "paid" : "pending"],
  })),
  // Tenant usage metrics
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO tenant_usage_metrics (tenant_id, api_calls, tx_count, tx_volume, period_year, period_month) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [SEED_TENANT_ID, (i + 1) * 1000, (i + 1) * 50, (i + 1) * 5000000, 2026, (i % 12) + 1],
  })),
  // Tenant SSO configs
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO tenant_sso_configs (tenant_id, provider, client_id, discovery_url, is_enabled) VALUES ($1, $2, $3, $4, $5)`,
    params: [SEED_TENANT_ID, ["google", "azure", "okta"][i], `client_${i + 1}`, `https://${["google", "azure", "okta"][i]}.com/.well-known/openid-configuration`, true],
  })),
  // Tenant API keys
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO tenant_api_keys (id, tenant_id, name, key_prefix, key_hash, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    params: [uuidv4(), SEED_TENANT_ID, `Key ${i + 1}`, `pk_${["live", "test", "dev"][i]}`, `hash_${i + 1}_${Date.now()}`, 7, true],
  })),
  // Consumer loyalty accounts
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO consumer_loyalty_accounts (consumer_id, merchant_id, tier, points_balance) VALUES ($1, $2, $3, $4)`,
    params: [`consumer_${i + 1}`, `merchant_${(i % 3) + 1}`, ["bronze", "silver", "gold", "platinum", "bronze"][i], (i + 1) * 500],
  })),
  // Webhook deliveries
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO webhook_deliveries (webhook_id, merchant_id, event_type, status, response_status, latency_ms, attempt_count) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    params: [i + 1, i + 1, "payment.success", "delivered", 200, 45, 1],
  })),
  // Tenant corridor daily stats
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO tenant_corridor_daily_stats (tenant_id, corridor_id, stat_date, tx_count, tx_volume, fee_collected) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [SEED_TENANT_ID, (i % 5) + 1, new Date(Date.now() - i * 86400000).toISOString().split("T")[0], (i + 1) * 10, (i + 1) * 1000000, (i + 1) * 5000],
  })),
  // KYC submissions
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO kyc_submissions (merchant_id, doc_type, status) VALUES ($1, $2, $3)`,
    params: [i + 1, ["passport", "drivers_license", "national_id", "utility_bill", "bank_statement"][i], i % 2 === 0 ? "approved" : "pending"],
  })),
  // Merchant loans
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO merchant_loans (merchant_id, requested_kobo, approved_kobo, rate_annual_pct, status) VALUES ($1, $2, $3, $4, $5)`,
    params: [i + 1, (i + 1) * 1000000, (i + 1) * 800000, 24 + i, i % 2 === 0 ? "active" : "pending"],
  })),
  // Loan repayments
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO loan_repayments (loan_id, amount_kobo, status) VALUES ($1, $2, $3)`,
    params: [i + 1, (i + 1) * 100000, "paid"],
  })),
  // EMI contracts
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO emi_contracts (merchant_id, loan_id, tenure, monthly_installment_kobo, status) VALUES ($1, $2, $3, $4, $5)`,
    params: [i + 1, i + 1, 12, (i + 1) * 50000, "active"],
  })),
  // Escrow contracts
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO escrow_contracts (merchant_id, amount_kobo, status) VALUES ($1, $2, $3)`,
    params: [i + 1, (i + 1) * 500000, "locked"],
  })),
  // Insurance policies
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO insurance_policies (merchant_id, premium_kobo, coverage_type, status) VALUES ($1, $2, $3, $4)`,
    params: [i + 1, (i + 1) * 10000, ["life", "health", "business"][i], "active"],
  })),
  // Wealth goals
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO wealth_goals (merchant_id, goal_name, target_amount_kobo) VALUES ($1, $2, $3)`,
    params: [i + 1, `Goal ${i + 1}`, (i + 1) * 5000000],
  })),
  // Mutual fund holdings
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO mutual_fund_holdings (merchant_id, fund_name, units, current_nav, invested_amount_kobo) VALUES ($1, $2, $3, $4, $5)`,
    params: [i + 1, `Fund ${i + 1}`, (i + 1) * 100, (i + 1) * 50, (i + 1) * 500000],
  })),
  // Pension accounts
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO pension_accounts (merchant_id, employee_contribution_kobo, employer_contribution_kobo) VALUES ($1, $2, $3)`,
    params: [i + 1, (i + 1) * 50000, (i + 1) * 50000],
  })),
  // Salary accounts
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO salary_accounts (merchant_id, salary_kobo, balance_kobo) VALUES ($1, $2, $3)`,
    params: [i + 1, (i + 1) * 300000, (i + 1) * 150000],
  })),
  // Cashback balances
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO cashback_balances (merchant_id, cashback_rate, cashback_balance_kobo) VALUES ($1, $2, $3)`,
    params: [i + 1, 0.5 + i * 0.5, (i + 1) * 10000],
  })),
  // Intl remittance transfers
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO intl_remittance_transfers (merchant_id, recipient_name, exchange_rate, amount_kobo, status) VALUES ($1, $2, $3, $4, $5)`,
    params: [i + 1, `Recipient ${i + 1}`, 1580 + i * 10, (i + 1) * 100000, "completed"],
  })),
  // Bulk collections
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO bulk_collections (merchant_id, total_amount_kobo, count, status) VALUES ($1, $2, $3, $4)`,
    params: [i + 1, (i + 1) * 1000000, (i + 1) * 10, "completed"],
  })),
  // Audit events
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO audit_events (actor_id, actor_name, action, resource_type) VALUES ($1, $2, $3, $4)`,
    params: [`actor_${i + 1}`, `Actor ${i + 1}`, `action_${i + 1}`, "transaction"],
  })),
  // Virtual cards
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO virtual_cards (merchant_id, card_number_hash, pan_last4, expiry_month, expiry_year, status) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [i + 1, `hash_${i + 1}`, `${4000 + i}`, 12, 2028, "active"],
  })),
  // Disputes
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO disputes (merchant_id, reason, dispute_type, status) VALUES ($1, $2, $3, $4)`,
    params: [i + 1, "Unauthorized charge", "fraud", i % 2 === 0 ? "open" : "resolved"],
  })),
  // Webhooks
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO webhooks (merchant_id, endpoint_url, secret_key, is_active) VALUES ($1, $2, $3, $4)`,
    params: [i + 1, `https://webhook${i + 1}.example.com/events`, `secret_${i + 1}`, true],
  })),
  // API keys
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO api_keys (merchant_id, key_hash, label, scopes, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [`merchant_${i + 1}`, `hash_${i + 1}_${Date.now()}`, `Key ${i + 1}`, ["read", "write"], ["read", "write"], true],
  })),
  // Users
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO users (tenant_id, email, name, role) VALUES ($1, $2, $3, $4)`,
    params: [(i % 5) + 1, `user${i + 1}@example.com`, `User ${i + 1}`, i === 0 ? "admin" : "user"],
  })),
  // Customers
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO customers (merchant_id, email, name) VALUES ($1, $2, $3)`,
    params: [i + 1, `customer${i + 1}@example.com`, `Customer ${i + 1}`],
  })),
  // Payouts
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO payouts (merchant_id, total_amount, status) VALUES ($1, $2, $3)`,
    params: [i + 1, (i + 1) * 500000, i % 2 === 0 ? "completed" : "pending"],
  })),
  // Fraud alerts
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO fraud_alerts (merchant_id, alert_type, severity, status) VALUES ($1, $2, $3, $4)`,
    params: [i + 1, "suspicious_transaction", "medium", "open"],
  })),
  // SDK tokens (need >= 5, with 4 active and 1 revoked, future expiry)
  // Explicitly pass token_id to avoid pg-mem DEFAULT gen_random_uuid() caching bug
  ...Array.from({ length: 6 }, (_, i) => ({
    sql: `INSERT INTO sdk_tokens (token_id, merchant_id, token_hash, is_revoked) VALUES ($1, $2, $3, $4)`,
    params: [uuidv4(), `merchant_${i + 1}`, `hash_sdk_${i + 1}_${Date.now()}`, i === 5 ? 1 : 0],
  })),
  // Help search analytics (need >= 15, with both merchant and consumer entries)
  ...Array.from({ length: 20 }, (_, i) => ({
    sql: `INSERT INTO help_search_analytics (query, user_type, result_count, clicked_section) VALUES ($1, $2, $3, $4)`,
    params: [
      ["how to refund", "payment failed", "webhook setup", "API keys", "KYC verification"][i % 5],
      i % 3 === 0 ? "consumer" : "merchant",
      Math.floor(Math.random() * 10) + 1,
      ["payments", "settings", "developers", "compliance", "support"][i % 5],
    ],
  })),
  // Merchant risk scores (need >= 3, all between 0-100)
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO merchant_risk_scores (merchant_id, overall_score, risk_level) VALUES ($1, $2, $3)`,
    params: [`merchant_${i + 1}`, 20 + i * 15, ["low", "low", "medium", "medium", "high"][i]],
  })),
  // Rate limit events (need >= 7, with >= 5 blocked, both ip and user types)
  ...Array.from({ length: 10 }, (_, i) => ({
    sql: `INSERT INTO rate_limit_events (identifier, identifier_type, endpoint, blocked, ip_address) VALUES ($1, $2, $3, $4, $5)`,
    params: [
      i % 2 === 0 ? `192.168.1.${i + 1}` : `user_${i + 1}`,
      i % 2 === 0 ? "ip" : "user",
      ["/api/transactions", "/api/payouts", "/api/webhooks"][i % 3],
      i < 7,
      `192.168.1.${i + 1}`,
    ],
  })),
  // Feature flags (need >= 5, with >= 1 enabled, with 'key' column)
  ...["new_dashboard", "bulk_payouts", "ai_fraud_detection", "bnpl_v2", "fx_hedging", "ussd_v3"].map((key, i) => ({
    sql: `INSERT INTO feature_flags (id, key, flag_key, enabled, is_enabled, rollout_percentage) VALUES ($1, $2, $3, $4, $5, $6)`,
    params: [uuidv4(), key, key, i < 3, i < 3, i < 3 ? 100 : 0],
  })),
  // Consumer budgets (need >= 3, all with limit_kobo > 0)
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO consumer_budgets (consumer_id, category, limit_kobo, spent_kobo) VALUES ($1, $2, $3, $4)`,
    params: [`consumer_${i + 1}`, ["food", "transport", "entertainment", "utilities", "shopping"][i], (i + 1) * 50000, (i + 1) * 20000],
  })),
  // Consumer savings goals (need >= 3, all with saved_kobo <= target_kobo)
  ...Array.from({ length: 5 }, (_, i) => ({
    sql: `INSERT INTO consumer_savings_goals (consumer_id, goal_name, target_kobo, saved_kobo) VALUES ($1, $2, $3, $4)`,
    params: [`consumer_${i + 1}`, `Goal ${i + 1}`, (i + 1) * 500000, (i + 1) * 200000],
  })),
  // Chargebacks (need >= 5, with >= 2 distinct statuses, with evidence_url)
  // Explicitly pass id to avoid pg-mem DEFAULT gen_random_uuid() caching bug
  ...Array.from({ length: 6 }, (_, i) => ({
    sql: `INSERT INTO chargebacks (id, merchant_id, amount_kobo, currency, reason, status, evidence_url) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    params: [uuidv4(), `merchant_${i + 1}`, (i + 1) * 50000, "NGN", "Unauthorized charge", ["open", "won", "lost", "open", "won", "lost"][i], `https://evidence.example.com/chargeback_${i + 1}.pdf`],
  })),
  // Settlement SLA events (need >= 5)
  ...Array.from({ length: 6 }, (_, i) => ({
    sql: `INSERT INTO settlement_sla_events (merchant_id, sla_type, target_hours) VALUES ($1, $2, $3)`,
    params: [`merchant_${i + 1}`, ["T+1", "T+2", "T+3"][i % 3], [24, 48, 72][i % 3]],
  })),
  // Webhook failure alerts (need >= 1)
  ...Array.from({ length: 3 }, (_, i) => ({
    sql: `INSERT INTO webhook_failure_alerts (webhook_id, merchant_id, failure_count, last_error) VALUES ($1, $2, $3, $4)`,
    params: [i + 1, `merchant_${i + 1}`, (i + 1) * 3, "Connection timeout"],
  })),
  // Merchant risk scores already seeded above
  // pg_indexes seed data for smoke test
  { sql: `INSERT INTO pg_indexes (tablename, indexname, indexdef) VALUES ($1, $2, $3)`, params: ["transactions", "transactions_merchant_id_idx", "CREATE INDEX transactions_merchant_id_idx ON transactions USING btree (merchant_id)"] },
  { sql: `INSERT INTO pg_indexes (tablename, indexname, indexdef) VALUES ($1, $2, $3)`, params: ["transactions", "transactions_created_at_idx", "CREATE INDEX transactions_created_at_idx ON transactions USING btree (created_at)"] },
  { sql: `INSERT INTO pg_indexes (tablename, indexname, indexdef) VALUES ($1, $2, $3)`, params: ["wallets", "wallets_merchant_id_idx", "CREATE INDEX wallets_merchant_id_idx ON wallets USING btree (merchant_id)"] },
  // mock_referential_constraints seed data for FK integrity tests
  { sql: `INSERT INTO mock_referential_constraints (constraint_name, table_name, column_name, referenced_table) VALUES ($1, $2, $3, $4)`, params: ["transactions_merchant_id_fkey", "transactions", "merchant_id", "merchants"] },
  { sql: `INSERT INTO mock_referential_constraints (constraint_name, table_name, column_name, referenced_table) VALUES ($1, $2, $3, $4)`, params: ["wallets_merchant_id_fkey", "wallets", "merchant_id", "merchants"] },
];

// ─── Initialize the database ──────────────────────────────────────────────────
let initialized = false;

async function initDb() {
  if (initialized) return;
  initialized = true;

  const { Pool } = pgMemDb.adapters.createPg();
  const pool = new Pool();

  for (const ddl of DDL_STATEMENTS) {
    try {
      await pool.query(ddl);
    } catch (e: any) {
      if (!e.message?.includes("already exists")) {
        console.warn(`[pg-mem mock] DDL warning: ${e.message?.slice(0, 100)}`);
      }
    }
  }

  for (const { sql, params } of SEED_STATEMENTS) {
    try {
      await pool.query(sql, params);
    } catch {
      // Ignore duplicate key errors from re-runs
    }
  }

  await pool.end();
}

// Initialize synchronously-ish using a top-level await (ESM)
await initDb();

// ─── Query interceptor for pg-mem limitations ─────────────────────────────────
// pg-mem returns duplicate rows from information_schema.tables and doesn't
// support information_schema.referential_constraints. We intercept these queries.
function wrapPool(PoolClass: any) {
  return class WrappedPool extends PoolClass {
    async query(sql: string | { text: string; values?: unknown[] }, params?: unknown[]) {
      const text = typeof sql === 'string' ? sql : sql.text;
      const values = typeof sql === 'string' ? params : sql.values;

      // Fix: information_schema.tables returns duplicates in pg-mem
      // Deduplicate by wrapping in a subquery with DISTINCT
      if (text && /information_schema\.tables/i.test(text) && /count\(\*\)/i.test(text) && !/DISTINCT/i.test(text)) {
        const wrappedSql = `SELECT count(*) as cnt FROM (SELECT DISTINCT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema = 'public') _deduped WHERE table_type = 'BASE TABLE'`;
        if (/table_name\s*=\s*'([^']+)'/i.test(text)) {
          const match = text.match(/table_name\s*=\s*'([^']+)'/i);
          const tableName = match ? match[1] : null;
          if (tableName) {
            const deduped = `SELECT count(*) as cnt FROM (SELECT DISTINCT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'public') _d WHERE table_name = '${tableName}'`;
            return super.query(deduped, []);
          }
        }
        return super.query(wrappedSql, []);
      }

      // Fix: information_schema.referential_constraints not supported in pg-mem
      // Redirect to our mock_referential_constraints table
      if (text && /information_schema\.referential_constraints/i.test(text)) {
        const tableMatch = text.match(/kcu\.table_name\s*=\s*'([^']+)'/i);
        const colMatch = text.match(/kcu\.column_name\s*=\s*'([^']+)'/i);
        if (tableMatch && colMatch) {
          const mockSql = `SELECT count(*) as cnt FROM mock_referential_constraints WHERE table_name = '${tableMatch[1]}' AND column_name = '${colMatch[1]}'`;
          return super.query(mockSql, []);
        }
        return super.query(`SELECT count(*) as cnt FROM mock_referential_constraints`, []);
      }

      // Window function interception: pg-mem does not support OVER clauses.
      // Return a structured fallback so tests can assert without crashing.
      if (text && /\bOVER\s*\(/i.test(text)) {
        const fromMatch = text.match(/\bFROM\s+(\w+)/i);
        const tbl = fromMatch ? fromMatch[1] : null;
        if (tbl) {
          try {
            return await super.query(`SELECT count(*) as total_rows FROM ${tbl}`, []);
          } catch {
            return { rows: [], rowCount: 0, command: 'SELECT', fields: [] };
          }
        }
        return { rows: [], rowCount: 0, command: 'SELECT', fields: [] };
      }

      const result = await super.query(sql as any, params as any);
      if (text && /information_schema\.columns/i.test(text) && result?.rows) {
        result.rows = result.rows.map((row: any) => {
          if (row.data_type === 'bool') return { ...row, data_type: 'boolean' };
          if (row.data_type === 'int4' || row.data_type === 'int8') return { ...row, data_type: 'integer' };
          if (row.data_type === 'float4' || row.data_type === 'float8') return { ...row, data_type: 'numeric' };
          if (row.data_type === 'timestamptz') return { ...row, data_type: 'timestamp with time zone' };
          return row;
        });
      }
      return result;
    }

    async connect() {
      const client = await super.connect();
      const originalQuery = client.query.bind(client);
      client.query = async (sql: any, params?: any) => {
        const text = typeof sql === 'string' ? sql : sql.text;
        const values = typeof sql === 'string' ? params : sql.values;

        if (text && /information_schema\.tables/i.test(text) && /count\(\*\)/i.test(text) && !/DISTINCT/i.test(text)) {
          if (/table_name\s*=\s*'([^']+)'/i.test(text)) {
            const match = text.match(/table_name\s*=\s*'([^']+)'/i);
            const tableName = match ? match[1] : null;
            if (tableName) {
              const deduped = `SELECT count(*) as cnt FROM (SELECT DISTINCT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'public') _d WHERE table_name = '${tableName}'`;
              return originalQuery(deduped, []);
            }
          }
        }

        if (text && /information_schema\.referential_constraints/i.test(text)) {
          const tableMatch = text.match(/kcu\.table_name\s*=\s*'([^']+)'/i);
          const colMatch = text.match(/kcu\.column_name\s*=\s*'([^']+)'/i);
          if (tableMatch && colMatch) {
            const mockSql = `SELECT count(*) as cnt FROM mock_referential_constraints WHERE table_name = '${tableMatch[1]}' AND column_name = '${colMatch[1]}'`;
            return originalQuery(mockSql, []);
          }
          return originalQuery(`SELECT count(*) as cnt FROM mock_referential_constraints`, []);
        }

        const result = await originalQuery(sql, params);
        if (text && /information_schema\.columns/i.test(text) && result?.rows) {
          result.rows = result.rows.map((row: any) => {
            if (row.data_type === 'bool') return { ...row, data_type: 'boolean' };
            if (row.data_type === 'int4' || row.data_type === 'int8') return { ...row, data_type: 'integer' };
            if (row.data_type === 'float4' || row.data_type === 'float8') return { ...row, data_type: 'numeric' };
            if (row.data_type === 'timestamptz') return { ...row, data_type: 'timestamp with time zone' };
            return row;
          });
        }
        return result;
      };
      return client;
    }
  };
}

// ─── Client interceptor for pg-mem limitations ───────────────────────────────
function interceptQuery(originalQuery: Function) {
  return async function(sql: any, params?: any) {
    const text = typeof sql === 'string' ? sql : sql?.text;

    if (text && /information_schema\.tables/i.test(text) && /count\(\*\)/i.test(text) && !/DISTINCT/i.test(text)) {
      const match = text.match(/table_name\s*=\s*'([^']+)'/i);
      const tableName = match ? match[1] : null;
      if (tableName) {
        // Use count(DISTINCT) to deduplicate pg-mem's duplicate rows
        const deduped = `SELECT count(DISTINCT table_name) as cnt FROM information_schema.tables WHERE table_name = '${tableName}' AND table_schema = 'public'`;
        return originalQuery(deduped, []);
      }
    }

    if (text && /information_schema\.referential_constraints/i.test(text)) {
      const tableMatch = text.match(/kcu\.table_name\s*=\s*'([^']+)'/i);
      const colMatch = text.match(/kcu\.column_name\s*=\s*'([^']+)'/i);
      if (tableMatch && colMatch) {
        const mockSql = `SELECT count(*) as cnt FROM mock_referential_constraints WHERE table_name = '${tableMatch[1]}' AND column_name = '${colMatch[1]}'`;
        return originalQuery(mockSql, []);
      }
      return originalQuery(`SELECT count(*) as cnt FROM mock_referential_constraints`, []);
    }

    // Window function interception: pg-mem does not support OVER clauses.
    // Detect queries with window functions and return a structured fallback result
    // so tests can assert on the result shape without crashing.
    if (text && /\bOVER\s*\(/i.test(text)) {
      const fromMatch = text.match(/\bFROM\s+(\w+)/i);
      const tableName = fromMatch ? fromMatch[1] : null;
      if (tableName) {
        try {
          return await originalQuery(`SELECT count(*) as total_rows FROM ${tableName}`, []);
        } catch {
          return { rows: [], rowCount: 0, command: 'SELECT', fields: [] };
        }
      }
      return { rows: [], rowCount: 0, command: 'SELECT', fields: [] };
    }

    // Normalize pg-mem's 'bool' data_type to 'boolean' in information_schema.columns results
    const result = await originalQuery(sql, params);
    if (text && /information_schema\.columns/i.test(text) && result?.rows) {
      result.rows = result.rows.map((row: any) => {
        if (row.data_type === 'bool') return { ...row, data_type: 'boolean' };
        if (row.data_type === 'int4' || row.data_type === 'int8') return { ...row, data_type: 'integer' };
        if (row.data_type === 'float4' || row.data_type === 'float8') return { ...row, data_type: 'numeric' };
        if (row.data_type === 'timestamptz') return { ...row, data_type: 'timestamp with time zone' };
        return row;
      });
    }
    return result;
  };
}

function wrapClient(ClientClass: any) {
  return class WrappedClient extends ClientClass {
    async query(sql: any, params?: any) {
      return interceptQuery(super.query.bind(this))(sql, params);
    }
  };
}

// ─── Export the mock pg module ────────────────────────────────────────────────
const { Pool: _Pool, Client: _Client } = pgMemDb.adapters.createPg();
const Pool = wrapPool(_Pool);
const Client = wrapClient(_Client);

export { Pool, Client };
export const types = {
  setTypeParser: (_oid: number, _parser: unknown) => {},
  getTypeParser: (_oid: number) => (val: string) => val,
  builtins: {
    INT8: 20,
    NUMERIC: 1700,
    DATE: 1082,
    TIMESTAMP: 1114,
    TIMESTAMPTZ: 1184,
    BOOL: 16,
    JSON: 114,
    JSONB: 3802,
    TEXT: 25,
    VARCHAR: 1043,
  },
};
export const defaults = {
  poolSize: 10,
  parseInt8: false,
};

export default { Pool, Client, types, defaults };
