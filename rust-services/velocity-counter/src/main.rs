mod telemetry;

use actix_web::{web, App, HttpServer, HttpResponse, middleware::Logger};
use redis::Client;
use serde::{Deserialize, Serialize};
use tracing::info;
use velocity_counter::{increment_and_get, get_current};

#[derive(Clone)]
struct AppState {
    redis: Client,
}

#[derive(Deserialize)]
struct CheckRequest {
    amount_kobo: u64,
}

#[derive(Serialize)]
struct CheckResponse {
    count: u64,
    amount_kobo: u64,
}

/// POST /check/{merchant_id}/{channel}/{window_seconds}
/// Increments the counter and returns the new window totals.
async fn check_and_increment(
    path: web::Path<(String, String, u64)>,
    body: web::Json<CheckRequest>,
    state: web::Data<AppState>,
) -> HttpResponse {
    let (merchant_id, channel, window_seconds) = path.into_inner();
    match increment_and_get(&state.redis, &merchant_id, &channel, window_seconds, body.amount_kobo) {
        Ok(result) => HttpResponse::Ok().json(CheckResponse {
            count: result.count,
            amount_kobo: result.amount_kobo,
        }),
        Err(e) => {
            tracing::error!("Redis error: {}", e);
            HttpResponse::InternalServerError().body(e.to_string())
        }
    }
}

/// GET /current/{merchant_id}/{channel}/{window_seconds}
/// Returns current window totals without incrementing.
async fn get_window_current(
    path: web::Path<(String, String, u64)>,
    state: web::Data<AppState>,
) -> HttpResponse {
    let (merchant_id, channel, window_seconds) = path.into_inner();
    match get_current(&state.redis, &merchant_id, &channel, window_seconds) {
        Ok(result) => HttpResponse::Ok().json(CheckResponse {
            count: result.count,
            amount_kobo: result.amount_kobo,
        }),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

/// GET /health
async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    telemetry::init_tracing("velocity-counter");

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let redis_client = Client::open(redis_url.as_str()).expect("Failed to connect to Redis");
    info!("Velocity counter starting on :8090");

    let state = web::Data::new(AppState { redis: redis_client });

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(Logger::default())
            .route("/health", web::get().to(health))
            .route("/check/{merchant_id}/{channel}/{window_seconds}", web::post().to(check_and_increment))
            .route("/current/{merchant_id}/{channel}/{window_seconds}", web::get().to(get_window_current))
    })
    .bind("0.0.0.0:8090")?
    .run()
    .await
}
