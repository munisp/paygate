use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Unified Mojaloop event enum for Fluvio topic fan-out.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "eventType", rename_all = "snake_case")]
pub enum MojaloopEvent {
    TransferCompleted(TransferCompletedEvent),
    TransferFailed(TransferFailedEvent),
    PartyFound(PartyFoundEvent),
    QuoteAccepted(QuoteAcceptedEvent),
}

impl MojaloopEvent {
    pub fn merchant_id(&self) -> &str {
        match self {
            MojaloopEvent::TransferCompleted(e) => &e.merchant_id,
            MojaloopEvent::TransferFailed(e) => &e.merchant_id,
            MojaloopEvent::PartyFound(e) => &e.merchant_id,
            MojaloopEvent::QuoteAccepted(e) => &e.merchant_id,
        }
    }

    pub fn event_type(&self) -> &'static str {
        match self {
            MojaloopEvent::TransferCompleted(_) => "mojaloop.transfer.completed",
            MojaloopEvent::TransferFailed(_) => "mojaloop.transfer.failed",
            MojaloopEvent::PartyFound(_) => "mojaloop.party.found",
            MojaloopEvent::QuoteAccepted(_) => "mojaloop.quote.accepted",
        }
    }
}

/// Published when the Mojaloop Hub confirms a transfer as COMMITTED.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferCompletedEvent {
    pub event_type: String,
    pub merchant_id: String,
    pub transfer_id: String,
    pub quote_id: String,
    pub transfer_state: String,
    pub fulfilment: Option<String>,
    pub amount: String,
    pub currency: String,
    pub payer_fsp_id: String,
    pub payee_fsp_id: String,
    pub timestamp: DateTime<Utc>,
}

/// Published when the Mojaloop Hub returns an error for a transfer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferFailedEvent {
    pub event_type: String,
    pub merchant_id: String,
    pub transfer_id: String,
    pub quote_id: String,
    pub error_code: String,
    pub error_description: String,
    pub timestamp: DateTime<Utc>,
}

/// Published when a party lookup returns a result from the Hub.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyFoundEvent {
    pub event_type: String,
    pub merchant_id: String,
    pub party_id_type: String,
    pub party_identifier: String,
    pub fsp_id: String,
    pub party_name: Option<String>,
    pub timestamp: DateTime<Utc>,
}

/// Published when a quote is accepted by the Hub.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteAcceptedEvent {
    pub event_type: String,
    pub merchant_id: String,
    pub quote_id: String,
    pub transfer_amount: String,
    pub currency: String,
    pub ilp_packet: String,
    pub condition: String,
    pub expiration: String,
    pub timestamp: DateTime<Utc>,
}

/// TigerBeetle settlement record derived from a completed transfer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TigerBeetleTransfer {
    /// Unique 128-bit ID (u128) — derived from transfer_id UUID
    pub id: u128,
    /// Debit account ID (payer ledger account)
    pub debit_account_id: u128,
    /// Credit account ID (payee ledger account)
    pub credit_account_id: u128,
    /// Amount in minor units (e.g. kobo for NGN)
    pub amount: u64,
    /// Ledger ID (ISO 4217 numeric: 566 for NGN, 840 for USD)
    pub ledger: u32,
    /// Transfer code (1 = mojaloop_transfer)
    pub code: u16,
    /// Flags (0 = none, 1 = linked, 2 = pending, 4 = post_pending_transfer)
    pub flags: u16,
    /// Timestamp (nanoseconds since epoch)
    pub timestamp: u64,
}

impl TigerBeetleTransfer {
    /// Build a TigerBeetle transfer record from a completed Mojaloop transfer event.
    pub fn from_completed(event: &TransferCompletedEvent) -> anyhow::Result<Self> {
        use std::str::FromStr;
        let id = uuid_to_u128(&event.transfer_id)?;
        let debit_account_id = fsp_to_account_id(&event.payer_fsp_id);
        let credit_account_id = fsp_to_account_id(&event.payee_fsp_id);
        let amount_f: f64 = f64::from_str(&event.amount)?;
        let amount = (amount_f * 100.0) as u64; // convert to minor units
        let ledger = currency_to_ledger(&event.currency);

        Ok(Self {
            id,
            debit_account_id,
            credit_account_id,
            amount,
            ledger,
            code: 1,  // mojaloop_transfer
            flags: 0,
            timestamp: chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0) as u64,
        })
    }
}

fn uuid_to_u128(uuid_str: &str) -> anyhow::Result<u128> {
    let cleaned = uuid_str.replace('-', "");
    u128::from_str_radix(&cleaned, 16)
        .map_err(|e| anyhow::anyhow!("invalid UUID {}: {}", uuid_str, e))
}

fn fsp_to_account_id(fsp_id: &str) -> u128 {
    // Deterministic account ID from FSP ID string (FNV-1a hash to u128)
    let mut hash: u128 = 0xcbf29ce484222325;
    for byte in fsp_id.bytes() {
        hash ^= byte as u128;
        hash = hash.wrapping_mul(0x00000100000001b3);
    }
    hash
}

fn currency_to_ledger(currency: &str) -> u32 {
    match currency {
        "NGN" => 566,
        "USD" => 840,
        "GHS" => 936,
        "KES" => 404,
        "ZAR" => 710,
        "UGX" => 800,
        "TZS" => 834,
        "XOF" => 952, // West African CFA
        _ => 0,
    }
}
