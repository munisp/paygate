//! PayGate Credit Scoring HTTP server
//! Exposes credit score calculation over HTTP.

use actix_web::{web, App, HttpResponse, HttpServer, middleware};
use credit_scoring::{CreditScoreRequest, calculate_credit_score};
use serde_json::json;
use std::env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8100".to_string())
        .parse().unwrap_or(8100);
    log::info!("Credit Scoring starting on port {}", port);
    HttpServer::new(|| {
        App::new()
            .wrap(middleware::Logger::default())
            .route("/health", web::get().to(health))
            .route("/score/calculate", web::post().to(score_handler))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({"status": "ok", "service": "credit-scoring"}))
}

async fn score_handler(body: web::Json<CreditScoreRequest>) -> HttpResponse {
    match calculate_credit_score(body.into_inner()) {
        Ok(result) => HttpResponse::Ok().json(result),
        Err(e) => HttpResponse::BadRequest().json(json!({"error": e})),
    }
}
