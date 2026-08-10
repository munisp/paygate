//! Replay attack protection using Redis-backed nonce store.
//! Prevents duplicate webhook deliveries and payment replay attacks.
#![allow(dependency_on_unit_never_type_fallback)]

use anyhow::{anyhow, Result};
use chrono::Utc;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};

/// Configuration for replay protection.
#[derive(Debug, Clone)]
pub struct ReplayConfig {
    /// Maximum age of a valid request in seconds (default: 300 = 5 minutes)
    pub timestamp_tolerance_secs: i64,
    /// TTL for nonce entries in Redis (should be >= timestamp_tolerance_secs)
    pub nonce_ttl_secs: u64,
    /// Key prefix for Redis entries
    pub key_prefix: String,
}

impl Default for ReplayConfig {
    fn default() -> Self {
        Self {
            timestamp_tolerance_secs: 300,
            nonce_ttl_secs: 600,
            key_prefix: "paygate:replay:".to_string(),
        }
    }
}

/// Result of a replay check.
#[derive(Debug, Serialize, Deserialize)]
pub struct ReplayCheckResult {
    pub is_replay: bool,
    pub reason: Option<String>,
}

/// Checks if a request is a replay attack.
///
/// A request is considered a replay if:
/// 1. The timestamp is outside the tolerance window, OR
/// 2. The nonce has already been seen (stored in Redis)
///
/// # Arguments
/// * `conn` - Redis connection manager
/// * `nonce` - Unique request identifier (idempotency key, webhook ID, etc.)
/// * `timestamp_secs` - Unix timestamp of the request
/// * `config` - Replay protection configuration
pub async fn check_replay(
    conn: &mut redis::aio::ConnectionManager,
    nonce: &str,
    timestamp_secs: i64,
    config: &ReplayConfig,
) -> Result<ReplayCheckResult> {
    // 1. Check timestamp window
    let now = Utc::now().timestamp();
    let age = (now - timestamp_secs).abs();
    if age > config.timestamp_tolerance_secs {
        return Ok(ReplayCheckResult {
            is_replay: true,
            reason: Some(format!(
                "Request timestamp too old: {}s (max: {}s)",
                age, config.timestamp_tolerance_secs
            )),
        });
    }

    // 2. Check nonce in Redis using SET NX (atomic check-and-set)
    let redis_key = format!("{}{}", config.key_prefix, nonce);
    let set_result: bool = conn
        .set_nx(&redis_key, now.to_string())
        .await
        .map_err(|e| anyhow!("Redis error during nonce check: {}", e))?;

    if !set_result {
        // Nonce already exists — this is a replay
        return Ok(ReplayCheckResult {
            is_replay: true,
            reason: Some(format!("Nonce '{}' already seen (replay attack)", nonce)),
        });
    }

    // Set TTL on the nonce key
    conn.expire::<_, ()>(&redis_key, config.nonce_ttl_secs as i64)
        .await
        .map_err(|e| anyhow!("Redis error setting TTL: {}", e))?;

    Ok(ReplayCheckResult {
        is_replay: false,
        reason: None,
    })
}

/// Validates that a timestamp is within the acceptable window.
/// Does NOT check Redis — use for lightweight pre-validation.
pub fn validate_timestamp(timestamp_secs: i64, tolerance_secs: i64) -> Result<()> {
    let now = Utc::now().timestamp();
    let age = (now - timestamp_secs).abs();
    if age > tolerance_secs {
        return Err(anyhow!(
            "Timestamp outside tolerance window: age={}s, max={}s",
            age,
            tolerance_secs
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_timestamp_valid() {
        let now = Utc::now().timestamp();
        assert!(validate_timestamp(now, 300).is_ok());
    }

    #[test]
    fn test_validate_timestamp_too_old() {
        let old = Utc::now().timestamp() - 400;
        assert!(validate_timestamp(old, 300).is_err());
    }

    #[test]
    fn test_validate_timestamp_future() {
        let future = Utc::now().timestamp() + 400;
        assert!(validate_timestamp(future, 300).is_err());
    }
}
