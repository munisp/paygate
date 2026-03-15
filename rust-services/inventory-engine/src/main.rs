use actix_web::{middleware, web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use chrono::Utc;
use prometheus::{Encoder, IntCounterVec, Opts, Registry, TextEncoder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, warn};
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

    state
        .check_counter
        .with_label_values(&["check"])
        .inc();

    // In production this queries the inventory_items table via DATABASE_URL.
    // Here we return a stub response that the portal can call against.
    let current_stock: i64 = 100; // stub
    let reserved_stock: i64 = 5;  // stub
    let available = current_stock - reserved_stock >= body.quantity;

    HttpResponse::Ok().json(CheckResponse {
        available,
        current_stock,
        reserved_stock,
        available_stock: current_stock - reserved_stock,
        item_id: body.item_id.clone(),
        merchant_id: body.merchant_id.clone(),
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

    state
        .reserve_counter
        .with_label_values(&["reserve"])
        .inc();

    let reservation_id = body
        .reservation_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // Reservation expires in 15 minutes
    let expires_at = (Utc::now() + chrono::Duration::minutes(15)).to_rfc3339();

    info!(
        reservation_id = %reservation_id,
        item_id = %body.item_id,
        quantity = body.quantity,
        "Inventory reserved"
    );

    HttpResponse::Ok().json(ReserveResponse {
        success: true,
        reservation_id,
        item_id: body.item_id.clone(),
        quantity_reserved: body.quantity,
        expires_at,
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

    info!(
        reservation_id = %body.reservation_id,
        item_id = %body.item_id,
        "Inventory reservation released"
    );

    HttpResponse::Ok().json(ReleaseResponse {
        success: true,
        reservation_id: body.reservation_id.clone(),
        quantity_released: 0, // stub — production reads from reservations table
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

    let previous_stock: i64 = 100; // stub
    let new_stock = previous_stock + body.delta;

    info!(
        item_id = %body.item_id,
        delta = body.delta,
        reason = %body.reason,
        "Inventory adjusted"
    );

    HttpResponse::Ok().json(AdjustResponse {
        success: true,
        item_id: body.item_id.clone(),
        previous_stock,
        new_stock,
        delta: body.delta,
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
    // Load .env if present
    let _ = dotenvy::dotenv();

    // Initialise structured JSON logging
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

    // Prometheus registry
    let registry = Arc::new(Registry::new());
    let check_counter = IntCounterVec::new(
        Opts::new("inventory_check_total", "Total inventory check requests"),
        &["operation"],
    )
    .unwrap();
    let reserve_counter = IntCounterVec::new(
        Opts::new("inventory_reserve_total", "Total inventory reserve requests"),
        &["operation"],
    )
    .unwrap();
    registry.register(Box::new(check_counter.clone())).ok();
    registry.register(Box::new(reserve_counter.clone())).ok();

    let state = web::Data::new(AppState {
        start_time: std::time::Instant::now(),
        registry,
        check_counter,
        reserve_counter,
        internal_key,
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
            // Health
            .route("/health", web::get().to(health))
            // Metrics
            .route("/metrics", web::get().to(metrics_handler))
            // Inventory operations
            .route("/inventory/check", web::post().to(check_inventory))
            .route("/inventory/reserve", web::post().to(reserve_inventory))
            .route("/inventory/release", web::post().to(release_inventory))
            .route("/inventory/adjust", web::post().to(adjust_inventory))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
