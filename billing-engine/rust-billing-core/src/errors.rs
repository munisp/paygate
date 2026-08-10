use thiserror::Error;

#[derive(Debug, Error)]
pub enum BillingError {
    #[error("Arithmetic overflow during fee computation")]
    ArithmeticOverflow,

    #[error("Billing config not found for tenant {tenant_id}")]
    ConfigNotFound { tenant_id: String },

    #[error("TigerBeetle error: {0}")]
    TigerBeetleError(String),

    #[error("Redis error: {0}")]
    RedisError(#[from] redis::RedisError),

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Duplicate billing event: idempotency key {key} already processed")]
    DuplicateEvent { key: String },

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}
