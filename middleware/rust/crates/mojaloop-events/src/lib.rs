/// mojaloop-events: Mojaloop FSPIOP event serialisation, Fluvio producer,
/// and TigerBeetle settlement service for PayGate.
///
/// Architecture:
///   Kafka consumer (rdkafka) → deserialise event → Fluvio producer → TigerBeetle settlement
///
/// Topics consumed:
///   paygate.mojaloop.transfer.completed
///   paygate.mojaloop.transfer.failed
///
/// Fluvio topics produced:
///   paygate.mojaloop.fluvio.transfer.completed
///   paygate.mojaloop.fluvio.transfer.failed

pub mod events;
pub mod fluvio_producer;
pub mod tigerbeetle;
pub mod error;
pub mod kafka_consumer;

pub use events::{
    MojaloopEvent, TransferCompletedEvent, TransferFailedEvent,
    PartyFoundEvent, QuoteAcceptedEvent,
};
pub use error::MojaloopError;
