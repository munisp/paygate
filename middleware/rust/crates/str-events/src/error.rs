// middleware/rust/crates/str-events/src/error.rs
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StrEventError {
    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Fluvio error: {0}")]
    FluvioError(String),

    #[error("Schema error: {0}")]
    SchemaError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}
