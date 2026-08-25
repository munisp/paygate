//! wallet-ffi HTTP server
//!
//! Exposes the Rust SPL signing library over HTTP so the Go bridge can call it
//! without needing cgo linkage.  This is the recommended deployment pattern for
//! production: the Go bridge calls POST /v1/sign/usdc-transfer with a JSON body,
//! and the server returns the signed transaction.
//!
//! Environment variables:
//!   PORT              — HTTP port (default: 8099)
//!   INTERNAL_API_KEY  — X-Internal-Key header value for authentication
//!                       (INTERNAL_KEY accepted as a legacy alias)
//!
//! The server REFUSES TO START when no internal API key is configured:
//! an unauthenticated signing endpoint must never fail open.
//!
//! Endpoints:
//!   POST /v1/sign/usdc-transfer  — Sign a USDC SPL transfer
//!   GET  /health                 — Health check

use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use warp::Filter;

// Re-use the signing logic from lib.rs
use wallet_ffi::{sign_usdc_transfer_http, SignUSDCTransferHttpRequest};

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

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

#[tokio::main]
async fn main() {
    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8099".to_string())
        .parse()
        .expect("PORT must be a valid port number");

    // Fail closed: never serve an unauthenticated signing endpoint.
    let internal_key: Arc<String> = Arc::new(
        env::var("INTERNAL_API_KEY")
            .or_else(|_| env::var("INTERNAL_KEY"))
            .unwrap_or_default(),
    );
    if internal_key.is_empty() {
        eprintln!(
            "[wallet-ffi-server] FATAL: INTERNAL_API_KEY (or INTERNAL_KEY) is not set. \
             Refusing to start an unauthenticated signing endpoint."
        );
        std::process::exit(1);
    }

    // Health endpoint (liveness)
    let health_route = warp::get()
        .and(warp::path("health"))
        .map(|| warp::reply::json(&serde_json::json!({"status": "ok", "service": "wallet-ffi-server"})));

    // Readiness endpoint (k8s readinessProbe)
    let ready_route = warp::get()
        .and(warp::path("ready"))
        .map(|| warp::reply::json(&serde_json::json!({"status": "ready", "service": "wallet-ffi-server"})));

    // Sign endpoint
    let key_clone = internal_key.clone();
    let sign_route = warp::post()
        .and(warp::path!("v1" / "sign" / "usdc-transfer"))
        .and(warp::header::optional::<String>("x-internal-key"))
        .and(warp::body::json::<SignUSDCTransferHttpRequest>())
        .map(move |req_key: Option<String>, body: SignUSDCTransferHttpRequest| {
            // Authenticate (constant-time; empty presented key always rejected).
            let authenticated = match req_key {
                Some(k) if !k.is_empty() => {
                    constant_time_eq(k.as_bytes(), key_clone.as_bytes())
                }
                _ => false,
            };
            if !authenticated {
                let resp = warp::reply::json(&ErrorResponse {
                    error: "Unauthorized".to_string(),
                });
                return warp::reply::with_status(resp, warp::http::StatusCode::UNAUTHORIZED);
            }
            // Sign
            match sign_usdc_transfer_http(body) {
                Ok(result) => warp::reply::with_status(
                    warp::reply::json(&result),
                    warp::http::StatusCode::OK,
                ),
                Err(e) => {
                    eprintln!("[wallet-ffi-server] signing error: {}", e);
                    warp::reply::with_status(
                        warp::reply::json(&ErrorResponse { error: e }),
                        warp::http::StatusCode::UNPROCESSABLE_ENTITY,
                    )
                }
            }
        });

    let routes = health_route.or(ready_route).or(sign_route);

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    println!("[wallet-ffi-server] Listening on {}", addr);
    warp::serve(routes).run(addr).await;
}
