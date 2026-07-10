// middleware/rust/crates/str-events/src/fluvio_producer.rs
// Fluvio native client producer for STR and MoMo events.
// Uses the fluvio crate for direct topic produce with batching support.

use fluvio::{Fluvio, FluvioConfig, TopicProducer, RecordKey};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::events::{StrEvent, MoMoEvent};
use crate::error::StrEventError;

pub struct FluvioProducer {
    fluvio: Arc<Fluvio>,
    producers: Arc<Mutex<std::collections::HashMap<String, TopicProducer>>>,
}

impl FluvioProducer {
    /// Connect to Fluvio cluster using FLUVIO_ENDPOINT env var.
    pub async fn connect() -> Result<Self, StrEventError> {
        let endpoint = std::env::var("FLUVIO_ENDPOINT")
            .unwrap_or_else(|_| "localhost:9003".to_string());

        let config = FluvioConfig::new(endpoint);
        let fluvio = Fluvio::connect_with_config(&config).await
            .map_err(|e| StrEventError::FluvioError(e.to_string()))?;

        Ok(Self {
            fluvio: Arc::new(fluvio),
            producers: Arc::new(Mutex::new(std::collections::HashMap::new())),
        })
    }

    /// Get or create a topic producer (cached).
    async fn get_producer(&self, topic: &str) -> Result<TopicProducer, StrEventError> {
        let mut producers = self.producers.lock().await;
        if let Some(p) = producers.get(topic) {
            // Clone the producer — TopicProducer is Arc-backed
            return Ok(p.clone());
        }
        let producer = self.fluvio.topic_producer(topic).await
            .map_err(|e| StrEventError::FluvioError(format!("Failed to create producer for {topic}: {e}")))?;
        producers.insert(topic.to_string(), producer.clone());
        Ok(producer)
    }

    /// Publish an STR event to the paygate.str.events Fluvio topic.
    pub async fn publish_str_event(&self, event: &StrEvent) -> Result<(), StrEventError> {
        event.validate()?;
        let topic = if event.topic.is_empty() {
            "paygate.str.events"
        } else {
            &event.topic
        };
        let payload = event.to_json_bytes()
            .map_err(|e| StrEventError::SerializationError(e.to_string()))?;

        let producer = self.get_producer(topic).await?;
        producer.send(RecordKey::NULL, payload).await
            .map_err(|e| StrEventError::FluvioError(e.to_string()))?;
        producer.flush().await
            .map_err(|e| StrEventError::FluvioError(e.to_string()))?;
        Ok(())
    }

    /// Publish a MoMo event to the provider-specific Fluvio topic.
    pub async fn publish_momo_event(&self, event: &MoMoEvent) -> Result<(), StrEventError> {
        let topic = if event.topic.is_empty() {
            format!("paygate.momo.{}.events", event.provider)
        } else {
            event.topic.clone()
        };
        let payload = event.to_json_bytes()
            .map_err(|e| StrEventError::SerializationError(e.to_string()))?;

        let producer = self.get_producer(&topic).await?;
        producer.send(RecordKey::NULL, payload).await
            .map_err(|e| StrEventError::FluvioError(e.to_string()))?;
        producer.flush().await
            .map_err(|e| StrEventError::FluvioError(e.to_string()))?;
        Ok(())
    }

    /// Publish a batch of STR events (more efficient than individual sends).
    pub async fn publish_str_batch(&self, events: &[StrEvent]) -> Result<usize, StrEventError> {
        let producer = self.get_producer("paygate.str.events").await?;
        let mut count = 0;
        for event in events {
            if let Ok(payload) = event.to_json_bytes() {
                producer.send(RecordKey::NULL, payload).await
                    .map_err(|e| StrEventError::FluvioError(e.to_string()))?;
                count += 1;
            }
        }
        producer.flush().await
            .map_err(|e| StrEventError::FluvioError(e.to_string()))?;
        Ok(count)
    }

    /// Publish a batch of MoMo events grouped by provider topic.
    pub async fn publish_momo_batch(&self, events: &[MoMoEvent]) -> Result<usize, StrEventError> {
        let mut count = 0;
        // Group by topic to minimise producer lookups
        let mut by_topic: std::collections::HashMap<String, Vec<&MoMoEvent>> = Default::default();
        for event in events {
            let topic = format!("paygate.momo.{}.events", event.provider);
            by_topic.entry(topic).or_default().push(event);
        }
        for (topic, group) in &by_topic {
            let producer = self.get_producer(topic).await?;
            for event in group {
                if let Ok(payload) = event.to_json_bytes() {
                    producer.send(RecordKey::NULL, payload).await
                        .map_err(|e| StrEventError::FluvioError(e.to_string()))?;
                    count += 1;
                }
            }
            producer.flush().await
                .map_err(|e| StrEventError::FluvioError(e.to_string()))?;
        }
        Ok(count)
    }
}
