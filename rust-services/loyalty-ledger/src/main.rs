mod telemetry;

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
    pub entry_type: String,
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
    pub db_pool: Option<Pool>,
}
// ─── DB Pool ─────────────────────────────────────────────────────────────────
fn build_db_pool(database_url: &str) -> Option<Pool> {
    let mut cfg = PgConfig::new();
    cfg.url = Some(database_url.to_string());
    cfg.manager = Some(ManagerConfig { recycling_method: RecyclingMethod::Fast });
    cfg.pool = Some(deadpool_postgres::PoolConfig { max_size: 20, ..Default::default() });
    match cfg.create_pool(Some(Runtime::Tokio1), NoTls) {
        Ok(pool) => { info!("loyalty-ledger: DB pool created (max=20)"); Some(pool) }
        Err(e) => { warn!("loyalty-ledger: DB pool failed: {} — running without DB", e); None }
    }
}
// ─── Auth ─────────────────────────────────────────────────────────────────────
/// Constant-time byte comparison — no early exit on length or content mismatch.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        let x = if i < a.len() { a[i] } else { 0 };
        let y = if i < b.len() { b[i] } else { 0 };
        diff |= (x ^ y) as usize;
    }
    diff == 0
}

/// Fail closed: startup guarantees a non-empty key (see resolve_internal_key);
/// an empty presented key is always rejected.
fn verify_internal_key(req: &HttpRequest, state: &web::Data<AppState>) -> bool {
    if state.internal_key.is_empty() { return false; }
    match req.headers().get("X-Internal-Key")
        .and_then(|v| v.to_str().ok())
    {
        Some(v) if !v.is_empty() => constant_time_eq(v.as_bytes(), state.internal_key.as_bytes()),
        _ => false,
    }
}

/// Resolve INTERNAL_API_KEY — fail closed (mirrors go-services/cips-gateway).
/// Production (ENV=production|prod): refuse to boot when unset/empty.
/// Dev: generate a per-boot random key and log it.
fn resolve_internal_key() -> String {
    match std::env::var("INTERNAL_API_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => {
            let env = std::env::var("ENV").unwrap_or_default().to_lowercase();
            if env == "production" || env == "prod" {
                error!("FATAL: INTERNAL_API_KEY must be set when ENV=production — refusing to start");
                std::process::exit(1);
            }
            let key = format!("dev-{}", Uuid::new_v4().simple());
            warn!("INTERNAL_API_KEY unset — generated per-boot dev key (dev mode only)");
            info!("dev-mode INTERNAL_API_KEY: {}", key);
            key
        }
    }
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
fn calculate_points_earned(amount_cents: i64) -> i64 { amount_cents / 100 }
fn tier_progress_pct(tier: &str, lifetime: i64) -> f64 {
    match tier {
        "Bronze" => (lifetime as f64 / 1000.0 * 100.0).min(100.0),
        "Silver" => ((lifetime - 1000) as f64 / 4000.0 * 100.0).min(100.0),
        "Gold" => ((lifetime - 5000) as f64 / 15000.0 * 100.0).min(100.0),
        _ => 100.0,
    }
}
// ─── Handlers ────────────────────────────────────────────────────────────────
async fn health(state: web::Data<AppState>) -> impl Responder {
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".to_string(),
        service: "loyalty-ledger".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: state.start_time.elapsed().as_secs(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

async fn get_balance(req: HttpRequest, state: web::Data<AppState>, path: web::Path<String>) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse { error: "Unauthorized".into(), code: "UNAUTHORIZED".into() });
    }
    let account_id = path.into_inner();
    if let Some(pool) = &state.db_pool {
        match pool.get().await {
            Ok(client) => {
                let row = client.query_opt(
                    "SELECT points_balance, lifetime_points, program_id FROM loyalty_accounts WHERE account_id = $1",
                    &[&account_id]
                ).await;
                match row {
                    Ok(Some(r)) => {
                        let points_balance: i64 = r.get(0);
                        let lifetime_points: i64 = r.get(1);
                        let program_id: String = r.get(2);
                        let (tier, next_tier, points_to_next) = calculate_tier(lifetime_points);
                        return HttpResponse::Ok().json(BalanceResponse {
                            account_id,
                            program_id,
                            points_balance,
                            lifetime_points,
                            tier_progress_pct: tier_progress_pct(tier, lifetime_points),
                            tier: tier.to_string(),
                            next_tier: next_tier.map(|t| t.to_string()),
                            points_to_next_tier: points_to_next,
                            as_of: Utc::now().to_rfc3339(),
                        });
                    }
                    Ok(None) => {
                        return HttpResponse::NotFound().json(ErrorResponse {
                            error: format!("Account {} not found", account_id),
                            code: "ACCOUNT_NOT_FOUND".into(),
                        });
                    }
                    Err(e) => { error!("loyalty balance query failed: {}", e); }
                }
            }
            Err(e) => { error!("loyalty balance: DB pool exhausted: {}", e); }
        }
    }
    HttpResponse::ServiceUnavailable().json(ErrorResponse { error: "Service temporarily unavailable".into(), code: "SERVICE_UNAVAILABLE".into() })
}

async fn earn_points(req: HttpRequest, state: web::Data<AppState>, body: web::Json<EarnRequest>) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse { error: "Unauthorized".into(), code: "UNAUTHORIZED".into() });
    }
    state.earn_counter.with_label_values(&["earn"]).inc();
    let points_earned = calculate_points_earned(body.amount_cents);
    let ledger_entry_id = Uuid::new_v4().to_string();

    if let Some(pool) = &state.db_pool {
        match pool.get().await {
            Ok(mut client) => {
                // Upsert account and add points atomically
                let result: Result<(i64, i64), tokio_postgres::Error> = async {
                    let tx = client.build_transaction().start().await?;
                    // Upsert loyalty account
                    tx.execute(
                        "INSERT INTO loyalty_accounts (account_id, program_id, merchant_id, points_balance, lifetime_points, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $4, NOW(), NOW())
                         ON CONFLICT (account_id) DO UPDATE
                         SET points_balance = loyalty_accounts.points_balance + $4,
                             lifetime_points = loyalty_accounts.lifetime_points + $4,
                             updated_at = NOW()",
                        &[&body.account_id, &body.program_id, &body.merchant_id, &points_earned],
                    ).await?;
                    // Get new balances
                    let row = tx.query_one(
                        "SELECT points_balance, lifetime_points FROM loyalty_accounts WHERE account_id = $1",
                        &[&body.account_id]
                    ).await?;
                    let new_balance: i64 = row.get(0);
                    let lifetime: i64 = row.get(1);
                    // Insert ledger entry
                    tx.execute(
                        "INSERT INTO loyalty_ledger (id, account_id, entry_type, points, balance_after, description, reference_id, created_at)
                         VALUES ($1, $2, 'earn', $3, $4, $5, $6, NOW())",
                        &[&ledger_entry_id, &body.account_id, &points_earned, &new_balance,
                          &body.description.as_deref().unwrap_or("Purchase reward"), &body.transaction_id],
                    ).await?;
                    tx.commit().await?;
                    Ok((new_balance, lifetime))
                }.await;

                match result {
                    Ok((new_balance, lifetime)) => {
                        let (old_tier, _, _) = calculate_tier(lifetime - points_earned);
                        let (new_tier, _, _) = calculate_tier(lifetime);
                        info!(account_id = %body.account_id, points_earned = points_earned, "Loyalty points earned");
                        return HttpResponse::Ok().json(EarnResponse {
                            success: true,
                            transaction_id: body.transaction_id.clone(),
                            ledger_entry_id,
                            points_earned,
                            new_balance,
                            tier: new_tier.to_string(),
                            tier_upgraded: old_tier != new_tier,
                        });
                    }
                    Err(e) => { error!("loyalty earn transaction failed: {}", e); }
                }
            }
            Err(e) => { error!("loyalty earn: DB pool exhausted: {}", e); }
        }
    }
    HttpResponse::ServiceUnavailable().json(ErrorResponse { error: "Service temporarily unavailable".into(), code: "SERVICE_UNAVAILABLE".into() })
}

async fn redeem_points(req: HttpRequest, state: web::Data<AppState>, body: web::Json<RedeemRequest>) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse { error: "Unauthorized".into(), code: "UNAUTHORIZED".into() });
    }
    state.redeem_counter.with_label_values(&["redeem"]).inc();
    let ledger_entry_id = Uuid::new_v4().to_string();
    // 1 point = 1 NGN (100 kobo) discount
    let discount_value_cents = body.points * 100;

    if let Some(pool) = &state.db_pool {
        match pool.get().await {
            Ok(mut client) => {
                let result: Result<i64, Box<dyn std::error::Error + Send + Sync>> = async {
                    let tx = client.build_transaction().start().await?;
                    let row = tx.query_opt(
                        "SELECT points_balance FROM loyalty_accounts WHERE account_id = $1 FOR UPDATE",
                        &[&body.account_id]
                    ).await?;
                    let current_balance: i64 = row.map(|r| r.get(0)).unwrap_or(0);
                    if current_balance < body.points {
                        // Business-rule abort (tokio_postgres::Error has no public constructor):
                        // roll back the tx; maps to 400 INSUFFICIENT_POINTS below.
                        return Err("insufficient points".into());
                    }
                    tx.execute(
                        "UPDATE loyalty_accounts SET points_balance = points_balance - $2, updated_at = NOW() WHERE account_id = $1",
                        &[&body.account_id, &body.points]
                    ).await?;
                    let new_balance = current_balance - body.points;
                    tx.execute(
                        "INSERT INTO loyalty_ledger (id, account_id, entry_type, points, balance_after, description, reference_id, created_at)
                         VALUES ($1, $2, 'redeem', $3, $4, $5, $6, NOW())",
                        &[&ledger_entry_id, &body.account_id, &(-body.points), &new_balance,
                          &body.description.as_deref().unwrap_or("Points redemption"), &body.order_id],
                    ).await?;
                    tx.commit().await?;
                    Ok(new_balance)
                }.await;

                match result {
                    Ok(new_balance) => {
                        info!(account_id = %body.account_id, points_redeemed = body.points, "Loyalty points redeemed");
                        return HttpResponse::Ok().json(RedeemResponse {
                            success: true,
                            ledger_entry_id,
                            points_redeemed: body.points,
                            new_balance,
                            discount_value_cents,
                            currency: "NGN".to_string(),
                        });
                    }
                    Err(_) => {
                        return HttpResponse::BadRequest().json(ErrorResponse {
                            error: "Insufficient points".into(),
                            code: "INSUFFICIENT_POINTS".into(),
                        });
                    }
                }
            }
            Err(e) => { error!("loyalty redeem: DB pool exhausted: {}", e); }
        }
    }
    HttpResponse::ServiceUnavailable().json(ErrorResponse { error: "Service temporarily unavailable".into(), code: "SERVICE_UNAVAILABLE".into() })
}

async fn get_history(req: HttpRequest, state: web::Data<AppState>, path: web::Path<String>) -> impl Responder {
    if !verify_internal_key(&req, &state) {
        return HttpResponse::Unauthorized().json(ErrorResponse { error: "Unauthorized".into(), code: "UNAUTHORIZED".into() });
    }
    let account_id = path.into_inner();
    if let Some(pool) = &state.db_pool {
        match pool.get().await {
            Ok(client) => {
                let rows = client.query(
                    "SELECT id, entry_type, points, balance_after, description, reference_id, created_at
                     FROM loyalty_ledger WHERE account_id = $1 ORDER BY created_at DESC LIMIT 100",
                    &[&account_id]
                ).await;
                match rows {
                    Ok(rows) => {
                        let total = rows.len() as i64;
                        let transactions: Vec<LedgerEntry> = rows.iter().map(|r| LedgerEntry {
                            id: r.get::<_, String>(0),
                            entry_type: r.get::<_, String>(1),
                            points: r.get::<_, i64>(2),
                            balance_after: r.get::<_, i64>(3),
                            description: r.get::<_, String>(4),
                            reference_id: r.get::<_, Option<String>>(5),
                            created_at: r.get::<_, chrono::DateTime<Utc>>(6).to_rfc3339(),
                        }).collect();
                        return HttpResponse::Ok().json(TransactionHistoryResponse { account_id, transactions, total });
                    }
                    Err(e) => { error!("loyalty history query failed: {}", e); }
                }
            }
            Err(e) => { error!("loyalty history: DB pool exhausted: {}", e); }
        }
    }
    HttpResponse::ServiceUnavailable().json(ErrorResponse { error: "Service temporarily unavailable".into(), code: "SERVICE_UNAVAILABLE".into() })
}

async fn metrics_handler(state: web::Data<AppState>) -> impl Responder {
    let encoder = TextEncoder::new();
    let mut buffer = Vec::new();
    encoder.encode(&state.registry.gather(), &mut buffer).unwrap_or_default();
    HttpResponse::Ok().content_type("text/plain; version=0.0.4").body(buffer)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let _ = dotenvy::dotenv();
    telemetry::init_tracing("loyalty-ledger");

    let port: u16 = std::env::var("PORT").unwrap_or_else(|_| "8092".to_string()).parse().unwrap_or(8092);
    let internal_key = resolve_internal_key();
    let database_url = std::env::var("DATABASE_URL").unwrap_or_default();
    let db_pool = if database_url.is_empty() {
        warn!("DATABASE_URL not set — loyalty-ledger running without DB");
        None
    } else { build_db_pool(&database_url) };

    let registry = Arc::new(Registry::new());
    let earn_counter = IntCounterVec::new(Opts::new("loyalty_earn_total", "Total loyalty earn operations"), &["operation"]).unwrap();
    let redeem_counter = IntCounterVec::new(Opts::new("loyalty_redeem_total", "Total loyalty redeem operations"), &["operation"]).unwrap();
    registry.register(Box::new(earn_counter.clone())).ok();
    registry.register(Box::new(redeem_counter.clone())).ok();

    let state = web::Data::new(AppState {
        start_time: std::time::Instant::now(),
        registry, earn_counter, redeem_counter, internal_key, db_pool,
    });

    info!(port = port, "Loyalty Ledger starting");
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .app_data(web::JsonConfig::default().error_handler(|err, _req| {
                let response = HttpResponse::BadRequest().json(ErrorResponse { error: err.to_string(), code: "INVALID_JSON".into() });
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
    .workers(num_cpus::get())
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
