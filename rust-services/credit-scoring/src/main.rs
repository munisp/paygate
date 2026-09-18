//! PayGate Credit Scoring HTTP server v2.0
//! Exposes credit score calculation over HTTP.
//! v2.0: Adds DataFusion-powered batch feature extraction from S3/MinIO lakehouse.

mod telemetry;

use actix_web::{web, App, HttpResponse, HttpServer, middleware};
use credit_scoring::{
    CreditScoreRequest, CreditFeatures, calculate_credit_score,
    datafusion_analytics::{LakehouseConfig, extract_credit_features, run_analytics_query},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;

#[derive(Debug, Serialize, Deserialize)]
struct LakehouseScoreRequest {
    merchant_id: String,
    repayment_history_score: f64,
    outstanding_loan_kobo: u64,
    include_features: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AnalyticsQueryRequest {
    sql: String,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    telemetry::init_tracing("credit-scoring");
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "8100".to_string())
        .parse().unwrap_or(8100);
    log::info!("Credit Scoring v2.0 starting on port {} (DataFusion enabled)", port);

    HttpServer::new(|| {
        App::new()
            .wrap(middleware::Logger::default())
            .route("/health", web::get().to(health))
            // Manual feature scoring (existing endpoint)
            .route("/score/calculate", web::post().to(score_handler))
            // DataFusion-powered: extract features from lakehouse then score
            .route("/score/merchant/{merchant_id}", web::post().to(score_from_lakehouse))
            // Raw DataFusion SQL analytics
            .route("/analytics/query", web::post().to(analytics_query))
            // DataFusion feature extraction only (no scoring)
            .route("/features/{merchant_id}", web::get().to(get_features))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "status": "ok",
        "service": "credit-scoring",
        "version": "2.0.0",
        "engines": ["weighted-linear-model", "datafusion-lakehouse"]
    }))
}

async fn score_handler(body: web::Json<CreditScoreRequest>) -> HttpResponse {
    match calculate_credit_score(body.into_inner()) {
        Ok(result) => HttpResponse::Ok().json(result),
        Err(e) => HttpResponse::BadRequest().json(json!({"error": e})),
    }
}

/// Extract features from the MinIO/S3 lakehouse via DataFusion, then compute score.
async fn score_from_lakehouse(
    path: web::Path<String>,
    body: web::Json<LakehouseScoreRequest>,
) -> HttpResponse {
    let merchant_id = path.into_inner();
    let config = LakehouseConfig::from_env();

    let lh_features = match extract_credit_features(&merchant_id, &config).await {
        Ok(f) => f,
        Err(e) => {
            log::warn!("DataFusion feature extraction failed: {} — using zeros", e);
            credit_scoring::datafusion_analytics::LakehouseCreditFeatures {
                merchant_id: merchant_id.clone(),
                gmv_30d_kobo: 0,
                avg_daily_txns: 0.0,
                dispute_rate: 0.0,
                chargeback_rate: 0.0,
                account_age_days: 0,
                active_days_ratio: 0.0,
                p90_txn_amount_kobo: 0,
                channel_diversity_score: 0.0,
                weekend_txn_ratio: 0.0,
                refund_rate: 0.0,
                avg_txn_gap_hours: 0.0,
                extracted_at: chrono::Utc::now().to_rfc3339(),
            }
        }
    };

    let features = CreditFeatures {
        gmv_30d_kobo: lh_features.gmv_30d_kobo,
        avg_daily_txns: lh_features.avg_daily_txns,
        dispute_rate: lh_features.dispute_rate,
        chargeback_rate: lh_features.chargeback_rate,
        account_age_days: lh_features.account_age_days,
        repayment_history_score: body.repayment_history_score,
        active_days_ratio: lh_features.active_days_ratio,
        outstanding_loan_kobo: body.outstanding_loan_kobo,
        p90_txn_amount_kobo: Some(lh_features.p90_txn_amount_kobo),
        channel_diversity_score: Some(lh_features.channel_diversity_score),
        weekend_txn_ratio: Some(lh_features.weekend_txn_ratio),
        refund_rate: Some(lh_features.refund_rate),
    };

    let mut result = credit_scoring::compute_credit_score(&features);
    result.feature_source = "datafusion-lakehouse".to_string();
    if body.include_features.unwrap_or(false) {
        result.lakehouse_features = Some(lh_features);
    }

    HttpResponse::Ok().json(result)
}

/// Run a raw DataFusion SQL query against the lakehouse Parquet files.
async fn analytics_query(body: web::Json<AnalyticsQueryRequest>) -> HttpResponse {
    let config = LakehouseConfig::from_env();
    match run_analytics_query(&body.sql, &config).await {
        Ok(rows) => HttpResponse::Ok().json(json!({
            "rows": rows,
            "count": rows.len(),
            "engine": "datafusion"
        })),
        Err(e) => HttpResponse::BadRequest().json(json!({"error": e})),
    }
}

/// Return DataFusion-extracted features for a merchant without scoring.
async fn get_features(path: web::Path<String>) -> HttpResponse {
    let merchant_id = path.into_inner();
    let config = LakehouseConfig::from_env();
    match extract_credit_features(&merchant_id, &config).await {
        Ok(features) => HttpResponse::Ok().json(json!({
            "merchant_id": merchant_id,
            "features": features,
            "engine": "datafusion"
        })),
        Err(e) => HttpResponse::InternalServerError().json(json!({"error": e})),
    }
}
