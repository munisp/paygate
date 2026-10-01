//! Durable Postgres store for actor behavioural baselines.
//!
//! The DashMap in `BehaviouralEngine` remains the L1 (hot) cache; this store is
//! the durable write-through layer:
//!   - `/baseline/update` → update L1, then UPSERT the row (write-through).
//!   - `/score` L1 miss   → lazy-load the row from Postgres into L1.
//!
//! Follows the tigerbeetle-ledger `pg.rs` pattern: a small fixed-size pool of
//! tokio-postgres connections (one `Mutex<Client>` per connection), selected
//! round-robin. deadpool-postgres/sqlx are NOT available offline, so the pool
//! is implemented in-repo over the tokio-postgres dep.

use crate::ActorBaseline;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_postgres::{Client, NoTls};

/// Schema (mirrors drizzle/0110_actor_baselines.sql). Kept as a defensive
/// CREATE IF NOT EXISTS so a fresh dev environment self-heals; production
/// applies the drizzle migration.
const MIGRATION: &str = r#"
CREATE TABLE IF NOT EXISTS actor_baselines (
    actor_id        TEXT NOT NULL,
    action          TEXT NOT NULL,
    ema             DOUBLE PRECISION NOT NULL DEFAULT 0,
    emv             DOUBLE PRECISION NOT NULL DEFAULT 1,
    count           BIGINT NOT NULL DEFAULT 0,
    known_devices   JSONB NOT NULL DEFAULT '[]'::jsonb,
    known_countries JSONB NOT NULL DEFAULT '[]'::jsonb,
    hour_counts     JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_id, action)
);
"#;

/// default_pool_size is used when PG_POOL_SIZE is unset/invalid.
const DEFAULT_POOL_SIZE: usize = 4;

#[derive(Clone)]
pub struct PgBaselineStore {
    pool: Arc<Vec<Mutex<Client>>>,
    next: Arc<AtomicUsize>,
}

impl PgBaselineStore {
    /// Borrow the next pool connection (round-robin).
    fn conn(&self) -> &Mutex<Client> {
        let i = self.next.fetch_add(1, Ordering::Relaxed) % self.pool.len();
        &self.pool[i]
    }

    /// Connect, verify reachability, and ensure the schema exists.
    pub async fn connect(database_url: &str) -> Result<Self, tokio_postgres::Error> {
        let pool_size = std::env::var("PG_POOL_SIZE")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|n| *n > 0)
            .unwrap_or(DEFAULT_POOL_SIZE)
            .min(8);

        let mut pool = Vec::with_capacity(pool_size);
        for i in 0..pool_size {
            let (client, connection) = tokio_postgres::connect(database_url, NoTls).await?;
            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    tracing::error!(error = %e, conn = i, "postgres connection terminated");
                }
            });
            client.batch_execute("SELECT 1").await?;
            pool.push(Mutex::new(client));
        }

        pool[0].lock().await.batch_execute(MIGRATION).await?;
        tracing::info!(pool_size, "actor_baselines schema verified");
        Ok(Self {
            pool: Arc::new(pool),
            next: Arc::new(AtomicUsize::new(0)),
        })
    }

    /// Write-through upsert of a baseline row.
    pub async fn persist(
        &self,
        actor_id: &str,
        action: &str,
        b: &ActorBaseline,
    ) -> Result<(), tokio_postgres::Error> {
        let known_devices = serde_json::to_value(&b.known_devices)
            .unwrap_or_else(|_| serde_json::json!([]));
        let known_countries = serde_json::to_value(&b.known_countries)
            .unwrap_or_else(|_| serde_json::json!([]));
        let hour_counts = serde_json::to_value(b.hour_counts.to_vec())
            .unwrap_or_else(|_| serde_json::json!([]));

        self.conn()
            .lock()
            .await
            .execute(
                "INSERT INTO actor_baselines \
                 (actor_id, action, ema, emv, count, known_devices, known_countries, hour_counts, updated_at) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) \
                 ON CONFLICT (actor_id, action) DO UPDATE SET \
                   ema = EXCLUDED.ema, emv = EXCLUDED.emv, count = EXCLUDED.count, \
                   known_devices = EXCLUDED.known_devices, \
                   known_countries = EXCLUDED.known_countries, \
                   hour_counts = EXCLUDED.hour_counts, \
                   updated_at = now()",
                &[
                    &actor_id,
                    &action,
                    &b.ema,
                    &b.emv,
                    &(b.count as i64),
                    &known_devices,
                    &known_countries,
                    &hour_counts,
                ],
            )
            .await?;
        Ok(())
    }

    /// Lazy-load a baseline row. Returns None when the actor+action has no
    /// persisted baseline.
    pub async fn load(
        &self,
        actor_id: &str,
        action: &str,
    ) -> Result<Option<ActorBaseline>, tokio_postgres::Error> {
        let row = self
            .conn()
            .lock()
            .await
            .query_opt(
                "SELECT ema, emv, count, known_devices, known_countries, hour_counts \
                 FROM actor_baselines WHERE actor_id = $1 AND action = $2",
                &[&actor_id, &action],
            )
            .await?;

        let Some(row) = row else { return Ok(None) };

        let ema: f64 = row.get("ema");
        let emv: f64 = row.get("emv");
        let count: i64 = row.get("count");
        let known_devices: serde_json::Value = row.get("known_devices");
        let known_countries: serde_json::Value = row.get("known_countries");
        let hour_counts_json: serde_json::Value = row.get("hour_counts");

        let mut hour_counts = [0u32; 24];
        if let Some(arr) = hour_counts_json.as_array() {
            for (i, v) in arr.iter().take(24).enumerate() {
                hour_counts[i] = v.as_u64().unwrap_or(0) as u32;
            }
        }

        Ok(Some(ActorBaseline {
            ema,
            emv,
            count: count.max(0) as u64,
            alpha: 0.1,
            known_devices: serde_json::from_value(known_devices).unwrap_or_default(),
            known_countries: serde_json::from_value(known_countries).unwrap_or_default(),
            hour_counts,
            // recent_timestamps are intentionally not persisted — velocity
            // windows rebuild from live traffic after a restart.
            recent_timestamps: Default::default(),
        }))
    }
}
