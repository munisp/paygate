//! PayGate Billing Engine HTTP server
//! Exposes proration and metered billing calculations over HTTP.

mod telemetry;

use actix_web::{web, App, HttpResponse, HttpServer, middleware};
use billing_engine::{
    ProrationRequest, MeteredBillingRequest,
    calculate_proration, calculate_metered_billing,
};
use serde_json::json;
use std::env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    telemetry::init_tracing("billing-engine");
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8093".to_string())
        .parse().unwrap_or(8093);
    log::info!("Billing Engine starting on port {}", port);
    HttpServer::new(|| {
        App::new()
            .wrap(middleware::Logger::default())
            .route("/health", web::get().to(health))
            .route("/proration/calculate", web::post().to(proration_handler))
            .route("/metered/aggregate", web::post().to(metered_handler))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({"status": "ok", "service": "billing-engine"}))
}

async fn proration_handler(body: web::Json<ProrationRequest>) -> HttpResponse {
    let result = calculate_proration(&body.into_inner());
    HttpResponse::Ok().json(result)
}

async fn metered_handler(body: web::Json<MeteredBillingRequest>) -> HttpResponse {
    let result = calculate_metered_billing(&body.into_inner());
    HttpResponse::Ok().json(result)
}
