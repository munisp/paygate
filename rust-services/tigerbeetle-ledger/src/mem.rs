// In-memory ledger store — DEV ONLY.
//
// Enabled exclusively via LEDGER_ALLOW_IN_MEMORY=1. Provides zero durability:
// a restart loses every account and transfer. Retained so unit tests and local
// development can run without a Postgres instance. Business semantics
// (double-entry under a single write lock, insufficient-funds rejection,
// idempotent replay on `reference`) mirror the Postgres backend exactly.

use crate::model::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Default)]
pub struct LedgerState {
    pub accounts: HashMap<String, Account>,
    pub transfers: Vec<Transfer>,
    pub account_index: HashMap<String, Vec<String>>, // merchant_id -> [account_ids]
    pub reference_index: HashMap<String, usize>,     // reference -> transfers[idx]
    pub crossborder_payloads: HashMap<String, serde_json::Value>, // reference -> response
}

#[derive(Clone, Default)]
pub struct MemStore {
    pub state: Arc<RwLock<LedgerState>>,
}

impl MemStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn create_account(&self, req: CreateAccountRequest) -> Result<Account, StoreError> {
        let account_id = Uuid::new_v4().to_string();
        let ledger_code = req
            .ledger_code
            .unwrap_or_else(|| currency_to_ledger_code(&req.currency));

        let account = Account {
            id: account_id.clone(),
            merchant_id: req.merchant_id.clone(),
            account_type: req.account_type,
            ledger_code,
            currency: req.currency.to_uppercase(),
            debits_posted: 0,
            credits_posted: 0,
            debits_pending: 0,
            credits_pending: 0,
            flags: 0,
            created_at: now_nanos(),
        };

        let mut s = self.state.write().await;
        s.accounts.insert(account_id.clone(), account.clone());
        s.account_index
            .entry(req.merchant_id)
            .or_default()
            .push(account_id);

        Ok(account)
    }

    pub async fn get_account(&self, account_id: &str) -> Result<Account, StoreError> {
        let s = self.state.read().await;
        s.accounts
            .get(account_id)
            .cloned()
            .ok_or_else(|| StoreError::AccountNotFound {
                account_id: account_id.to_string(),
                role: "account",
            })
    }

    pub async fn create_transfer(
        &self,
        req: CreateTransferRequest,
    ) -> Result<(Transfer, bool), StoreError> {
        validate_transfer_request(&req)?;
        let mut s = self.state.write().await;

        // Idempotent replay: a previously committed reference returns the original.
        if let Some(&idx) = s.reference_index.get(&req.reference) {
            return Ok((s.transfers[idx].clone(), true));
        }

        if !s.accounts.contains_key(&req.debit_account_id) {
            return Err(StoreError::AccountNotFound {
                account_id: req.debit_account_id.clone(),
                role: "debit account",
            });
        }
        if !s.accounts.contains_key(&req.credit_account_id) {
            return Err(StoreError::AccountNotFound {
                account_id: req.credit_account_id.clone(),
                role: "credit account",
            });
        }

        let available = s.accounts[&req.debit_account_id].available();
        if available < req.amount {
            return Err(StoreError::InsufficientFunds {
                account_id: req.debit_account_id.clone(),
                available,
                requested: req.amount,
            });
        }

        // Double-entry under the write lock.
        if let Some(debit_acct) = s.accounts.get_mut(&req.debit_account_id) {
            debit_acct.debits_posted += req.amount;
        }
        if let Some(credit_acct) = s.accounts.get_mut(&req.credit_account_id) {
            credit_acct.credits_posted += req.amount;
        }

        let transfer = Transfer {
            id: Uuid::new_v4().to_string(),
            debit_account_id: req.debit_account_id,
            credit_account_id: req.credit_account_id,
            amount: req.amount,
            ledger_code: currency_to_ledger_code(&req.currency),
            currency: req.currency.to_uppercase(),
            rail: req.rail,
            transfer_type: req.transfer_type,
            reference: req.reference.clone(),
            merchant_id: req.merchant_id,
            flags: 0,
            timestamp: now_nanos(),
            settled_at: Some(now_nanos()),
        };

        let idx = s.transfers.len();
        s.reference_index.insert(req.reference, idx);
        s.transfers.push(transfer.clone());
        Ok((transfer, false))
    }

    pub async fn cross_border_transfer(
        &self,
        req: CrossBorderTransferRequest,
    ) -> Result<(serde_json::Value, bool), StoreError> {
        let plan = plan_cross_border(&req)?;
        let reference = plan.reference.clone();
        let mut s = self.state.write().await;
        let ts = now_nanos();

        // Idempotent replay on the business reference.
        if let Some(payload) = s.crossborder_payloads.get(&reference) {
            return Ok((payload.clone(), true));
        }

        // Create escrow/settlement/fee accounts on first use — zero balance.
        // NO fabricated funds: the escrow must be funded by real inbound
        // transfers before cross-border debits will clear.
        for (id, acct_type, currency) in [
            (
                plan.escrow_id.clone(),
                plan.escrow_type.clone(),
                plan.source_currency.clone(),
            ),
            (
                plan.settlement_id.clone(),
                AccountType::Settlement,
                plan.settlement_currency.clone(),
            ),
            (plan.fee_id.clone(), AccountType::Fee, plan.source_currency.clone()),
        ] {
            if !s.accounts.contains_key(&id) {
                s.accounts.insert(
                    id.clone(),
                    Account {
                        id: id.clone(),
                        merchant_id: req.merchant_id.clone(),
                        account_type: acct_type,
                        ledger_code: currency_to_ledger_code(&currency),
                        currency: currency.to_uppercase(),
                        debits_posted: 0,
                        credits_posted: 0,
                        debits_pending: 0,
                        credits_pending: 0,
                        flags: 0,
                        created_at: ts,
                    },
                );
                s.account_index
                    .entry(req.merchant_id.clone())
                    .or_default()
                    .push(id);
            }
        }

        // Insufficient-funds enforcement (was missing: old code fabricated
        // 10x the transfer amount as a demo seed and never checked).
        let available = s.accounts[&plan.escrow_id].available();
        if available < plan.total_debit {
            return Err(StoreError::InsufficientFunds {
                account_id: plan.escrow_id.clone(),
                available,
                requested: plan.total_debit,
            });
        }

        // Double-entry: escrow debit → settlement credit, escrow debit → fee credit.
        if let Some(escrow) = s.accounts.get_mut(&plan.escrow_id) {
            escrow.debits_posted += plan.total_debit;
        }
        if let Some(settlement) = s.accounts.get_mut(&plan.settlement_id) {
            settlement.credits_posted += plan.target_amount;
        }
        if let Some(fee_acct) = s.accounts.get_mut(&plan.fee_id) {
            fee_acct.credits_posted += req.fee_amount;
        }

        let t1 = Transfer {
            id: plan.t1_id.clone(),
            debit_account_id: plan.escrow_id.clone(),
            credit_account_id: plan.settlement_id.clone(),
            amount: req.amount,
            ledger_code: currency_to_ledger_code(&plan.source_currency),
            currency: plan.source_currency.clone(),
            rail: req.rail.clone(),
            transfer_type: TransferType::CrossBorderDebit,
            reference: reference.clone(),
            merchant_id: req.merchant_id.clone(),
            flags: 0,
            timestamp: ts,
            settled_at: Some(ts),
        };
        let t2 = Transfer {
            id: plan.t2_id.clone(),
            debit_account_id: plan.escrow_id.clone(),
            credit_account_id: plan.fee_id.clone(),
            amount: req.fee_amount,
            ledger_code: currency_to_ledger_code(&plan.source_currency),
            currency: plan.source_currency.clone(),
            rail: req.rail.clone(),
            transfer_type: TransferType::FeeDebit,
            reference: format!("fee-{}", reference),
            merchant_id: req.merchant_id.clone(),
            flags: 0,
            timestamp: ts,
            settled_at: Some(ts),
        };

        let base = s.transfers.len();
        s.reference_index.insert(reference.clone(), base);
        s.reference_index
            .insert(format!("fee-{}", reference), base + 1);
        s.transfers.push(t1);
        s.transfers.push(t2);

        let payload = serde_json::json!({
            "success": true,
            "transfer_id": req.transfer_id,
            "rail": req.rail,
            "source_amount": req.amount,
            "source_currency": plan.source_currency,
            "target_amount": plan.target_amount,
            "target_currency": plan.settlement_currency,
            "fee_amount": req.fee_amount,
            "exchange_rate": req.exchange_rate,
            "ledger_entries": 2,
            "escrow_account": plan.escrow_id,
            "settlement_account": plan.settlement_id,
            "settled_at": ts
        });
        s.crossborder_payloads.insert(reference, payload.clone());

        Ok((payload, false))
    }

    pub async fn list_transfers(
        &self,
        merchant_id: &str,
        rail: &str,
        limit: usize,
    ) -> (Vec<Transfer>, usize) {
        let s = self.state.read().await;
        let transfers: Vec<Transfer> = s
            .transfers
            .iter()
            .filter(|t| {
                (merchant_id.is_empty() || t.merchant_id == merchant_id)
                    && (rail.is_empty() || t.rail == rail)
            })
            .rev()
            .take(limit)
            .cloned()
            .collect();
        (transfers, s.transfers.len())
    }

    pub async fn list_accounts(&self, merchant_id: &str) -> Vec<Account> {
        let s = self.state.read().await;
        s.accounts
            .values()
            .filter(|a| merchant_id.is_empty() || a.merchant_id == merchant_id)
            .cloned()
            .collect()
    }

    pub async fn stats(&self) -> LedgerStats {
        let s = self.state.read().await;

        let mut volume_by_rail: HashMap<String, i64> = HashMap::new();
        let mut total_fees: i64 = 0;
        let mut currencies: std::collections::HashSet<String> = std::collections::HashSet::new();

        for t in &s.transfers {
            *volume_by_rail.entry(t.rail.clone()).or_insert(0) += t.amount;
            if matches!(t.transfer_type, TransferType::FeeDebit) {
                total_fees += t.amount;
            }
            currencies.insert(t.currency.clone());
        }

        LedgerStats {
            total_accounts: s.accounts.len(),
            total_transfers: s.transfers.len(),
            total_volume_by_rail: volume_by_rail,
            total_fees_collected: total_fees,
            active_currencies: currencies.into_iter().collect(),
        }
    }

    pub async fn seed_demo_accounts(&self) {
        let mut s = self.state.write().await;
        seed_demo_accounts_into(&mut s);
    }
}

fn seed_demo_accounts_into(s: &mut LedgerState) {
    let demo_merchant = "merchant_demo_001";
    let ts = now_nanos();

    for (id, acct_type, currency, balance) in [
        ("escrow-demo-usd", AccountType::Escrow, "USD", 10_000_000_i64),
        ("escrow-demo-cny", AccountType::CrossBorderCips, "CNY", 50_000_000_i64),
        ("escrow-demo-inr", AccountType::CrossBorderUpi, "INR", 500_000_000_i64),
        ("escrow-demo-brl", AccountType::CrossBorderPix, "BRL", 20_000_000_i64),
        ("settlement-demo-ngn", AccountType::Settlement, "NGN", 0_i64),
        ("fee-demo-usd", AccountType::Fee, "USD", 0_i64),
    ] {
        if s.accounts.contains_key(id) {
            continue;
        }
        s.accounts.insert(
            id.to_string(),
            Account {
                id: id.to_string(),
                merchant_id: demo_merchant.to_string(),
                account_type: acct_type,
                ledger_code: currency_to_ledger_code(currency),
                currency: currency.to_string(),
                debits_posted: 0,
                credits_posted: balance,
                debits_pending: 0,
                credits_pending: 0,
                flags: 0,
                created_at: ts,
            },
        );
        s.account_index
            .entry(demo_merchant.to_string())
            .or_default()
            .push(id.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_funded() -> (MemStore, Account, Account) {
        let store = MemStore::new();
        let debit = store
            .create_account(CreateAccountRequest {
                merchant_id: "m1".into(),
                account_type: AccountType::Merchant,
                currency: "USD".into(),
                ledger_code: None,
            })
            .await
            .unwrap();
        let credit = store
            .create_account(CreateAccountRequest {
                merchant_id: "m1".into(),
                account_type: AccountType::Settlement,
                currency: "USD".into(),
                ledger_code: None,
            })
            .await
            .unwrap();

        // Fund the debit account from a system suspense account.
        let source = store
            .create_account(CreateAccountRequest {
                merchant_id: "system".into(),
                account_type: AccountType::Suspense,
                currency: "USD".into(),
                ledger_code: None,
            })
            .await
            .unwrap();
        {
            let mut s = store.state.write().await;
            s.accounts.get_mut(&source.id).unwrap().credits_posted = 1_000_000;
        }
        store
            .create_transfer(CreateTransferRequest {
                debit_account_id: source.id.clone(),
                credit_account_id: debit.id.clone(),
                amount: 50_000,
                currency: "USD".into(),
                rail: "test".into(),
                transfer_type: TransferType::Settlement,
                reference: "fund-1".into(),
                merchant_id: "m1".into(),
            })
            .await
            .unwrap();
        (store, debit, credit)
    }

    fn xfer_req(debit: &str, credit: &str, amount: i64, reference: &str) -> CreateTransferRequest {
        CreateTransferRequest {
            debit_account_id: debit.into(),
            credit_account_id: credit.into(),
            amount,
            currency: "USD".into(),
            rail: "test".into(),
            transfer_type: TransferType::CrossBorderDebit,
            reference: reference.into(),
            merchant_id: "m1".into(),
        }
    }

    #[tokio::test]
    async fn debit_credit_updates_balances() {
        let (store, debit, credit) = setup_funded().await;
        let (t, replayed) = store
            .create_transfer(xfer_req(&debit.id, &credit.id, 12_500, "ref-1"))
            .await
            .unwrap();
        assert!(!replayed);
        assert_eq!(t.amount, 12_500);

        let d = store.get_account(&debit.id).await.unwrap();
        let c = store.get_account(&credit.id).await.unwrap();
        assert_eq!(d.debits_posted, 12_500);
        assert_eq!(d.balance(), 50_000 - 12_500);
        assert_eq!(c.credits_posted, 12_500);
        assert_eq!(c.balance(), 12_500);
    }

    #[tokio::test]
    async fn insufficient_funds_rejected_and_no_partial_posting() {
        let (store, debit, credit) = setup_funded().await;
        let err = store
            .create_transfer(xfer_req(&debit.id, &credit.id, 50_001, "ref-over"))
            .await
            .unwrap_err();
        match err {
            StoreError::InsufficientFunds {
                available,
                requested,
                ..
            } => {
                assert_eq!(available, 50_000);
                assert_eq!(requested, 50_001);
            }
            other => panic!("expected InsufficientFunds, got {:?}", other),
        }

        let d = store.get_account(&debit.id).await.unwrap();
        let c = store.get_account(&credit.id).await.unwrap();
        assert_eq!(d.debits_posted, 0);
        assert_eq!(c.credits_posted, 0);
        assert_eq!(store.list_transfers("", "", 50).await .1, 1); // only funding transfer
    }

    #[tokio::test]
    async fn idempotent_replay_returns_original_without_double_posting() {
        let (store, debit, credit) = setup_funded().await;
        let (first, replayed) = store
            .create_transfer(xfer_req(&debit.id, &credit.id, 7_000, "ref-dupe"))
            .await
            .unwrap();
        assert!(!replayed);

        let (second, replayed) = store
            .create_transfer(xfer_req(&debit.id, &credit.id, 7_000, "ref-dupe"))
            .await
            .unwrap();
        assert!(replayed);
        assert_eq!(first.id, second.id);

        let d = store.get_account(&debit.id).await.unwrap();
        assert_eq!(d.debits_posted, 7_000, "replay must not double-post");
    }

    #[tokio::test]
    async fn missing_accounts_rejected() {
        let (store, debit, credit) = setup_funded().await;
        let err = store
            .create_transfer(xfer_req("nope", &credit.id, 1, "ref-x"))
            .await
            .unwrap_err();
        assert!(matches!(err, StoreError::AccountNotFound { .. }));
        let err = store
            .create_transfer(xfer_req(&debit.id, "nope", 1, "ref-y"))
            .await
            .unwrap_err();
        assert!(matches!(err, StoreError::AccountNotFound { .. }));
    }

    #[tokio::test]
    async fn crossborder_enforces_funds_and_replays() {
        let store = MemStore::new();
        let req = CrossBorderTransferRequest {
            transfer_id: "cb-1".into(),
            merchant_id: "m-xb".into(),
            amount: 10_000,
            source_currency: "USD".into(),
            target_currency: "NGN".into(),
            exchange_rate: 1500.0,
            fee_amount: 250,
            rail: "cips".into(),
            reference: "cb-ref-1".into(),
        };

        // Unfunded escrow → rejected, no fabricated balance.
        let err = store.cross_border_transfer(req.clone()).await.unwrap_err();
        assert!(matches!(err, StoreError::InsufficientFunds { .. }));

        // Fund escrow via a real transfer from a funded suspense account.
        let source = store
            .create_account(CreateAccountRequest {
                merchant_id: "system".into(),
                account_type: AccountType::Suspense,
                currency: "USD".into(),
                ledger_code: None,
            })
            .await
            .unwrap();
        {
            let mut s = store.state.write().await;
            s.accounts.get_mut(&source.id).unwrap().credits_posted = 1_000_000;
        }
        store
            .create_transfer(CreateTransferRequest {
                debit_account_id: source.id,
                credit_account_id: "escrow-m-xb-usd".into(),
                amount: 20_000,
                currency: "USD".into(),
                rail: "test".into(),
                transfer_type: TransferType::Settlement,
                reference: "fund-xb".into(),
                merchant_id: "m-xb".into(),
            })
            .await
            .unwrap();

        let (payload, replayed) = store.cross_border_transfer(req.clone()).await.unwrap();
        assert!(!replayed);
        assert_eq!(payload["ledger_entries"], 2);
        assert_eq!(payload["target_amount"], 15_000_000);

        // Replay: identical payload, no extra ledger entries.
        let (payload2, replayed) = store.cross_border_transfer(req).await.unwrap();
        assert!(replayed);
        assert_eq!(payload, payload2);
        assert_eq!(store.list_transfers("", "", 100).await .1, 3); // funding + 2 legs

        let escrow = store.get_account("escrow-m-xb-usd").await.unwrap();
        assert_eq!(escrow.debits_posted, 10_250);
        assert_eq!(escrow.balance(), 20_000 - 10_250);
        let fee = store.get_account("fee-m-xb-usd").await.unwrap();
        assert_eq!(fee.credits_posted, 250);
    }

    #[tokio::test]
    async fn invalid_amounts_rejected() {
        let (store, debit, credit) = setup_funded().await;
        let err = store
            .create_transfer(xfer_req(&debit.id, &credit.id, 0, "ref-zero"))
            .await
            .unwrap_err();
        assert!(matches!(err, StoreError::InvalidRequest(_)));
        let err = store
            .create_transfer(xfer_req(&debit.id, &credit.id, -5, "ref-neg"))
            .await
            .unwrap_err();
        assert!(matches!(err, StoreError::InvalidRequest(_)));
    }
}
