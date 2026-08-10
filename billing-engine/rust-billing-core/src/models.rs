use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Pricing model variant for a tenant.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PricingModel {
    PerTransaction,
    Subscription,
    Hybrid,
}

/// Billing configuration for a single tenant, loaded from PostgreSQL / Redis.
/// All fee amounts are in kobo (1 NGN = 100 kobo).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingConfig {
    pub tenant_id: Uuid,
    pub pricing_model: PricingModel,

    // Per-transaction fee schedule
    /// Fee rate as a decimal fraction, e.g. 0.015 = 1.5%
    pub fee_rate: Decimal,
    /// Maximum fee per transaction in kobo (e.g. 200_000 = ₦2,000)
    pub fee_cap_kobo: i64,
    /// Minimum fee per transaction in kobo (e.g. 5_000 = ₦50)
    pub fee_floor_kobo: i64,

    // Profit split
    /// Platform's share of net transaction revenue, e.g. 0.65 = 65%
    pub platform_share: Decimal,
    /// Reseller's share = 1 - platform_share
    pub reseller_share: Decimal,

    // Interchange / network cost
    /// NIBSS/bank cost per transaction in kobo (e.g. 2_500 = ₦25)
    pub interchange_cost_kobo: i64,

    // Sign-on fee (one-time at merchant activation)
    pub sign_on_fee_kobo: i64,
    pub sign_on_platform_share: Decimal,

    // Subscription (monthly flat fee per merchant)
    pub subscription_fee_kobo: i64,
    pub subscription_platform_share: Decimal,

    // TigerBeetle account IDs (u128 stored as strings for JSON compat)
    pub tb_merchant_payable_account: String,
    pub tb_platform_revenue_account: String,
    pub tb_reseller_payable_account: String,
    pub tb_interchange_cost_account: String,
    pub tb_sign_on_revenue_account: String,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub version: i32,
}

/// Incoming payment transaction event from Kafka.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionEvent {
    pub event_id: Uuid,
    pub tenant_id: Uuid,
    pub merchant_id: Uuid,
    pub reseller_id: Option<Uuid>,
    pub transaction_id: Uuid,
    /// Transaction amount in kobo
    pub amount_kobo: i64,
    pub currency: String,
    pub channel: TransactionChannel,
    pub status: TransactionStatus,
    pub occurred_at: DateTime<Utc>,
    /// Idempotency key — prevents double-billing on retry
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransactionChannel {
    Card,
    BankTransfer,
    Ussd,
    Pos,
    MobileMoney,
    PaymentLink,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransactionStatus {
    Completed,
    Reversed,
    Failed,
}

/// Result of billing computation for one transaction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingResult {
    pub billing_id: Uuid,
    pub event_id: Uuid,
    pub tenant_id: Uuid,
    pub merchant_id: Uuid,
    pub reseller_id: Option<Uuid>,
    pub transaction_id: Uuid,

    /// Gross transaction amount in kobo
    pub gross_amount_kobo: i64,
    /// Gross fee charged to merchant in kobo
    pub gross_fee_kobo: i64,
    /// Interchange/NIBSS cost in kobo
    pub interchange_cost_kobo: i64,
    /// Net fee after deducting interchange
    pub net_fee_kobo: i64,
    /// Platform's portion of net fee
    pub platform_revenue_kobo: i64,
    /// Reseller's portion of net fee
    pub reseller_revenue_kobo: i64,
    /// Amount credited to merchant (gross - gross_fee)
    pub merchant_settlement_kobo: i64,

    pub pricing_model: PricingModel,
    pub fee_rate_applied: Decimal,
    pub platform_share_applied: Decimal,
    pub config_version: i32,

    pub computed_at: DateTime<Utc>,
    pub ledger_transfers: Vec<LedgerTransfer>,
}

/// A single TigerBeetle double-entry transfer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerTransfer {
    /// TigerBeetle transfer ID (u128 as string)
    pub id: String,
    pub debit_account_id: String,
    pub credit_account_id: String,
    /// Amount in kobo
    pub amount: i64,
    pub ledger: u32,
    pub code: u16,
    pub flags: u16,
    pub pending_id: Option<String>,
    pub user_data_128: Option<String>,
    pub user_data_64: Option<u64>,
    pub user_data_32: Option<u32>,
    pub timeout: Option<u64>,
}

/// Sign-on fee billing event (separate from per-transaction).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignOnFeeEvent {
    pub event_id: Uuid,
    pub tenant_id: Uuid,
    pub merchant_id: Uuid,
    pub reseller_id: Option<Uuid>,
    pub sign_on_fee_kobo: i64,
    pub occurred_at: DateTime<Utc>,
    pub idempotency_key: String,
}

/// Subscription billing event (monthly, per merchant).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionBillingEvent {
    pub event_id: Uuid,
    pub tenant_id: Uuid,
    pub merchant_id: Uuid,
    pub billing_period_start: DateTime<Utc>,
    pub billing_period_end: DateTime<Utc>,
    pub subscription_fee_kobo: i64,
    pub occurred_at: DateTime<Utc>,
    pub idempotency_key: String,
}
