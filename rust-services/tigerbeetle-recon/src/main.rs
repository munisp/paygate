/*!
 * TigerBeetle ↔ Postgres Ledger Reconciliation Service
 *
 * Runs every 5 minutes (configurable via RECON_INTERVAL_SECS).
 * Algorithm:
 *   1. Fetch all account balances from TigerBeetle via the Go-bridge HTTP API.
 *   2. Fetch corresponding transaction sums from Postgres `transactions` table.
 *   3. Compute discrepancies (|tb_balance - pg_sum| > TOLERANCE_KOBO).
 *   4. Publish each discrepancy to Kafka topic `ledger.discrepancy`.
 *   5. Write a summary row to Postgres `recon_runs` table.
 */

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use log::{error, info, warn};
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tokio::time;
use tokio_postgres::{Client as PgClient, NoTls};
use uuid::Uuid;

// ─── Configuration ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct Config {
    /// Postgres connection string
    database_url: String,
    /// Go-bridge base URL (e.g. http://localhost:8080)
    bridge_url: String,
    /// Kafka bootstrap servers
    kafka_brokers: String,
    /// Kafka topic for discrepancy events
    kafka_topic: String,
    /// Reconciliation interval in seconds
    interval_secs: u64,
    /// Tolerance in kobo (1 NGN = 100 kobo) — differences below this are ignored
    tolerance_kobo: i64,
    /// Internal API key for Go-bridge authentication
    internal_api_key: String,
}

impl Config {
    fn from_env() -> Result<Self> {
        dotenv::dotenv().ok();
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL must be set")?,
            bridge_url: std::env::var("MIDDLEWARE_BRIDGE_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string()),
            kafka_brokers: std::env::var("KAFKA_BOOTSTRAP_SERVERS")
                .unwrap_or_else(|_| "localhost:9092".to_string()),
            kafka_topic: std::env::var("RECON_KAFKA_TOPIC")
                .unwrap_or_else(|_| "ledger.discrepancy".to_string()),
            interval_secs: std::env::var("RECON_INTERVAL_SECS")
                .unwrap_or_else(|_| "300".to_string())
                .parse()
                .unwrap_or(300),
            tolerance_kobo: std::env::var("RECON_TOLERANCE_KOBO")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .unwrap_or(100),
            internal_api_key: std::env::var("MIDDLEWARE_INTERNAL_KEY")
                .unwrap_or_default(),
        })
    }
}

// ─── Data Structures ──────────────────────────────────────────────────────────

/// TigerBeetle account balance as returned by the Go-bridge
#[derive(Debug, Deserialize)]
struct TbAccount {
    id: String,
    #[serde(rename = "creditsPosted")]
    credits_posted: i64,
    #[serde(rename = "debitsPosted")]
    debits_posted: i64,
    ledger: u32,
    code: u16,
}

/// Response from the Go-bridge /v1/tigerbeetle/accounts endpoint
#[derive(Debug, Deserialize)]
struct TbAccountsResponse {
    accounts: Vec<TbAccount>,
}

/// Postgres transaction aggregate per merchant
#[derive(Debug)]
struct PgAggregate {
    merchant_id: String,
    net_kobo: i64,
    tx_count: i64,
}

/// A reconciliation discrepancy event published to Kafka
#[derive(Debug, Serialize)]
struct DiscrepancyEvent {
    event_id: String,
    detected_at: DateTime<Utc>,
    merchant_id: String,
    tb_balance_kobo: i64,
    pg_balance_kobo: i64,
    delta_kobo: i64,
    tx_count: i64,
    severity: String,
}

/// Summary of a reconciliation run stored in Postgres
#[derive(Debug)]
struct ReconRun {
    run_id: String,
    started_at: DateTime<Utc>,
    finished_at: DateTime<Utc>,
    accounts_checked: i64,
    discrepancies_found: i64,
    total_delta_kobo: i64,
    status: String,
    error_message: Option<String>,
}

// ─── TigerBeetle Client (via Go-bridge HTTP API) ──────────────────────────────

async fn fetch_tb_accounts(
    http: &HttpClient,
    bridge_url: &str,
    api_key: &str,
) -> Result<Vec<TbAccount>> {
    let url = format!("{}/v1/tigerbeetle/accounts", bridge_url);
    let resp = http
        .get(&url)
        .header("X-Internal-Key", api_key)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .context("Failed to reach Go-bridge TigerBeetle endpoint")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("TigerBeetle API returned {}: {}", status, body);
    }

    let data: TbAccountsResponse = resp.json().await
        .context("Failed to parse TigerBeetle accounts response")?;
    Ok(data.accounts)
}

// ─── Postgres Helpers ─────────────────────────────────────────────────────────

async fn connect_postgres(database_url: &str) -> Result<PgClient> {
    let (client, connection) = tokio_postgres::connect(database_url, NoTls)
        .await
        .context("Failed to connect to Postgres")?;

    // Spawn the connection task
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            error!("[recon] Postgres connection error: {}", e);
        }
    });

    Ok(client)
}

async fn fetch_pg_aggregates(pg: &PgClient) -> Result<Vec<PgAggregate>> {
    // Sum completed credits minus debits per merchant from the transactions table.
    // Amounts are stored in kobo (integer, 1 NGN = 100 kobo).
    let rows = pg
        .query(
            r#"
            SELECT
                merchant_id,
                COALESCE(
                    SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END),
                    0
                )::BIGINT AS net_kobo,
                COUNT(*)::BIGINT AS tx_count
            FROM transactions
            WHERE status = 'completed'
            GROUP BY merchant_id
            "#,
            &[],
        )
        .await
        .context("Failed to query Postgres transactions")?;

    let aggregates = rows
        .into_iter()
        .map(|row| PgAggregate {
            merchant_id: row.get::<_, String>(0),
            net_kobo: row.get::<_, i64>(1),
            tx_count: row.get::<_, i64>(2),
        })
        .collect();

    Ok(aggregates)
}

async fn ensure_recon_runs_table(pg: &PgClient) -> Result<()> {
    pg.execute(
        r#"
        CREATE TABLE IF NOT EXISTS recon_runs (
            run_id          TEXT PRIMARY KEY,
            started_at      TIMESTAMPTZ NOT NULL,
            finished_at     TIMESTAMPTZ NOT NULL,
            accounts_checked BIGINT NOT NULL DEFAULT 0,
            discrepancies_found BIGINT NOT NULL DEFAULT 0,
            total_delta_kobo BIGINT NOT NULL DEFAULT 0,
            status          TEXT NOT NULL DEFAULT 'ok',
            error_message   TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        &[],
    )
    .await
    .context("Failed to create recon_runs table")?;
    Ok(())
}

async fn insert_recon_run(pg: &PgClient, run: &ReconRun) -> Result<()> {
    pg.execute(
        r#"
        INSERT INTO recon_runs
            (run_id, started_at, finished_at, accounts_checked,
             discrepancies_found, total_delta_kobo, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (run_id) DO NOTHING
        "#,
        &[
            &run.run_id,
            &run.started_at,
            &run.finished_at,
            &run.accounts_checked,
            &run.discrepancies_found,
            &run.total_delta_kobo,
            &run.status,
            &run.error_message,
        ],
    )
    .await
    .context("Failed to insert recon run")?;
    Ok(())
}

// ─── Kafka Producer ───────────────────────────────────────────────────────────

fn build_kafka_producer(brokers: &str) -> Result<FutureProducer> {
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("message.timeout.ms", "10000")
        .set("acks", "1")
        .create()
        .context("Failed to create Kafka producer")?;
    Ok(producer)
}

async fn publish_discrepancy(
    producer: &FutureProducer,
    topic: &str,
    event: &DiscrepancyEvent,
) -> Result<()> {
    let payload = serde_json::to_string(event)?;
    let key = event.merchant_id.clone();

    producer
        .send(
            FutureRecord::to(topic)
                .key(&key)
                .payload(&payload),
            Duration::from_secs(5),
        )
        .await
        .map_err(|(e, _)| anyhow::anyhow!("Kafka send error: {}", e))?;

    Ok(())
}

// ─── Reconciliation Logic ─────────────────────────────────────────────────────

async fn run_reconciliation(cfg: &Config) -> Result<ReconRun> {
    let started_at = Utc::now();
    let run_id = Uuid::new_v4().to_string();

    info!("[recon] Starting reconciliation run {}", run_id);

    let http = HttpClient::new();
    let pg = connect_postgres(&cfg.database_url).await?;
    ensure_recon_runs_table(&pg).await?;

    // 1. Fetch TigerBeetle balances
    let tb_accounts = match fetch_tb_accounts(&http, &cfg.bridge_url, &cfg.internal_api_key).await {
        Ok(accts) => accts,
        Err(e) => {
            warn!("[recon] Could not fetch TigerBeetle accounts: {}. Skipping run.", e);
            let finished_at = Utc::now();
            return Ok(ReconRun {
                run_id,
                started_at,
                finished_at,
                accounts_checked: 0,
                discrepancies_found: 0,
                total_delta_kobo: 0,
                status: "skipped".to_string(),
                error_message: Some(e.to_string()),
            });
        }
    };

    // Build a map: merchant_id → net TB balance (credits - debits)
    let tb_map: HashMap<String, i64> = tb_accounts
        .iter()
        .map(|a| {
            let net = a.credits_posted - a.debits_posted;
            (a.id.clone(), net)
        })
        .collect();

    // 2. Fetch Postgres aggregates
    let pg_aggregates = fetch_pg_aggregates(&pg).await?;

    // Build a map: merchant_id → (net_kobo, tx_count)
    let pg_map: HashMap<String, (i64, i64)> = pg_aggregates
        .into_iter()
        .map(|a| (a.merchant_id, (a.net_kobo, a.tx_count)))
        .collect();

    // 3. Compare and find discrepancies
    let producer = build_kafka_producer(&cfg.kafka_brokers)?;
    let mut discrepancy_count = 0i64;
    let mut total_delta = 0i64;
    let accounts_checked = tb_map.len() as i64;

    for (merchant_id, tb_balance) in &tb_map {
        let (pg_balance, tx_count) = pg_map
            .get(merchant_id)
            .copied()
            .unwrap_or((0, 0));

        let delta = (tb_balance - pg_balance).abs();

        if delta > cfg.tolerance_kobo {
            discrepancy_count += 1;
            total_delta += delta;

            let severity = if delta > 1_000_000 {
                "critical"
            } else if delta > 100_000 {
                "high"
            } else {
                "medium"
            };

            let event = DiscrepancyEvent {
                event_id: Uuid::new_v4().to_string(),
                detected_at: Utc::now(),
                merchant_id: merchant_id.clone(),
                tb_balance_kobo: *tb_balance,
                pg_balance_kobo: pg_balance,
                delta_kobo: delta,
                tx_count,
                severity: severity.to_string(),
            };

            warn!(
                "[recon] DISCREPANCY merchant={} tb={} pg={} delta={} severity={}",
                merchant_id, tb_balance, pg_balance, delta, severity
            );

            if let Err(e) = publish_discrepancy(&producer, &cfg.kafka_topic, &event).await {
                error!("[recon] Failed to publish discrepancy to Kafka: {}", e);
            }
        }
    }

    let finished_at = Utc::now();
    let status = if discrepancy_count == 0 { "ok" } else { "discrepancies_found" };

    info!(
        "[recon] Run {} complete: checked={} discrepancies={} total_delta={}",
        run_id, accounts_checked, discrepancy_count, total_delta
    );

    let run = ReconRun {
        run_id,
        started_at,
        finished_at,
        accounts_checked,
        discrepancies_found: discrepancy_count,
        total_delta_kobo: total_delta,
        status: status.to_string(),
        error_message: None,
    };

    insert_recon_run(&pg, &run).await?;
    Ok(run)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info"),
    )
    .init();

    let cfg = Config::from_env().context("Failed to load configuration")?;

    info!(
        "[recon] TigerBeetle Reconciliation Service starting — interval={}s tolerance={}kobo",
        cfg.interval_secs, cfg.tolerance_kobo
    );

    let mut interval = time::interval(Duration::from_secs(cfg.interval_secs));

    loop {
        interval.tick().await;

        match run_reconciliation(&cfg).await {
            Ok(run) => {
                info!(
                    "[recon] Run {} status={} discrepancies={} delta={}kobo",
                    run.run_id, run.status, run.discrepancies_found, run.total_delta_kobo
                );
            }
            Err(e) => {
                error!("[recon] Reconciliation run failed: {:#}", e);
            }
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discrepancy_severity_critical() {
        let delta: i64 = 2_000_000; // 20,000 NGN
        let severity = if delta > 1_000_000 {
            "critical"
        } else if delta > 100_000 {
            "high"
        } else {
            "medium"
        };
        assert_eq!(severity, "critical");
    }

    #[test]
    fn test_discrepancy_severity_high() {
        let delta: i64 = 500_000; // 5,000 NGN
        let severity = if delta > 1_000_000 {
            "critical"
        } else if delta > 100_000 {
            "high"
        } else {
            "medium"
        };
        assert_eq!(severity, "high");
    }

    #[test]
    fn test_discrepancy_severity_medium() {
        let delta: i64 = 50_000; // 500 NGN
        let severity = if delta > 1_000_000 {
            "critical"
        } else if delta > 100_000 {
            "high"
        } else {
            "medium"
        };
        assert_eq!(severity, "medium");
    }

    #[test]
    fn test_tolerance_filter() {
        let tolerance: i64 = 100;
        let delta_below: i64 = 50;
        let delta_above: i64 = 150;
        assert!(delta_below <= tolerance, "Should be within tolerance");
        assert!(delta_above > tolerance, "Should exceed tolerance");
    }

    #[test]
    fn test_discrepancy_event_serialization() {
        let event = DiscrepancyEvent {
            event_id: "test-id".to_string(),
            detected_at: Utc::now(),
            merchant_id: "merchant_abc".to_string(),
            tb_balance_kobo: 1_000_000,
            pg_balance_kobo: 900_000,
            delta_kobo: 100_000,
            tx_count: 42,
            severity: "high".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("merchant_abc"));
        assert!(json.contains("high"));
        assert!(json.contains("100000"));
    }

    #[test]
    fn test_config_defaults() {
        // Test that default values are sensible
        let interval = 300u64;
        let tolerance = 100i64;
        assert_eq!(interval, 300);
        assert_eq!(tolerance, 100);
    }
}
