// main.rs — PayGate Terminal Settlement Service
//
// This binary runs as a sidecar service that:
//   1. Consumes txn_completed events from Fluvio (native TCP client)
//   2. Posts double-entry transfers to TigerBeetle via the bridge
//   3. Exposes an HTTP endpoint for the Go bridge to trigger settlement
//      (fallback when Fluvio consumer is not yet available)
//
// Port: RUST_SETTLEMENT_PORT (default 9100)

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, sync::Arc};
use tokio::signal;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use terminal_events::{
    FluvioTerminalClient, TigerBeetleSettler, TerminalEvent, TerminalEventType,
};

// ─── App state ────────────────────────────────────────────────────────────────

struct AppState {
    settler: TigerBeetleSettler,
}

// ─── HTTP handlers ────────────────────────────────────────────────────────────

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true, "service": "terminal-settlement" }))
}

#[derive(Debug, Deserialize)]
struct SettleRequest {
    terminal_id: String,
    merchant_id: String,
    transaction_id: String,
    amount_kobo: i64,
    currency: String,
    reference: String,
    event_id: String,
}

#[derive(Debug, Serialize)]
struct SettleResponse {
    ok: bool,
    message: String,
}

async fn handle_settle(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SettleRequest>,
) -> Result<Json<SettleResponse>, (StatusCode, Json<serde_json::Value>)> {
    // Build a synthetic TerminalEvent from the HTTP request
    let event = TerminalEvent::new(
        TerminalEventType::TxnCompleted,
        req.terminal_id,
        "bridge",
        req.merchant_id,
        "default",
        terminal_events::TxnPayload {
            transaction_id: req.transaction_id,
            reference: req.reference,
            r#type: "sale".into(),
            payment_method: "card".into(),
            card_brand: None,
            card_last4: None,
            amount_kobo: req.amount_kobo,
            currency: req.currency,
            auth_code: None,
            rrn: None,
            response_code: None,
        }.into(),
    );

    match state.settler.settle_transaction(&event).await {
        Ok(()) => Ok(Json(SettleResponse {
            ok: true,
            message: format!("settled event_id={}", req.event_id),
        })),
        Err(e) => {
            error!("Settlement failed: {:?}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
            ))
        }
    }
}

// ─── Fluvio consumer loop ─────────────────────────────────────────────────────

async fn run_fluvio_consumer(settler: Arc<TigerBeetleSettler>) {
    loop {
        match FluvioTerminalClient::connect().await {
            Ok(client) => {
                info!("Fluvio consumer connected, starting consumption");
                let settler_ref = settler.clone();
                let result = client
                    .consume_completed_txns(|event| {
                        let s = settler_ref.clone();
                        async move {
                            s.settle_transaction(&event).await?;
                            // Also handle refunds from the aggregate topic
                            if event.event_type == TerminalEventType::Refunded {
                                s.reverse_settlement(&event).await?;
                            }
                            Ok(())
                        }
                    })
                    .await;

                if let Err(e) = result {
                    error!("Fluvio consumer error: {:?}, reconnecting in 5s", e);
                }
            }
            Err(e) => {
                error!("Fluvio connect failed: {:?}, retrying in 5s", e);
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let settler = Arc::new(TigerBeetleSettler::new());

    // Start Fluvio consumer in background
    let settler_for_consumer = settler.clone();
    tokio::spawn(async move {
        run_fluvio_consumer(settler_for_consumer).await;
    });

    // Build HTTP server
    let state = Arc::new(AppState {
        settler: TigerBeetleSettler::new(),
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/terminal/settle", post(handle_settle))
        .with_state(state);

    let port: u16 = std::env::var("RUST_SETTLEMENT_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(9100);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Terminal settlement service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    info!("Shutdown signal received");
}
