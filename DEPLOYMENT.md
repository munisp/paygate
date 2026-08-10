# PayGate Merchant Portal — Production Deployment Guide

## Architecture Overview

The PayGate platform consists of the following tiers:

| Tier | Components |
|------|-----------|
| **Portal** | React 19 + Tailwind 4 + tRPC 11 frontend/backend |
| **Go Bridge** | High-performance middleware (Kafka, TigerBeetle, Redis, Permify) |
| **Python Services** | 12+ microservices (fraud scoring, settlement, analytics, lakehouse) |
| **Rust Services** | Credit scoring with Apache DataFusion |
| **Lakehouse Stack** | MinIO + Apache Spark 3.5 + Trino + DuckDB |
| **Geospatial** | Apache Sedona + H3 (fraud heatmap service) |
| **Infrastructure** | Kafka, Redis, TigerBeetle, Temporal, Keycloak, Permify |

---

## Quick Start (Docker Compose)

```bash
# 1. Start all services (secrets are injected via platform env)
docker compose -f infra/docker-compose.prod.yml up -d

# 2. Wait for MinIO to be ready (minio-init runs automatically)
docker compose -f infra/docker-compose.prod.yml logs minio-init

# 3. Push database schema
pnpm db:push

# 4. Access portal
open https://portal.paygate.ng
```

---

## Kubernetes Deployment

```bash
# 1. Create namespace
kubectl apply -f infra/k8s/base/namespace.yaml

# 2. Create secrets (copy template and fill in values)
cp infra/k8s/base/secrets-template.yaml infra/k8s/base/secrets.yaml
# Edit secrets.yaml with real values (never commit this file)
kubectl apply -f infra/k8s/base/secrets.yaml

# 3. Apply all resources via kustomize
kubectl apply -k infra/k8s/base/

# 4. Verify all pods are running
kubectl get pods -n paygate

# 5. Run MinIO init job
kubectl wait --for=condition=complete job/paygate-minio-init -n paygate --timeout=120s
```

---

## Service Ports Reference

| Service | Port | Protocol |
|---------|------|----------|
| Portal | 3000 | HTTP |
| Go Bridge | 8080 | HTTP |
| Fraud Scoring | 9010 | HTTP |
| Settlement Forecast | 9011 | HTTP |
| Carbon Oracle | 9012 | HTTP |
| Insurance Pricing | 9013 | HTTP |
| Tax Engine | 9014 | HTTP |
| Cohort Analytics | 9015 | HTTP |
| ISO 20022 Parser | 9016 | HTTP |
| USSD Gateway | 9020 | HTTP |
| Sync Relay | 9030 | HTTP |
| Fraud Heatmap (Sedona) | 8120 | HTTP |
| Lakehouse V2 (DuckDB) | 8125 | HTTP |
| Credit Scoring (DataFusion) | 8200 | HTTP |
| MinIO S3 API | 9000 | HTTP |
| MinIO Console | 9001 | HTTP |
| Spark Master | 7077 | Spark |
| Spark UI | 8081 | HTTP |
| Trino | 8082 | HTTP |
| Kafka | 9092 | Kafka |
| Redis | 6379 | Redis |
| TigerBeetle | 3901 | TigerBeetle |
| Temporal | 7233 | gRPC |
| Keycloak | 8090 | HTTP |
| Permify | 3476 | HTTP |

---

## Lakehouse Stack Details

### MinIO (S3-compatible Object Storage)
- Buckets auto-created on first deploy: `paygate-lakehouse`, `paygate-exports`, `paygate-audit`
- S3 API: `http://paygate-minio:9000`
- Console: `http://paygate-minio:9001`
- Default credentials: set via `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` secrets

### Apache Spark 3.5 + Delta Lake
- Master: `spark://paygate-spark-master:7077`
- UI: `http://paygate-spark-master:8080`
- Delta Lake tables stored in `s3://paygate-lakehouse/delta/`
- Compaction job runs daily at 02:00 UTC via CronJob `paygate-spark-compaction`

### Trino (Distributed SQL)
- Endpoint: `http://paygate-trino:8080`
- Catalogs: `lakehouse` (Delta Lake via MinIO), `tpch` (benchmark)
- Query example: `SELECT * FROM lakehouse.default.audit_events LIMIT 100`

### DuckDB (Lakehouse V2 Service)
- REST API: `http://paygate-lakehouse-v2:8125`
- Endpoints: `GET /datasets`, `POST /query`, `POST /export`, `GET /saved-queries`
- Reads Delta Lake Parquet files directly from MinIO via `MINIO_ENDPOINT`

### Apache Sedona (Fraud Heatmap)
- REST API: `http://paygate-fraud-heatmap:8120`
- Endpoints: `POST /heatmap`, `GET /geo`, `GET /clusters`, `GET /risk-zones`
- H3 resolution: 7 (default, configurable via `H3_RESOLUTION` env var)
- Falls back gracefully to pure-Python H3 clustering if Sedona JVM is unavailable

### Apache DataFusion (Credit Scoring)
- REST API: `http://paygate-credit-scoring:8200`
- Endpoints: `POST /score`, `GET /score/merchant/:id`, `POST /analytics/query`, `GET /health`
- Reads merchant feature Parquet files from MinIO via `object_store` crate

---

## Environment Variables

All required environment variables are documented in:
- `infra/k8s/base/configmap.yaml` — non-secret configuration with production defaults
- `infra/k8s/base/secrets-template.yaml` — secret values template (fill in before deploy)
- `server/_core/env.ts` — TypeScript type definitions and default values

Key variables added for lakehouse stack:
```
LAKEHOUSE_V2_URL=http://paygate-lakehouse-v2:8125
FRAUD_HEATMAP_URL=http://paygate-fraud-heatmap:8120
CREDIT_SCORING_URL=http://paygate-credit-scoring:8200
SPARK_MASTER_URL=spark://paygate-spark-master:7077
TRINO_URL=http://paygate-trino:8080
MINIO_ENDPOINT=http://paygate-minio:9000
MINIO_BUCKET=paygate-lakehouse
MINIO_EXPORTS_BUCKET=paygate-exports
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=<set in secrets>
SEDONA_ENABLED=true
H3_RESOLUTION=7
DATAFUSION_ENABLED=true
```

---

## Monitoring

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Alert rules: `infra/prometheus/alert-rules.yaml`
- APISIX routes: `infra/apisix/routes.yaml`

Alert groups covering:
- `paygate.core` — portal, go-bridge, database
- `paygate.python` — all Python microservices
- `paygate.lakehouse` — MinIO, Spark, Trino, DuckDB, DataFusion, Sedona

---

## Database Schema

Run migrations:
```bash
pnpm db:push
```

Schema location: `drizzle/schema.ts`

---

## Testing

```bash
# TypeScript unit tests
pnpm test

# Go bridge
cd go-bridge && go test ./...

# Rust credit scoring
cd rust-services/credit-scoring && cargo test
```

---

## Production Checklist

- [ ] All secrets in `infra/k8s/base/secrets.yaml` filled with real values
- [ ] MinIO password changed from default `minioadmin123`
- [ ] Stripe keys switched from test (`sk_test_`) to live (`sk_live_`) after KYC
- [ ] Keycloak realm configured with production realm name
- [ ] NIBSS institution code set to real value
- [ ] TigerBeetle cluster addresses updated to real nodes
- [ ] Kafka bootstrap servers updated to production cluster
- [ ] SMTP credentials configured for transactional email
- [ ] VAPID keys generated for push notifications
- [ ] Permify API key set
- [ ] YouVerify API key set for KYC
- [ ] Termii API key set for SMS OTP
- [ ] VTPass credentials set for bill payments
- [ ] `ALLOWED_ORIGINS` updated with production domains
- [ ] `MERCHANT_PORTAL_URL` and `PAYMENT_LINK_BASE_URL` updated
- [ ] TLS/SSL certificates configured in ingress
- [ ] Prometheus alerting rules reviewed and notification channels configured
- [ ] Backup strategy for MinIO, PostgreSQL, and TigerBeetle configured
