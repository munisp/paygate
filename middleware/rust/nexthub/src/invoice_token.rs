//! NextHub Invoice Tokenisation (Rust)
//!
//! Provides deterministic UUID v5 generation and ECDSA signing for
//! supply chain finance invoice tokens. Each invoice gets a unique,
//! verifiable token that can be traded on the SCF marketplace.

use std::time::{SystemTime, UNIX_EPOCH};

use p256::{
    ecdsa::{
        signature::{Signer, Verifier},
        Signature, SigningKey, VerifyingKey,
    },
    SecretKey,
};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

// ─── Types ────────────────────────────────────────────────────────────────────

/// Invoice token representing a tokenised trade receivable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceToken {
    pub token_id: String,         // UUID v5 deterministic token
    pub invoice_id: String,
    pub invoice_number: String,
    pub supplier_id: String,
    pub buyer_id: String,
    pub amount: f64,
    pub currency: String,
    pub due_date: String,         // ISO 8601
    pub issued_at: u64,           // Unix timestamp
    pub signature: String,        // ECDSA signature of token data
    pub public_key_pem: String,   // Issuer public key
    pub status: TokenStatus,
}

/// Status of an invoice token.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TokenStatus {
    Active,
    Traded,
    Settled,
    Cancelled,
}

/// Token verification result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenVerificationResult {
    pub token_id: String,
    pub is_valid: bool,
    pub is_expired: bool,
    pub error: Option<String>,
}

// ─── Tokeniser ────────────────────────────────────────────────────────────────

/// InvoiceTokeniser issues and verifies invoice tokens.
pub struct InvoiceTokeniser {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
    namespace: Uuid,
}

impl InvoiceTokeniser {
    /// Create a new tokeniser with a randomly generated key pair.
    pub fn new() -> Self {
        let secret_key = SecretKey::random(&mut OsRng);
        let signing_key = SigningKey::from(secret_key);
        let verifying_key = VerifyingKey::from(&signing_key);
        // Use a fixed namespace UUID for NextHub SCF tokens
        let namespace = Uuid::parse_str("6ba7b810-9dad-11d1-80b4-00c04fd430c8").unwrap();
        Self { signing_key, verifying_key, namespace }
    }

    /// Issue a new invoice token.
    pub fn issue(
        &self,
        invoice_id: &str,
        invoice_number: &str,
        supplier_id: &str,
        buyer_id: &str,
        amount: f64,
        currency: &str,
        due_date: &str,
    ) -> Result<InvoiceToken, Box<dyn std::error::Error>> {
        // Generate deterministic UUID v5 from invoice data
        let name = format!("{}:{}:{}:{}", invoice_id, invoice_number, supplier_id, buyer_id);
        let token_id = Uuid::new_v5(&self.namespace, name.as_bytes()).to_string();

        let issued_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Build signing payload
        let payload = format!(
            "{}:{}:{}:{}:{:.2}:{}:{}:{}",
            token_id, invoice_id, invoice_number, supplier_id,
            amount, currency, due_date, issued_at
        );

        // SHA-256 hash
        let mut hasher = Sha256::new();
        hasher.update(payload.as_bytes());
        let hash = hasher.finalize();

        // ECDSA sign
        let signature: Signature = self.signing_key.sign(&hash);
        let sig_b64 = BASE64.encode(signature.to_der().to_bytes());

        // Encode public key
        let pub_key_bytes = self.verifying_key.to_encoded_point(false);
        let pub_key_pem = format!(
            "-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----\n",
            BASE64.encode(pub_key_bytes.as_bytes())
        );

        Ok(InvoiceToken {
            token_id,
            invoice_id: invoice_id.to_string(),
            invoice_number: invoice_number.to_string(),
            supplier_id: supplier_id.to_string(),
            buyer_id: buyer_id.to_string(),
            amount,
            currency: currency.to_string(),
            due_date: due_date.to_string(),
            issued_at,
            signature: sig_b64,
            public_key_pem: pub_key_pem,
            status: TokenStatus::Active,
        })
    }

    /// Verify an invoice token's signature.
    pub fn verify(&self, token: &InvoiceToken) -> TokenVerificationResult {
        let payload = format!(
            "{}:{}:{}:{}:{:.2}:{}:{}:{}",
            token.token_id, token.invoice_id, token.invoice_number, token.supplier_id,
            token.amount, token.currency, token.due_date, token.issued_at
        );

        let mut hasher = Sha256::new();
        hasher.update(payload.as_bytes());
        let hash = hasher.finalize();

        let sig_bytes = match BASE64.decode(&token.signature) {
            Ok(b) => b,
            Err(e) => {
                return TokenVerificationResult {
                    token_id: token.token_id.clone(),
                    is_valid: false,
                    is_expired: false,
                    error: Some(format!("Invalid signature encoding: {}", e)),
                };
            }
        };

        let signature = match Signature::from_der(&sig_bytes) {
            Ok(s) => s,
            Err(e) => {
                return TokenVerificationResult {
                    token_id: token.token_id.clone(),
                    is_valid: false,
                    is_expired: false,
                    error: Some(format!("Invalid signature format: {}", e)),
                };
            }
        };

        let is_valid = self.verifying_key.verify(&hash, &signature).is_ok();

        // Check expiry (due date)
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        // Simple expiry: token is expired if issued_at + 90 days < now
        let is_expired = token.issued_at + (90 * 24 * 3600) < now;

        TokenVerificationResult {
            token_id: token.token_id.clone(),
            is_valid,
            is_expired,
            error: if is_valid { None } else { Some("Signature verification failed".to_string()) },
        }
    }

    /// Generate a deterministic token ID for an invoice (without signing).
    pub fn derive_token_id(&self, invoice_id: &str, invoice_number: &str) -> String {
        let name = format!("{}:{}", invoice_id, invoice_number);
        Uuid::new_v5(&self.namespace, name.as_bytes()).to_string()
    }
}

impl Default for InvoiceTokeniser {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_issue_and_verify() {
        let tokeniser = InvoiceTokeniser::new();
        let token = tokeniser.issue(
            "INV-001",
            "INV-2026-001",
            "SUPPLIER-A",
            "BUYER-B",
            500_000.0,
            "NGN",
            "2026-09-30",
        ).unwrap();

        assert!(!token.token_id.is_empty());
        assert_eq!(token.status, TokenStatus::Active);

        let result = tokeniser.verify(&token);
        assert!(result.is_valid, "Token signature should be valid");
        assert!(!result.is_expired, "Token should not be expired");
    }

    #[test]
    fn test_deterministic_token_id() {
        let tokeniser = InvoiceTokeniser::new();
        let id1 = tokeniser.derive_token_id("INV-001", "INV-2026-001");
        let id2 = tokeniser.derive_token_id("INV-001", "INV-2026-001");
        assert_eq!(id1, id2, "Token IDs should be deterministic");
    }

    #[test]
    fn test_different_invoices_different_tokens() {
        let tokeniser = InvoiceTokeniser::new();
        let id1 = tokeniser.derive_token_id("INV-001", "INV-2026-001");
        let id2 = tokeniser.derive_token_id("INV-002", "INV-2026-002");
        assert_ne!(id1, id2, "Different invoices should have different token IDs");
    }

    #[test]
    fn test_tampered_token_fails_verification() {
        let tokeniser = InvoiceTokeniser::new();
        let mut token = tokeniser.issue(
            "INV-001", "INV-2026-001", "SUPPLIER-A", "BUYER-B",
            500_000.0, "NGN", "2026-09-30",
        ).unwrap();

        // Tamper with amount
        token.amount = 999_999.0;

        let result = tokeniser.verify(&token);
        assert!(!result.is_valid, "Tampered token should fail verification");
    }
}
