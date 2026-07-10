/*!
PayGate NextHub — TigerBeetle Settlement gRPC Server
=====================================================
Entry point for the nexthub-settlement Rust binary.

Exposes the SettlementService defined in proto/settlement.proto via tonic gRPC.
All financial operations are backed by TigerBeetle via the tigerbeetle-unofficial
client crate.

Environment variables:
  TIGERBEETLE_ADDRESS   — TigerBeetle cluster address (default: "127.0.0.1:3000")
  GRPC_LISTEN_ADDR      — gRPC server bind address (default: "0.0.0.0:50051")
  RUST_LOG              — log level (default: "info")
  OTEL_EXPORTER_OTLP_ENDPOINT — OpenTelemetry endpoint for traces
  OTEL_SERVICE_NAME     — service name for traces (default: "nexthub-settlement")

Usage:
  TIGERBEETLE_ADDRESS=127.0.0.1:3000 cargo run --release
*/

use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use tonic::transport::Server;
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod accounts;
mod error;
mod settlement;
mod grpc_service;

use grpc_service::SettlementServiceImpl;

// Generated tonic code from proto/settlement.proto
pub mod proto {
    tonic::include_proto!("nexthub.settlement.v1");
}

use proto::settlement_service_server::SettlementServiceServer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // ── Logging / tracing ─────────────────────────────────────────────────────
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let service_name = env::var("OTEL_SERVICE_NAME")
        .unwrap_or_else(|_| "nexthub-settlement".to_string());
    info!(service = %service_name, "PayGate NextHub Settlement gRPC server starting");

    // ── TigerBeetle connection ────────────────────────────────────────────────
    let tb_address = env::var("TIGERBEETLE_ADDRESS")
        .unwrap_or_else(|_| "127.0.0.1:3000".to_string());
    info!(address = %tb_address, "Connecting to TigerBeetle");

    let tb_client = Arc::new(
        settlement::create_tigerbeetle_client(&tb_address)
            .await
            .map_err(|e| {
                warn!(error = %e, "Failed to connect to TigerBeetle — starting in degraded mode");
                e
            })
            .ok()
    );

    if tb_client.is_none() {
        warn!("TigerBeetle is unavailable — all settlement operations will return errors until reconnected");
    } else {
        info!("TigerBeetle connection established");
    }

    // ── gRPC server ───────────────────────────────────────────────────────────
    let listen_addr: SocketAddr = env::var("GRPC_LISTEN_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:50051".to_string())
        .parse()?;

    let service = SettlementServiceImpl::new(tb_client);

    info!(addr = %listen_addr, "NextHub Settlement gRPC server listening");

    Server::builder()
        // Reflection for grpcurl / Postman
        .add_service(
            tonic_reflection::server::Builder::configure()
                .register_encoded_file_descriptor_set(proto::FILE_DESCRIPTOR_SET)
                .build_v1()?,
        )
        .add_service(SettlementServiceServer::new(service))
        .serve_with_shutdown(listen_addr, shutdown_signal())
        .await?;

    info!("NextHub Settlement gRPC server stopped cleanly");
    Ok(())
}

/// Graceful shutdown on SIGTERM or SIGINT.
async fn shutdown_signal() {
    use tokio::signal;
    let ctrl_c = async {
        signal::ctrl_c().await.expect("Failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { info!("Received Ctrl+C — shutting down"); },
        _ = terminate => { info!("Received SIGTERM — shutting down"); },
    }
}
