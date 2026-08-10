// PayGate Billing Engine — Core Fee Computation
// All arithmetic uses rust_decimal for exact decimal math.
// No floating-point operations are used anywhere in the fee path.

use crate::errors::BillingError;
use crate::models::{
    BillingConfig, BillingResult, LedgerTransfer, PricingModel, SignOnFeeEvent,
    SubscriptionBillingEvent, TransactionEvent, TransactionStatus,
};
use chrono::Utc;
use rust_decimal::prelude::*;
use rust_decimal_macros::dec;
use uuid::Uuid;

/// TigerBeetle ledger codes
const LEDGER_NGN: u32 = 566; // ISO 4217 numeric for NGN
const CODE_GROSS_FEE: u16 = 1;
const CODE_INTERCHANGE: u16 = 2;
const CODE_PLATFORM_REVENUE: u16 = 3;
const CODE_RESELLER_REVENUE: u16 = 4;
const CODE_MERCHANT_SETTLEMENT: u16 = 5;
const CODE_SIGN_ON_FEE: u16 = 6;
const CODE_SUBSCRIPTION_FEE: u16 = 7;

pub struct BillingEngine;

impl BillingEngine {
    /// Compute billing for a completed payment transaction.
    /// Returns `None` if the transaction is not billable (e.g., failed/reversed).
    pub fn compute_transaction(
        event: &TransactionEvent,
        config: &BillingConfig,
    ) -> Result<Option<BillingResult>, BillingError> {
        // Only bill completed transactions
        if event.status != TransactionStatus::Completed {
            return Ok(None);
        }

        let gross_amount = Decimal::from(event.amount_kobo);

        // ── Step 1: Compute gross fee ─────────────────────────────────────────
        // fee = clamp(amount × rate, floor, cap)
        let raw_fee = gross_amount * config.fee_rate;
        let floor = Decimal::from(config.fee_floor_kobo);
        let cap = Decimal::from(config.fee_cap_kobo);
        let gross_fee = raw_fee.max(floor).min(cap);
        let gross_fee_kobo = gross_fee
            .round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero)
            .to_i64()
            .ok_or(BillingError::ArithmeticOverflow)?;

        // ── Step 2: Deduct interchange cost ───────────────────────────────────
        let interchange_kobo = config.interchange_cost_kobo;
        let net_fee_kobo = (gross_fee_kobo - interchange_kobo).max(0);

        // ── Step 3: Split net fee between platform and reseller ───────────────
        let net_fee = Decimal::from(net_fee_kobo);
        let platform_revenue = (net_fee * config.platform_share)
            .round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero);
        let reseller_revenue = net_fee - platform_revenue; // ensures exact sum

        let platform_revenue_kobo = platform_revenue
            .to_i64()
            .ok_or(BillingError::ArithmeticOverflow)?;
        let reseller_revenue_kobo = reseller_revenue
            .to_i64()
            .ok_or(BillingError::ArithmeticOverflow)?;

        // ── Step 4: Merchant settlement ───────────────────────────────────────
        let merchant_settlement_kobo = event.amount_kobo - gross_fee_kobo;

        // ── Step 5: Build TigerBeetle transfer batch ──────────────────────────
        let billing_id = Uuid::new_v4();
        let transfers = Self::build_transaction_transfers(
            billing_id,
            event,
            config,
            gross_fee_kobo,
            interchange_kobo,
            platform_revenue_kobo,
            reseller_revenue_kobo,
            merchant_settlement_kobo,
        );

        Ok(Some(BillingResult {
            billing_id,
            event_id: event.event_id,
            tenant_id: event.tenant_id,
            merchant_id: event.merchant_id,
            reseller_id: event.reseller_id,
            transaction_id: event.transaction_id,
            gross_amount_kobo: event.amount_kobo,
            gross_fee_kobo,
            interchange_cost_kobo: interchange_kobo,
            net_fee_kobo,
            platform_revenue_kobo,
            reseller_revenue_kobo,
            merchant_settlement_kobo,
            pricing_model: config.pricing_model.clone(),
            fee_rate_applied: config.fee_rate,
            platform_share_applied: config.platform_share,
            config_version: config.version,
            computed_at: Utc::now(),
            ledger_transfers: transfers,
        }))
    }

    /// Compute billing for a sign-on fee event.
    pub fn compute_sign_on_fee(
        event: &SignOnFeeEvent,
        config: &BillingConfig,
    ) -> Result<BillingResult, BillingError> {
        let fee_kobo = event.sign_on_fee_kobo;
        let fee = Decimal::from(fee_kobo);

        let platform_revenue = (fee * config.sign_on_platform_share)
            .round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero);
        let reseller_revenue = fee - platform_revenue;

        let platform_revenue_kobo = platform_revenue
            .to_i64()
            .ok_or(BillingError::ArithmeticOverflow)?;
        let reseller_revenue_kobo = reseller_revenue
            .to_i64()
            .ok_or(BillingError::ArithmeticOverflow)?;

        let billing_id = Uuid::new_v4();

        let transfers = vec![
            LedgerTransfer {
                id: Self::new_tb_id(),
                debit_account_id: config.tb_merchant_payable_account.clone(),
                credit_account_id: config.tb_sign_on_revenue_account.clone(),
                amount: fee_kobo,
                ledger: LEDGER_NGN,
                code: CODE_SIGN_ON_FEE,
                flags: 0,
                pending_id: None,
                user_data_128: Some(billing_id.to_string()),
                user_data_64: Some(event.merchant_id.as_u128() as u64),
                user_data_32: Some(config.version as u32),
                timeout: None,
            },
        ];

        Ok(BillingResult {
            billing_id,
            event_id: event.event_id,
            tenant_id: event.tenant_id,
            merchant_id: event.merchant_id,
            reseller_id: event.reseller_id,
            transaction_id: Uuid::nil(),
            gross_amount_kobo: fee_kobo,
            gross_fee_kobo: fee_kobo,
            interchange_cost_kobo: 0,
            net_fee_kobo: fee_kobo,
            platform_revenue_kobo,
            reseller_revenue_kobo,
            merchant_settlement_kobo: 0,
            pricing_model: PricingModel::PerTransaction,
            fee_rate_applied: dec!(1),
            platform_share_applied: config.sign_on_platform_share,
            config_version: config.version,
            computed_at: Utc::now(),
            ledger_transfers: transfers,
        })
    }

    /// Compute billing for a monthly subscription fee.
    pub fn compute_subscription(
        event: &SubscriptionBillingEvent,
        config: &BillingConfig,
    ) -> Result<BillingResult, BillingError> {
        let fee_kobo = event.subscription_fee_kobo;
        let fee = Decimal::from(fee_kobo);

        let platform_revenue = (fee * config.subscription_platform_share)
            .round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero);
        let reseller_revenue = fee - platform_revenue;

        let platform_revenue_kobo = platform_revenue
            .to_i64()
            .ok_or(BillingError::ArithmeticOverflow)?;
        let reseller_revenue_kobo = reseller_revenue
            .to_i64()
            .ok_or(BillingError::ArithmeticOverflow)?;

        let billing_id = Uuid::new_v4();

        let transfers = vec![
            LedgerTransfer {
                id: Self::new_tb_id(),
                debit_account_id: config.tb_merchant_payable_account.clone(),
                credit_account_id: config.tb_platform_revenue_account.clone(),
                amount: platform_revenue_kobo,
                ledger: LEDGER_NGN,
                code: CODE_SUBSCRIPTION_FEE,
                flags: 0,
                pending_id: None,
                user_data_128: Some(billing_id.to_string()),
                user_data_64: Some(event.merchant_id.as_u128() as u64),
                user_data_32: Some(config.version as u32),
                timeout: None,
            },
            LedgerTransfer {
                id: Self::new_tb_id(),
                debit_account_id: config.tb_merchant_payable_account.clone(),
                credit_account_id: config.tb_reseller_payable_account.clone(),
                amount: reseller_revenue_kobo,
                ledger: LEDGER_NGN,
                code: CODE_SUBSCRIPTION_FEE,
                flags: 0,
                pending_id: None,
                user_data_128: Some(billing_id.to_string()),
                user_data_64: Some(event.merchant_id.as_u128() as u64),
                user_data_32: Some(config.version as u32),
                timeout: None,
            },
        ];

        Ok(BillingResult {
            billing_id,
            event_id: event.event_id,
            tenant_id: event.tenant_id,
            merchant_id: event.merchant_id,
            reseller_id: None,
            transaction_id: Uuid::nil(),
            gross_amount_kobo: fee_kobo,
            gross_fee_kobo: fee_kobo,
            interchange_cost_kobo: 0,
            net_fee_kobo: fee_kobo,
            platform_revenue_kobo,
            reseller_revenue_kobo,
            merchant_settlement_kobo: 0,
            pricing_model: PricingModel::Subscription,
            fee_rate_applied: dec!(1),
            platform_share_applied: config.subscription_platform_share,
            config_version: config.version,
            computed_at: Utc::now(),
            ledger_transfers: transfers,
        })
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn build_transaction_transfers(
        billing_id: Uuid,
        event: &TransactionEvent,
        config: &BillingConfig,
        gross_fee_kobo: i64,
        interchange_kobo: i64,
        platform_revenue_kobo: i64,
        reseller_revenue_kobo: i64,
        merchant_settlement_kobo: i64,
    ) -> Vec<LedgerTransfer> {
        let uid64 = event.merchant_id.as_u128() as u64;
        let uid32 = config.version as u32;
        let bid = Some(billing_id.to_string());

        vec![
            // 1. Gross fee: merchant payable → interchange cost account
            LedgerTransfer {
                id: Self::new_tb_id(),
                debit_account_id: config.tb_merchant_payable_account.clone(),
                credit_account_id: config.tb_interchange_cost_account.clone(),
                amount: interchange_kobo,
                ledger: LEDGER_NGN,
                code: CODE_INTERCHANGE,
                flags: 0,
                pending_id: None,
                user_data_128: bid.clone(),
                user_data_64: Some(uid64),
                user_data_32: Some(uid32),
                timeout: None,
            },
            // 2. Platform revenue: merchant payable → platform revenue
            LedgerTransfer {
                id: Self::new_tb_id(),
                debit_account_id: config.tb_merchant_payable_account.clone(),
                credit_account_id: config.tb_platform_revenue_account.clone(),
                amount: platform_revenue_kobo,
                ledger: LEDGER_NGN,
                code: CODE_PLATFORM_REVENUE,
                flags: 0,
                pending_id: None,
                user_data_128: bid.clone(),
                user_data_64: Some(uid64),
                user_data_32: Some(uid32),
                timeout: None,
            },
            // 3. Reseller revenue: merchant payable → reseller payable
            LedgerTransfer {
                id: Self::new_tb_id(),
                debit_account_id: config.tb_merchant_payable_account.clone(),
                credit_account_id: config.tb_reseller_payable_account.clone(),
                amount: reseller_revenue_kobo,
                ledger: LEDGER_NGN,
                code: CODE_RESELLER_REVENUE,
                flags: 0,
                pending_id: None,
                user_data_128: bid.clone(),
                user_data_64: Some(uid64),
                user_data_32: Some(uid32),
                timeout: None,
            },
        ]
    }

    /// Generate a new TigerBeetle-compatible transfer ID (u128 as decimal string).
    fn new_tb_id() -> String {
        let id = Uuid::new_v4().as_u128();
        id.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{TransactionChannel, TransactionStatus};
    use chrono::Utc;
    use rust_decimal_macros::dec;

    fn make_config() -> BillingConfig {
        BillingConfig {
            tenant_id: Uuid::new_v4(),
            pricing_model: PricingModel::PerTransaction,
            fee_rate: dec!(0.015),          // 1.5%
            fee_cap_kobo: 200_000,           // ₦2,000
            fee_floor_kobo: 5_000,           // ₦50
            platform_share: dec!(0.65),      // 65%
            reseller_share: dec!(0.35),      // 35%
            interchange_cost_kobo: 2_500,    // ₦25
            sign_on_fee_kobo: 5_000_000,     // ₦50,000
            sign_on_platform_share: dec!(0.70),
            subscription_fee_kobo: 1_500_000, // ₦15,000
            subscription_platform_share: dec!(0.65),
            tb_merchant_payable_account: "1001".to_string(),
            tb_platform_revenue_account: "1002".to_string(),
            tb_reseller_payable_account: "1003".to_string(),
            tb_interchange_cost_account: "1004".to_string(),
            tb_sign_on_revenue_account: "1005".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            version: 1,
        }
    }

    fn make_txn(amount_kobo: i64) -> TransactionEvent {
        TransactionEvent {
            event_id: Uuid::new_v4(),
            tenant_id: Uuid::new_v4(),
            merchant_id: Uuid::new_v4(),
            reseller_id: Some(Uuid::new_v4()),
            transaction_id: Uuid::new_v4(),
            amount_kobo,
            currency: "NGN".to_string(),
            channel: TransactionChannel::BankTransfer,
            status: TransactionStatus::Completed,
            occurred_at: Utc::now(),
            idempotency_key: Uuid::new_v4().to_string(),
        }
    }

    #[test]
    fn test_typical_transaction_10k_ngn() {
        let config = make_config();
        let event = make_txn(1_000_000); // ₦10,000 = 1,000,000 kobo
        let result = BillingEngine::compute_transaction(&event, &config)
            .unwrap()
            .unwrap();

        // 1.5% of ₦10,000 = ₦150 = 15,000 kobo (within floor/cap)
        assert_eq!(result.gross_fee_kobo, 15_000);
        // net fee = 15,000 - 2,500 = 12,500 kobo
        assert_eq!(result.net_fee_kobo, 12_500);
        // platform 65% of 12,500 = 8,125 kobo
        assert_eq!(result.platform_revenue_kobo, 8_125);
        // reseller 35% of 12,500 = 4,375 kobo
        assert_eq!(result.reseller_revenue_kobo, 4_375);
        // platform + reseller = net fee
        assert_eq!(
            result.platform_revenue_kobo + result.reseller_revenue_kobo,
            result.net_fee_kobo
        );
        // merchant settlement = 1,000,000 - 15,000 = 985,000 kobo
        assert_eq!(result.merchant_settlement_kobo, 985_000);
        // 3 TigerBeetle transfers
        assert_eq!(result.ledger_transfers.len(), 3);
    }

    #[test]
    fn test_fee_floor_applied_small_transaction() {
        let config = make_config();
        let event = make_txn(10_000); // ₦100 = 10,000 kobo
        let result = BillingEngine::compute_transaction(&event, &config)
            .unwrap()
            .unwrap();

        // 1.5% of ₦100 = ₦1.50 = 150 kobo < floor of 5,000 kobo
        assert_eq!(result.gross_fee_kobo, 5_000); // floor applied
    }

    #[test]
    fn test_fee_cap_applied_large_transaction() {
        let config = make_config();
        let event = make_txn(20_000_000); // ₦200,000 = 20,000,000 kobo
        let result = BillingEngine::compute_transaction(&event, &config)
            .unwrap()
            .unwrap();

        // 1.5% of ₦200,000 = ₦3,000 = 300,000 kobo > cap of 200,000 kobo
        assert_eq!(result.gross_fee_kobo, 200_000); // cap applied
    }

    #[test]
    fn test_failed_transaction_not_billed() {
        let config = make_config();
        let mut event = make_txn(1_000_000);
        event.status = TransactionStatus::Failed;
        let result = BillingEngine::compute_transaction(&event, &config).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_reversed_transaction_not_billed() {
        let config = make_config();
        let mut event = make_txn(1_000_000);
        event.status = TransactionStatus::Reversed;
        let result = BillingEngine::compute_transaction(&event, &config).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_platform_reseller_split_sums_to_net_fee() {
        let config = make_config();
        // Test multiple amounts to ensure split always sums correctly
        for amount in [50_000, 100_000, 500_000, 1_000_000, 5_000_000, 20_000_000] {
            let event = make_txn(amount);
            let result = BillingEngine::compute_transaction(&event, &config)
                .unwrap()
                .unwrap();
            assert_eq!(
                result.platform_revenue_kobo + result.reseller_revenue_kobo,
                result.net_fee_kobo,
                "Split must sum to net fee for amount {}",
                amount
            );
        }
    }

    #[test]
    fn test_sign_on_fee_computation() {
        let config = make_config();
        let event = SignOnFeeEvent {
            event_id: Uuid::new_v4(),
            tenant_id: config.tenant_id,
            merchant_id: Uuid::new_v4(),
            reseller_id: None,
            sign_on_fee_kobo: 5_000_000, // ₦50,000
            occurred_at: Utc::now(),
            idempotency_key: Uuid::new_v4().to_string(),
        };
        let result = BillingEngine::compute_sign_on_fee(&event, &config).unwrap();
        // 70% of ₦50,000 = ₦35,000 = 3,500,000 kobo
        assert_eq!(result.platform_revenue_kobo, 3_500_000);
        // 30% = ₦15,000 = 1,500,000 kobo
        assert_eq!(result.reseller_revenue_kobo, 1_500_000);
    }

    #[test]
    fn test_subscription_fee_computation() {
        let config = make_config();
        let event = SubscriptionBillingEvent {
            event_id: Uuid::new_v4(),
            tenant_id: config.tenant_id,
            merchant_id: Uuid::new_v4(),
            billing_period_start: Utc::now(),
            billing_period_end: Utc::now(),
            subscription_fee_kobo: 1_500_000, // ₦15,000
            occurred_at: Utc::now(),
            idempotency_key: Uuid::new_v4().to_string(),
        };
        let result = BillingEngine::compute_subscription(&event, &config).unwrap();
        // 65% of ₦15,000 = ₦9,750 = 975,000 kobo
        assert_eq!(result.platform_revenue_kobo, 975_000);
        // 35% = ₦5,250 = 525,000 kobo
        assert_eq!(result.reseller_revenue_kobo, 525_000);
        assert_eq!(result.ledger_transfers.len(), 2);
    }
}
