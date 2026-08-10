# TigerBeetle Reconciliation Service

A Rust microservice that periodically reconciles ledger balances between **TigerBeetle** (the double-entry ledger) and **Postgres** (the application database).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  tigerbeetle-recon  (Rust, runs every 5 min)                    │
│                                                                  │
│  1. GET /v1/tigerbeetle/accounts  ──► Go-bridge ──► TigerBeetle │
│  2. SELECT SUM(amount) FROM transactions ──► Postgres            │
│  3. Compare balances per merchant_id                             │
│  4. Publish DiscrepancyEvent ──► Kafka (ledger.discrepancy)      │
│  5. INSERT INTO recon_runs ──► Postgres                          │
└─────────────────────────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | required | Postgres connection string |
| `MIDDLEWARE_BRIDGE_URL` | `http://localhost:8080` | Go-bridge base URL |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Kafka brokers |
| `RECON_KAFKA_TOPIC` | `ledger.discrepancy` | Topic for discrepancy events |
| `RECON_INTERVAL_SECS` | `300` | Reconciliation interval (seconds) |
| `RECON_TOLERANCE_KOBO` | `100` | Minimum delta (kobo) to flag as discrepancy |
| `MIDDLEWARE_INTERNAL_KEY` | — | API key for Go-bridge authentication |

## Discrepancy Severity Levels

| Severity | Delta Threshold |
|---|---|
| `medium` | ≤ 1,000 NGN |
| `high` | 1,001 – 10,000 NGN |
| `critical` | > 10,000 NGN |

## Kafka Event Schema

```json
{
  "event_id": "uuid",
  "detected_at": "ISO-8601 UTC",
  "merchant_id": "string",
  "tb_balance_kobo": 1000000,
  "pg_balance_kobo": 900000,
  "delta_kobo": 100000,
  "tx_count": 42,
  "severity": "high"
}
```

## Postgres Schema

The service auto-creates the `recon_runs` table on first run:

```sql
CREATE TABLE recon_runs (
    run_id              TEXT PRIMARY KEY,
    started_at          TIMESTAMPTZ NOT NULL,
    finished_at         TIMESTAMPTZ NOT NULL,
    accounts_checked    BIGINT NOT NULL DEFAULT 0,
    discrepancies_found BIGINT NOT NULL DEFAULT 0,
    total_delta_kobo    BIGINT NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'ok',
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Running Locally

```bash
# Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost:5432/paygate"
export MIDDLEWARE_BRIDGE_URL="http://localhost:8080"
export KAFKA_BOOTSTRAP_SERVERS="localhost:9092"

# Build and run
cargo build --release
./target/release/tigerbeetle-recon
```

## Docker

```bash
docker build -t paygate/tigerbeetle-recon:latest .
docker run --env-file .env paygate/tigerbeetle-recon:latest
```

## Running Tests

```bash
cargo test
```
