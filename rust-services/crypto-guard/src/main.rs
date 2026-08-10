//! crypto-guard HTTP server
//! Exposes cryptographic security primitives as a REST microservice.
//!
//! Endpoints:
//! - POST /verify/webhook    — Verify webhook signatures (NIBSS, Stripe, PIX, Mojaloop)
//! - POST /verify/hmac       — Generic HMAC-SHA256/SHA512 verification
//! - POST /replay/check      — Check for replay attacks (Redis-backed nonce store)
//! - POST /nonce/generate    — Generate cryptographically secure nonces
//! - GET  /health            — Health check

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, sync::Arc};
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crypto_guard::{
    hmac_verify::{verify_hmac, HmacAlgorithm},
    nonce::{generate_idempotency_key, generate_nonce, generate_nonce_base64, generate_payment_nonce, generate_webhook_nonce},
    replay::{check_replay, validate_timestamp, ReplayConfig},
    webhook::{verify_webhook, WebhookVerifyRequest},
};

// ─── App State ────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    redis: Option<redis::aio::ConnectionManager>,
    replay_config: Arc<ReplayConfig>,
}

// ─── Request / Response Types ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct HmacVerifyRequest {
    key: String,       // Hex-encoded key
    payload: String,   // Base64-encoded payload
    signature: String, // Hex-encoded signature (may have "sha256=" prefix)
    algorithm: Option<String>, // "sha256" | "sha512" (default: sha256)
}

#[derive(Debug, Serialize)]
struct HmacVerifyResponse {
    valid: bool,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ReplayCheckRequest {
    nonce: String,
    timestamp_secs: i64,
}

#[derive(Debug, Serialize)]
struct NonceResponse {
    nonce: String,
    kind: String,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    service: String,
    version: String,
    redis: String,
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let redis_status = if state.redis.is_some() {
        "connected"
    } else {
        "unavailable"
    };

    Json(HealthResponse {
        status: "ok".to_string(),
        service: "crypto-guard".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        redis: redis_status.to_string(),
    })
}

async fn verify_hmac_handler(
    Json(req): Json<HmacVerifyRequest>,
) -> Result<Json<HmacVerifyResponse>, (StatusCode, Json<HmacVerifyResponse>)> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let key_bytes = match hex::decode(&req.key) {
        Ok(b) => b,
        Err(_) => req.key.as_bytes().to_vec(), // Fall back to raw bytes
    };

    let payload_bytes = match STANDARD.decode(&req.payload) {
        Ok(b) => b,
        Err(e) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(HmacVerifyResponse {
                    valid: false,
                    error: Some(format!("Invalid base64 payload: {}", e)),
                }),
            ));
        }
    };

    let algorithm = match req.algorithm.as_deref().unwrap_or("sha256") {
        "sha512" => HmacAlgorithm::Sha512,
        _ => HmacAlgorithm::Sha256,
    };

    match verify_hmac(&key_bytes, &payload_bytes, &req.signature, algorithm) {
        Ok(valid) => Ok(Json(HmacVerifyResponse { valid, error: None })),
        Err(e) => Ok(Json(HmacVerifyResponse {
            valid: false,
            error: Some(e.to_string()),
        })),
    }
}

async fn verify_webhook_handler(
    Json(req): Json<WebhookVerifyRequest>,
) -> Json<crypto_guard::webhook::WebhookVerifyResponse> {
    Json(verify_webhook(&req))
}

async fn replay_check_handler(
    State(mut state): State<AppState>,
    Json(req): Json<ReplayCheckRequest>,
) -> Result<Json<crypto_guard::replay::ReplayCheckResult>, (StatusCode, String)> {
    // First validate timestamp (no Redis needed)
    if let Err(e) = validate_timestamp(req.timestamp_secs, state.replay_config.timestamp_tolerance_secs) {
        return Ok(Json(crypto_guard::replay::ReplayCheckResult {
            is_replay: true,
            reason: Some(e.to_string()),
        }));
    }

    // Check Redis nonce store
    if let Some(ref mut conn) = state.redis {
        match check_replay(conn, &req.nonce, req.timestamp_secs, &state.replay_config).await {
            Ok(result) => Ok(Json(result)),
            Err(e) => {
                warn!("Redis replay check failed: {}", e);
                // Fail open on Redis errors (don't block legitimate requests)
                Ok(Json(crypto_guard::replay::ReplayCheckResult {
                    is_replay: false,
                    reason: Some(format!("Redis unavailable, replay check skipped: {}", e)),
                }))
            }
        }
    } else {
        // No Redis — only timestamp validation
        Ok(Json(crypto_guard::replay::ReplayCheckResult {
            is_replay: false,
            reason: Some("Redis unavailable, only timestamp validated".to_string()),
        }))
    }
}

async fn generate_nonce_handler() -> Json<NonceResponse> {
    Json(NonceResponse {
        nonce: generate_nonce(32),
        kind: "hex".to_string(),
    })
}

async fn generate_idempotency_key_handler() -> Json<NonceResponse> {
    Json(NonceResponse {
        nonce: generate_idempotency_key(),
        kind: "uuid_v4".to_string(),
    })
}

async fn generate_payment_nonce_handler() -> Json<NonceResponse> {
    Json(NonceResponse {
        nonce: generate_payment_nonce(),
        kind: "payment_nonce".to_string(),
    })
}

async fn generate_webhook_nonce_handler() -> Json<NonceResponse> {
    Json(NonceResponse {
        nonce: generate_webhook_nonce(),
        kind: "webhook_nonce".to_string(),
    })
}

async fn generate_csrf_token_handler() -> Json<NonceResponse> {
    Json(NonceResponse {
        nonce: generate_nonce_base64(32),
        kind: "csrf_token".to_string(),
    })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        ))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    // Connect to Redis (optional — service works without it)
    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://localhost:6379".to_string());

    let redis_conn = match redis::Client::open(redis_url.clone()) {
        Ok(client) => match redis::aio::ConnectionManager::new(client).await {
            Ok(conn) => {
                info!("Connected to Redis at {}", redis_url);
                Some(conn)
            }
            Err(e) => {
                warn!("Failed to connect to Redis: {}. Replay protection will use timestamp-only mode.", e);
                None
            }
        },
        Err(e) => {
            warn!("Invalid Redis URL: {}. Replay protection will use timestamp-only mode.", e);
            None
        }
    };

    let state = AppState {
        redis: redis_conn,
        replay_config: Arc::new(ReplayConfig::default()),
    };

    // Build router
    let app = Router::new()
        .route("/health", get(health))
        .route("/verify/hmac", post(verify_hmac_handler))
        .route("/verify/webhook", post(verify_webhook_handler))
        .route("/replay/check", post(replay_check_handler))
        .route("/nonce/generate", post(generate_nonce_handler))
        .route("/nonce/idempotency-key", post(generate_idempotency_key_handler))
        .route("/nonce/payment", post(generate_payment_nonce_handler))
        .route("/nonce/webhook", post(generate_webhook_nonce_handler))
        .route("/nonce/csrf", post(generate_csrf_token_handler))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(RequestBodyLimitLayer::new(1 * 1024 * 1024)) // 1 MB body limit
        .with_state(state);

    let port: u16 = std::env::var("CRYPTO_GUARD_PORT")
        .unwrap_or_else(|_| "8091".to_string())
        .parse()
        .unwrap_or(8091);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("crypto-guard listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
