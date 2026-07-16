// fluvio_client.rs — Fluvio native producer/consumer for terminal events.
//
// Uses the official `fluvio` Rust crate for high-throughput, low-latency
// streaming. The Go bridge uses the Fluvio HTTP proxy; this Rust service
// uses the native TCP client for maximum throughput in the settlement path.

use crate::events::TerminalEvent;
use crate::error::TerminalError;
use fluvio::{Fluvio, FluvioConfig, RecordKey, TopicProducer, consumer::ConsumerConfigExtBuilder};
use futures::StreamExt;
use std::env;
use tracing::{error, info, warn};

// ─── Topic constants ──────────────────────────────────────────────────────────

pub const TOPIC_TXN_COMPLETED: &str = "paygate.terminal.txn_completed";
pub const TOPIC_TXN_FAILED: &str = "paygate.terminal.txn_failed";
pub const TOPIC_REFUNDED: &str = "paygate.terminal.refunded";
pub const TOPIC_VOIDED: &str = "paygate.terminal.voided";
pub const TOPIC_ALL: &str = "paygate.terminal.events";

// ─── Client ───────────────────────────────────────────────────────────────────

/// FluvioTerminalClient wraps the Fluvio connection and provides typed
/// produce/consume methods for terminal events.
pub struct FluvioTerminalClient {
    fluvio: Fluvio,
}

impl FluvioTerminalClient {
    /// Connect to Fluvio using FLUVIO_ENDPOINT env var or localhost:9003.
    pub async fn connect() -> Result<Self, TerminalError> {
        let endpoint = env::var("FLUVIO_ENDPOINT")
            .unwrap_or_else(|_| "localhost:9003".to_string());

        let config = FluvioConfig::new(endpoint.clone());
        let fluvio = Fluvio::connect_with_config(&config)
            .await
            .map_err(|e| TerminalError::FluvioConnect(format!("{}: {}", endpoint, e)))?;

        info!("Fluvio connected to {}", endpoint);
        Ok(Self { fluvio })
    }

    // ─── Producer ─────────────────────────────────────────────────────────────

    /// Get a producer for the given topic.
    async fn producer(&self, topic: &str) -> Result<TopicProducer, TerminalError> {
        self.fluvio
            .topic_producer(topic)
            .await
            .map_err(|e| TerminalError::FluvioProducer(e.to_string()))
    }

    /// Produce a terminal event to the appropriate topic.
    /// Also fans out to the aggregate TOPIC_ALL topic.
    pub async fn produce(&self, topic: &str, event: &TerminalEvent) -> Result<(), TerminalError> {
        let bytes = event
            .to_json_bytes()
            .map_err(|e| TerminalError::Serialise(e.to_string()))?;

        let producer = self.producer(topic).await?;
        producer
            .send(RecordKey::NULL, bytes.clone())
            .await
            .map_err(|e| TerminalError::FluvioProducer(e.to_string()))?;
        producer.flush().await
            .map_err(|e| TerminalError::FluvioProducer(e.to_string()))?;

        // Fan-out to aggregate topic (best-effort)
        if topic != TOPIC_ALL {
            if let Ok(agg_producer) = self.producer(TOPIC_ALL).await {
                let _ = agg_producer.send(RecordKey::NULL, bytes).await;
                let _ = agg_producer.flush().await;
            }
        }

        Ok(())
    }

    // ─── Consumer ─────────────────────────────────────────────────────────────

    /// Consume terminal events from the given topic, calling `handler` for each.
    /// Runs until the future is cancelled (e.g. via tokio::select! with shutdown signal).
    pub async fn consume<F, Fut>(
        &self,
        topic: &str,
        partition: i32,
        mut handler: F,
    ) -> Result<(), TerminalError>
    where
        F: FnMut(TerminalEvent) -> Fut,
        Fut: std::future::Future<Output = Result<(), TerminalError>>,
    {
        let config = ConsumerConfigExtBuilder::default()
            .topic(topic)
            .partition(partition)
            .build()
            .map_err(|e| TerminalError::FluvioConsumer(e.to_string()))?;

        let mut stream = self
            .fluvio
            .consumer_with_config(config)
            .await
            .map_err(|e| TerminalError::FluvioConsumer(e.to_string()))?;

        info!("Consuming from topic={} partition={}", topic, partition);

        while let Some(record) = stream.next().await {
            match record {
                Ok(rec) => {
                    match TerminalEvent::from_json_bytes(rec.as_ref()) {
                        Ok(event) => {
                            if let Err(e) = handler(event).await {
                                error!("Handler error: {:?}", e);
                            }
                        }
                        Err(e) => {
                            warn!("Deserialise error: {:?}", e);
                        }
                    }
                }
                Err(e) => {
                    error!("Fluvio stream error: {:?}", e);
                }
            }
        }

        Ok(())
    }

    /// Consume completed transactions only (TOPIC_TXN_COMPLETED).
    pub async fn consume_completed_txns<F, Fut>(
        &self,
        handler: F,
    ) -> Result<(), TerminalError>
    where
        F: FnMut(TerminalEvent) -> Fut,
        Fut: std::future::Future<Output = Result<(), TerminalError>>,
    {
        self.consume(TOPIC_TXN_COMPLETED, 0, handler).await
    }
}
