//! crypto-guard: Cryptographic security primitives for PayGate.
//!
//! Provides:
//! - HMAC-SHA256/SHA512 webhook signature verification (timing-safe)
//! - Replay attack protection via nonce store (Redis-backed)
//! - Idempotency key validation
//! - Nonce generation (cryptographically secure)
//! - Timestamp window validation (prevents replay within configurable window)
//! - NIBSS, Stripe, PIX, Mojaloop, and generic webhook signature verification

pub mod hmac_verify;
pub mod nonce;
pub mod replay;
pub mod webhook;

pub use hmac_verify::*;
pub use nonce::*;
pub use replay::*;
pub use webhook::*;
