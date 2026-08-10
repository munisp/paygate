// PayGate Billing Core — HTTP Server
// Exposes a Dapr-compatible service invocation endpoint for billing computation.
// Also runs a Kafka consumer loop for payment.completed events.

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use billing_core::{
    config::AppConfig,
    engine::BillingEngine,
    ledger::TigerBeetleClient,
    models::{BillingResult, SignOnFeeEvent, SubscriptionBillingEvent, TransactionEvent},
};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, instrument};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    config: AppConfig,
    redis: redis::aio::ConnectionManager,
    db: sqlx::PgPool,
    tb: Arc<TigerBeetleClient>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HealthResponse {
    status: String,
    service: String,
    version: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ComputeRequest {
    event: TransactionEvent,
}

#[derive(Debug, Serialize, Deserialize)]
struct ComputeSignOnRequest {
    event: SignOnFeeEvent,
}

#[derive(Debug, Serialize, Deserialize)]
struct ComputeSubscriptionRequest {
    event: SubscriptionBillingEvent,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = AppConfig::from_env().expect("Failed to load config");

    // Tracing
    tracing_subscriber::fmt()
        .with_env_filter(&cfg.log_level)
        .json()
        .init();

    info!("Starting PayGate Billing Core v{}", env!("CARGO_PKG_VERSION"));

    // Redis
    let redis_client = redis::Client::open(cfg.redis_url.clone())?;
    let redis_mgr = redis::aio::ConnectionManager::new(redis_client).await?;

    // PostgreSQL
    let db = sqlx::PgPool::connect(&cfg.database_url).await?;

    // TigerBeetle
    let tb = Arc::new(TigerBeetleClient::new(&cfg.tigerbeetle_url));

    let state = AppState {
        config: cfg.clone(),
        redis: redis_mgr,
        db,
        tb,
    };

    // Spawn Kafka consumer
    let kafka_state = state.clone();
    tokio::spawn(async move {
        run_kafka_consumer(kafka_state).await;
    });

    // HTTP server
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/billing/compute", post(compute_transaction_handler))
        .route("/billing/sign-on", post(compute_sign_on_handler))
        .route("/billing/subscription", post(compute_subscription_handler))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", cfg.server_port);
    info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        service: "paygate-billing-core".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[instrument(skip(state))]
async fn compute_transaction_handler(
    State(state): State<AppState>,
    Json(req): Json<ComputeRequest>,
) -> Result<Json<BillingResult>, (StatusCode, String)> {
    // Idempotency check
    let idem_key = format!("billing:idem:{}", req.event.idempotency_key);
    let mut redis = state.redis.clone();
    let exists: bool = redis
        .exists(&idem_key)
        .await
        .unwrap_or(false);

    if exists {
        return Err((
            StatusCode::CONFLICT,
            format!("Duplicate event: {}", req.event.idempotency_key),
        ));
    }

    // Load billing config from Redis (hot path) or PostgreSQL (cold path)
    let config = load_billing_config(&state, req.event.tenant_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Compute billing
    let result = BillingEngine::compute_transaction(&req.event, &config)
        .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()))?;

    match result {
        None => Err((StatusCode::NO_CONTENT, "Transaction not billable".to_string())),
        Some(billing) => {
            // Post to TigerBeetle
            state
                .tb
                .post_transfers(&billing.ledger_transfers)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            // Mark idempotency key (TTL 7 days)
            let _: () = redis
                .set_ex(&idem_key, "1", 604_800)
                .await
                .unwrap_or(());

            info!(
                billing_id = %billing.billing_id,
                tenant_id = %billing.tenant_id,
                gross_fee_kobo = billing.gross_fee_kobo,
                platform_revenue_kobo = billing.platform_revenue_kobo,
                "Billing computed"
            );

            Ok(Json(billing))
        }
    }
}

#[instrument(skip(state))]
async fn compute_sign_on_handler(
    State(state): State<AppState>,
    Json(req): Json<ComputeSignOnRequest>,
) -> Result<Json<BillingResult>, (StatusCode, String)> {
    let config = load_billing_config(&state, req.event.tenant_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let result = BillingEngine::compute_sign_on_fee(&req.event, &config)
        .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()))?;

    state
        .tb
        .post_transfers(&result.ledger_transfers)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(result))
}

#[instrument(skip(state))]
async fn compute_subscription_handler(
    State(state): State<AppState>,
    Json(req): Json<ComputeSubscriptionRequest>,
) -> Result<Json<BillingResult>, (StatusCode, String)> {
    let config = load_billing_config(&state, req.event.tenant_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let result = BillingEngine::compute_subscription(&req.event, &config)
        .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()))?;

    state
        .tb
        .post_transfers(&result.ledger_transfers)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(result))
}

async fn load_billing_config(
    state: &AppState,
    tenant_id: Uuid,
) -> anyhow::Result<billing_core::models::BillingConfig> {
    let cache_key = format!("billing:config:{}", tenant_id);
    let mut redis = state.redis.clone();

    // Try Redis first
    if let Ok(cached) = redis.get::<_, String>(&cache_key).await {
        if let Ok(config) = serde_json::from_str(&cached) {
            return Ok(config);
        }
    }

    // Fall back to PostgreSQL
    let row = sqlx::query!(
        r#"
        SELECT
            tenant_id, pricing_model, fee_rate, fee_cap_kobo, fee_floor_kobo,
            platform_share, reseller_share, interchange_cost_kobo,
            sign_on_fee_kobo, sign_on_platform_share,
            subscription_fee_kobo, subscription_platform_share,
            tb_merchant_payable_account, tb_platform_revenue_account,
            tb_reseller_payable_account, tb_interchange_cost_account,
            tb_sign_on_revenue_account, created_at, updated_at, version
        FROM billing_configs
        WHERE tenant_id = $1 AND active = true
        "#,
        tenant_id
    )
    .fetch_one(&state.db)
    .await?;

    let config = billing_core::models::BillingConfig {
        tenant_id: row.tenant_id,
        pricing_model: serde_json::from_str(&format!("\"{}\"", row.pricing_model))?,
        fee_rate: row.fee_rate,
        fee_cap_kobo: row.fee_cap_kobo,
        fee_floor_kobo: row.fee_floor_kobo,
        platform_share: row.platform_share,
        reseller_share: row.reseller_share,
        interchange_cost_kobo: row.interchange_cost_kobo,
        sign_on_fee_kobo: row.sign_on_fee_kobo,
        sign_on_platform_share: row.sign_on_platform_share,
        subscription_fee_kobo: row.subscription_fee_kobo,
        subscription_platform_share: row.subscription_platform_share,
        tb_merchant_payable_account: row.tb_merchant_payable_account,
        tb_platform_revenue_account: row.tb_platform_revenue_account,
        tb_reseller_payable_account: row.tb_reseller_payable_account,
        tb_interchange_cost_account: row.tb_interchange_cost_account,
        tb_sign_on_revenue_account: row.tb_sign_on_revenue_account,
        created_at: row.created_at,
        updated_at: row.updated_at,
        version: row.version,
    };

    // Warm Redis cache (TTL 5 minutes)
    if let Ok(json) = serde_json::to_string(&config) {
        let _: () = redis.set_ex(&cache_key, json, 300).await.unwrap_or(());
    }

    Ok(config)
}

async fn run_kafka_consumer(state: AppState) {
    use rdkafka::consumer::{Consumer, StreamConsumer};
    use rdkafka::message::Message;
    use rdkafka::ClientConfig;

    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &state.config.kafka_brokers)
        .set("group.id", &state.config.kafka_group_id)
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", "earliest")
        .create()
        .expect("Failed to create Kafka consumer");

    consumer
        .subscribe(&[&state.config.kafka_topic_payment_completed])
        .expect("Failed to subscribe to Kafka topic");

    info!("Kafka consumer started on topic: {}", state.config.kafka_topic_payment_completed);

    loop {
        match consumer.recv().await {
            Err(e) => error!("Kafka error: {}", e),
            Ok(msg) => {
                if let Some(payload) = msg.payload() {
                    match serde_json::from_slice::<TransactionEvent>(payload) {
                        Ok(event) => {
                            let s = state.clone();
                            tokio::spawn(async move {
                                let config = match load_billing_config(&s, event.tenant_id).await {
                                    Ok(c) => c,
                                    Err(e) => {
                                        error!("Config load error: {}", e);
                                        return;
                                    }
                                };
                                match BillingEngine::compute_transaction(&event, &config) {
                                    Ok(Some(result)) => {
                                        if let Err(e) = s.tb.post_transfers(&result.ledger_transfers).await {
                                            error!("TigerBeetle post error: {}", e);
                                        } else {
                                            info!("Kafka billing computed: {}", result.billing_id);
                                        }
                                    }
                                    Ok(None) => {}
                                    Err(e) => error!("Billing error: {}", e),
                                }
                            });
                        }
                        Err(e) => error!("Kafka deserialize error: {}", e),
                    }
                }
            }
        }
    }
}
