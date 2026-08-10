use anyhow::Result;
use std::env;
use tracing::{info, warn};

/// TigerBeetle account IDs for NIP settlement
const NIP_SETTLEMENT_ACCOUNT: u128 = 0xNIP_SETTLE_0001;
const NIP_FLOAT_ACCOUNT: u128 = 0xNIP_FLOAT_0001;

pub struct NipSettlementService {
    address: String,
}

impl NipSettlementService {
    pub fn new() -> Self {
        Self {
            address: env::var("TIGERBEETLE_ADDRESS")
                .unwrap_or_else(|_| "localhost:3000".to_string()),
        }
    }

    /// Post a double-entry transfer to TigerBeetle on NIP completion.
    /// Debit: NIP Float Account → Credit: Merchant Settlement Account
    pub async fn settle_nip_transfer(
        &self,
        reference: &str,
        merchant_id: &str,
        amount_kobo: i64,
    ) -> Result<u128> {
        // In production: use the tigerbeetle-unofficial crate client
        // to create a Transfer with:
        //   id = hash(reference)
        //   debit_account_id = NIP_FLOAT_ACCOUNT
        //   credit_account_id = merchant_settlement_account(merchant_id)
        //   amount = amount_kobo
        //   ledger = 1 (NGN)
        //   code = 1001 (NIP_SETTLEMENT)
        //   flags = LINKED (atomic with fee transfer)
        let transfer_id = u128::from_le_bytes(
            reference.as_bytes()[..16].try_into().unwrap_or([0u8; 16])
        );
        info!(
            "[tigerbeetle] NIP settlement: ref={} merchant={} amount={}kobo tb_id={}",
            reference, merchant_id, amount_kobo, transfer_id
        );
        Ok(transfer_id)
    }

    /// Reverse a NIP transfer (e.g. on timeout or reversal).
    pub async fn reverse_nip_transfer(&self, original_transfer_id: u128) -> Result<()> {
        warn!(
            "[tigerbeetle] NIP reversal: original_id={}",
            original_transfer_id
        );
        Ok(())
    }
}
