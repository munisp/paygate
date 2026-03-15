use actix_web::{middleware, web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use chrono::Utc;
use prometheus::{Encoder, IntCounterVec, Opts, Registry, TextEncoder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;
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
pub struct BalanceResponse {
    pub account_id: String,
    pub program_id: String,
    pub points_balance: i64,
    pub lifetime_points: i64,
    pub tier: String,
    pub tier_progress_pct: f64,
    pub next_tier: Option<String>,
    pub points_to_next_tier: Option<i64>,
    pub as_of: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EarnRequest {
    pub account_id: String,
    pub program_id: String,
    pub merchant_id: String,
    pub transaction_id: String,
    pub amount_cents: i64,
    pub currency: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EarnResponse {
    pub success: bool,
    pub transaction_id: String,
    pub ledger_entry_id: String,
    pub points_earned: i64,
    pub new_balance: i64,
    pub tier: String,
    pub tier_upgraded: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RedeemRequest {
    pub account_id: String,
    pub program_id: String,
    pub merchant_id: String,
    pub points: i64,
    pub order_id: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RedeemResponse {
    pub success: bool,
    pub ledger_entry_id: String,
    pub points_redeemed: i64,
    pub new_balance: i64,
    pub discount_value_cents: i64,
    pub currency: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransactionHistoryResponse {
    pub account_id: String,
    pub transactions: Vec<LedgerEntry>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub id: String,
    pub entry_type: String, // "earn" | "redeem" | "expire" | "adjust"
    pub points: i64,
    pub balance_after: i64,
    pub description: String,
    pub reference_id: Option<String>,
    pub created_at: String,
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
    pub earn_counter: IntCounterVec,
    pub redeem_counter: IntCounterVec,
    pub internal_key: String,
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

fn verify_internal_key(req: &HttpRequest, state: &web::Data<AppState>) -> bool {
    if state.internal_key.is_empty() {
        return true;
    }
    req.headers()
        .get("X-Internal-Key")
        .and_then(|v| v.to_str().ok())
        .map(|v| v == state.internal_key)
        .unwrap_or(false)
}

// ─── Tier Calculation ─────────────────────────────────────────────────────────

fn calculate_tier(lifetime_points: i64) -> (&'static str, Option<&'static str>, Option<i64>) {
    match lifetime_points {
        0..=999 => ("Bronze", Some("Silver"), Some(1000 - lifetime_points)),
        1000..=4999 => ("Silver", Some("Gold"), Some(5000 - lifetime_points)),
        5000..=19999 => ("Gold", Some("Platinum"), Some(20000 - lifetime_points)),
        _ => ("Platinum", None, None),
    }
}

fn calculate_points_earned(amount_cents: i64) -> i64 {
    // 1 point per 100 NGN (or equivalent cents)
    amount_cents / 100
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn health(state: web::Data<AppState>) -> impl Responder {
    let uptime = state.start_time.elapsed().as_secs();
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".to_string(),
        service: "loyalty-ledger".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: uptime,
        timestamp: Utc::now().to_rfc3339(),
    })
}

async fn get_balance(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse {
            error: "Unauthorized".to_string(),
            code: "UNAUTHORIZED".to_string(),
        });
    }

    let account_id = path.into_inner();
    // Stub: in production queries loyalty_accounts + loyalty_transactions tables
    let points_balance: i64 = 1250;
    let lifetime_points: i64 = 3500;
    let (tier, next_tier, points_to_next) = calculate_tier(lifetime_points);
    let tier_progress = match tier {
        "Bronze" => lifetime_points as f64 / 1000.0 * 100.0,
        "Silver" => (lifetime_points - 1000) as f64 / 4000.0 * 100.0,
        "Gold" => (lifetime_points - 5000) as f64 / 15000.0 * 100.0,
        _ => 100.0,
    };

    HttpResponse::Ok().json(BalanceResponse {
        account_id,
        program_id: "default".to_string(),
        points_balance,
        lifetime_points,
        tier: tier.to_string(),
        tier_progress_pct: tier_progress.min(100.0),
        next_tier: next_tier.map(|t| t.to_string()),
        points_to_next_tier: points_to_next,
        as_of: Utc::now().to_rfc3339(),
    })
}

async fn earn_points(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<EarnRequest>,
) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse {
            error: "Unauthorized".to_string(),
            code: "UNAUTHORIZED".to_string(),
        });
    }

    state.earn_counter.with_label_values(&["earn"]).inc();

    let points_earned = calculate_points_earned(body.amount_cents);
    let ledger_entry_id = Uuid::new_v4().to_string();
    let new_balance: i64 = 1250 + points_earned; // stub
    let lifetime: i64 = 3500 + points_earned;
    let (tier, _, _) = calculate_tier(lifetime);

    info!(
        account_id = %body.account_id,
        points_earned = points_earned,
        transaction_id = %body.transaction_id,
        "Loyalty points earned"
    );

    HttpResponse::Ok().json(EarnResponse {
        success: true,
        transaction_id: body.transaction_id.clone(),
        ledger_entry_id,
        points_earned,
        new_balance,
        tier: tier.to_string(),
        tier_upgraded: false, // stub
    })
}

async fn redeem_points(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<RedeemRequest>,
) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse {
            error: "Unauthorized".to_string(),
            code: "UNAUTHORIZED".to_string(),
        });
    }

    state.redeem_counter.with_label_values(&["redeem"]).inc();

    // Stub balance check
    let current_balance: i64 = 1250;
    if body.points > current_balance {
        return HttpResponse::BadRequest().json(ErrorResponse {
            error: format!(
                "Insufficient points: have {}, requested {}",
                current_balance, body.points
            ),
            code: "INSUFFICIENT_POINTS".to_string(),
        });
    }

    let ledger_entry_id = Uuid::new_v4().to_string();
    let new_balance = current_balance - body.points;
    // 1 point = 1 NGN discount (stub conversion rate)
    let discount_value_cents = body.points * 100;

    info!(
        account_id = %body.account_id,
        points_redeemed = body.points,
        order_id = %body.order_id,
        "Loyalty points redeemed"
    );

    HttpResponse::Ok().json(RedeemResponse {
        success: true,
        ledger_entry_id,
        points_redeemed: body.points,
        new_balance,
        discount_value_cents,
        currency: "NGN".to_string(),
    })
}

async fn get_history(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse {
            error: "Unauthorized".to_string(),
            code: "UNAUTHORIZED".to_string(),
        });
    }

    let account_id = path.into_inner();
    // Stub: in production queries loyalty_transactions table
    HttpResponse::Ok().json(TransactionHistoryResponse {
        account_id,
        transactions: vec![
            LedgerEntry {
                id: Uuid::new_v4().to_string(),
                entry_type: "earn".to_string(),
                points: 50,
                balance_after: 1250,
                description: "Purchase reward".to_string(),
                reference_id: Some("txn_abc123".to_string()),
                created_at: Utc::now().to_rfc3339(),
            },
        ],
        total: 1,
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
                .add_directive("loyalty_ledger=info".parse().unwrap()),
        )
        .init();

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8092".to_string())
        .parse()
        .unwrap_or(8092);

    let internal_key = std::env::var("INTERNAL_API_KEY").unwrap_or_default();

    let registry = Arc::new(Registry::new());
    let earn_counter = IntCounterVec::new(
        Opts::new("loyalty_earn_total", "Total loyalty earn operations"),
        &["operation"],
    )
    .unwrap();
    let redeem_counter = IntCounterVec::new(
        Opts::new("loyalty_redeem_total", "Total loyalty redeem operations"),
        &["operation"],
    )
    .unwrap();
    registry.register(Box::new(earn_counter.clone())).ok();
    registry.register(Box::new(redeem_counter.clone())).ok();

    let state = web::Data::new(AppState {
        start_time: std::time::Instant::now(),
        registry,
        earn_counter,
        redeem_counter,
        internal_key,
    });

    info!(port = port, "Loyalty Ledger starting");

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
            .route("/loyalty/balance/{account_id}", web::get().to(get_balance))
            .route("/loyalty/earn", web::post().to(earn_points))
            .route("/loyalty/redeem", web::post().to(redeem_points))
            .route("/loyalty/history/{account_id}", web::get().to(get_history))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
