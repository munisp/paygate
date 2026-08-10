use anyhow::Result;
use fluvio::{Fluvio, RecordKey};
use serde::Serialize;
use std::env;

pub struct NipFluvioProducer {
    topic: String,
    endpoint: String,
}

impl NipFluvioProducer {
    pub fn new() -> Self {
        Self {
            topic: "paygate-nibss-events".to_string(),
            endpoint: env::var("FLUVIO_ENDPOINT").unwrap_or_default(),
        }
    }

    pub async fn produce<T: Serialize>(&self, key: &str, event: &T) -> Result<()> {
        if self.endpoint.is_empty() {
            return Ok(());
        }
        let fluvio = Fluvio::connect().await?;
        let producer = fluvio.topic_producer(&self.topic).await?;
        let payload = serde_json::to_vec(event)?;
        producer.send(RecordKey::from(key), payload).await?;
        producer.flush().await?;
        Ok(())
    }
}
