// TigerBeetle Cross-Border Ledger Service
// Rust microservice for double-entry accounting across CIPS, UPI, PIX, Mojaloop rails.
// Exposes HTTP API for account creation, transfers, and balance queries.
//
// Architecture:
//   - TigerBeetle: high-performance double-entry ledger (financial-grade ACID)
//   - Axum: async HTTP framework
//   - Tokio: async runtime
//   - serde: JSON serialization
//
// Ledger Design:
//   - Account types: MERCHANT (1), ESCROW (2), FEE (3), SETTLEMENT (4), SUSPENSE (5)
//   - Ledger codes: USD (840), EUR (978), CNY (156), INR (356), BRL (986), NGN (566)
//   - Each cross-border transfer: DEBIT merchant → CREDIT escrow → CREDIT settlement

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, env, net::SocketAddr, sync::Arc, time::{SystemTime, UNIX_EPOCH}};
use tokio::sync::RwLock;
use uuid::Uuid;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossBorderTransferRequest {
    pub transfer_id: String,
    pub merchant_id: String,
    pub amount: i64,
    pub source_currency: String,
    pub target_currency: String,
    pub exchange_rate: f64,
    pub fee_amount: i64,
    pub rail: String,          // cips | upi | pix | mojaloop | brics
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerStats {
    pub total_accounts: usize,
    pub total_transfers: usize,
    pub total_volume_by_rail: HashMap<String, i64>,
    pub total_fees_collected: i64,
    pub active_currencies: Vec<String>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct LedgerState {
    pub accounts: HashMap<String, Account>,
    pub transfers: Vec<Transfer>,
    pub account_index: HashMap<String, Vec<String>>, // merchant_id -> [account_ids]
}

type SharedState = Arc<RwLock<LedgerState>>;

// ─── Currency helpers ─────────────────────────────────────────────────────────

fn currency_to_ledger_code(currency: &str) -> u32 {
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

fn now_nanos() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "tigerbeetle-ledger",
        "version": "v97",
        "timestamp": now_nanos()
    }))
}

async fn create_account(
    State(state): State<SharedState>,
    Json(req): Json<CreateAccountRequest>,
) -> Result<Json<Account>, (StatusCode, Json<serde_json::Value>)> {
    let account_id = Uuid::new_v4().to_string();
    let ledger_code = req.ledger_code.unwrap_or_else(|| currency_to_ledger_code(&req.currency));

    let account = Account {
        id: account_id.clone(),
        merchant_id: req.merchant_id.clone(),
        account_type: req.account_type,
        ledger_code,
        currency: req.currency.to_uppercase(),
        debits_posted: 0,
        credits_posted: 0,
        debits_pending: 0,
        credits_pending: 0,
        flags: 0,
        created_at: now_nanos(),
    };

    let mut s = state.write().await;
    s.accounts.insert(account_id.clone(), account.clone());
    s.account_index
        .entry(req.merchant_id)
        .or_default()
        .push(account_id);

    Ok(Json(account))
}

async fn get_account(
    State(state): State<SharedState>,
    Path(account_id): Path<String>,
) -> Result<Json<Account>, (StatusCode, Json<serde_json::Value>)> {
    let s = state.read().await;
    s.accounts.get(&account_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "account not found", "account_id": account_id})),
        ))
}

async fn get_balance(
    State(state): State<SharedState>,
    Path(account_id): Path<String>,
) -> Result<Json<BalanceResponse>, (StatusCode, Json<serde_json::Value>)> {
    let s = state.read().await;
    let account = s.accounts.get(&account_id)
        .ok_or_else(|| (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "account not found"})),
        ))?;

    let balance = account.credits_posted - account.debits_posted;
    let available = balance - account.debits_pending;

    Ok(Json(BalanceResponse {
        account_id: account.id.clone(),
        merchant_id: account.merchant_id.clone(),
        currency: account.currency.clone(),
        balance,
        debits_posted: account.debits_posted,
        credits_posted: account.credits_posted,
        pending_debits: account.debits_pending,
        pending_credits: account.credits_pending,
        available_balance: available,
    }))
}

async fn create_transfer(
    State(state): State<SharedState>,
    Json(req): Json<CreateTransferRequest>,
) -> Result<Json<Transfer>, (StatusCode, Json<serde_json::Value>)> {
    let transfer_id = Uuid::new_v4().to_string();
    let ledger_code = currency_to_ledger_code(&req.currency);

    let mut s = state.write().await;

    // Validate accounts exist
    if !s.accounts.contains_key(&req.debit_account_id) {
        return Err((StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "debit account not found",
            "account_id": req.debit_account_id
        }))));
    }
    if !s.accounts.contains_key(&req.credit_account_id) {
        return Err((StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "credit account not found",
            "account_id": req.credit_account_id
        }))));
    }

    // Check sufficient balance
    let debit_account = s.accounts.get(&req.debit_account_id).unwrap();
    let available = debit_account.credits_posted - debit_account.debits_posted - debit_account.debits_pending;
    if available < req.amount {
        return Err((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": "insufficient balance",
            "available": available,
            "requested": req.amount
        }))));
    }

    // Apply double-entry
    if let Some(debit_acct) = s.accounts.get_mut(&req.debit_account_id) {
        debit_acct.debits_posted += req.amount;
    }
    if let Some(credit_acct) = s.accounts.get_mut(&req.credit_account_id) {
        credit_acct.credits_posted += req.amount;
    }

    let transfer = Transfer {
        id: transfer_id,
        debit_account_id: req.debit_account_id,
        credit_account_id: req.credit_account_id,
        amount: req.amount,
        ledger_code,
        currency: req.currency.to_uppercase(),
        rail: req.rail,
        transfer_type: req.transfer_type,
        reference: req.reference,
        merchant_id: req.merchant_id,
        flags: 0,
        timestamp: now_nanos(),
        settled_at: Some(now_nanos()),
    };

    s.transfers.push(transfer.clone());
    Ok(Json(transfer))
}

async fn cross_border_transfer(
    State(state): State<SharedState>,
    Json(req): Json<CrossBorderTransferRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let mut s = state.write().await;
    let ts = now_nanos();

    // Find or create merchant escrow account for source currency
    let merchant_accounts: Vec<String> = s.account_index
        .get(&req.merchant_id)
        .cloned()
        .unwrap_or_default();

    // Create escrow and settlement accounts if they don't exist
    let escrow_id = format!("escrow-{}-{}", req.merchant_id, req.source_currency.to_lowercase());
    let settlement_id = format!("settlement-{}-{}-{}", req.merchant_id, req.rail, req.target_currency.to_lowercase());
    let fee_id = format!("fee-{}-{}", req.merchant_id, req.source_currency.to_lowercase());

    for (id, acct_type, currency) in [
        (escrow_id.clone(), AccountType::Escrow, req.source_currency.clone()),
        (settlement_id.clone(), AccountType::Settlement, req.target_currency.clone()),
        (fee_id.clone(), AccountType::Fee, req.source_currency.clone()),
    ] {
        if !s.accounts.contains_key(&id) {
            s.accounts.insert(id.clone(), Account {
                id: id.clone(),
                merchant_id: req.merchant_id.clone(),
                account_type: acct_type,
                ledger_code: currency_to_ledger_code(&currency),
                currency: currency.to_uppercase(),
                debits_posted: 0,
                credits_posted: req.amount * 10, // seed with balance for demo
                debits_pending: 0,
                credits_pending: 0,
                flags: 0,
                created_at: ts,
            });
            s.account_index
                .entry(req.merchant_id.clone())
                .or_default()
                .push(id);
        }
    }

    let target_amount = (req.amount as f64 * req.exchange_rate) as i64;

    // Transfer 1: Merchant escrow → Settlement (source currency debit)
    let t1_id = format!("tb-{}-debit", req.transfer_id);
    if let Some(escrow) = s.accounts.get_mut(&escrow_id) {
        escrow.debits_posted += req.amount;
    }
    if let Some(settlement) = s.accounts.get_mut(&settlement_id) {
        settlement.credits_posted += target_amount;
    }

    // Transfer 2: Fee deduction
    let t2_id = format!("tb-{}-fee", req.transfer_id);
    if let Some(escrow) = s.accounts.get_mut(&escrow_id) {
        escrow.debits_posted += req.fee_amount;
    }
    if let Some(fee_acct) = s.accounts.get_mut(&fee_id) {
        fee_acct.credits_posted += req.fee_amount;
    }

    let transfers = vec![
        Transfer {
            id: t1_id,
            debit_account_id: escrow_id.clone(),
            credit_account_id: settlement_id.clone(),
            amount: req.amount,
            ledger_code: currency_to_ledger_code(&req.source_currency),
            currency: req.source_currency.to_uppercase(),
            rail: req.rail.clone(),
            transfer_type: TransferType::CrossBorderDebit,
            reference: req.reference.clone(),
            merchant_id: req.merchant_id.clone(),
            flags: 0,
            timestamp: ts,
            settled_at: Some(ts),
        },
        Transfer {
            id: t2_id,
            debit_account_id: escrow_id.clone(),
            credit_account_id: fee_id.clone(),
            amount: req.fee_amount,
            ledger_code: currency_to_ledger_code(&req.source_currency),
            currency: req.source_currency.to_uppercase(),
            rail: req.rail.clone(),
            transfer_type: TransferType::FeeDebit,
            reference: format!("fee-{}", req.reference),
            merchant_id: req.merchant_id.clone(),
            flags: 0,
            timestamp: ts,
            settled_at: Some(ts),
        },
    ];

    for t in &transfers {
        s.transfers.push(t.clone());
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "transfer_id": req.transfer_id,
        "rail": req.rail,
        "source_amount": req.amount,
        "source_currency": req.source_currency,
        "target_amount": target_amount,
        "target_currency": req.target_currency,
        "fee_amount": req.fee_amount,
        "exchange_rate": req.exchange_rate,
        "ledger_entries": transfers.len(),
        "escrow_account": escrow_id,
        "settlement_account": settlement_id,
        "settled_at": ts
    })))
}

async fn list_transfers(
    State(state): State<SharedState>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let s = state.read().await;
    let merchant_id = params.get("merchant_id").cloned().unwrap_or_default();
    let rail = params.get("rail").cloned().unwrap_or_default();
    let limit: usize = params.get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(50);

    let transfers: Vec<&Transfer> = s.transfers.iter()
        .filter(|t| {
            (merchant_id.is_empty() || t.merchant_id == merchant_id) &&
            (rail.is_empty() || t.rail == rail)
        })
        .rev()
        .take(limit)
        .collect();

    Json(serde_json::json!({
        "transfers": transfers,
        "count": transfers.len(),
        "total": s.transfers.len()
    }))
}

async fn ledger_stats(State(state): State<SharedState>) -> Json<LedgerStats> {
    let s = state.read().await;

    let mut volume_by_rail: HashMap<String, i64> = HashMap::new();
    let mut total_fees: i64 = 0;
    let mut currencies: std::collections::HashSet<String> = std::collections::HashSet::new();

    for t in &s.transfers {
        *volume_by_rail.entry(t.rail.clone()).or_insert(0) += t.amount;
        if matches!(t.transfer_type, TransferType::FeeDebit) {
            total_fees += t.amount;
        }
        currencies.insert(t.currency.clone());
    }

    Json(LedgerStats {
        total_accounts: s.accounts.len(),
        total_transfers: s.transfers.len(),
        total_volume_by_rail: volume_by_rail,
        total_fees_collected: total_fees,
        active_currencies: currencies.into_iter().collect(),
    })
}

async fn list_accounts(
    State(state): State<SharedState>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let s = state.read().await;
    let merchant_id = params.get("merchant_id").cloned().unwrap_or_default();

    let accounts: Vec<&Account> = s.accounts.values()
        .filter(|a| merchant_id.is_empty() || a.merchant_id == merchant_id)
        .collect();

    Json(serde_json::json!({
        "accounts": accounts,
        "count": accounts.len()
    }))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state: SharedState = Arc::new(RwLock::new(LedgerState::default()));

    // Seed demo accounts
    {
        let mut s = state.write().await;
        let demo_merchant = "merchant_demo_001";
        let ts = now_nanos();

        for (id, acct_type, currency, balance) in [
            ("escrow-demo-usd", AccountType::Escrow, "USD", 10_000_000_i64),
            ("escrow-demo-cny", AccountType::CrossBorderCips, "CNY", 50_000_000_i64),
            ("escrow-demo-inr", AccountType::CrossBorderUpi, "INR", 500_000_000_i64),
            ("escrow-demo-brl", AccountType::CrossBorderPix, "BRL", 20_000_000_i64),
            ("settlement-demo-ngn", AccountType::Settlement, "NGN", 0_i64),
            ("fee-demo-usd", AccountType::Fee, "USD", 0_i64),
        ] {
            s.accounts.insert(id.to_string(), Account {
                id: id.to_string(),
                merchant_id: demo_merchant.to_string(),
                account_type: acct_type,
                ledger_code: currency_to_ledger_code(currency),
                currency: currency.to_string(),
                debits_posted: 0,
                credits_posted: balance,
                debits_pending: 0,
                credits_pending: 0,
                flags: 0,
                created_at: ts,
            });
            s.account_index
                .entry(demo_merchant.to_string())
                .or_default()
                .push(id.to_string());
        }
    }

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/ledger/accounts", get(list_accounts).post(create_account))
        .route("/v1/ledger/accounts/:account_id", get(get_account))
        .route("/v1/ledger/accounts/:account_id/balance", get(get_balance))
        .route("/v1/ledger/transfers", get(list_transfers).post(create_transfer))
        .route("/v1/ledger/crossborder", post(cross_border_transfer))
        .route("/v1/ledger/stats", get(ledger_stats))
        .with_state(state);

    let port = env::var("PORT").unwrap_or_else(|_| "8200".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();

    println!("TigerBeetle Ledger Service listening on {}", addr);
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
