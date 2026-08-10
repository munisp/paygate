//! NextHub Travel Rule Payload Signing (Rust)
//!
//! Provides ECDSA P-256 signing and verification for IVMS 101 Travel Rule
//! payloads. Used by the Go bridge via FFI or as a standalone signing service.
//!
//! Integrates with:
//! - Kafka: paygate.nexthub.compliance topic
//! - Redis: signed payload cache (TTL 24h)
//! - TigerBeetle: compliance account flagging

use std::collections::HashMap;
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
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

// ─── Types ────────────────────────────────────────────────────────────────────

/// IVMS 101 Travel Rule payload (simplified).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IVMS101Payload {
    pub originator: IVMS101Person,
    pub beneficiary: IVMS101Person,
    pub transfer: IVMS101Transfer,
}

/// IVMS 101 person (originator or beneficiary).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IVMS101Person {
    pub name: String,
    pub account_number: String,
    pub country: Option<String>,
    pub national_id: Option<String>,
    pub date_of_birth: Option<String>,
}

/// IVMS 101 transfer details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IVMS101Transfer {
    pub amount: f64,
    pub currency: String,
    pub transaction_ref: String,
    pub execution_date: String,
    pub originator_vasp: String,
    pub beneficiary_vasp: String,
}

/// Signed Travel Rule payload ready for transmission.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedPayload {
    pub payload: IVMS101Payload,
    pub signature: String,       // Base64-encoded DER signature
    pub public_key_pem: String,  // PEM-encoded public key
    pub signed_at: u64,          // Unix timestamp
    pub algorithm: String,       // "ECDSA-P256-SHA256"
    pub transfer_id: String,
}

/// Compliance screening result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreeningResult {
    pub transfer_id: String,
    pub is_compliant: bool,
    pub risk_score: f64,
    pub flags: Vec<String>,
    pub requires_travel_rule: bool,
    pub screened_at: u64,
}

// ─── Signer ───────────────────────────────────────────────────────────────────

/// TravelRuleSigner signs IVMS 101 payloads using ECDSA P-256.
pub struct TravelRuleSigner {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
    threshold_usd: f64,
}

impl TravelRuleSigner {
    /// Create a new signer with a randomly generated key pair.
    pub fn new(threshold_usd: f64) -> Self {
        let secret_key = SecretKey::random(&mut OsRng);
        let signing_key = SigningKey::from(secret_key);
        let verifying_key = VerifyingKey::from(&signing_key);
        Self {
            signing_key,
            verifying_key,
            threshold_usd,
        }
    }

    /// Create a signer from an existing PEM-encoded private key.
    pub fn from_pem(pem: &str, threshold_usd: f64) -> Result<Self, Box<dyn std::error::Error>> {
        let secret_key = SecretKey::from_sec1_pem(pem)?;
        let signing_key = SigningKey::from(secret_key);
        let verifying_key = VerifyingKey::from(&signing_key);
        Ok(Self {
            signing_key,
            verifying_key,
            threshold_usd,
        })
    }

    /// Sign an IVMS 101 payload.
    pub fn sign(&self, payload: &IVMS101Payload, transfer_id: &str) -> Result<SignedPayload, Box<dyn std::error::Error>> {
        // Serialize payload to canonical JSON
        let payload_json = serde_json::to_string(payload)?;

        // SHA-256 hash
        let mut hasher = Sha256::new();
        hasher.update(payload_json.as_bytes());
        let hash = hasher.finalize();

        // ECDSA sign
        let signature: Signature = self.signing_key.sign(&hash);
        let sig_bytes = signature.to_der().to_bytes();
        let sig_b64 = BASE64.encode(&sig_bytes);

        // Encode public key to PEM
        let pub_key_bytes = self.verifying_key.to_encoded_point(false);
        let pub_key_pem = format!(
            "-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----\n",
            BASE64.encode(pub_key_bytes.as_bytes())
        );

        let signed_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Ok(SignedPayload {
            payload: payload.clone(),
            signature: sig_b64,
            public_key_pem: pub_key_pem,
            signed_at,
            algorithm: "ECDSA-P256-SHA256".to_string(),
            transfer_id: transfer_id.to_string(),
        })
    }

    /// Verify a signed payload.
    pub fn verify(&self, signed: &SignedPayload) -> Result<bool, Box<dyn std::error::Error>> {
        let payload_json = serde_json::to_string(&signed.payload)?;

        let mut hasher = Sha256::new();
        hasher.update(payload_json.as_bytes());
        let hash = hasher.finalize();

        let sig_bytes = BASE64.decode(&signed.signature)?;
        let signature = Signature::from_der(&sig_bytes)?;

        Ok(self.verifying_key.verify(&hash, &signature).is_ok())
    }

    /// Check if a transfer requires Travel Rule data.
    pub fn requires_travel_rule(&self, amount: f64) -> bool {
        amount >= self.threshold_usd
    }
}

// ─── Compliance Screener ──────────────────────────────────────────────────────

/// High-risk jurisdictions per FATF grey/black list.
const HIGH_RISK_COUNTRIES: &[&str] = &[
    "KP", "IR", "MM", "SY", "YE", "LY", "SO", "SS",
    "CF", "CD", "ML", "NI", "PK", "PA", "HT",
];

/// ComplianceScreener performs pre-transaction compliance screening.
pub struct ComplianceScreener {
    threshold_usd: f64,
}

impl ComplianceScreener {
    pub fn new(threshold_usd: f64) -> Self {
        Self { threshold_usd }
    }

    /// Screen a transfer for compliance issues.
    pub fn screen(
        &self,
        transfer_id: &str,
        amount: f64,
        originator_country: &str,
        beneficiary_country: &str,
        travel_rule_provided: bool,
    ) -> ScreeningResult {
        let mut flags = Vec::new();
        let mut risk_score: f64 = 0.0;
        let requires_travel_rule = amount >= self.threshold_usd;

        // Travel Rule check
        if requires_travel_rule && !travel_rule_provided {
            flags.push("TRAVEL_RULE_DATA_MISSING".to_string());
            risk_score += 40.0;
        }

        // High-risk country checks
        if HIGH_RISK_COUNTRIES.contains(&originator_country) {
            flags.push(format!("HIGH_RISK_ORIGINATOR_COUNTRY:{}", originator_country));
            risk_score += 30.0;
        }

        if HIGH_RISK_COUNTRIES.contains(&beneficiary_country) {
            flags.push(format!("HIGH_RISK_BENEFICIARY_COUNTRY:{}", beneficiary_country));
            risk_score += 30.0;
        }

        // High-value flag
        if amount >= 10_000.0 {
            flags.push("HIGH_VALUE_TRANSFER".to_string());
            risk_score += 10.0;
        }

        // Round-number structuring indicator
        if amount >= 5_000.0 && amount % 1_000.0 == 0.0 {
            flags.push("ROUND_NUMBER_STRUCTURING_INDICATOR".to_string());
            risk_score += 5.0;
        }

        let is_compliant = risk_score < 50.0
            && !flags.contains(&"TRAVEL_RULE_DATA_MISSING".to_string());

        let screened_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        ScreeningResult {
            transfer_id: transfer_id.to_string(),
            is_compliant,
            risk_score: risk_score.min(100.0),
            flags,
            requires_travel_rule,
            screened_at,
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> IVMS101Payload {
        IVMS101Payload {
            originator: IVMS101Person {
                name: "Alice Johnson".to_string(),
                account_number: "NG33ACCESS0123456789".to_string(),
                country: Some("NG".to_string()),
                national_id: Some("12345678901".to_string()),
                date_of_birth: Some("1990-01-15".to_string()),
            },
            beneficiary: IVMS101Person {
                name: "Bob Smith".to_string(),
                account_number: "GB29NWBK60161331926819".to_string(),
                country: Some("GB".to_string()),
                national_id: None,
                date_of_birth: None,
            },
            transfer: IVMS101Transfer {
                amount: 5000.0,
                currency: "NGN".to_string(),
                transaction_ref: "TXN-001".to_string(),
                execution_date: "2026-07-10".to_string(),
                originator_vasp: "ACCESSNG".to_string(),
                beneficiary_vasp: "BARCLGB2".to_string(),
            },
        }
    }

    #[test]
    fn test_sign_and_verify() {
        let signer = TravelRuleSigner::new(1000.0);
        let payload = sample_payload();
        let signed = signer.sign(&payload, "TXN-001").unwrap();

        assert!(!signed.signature.is_empty());
        assert!(signed.public_key_pem.contains("PUBLIC KEY"));
        assert_eq!(signed.algorithm, "ECDSA-P256-SHA256");

        let valid = signer.verify(&signed).unwrap();
        assert!(valid, "Signature should be valid");
    }

    #[test]
    fn test_requires_travel_rule() {
        let signer = TravelRuleSigner::new(1000.0);
        assert!(signer.requires_travel_rule(1000.0));
        assert!(signer.requires_travel_rule(5000.0));
        assert!(!signer.requires_travel_rule(999.99));
    }

    #[test]
    fn test_compliance_screening_high_risk_country() {
        let screener = ComplianceScreener::new(1000.0);
        let result = screener.screen("TXN-001", 500.0, "KP", "GB", false);
        assert!(!result.is_compliant);
        assert!(result.flags.iter().any(|f| f.contains("HIGH_RISK_ORIGINATOR_COUNTRY")));
    }

    #[test]
    fn test_compliance_screening_missing_travel_rule() {
        let screener = ComplianceScreener::new(1000.0);
        let result = screener.screen("TXN-002", 5000.0, "NG", "GB", false);
        assert!(!result.is_compliant);
        assert!(result.flags.contains(&"TRAVEL_RULE_DATA_MISSING".to_string()));
    }

    #[test]
    fn test_compliance_screening_compliant() {
        let screener = ComplianceScreener::new(1000.0);
        let result = screener.screen("TXN-003", 5000.0, "NG", "GB", true);
        assert!(result.is_compliant);
        assert!(result.flags.is_empty() || !result.flags.contains(&"TRAVEL_RULE_DATA_MISSING".to_string()));
    }
}
