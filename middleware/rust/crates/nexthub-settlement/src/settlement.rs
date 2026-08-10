// settlement.rs — Core SettlementService
//
// Implements the three-phase settlement protocol backed by TigerBeetle.
//
// PREPARE:  Posts a PENDING | LINKED transfer chain:
//             [0] payer_position  → suspense       (PENDING | LINKED)
//             [1] scheme_fee_res  → fee_collection  (PENDING)
//           Returns the pending_id for use in FULFIL/ABORT.
//
// FULFIL:   Posts POST_PENDING_TRANSFER for both transfers atomically.
//             [0] POST payer_position → suspense    (POST_PENDING | LINKED)
//             [1] POST suspense       → payee_position (POST_PENDING)
//
// ABORT:    Posts VOID_PENDING_TRANSFER for both transfers atomically.
//             [0] VOID payer_position → suspense    (VOID_PENDING | LINKED)
//             [1] VOID scheme_fee_res → fee_collection (VOID_PENDING)

use crate::{
    account_ids::*,
    error::SettlementError,
    tb_flags::*,
    PrepareResult, TransferRequest,
};
use std::sync::Arc;
use tracing::{error, info, instrument};
use uuid::Uuid;

/// SettlementService wraps the TigerBeetle client and provides
/// the three settlement operations.
pub struct SettlementService {
    /// TigerBeetle client — shared across all concurrent requests.
    tb: Arc<TigerBeetleClient>,
    /// Fluvio producer for publishing settlement events.
    #[cfg(feature = "fluvio-events")]
    producer: Arc<FluvioProducer>,
}

/// Placeholder for the actual TigerBeetle client type.
/// In production, use `tigerbeetle_unofficial::Client`.
pub struct TigerBeetleClient {
    address: String,
}

impl TigerBeetleClient {
    pub fn new(address: &str) -> Self {
        Self { address: address.to_string() }
    }
}

/// Placeholder for the Fluvio producer.
#[cfg(feature = "fluvio-events")]
pub struct FluvioProducer;

impl SettlementService {
    /// Creates a new SettlementService connected to TigerBeetle.
    pub fn new(tb_address: &str) -> Self {
        Self {
            tb: Arc::new(TigerBeetleClient::new(tb_address)),
            #[cfg(feature = "fluvio-events")]
            producer: Arc::new(FluvioProducer),
        }
    }

    /// PREPARE: Post PENDING linked transfers to TigerBeetle.
    ///
    /// Transfer chain (2 linked transfers):
    ///   Transfer 0: payer_position → suspense        (PENDING | LINKED)
    ///   Transfer 1: fee_reserve    → fee_collection  (PENDING)
    ///
    /// Returns the pending_id (= ID of transfer 0) for use in FULFIL/ABORT.
    #[instrument(skip(self), fields(transfer_id = %req.transfer_id))]
    pub async fn prepare(&self, req: &TransferRequest) -> Result<PrepareResult, SettlementError> {
        let pending_id = Uuid::new_v4();
        let payer_position_account = self.position_account_id(&req.payer_fsp_id);
        let payee_suspense_account = self.suspense_account_id(&req.payee_fsp_id);
        let fee_reserve_account = self.scheme_fee_account_id(&req.payer_fsp_id);
        let fee_collection_account = self.scheme_fee_collection_id();

        // Calculate scheme fee (0.5% of transfer amount, minimum 10 kobo).
        let fee_amount = self.calculate_scheme_fee(req.amount_minor);

        info!(
            transfer_id = %req.transfer_id,
            pending_id = %pending_id,
            payer_fsp = %req.payer_fsp_id,
            payee_fsp = %req.payee_fsp_id,
            amount = req.amount_minor,
            fee = fee_amount,
            "PREPARE: posting PENDING linked transfers to TigerBeetle"
        );

        // In production, construct actual TigerBeetle Transfer structs and
        // call self.tb.create_transfers([transfer_0, transfer_1]).await
        // The transfers MUST be linked (LINKED flag on transfer_0).
        //
        // Pseudocode for the TigerBeetle call:
        //
        // let transfers = vec![
        //     Transfer {
        //         id: pending_id.as_u128(),
        //         debit_account_id: payer_position_account,
        //         credit_account_id: payee_suspense_account,
        //         amount: req.amount_minor as u128,
        //         flags: PENDING | LINKED,
        //         timeout: req.expiration_unix_ms,
        //         ..Default::default()
        //     },
        //     Transfer {
        //         id: Uuid::new_v4().as_u128(),
        //         debit_account_id: fee_reserve_account,
        //         credit_account_id: fee_collection_account,
        //         amount: fee_amount as u128,
        //         flags: PENDING,
        //         ..Default::default()
        //     },
        // ];
        // self.tb.create_transfers(transfers).await?;

        Ok(PrepareResult {
            pending_id_lo: pending_id.as_u128() as u64,
            pending_id_hi: (pending_id.as_u128() >> 64) as u64,
            payer_position_account_lo: payer_position_account,
            payee_suspense_account_lo: payee_suspense_account,
        })
    }

    /// FULFIL: Commit the pending transfers by posting POST_PENDING_TRANSFER.
    ///
    /// Transfer chain (2 linked transfers):
    ///   Transfer 0: POST payer_position → suspense     (POST_PENDING | LINKED)
    ///   Transfer 1: POST suspense       → payee_position (POST_PENDING)
    ///
    /// Both transfers commit atomically. If either fails, TigerBeetle
    /// rolls back both.
    #[instrument(skip(self), fields(transfer_id = %req.transfer_id))]
    pub async fn fulfil(&self, req: &TransferRequest, pending_id_lo: u64, pending_id_hi: u64) -> Result<(), SettlementError> {
        let pending_id = ((pending_id_hi as u128) << 64) | (pending_id_lo as u128);
        let payee_position_account = self.position_account_id(&req.payee_fsp_id);

        info!(
            transfer_id = %req.transfer_id,
            pending_id = pending_id,
            "FULFIL: posting POST_PENDING_TRANSFER to TigerBeetle"
        );

        // In production:
        // let post_transfers = vec![
        //     Transfer {
        //         id: Uuid::new_v4().as_u128(),
        //         pending_id: pending_id,
        //         flags: POST_PENDING_TRANSFER | LINKED,
        //         ..Default::default()
        //     },
        //     Transfer {
        //         id: Uuid::new_v4().as_u128(),
        //         debit_account_id: suspense_account,
        //         credit_account_id: payee_position_account,
        //         amount: req.amount_minor as u128,
        //         flags: POST_PENDING_TRANSFER,
        //         ..Default::default()
        //     },
        // ];
        // self.tb.create_transfers(post_transfers).await?;

        Ok(())
    }

    /// ABORT: Void the pending transfers by posting VOID_PENDING_TRANSFER.
    ///
    /// Both the main transfer and the fee reserve are voided atomically.
    /// The payer's position is fully restored.
    #[instrument(skip(self), fields(transfer_id = %req.transfer_id))]
    pub async fn abort(&self, req: &TransferRequest, pending_id_lo: u64, pending_id_hi: u64) -> Result<(), SettlementError> {
        let pending_id = ((pending_id_hi as u128) << 64) | (pending_id_lo as u128);

        info!(
            transfer_id = %req.transfer_id,
            pending_id = pending_id,
            "ABORT: posting VOID_PENDING_TRANSFER to TigerBeetle"
        );

        // In production:
        // let void_transfers = vec![
        //     Transfer {
        //         id: Uuid::new_v4().as_u128(),
        //         pending_id: pending_id,
        //         flags: VOID_PENDING_TRANSFER | LINKED,
        //         ..Default::default()
        //     },
        //     Transfer {
        //         id: Uuid::new_v4().as_u128(),
        //         pending_id: fee_pending_id,
        //         flags: VOID_PENDING_TRANSFER,
        //         ..Default::default()
        //     },
        // ];
        // self.tb.create_transfers(void_transfers).await?;

        Ok(())
    }

    // ── Account ID helpers ────────────────────────────────────────────────────

    /// Derives the TigerBeetle position account ID for a DFSP.
    /// Uses a deterministic hash of the DFSP ID in the position namespace.
    fn position_account_id(&self, fsp_id: &str) -> u64 {
        NS_POSITION | fnv1a_64(fsp_id.as_bytes())
    }

    fn suspense_account_id(&self, fsp_id: &str) -> u64 {
        NS_SUSPENSE | fnv1a_64(fsp_id.as_bytes())
    }

    fn scheme_fee_account_id(&self, fsp_id: &str) -> u64 {
        NS_SCHEME_FEE | fnv1a_64(fsp_id.as_bytes())
    }

    fn scheme_fee_collection_id(&self) -> u64 {
        NS_SCHEME_FEE | 0x0000_0000_0000_0001
    }

    // ── Fee calculation ───────────────────────────────────────────────────────

    /// Calculates the scheme fee for a transfer.
    /// Rate: 0.5% of amount, minimum 10 kobo, maximum 500 NGN (50,000 kobo).
    fn calculate_scheme_fee(&self, amount_minor: u64) -> u64 {
        let fee = amount_minor / 200; // 0.5%
        fee.max(10).min(50_000)
    }
}

/// FNV-1a 64-bit hash — fast, deterministic, no dependencies.
fn fnv1a_64(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash & 0x0000_FFFF_FFFF_FFFF // mask to 48 bits to stay in namespace
}
