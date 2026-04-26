//! Unified webhook verification for all payment providers.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use crate::hmac_verify::{verify_hmac, verify_stripe_webhook, HmacAlgorithm};

/// Supported webhook providers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebhookProvider {
    Stripe,
    Nibss,
    Mojaloop,
    Pix,
    Generic,
}

/// Webhook verification request.
#[derive(Debug, Serialize, Deserialize)]
pub struct WebhookVerifyRequest {
    pub provider: WebhookProvider,
    pub payload: String,       // Base64-encoded raw body
    pub signature: String,     // Provider-specific signature header value
    pub secret: String,        // Webhook secret (should be fetched from vault in prod)
    pub timestamp: Option<i64>, // Unix timestamp (required for Stripe)
}

/// Webhook verification response.
#[derive(Debug, Serialize, Deserialize)]
pub struct WebhookVerifyResponse {
    pub valid: bool,
    pub provider: WebhookProvider,
    pub error: Option<String>,
}

/// Verifies a webhook signature for the given provider.
pub fn verify_webhook(req: &WebhookVerifyRequest) -> WebhookVerifyResponse {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let payload_bytes = match STANDARD.decode(&req.payload) {
        Ok(b) => b,
        Err(e) => {
            return WebhookVerifyResponse {
                valid: false,
                provider: req.provider,
                error: Some(format!("Invalid base64 payload: {}", e)),
            };
        }
    };

    let result: Result<bool> = match req.provider {
        WebhookProvider::Stripe => {
            let ts = req.timestamp.unwrap_or(0);
            // Reconstruct Stripe-Signature header format
            let stripe_sig = format!("t={},v1={}", ts, req.signature);
            verify_stripe_webhook(
                req.secret.as_bytes(),
                &payload_bytes,
                &stripe_sig,
                300,
            )
        }
        WebhookProvider::Nibss => {
            verify_hmac(
                req.secret.as_bytes(),
                &payload_bytes,
                &req.signature,
                HmacAlgorithm::Sha256,
            )
        }
        WebhookProvider::Mojaloop => {
            verify_hmac(
                req.secret.as_bytes(),
                &payload_bytes,
                &req.signature,
                HmacAlgorithm::Sha256,
            )
        }
        WebhookProvider::Pix => {
            verify_hmac(
                req.secret.as_bytes(),
                &payload_bytes,
                &req.signature,
                HmacAlgorithm::Sha256,
            )
        }
        WebhookProvider::Generic => {
            verify_hmac(
                req.secret.as_bytes(),
                &payload_bytes,
                &req.signature,
                HmacAlgorithm::Sha256,
            )
        }
    };

    match result {
        Ok(valid) => WebhookVerifyResponse {
            valid,
            provider: req.provider,
            error: None,
        },
        Err(e) => WebhookVerifyResponse {
            valid: false,
            provider: req.provider,
            error: Some(e.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hmac_verify::hmac_sha256;
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    #[test]
    fn test_verify_nibss_webhook_valid() {
        let secret = "nibss-test-secret";
        let payload = b"nibss-test-payload";
        let sig = hmac_sha256(secret.as_bytes(), payload);

        let req = WebhookVerifyRequest {
            provider: WebhookProvider::Nibss,
            payload: STANDARD.encode(payload),
            signature: sig,
            secret: secret.to_string(),
            timestamp: None,
        };

        let resp = verify_webhook(&req);
        assert!(resp.valid);
        assert!(resp.error.is_none());
    }

    #[test]
    fn test_verify_generic_webhook_invalid() {
        let req = WebhookVerifyRequest {
            provider: WebhookProvider::Generic,
            payload: STANDARD.encode(b"payload"),
            signature: "wrong_signature".to_string(),
            secret: "secret".to_string(),
            timestamp: None,
        };

        let resp = verify_webhook(&req);
        assert!(!resp.valid);
    }
}
