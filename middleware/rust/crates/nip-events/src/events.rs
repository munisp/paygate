use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NipTransferEvent {
    pub event_id: Uuid,
    pub event_type: NipEventType,
    pub reference: String,
    pub session_id: Option<String>,
    pub merchant_id: String,
    pub originator_account: String,
    pub destination_bank_code: String,
    pub destination_account: String,
    pub destination_account_name: String,
    pub amount_kobo: i64,
    pub currency: String,
    pub narration: Option<String>,
    pub response_code: Option<String>,
    pub status: NipTransferStatus,
    pub timestamp: DateTime<Utc>,
    pub settled_at: Option<DateTime<Utc>>,
    pub tigerbeetle_transfer_id: Option<u128>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NipEventType {
    NameEnquiry,
    VirtualAccountCreated,
    VirtualAccountPaid,
    VirtualAccountExpired,
    TransferInitiated,
    TransferCompleted,
    TransferFailed,
    TransferReversed,
    WebhookReceived,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NipTransferStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Reversed,
}

impl NipTransferEvent {
    pub fn new_transfer(
        reference: String,
        merchant_id: String,
        originator_account: String,
        destination_bank_code: String,
        destination_account: String,
        destination_account_name: String,
        amount_kobo: i64,
    ) -> Self {
        Self {
            event_id: Uuid::new_v4(),
            event_type: NipEventType::TransferInitiated,
            reference,
            session_id: None,
            merchant_id,
            originator_account,
            destination_bank_code,
            destination_account,
            destination_account_name,
            amount_kobo,
            currency: "NGN".to_string(),
            narration: None,
            response_code: None,
            status: NipTransferStatus::Pending,
            timestamp: Utc::now(),
            settled_at: None,
            tigerbeetle_transfer_id: None,
        }
    }
}
