// error.rs — Settlement error types
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SettlementError {
    #[error("TigerBeetle error: {0}")]
    TigerBeetle(String),

    #[error("Transfer not found: {transfer_id}")]
    TransferNotFound { transfer_id: String },

    #[error("Invalid state transition: {from} -> {event}")]
    InvalidTransition { from: String, event: String },

    #[error("Transfer expired at {expiration_ms}")]
    TransferExpired { expiration_ms: u64 },

    #[error("Insufficient liquidity: DFSP {fsp_id} position {position} < required {required}")]
    InsufficientLiquidity { fsp_id: String, position: u64, required: u64 },

    #[error("Invalid fulfilment: SHA-256(fulfilment) != condition")]
    InvalidFulfilment,

    #[error("Duplicate transfer: {transfer_id}")]
    DuplicateTransfer { transfer_id: String },

    #[error("DFSP not found: {fsp_id}")]
    DfspNotFound { fsp_id: String },

    #[error("Fluvio publish error: {0}")]
    FluvioPublish(String),

    #[error("gRPC error: {0}")]
    Grpc(#[from] tonic::Status),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<SettlementError> for tonic::Status {
    fn from(e: SettlementError) -> Self {
        match &e {
            SettlementError::TransferNotFound { .. } => tonic::Status::not_found(e.to_string()),
            SettlementError::InvalidTransition { .. } => tonic::Status::failed_precondition(e.to_string()),
            SettlementError::TransferExpired { .. } => tonic::Status::deadline_exceeded(e.to_string()),
            SettlementError::InsufficientLiquidity { .. } => tonic::Status::resource_exhausted(e.to_string()),
            SettlementError::InvalidFulfilment => tonic::Status::invalid_argument(e.to_string()),
            SettlementError::DuplicateTransfer { .. } => tonic::Status::already_exists(e.to_string()),
            SettlementError::DfspNotFound { .. } => tonic::Status::not_found(e.to_string()),
            _ => tonic::Status::internal(e.to_string()),
        }
    }
}
