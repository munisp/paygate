// Durable Postgres ledger store — the production backend.
//
// Guarantees:
//   - Durability: every account and transfer is committed to Postgres before
//     the API responds; a service restart loses nothing.
//   - Atomic double-entry: balance mutation + transfer record commit in ONE
//     SQL transaction. A failure anywhere rolls the whole posting back.
//   - Insufficient funds: debits use a guarded
//     `UPDATE ... WHERE credits_posted - debits_posted - debits_pending >= amount`
//     so the balance check and the mutation are a single atomic statement —
//     no TOCTOU race even under concurrent debits.
//   - Idempotency: `reference` carries a UNIQUE constraint. Replays (retried
//     webhooks, Temporal activity retries) return the original transfer
//     without double-posting. The check-then-insert race is closed with
//     INSERT ... ON CONFLICT DO NOTHING + rollback + re-read.
//
// Connection: single tokio-postgres connection guarded by a mutex. Writes are
// serialized — matching the previous "double-entry under one write lock"
// semantic and keeping transaction code simple and correct.

use crate::model::*;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_postgres::{Client, NoTls, Row};
use uuid::Uuid;

const MIGRATIONS: &str = r#"
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id              TEXT PRIMARY KEY,
    merchant_id     TEXT NOT NULL,
    account_type    TEXT NOT NULL,
    ledger_code     INTEGER NOT NULL,
    currency        TEXT NOT NULL,
    debits_posted   BIGINT NOT NULL DEFAULT 0,
    credits_posted  BIGINT NOT NULL DEFAULT 0,
    debits_pending  BIGINT NOT NULL DEFAULT 0,
    credits_pending BIGINT NOT NULL DEFAULT 0,
    flags           INTEGER NOT NULL DEFAULT 0,
    created_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_transfers (
    id                 TEXT PRIMARY KEY,
    reference          TEXT NOT NULL UNIQUE,
    debit_account_id   TEXT NOT NULL REFERENCES ledger_accounts(id),
    credit_account_id  TEXT NOT NULL REFERENCES ledger_accounts(id),
    amount             BIGINT NOT NULL CHECK (amount >= 0),
    ledger_code        INTEGER NOT NULL,
    currency           TEXT NOT NULL,
    rail               TEXT NOT NULL,
    transfer_type      TEXT NOT NULL,
    merchant_id        TEXT NOT NULL,
    flags              INTEGER NOT NULL DEFAULT 0,
    timestamp          BIGINT NOT NULL,
    settled_at         BIGINT,
    payload            JSONB
);

CREATE INDEX IF NOT EXISTS idx_ledger_transfers_merchant ON ledger_transfers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transfers_rail ON ledger_transfers(rail);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_merchant ON ledger_accounts(merchant_id);
"#;

fn enum_tag<T: Serialize>(v: &T) -> String {
    match serde_json::to_value(v) {
        Ok(serde_json::Value::String(s)) => s,
        _ => "UNKNOWN".to_string(),
    }
}

fn account_from_row(row: &Row) -> Account {
    let account_type: String = row.get("account_type");
    let ledger_code: i32 = row.get("ledger_code");
    let flags: i32 = row.get("flags");
    let created_at: i64 = row.get("created_at");
    Account {
        id: row.get("id"),
        merchant_id: row.get("merchant_id"),
        account_type: serde_json::from_value(serde_json::Value::String(account_type))
            .unwrap_or(AccountType::Merchant),
        ledger_code: ledger_code as u32,
        currency: row.get("currency"),
        debits_posted: row.get("debits_posted"),
        credits_posted: row.get("credits_posted"),
        debits_pending: row.get("debits_pending"),
        credits_pending: row.get("credits_pending"),
        flags: flags as u32,
        created_at: created_at as u64,
    }
}

fn transfer_from_row(row: &Row) -> Transfer {
    let transfer_type: String = row.get("transfer_type");
    let ledger_code: i32 = row.get("ledger_code");
    let flags: i32 = row.get("flags");
    let timestamp: i64 = row.get("timestamp");
    let settled_at: Option<i64> = row.get("settled_at");
    Transfer {
        id: row.get("id"),
        debit_account_id: row.get("debit_account_id"),
        credit_account_id: row.get("credit_account_id"),
        amount: row.get("amount"),
        ledger_code: ledger_code as u32,
        currency: row.get("currency"),
        rail: row.get("rail"),
        transfer_type: serde_json::from_value(serde_json::Value::String(transfer_type))
            .unwrap_or(TransferType::CrossBorderDebit),
        reference: row.get("reference"),
        merchant_id: row.get("merchant_id"),
        flags: flags as u32,
        timestamp: timestamp as u64,
        settled_at: settled_at.map(|v| v as u64),
    }
}

#[derive(Clone)]
pub struct PgStore {
    client: Arc<Mutex<Client>>,
}

impl PgStore {
    /// Connect, verify reachability, and run migrations. Fails loud: any error
    /// here must abort startup (the service refuses to serve a non-durable
    /// ledger in production).
    pub async fn connect(database_url: &str) -> Result<Self, StoreError> {
        let (client, connection) = tokio_postgres::connect(database_url, NoTls)
            .await
            .map_err(|e| StoreError::Backend(format!("postgres connect failed: {e}")))?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!(error = %e, "postgres connection terminated");
            }
        });

        client
            .batch_execute("SELECT 1")
            .await
            .map_err(|e| StoreError::Backend(format!("postgres health probe failed: {e}")))?;

        client
            .batch_execute(MIGRATIONS)
            .await
            .map_err(|e| StoreError::Backend(format!("ledger schema migration failed: {e}")))?;

        tracing::info!("ledger schema verified (ledger_accounts, ledger_transfers)");
        Ok(PgStore {
            client: Arc::new(Mutex::new(client)),
        })
    }

    pub async fn healthy(&self) -> bool {
        let client = self.client.lock().await;
        client.batch_execute("SELECT 1").await.is_ok()
    }

    pub async fn create_account(&self, req: CreateAccountRequest) -> Result<Account, StoreError> {
        let account = Account {
            id: Uuid::new_v4().to_string(),
            merchant_id: req.merchant_id,
            account_type: req.account_type,
            ledger_code: req
                .ledger_code
                .unwrap_or_else(|| currency_to_ledger_code(&req.currency)),
            currency: req.currency.to_uppercase(),
            debits_posted: 0,
            credits_posted: 0,
            debits_pending: 0,
            credits_pending: 0,
            flags: 0,
            created_at: now_nanos(),
        };

        let client = self.client.lock().await;
        client
            .execute(
                "INSERT INTO ledger_accounts
                 (id, merchant_id, account_type, ledger_code, currency,
                  debits_posted, credits_posted, debits_pending, credits_pending, flags, created_at)
                 VALUES ($1,$2,$3,$4,$5,0,0,0,0,0,$6)",
                &[
                    &account.id,
                    &account.merchant_id,
                    &enum_tag(&account.account_type),
                    &(account.ledger_code as i32),
                    &account.currency,
                    &(account.created_at as i64),
                ],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("insert account failed: {e}")))?;

        Ok(account)
    }

    pub async fn get_account(&self, account_id: &str) -> Result<Account, StoreError> {
        let client = self.client.lock().await;
        let row = client
            .query_opt("SELECT * FROM ledger_accounts WHERE id = $1", &[&account_id])
            .await
            .map_err(|e| StoreError::Backend(format!("account lookup failed: {e}")))?;
        row.as_ref().map(account_from_row).ok_or_else(|| {
            StoreError::AccountNotFound {
                account_id: account_id.to_string(),
                role: "account",
            }
        })
    }

    pub async fn create_transfer(
        &self,
        req: CreateTransferRequest,
    ) -> Result<(Transfer, bool), StoreError> {
        validate_transfer_request(&req)?;
        let mut client = self.client.lock().await;

        // Fast-path replay check (the unique constraint is the real guard).
        if let Some(row) = client
            .query_opt(
                "SELECT * FROM ledger_transfers WHERE reference = $1",
                &[&req.reference],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("transfer replay lookup failed: {e}")))?
        {
            return Ok((transfer_from_row(&row), true));
        }

        let tx = client
            .transaction()
            .await
            .map_err(|e| StoreError::Backend(format!("begin transaction failed: {e}")))?;

        // Lock both accounts in deterministic (id) order: verifies existence
        // and prevents deadlocks between concurrent opposite-direction posts.
        let ids = vec![req.debit_account_id.clone(), req.credit_account_id.clone()];
        let locked = tx
            .query(
                "SELECT * FROM ledger_accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE",
                &[&ids],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("account lock failed: {e}")))?;
        let accounts: Vec<Account> = locked.iter().map(account_from_row).collect();

        let debit_acct = accounts
            .iter()
            .find(|a| a.id == req.debit_account_id)
            .ok_or_else(|| StoreError::AccountNotFound {
                account_id: req.debit_account_id.clone(),
                role: "debit account",
            })?;
        if !accounts.iter().any(|a| a.id == req.credit_account_id) {
            return Err(StoreError::AccountNotFound {
                account_id: req.credit_account_id.clone(),
                role: "credit account",
            });
        }

        // Atomic guarded debit: balance predicate and mutation in one statement.
        let updated = tx
            .execute(
                "UPDATE ledger_accounts
                 SET debits_posted = debits_posted + $1
                 WHERE id = $2
                   AND credits_posted - debits_posted - debits_pending >= $1",
                &[&req.amount, &req.debit_account_id],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("debit posting failed: {e}")))?;
        if updated == 0 {
            return Err(StoreError::InsufficientFunds {
                account_id: req.debit_account_id.clone(),
                available: debit_acct.available(),
                requested: req.amount,
            });
        }

        tx.execute(
            "UPDATE ledger_accounts SET credits_posted = credits_posted + $1 WHERE id = $2",
            &[&req.amount, &req.credit_account_id],
        )
        .await
        .map_err(|e| StoreError::Backend(format!("credit posting failed: {e}")))?;

        let ts = now_nanos();
        let transfer_id = Uuid::new_v4().to_string();
        let inserted = tx
            .query_opt(
                "INSERT INTO ledger_transfers
                 (id, reference, debit_account_id, credit_account_id, amount, ledger_code,
                  currency, rail, transfer_type, merchant_id, flags, timestamp, settled_at, payload)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,NULL)
                 ON CONFLICT (reference) DO NOTHING
                 RETURNING id",
                &[
                    &transfer_id,
                    &req.reference,
                    &req.debit_account_id,
                    &req.credit_account_id,
                    &req.amount,
                    &(currency_to_ledger_code(&req.currency) as i32),
                    &req.currency.to_uppercase(),
                    &req.rail,
                    &enum_tag(&req.transfer_type),
                    &req.merchant_id,
                    &(ts as i64),
                    &(ts as i64),
                ],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("transfer insert failed: {e}")))?;

        if inserted.is_none() {
            // Lost the race against a concurrent writer with the same
            // reference: discard our balance mutation and replay the original.
            drop(tx); // rollback
            let row = client
                .query_one(
                    "SELECT * FROM ledger_transfers WHERE reference = $1",
                    &[&req.reference],
                )
                .await
                .map_err(|e| StoreError::Backend(format!("replay re-read failed: {e}")))?;
            return Ok((transfer_from_row(&row), true));
        }

        tx.commit()
            .await
            .map_err(|e| StoreError::Backend(format!("commit failed: {e}")))?;

        Ok((
            Transfer {
                id: transfer_id,
                debit_account_id: req.debit_account_id,
                credit_account_id: req.credit_account_id,
                amount: req.amount,
                ledger_code: currency_to_ledger_code(&req.currency),
                currency: req.currency.to_uppercase(),
                rail: req.rail,
                transfer_type: req.transfer_type,
                reference: req.reference,
                merchant_id: req.merchant_id,
                flags: 0,
                timestamp: ts,
                settled_at: Some(ts),
            },
            false,
        ))
    }

    pub async fn cross_border_transfer(
        &self,
        req: CrossBorderTransferRequest,
    ) -> Result<(serde_json::Value, bool), StoreError> {
        let plan = plan_cross_border(&req)?;
        let reference = plan.reference.clone();
        let mut client = self.client.lock().await;

        // Replay: the t1 row stores the exact response payload.
        if let Some(row) = client
            .query_opt(
                "SELECT payload FROM ledger_transfers WHERE reference = $1",
                &[&reference],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("crossborder replay lookup failed: {e}")))?
        {
            let payload: Option<serde_json::Value> = row.get("payload");
            if let Some(payload) = payload {
                return Ok((payload, true));
            }
        }

        let tx = client
            .transaction()
            .await
            .map_err(|e| StoreError::Backend(format!("begin transaction failed: {e}")))?;

        // Auto-create system accounts with ZERO balance — no fabricated funds.
        let ts = now_nanos();
        for (id, acct_type, currency) in [
            (&plan.escrow_id, enum_tag(&plan.escrow_type), &plan.source_currency),
            (
                &plan.settlement_id,
                enum_tag(&AccountType::Settlement),
                &plan.settlement_currency,
            ),
            (&plan.fee_id, enum_tag(&AccountType::Fee), &plan.source_currency),
        ] {
            tx.execute(
                "INSERT INTO ledger_accounts
                 (id, merchant_id, account_type, ledger_code, currency,
                  debits_posted, credits_posted, debits_pending, credits_pending, flags, created_at)
                 VALUES ($1,$2,$3,$4,$5,0,0,0,0,0,$6)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    id,
                    &req.merchant_id,
                    &acct_type,
                    &(currency_to_ledger_code(currency) as i32),
                    &currency.to_uppercase(),
                    &(ts as i64),
                ],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("system account upsert failed: {e}")))?;
        }

        // Lock escrow and enforce funds atomically.
        let escrow_row = tx
            .query_one(
                "SELECT * FROM ledger_accounts WHERE id = $1 FOR UPDATE",
                &[&plan.escrow_id],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("escrow lock failed: {e}")))?;
        let escrow = account_from_row(&escrow_row);

        let updated = tx
            .execute(
                "UPDATE ledger_accounts
                 SET debits_posted = debits_posted + $1
                 WHERE id = $2
                   AND credits_posted - debits_posted - debits_pending >= $1",
                &[&plan.total_debit, &plan.escrow_id],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("escrow debit failed: {e}")))?;
        if updated == 0 {
            return Err(StoreError::InsufficientFunds {
                account_id: plan.escrow_id.clone(),
                available: escrow.available(),
                requested: plan.total_debit,
            });
        }

        tx.execute(
            "UPDATE ledger_accounts SET credits_posted = credits_posted + $1 WHERE id = $2",
            &[&plan.target_amount, &plan.settlement_id],
        )
        .await
        .map_err(|e| StoreError::Backend(format!("settlement credit failed: {e}")))?;
        tx.execute(
            "UPDATE ledger_accounts SET credits_posted = credits_posted + $1 WHERE id = $2",
            &[&req.fee_amount, &plan.fee_id],
        )
        .await
        .map_err(|e| StoreError::Backend(format!("fee credit failed: {e}")))?;

        let payload = serde_json::json!({
            "success": true,
            "transfer_id": req.transfer_id.clone(),
            "rail": req.rail.clone(),
            "source_amount": req.amount,
            "source_currency": plan.source_currency.clone(),
            "target_amount": plan.target_amount,
            "target_currency": plan.settlement_currency.clone(),
            "fee_amount": req.fee_amount,
            "exchange_rate": req.exchange_rate,
            "ledger_entries": 2,
            "escrow_account": plan.escrow_id.clone(),
            "settlement_account": plan.settlement_id.clone(),
            "settled_at": ts
        });

        let inserted = tx
            .query_opt(
                "INSERT INTO ledger_transfers
                 (id, reference, debit_account_id, credit_account_id, amount, ledger_code,
                  currency, rail, transfer_type, merchant_id, flags, timestamp, settled_at, payload)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13)
                 ON CONFLICT (reference) DO NOTHING
                 RETURNING id",
                &[
                    &plan.t1_id,
                    &reference,
                    &plan.escrow_id,
                    &plan.settlement_id,
                    &req.amount,
                    &(currency_to_ledger_code(&plan.source_currency) as i32),
                    &plan.source_currency,
                    &req.rail,
                    &enum_tag(&TransferType::CrossBorderDebit),
                    &req.merchant_id,
                    &(ts as i64),
                    &(ts as i64),
                    &payload,
                ],
            )
            .await
            .map_err(|e| StoreError::Backend(format!("crossborder t1 insert failed: {e}")))?;

        if inserted.is_none() {
            drop(tx); // rollback balance mutation, replay the original
            let row = client
                .query_one(
                    "SELECT payload FROM ledger_transfers WHERE reference = $1",
                    &[&reference],
                )
                .await
                .map_err(|e| StoreError::Backend(format!("replay re-read failed: {e}")))?;
            let payload: Option<serde_json::Value> = row.get("payload");
            return Ok((
                payload.unwrap_or_else(|| serde_json::json!({"success": true, "replayed": true})),
                true,
            ));
        }

        tx.execute(
            "INSERT INTO ledger_transfers
             (id, reference, debit_account_id, credit_account_id, amount, ledger_code,
              currency, rail, transfer_type, merchant_id, flags, timestamp, settled_at, payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,NULL)",
            &[
                &plan.t2_id,
                &format!("fee-{}", reference),
                &plan.escrow_id,
                &plan.fee_id,
                &req.fee_amount,
                &(currency_to_ledger_code(&plan.source_currency) as i32),
                &plan.source_currency,
                &req.rail,
                &enum_tag(&TransferType::FeeDebit),
                &req.merchant_id,
                &(ts as i64),
                &(ts as i64),
            ],
        )
        .await
        .map_err(|e| StoreError::Backend(format!("crossborder t2 insert failed: {e}")))?;

        tx.commit()
            .await
            .map_err(|e| StoreError::Backend(format!("commit failed: {e}")))?;

        Ok((payload, false))
    }

    pub async fn list_transfers(
        &self,
        merchant_id: &str,
        rail: &str,
        limit: usize,
    ) -> (Vec<Transfer>, usize) {
        let client = self.client.lock().await;
        let total: i64 = client
            .query_one("SELECT COUNT(*) FROM ledger_transfers", &[])
            .await
            .map(|r| r.get(0))
            .unwrap_or(0);

        let rows = client
            .query(
                "SELECT * FROM ledger_transfers
                 WHERE ($1 = '' OR merchant_id = $1)
                   AND ($2 = '' OR rail = $2)
                 ORDER BY timestamp DESC
                 LIMIT $3",
                &[&merchant_id, &rail, &(limit as i64)],
            )
            .await
            .unwrap_or_default();

        (
            rows.iter().map(transfer_from_row).collect(),
            total as usize,
        )
    }

    pub async fn list_accounts(&self, merchant_id: &str) -> Vec<Account> {
        let client = self.client.lock().await;
        client
            .query(
                "SELECT * FROM ledger_accounts WHERE ($1 = '' OR merchant_id = $1) ORDER BY created_at",
                &[&merchant_id],
            )
            .await
            .unwrap_or_default()
            .iter()
            .map(account_from_row)
            .collect()
    }

    pub async fn stats(&self) -> LedgerStats {
        let client = self.client.lock().await;

        let total_accounts: i64 = client
            .query_one("SELECT COUNT(*) FROM ledger_accounts", &[])
            .await
            .map(|r| r.get(0))
            .unwrap_or(0);
        let total_transfers: i64 = client
            .query_one("SELECT COUNT(*) FROM ledger_transfers", &[])
            .await
            .map(|r| r.get(0))
            .unwrap_or(0);

        let mut volume_by_rail: HashMap<String, i64> = HashMap::new();
        if let Ok(rows) = client
            .query(
                "SELECT rail, COALESCE(SUM(amount),0) FROM ledger_transfers GROUP BY rail",
                &[],
            )
            .await
        {
            for row in rows {
                volume_by_rail.insert(row.get(0), row.get(1));
            }
        }

        let total_fees: i64 = client
            .query_one(
                "SELECT COALESCE(SUM(amount),0) FROM ledger_transfers WHERE transfer_type = 'FEE_DEBIT'",
                &[],
            )
            .await
            .map(|r| r.get(0))
            .unwrap_or(0);

        let active_currencies: Vec<String> = client
            .query("SELECT DISTINCT currency FROM ledger_transfers ORDER BY currency", &[])
            .await
            .unwrap_or_default()
            .iter()
            .map(|r| r.get(0))
            .collect();

        LedgerStats {
            total_accounts: total_accounts as usize,
            total_transfers: total_transfers as usize,
            total_volume_by_rail: volume_by_rail,
            total_fees_collected: total_fees,
            active_currencies,
        }
    }

    pub async fn seed_demo_accounts(&self) -> Result<(), StoreError> {
        let client = self.client.lock().await;
        let demo_merchant = "merchant_demo_001";
        let ts = now_nanos() as i64;

        for (id, acct_type, currency, balance) in [
            ("escrow-demo-usd", "ESCROW", "USD", 10_000_000_i64),
            ("escrow-demo-cny", "CROSS_BORDER_CIPS", "CNY", 50_000_000_i64),
            ("escrow-demo-inr", "CROSS_BORDER_UPI", "INR", 500_000_000_i64),
            ("escrow-demo-brl", "CROSS_BORDER_PIX", "BRL", 20_000_000_i64),
            ("settlement-demo-ngn", "SETTLEMENT", "NGN", 0_i64),
            ("fee-demo-usd", "FEE", "USD", 0_i64),
        ] {
            client
                .execute(
                    "INSERT INTO ledger_accounts
                     (id, merchant_id, account_type, ledger_code, currency,
                      debits_posted, credits_posted, debits_pending, credits_pending, flags, created_at)
                     VALUES ($1,$2,$3,$4,$5,0,$6,0,0,0,$7)
                     ON CONFLICT (id) DO NOTHING",
                    &[
                        &id,
                        &demo_merchant,
                        &acct_type,
                        &(currency_to_ledger_code(currency) as i32),
                        &currency,
                        &balance,
                        &ts,
                    ],
                )
                .await
                .map_err(|e| StoreError::Backend(format!("demo seed failed: {e}")))?;
        }
        Ok(())
    }
}

// ─── Durable-backend integration tests ────────────────────────────────────────
//
// These run only when LEDGER_TEST_DATABASE_URL (or DATABASE_URL) points at a
// scratch database, e.g.:
//   LEDGER_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/ledger_test cargo test
// They are skipped otherwise so `cargo test` stays hermetic.

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_store() -> Option<PgStore> {
        let url = std::env::var("LEDGER_TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .ok()?;
        PgStore::connect(&url).await.ok()
    }

    fn tag() -> String {
        Uuid::new_v4().to_string()[..8].to_string()
    }

    #[tokio::test]
    async fn pg_debit_credit_insufficient_and_replay() {
        let Some(store) = test_store().await else {
            eprintln!("skipping: LEDGER_TEST_DATABASE_URL not set");
            return;
        };
        let t = tag();
        let merchant = format!("m-test-{t}");

        let debit = store
            .create_account(CreateAccountRequest {
                merchant_id: merchant.clone(),
                account_type: AccountType::Merchant,
                currency: "USD".into(),
                ledger_code: None,
            })
            .await
            .unwrap();
        let credit = store
            .create_account(CreateAccountRequest {
                merchant_id: merchant.clone(),
                account_type: AccountType::Settlement,
                currency: "USD".into(),
                ledger_code: None,
            })
            .await
            .unwrap();

        // Unfunded debit account must reject.
        let err = store
            .create_transfer(CreateTransferRequest {
                debit_account_id: debit.id.clone(),
                credit_account_id: credit.id.clone(),
                amount: 1,
                currency: "USD".into(),
                rail: "test".into(),
                transfer_type: TransferType::CrossBorderDebit,
                reference: format!("pg-{t}-over"),
                merchant_id: merchant.clone(),
            })
            .await
            .unwrap_err();
        assert!(matches!(err, StoreError::InsufficientFunds { .. }));

        // Fund from a suspense account seeded directly.
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
            let client = store.client.lock().await;
            client
                .execute(
                    "UPDATE ledger_accounts SET credits_posted = 100000 WHERE id = $1",
                    &[&source.id],
                )
                .await
                .unwrap();
        }
        store
            .create_transfer(CreateTransferRequest {
                debit_account_id: source.id.clone(),
                credit_account_id: debit.id.clone(),
                amount: 5_000,
                currency: "USD".into(),
                rail: "test".into(),
                transfer_type: TransferType::Settlement,
                reference: format!("pg-{t}-fund"),
                merchant_id: merchant.clone(),
            })
            .await
            .unwrap();

        // Debit/credit.
        let (first, replayed) = store
            .create_transfer(CreateTransferRequest {
                debit_account_id: debit.id.clone(),
                credit_account_id: credit.id.clone(),
                amount: 2_000,
                currency: "USD".into(),
                rail: "test".into(),
                transfer_type: TransferType::CrossBorderDebit,
                reference: format!("pg-{t}-xfer"),
                merchant_id: merchant.clone(),
            })
            .await
            .unwrap();
        assert!(!replayed);

        // Replay returns original without double-posting.
        let (second, replayed) = store
            .create_transfer(CreateTransferRequest {
                debit_account_id: debit.id.clone(),
                credit_account_id: credit.id.clone(),
                amount: 2_000,
                currency: "USD".into(),
                rail: "test".into(),
                transfer_type: TransferType::CrossBorderDebit,
                reference: format!("pg-{t}-xfer"),
                merchant_id: merchant.clone(),
            })
            .await
            .unwrap();
        assert!(replayed);
        assert_eq!(first.id, second.id);

        let d = store.get_account(&debit.id).await.unwrap();
        assert_eq!(d.debits_posted, 2_000);
        assert_eq!(d.credits_posted, 5_000);
    }

    #[tokio::test]
    async fn pg_restart_durability() {
        let Some(store) = test_store().await else {
            eprintln!("skipping: LEDGER_TEST_DATABASE_URL not set");
            return;
        };
        let t = tag();
        let merchant = format!("m-restart-{t}");

        let account = store
            .create_account(CreateAccountRequest {
                merchant_id: merchant.clone(),
                account_type: AccountType::Merchant,
                currency: "EUR".into(),
                ledger_code: None,
            })
            .await
            .unwrap();

        // Simulate a restart: drop the store/connection entirely and build a
        // fresh one from the same DATABASE_URL.
        let account_id = account.id.clone();
        drop(store);
        let Some(store2) = test_store().await else {
            panic!("reconnect failed");
        };

        let fetched = store2.get_account(&account_id).await.unwrap();
        assert_eq!(fetched.merchant_id, merchant);
        assert_eq!(fetched.currency, "EUR");
        assert_eq!(fetched.balance(), 0);
    }
}
