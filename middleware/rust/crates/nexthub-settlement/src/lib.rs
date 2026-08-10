// NextHub Settlement Service — lib.rs
//
// This crate implements the TigerBeetle-backed settlement engine for NextHub.
// It exposes a gRPC server that the Go FSPIOP gateway calls for:
//   - prepare(transfer)  → POST PENDING linked transfers to TigerBeetle
//   - fulfil(transfer)   → POST_PENDING_TRANSFER (commit)
//   - abort(transfer)    → VOID_PENDING_TRANSFER (rollback)
//
// All financial operations are atomic linked chains in TigerBeetle.
// No relational database is involved in the money movement path.

pub mod accounts;
pub mod batch;
pub mod error;
pub mod events;
pub mod interchange;
pub mod provisioning;
pub mod settlement;

pub use error::SettlementError;
pub use settlement::SettlementService;

/// TigerBeetle account ID namespace constants.
/// Account IDs are 128-bit. We use the high 64 bits as a namespace
/// and the low 64 bits as the DFSP-specific identifier.
pub mod account_ids {
    /// Namespace for DFSP position accounts (debit normal).
    pub const NS_POSITION: u64 = 0x0001_0000_0000_0000;
    /// Namespace for DFSP settlement accounts (credit normal).
    pub const NS_SETTLEMENT: u64 = 0x0002_0000_0000_0000;
    /// Namespace for scheme fee collection accounts.
    pub const NS_SCHEME_FEE: u64 = 0x0003_0000_0000_0000;
    /// Namespace for interchange accounts.
    pub const NS_INTERCHANGE: u64 = 0x0004_0000_0000_0000;
    /// Namespace for FX buffer accounts.
    pub const NS_FX_BUFFER: u64 = 0x0005_0000_0000_0000;
    /// Namespace for suspense accounts used during cross-currency transfers.
    pub const NS_SUSPENSE: u64 = 0x0006_0000_0000_0000;
}

/// Transfer flags used in TigerBeetle linked chains.
pub mod tb_flags {
    /// Link this transfer to the next one in the chain (atomic).
    pub const LINKED: u16 = 1 << 0;
    /// Post a pending transfer (FULFIL path).
    pub const POST_PENDING_TRANSFER: u16 = 1 << 1;
    /// Void a pending transfer (ABORT path).
    pub const VOID_PENDING_TRANSFER: u16 = 1 << 2;
    /// Mark transfer as pending (PREPARE path).
    pub const PENDING: u16 = 1 << 3;
}

/// Currency codes supported by NextHub.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Currency {
    NGN,
    USD,
    GHS,
    KES,
    ZAR,
    XOF,
    USDC,
    CBDC(String), // e.g. "eNaira", "eCedi"
}

impl Currency {
    /// Returns the ISO 4217 numeric code, or 0 for crypto/CBDC.
    pub fn iso_numeric(&self) -> u32 {
        match self {
            Currency::NGN => 566,
            Currency::USD => 840,
            Currency::GHS => 936,
            Currency::KES => 404,
            Currency::ZAR => 710,
            Currency::XOF => 952,
            Currency::USDC => 0,
            Currency::CBDC(_) => 0,
        }
    }
}

/// A transfer request from the Go FSPIOP gateway.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TransferRequest {
    pub transfer_id: uuid::Uuid,
    pub payer_fsp_id: String,
    pub payee_fsp_id: String,
    pub amount_currency: Currency,
    /// Amount in minor units (e.g. kobo for NGN, cents for USD).
    pub amount_minor: u64,
    pub ilp_packet: String,
    pub condition: String,
    pub expiration_unix_ms: u64,
}

/// The result of a successful PREPARE operation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PrepareResult {
    /// The TigerBeetle pending transfer ID (128-bit, split into lo/hi).
    pub pending_id_lo: u64,
    pub pending_id_hi: u64,
    /// The TigerBeetle account IDs debited/credited.
    pub payer_position_account_lo: u64,
    pub payee_suspense_account_lo: u64,
}
