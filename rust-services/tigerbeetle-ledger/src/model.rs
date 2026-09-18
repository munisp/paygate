// TigerBeetle Cross-Border Ledger Service — data model shared by all backends.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub merchant_id: String,
    pub account_type: AccountType,
    pub ledger_code: u32,    // ISO 4217 numeric currency code
    pub currency: String,
    pub debits_posted: i64,
    pub credits_posted: i64,
    pub debits_pending: i64,
    pub credits_pending: i64,
    pub flags: u32,
    pub created_at: u64,
}

impl Account {
    pub fn balance(&self) -> i64 {
        self.credits_posted - self.debits_posted
    }

    pub fn available(&self) -> i64 {
        self.balance() - self.debits_pending
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AccountType {
    Merchant,
    Escrow,
    Fee,
    Settlement,
    Suspense,
    CrossBorderCips,
    CrossBorderUpi,
    CrossBorderPix,
    CrossBorderMojaloop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transfer {
    pub id: String,
    pub debit_account_id: String,
    pub credit_account_id: String,
    pub amount: i64,
    pub ledger_code: u32,
    pub currency: String,
    pub rail: String,
    pub transfer_type: TransferType,
    pub reference: String,
    pub merchant_id: String,
    pub flags: u32,
    pub timestamp: u64,
    pub settled_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransferType {
    CrossBorderDebit,
    CrossBorderCredit,
    FeeDebit,
    FxConversion,
    Settlement,
    Refund,
    Reversal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAccountRequest {
    pub merchant_id: String,
    pub account_type: AccountType,
    pub currency: String,
    pub ledger_code: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTransferRequest {
    pub debit_account_id: String,
    pub credit_account_id: String,
    pub amount: i64,
    pub currency: String,
    pub rail: String,
    pub transfer_type: TransferType,
    pub reference: String,
    pub merchant_id: String,
}

fn default_exchange_rate() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossBorderTransferRequest {
    pub transfer_id: String,
    pub merchant_id: String,
    pub amount: i64,
    // Tolerates legacy callers that send `currency` instead of `source_currency`.
    #[serde(default, alias = "currency")]
    pub source_currency: String,
    #[serde(default)]
    pub target_currency: String,
    #[serde(default = "default_exchange_rate")]
    pub exchange_rate: f64,
    #[serde(default)]
    pub fee_amount: i64,
    pub rail: String,          // cips | upi | pix | mojaloop | brics
    #[serde(default)]
    pub reference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceResponse {
    pub account_id: String,
    pub merchant_id: String,
    pub currency: String,
    pub balance: i64,
    pub debits_posted: i64,
    pub credits_posted: i64,
    pub pending_debits: i64,
    pub pending_credits: i64,
    pub available_balance: i64,
}

impl BalanceResponse {
    pub fn from_account(account: &Account) -> Self {
        BalanceResponse {
            account_id: account.id.clone(),
            merchant_id: account.merchant_id.clone(),
            currency: account.currency.clone(),
            balance: account.balance(),
            debits_posted: account.debits_posted,
            credits_posted: account.credits_posted,
            pending_debits: account.debits_pending,
            pending_credits: account.credits_pending,
            available_balance: account.available(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerStats {
    pub total_accounts: usize,
    pub total_transfers: usize,
    pub total_volume_by_rail: HashMap<String, i64>,
    pub total_fees_collected: i64,
    pub active_currencies: Vec<String>,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum StoreError {
    AccountNotFound { account_id: String, role: &'static str },
    InsufficientFunds { account_id: String, available: i64, requested: i64 },
    InvalidRequest(String),
    Backend(String),
}

// ─── Currency helpers ─────────────────────────────────────────────────────────

pub fn currency_to_ledger_code(currency: &str) -> u32 {
    match currency.to_uppercase().as_str() {
        "USD" => 840,
        "EUR" => 978,
        "CNY" => 156,
        "INR" => 356,
        "BRL" => 986,
        "NGN" => 566,
        "GBP" => 826,
        "JPY" => 392,
        "ZAR" => 710,
        "KES" => 404,
        "GHS" => 936,
        "XOF" => 952,
        _ => 0,
    }
}

pub fn now_nanos() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

// ─── Shared business logic ────────────────────────────────────────────────────

/// Resolved cross-border posting plan shared by all backends. Keeps the
/// double-entry semantics identical between Postgres and in-memory modes.
#[derive(Debug, Clone)]
pub struct CrossBorderPlan {
    pub escrow_id: String,
    pub settlement_id: String,
    pub fee_id: String,
    pub escrow_type: AccountType,
    pub settlement_currency: String,
    pub source_currency: String,
    pub target_amount: i64,
    pub total_debit: i64, // amount + fee, checked against escrow availability
    pub reference: String, // idempotency key (defaults to transfer_id)
    pub t1_id: String,
    pub t2_id: String,
}

pub fn plan_cross_border(req: &CrossBorderTransferRequest) -> Result<CrossBorderPlan, StoreError> {
    if req.amount <= 0 {
        return Err(StoreError::InvalidRequest("amount must be positive".into()));
    }
    if req.fee_amount < 0 {
        return Err(StoreError::InvalidRequest("fee_amount must not be negative".into()));
    }
    if req.exchange_rate <= 0.0 || !req.exchange_rate.is_finite() {
        return Err(StoreError::InvalidRequest("exchange_rate must be positive and finite".into()));
    }
    if req.merchant_id.is_empty() {
        return Err(StoreError::InvalidRequest("merchant_id is required".into()));
    }
    if req.transfer_id.is_empty() {
        return Err(StoreError::InvalidRequest("transfer_id is required".into()));
    }

    let source_currency = if req.source_currency.is_empty() {
        return Err(StoreError::InvalidRequest("source_currency is required".into()));
    } else {
        req.source_currency.to_uppercase()
    };
    let target_currency = if req.target_currency.is_empty() {
        source_currency.clone()
    } else {
        req.target_currency.to_uppercase()
    };
    let reference = if req.reference.is_empty() {
        req.transfer_id.clone()
    } else {
        req.reference.clone()
    };

    let escrow_id = format!("escrow-{}-{}", req.merchant_id, source_currency.to_lowercase());
    let settlement_id = format!(
        "settlement-{}-{}-{}",
        req.merchant_id,
        req.rail,
        target_currency.to_lowercase()
    );
    let fee_id = format!("fee-{}-{}", req.merchant_id, source_currency.to_lowercase());

    let target_amount = (req.amount as f64 * req.exchange_rate) as i64;
    let total_debit = req
        .amount
        .checked_add(req.fee_amount)
        .ok_or_else(|| StoreError::InvalidRequest("amount + fee overflow".into()))?;

    Ok(CrossBorderPlan {
        escrow_id,
        settlement_id,
        fee_id,
        escrow_type: AccountType::Escrow,
        settlement_currency: target_currency,
        source_currency,
        target_amount,
        total_debit,
        reference,
        t1_id: format!("tb-{}-debit", req.transfer_id),
        t2_id: format!("tb-{}-fee", req.transfer_id),
    })
}

pub fn validate_transfer_request(req: &CreateTransferRequest) -> Result<(), StoreError> {
    if req.amount <= 0 {
        return Err(StoreError::InvalidRequest("amount must be positive".into()));
    }
    if req.reference.is_empty() {
        return Err(StoreError::InvalidRequest("reference is required for idempotency".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crossborder_accepts_legacy_currency_field_and_defaults() {
        // Temporal workflows post {transfer_id, merchant_id, amount, currency, rail, status}.
        let req: CrossBorderTransferRequest = serde_json::from_str(
            r#"{"transfer_id":"t-9","merchant_id":"m-1","amount":5000,"currency":"usd","rail":"cips","status":"settled"}"#,
        )
        .unwrap();
        assert_eq!(req.source_currency, "usd");
        assert_eq!(req.exchange_rate, 1.0);
        assert_eq!(req.fee_amount, 0);

        let plan = plan_cross_border(&req).unwrap();
        assert_eq!(plan.source_currency, "USD");
        assert_eq!(plan.settlement_currency, "USD");
        assert_eq!(plan.reference, "t-9");
        assert_eq!(plan.total_debit, 5000);
        assert_eq!(plan.t1_id, "tb-t-9-debit");
        assert_eq!(plan.t2_id, "tb-t-9-fee");
    }

    #[test]
    fn crossborder_rejects_bad_input() {
        let base = CrossBorderTransferRequest {
            transfer_id: "t".into(),
            merchant_id: "m".into(),
            amount: 1,
            source_currency: "USD".into(),
            target_currency: "".into(),
            exchange_rate: 1.0,
            fee_amount: 0,
            rail: "cips".into(),
            reference: "".into(),
        };
        let mut r = base.clone();
        r.amount = 0;
        assert!(matches!(
            plan_cross_border(&r),
            Err(StoreError::InvalidRequest(_))
        ));
        let mut r = base.clone();
        r.exchange_rate = -1.0;
        assert!(matches!(
            plan_cross_border(&r),
            Err(StoreError::InvalidRequest(_))
        ));
        let mut r = base.clone();
        r.source_currency = "".into();
        assert!(matches!(
            plan_cross_border(&r),
            Err(StoreError::InvalidRequest(_))
        ));
        let mut r = base;
        r.fee_amount = -5;
        assert!(matches!(
            plan_cross_border(&r),
            Err(StoreError::InvalidRequest(_))
        ));
    }
}
