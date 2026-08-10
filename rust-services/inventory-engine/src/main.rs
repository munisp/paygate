use actix_web::{middleware, web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use chrono::Utc;
use deadpool_postgres::{Config as PgConfig, ManagerConfig, Pool, RecyclingMethod, Runtime};
use prometheus::{Encoder, IntCounterVec, Opts, Registry, TextEncoder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio_postgres::NoTls;
use tracing::{error, info, warn};
use uuid::Uuid;

// ─── Types ───────────────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
    pub uptime_seconds: u64,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckRequest {
    pub merchant_id: String,
    pub item_id: String,
    pub quantity: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckResponse {
    pub available: bool,
    pub current_stock: i64,
    pub reserved_stock: i64,
    pub available_stock: i64,
    pub item_id: String,
    pub merchant_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReserveRequest {
    pub merchant_id: String,
    pub item_id: String,
    pub quantity: i64,
    pub reservation_id: Option<String>,
    pub order_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReserveResponse {
    pub success: bool,
    pub reservation_id: String,
    pub item_id: String,
    pub quantity_reserved: i64,
    pub expires_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseRequest {
    pub reservation_id: String,
    pub merchant_id: String,
    pub item_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseResponse {
    pub success: bool,
    pub reservation_id: String,
    pub quantity_released: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AdjustRequest {
    pub merchant_id: String,
    pub item_id: String,
    pub delta: i64,
    pub reason: String,
    pub reference_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AdjustResponse {
    pub success: bool,
    pub item_id: String,
    pub previous_stock: i64,
    pub new_stock: i64,
    pub delta: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

// ─── App State ───────────────────────────────────────────────────────────────
pub struct AppState {
    pub start_time: std::time::Instant,
    pub registry: Arc<Registry>,
    pub check_counter: IntCounterVec,
    pub reserve_counter: IntCounterVec,
    pub internal_key: String,
    pub db_pool: Option<Pool>,
}

// ─── DB Pool ─────────────────────────────────────────────────────────────────
fn build_db_pool(database_url: &str) -> Option<Pool> {
    let mut cfg = PgConfig::new();
    cfg.url = Some(database_url.to_string());
    cfg.manager = Some(ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    });
    cfg.pool = Some(deadpool_postgres::PoolConfig {
        max_size: 20,
        ..Default::default()
    });
    match cfg.create_pool(Some(Runtime::Tokio1), NoTls) {
        Ok(pool) => {
            info!("inventory-engine: DB pool created (max=20)");
            Some(pool)
        }
        Err(e) => {
            warn!("inventory-engine: DB pool creation failed: {} — running without DB", e);
            None
        }
    }
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
fn verify_internal_key(req: &HttpRequest, state: &web::Data<AppState>) -> bool {
    if state.internal_key.is_empty() {
        return true; // No key configured — allow all (dev mode)
    }
    req.headers()
        .get("X-Internal-Key")
        .and_then(|v| v.to_str().ok())
        .map(|v| v == state.internal_key)
        .unwrap_or(false)
}

// ─── Handlers ────────────────────────────────────────────────────────────────
async fn health(state: web::Data<AppState>) -> impl Responder {
    let uptime = state.start_time.elapsed().as_secs();
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".to_string(),
        service: "inventory-engine".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: uptime,
        timestamp: Utc::now().to_rfc3339(),
    })
}

async fn check_inventory(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CheckRequest>,
) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse {
            error: "Unauthorized".to_string(),
            code: "UNAUTHORIZED".to_string(),
        });
    }
    state.check_counter.with_label_values(&["check"]).inc();

    if let Some(pool) = &state.db_pool {
        match pool.get().await {
            Ok(client) => {
                let query = "
                    SELECT
                        COALESCE(i.quantity_on_hand, 0) AS current_stock,
                        COALESCE(SUM(r.quantity) FILTER (WHERE r.status = 'active' AND r.expires_at > NOW()), 0) AS reserved_stock
                    FROM inventory_items i
                    LEFT JOIN inventory_reservations r ON r.item_id = i.item_id AND r.merchant_id = i.merchant_id
                    WHERE i.item_id = $1 AND i.merchant_id = $2
                    GROUP BY i.quantity_on_hand
                ";
                match client.query_opt(query, &[&body.item_id, &body.merchant_id]).await {
                    Ok(Some(row)) => {
                        let current_stock: i64 = row.get(0);
                        let reserved_stock: i64 = row.get(1);
                        let available_stock = current_stock - reserved_stock;
                        return HttpResponse::Ok().json(CheckResponse {
                            available: available_stock >= body.quantity,
                            current_stock,
                            reserved_stock,
                            available_stock,
                            item_id: body.item_id.clone(),
                            merchant_id: body.merchant_id.clone(),
                        });
                    }
                    Ok(None) => {
                        return HttpResponse::NotFound().json(ErrorResponse {
                            error: format!("Item {} not found", body.item_id),
                            code: "ITEM_NOT_FOUND".to_string(),
                        });
                    }
                    Err(e) => {
                        error!("inventory check query failed: {}", e);
                    }
                }
            }
            Err(e) => {
                error!("inventory check: DB pool exhausted: {}", e);
            }
        }
    }

    HttpResponse::ServiceUnavailable().json(ErrorResponse {
        error: "Inventory service temporarily unavailable".to_string(),
        code: "SERVICE_UNAVAILABLE".to_string(),
    })
}

async fn reserve_inventory(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<ReserveRequest>,
) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse {
            error: "Unauthorized".to_string(),
            code: "UNAUTHORIZED".to_string(),
        });
    }
    state.reserve_counter.with_label_values(&["reserve"]).inc();

    let reservation_id = body
        .reservation_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let expires_at = Utc::now() + chrono::Duration::minutes(15);

    if let Some(pool) = &state.db_pool {
        match pool.get().await {
            Ok(client) => {
                // Use a transaction to atomically check and reserve
                let tx_result: Result<(), tokio_postgres::Error> = async {
                    let tx = client.build_transaction().start().await?;
                    // Lock the row for update
                    let row = tx.query_opt(
                        "SELECT quantity_on_hand FROM inventory_items WHERE item_id = $1 AND merchant_id = $2 FOR UPDATE",
                        &[&body.item_id, &body.merchant_id],
                    ).await?;

                    let current_stock: i64 = row.map(|r| r.get(0)).unwrap_or(0);
                    let reserved: i64 = tx.query_one(
                        "SELECT COALESCE(SUM(quantity), 0) FROM inventory_reservations WHERE item_id = $1 AND merchant_id = $2 AND status = 'active' AND expires_at > NOW()",
                        &[&body.item_id, &body.merchant_id],
                    ).await?.get(0);

                    if current_stock - reserved < body.quantity {
                        return Err(tokio_postgres::Error::__private_api_not_stable());
                    }

                    tx.execute(
                        "INSERT INTO inventory_reservations (reservation_id, item_id, merchant_id, quantity, order_id, status, expires_at, created_at)
                         VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())
                         ON CONFLICT (reservation_id) DO NOTHING",
                        &[&reservation_id, &body.item_id, &body.merchant_id, &body.quantity,
                          &body.order_id.as_deref().unwrap_or(""), &expires_at],
                    ).await?;
                    tx.commit().await?;
                    Ok(())
                }.await;

                match tx_result {
                    Ok(()) => {
                        info!(
                            reservation_id = %reservation_id,
                            item_id = %body.item_id,
                            quantity = body.quantity,
                            "Inventory reserved"
                        );
                        return HttpResponse::Ok().json(ReserveResponse {
                            success: true,
                            reservation_id,
                            item_id: body.item_id.clone(),
                            quantity_reserved: body.quantity,
                            expires_at: expires_at.to_rfc3339(),
                        });
                    }
                    Err(e) => {
                        error!("inventory reserve transaction failed: {}", e);
                        return HttpResponse::Conflict().json(ErrorResponse {
                            error: "Insufficient stock or reservation conflict".to_string(),
                            code: "INSUFFICIENT_STOCK".to_string(),
                        });
                    }
                }
            }
            Err(e) => {
                error!("inventory reserve: DB pool exhausted: {}", e);
            }
        }
    }

    HttpResponse::ServiceUnavailable().json(ErrorResponse {
        error: "Inventory service temporarily unavailable".to_string(),
        code: "SERVICE_UNAVAILABLE".to_string(),
    })
}

async fn release_inventory(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<ReleaseRequest>,
) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse {
            error: "Unauthorized".to_string(),
            code: "UNAUTHORIZED".to_string(),
        });
    }

    if let Some(pool) = &state.db_pool {
        match pool.get().await {
            Ok(client) => {
                let result = client.query_opt(
                    "UPDATE inventory_reservations SET status = 'released', released_at = NOW()
                     WHERE reservation_id = $1 AND merchant_id = $2 AND item_id = $3 AND status = 'active'
                     RETURNING quantity",
                    &[&body.reservation_id, &body.merchant_id, &body.item_id],
                ).await;

                match result {
                    Ok(Some(row)) => {
                        let quantity_released: i64 = row.get(0);
                        info!(
                            reservation_id = %body.reservation_id,
                            quantity_released = quantity_released,
                            "Inventory reservation released"
                        );
                        return HttpResponse::Ok().json(ReleaseResponse {
                            success: true,
                            reservation_id: body.reservation_id.clone(),
                            quantity_released,
                        });
                    }
                    Ok(None) => {
                        return HttpResponse::NotFound().json(ErrorResponse {
                            error: format!("Reservation {} not found or already released", body.reservation_id),
                            code: "RESERVATION_NOT_FOUND".to_string(),
                        });
                    }
                    Err(e) => {
                        error!("inventory release failed: {}", e);
                    }
                }
            }
            Err(e) => {
                error!("inventory release: DB pool exhausted: {}", e);
            }
        }
    }

    HttpResponse::ServiceUnavailable().json(ErrorResponse {
        error: "Inventory service temporarily unavailable".to_string(),
        code: "SERVICE_UNAVAILABLE".to_string(),
    })
}

async fn adjust_inventory(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<AdjustRequest>,
) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse {
            error: "Unauthorized".to_string(),
            code: "UNAUTHORIZED".to_string(),
        });
    }

    if let Some(pool) = &state.db_pool {
        match pool.get().await {
            Ok(client) => {
                let result = client.query_opt(
                    "UPDATE inventory_items
                     SET quantity_on_hand = quantity_on_hand + $3, updated_at = NOW()
                     WHERE item_id = $1 AND merchant_id = $2
                     RETURNING quantity_on_hand - $3 AS previous_stock, quantity_on_hand AS new_stock",
                    &[&body.item_id, &body.merchant_id, &body.delta],
                ).await;

                match result {
                    Ok(Some(row)) => {
                        let previous_stock: i64 = row.get(0);
                        let new_stock: i64 = row.get(1);
                        // Audit log
                        let _ = client.execute(
                            "INSERT INTO inventory_audit_log (item_id, merchant_id, delta, reason, reference_id, previous_stock, new_stock, created_at)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())",
                            &[&body.item_id, &body.merchant_id, &body.delta, &body.reason,
                              &body.reference_id.as_deref().unwrap_or(""), &previous_stock, &new_stock],
                        ).await;
                        info!(
                            item_id = %body.item_id,
                            delta = body.delta,
                            reason = %body.reason,
                            "Inventory adjusted"
                        );
                        return HttpResponse::Ok().json(AdjustResponse {
                            success: true,
                            item_id: body.item_id.clone(),
                            previous_stock,
                            new_stock,
                            delta: body.delta,
                        });
                    }
                    Ok(None) => {
                        return HttpResponse::NotFound().json(ErrorResponse {
                            error: format!("Item {} not found", body.item_id),
                            code: "ITEM_NOT_FOUND".to_string(),
                        });
                    }
                    Err(e) => {
                        error!("inventory adjust failed: {}", e);
                    }
                }
            }
            Err(e) => {
                error!("inventory adjust: DB pool exhausted: {}", e);
            }
        }
    }

    HttpResponse::ServiceUnavailable().json(ErrorResponse {
        error: "Inventory service temporarily unavailable".to_string(),
        code: "SERVICE_UNAVAILABLE".to_string(),
    })
}

async fn metrics_handler(state: web::Data<AppState>) -> impl Responder {
    let encoder = TextEncoder::new();
    let metric_families = state.registry.gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).unwrap_or_default();
    HttpResponse::Ok()
        .content_type("text/plain; version=0.0.4")
        .body(buffer)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("inventory_engine=info".parse().unwrap()),
        )
        .init();

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8091".to_string())
        .parse()
        .unwrap_or(8091);
    let internal_key = std::env::var("INTERNAL_API_KEY").unwrap_or_default();
    let database_url = std::env::var("DATABASE_URL").unwrap_or_default();

    // Build DB pool
    let db_pool = if database_url.is_empty() {
        warn!("DATABASE_URL not set — inventory-engine running without DB");
        None
    } else {
        build_db_pool(&database_url)
    };

    // Prometheus registry
    let registry = Arc::new(Registry::new());
    let check_counter = IntCounterVec::new(
        Opts::new("inventory_check_total", "Total inventory check requests"),
        &["operation"],
    ).unwrap();
    let reserve_counter = IntCounterVec::new(
        Opts::new("inventory_reserve_total", "Total inventory reserve requests"),
        &["operation"],
    ).unwrap();
    registry.register(Box::new(check_counter.clone())).ok();
    registry.register(Box::new(reserve_counter.clone())).ok();

    let state = web::Data::new(AppState {
        start_time: std::time::Instant::now(),
        registry,
        check_counter,
        reserve_counter,
        internal_key,
        db_pool,
    });

    info!(port = port, "Inventory Engine starting");
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .app_data(web::JsonConfig::default().error_handler(|err, _req| {
                let response = HttpResponse::BadRequest().json(ErrorResponse {
                    error: err.to_string(),
                    code: "INVALID_JSON".to_string(),
                });
                actix_web::error::InternalError::from_response(err, response).into()
            }))
            .wrap(middleware::Logger::default())
            .route("/health", web::get().to(health))
            .route("/metrics", web::get().to(metrics_handler))
            .route("/inventory/check", web::post().to(check_inventory))
            .route("/inventory/reserve", web::post().to(reserve_inventory))
            .route("/inventory/release", web::post().to(release_inventory))
            .route("/inventory/adjust", web::post().to(adjust_inventory))
    })
    .workers(num_cpus::get())
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
