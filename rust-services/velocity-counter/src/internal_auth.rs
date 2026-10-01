//! Shared internal API-key authentication helpers (A4-MEDIUM-6).
//!
//! Mirrors the Python/Go internal-key pattern: callers must present the
//! X-Internal-Key header matching INTERNAL_API_KEY (constant-time compare).
//! FAIL-CLOSED: when INTERNAL_API_KEY is unset and ENV=production the service
//! refuses to boot; in dev a per-boot random key is generated and logged.
//! /health and /metrics are exempt (liveness must stay public).

use std::time::{SystemTime, UNIX_EPOCH};

/// Constant-time byte comparison — no early exit on length or content mismatch.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        let x = if i < a.len() { a[i] } else { 0 };
        let y = if i < b.len() { b[i] } else { 0 };
        diff |= (x ^ y) as usize;
    }
    diff == 0
}

/// Paths that must remain reachable without credentials (liveness/metrics).
pub fn is_exempt_path(path: &str) -> bool {
    path == "/health" || path == "/metrics"
}

/// Resolve INTERNAL_API_KEY — fail closed (mirrors go-services/cips-gateway
/// and rust-services/inventory-engine).
pub fn resolve_internal_key(service: &str) -> String {
    match std::env::var("INTERNAL_API_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => {
            let env = std::env::var("ENV").unwrap_or_default().to_lowercase();
            let app_env = std::env::var("APP_ENV").unwrap_or_default().to_lowercase();
            if env == "production" || env == "prod" || app_env == "production" || app_env == "prod" {
                eprintln!(
                    "FATAL: INTERNAL_API_KEY must be set when ENV=production — refusing to start ({})",
                    service
                );
                std::process::exit(1);
            }
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let key = format!("dev-{:032x}", nanos ^ ((std::process::id() as u128) << 64));
            eprintln!(
                "WARN: INTERNAL_API_KEY unset — generated per-boot random key ({} dev mode only)",
                service
            );
            println!("dev-mode INTERNAL_API_KEY for {}: {}", service, key);
            key
        }
    }
}

/// Verify a presented X-Internal-Key header value against the expected key.
/// Empty presented or expected keys are always rejected (fail closed).
pub fn key_matches(presented: Option<&str>, expected: &str) -> bool {
    match presented {
        Some(p) if !p.is_empty() && !expected.is_empty() => {
            constant_time_eq(p.as_bytes(), expected.as_bytes())
        }
        _ => false,
    }
}
