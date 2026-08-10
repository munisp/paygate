use thiserror::Error;

#[derive(Error, Debug)]
pub enum NipError {
    #[error("NIBSS gateway error: {0}")]
    Gateway(String),
    #[error("TigerBeetle settlement error: {0}")]
    Settlement(String),
    #[error("Fluvio producer error: {0}")]
    Fluvio(#[from] anyhow::Error),
    #[error("Kafka producer error: {0}")]
    Kafka(String),
    #[error("Serialisation error: {0}")]
    Serialisation(#[from] serde_json::Error),
    #[error("Invalid NIP response code: {0}")]
    InvalidResponseCode(String),
}
