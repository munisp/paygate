//! Mojaloop Settlement Service
//!
//! Consumes Kafka transfer.completed events from the Go bridge,
//! publishes them to Fluvio, and posts double-entry settlements to TigerBeetle.
use mojaloop_events::{
    events::MojaloopEvent,
    fluvio_producer::MojaloopFluvioProducer,
    kafka_consumer::MojaloopKafkaConsumer,
    tigerbeetle::TigerBeetleSettlement,
};
use axum::{routing::get, Router};
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .json()
        .init();

    info!("Starting Mojaloop Settlement Service");

    // Health check HTTP server
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/ready", get(|| async { "ok" }));

    let port = std::env::var("PORT").unwrap_or_else(|_| "8090".to_string());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    info!("Health server listening on port {}", port);

    // Start health server in background
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Connect to Fluvio and TigerBeetle
    let fluvio = MojaloopFluvioProducer::connect().await?;
    let tigerbeetle = TigerBeetleSettlement::new();
    let consumer = MojaloopKafkaConsumer::new()?;

    info!("Connected to Fluvio and TigerBeetle — consuming Kafka events");

    loop {
        if let Some(event) = consumer.next_event().await {
            // Publish to Fluvio
            if let Err(e) = fluvio.publish(&event).await {
                error!("Failed to publish to Fluvio: {}", e);
            }

            // Settle completed transfers in TigerBeetle
            if let MojaloopEvent::TransferCompleted(ref completed) = event {
                if let Err(e) = tigerbeetle.settle_transfer(completed).await {
                    error!("TigerBeetle settlement failed: {}", e);
                }
            }
        }
    }
}
