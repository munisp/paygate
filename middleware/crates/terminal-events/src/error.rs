use thiserror::Error;

#[derive(Debug, Error)]
pub enum TerminalError {
    #[error("Fluvio connect error: {0}")]
    FluvioConnect(String),

    #[error("Fluvio producer error: {0}")]
    FluvioProducer(String),

    #[error("Fluvio consumer error: {0}")]
    FluvioConsumer(String),

    #[error("Serialisation error: {0}")]
    Serialise(String),

    #[error("TigerBeetle settlement error: {0}")]
    Settlement(String),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Configuration error: {0}")]
    Config(String),
}
