//! Cryptographically secure nonce generation for idempotency keys and CSRF tokens.

use rand::RngCore;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use uuid::Uuid;

/// Generates a cryptographically secure random nonce as a hex string.
///
/// # Arguments
/// * `bytes` - Number of random bytes (default: 32 = 256-bit security)
pub fn generate_nonce(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

/// Generates a URL-safe base64 nonce (suitable for CSRF tokens, state params).
pub fn generate_nonce_base64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

/// Generates a UUID v4 idempotency key.
pub fn generate_idempotency_key() -> String {
    Uuid::new_v4().to_string()
}

/// Generates a payment nonce: prefixed UUID v4 for payment operations.
/// Format: "pay_<uuid4>" — easy to identify in logs.
pub fn generate_payment_nonce() -> String {
    format!("pay_{}", Uuid::new_v4().hyphenated())
}

/// Generates a webhook delivery nonce: "wh_<uuid4>".
pub fn generate_webhook_nonce() -> String {
    format!("wh_{}", Uuid::new_v4().hyphenated())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nonce_length() {
        let n = generate_nonce(32);
        assert_eq!(n.len(), 64); // 32 bytes = 64 hex chars
    }

    #[test]
    fn test_nonce_uniqueness() {
        let n1 = generate_nonce(32);
        let n2 = generate_nonce(32);
        assert_ne!(n1, n2);
    }

    #[test]
    fn test_idempotency_key_format() {
        let key = generate_idempotency_key();
        assert_eq!(key.len(), 36); // UUID v4 format
        assert!(key.contains('-'));
    }

    #[test]
    fn test_payment_nonce_prefix() {
        let nonce = generate_payment_nonce();
        assert!(nonce.starts_with("pay_"));
    }
}
