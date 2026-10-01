//! PayGate Insider Threat Engine — HTTP server
//!
//! Endpoints:
//!   POST /score             — score a privileged action request
//!   POST /baseline/update   — update actor baseline (called by Python UEBA)
//!   GET  /health            — liveness probe
//!   GET  /metrics           — engine statistics

mod internal_auth;
mod telemetry;

use actix_web::{middleware::Logger, web, App, HttpRequest, HttpResponse, HttpServer};
use insider_threat_engine::{BaselineUpdateRequest, BehaviouralEngine, ScoreRequest};
use serde_json::json;
use std::env;
use std::sync::Arc;

type EngineData = web::Data<Arc<BehaviouralEngine>>;

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn score(req: HttpRequest, key: web::Data<String>, engine: EngineData, body: web::Json<ScoreRequest>) -> HttpResponse {
    if !internal_auth::key_matches(req.headers().get("X-Internal-Key").and_then(|v| v.to_str().ok()), &key) {
        return HttpResponse::Unauthorized().json(json!({"error": "unauthorized", "code": 401}));
    }

    let response = engine.score(&body);
    HttpResponse::Ok().json(response)
}

async fn update_baseline(req: HttpRequest, key: web::Data<String>, engine: EngineData, body: web::Json<BaselineUpdateRequest>) -> HttpResponse {
    if !internal_auth::key_matches(req.headers().get("X-Internal-Key").and_then(|v| v.to_str().ok()), &key) {
        return HttpResponse::Unauthorized().json(json!({"error": "unauthorized", "code": 401}));
    }

    engine.update_baseline(&body);
    HttpResponse::Ok().json(json!({"status": "updated"}))
}

async fn health(engine: EngineData) -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "status": "ok",
        "service": "insider-threat-engine",
        "actors_tracked": engine.actor_count(),
    }))
}

async fn metrics(engine: EngineData) -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "actors_tracked": engine.actor_count(),
    }))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    telemetry::init_tracing("insider-threat-engine");
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let port: u16 = env::var("INSIDER_THREAT_ENGINE_PORT")
        .unwrap_or_else(|_| "8300".to_string())
        .parse()
        .unwrap_or(8300);

    let internal_key = web::Data::new(internal_auth::resolve_internal_key("insider-threat-engine"));
    let engine = Arc::new(BehaviouralEngine::new());
    log::info!("insider-threat-engine starting on port {}", port);

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(internal_key.clone())
            .app_data(web::Data::new(engine.clone()))
            .app_data(web::JsonConfig::default().limit(1_048_576))
            .route("/score", web::post().to(score))
            .route("/baseline/update", web::post().to(update_baseline))
            .route("/health", web::get().to(health))
            .route("/metrics", web::get().to(metrics))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
