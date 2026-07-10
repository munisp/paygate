use crate::error::MojaloopError;
use crate::events::{MojaloopEvent, TransferCompletedEvent, TransferFailedEvent};
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::{ClientConfig, Message};
use std::env;
use tracing::{error, info, warn};

const TOPIC_TRANSFER_COMPLETED: &str = "paygate.mojaloop.transfer.completed";
const TOPIC_TRANSFER_FAILED: &str = "paygate.mojaloop.transfer.failed";

pub struct MojaloopKafkaConsumer {
    consumer: StreamConsumer,
}

impl MojaloopKafkaConsumer {
    pub fn new() -> Result<Self, MojaloopError> {
        let brokers = env::var("KAFKA_BOOTSTRAP_SERVERS")
            .unwrap_or_else(|_| "localhost:9092".to_string());

        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", &brokers)
            .set("group.id", "mojaloop-rust-settlement")
            .set("enable.auto.commit", "true")
            .set("auto.offset.reset", "earliest")
            .set("session.timeout.ms", "30000")
            .create()
            .map_err(|e| MojaloopError::KafkaConsumer(e.to_string()))?;

        consumer
            .subscribe(&[TOPIC_TRANSFER_COMPLETED, TOPIC_TRANSFER_FAILED])
            .map_err(|e| MojaloopError::KafkaConsumer(e.to_string()))?;

        Ok(Self { consumer })
    }

    pub async fn next_event(&self) -> Option<MojaloopEvent> {
        use rdkafka::consumer::CommitMode;
        use futures::StreamExt;

        let mut stream = self.consumer.stream();
        while let Some(result) = stream.next().await {
            match result {
                Ok(msg) => {
                    let payload = match msg.payload() {
                        Some(p) => p,
                        None => continue,
                    };
                    let topic = msg.topic();
                    let event = match topic {
                        t if t == TOPIC_TRANSFER_COMPLETED => {
                            serde_json::from_slice::<TransferCompletedEvent>(payload)
                                .ok()
                                .map(MojaloopEvent::TransferCompleted)
                        }
                        t if t == TOPIC_TRANSFER_FAILED => {
                            serde_json::from_slice::<TransferFailedEvent>(payload)
                                .ok()
                                .map(MojaloopEvent::TransferFailed)
                        }
                        _ => None,
                    };
                    if let Some(e) = event {
                        return Some(e);
                    }
                }
                Err(e) => {
                    error!("Kafka consumer error: {}", e);
                }
            }
        }
        None
    }
}
