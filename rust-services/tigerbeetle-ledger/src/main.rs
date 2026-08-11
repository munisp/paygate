// TigerBeetle Cross-Border Ledger Service
// Rust microservice for double-entry accounting across CIPS, UPI, PIX, Mojaloop rails.
// Exposes HTTP API for account creation, transfers, and balance queries.
//
// Architecture:
//   - Postgres: durable double-entry ledger (P0-12 fix — accounts and transfers
//     survive restarts; `reference` UNIQUE gives idempotent replay; debits use
//     guarded UPDATE ... WHERE balance >= amount in a single SQL transaction)
//   - In-memory: DEV ONLY, explicit opt-in via LEDGER_ALLOW_IN_MEMORY=1
//   - Axum: async HTTP framework
//   - Tokio: async runtime
//
// Configuration:
//   DATABASE_URL              Postgres DSN (required unless in-memory opt-in)
//   LEDGER_ALLOW_IN_MEMORY=1  Dev-only in-memory backend (loud WARN, no durability)
//   LEDGER_SEED_DEMO=1        Seed merchant_demo_001 demo accounts at startup
//   PORT                      Listen port (default 8200)
//
// Ledger Design:
//   - Account types: MERCHANT (1), ESCROW (2), FEE (3), SETTLEMENT (4), SUSPENSE (5)
//   - Ledger codes: USD (840), EUR (978), CNY (156), INR (356), BRL (986), NGN (566)
//   - Each cross-border transfer: DEBIT escrow → CREDIT settlement + CREDIT fee

mod mem;
mod model;
mod pg;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use mem::MemStore;
use model::*;
use pg::PgStore;
use std::{collections::HashMap, env, net::SocketAddr, sync::Arc};

// ─── Store dispatch ───────────────────────────────────────────────────────────

#[derive(Clone)]
enum Store {
    Pg(PgStore),
    Mem(MemStore),
}

impl Store {
    fn backend_name(&self) -> &'static str {
        match self {
            Store::Pg(_) => "postgres",
            Store::Mem(_) => "in-memory",
        }
    }

    async fn healthy(&self) -> bool {
        match self {
            Store::Pg(pg) => pg.healthy().await,
            Store::Mem(_) => true,
        }
    }

    async fn create_account(&self, req: CreateAccountRequest) -> Result<Account, StoreError> {
        match self {
            Store::Pg(pg) => pg.create_account(req).await,
            Store::Mem(m) => m.create_account(req).await,
        }
    }

    async fn get_account(&self, id: &str) -> Result<Account, StoreError> {
        match self {
            Store::Pg(pg) => pg.get_account(id).await,
            Store::Mem(m) => m.get_account(id).await,
        }
    }

    async fn create_transfer(
        &self,
        req: CreateTransferRequest,
    ) -> Result<(Transfer, bool), StoreError> {
        match self {
            Store::Pg(pg) => pg.create_transfer(req).await,
            Store::Mem(m) => m.create_transfer(req).await,
        }
    }

    async fn cross_border_transfer(
        &self,
        req: CrossBorderTransferRequest,
    ) -> Result<(serde_json::Value, bool), StoreError> {
        match self {
            Store::Pg(pg) => pg.cross_border_transfer(req).await,
            Store::Mem(m) => m.cross_border_transfer(req).await,
        }
    }

    async fn list_transfers(
        &self,
        merchant_id: &str,
        rail: &str,
        limit: usize,
    ) -> (Vec<Transfer>, usize) {
        match self {
            Store::Pg(pg) => pg.list_transfers(merchant_id, rail, limit).await,
            Store::Mem(m) => m.list_transfers(merchant_id, rail, limit).await,
        }
    }

    async fn list_accounts(&self, merchant_id: &str) -> Vec<Account> {
        match self {
            Store::Pg(pg) => pg.list_accounts(merchant_id).await,
            Store::Mem(m) => m.list_accounts(merchant_id).await,
        }
    }

    async fn stats(&self) -> LedgerStats {
        match self {
            Store::Pg(pg) => pg.stats().await,
            Store::Mem(m) => m.stats().await,
        }
    }
}

type SharedState = Arc<Store>;

// ─── Error mapping ────────────────────────────────────────────────────────────

type ApiError = (StatusCode, Json<serde_json::Value>);

fn api_error(err: StoreError) -> ApiError {
    match err {
        StoreError::AccountNotFound { account_id, role } => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("{role} not found"),
                "account_id": account_id
            })),
        ),
        StoreError::InsufficientFunds {
            account_id,
            available,
            requested,
        } => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({
                "error": "insufficient balance",
                "account_id": account_id,
                "available": available,
                "requested": requested
            })),
        ),
        StoreError::InvalidRequest(msg) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": msg })),
        ),
        StoreError::Backend(msg) => {
            tracing::error!(error = %msg, "ledger backend error");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": "ledger backend error" })),
            )
        }
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn health(State(store): State<SharedState>) -> (StatusCode, Json<serde_json::Value>) {
    let healthy = store.healthy().await;
    let status = if healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(serde_json::json!({
            "status": if healthy { "ok" } else { "degraded" },
            "service": "tigerbeetle-ledger",
            "version": "v97",
            "backend": store.backend_name(),
            "durable": matches!(store.as_ref(), Store::Pg(_)),
            "timestamp": now_nanos()
        })),
    )
}

async fn create_account(
    State(store): State<SharedState>,
    Json(req): Json<CreateAccountRequest>,
) -> Result<Json<Account>, ApiError> {
    store.create_account(req).await.map(Json).map_err(api_error)
}

async fn get_account(
    State(store): State<SharedState>,
    Path(account_id): Path<String>,
) -> Result<Json<Account>, ApiError> {
    store
        .get_account(&account_id)
        .await
        .map(Json)
        .map_err(|e| match e {
            StoreError::AccountNotFound { account_id, .. } => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "account not found", "account_id": account_id})),
            ),
            other => api_error(other),
        })
}

async fn get_balance(
    State(store): State<SharedState>,
    Path(account_id): Path<String>,
) -> Result<Json<BalanceResponse>, ApiError> {
    let account = store.get_account(&account_id).await.map_err(|e| match e {
        StoreError::AccountNotFound { .. } => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "account not found"})),
        ),
        other => api_error(other),
    })?;
    Ok(Json(BalanceResponse::from_account(&account)))
}

async fn create_transfer(
    State(store): State<SharedState>,
    Json(req): Json<CreateTransferRequest>,
) -> Result<Json<Transfer>, ApiError> {
    let (transfer, _replayed) = store.create_transfer(req).await.map_err(api_error)?;
    Ok(Json(transfer))
}

async fn cross_border_transfer(
    State(store): State<SharedState>,
    Json(req): Json<CrossBorderTransferRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let (payload, _replayed) = store.cross_border_transfer(req).await.map_err(api_error)?;
    Ok(Json(payload))
}

async fn list_transfers(
    State(store): State<SharedState>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let merchant_id = params.get("merchant_id").cloned().unwrap_or_default();
    let rail = params.get("rail").cloned().unwrap_or_default();
    let limit: usize = params
        .get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(50);

    let (transfers, total) = store.list_transfers(&merchant_id, &rail, limit).await;

    Json(serde_json::json!({
        "transfers": transfers,
        "count": transfers.len(),
        "total": total
    }))
}

async fn ledger_stats(State(store): State<SharedState>) -> Json<LedgerStats> {
    Json(store.stats().await)
}

async fn list_accounts(
    State(store): State<SharedState>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let merchant_id = params.get("merchant_id").cloned().unwrap_or_default();
    let accounts = store.list_accounts(&merchant_id).await;

    Json(serde_json::json!({
        "accounts": accounts,
        "count": accounts.len()
    }))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let in_memory = env::var("LEDGER_ALLOW_IN_MEMORY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let store: Store = if in_memory {
        tracing::warn!(
            "⚠️  LEDGER_ALLOW_IN_MEMORY is set: running with a NON-DURABLE in-memory ledger. \
             All accounts and transfers are LOST on restart. DEV/TEST ONLY — never use in production."
        );
        eprintln!(
            "WARNING: tigerbeetle-ledger running in NON-DURABLE in-memory mode (LEDGER_ALLOW_IN_MEMORY=1). \
             Restart = total ledger loss. Dev/test only."
        );
        Store::Mem(MemStore::new())
    } else {
        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            eprintln!(
                "FATAL: DATABASE_URL is not set. The ledger requires a durable Postgres backend. \
                 Set DATABASE_URL, or explicitly opt into dev-only in-memory mode with LEDGER_ALLOW_IN_MEMORY=1."
            );
            std::process::exit(2);
        });
        match PgStore::connect(&database_url).await {
            Ok(pg) => {
                tracing::info!("connected to durable Postgres ledger backend");
                Store::Pg(pg)
            }
            Err(e) => {
                eprintln!(
                    "FATAL: cannot initialize durable Postgres ledger backend: {:?}. \
                     Refusing to serve a non-durable ledger. Fix DATABASE_URL or the database, \
                     or opt into dev-only in-memory mode with LEDGER_ALLOW_IN_MEMORY=1.",
                    e
                );
                std::process::exit(2);
            }
        }
    };

    // Demo seed is strictly opt-in — fabricated balances must never appear by default.
    let seed_demo = env::var("LEDGER_SEED_DEMO")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if seed_demo {
        tracing::warn!("LEDGER_SEED_DEMO=1: seeding merchant_demo_001 demo accounts with pre-funded balances");
        match &store {
            Store::Pg(pg) => {
                if let Err(e) = pg.seed_demo_accounts().await {
                    tracing::error!(error = ?e, "demo seed failed");
                }
            }
            Store::Mem(m) => m.seed_demo_accounts().await,
        }
    }

    let shared: SharedState = Arc::new(store);

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/ledger/accounts", get(list_accounts).post(create_account))
        .route("/v1/ledger/accounts/:account_id", get(get_account))
        .route("/v1/ledger/accounts/:account_id/balance", get(get_balance))
        .route("/v1/ledger/transfers", get(list_transfers).post(create_transfer))
        .route("/v1/ledger/crossborder", post(cross_border_transfer))
        .route("/v1/ledger/stats", get(ledger_stats))
        .with_state(shared);

    let port = env::var("PORT").unwrap_or_else(|_| "8200".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();

    println!("TigerBeetle Ledger Service listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind ledger port");
    axum::serve(listener, app).await.unwrap();
}
