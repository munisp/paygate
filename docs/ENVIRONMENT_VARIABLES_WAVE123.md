# Wave 123 — Environment Variables Reference

This document lists all new environment variables introduced in Wave 123.

Wave 123 adds three new feature namespaces to the PayGate Merchant Portal:
- **AI Model Admin** — MLflow model registry, GNN training jobs, AI audit trail
- **Menu Management** — Restaurant/store menu categories and items with CDN invalidation
- **Portal Health Dashboard** — Go-live checklist, uptime stats, external health checks

---

## Wave 123 New Services

### MLflow Model Registry (port 5000)

| Variable | Default | Required | Description |
|---|---|---|---|
| `MLFLOW_TRACKING_URI` | `http://mlflow:5000` | No | MLflow tracking server URL for model versioning |
| `MLFLOW_S3_ENDPOINT_URL` | `http://minio:9000` | No | S3-compatible endpoint for artifact storage |
| `MLFLOW_EXPERIMENT_NAME` | `paygate-fraud-detection` | No | Default MLflow experiment name |
| `MLFLOW_REGISTRY_URI` | same as `MLFLOW_TRACKING_URI` | No | Model registry URI (defaults to tracking URI) |
| `MLFLOW_ARTIFACT_ROOT` | `s3://paygate-models/mlflow` | No | Root path for MLflow artifacts in S3 |

### MinIO Object Storage (ports 9000/9001)

| Variable | Default | Required | Description |
|---|---|---|---|
| `MINIO_ROOT_USER` | `paygate_minio` | **Yes (prod)** | MinIO root access key |
| `MINIO_ROOT_PASSWORD` | — | **Yes (prod)** | MinIO root secret key (min 8 chars) |
| `MINIO_ENDPOINT` | `http://minio:9000` | No | MinIO endpoint for S3 SDK calls |
| `MINIO_MODELS_BUCKET` | `paygate-models` | No | Bucket for ML model artifacts |
| `MINIO_DATASETS_BUCKET` | `paygate-datasets` | No | Bucket for training datasets |
| `MINIO_MENU_ASSETS_BUCKET` | `paygate-menu-assets` | No | Bucket for menu item images |

### Feast Feature Store (port 6566)

| Variable | Default | Required | Description |
|---|---|---|---|
| `FEAST_ENDPOINT` | `http://feast-online:6566` | No | Feast online feature server URL |
| `FEAST_FEATURE_SERVICE` | `fraud_detection_features` | No | Feature service name for GNN inference |
| `FEAST_ENTITY_KEY` | `transaction_id` | No | Primary entity key for feature lookup |
| `FEAST_TIMEOUT_MS` | `50` | No | Feature fetch timeout in milliseconds |

### GNN Training Worker

| Variable | Default | Required | Description |
|---|---|---|---|
| `GNN_WORKER_ENABLED` | `false` | No | Enable GNN training worker process |
| `GNN_MAX_CONCURRENT_JOBS` | `2` | No | Maximum concurrent GNN training jobs |
| `GNN_DEFAULT_EPOCHS` | `100` | No | Default training epochs if not specified |
| `GNN_DEFAULT_HIDDEN_DIMS` | `256` | No | Default hidden layer dimensions |
| `GNN_DEFAULT_LEARNING_RATE` | `0.001` | No | Default learning rate |
| `GNN_DEFAULT_BATCH_SIZE` | `256` | No | Default mini-batch size |
| `GNN_ARTIFACT_PATH_PREFIX` | `s3://paygate-models/gnn_fraud` | No | S3 prefix for GNN model artifacts |
| `GNN_DATASET_PATH_PREFIX` | `s3://paygate-datasets/fraud` | No | S3 prefix for training datasets |
| `GNN_EARLY_STOPPING_PATIENCE` | `10` | No | Epochs without improvement before stopping |
| `GNN_CHECKPOINT_INTERVAL` | `10` | No | Save checkpoint every N epochs |
| `GNN_GPU_ENABLED` | `false` | No | Enable CUDA GPU acceleration |
| `GNN_NVIDIA_DEVICE` | `0` | No | CUDA device index when GPU is enabled |

### Menu Management Service

| Variable | Default | Required | Description |
|---|---|---|---|
| `MENU_CDN_URL` | — | No | CDN base URL for menu item images |
| `MENU_CACHE_TTL_SECONDS` | `300` | No | Menu API cache TTL in seconds |
| `MENU_MAX_CATEGORIES_PER_MERCHANT` | `50` | No | Maximum menu categories per merchant |
| `MENU_MAX_ITEMS_PER_CATEGORY` | `200` | No | Maximum items per menu category |
| `MENU_MAX_ITEM_PRICE_KOBO` | `10000000000` | No | Maximum item price in kobo (₦100M) |
| `MENU_IMAGE_MAX_SIZE_MB` | `5` | No | Maximum menu item image size in MB |
| `MENU_ALLOWED_IMAGE_TYPES` | `image/jpeg,image/png,image/webp` | No | Allowed MIME types for menu images |
| `MENU_CDN_INVALIDATION_ENABLED` | `false` | No | Enable CDN cache invalidation on menu updates |

### Portal Health Dashboard

| Variable | Default | Required | Description |
|---|---|---|---|
| `UPTIME_KUMA_URL` | `http://uptime-kuma:3001` | No | Uptime Kuma dashboard URL |
| `UPTIME_KUMA_API_KEY` | — | No | Uptime Kuma API key for status queries |
| `HEALTH_CHECK_TIMEOUT_MS` | `5000` | No | Timeout for external health checks |
| `HEALTH_CHECK_RATE_LIMIT` | `30` | No | Max health endpoint calls per minute per IP |
| `PORTAL_HEALTH_ALERT_THRESHOLD` | `0.95` | No | Uptime % below which alerts are sent |
| `PORTAL_HEALTH_WINDOW_DAYS` | `30` | No | Rolling window for uptime stats |
| `GO_LIVE_CHECKLIST_ENABLED` | `true` | No | Enable go-live readiness checklist |
| `GO_LIVE_REQUIRED_CHECKS` | `kyc,bank_account,webhook,api_key,2fa` | No | Comma-separated required go-live checks |

### OpenTelemetry Collector (ports 4317/4318)

| Variable | Default | Required | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | No | OTLP collector endpoint (gRPC or HTTP) |
| `OTEL_SERVICE_NAME` | `paygate-merchant-portal` | No | Service name in traces and metrics |
| `OTEL_TRACES_SAMPLER` | `parentbased_traceidratio` | No | Trace sampling strategy |
| `OTEL_TRACES_SAMPLER_ARG` | `0.1` | No | Sampling ratio (0.0–1.0) |
| `OTEL_METRICS_EXPORT_INTERVAL` | `60000` | No | Metrics export interval in milliseconds |
| `OTEL_LOG_LEVEL` | `info` | No | OpenTelemetry SDK log level |

---

## Wave 123 Security Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `AI_MODEL_ADMIN_ALLOWED_ROLES` | `admin` | No | Comma-separated roles that can write to AI model registry |
| `MENU_WRITE_ALLOWED_ROLES` | `admin,merchant` | No | Comma-separated roles that can create/update menu items |
| `PORTAL_HEALTH_ADMIN_ROLES` | `admin` | No | Roles that can trigger external health checks |
| `GNN_JOB_CANCEL_ALLOWED_ROLES` | `admin` | No | Roles that can cancel running GNN jobs |
| `AI_AUDIT_RETENTION_DAYS` | `2555` | No | Days to retain AI audit trail records (default: 7 years) |

---

## Wave 123 Feature Flags

| Variable | Default | Description |
|---|---|---|
| `FEATURE_AI_MODEL_ADMIN` | `true` | Enable AI Model Admin page and procedures |
| `FEATURE_MENU_MANAGEMENT` | `true` | Enable Menu Management page and procedures |
| `FEATURE_PORTAL_HEALTH` | `true` | Enable Portal Health Dashboard |
| `FEATURE_GNN_TRAINING` | `false` | Enable GNN training job submission (requires GPU worker) |
| `FEATURE_MENU_CDN_INVALIDATION` | `false` | Enable CDN cache invalidation on menu updates |
| `FEATURE_UPTIME_KUMA_INTEGRATION` | `false` | Enable Uptime Kuma status integration |

---

## Migration from Previous Waves

Wave 123 extends the following existing variables:

| Existing Variable | Wave 123 Usage |
|---|---|
| `REDIS_URL` | Used by Feast feature store for online feature serving |
| `BUILT_IN_FORGE_API_KEY` | Used by AI model inference calls via Forge API |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Now also used by GNN worker and Feast |
| `MIDDLEWARE_BRIDGE_URL` | Extended with 7 new bridge functions (see `middlewareBridge.ts`) |
| `INTERNAL_API_KEY` | Used for GNN worker → portal authentication |

---

## Example `.env` additions for Wave 123

```dotenv
# MLflow
MLFLOW_TRACKING_URI=http://mlflow:5000
MLFLOW_S3_ENDPOINT_URL=http://minio:9000

# MinIO
MINIO_ROOT_USER=paygate_minio
MINIO_ROOT_PASSWORD=change_me_in_production

# GNN Worker
GNN_WORKER_ENABLED=false
GNN_MAX_CONCURRENT_JOBS=2

# Menu Management
MENU_CDN_URL=https://cdn.paygate.io/menu
MENU_CACHE_TTL_SECONDS=300
MENU_CDN_INVALIDATION_ENABLED=false

# Portal Health
HEALTH_CHECK_TIMEOUT_MS=5000
PORTAL_HEALTH_WINDOW_DAYS=30
GO_LIVE_CHECKLIST_ENABLED=true

# Feature Flags
FEATURE_AI_MODEL_ADMIN=true
FEATURE_MENU_MANAGEMENT=true
FEATURE_PORTAL_HEALTH=true
FEATURE_GNN_TRAINING=false
```

---

## Notes

1. **GPU support**: GNN training with GPU requires NVIDIA drivers and `nvidia-container-toolkit` on the Docker host. Set `GNN_GPU_ENABLED=true` and start with `docker compose --profile ml up`.

2. **MinIO vs S3**: In production, replace MinIO with AWS S3 by setting `MINIO_ENDPOINT` to your S3 endpoint and using IAM roles instead of root credentials.

3. **MLflow database**: MLflow requires a dedicated database. The `docker-compose.wave123.yml` creates a `paygate_mlflow` database in the existing PostgreSQL instance.

4. **Feast cold start**: The Feast online server requires a Redis instance with pre-materialized features. Run `feast materialize-incremental` before enabling `FEATURE_GNN_TRAINING`.

5. **AI audit retention**: The `AI_AUDIT_RETENTION_DAYS` default of 2555 days (7 years) aligns with Nigerian financial regulation requirements for transaction records.
