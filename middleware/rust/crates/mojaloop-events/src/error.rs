use thiserror::Error;

#[derive(Debug, Error)]
pub enum MojaloopError {
    #[error("Fluvio connection failed: {0}")]
    FluvioConnect(String),
    #[error("Fluvio producer error: {0}")]
    FluvioProducer(String),
    #[error("Fluvio send error: {0}")]
    FluvioSend(String),
    #[error("Kafka consumer error: {0}")]
    KafkaConsumer(String),
    #[error("TigerBeetle error: {0}")]
    TigerBeetle(String),
    #[error("Serialisation error: {0}")]
    Serialisation(String),
    #[error("Invalid transfer data: {0}")]
    InvalidTransfer(String),
}
