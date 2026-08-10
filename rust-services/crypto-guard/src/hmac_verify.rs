//! HMAC-SHA256/SHA512 signature verification with timing-safe comparison.
//! Used for verifying webhook signatures from NIBSS, Stripe, PIX, Mojaloop, etc.

use anyhow::{anyhow, Result};
use constant_time_eq::constant_time_eq;
use hmac::{Hmac, Mac};
use sha2::{Sha256, Sha512};

type HmacSha256 = Hmac<Sha256>;
type HmacSha512 = Hmac<Sha512>;

/// Algorithm selection for HMAC computation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HmacAlgorithm {
    Sha256,
    Sha512,
}

/// Computes an HMAC-SHA256 signature over the given payload.
///
/// # Arguments
/// * `key` - The secret key bytes
/// * `payload` - The message payload bytes
///
/// # Returns
/// Hex-encoded HMAC-SHA256 signature
pub fn hmac_sha256(key: &[u8], payload: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(key)
        .expect("HMAC can take key of any size");
    mac.update(payload);
    hex::encode(mac.finalize().into_bytes())
}

/// Computes an HMAC-SHA512 signature over the given payload.
pub fn hmac_sha512(key: &[u8], payload: &[u8]) -> String {
    let mut mac = HmacSha512::new_from_slice(key)
        .expect("HMAC can take key of any size");
    mac.update(payload);
    hex::encode(mac.finalize().into_bytes())
}

/// Verifies an HMAC signature in constant time (timing-safe).
///
/// This prevents timing attacks where an attacker could determine the correct
/// signature by measuring how long the comparison takes.
///
/// # Arguments
/// * `key` - The secret key bytes
/// * `payload` - The message payload bytes
/// * `provided_sig` - The hex-encoded signature to verify (may have "sha256=" prefix)
/// * `algorithm` - HMAC algorithm to use
///
/// # Returns
/// `Ok(true)` if signature is valid, `Ok(false)` if invalid, `Err` if malformed
pub fn verify_hmac(
    key: &[u8],
    payload: &[u8],
    provided_sig: &str,
    algorithm: HmacAlgorithm,
) -> Result<bool> {
    // Strip common prefixes (Stripe uses "sha256=", GitHub uses "sha256=")
    let sig_hex = provided_sig
        .strip_prefix("sha256=")
        .or_else(|| provided_sig.strip_prefix("sha512="))
        .or_else(|| provided_sig.strip_prefix("v1="))
        .unwrap_or(provided_sig);

    let provided_bytes = hex::decode(sig_hex)
        .map_err(|e| anyhow!("Invalid hex in signature: {}", e))?;

    let computed = match algorithm {
        HmacAlgorithm::Sha256 => {
            let mut mac = HmacSha256::new_from_slice(key)
                .map_err(|e| anyhow!("Invalid HMAC key: {}", e))?;
            mac.update(payload);
            mac.finalize().into_bytes().to_vec()
        }
        HmacAlgorithm::Sha512 => {
            let mut mac = HmacSha512::new_from_slice(key)
                .map_err(|e| anyhow!("Invalid HMAC key: {}", e))?;
            mac.update(payload);
            mac.finalize().into_bytes().to_vec()
        }
    };

    // Timing-safe comparison — prevents timing side-channel attacks
    if computed.len() != provided_bytes.len() {
        // Still do a dummy comparison to prevent timing leaks on length mismatch
        let _ = constant_time_eq(&computed, &computed);
        return Ok(false);
    }

    Ok(constant_time_eq(&computed, &provided_bytes))
}

/// Verifies a Stripe webhook signature.
/// Stripe sends: `t=timestamp,v1=signature` in the `Stripe-Signature` header.
///
/// # Arguments
/// * `secret` - Stripe webhook secret (starts with "whsec_")
/// * `payload` - Raw request body bytes
/// * `stripe_signature` - Value of the `Stripe-Signature` header
/// * `tolerance_secs` - Maximum age of the webhook in seconds (default: 300)
pub fn verify_stripe_webhook(
    secret: &[u8],
    payload: &[u8],
    stripe_signature: &str,
    tolerance_secs: i64,
) -> Result<bool> {
    // Parse the Stripe-Signature header: t=...,v1=...
    let mut timestamp: Option<i64> = None;
    let mut signatures: Vec<String> = Vec::new();

    for part in stripe_signature.split(',') {
        if let Some(ts) = part.strip_prefix("t=") {
            timestamp = ts.parse::<i64>().ok();
        } else if let Some(sig) = part.strip_prefix("v1=") {
            signatures.push(sig.to_string());
        }
    }

    let ts = timestamp.ok_or_else(|| anyhow!("Missing timestamp in Stripe-Signature"))?;

    // Check timestamp tolerance
    let now = chrono::Utc::now().timestamp();
    if (now - ts).abs() > tolerance_secs {
        return Ok(false); // Replay attack — signature too old
    }

    // Compute expected signature: HMAC-SHA256(secret, "{timestamp}.{payload}")
    let signed_payload = format!("{}.{}", ts, String::from_utf8_lossy(payload));
    let expected = hmac_sha256(secret, signed_payload.as_bytes());

    // Check against all provided v1 signatures (Stripe may send multiple)
    for sig in &signatures {
        if constant_time_eq(expected.as_bytes(), sig.as_bytes()) {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Verifies a NIBSS webhook signature.
/// NIBSS sends: `X-NIBSS-Signature: sha256=<hex>` header.
///
/// # Arguments
/// * `secret` - NIBSS webhook secret key
/// * `payload` - Raw request body bytes
/// * `nibss_signature` - Value of the `X-NIBSS-Signature` header
pub fn verify_nibss_webhook(
    secret: &[u8],
    payload: &[u8],
    nibss_signature: &str,
) -> Result<bool> {
    verify_hmac(secret, payload, nibss_signature, HmacAlgorithm::Sha256)
}

/// Verifies a Mojaloop FSPIOP webhook signature.
/// Uses HMAC-SHA256 over the canonical request string.
pub fn verify_mojaloop_webhook(
    secret: &[u8],
    payload: &[u8],
    signature: &str,
) -> Result<bool> {
    verify_hmac(secret, payload, signature, HmacAlgorithm::Sha256)
}

/// Verifies a PIX webhook signature (BACEN standard).
/// PIX uses HMAC-SHA256 with the PIX secret key.
pub fn verify_pix_webhook(
    secret: &[u8],
    payload: &[u8],
    signature: &str,
) -> Result<bool> {
    verify_hmac(secret, payload, signature, HmacAlgorithm::Sha256)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hmac_sha256_known_vector() {
        // RFC 4231 Test Case 1
        let key = hex::decode("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b").unwrap();
        let data = b"Hi There";
        let expected = "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";
        assert_eq!(hmac_sha256(&key, data), expected);
    }

    #[test]
    fn test_verify_hmac_valid() {
        let key = b"secret-key";
        let payload = b"test payload";
        let sig = hmac_sha256(key, payload);
        assert!(verify_hmac(key, payload, &sig, HmacAlgorithm::Sha256).unwrap());
    }

    #[test]
    fn test_verify_hmac_invalid() {
        let key = b"secret-key";
        let payload = b"test payload";
        let wrong_sig = "0000000000000000000000000000000000000000000000000000000000000000";
        assert!(!verify_hmac(key, payload, wrong_sig, HmacAlgorithm::Sha256).unwrap());
    }

    #[test]
    fn test_verify_hmac_with_prefix() {
        let key = b"secret-key";
        let payload = b"test payload";
        let sig = format!("sha256={}", hmac_sha256(key, payload));
        assert!(verify_hmac(key, payload, &sig, HmacAlgorithm::Sha256).unwrap());
    }

    #[test]
    fn test_verify_nibss_webhook() {
        let secret = b"nibss-secret";
        let payload = b"nibss-payload";
        let sig = format!("sha256={}", hmac_sha256(secret, payload));
        assert!(verify_nibss_webhook(secret, payload, &sig).unwrap());
    }

    #[test]
    fn test_timing_safe_different_lengths() {
        let key = b"key";
        let payload = b"payload";
        // Short signature should not panic and should return false
        let result = verify_hmac(key, payload, "abc", HmacAlgorithm::Sha256);
        assert!(result.is_err() || !result.unwrap());
    }
}
