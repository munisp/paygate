//! wallet-ffi HTTP server
//!
//! Exposes the Rust SPL signing library over HTTP so the Go bridge can call it
//! without needing cgo linkage.  This is the recommended deployment pattern for
//! production: the Go bridge calls POST /v1/sign/usdc-transfer with a JSON body,
//! and the server returns the signed transaction.
//!
//! Environment variables:
//!   PORT              — HTTP port (default: 8099)
//!   INTERNAL_KEY      — X-Internal-Key header value for authentication
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

#[tokio::main]
async fn main() {
    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8099".to_string())
        .parse()
        .expect("PORT must be a valid port number");

    let internal_key: Arc<String> = Arc::new(
        env::var("INTERNAL_KEY").unwrap_or_default(),
    );

    // Health endpoint
    let health_route = warp::get()
        .and(warp::path("health"))
        .map(|| warp::reply::json(&serde_json::json!({"status": "ok", "service": "wallet-ffi-server"})));

    // Sign endpoint
    let key_clone = internal_key.clone();
    let sign_route = warp::post()
        .and(warp::path!("v1" / "sign" / "usdc-transfer"))
        .and(warp::header::optional::<String>("x-internal-key"))
        .and(warp::body::json::<SignUSDCTransferHttpRequest>())
        .map(move |req_key: Option<String>, body: SignUSDCTransferHttpRequest| {
            // Authenticate
            if !key_clone.is_empty() {
                match req_key {
                    Some(k) if k == *key_clone => {}
                    _ => {
                        let resp = warp::reply::json(&ErrorResponse {
                            error: "Unauthorized".to_string(),
                        });
                        return warp::reply::with_status(resp, warp::http::StatusCode::UNAUTHORIZED);
                    }
                }
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

    let routes = health_route.or(sign_route);

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    println!("[wallet-ffi-server] Listening on {}", addr);
    warp::serve(routes).run(addr).await;
}
