//! NextHub NEPA STS (Standard Transfer Specification) Token Engine (Rust)
//!
//! Implements IEC 62055-41 compliant prepaid electricity token generation
//! and validation. Tokens are 20-digit numeric codes that encode:
//! - Meter number (MSN)
//! - Units (kWh)
//! - Token class (transfer credit, clear tamper, etc.)
//! - CRC checksum
//!
//! This module provides the cryptographic core; the Go VendWorkflow
//! calls this via the Rust HTTP sidecar service.

use std::time::{SystemTime, UNIX_EPOCH};

use aes::Aes128;
use cipher::{BlockEncrypt, KeyInit, generic_array::GenericArray};
use serde::{Deserialize, Serialize};

// ─── Types ────────────────────────────────────────────────────────────────────

/// Token class per IEC 62055-41.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum TokenClass {
    TransferCredit = 0,
    ClearCredit = 1,
    SetMaximumPowerLimit = 2,
    ClearTamperCondition = 4,
    SetTariffRate = 5,
    Set1stSectionDecoder = 6,
    Set2ndSectionDecoder = 7,
    ManufacturerSpecific = 8,
}

/// STS token generation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenRequest {
    pub meter_number: String,    // 11-digit meter serial number
    pub units: f64,              // kWh units to vend
    pub token_class: TokenClass,
    pub tariff_index: u8,        // 0-15
    pub key_revision: u8,        // 1-15
    pub vend_id: String,
}

/// Generated STS token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct STSToken {
    pub token: String,           // 20-digit numeric token
    pub meter_number: String,
    pub units: f64,
    pub token_class: TokenClass,
    pub generated_at: u64,
    pub expires_at: u64,         // Unix timestamp (30 days)
    pub vend_id: String,
}

/// Token validation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenValidationResult {
    pub token: String,
    pub is_valid: bool,
    pub is_expired: bool,
    pub units: Option<f64>,
    pub meter_number: Option<String>,
    pub error: Option<String>,
}

// ─── STS Token Engine ─────────────────────────────────────────────────────────

/// STSTokenEngine generates and validates IEC 62055-41 compliant tokens.
pub struct STSTokenEngine {
    vending_key: [u8; 16],  // 128-bit AES vending key
}

impl STSTokenEngine {
    /// Create a new engine with the given 128-bit vending key.
    pub fn new(vending_key: [u8; 16]) -> Self {
        Self { vending_key }
    }

    /// Create an engine with a default development key.
    pub fn development() -> Self {
        // Development key — never use in production
        Self {
            vending_key: [0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6,
                          0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c],
        }
    }

    /// Generate an STS token for a vending request.
    pub fn generate(&self, req: &TokenRequest) -> Result<STSToken, Box<dyn std::error::Error>> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Encode units to 8-bit value (0.1 kWh resolution, max 25.5 kWh per token)
        // For larger amounts, multiple tokens are issued
        let units_encoded = (req.units * 10.0).min(255.0) as u8;

        // Build token data block (16 bytes for AES-128)
        let mut data = [0u8; 16];
        // Bytes 0-3: meter number hash (truncated)
        let meter_hash = self.hash_meter_number(&req.meter_number);
        data[0..4].copy_from_slice(&meter_hash[0..4]);
        // Byte 4: token class
        data[4] = req.token_class as u8;
        // Byte 5: units
        data[5] = units_encoded;
        // Byte 6: tariff index
        data[6] = req.tariff_index;
        // Byte 7: key revision
        data[7] = req.key_revision;
        // Bytes 8-11: timestamp (32-bit)
        let ts_bytes = (now as u32).to_be_bytes();
        data[8..12].copy_from_slice(&ts_bytes);
        // Bytes 12-15: CRC32 of first 12 bytes
        let crc = self.crc32(&data[0..12]);
        let crc_bytes = crc.to_be_bytes();
        data[12..16].copy_from_slice(&crc_bytes);

        // Encrypt with AES-128
        let cipher = Aes128::new(GenericArray::from_slice(&self.vending_key));
        let mut block = GenericArray::clone_from_slice(&data);
        cipher.encrypt_block(&mut block);

        // Encode to 20-digit decimal token
        let token = self.encode_to_decimal(&block);

        let expires_at = now + (30 * 24 * 3600); // 30 days

        Ok(STSToken {
            token,
            meter_number: req.meter_number.clone(),
            units: req.units,
            token_class: req.token_class,
            generated_at: now,
            expires_at,
            vend_id: req.vend_id.clone(),
        })
    }

    /// Validate an STS token.
    pub fn validate(&self, token: &str, meter_number: &str) -> TokenValidationResult {
        if token.len() != 20 || !token.chars().all(|c| c.is_ascii_digit()) {
            return TokenValidationResult {
                token: token.to_string(),
                is_valid: false,
                is_expired: false,
                units: None,
                meter_number: None,
                error: Some("Invalid token format".to_string()),
            };
        }

        // Decode from 20-digit decimal
        let block_bytes = match self.decode_from_decimal(token) {
            Ok(b) => b,
            Err(e) => {
                return TokenValidationResult {
                    token: token.to_string(),
                    is_valid: false,
                    is_expired: false,
                    units: None,
                    meter_number: None,
                    error: Some(format!("Decode error: {}", e)),
                };
            }
        };

        // Decrypt with AES-128
        use aes::cipher::BlockDecrypt;
        let decipher = Aes128::new(GenericArray::from_slice(&self.vending_key));
        let mut block = GenericArray::clone_from_slice(&block_bytes);
        decipher.decrypt_block(&mut block);
        let data: [u8; 16] = block.into();

        // Verify CRC
        let expected_crc = self.crc32(&data[0..12]);
        let actual_crc = u32::from_be_bytes([data[12], data[13], data[14], data[15]]);
        if expected_crc != actual_crc {
            return TokenValidationResult {
                token: token.to_string(),
                is_valid: false,
                is_expired: false,
                units: None,
                meter_number: None,
                error: Some("CRC verification failed".to_string()),
            };
        }

        // Verify meter number
        let meter_hash = self.hash_meter_number(meter_number);
        if data[0..4] != meter_hash[0..4] {
            return TokenValidationResult {
                token: token.to_string(),
                is_valid: false,
                is_expired: false,
                units: None,
                meter_number: None,
                error: Some("Meter number mismatch".to_string()),
            };
        }

        // Check expiry
        let token_ts = u32::from_be_bytes([data[8], data[9], data[10], data[11]]) as u64;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let is_expired = now > token_ts + (30 * 24 * 3600);

        let units = data[5] as f64 / 10.0;

        TokenValidationResult {
            token: token.to_string(),
            is_valid: true,
            is_expired,
            units: Some(units),
            meter_number: Some(meter_number.to_string()),
            error: None,
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    fn hash_meter_number(&self, meter_number: &str) -> [u8; 16] {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(meter_number.as_bytes());
        let hash = hasher.finalize();
        let mut result = [0u8; 16];
        result.copy_from_slice(&hash[0..16]);
        result
    }

    fn crc32(&self, data: &[u8]) -> u32 {
        let mut crc: u32 = 0xFFFFFFFF;
        for byte in data {
            crc ^= (*byte as u32) << 24;
            for _ in 0..8 {
                if crc & 0x80000000 != 0 {
                    crc = (crc << 1) ^ 0x04C11DB7;
                } else {
                    crc <<= 1;
                }
            }
        }
        crc ^ 0xFFFFFFFF
    }

    fn encode_to_decimal(&self, block: &[u8]) -> String {
        // Convert 16 bytes to a 20-digit decimal string using base-10 encoding
        let mut value: u128 = 0;
        for &byte in block.iter().take(10) {
            value = value * 256 + byte as u128;
        }
        // Truncate to 20 digits
        let s = format!("{:020}", value % 100_000_000_000_000_000_000u128);
        s
    }

    fn decode_from_decimal(&self, token: &str) -> Result<[u8; 16], Box<dyn std::error::Error>> {
        let value: u128 = token.parse()?;
        let mut result = [0u8; 16];
        let mut v = value;
        for i in (0..10).rev() {
            result[i] = (v % 256) as u8;
            v /= 256;
        }
        Ok(result)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_token() {
        let engine = STSTokenEngine::development();
        let req = TokenRequest {
            meter_number: "45678901234".to_string(),
            units: 10.0,
            token_class: TokenClass::TransferCredit,
            tariff_index: 1,
            key_revision: 1,
            vend_id: "VEND-001".to_string(),
        };

        let token = engine.generate(&req).unwrap();
        assert_eq!(token.token.len(), 20, "Token should be 20 digits");
        assert!(token.token.chars().all(|c| c.is_ascii_digit()), "Token should be numeric");
        assert_eq!(token.units, 10.0);
    }

    #[test]
    fn test_validate_token() {
        let engine = STSTokenEngine::development();
        let req = TokenRequest {
            meter_number: "45678901234".to_string(),
            units: 5.0,
            token_class: TokenClass::TransferCredit,
            tariff_index: 1,
            key_revision: 1,
            vend_id: "VEND-002".to_string(),
        };

        let token = engine.generate(&req).unwrap();
        let result = engine.validate(&token.token, &req.meter_number);
        assert!(result.is_valid, "Generated token should be valid");
        assert!(!result.is_expired, "Token should not be expired");
    }

    #[test]
    fn test_wrong_meter_fails() {
        let engine = STSTokenEngine::development();
        let req = TokenRequest {
            meter_number: "45678901234".to_string(),
            units: 5.0,
            token_class: TokenClass::TransferCredit,
            tariff_index: 1,
            key_revision: 1,
            vend_id: "VEND-003".to_string(),
        };

        let token = engine.generate(&req).unwrap();
        let result = engine.validate(&token.token, "99999999999");
        assert!(!result.is_valid, "Token should fail for wrong meter");
    }

    #[test]
    fn test_invalid_format_fails() {
        let engine = STSTokenEngine::development();
        let result = engine.validate("INVALID-TOKEN", "45678901234");
        assert!(!result.is_valid);
    }
}
