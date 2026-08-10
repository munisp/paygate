// TigerBeetle HTTP client for posting double-entry transfers.
// TigerBeetle exposes a REST-compatible HTTP API via the tigerbeetle-node proxy
// or directly via the Go/Rust client. We use the HTTP proxy approach for
// language-agnostic deployment.

use crate::errors::BillingError;
use crate::models::LedgerTransfer;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{error, info, instrument};

#[derive(Debug, Clone)]
pub struct TigerBeetleClient {
    client: Client,
    base_url: String,
}

#[derive(Debug, Serialize)]
struct CreateTransfersRequest {
    transfers: Vec<TbTransfer>,
}

#[derive(Debug, Serialize)]
struct TbTransfer {
    id: String,
    debit_account_id: String,
    credit_account_id: String,
    amount: i64,
    ledger: u32,
    code: u16,
    flags: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pending_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_data_128: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_data_64: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_data_32: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timeout: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct CreateTransfersResponse {
    results: Vec<TransferResult>,
}

#[derive(Debug, Deserialize)]
struct TransferResult {
    index: u32,
    result: String,
}

#[derive(Debug, Serialize)]
struct CreateAccountsRequest {
    accounts: Vec<TbAccount>,
}

#[derive(Debug, Serialize)]
pub struct TbAccount {
    pub id: String,
    pub ledger: u32,
    pub code: u16,
    pub flags: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_data_128: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_data_64: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_data_32: Option<u32>,
}

impl TigerBeetleClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .expect("Failed to build HTTP client"),
            base_url: base_url.to_string(),
        }
    }

    /// Post a batch of transfers atomically to TigerBeetle.
    /// Returns an error if any transfer fails (TigerBeetle is all-or-nothing per batch).
    #[instrument(skip(self, transfers), fields(transfer_count = transfers.len()))]
    pub async fn post_transfers(
        &self,
        transfers: &[LedgerTransfer],
    ) -> Result<(), BillingError> {
        let tb_transfers: Vec<TbTransfer> = transfers
            .iter()
            .map(|t| TbTransfer {
                id: t.id.clone(),
                debit_account_id: t.debit_account_id.clone(),
                credit_account_id: t.credit_account_id.clone(),
                amount: t.amount,
                ledger: t.ledger,
                code: t.code,
                flags: t.flags,
                pending_id: t.pending_id.clone(),
                user_data_128: t.user_data_128.clone(),
                user_data_64: t.user_data_64,
                user_data_32: t.user_data_32,
                timeout: t.timeout,
            })
            .collect();

        let url = format!("{}/transfers", self.base_url);
        let resp = self
            .client
            .post(&url)
            .json(&CreateTransfersRequest { transfers: tb_transfers })
            .send()
            .await
            .map_err(|e| BillingError::TigerBeetleError(e.to_string()))?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            error!("TigerBeetle transfer failed: {}", body);
            return Err(BillingError::TigerBeetleError(body));
        }

        let result: CreateTransfersResponse = resp
            .json()
            .await
            .map_err(|e| BillingError::TigerBeetleError(e.to_string()))?;

        // Check for any non-ok results
        let failures: Vec<_> = result
            .results
            .iter()
            .filter(|r| r.result != "ok")
            .collect();

        if !failures.is_empty() {
            let msg = failures
                .iter()
                .map(|r| format!("index={} result={}", r.index, r.result))
                .collect::<Vec<_>>()
                .join(", ");
            error!("TigerBeetle transfer errors: {}", msg);
            return Err(BillingError::TigerBeetleError(msg));
        }

        info!("Posted {} transfers to TigerBeetle", transfers.len());
        Ok(())
    }

    /// Create ledger accounts for a new tenant.
    pub async fn create_accounts(
        &self,
        accounts: Vec<TbAccount>,
    ) -> Result<(), BillingError> {
        let url = format!("{}/accounts", self.base_url);
        let resp = self
            .client
            .post(&url)
            .json(&CreateAccountsRequest { accounts })
            .send()
            .await
            .map_err(|e| BillingError::TigerBeetleError(e.to_string()))?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(BillingError::TigerBeetleError(body));
        }

        Ok(())
    }
}
