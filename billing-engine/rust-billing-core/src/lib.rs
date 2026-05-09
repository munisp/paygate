// PayGate Billing Core — Library
// Deterministic fee computation, profit split, and TigerBeetle ledger posting.
// All monetary values are in kobo (1 NGN = 100 kobo) stored as i64 to avoid
// floating-point rounding errors.

pub mod config;
pub mod engine;
pub mod ledger;
pub mod models;
pub mod errors;

pub use engine::BillingEngine;
pub use models::{
    BillingConfig, BillingResult, PricingModel, TransactionEvent, LedgerTransfer,
};
