// tigerbeetle.rs — TigerBeetle double-entry settlement for terminal transactions.
//
// On every txn_completed event, this module posts two transfers:
//   1. DEBIT  merchant_float_account  (funds leave merchant float)
//   2. CREDIT paygate_settlement_pool (funds enter settlement pool)
//
// On refund events, the entries are reversed.
//
// Account ID scheme (128-bit):
//   merchant float:    0x0001_<merchant_id_hash>
//   settlement pool:   0x0002_<merchant_id_hash>
//   interchange fees:  0x0003_<merchant_id_hash>
//   paygate revenue:   0x0004_0000000000000000

use crate::events::{TerminalEvent, TerminalEventType, TerminalPayload};
use crate::error::TerminalError;
use std::env;
use tracing::{error, info};

// ─── TigerBeetle account ID helpers ──────────────────────────────────────────

/// Deterministically derive a 128-bit TigerBeetle account ID from a string ID.
/// Uses a simple FNV-1a hash to produce a stable u128.
fn derive_account_id(prefix: u64, id: &str) -> u128 {
    let hash = fnv1a_64(id.as_bytes());
    ((prefix as u128) << 64) | (hash as u128)
}

fn fnv1a_64(data: &[u8]) -> u64 {
    const FNV_OFFSET: u64 = 14695981039346656037;
    const FNV_PRIME: u64 = 1099511628211;
    let mut hash = FNV_OFFSET;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

pub fn merchant_float_account_id(merchant_id: &str) -> u128 {
    derive_account_id(0x0001, merchant_id)
}

pub fn settlement_pool_account_id(merchant_id: &str) -> u128 {
    derive_account_id(0x0002, merchant_id)
}

pub fn interchange_account_id(merchant_id: &str) -> u128 {
    derive_account_id(0x0003, merchant_id)
}

pub const PAYGATE_REVENUE_ACCOUNT_ID: u128 = 0x0004_0000_0000_0000_0000_0000_0000_0000;

// ─── Transfer request ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TransferRequest {
    pub id: u128,
    pub debit_account_id: u128,
    pub credit_account_id: u128,
    pub amount: u128,
    pub ledger: u32,
    pub code: u16,
    pub user_data_128: u128,
    pub user_data_64: u64,
    pub user_data_32: u32,
    pub flags: u16,
}

// ─── Settler ──────────────────────────────────────────────────────────────────

/// TigerBeetleSettler posts double-entry transfers for terminal transactions.
/// It connects to TigerBeetle via the HTTP bridge (tigerbeetle-http-proxy).
pub struct TigerBeetleSettler {
    bridge_url: String,
    http: reqwest::Client,
}

impl TigerBeetleSettler {
    pub fn new() -> Self {
        let bridge_url = env::var("MIDDLEWARE_BRIDGE_URL")
            .unwrap_or_else(|_| "http://localhost:8080".to_string());
        Self {
            bridge_url,
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap(),
        }
    }

    /// Settle a completed terminal transaction.
    /// Posts:
    ///   DEBIT  merchant_float → CREDIT settlement_pool  (principal)
    ///   DEBIT  settlement_pool → CREDIT interchange_account  (interchange fee, ~1.5%)
    pub async fn settle_transaction(&self, event: &TerminalEvent) -> Result<(), TerminalError> {
        let (txn_id, amount_kobo, currency) = match &event.payload {
            TerminalPayload::Transaction(p) if event.event_type == TerminalEventType::TxnCompleted => {
                (p.transaction_id.clone(), p.amount_kobo, p.currency.clone())
            }
            _ => return Ok(()), // Not a completed transaction
        };

        let merchant_id = &event.merchant_id;
        let ledger: u32 = if currency == "NGN" { 1 } else { 2 };

        // Transfer 1: merchant float → settlement pool (full amount)
        let transfer_id = derive_transfer_id(&txn_id, 1);
        let principal_transfer = serde_json::json!({
            "id": transfer_id.to_string(),
            "debit_account_id": merchant_float_account_id(merchant_id).to_string(),
            "credit_account_id": settlement_pool_account_id(merchant_id).to_string(),
            "amount": amount_kobo.unsigned_abs(),
            "ledger": ledger,
            "code": 1001u16, // terminal_sale
            "user_data_128": derive_account_id(0, &txn_id).to_string(),
            "flags": 0u16,
        });

        // Transfer 2: settlement pool → interchange account (1.5% interchange fee)
        let interchange_fee = (amount_kobo.unsigned_abs() * 15) / 1000;
        let fee_transfer_id = derive_transfer_id(&txn_id, 2);
        let fee_transfer = serde_json::json!({
            "id": fee_transfer_id.to_string(),
            "debit_account_id": settlement_pool_account_id(merchant_id).to_string(),
            "credit_account_id": interchange_account_id(merchant_id).to_string(),
            "amount": interchange_fee,
            "ledger": ledger,
            "code": 1002u16, // interchange_fee
            "user_data_128": derive_account_id(0, &txn_id).to_string(),
            "flags": 0u16,
        });

        let body = serde_json::json!({
            "transfers": [principal_transfer, fee_transfer]
        });

        let url = format!("{}/tigerbeetle/transfers", self.bridge_url);
        match self.http.post(&url).json(&body).send().await {
            Ok(resp) if resp.status().is_success() => {
                info!(
                    "TigerBeetle: settled txn={} amount={} currency={}",
                    txn_id, amount_kobo, currency
                );
                Ok(())
            }
            Ok(resp) => {
                error!("TigerBeetle: settlement failed status={}", resp.status());
                Err(TerminalError::Settlement(format!(
                    "HTTP {} for txn {}",
                    resp.status(),
                    txn_id
                )))
            }
            Err(e) => {
                error!("TigerBeetle: request failed: {:?}", e);
                Err(TerminalError::Settlement(e.to_string()))
            }
        }
    }

    /// Reverse a settlement for a refund event.
    pub async fn reverse_settlement(&self, event: &TerminalEvent) -> Result<(), TerminalError> {
        let (refund_id, original_txn_id, amount_kobo, currency) = match &event.payload {
            TerminalPayload::Refund(p) if event.event_type == TerminalEventType::Refunded => {
                (p.refund_id.clone(), p.original_txn_id.clone(), p.amount_kobo, p.currency.clone())
            }
            _ => return Ok(()),
        };

        let merchant_id = &event.merchant_id;
        let ledger: u32 = if currency == "NGN" { 1 } else { 2 };

        // Reverse: settlement pool → merchant float (refund principal)
        let transfer_id = derive_transfer_id(&refund_id, 1);
        let refund_transfer = serde_json::json!({
            "id": transfer_id.to_string(),
            "debit_account_id": settlement_pool_account_id(merchant_id).to_string(),
            "credit_account_id": merchant_float_account_id(merchant_id).to_string(),
            "amount": amount_kobo.unsigned_abs(),
            "ledger": ledger,
            "code": 1003u16, // terminal_refund
            "user_data_128": derive_account_id(0, &original_txn_id).to_string(),
            "flags": 0u16,
        });

        let body = serde_json::json!({ "transfers": [refund_transfer] });
        let url = format!("{}/tigerbeetle/transfers", self.bridge_url);

        self.http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| TerminalError::Settlement(e.to_string()))?;

        info!("TigerBeetle: reversed refund={} original={}", refund_id, original_txn_id);
        Ok(())
    }
}

fn derive_transfer_id(reference: &str, seq: u8) -> u128 {
    let combined = format!("{}:{}", reference, seq);
    derive_account_id(0xFFFF, &combined)
}

impl Default for TigerBeetleSettler {
    fn default() -> Self {
        Self::new()
    }
}
