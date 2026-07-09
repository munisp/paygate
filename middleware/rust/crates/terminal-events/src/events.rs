// events.rs — Canonical terminal event types for serde/bincode serialisation.
//
// These types mirror the Go TerminalEvent struct and are the single source
// of truth for the Fluvio schema. Both the Go producer and Rust consumer
// must agree on this shape.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ─── Event type enum ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalEventType {
    Provisioned,
    Activated,
    Heartbeat,
    TxnCompleted,
    TxnFailed,
    Refunded,
    Voided,
    StatusChanged,
}

// ─── Payload variants ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvisionedPayload {
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub firmware_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip_address: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxnPayload {
    pub transaction_id: String,
    pub reference: String,
    /// "sale" | "refund" | "void" | "pre_auth"
    pub r#type: String,
    pub payment_method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_brand: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_last4: Option<String>,
    /// Amount in kobo (smallest currency unit)
    pub amount_kobo: i64,
    pub currency: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rrn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefundPayload {
    pub refund_id: String,
    pub original_txn_id: String,
    pub amount_kobo: i64,
    pub currency: String,
    pub reference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusChangePayload {
    pub old_status: String,
    pub new_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

// ─── Payload enum ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TerminalPayload {
    Provisioned(ProvisionedPayload),
    Heartbeat(HeartbeatPayload),
    Transaction(TxnPayload),
    Refund(RefundPayload),
    StatusChange(StatusChangePayload),
    Raw(serde_json::Value),
}

// ─── Root event envelope ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalEvent {
    pub event_id: String,
    pub event_type: TerminalEventType,
    pub terminal_id: String,
    pub serial_number: String,
    pub merchant_id: String,
    pub tenant_id: String,
    pub timestamp: DateTime<Utc>,
    pub payload: TerminalPayload,
}

impl TerminalEvent {
    /// Create a new event with a generated event_id and current timestamp.
    pub fn new(
        event_type: TerminalEventType,
        terminal_id: impl Into<String>,
        serial_number: impl Into<String>,
        merchant_id: impl Into<String>,
        tenant_id: impl Into<String>,
        payload: TerminalPayload,
    ) -> Self {
        Self {
            event_id: format!("tevt_{}", Uuid::new_v4().simple()),
            event_type,
            terminal_id: terminal_id.into(),
            serial_number: serial_number.into(),
            merchant_id: merchant_id.into(),
            tenant_id: tenant_id.into(),
            timestamp: Utc::now(),
            payload,
        }
    }

    /// Serialise to JSON bytes (for Fluvio produce).
    pub fn to_json_bytes(&self) -> anyhow::Result<Vec<u8>> {
        Ok(serde_json::to_vec(self)?)
    }

    /// Serialise to compact bincode bytes (for internal bus).
    pub fn to_bincode_bytes(&self) -> anyhow::Result<Vec<u8>> {
        Ok(bincode::serde::encode_to_vec(self, bincode::config::standard())?)
    }

    /// Deserialise from JSON bytes (from Fluvio consume).
    pub fn from_json_bytes(bytes: &[u8]) -> anyhow::Result<Self> {
        Ok(serde_json::from_slice(bytes)?)
    }

    /// Returns true if this event represents a completed (approved) transaction.
    pub fn is_completed_txn(&self) -> bool {
        self.event_type == TerminalEventType::TxnCompleted
    }

    /// Returns the transaction amount in kobo if this is a transaction event.
    pub fn txn_amount_kobo(&self) -> Option<i64> {
        match &self.payload {
            TerminalPayload::Transaction(p) => Some(p.amount_kobo),
            TerminalPayload::Refund(p) => Some(-p.amount_kobo),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_json() {
        let event = TerminalEvent::new(
            TerminalEventType::TxnCompleted,
            "term_01",
            "SN123456",
            "merch_01",
            "tenant_01",
            TerminalPayload::Transaction(TxnPayload {
                transaction_id: "txn_abc".into(),
                reference: "ref_xyz".into(),
                r#type: "sale".into(),
                payment_method: "card".into(),
                card_brand: Some("Visa".into()),
                card_last4: Some("4242".into()),
                amount_kobo: 500_000,
                currency: "NGN".into(),
                auth_code: Some("AUTH123".into()),
                rrn: None,
                response_code: Some("00".into()),
            }),
        );

        let bytes = event.to_json_bytes().unwrap();
        let decoded = TerminalEvent::from_json_bytes(&bytes).unwrap();
        assert_eq!(decoded.event_id, event.event_id);
        assert_eq!(decoded.txn_amount_kobo(), Some(500_000));
        assert!(decoded.is_completed_txn());
    }

    #[test]
    fn roundtrip_bincode() {
        let event = TerminalEvent::new(
            TerminalEventType::Heartbeat,
            "term_02",
            "SN654321",
            "merch_02",
            "tenant_01",
            TerminalPayload::Heartbeat(HeartbeatPayload {
                firmware_version: Some("v2.1.0".into()),
                ip_address: Some("192.168.1.10".into()),
                status: "active".into(),
            }),
        );

        let bytes = event.to_bincode_bytes().unwrap();
        let (decoded, _): (TerminalEvent, _) =
            bincode::serde::decode_from_slice(&bytes, bincode::config::standard()).unwrap();
        assert_eq!(decoded.terminal_id, "term_02");
    }
}
