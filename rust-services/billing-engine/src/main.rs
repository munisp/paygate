//! PayGate Billing Engine HTTP server
//! Exposes proration and metered billing calculations over HTTP.

mod internal_auth;
mod telemetry;

use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, middleware};
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
    let internal_key = web::Data::new(internal_auth::resolve_internal_key("billing-engine"));
    log::info!("Billing Engine starting on port {}", port);
    HttpServer::new(move || {
        App::new()
            .wrap(middleware::Logger::default())
            .app_data(internal_key.clone())
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

async fn proration_handler(req: HttpRequest, key: web::Data<String>, body: web::Json<ProrationRequest>) -> HttpResponse {
    if !internal_auth::key_matches(req.headers().get("X-Internal-Key").and_then(|v| v.to_str().ok()), &key) {
        return HttpResponse::Unauthorized().json(json!({"error": "unauthorized", "code": 401}));
    }
    let result = calculate_proration(&body.into_inner());
    HttpResponse::Ok().json(result)
}

async fn metered_handler(req: HttpRequest, key: web::Data<String>, body: web::Json<MeteredBillingRequest>) -> HttpResponse {
    if !internal_auth::key_matches(req.headers().get("X-Internal-Key").and_then(|v| v.to_str().ok()), &key) {
        return HttpResponse::Unauthorized().json(json!({"error": "unauthorized", "code": 401}));
    }
    let result = calculate_metered_billing(&body.into_inner());
    HttpResponse::Ok().json(result)
}
