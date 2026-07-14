use crate::events::MojaloopEvent;
use crate::error::MojaloopError;
use fluvio::{Fluvio, RecordKey, TopicProducer};
use serde_json;
use std::env;
use tracing::{error, info};

/// Fluvio topic names for Mojaloop events
const TOPIC_TRANSFER_COMPLETED: &str = "paygate.mojaloop.fluvio.transfer.completed";
const TOPIC_TRANSFER_FAILED: &str = "paygate.mojaloop.fluvio.transfer.failed";
const TOPIC_PARTY_FOUND: &str = "paygate.mojaloop.fluvio.party.found";
const TOPIC_QUOTE_ACCEPTED: &str = "paygate.mojaloop.fluvio.quote.accepted";
const TOPIC_ALL_EVENTS: &str = "paygate.mojaloop.fluvio.events"; // fan-out aggregate

/// MojaloopFluvioProducer publishes Mojaloop events to Fluvio topics.
pub struct MojaloopFluvioProducer {
    fluvio: Fluvio,
}

impl MojaloopFluvioProducer {
    /// Connect to Fluvio using FLUVIO_ENDPOINT env var.
    pub async fn connect() -> Result<Self, MojaloopError> {
        let endpoint = env::var("FLUVIO_ENDPOINT")
            .unwrap_or_else(|_| "localhost:9003".to_string());

        let fluvio = Fluvio::connect_with_config(
            &fluvio::config::FluvioConfig::new(endpoint),
        )
        .await
        .map_err(|e| MojaloopError::FluvioConnect(e.to_string()))?;

        Ok(Self { fluvio })
    }

    /// Publish a MojaloopEvent to the appropriate topic.
    pub async fn publish(&self, event: &MojaloopEvent) -> Result<(), MojaloopError> {
        let topic = match event {
            MojaloopEvent::TransferCompleted(_) => TOPIC_TRANSFER_COMPLETED,
            MojaloopEvent::TransferFailed(_) => TOPIC_TRANSFER_FAILED,
            MojaloopEvent::PartyFound(_) => TOPIC_PARTY_FOUND,
            MojaloopEvent::QuoteAccepted(_) => TOPIC_QUOTE_ACCEPTED,
        };

        let payload = serde_json::to_vec(event)
            .map_err(|e| MojaloopError::Serialisation(e.to_string()))?;

        let merchant_id = event.merchant_id().to_string();

        // Publish to specific topic
        self.send_to_topic(topic, &merchant_id, &payload).await?;

        // Fan-out to aggregate topic
        self.send_to_topic(TOPIC_ALL_EVENTS, &merchant_id, &payload).await?;

        info!(
            topic = topic,
            merchant_id = %merchant_id,
            event_type = event.event_type(),
            "Mojaloop event published to Fluvio"
        );

        Ok(())
    }

    async fn send_to_topic(
        &self,
        topic: &str,
        key: &str,
        payload: &[u8],
    ) -> Result<(), MojaloopError> {
        let producer: TopicProducer = self
            .fluvio
            .topic_producer(topic)
            .await
            .map_err(|e| MojaloopError::FluvioProducer(e.to_string()))?;

        producer
            .send(RecordKey::from(key), payload)
            .await
            .map_err(|e| MojaloopError::FluvioSend(e.to_string()))?;

        producer.flush().await
            .map_err(|e| MojaloopError::FluvioSend(e.to_string()))?;

        Ok(())
    }
}
