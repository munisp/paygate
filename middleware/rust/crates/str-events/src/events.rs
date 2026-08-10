// middleware/rust/crates/str-events/src/events.rs
// STR and MoMo event types with serde + bincode serialisation.

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// ─── STR Events ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StrEventType {
    StrDrafted,
    StrSubmitted,
    StrAcknowledged,
    StrRejected,
    StrRetried,
    StrEscalated,
    StrOverdue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrEvent {
    pub event_type: StrEventType,
    pub str_id: String,
    pub merchant_id: String,
    pub tenant_id: String,
    pub report_ref: String,
    pub nfiu_ref: Option<String>,
    pub suspicion_type: String,
    /// Amount in kobo (minor currency unit)
    pub amount_kobo: Option<i64>,
    pub currency: String,
    pub customer_name: Option<String>,
    pub customer_account: Option<String>,
    pub narrative: String,
    pub submission_status: String,
    pub due_at: Option<DateTime<Utc>>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub acknowledged_at: Option<DateTime<Utc>>,
    pub timestamp: DateTime<Utc>,
    /// Fluvio topic this event should be published to
    #[serde(skip)]
    pub topic: String,
}

impl StrEvent {
    pub fn new(
        event_type: StrEventType,
        str_id: impl Into<String>,
        merchant_id: impl Into<String>,
        tenant_id: impl Into<String>,
        report_ref: impl Into<String>,
        suspicion_type: impl Into<String>,
        narrative: impl Into<String>,
        submission_status: impl Into<String>,
    ) -> Self {
        Self {
            event_type,
            str_id: str_id.into(),
            merchant_id: merchant_id.into(),
            tenant_id: tenant_id.into(),
            report_ref: report_ref.into(),
            nfiu_ref: None,
            suspicion_type: suspicion_type.into(),
            amount_kobo: None,
            currency: "NGN".to_string(),
            customer_name: None,
            customer_account: None,
            narrative: narrative.into(),
            submission_status: submission_status.into(),
            due_at: None,
            submitted_at: None,
            acknowledged_at: None,
            timestamp: Utc::now(),
            topic: "paygate.str.events".to_string(),
        }
    }

    /// Serialise to JSON bytes for Fluvio
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, serde_json::Error> {
        serde_json::to_vec(self)
    }

    /// Serialise to compact bincode bytes for inter-service transport
    pub fn to_bincode_bytes(&self) -> Result<Vec<u8>, bincode::Error> {
        bincode::serialize(self)
    }

    /// Deserialise from bincode bytes
    pub fn from_bincode_bytes(bytes: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(bytes)
    }

    /// Validate required fields
    pub fn validate(&self) -> Result<(), crate::error::StrEventError> {
        if self.str_id.is_empty() {
            return Err(crate::error::StrEventError::ValidationError("str_id is required".into()));
        }
        if self.merchant_id.is_empty() {
            return Err(crate::error::StrEventError::ValidationError("merchant_id is required".into()));
        }
        if self.narrative.is_empty() {
            return Err(crate::error::StrEventError::ValidationError("narrative is required".into()));
        }
        Ok(())
    }
}

// ─── MoMo Events ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MoMoEventType {
    WebhookReceived,
    PaymentCompleted,
    PaymentFailed,
    PaymentPending,
    DisbursementCompleted,
    DisbursementFailed,
    RefundInitiated,
    RefundCompleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoMoEvent {
    pub event_type: MoMoEventType,
    pub provider: String,
    pub external_ref: String,
    pub internal_ref: Option<String>,
    pub merchant_id: String,
    pub status: String,
    /// Amount in minor currency unit (kobo, pesewas, etc.)
    pub amount_minor: i64,
    pub currency: String,
    pub phone_number: Option<String>,
    pub financial_txn_id: Option<String>,
    pub reason: Option<String>,
    pub timestamp: DateTime<Utc>,
    #[serde(skip)]
    pub topic: String,
}

impl MoMoEvent {
    pub fn new(
        event_type: MoMoEventType,
        provider: impl Into<String>,
        external_ref: impl Into<String>,
        merchant_id: impl Into<String>,
        status: impl Into<String>,
        amount_minor: i64,
        currency: impl Into<String>,
    ) -> Self {
        let provider_str = provider.into();
        let topic = format!("paygate.momo.{}.events", provider_str);
        Self {
            event_type,
            provider: provider_str,
            external_ref: external_ref.into(),
            internal_ref: None,
            merchant_id: merchant_id.into(),
            status: status.into(),
            amount_minor,
            currency: currency.into(),
            phone_number: None,
            financial_txn_id: None,
            reason: None,
            timestamp: Utc::now(),
            topic,
        }
    }

    pub fn to_json_bytes(&self) -> Result<Vec<u8>, serde_json::Error> {
        serde_json::to_vec(self)
    }

    pub fn to_bincode_bytes(&self) -> Result<Vec<u8>, bincode::Error> {
        bincode::serialize(self)
    }

    pub fn from_bincode_bytes(bytes: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(bytes)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_str_event_serialisation() {
        let event = StrEvent::new(
            StrEventType::StrSubmitted,
            "str-001", "merchant-001", "tenant-001",
            "STR-2026-001", "structuring", "Unusual cash deposits", "submitted",
        );
        let json = event.to_json_bytes().unwrap();
        assert!(!json.is_empty());
        let bincode = event.to_bincode_bytes().unwrap();
        let decoded = StrEvent::from_bincode_bytes(&bincode).unwrap();
        assert_eq!(decoded.str_id, "str-001");
        assert_eq!(decoded.event_type, StrEventType::StrSubmitted);
    }

    #[test]
    fn test_momo_event_serialisation() {
        let event = MoMoEvent::new(
            MoMoEventType::PaymentCompleted,
            "mtn", "EXT-001", "merchant-001", "SUCCESSFUL", 500000, "NGN",
        );
        assert_eq!(event.topic, "paygate.momo.mtn.events");
        let json = event.to_json_bytes().unwrap();
        assert!(!json.is_empty());
    }

    #[test]
    fn test_str_event_validation() {
        let mut event = StrEvent::new(
            StrEventType::StrDrafted,
            "", "merchant-001", "tenant-001",
            "STR-001", "layering", "Test", "draft",
        );
        assert!(event.validate().is_err());
        event.str_id = "str-001".to_string();
        assert!(event.validate().is_ok());
    }
}
