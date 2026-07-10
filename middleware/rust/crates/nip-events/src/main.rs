//! NIP Settlement Service — listens on Kafka for NIP completion events
//! and posts double-entry transfers to TigerBeetle.
use anyhow::Result;
use dotenvy::dotenv;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::ClientConfig;
use rdkafka::Message;
use std::env;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

mod error;
mod events;
mod fluvio_producer;
mod tigerbeetle;

use events::{NipTransferEvent, NipTransferStatus};
use fluvio_producer::NipFluvioProducer;
use tigerbeetle::NipSettlementService;

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let kafka_brokers = env::var("KAFKA_BOOTSTRAP_SERVERS")
        .unwrap_or_else(|_| "localhost:9092".to_string());

    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &kafka_brokers)
        .set("group.id", "nip-settlement-service")
        .set("enable.auto.commit", "true")
        .set("auto.offset.reset", "latest")
        .create()?;

    consumer.subscribe(&["paygate.nibss.payment.received", "paygate.nibss.transfer.completed"])?;

    let settlement = NipSettlementService::new();
    let fluvio = NipFluvioProducer::new();

    info!("[nip-settlement] Listening for NIP events...");

    loop {
        match consumer.recv().await {
            Err(e) => error!("[nip-settlement] Kafka error: {}", e),
            Ok(msg) => {
                if let Some(payload) = msg.payload() {
                    if let Ok(event) = serde_json::from_slice::<NipTransferEvent>(payload) {
                        if event.status == NipTransferStatus::Completed {
                            match settlement
                                .settle_nip_transfer(
                                    &event.reference,
                                    &event.merchant_id,
                                    event.amount_kobo,
                                )
                                .await
                            {
                                Ok(tb_id) => {
                                    info!(
                                        "[nip-settlement] Settled: ref={} tb_id={}",
                                        event.reference, tb_id
                                    );
                                    let mut settled = event.clone();
                                    settled.tigerbeetle_transfer_id = Some(tb_id);
                                    settled.settled_at = Some(chrono::Utc::now());
                                    let _ = fluvio
                                        .produce(&event.reference, &settled)
                                        .await;
                                }
                                Err(e) => {
                                    error!(
                                        "[nip-settlement] Settlement failed: ref={} err={}",
                                        event.reference, e
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
