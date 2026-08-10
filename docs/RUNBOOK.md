# PayGate Merchant Portal — Operations Runbook

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Environment Variables](#environment-variables)
4. [Database Operations](#database-operations)
5. [Deployment Procedures](#deployment-procedures)
6. [Health Checks & Monitoring](#health-checks--monitoring)
7. [Incident Response](#incident-response)
8. [Backup & Recovery](#backup--recovery)
9. [Scaling Guidelines](#scaling-guidelines)
10. [Common Troubleshooting](#common-troubleshooting)

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 22.x | Backend runtime |
| pnpm | 9.x | Package manager |
| Docker | 27.x | Container runtime |
| kubectl | 1.31.x | Kubernetes CLI |
| psql | 16.x | PostgreSQL CLI |
| redis-cli | 7.x | Redis CLI |

---

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
git clone <repo-url> paygate-merchant-portal
cd paygate-merchant-portal
pnpm install
```

### 2. Start Infrastructure Services

```bash
# Start core services (PostgreSQL, Redis, etc.)
docker-compose up -d

# Verify all services are healthy
docker-compose ps
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
# Edit .env with your local credentials
```

Required variables for local development:
- `PG_DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — Session signing secret (any random string for dev)
- `VITE_APP_ID` — Manus OAuth app ID
- `OAUTH_SERVER_URL` — Manus OAuth backend URL

### 4. Run Database Migrations

```bash
pnpm db:push
```

### 5. Start the Development Server

```bash
pnpm dev
```

The portal will be available at `http://localhost:5173`.

### 6. Run Tests

```bash
pnpm test              # Run all tests
pnpm test --watch      # Watch mode
pnpm test server/wave93.production.test.ts  # Single file
```

---

## Environment Variables

See `docs/ENV_REFERENCE.md` for the complete list of environment variables.

### Critical Variables (Required for Production)

| Variable | Description | Where to Get |
|---|---|---|
| `PG_DATABASE_URL` | PostgreSQL connection string | Database provider |
| `JWT_SECRET` | Session cookie signing key | Generate: `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Stripe API key | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Stripe Dashboard → Webhooks |
| `NIBSS_SECRET_KEY` | NIBSS gateway credentials | NIBSS portal |
| `MOJALOOP_API_KEY` | Mojaloop API key | Mojaloop Hub |
| `TERMII_API_KEY` | SMS/OTP service key | Termii Dashboard |

### Feature Flag Variables

| Variable | Default | Description |
|---|---|---|
| `VTPASS_SANDBOX` | `true` | Use VTPass sandbox mode |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (empty) | Enable distributed tracing |

---

## Database Operations

### Running Migrations

```bash
# Generate and apply new migrations
pnpm db:push

# View migration history
ls -la drizzle/*.sql
```

### Database Backup

```bash
# Full backup
pg_dump $PG_DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql $PG_DATABASE_URL < backup_20260101_120000.sql
```

### Promote User to Admin

```bash
psql $PG_DATABASE_URL -c "UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';"
```

### Check Database Health

```bash
psql $PG_DATABASE_URL -c "SELECT version();"
psql $PG_DATABASE_URL -c "SELECT count(*) FROM merchants;"
```

### Connection Pool Tuning

The pool size is automatically calculated as `2 × vCPU + 1` (capped at 50).
Override with `PG_POOL_MAX` environment variable.

---

## Deployment Procedures

### Docker Compose Deployment

```bash
# Pull latest images
docker-compose pull

# Rolling restart (zero downtime)
docker-compose up -d --no-deps --build portal

# Full restart
docker-compose down && docker-compose up -d
```

### Kubernetes Deployment

```bash
# Apply configuration changes
kubectl apply -k infra/k8s/base/

# Rolling update
kubectl rollout restart deployment/paygate-portal -n paygate

# Check rollout status
kubectl rollout status deployment/paygate-portal -n paygate

# Rollback if needed
kubectl rollout undo deployment/paygate-portal -n paygate
```

### CI/CD Pipeline

The GitHub Actions pipeline (`.github/workflows/ci.yml`) automatically:
1. Runs `pnpm test` on every push
2. Builds Docker images on main branch
3. Deploys to staging on merge to `main`
4. Deploys to production on version tags (`v*.*.*`)

---

## Health Checks & Monitoring

### Health Endpoints

```bash
# Basic health check (used by load balancer)
curl https://portal.paygate.ng/health

# Detailed health check
curl https://portal.paygate.ng/api/health

# Service dependency health
curl https://portal.paygate.ng/api/health/services
```

Expected response:
```json
{
  "status": "ok",
  "db": "connected",
  "redis": "connected",
  "version": "1.0.0",
  "uptime": 3600
}
```

### Grafana Dashboards

Access Grafana at `http://grafana.internal:3000`:
- **PayGate Overview**: Transaction volume, error rates, latency
- **Database Performance**: Query times, connection pool usage
- **Middleware Bridge**: External service call rates and failures
- **Security**: Rate limit hits, authentication failures

### Prometheus Alerts

Key alert rules in `infra/prometheus/`:
- `HighErrorRate`: Error rate > 1% for 5 minutes
- `HighLatency`: p99 latency > 1s for 5 minutes
- `DatabaseDown`: PostgreSQL unreachable for 1 minute
- `MiddlewareDegraded`: External service failure rate > 50%

---

## Incident Response

### Severity Levels

| Level | Definition | Response Time | Escalation |
|---|---|---|---|
| P0 | Complete service outage | 15 minutes | CTO + On-call |
| P1 | Payment processing failure | 30 minutes | Engineering Lead |
| P2 | Feature degradation | 2 hours | On-call engineer |
| P3 | Non-critical issue | Next business day | Team |

### P0 Response Procedure

1. **Acknowledge** the alert in PagerDuty
2. **Check health endpoints**: `curl https://portal.paygate.ng/health`
3. **Check recent deployments**: `kubectl rollout history deployment/paygate-portal`
4. **Check error logs**: `kubectl logs -l app=paygate-portal --tail=100`
5. **Rollback if recent deployment**: `kubectl rollout undo deployment/paygate-portal`
6. **Notify stakeholders** via Slack #incidents channel
7. **Post-mortem** within 48 hours

### Database Connection Issues

```bash
# Check active connections
psql $PG_DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
psql $PG_DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '10 minutes';"

# Restart connection pool (restart the portal service)
kubectl rollout restart deployment/paygate-portal -n paygate
```

### Redis Cache Issues

```bash
# Check Redis memory usage
redis-cli -u $REDIS_URL INFO memory

# Flush cache (emergency only — causes performance degradation)
redis-cli -u $REDIS_URL FLUSHDB

# Check cache hit rate
redis-cli -u $REDIS_URL INFO stats | grep keyspace_hits
```

### Stripe Webhook Failures

1. Check Stripe Dashboard → Developers → Webhooks for failed deliveries
2. Verify `STRIPE_WEBHOOK_SECRET` is correct
3. Check `/api/stripe/webhook` endpoint is accessible
4. Replay failed webhooks from Stripe Dashboard

---

## Backup & Recovery

### Automated Backups

The GitHub Actions workflow `.github/workflows/db-backup.yml` runs daily at 02:00 UTC:
- Creates a full PostgreSQL dump
- Uploads to S3 with 30-day retention
- Sends notification on failure

### Manual Backup

```bash
# Create backup
pg_dump $PG_DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz

# Upload to S3
aws s3 cp backup_$(date +%Y%m%d).sql.gz s3://paygate-backups/manual/

# Verify backup
gunzip -c backup_$(date +%Y%m%d).sql.gz | psql $PG_DATABASE_URL_TEST
```

### Recovery Procedure

```bash
# 1. Stop the portal
kubectl scale deployment paygate-portal --replicas=0

# 2. Restore database
gunzip -c backup_20260101.sql.gz | psql $PG_DATABASE_URL

# 3. Verify data integrity
psql $PG_DATABASE_URL -c "SELECT count(*) FROM transactions;"

# 4. Restart the portal
kubectl scale deployment paygate-portal --replicas=3
kubectl rollout status deployment/paygate-portal
```

---

## Scaling Guidelines

### Horizontal Scaling

The portal is stateless (session state in JWT cookies) and can be scaled horizontally:

```bash
# Scale to 5 replicas
kubectl scale deployment paygate-portal --replicas=5

# Auto-scaling is configured in infra/k8s/base/hpa-pdb.yaml
# Min: 2 replicas, Max: 20 replicas
# Scale up when CPU > 70% or memory > 80%
```

### Database Scaling

For read-heavy workloads, add read replicas:
1. Create a PostgreSQL read replica
2. Add `PG_READ_REPLICA_URL` environment variable
3. Route read queries to the replica in `server/db.ts`

### Redis Scaling

For high-traffic scenarios, use Redis Cluster:
1. Update `REDIS_URL` to point to the cluster
2. The `ioredis` client automatically handles cluster topology

---

## Common Troubleshooting

### "Database not available" errors

**Cause**: PostgreSQL is not running or `PG_DATABASE_URL` is incorrect.

**Fix**:
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Test connection
psql $PG_DATABASE_URL -c "SELECT 1;"

# Restart PostgreSQL
docker-compose restart postgres
```

### "JWT_SECRET not set" errors

**Cause**: Missing environment variable.

**Fix**: Set `JWT_SECRET` in your `.env` file or Kubernetes secrets.

### Slow queries

**Cause**: Missing indexes or N+1 query patterns.

**Fix**:
```bash
# Enable slow query logging
psql $PG_DATABASE_URL -c "ALTER SYSTEM SET log_min_duration_statement = '100';"
psql $PG_DATABASE_URL -c "SELECT pg_reload_conf();"

# Check slow queries
psql $PG_DATABASE_URL -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

### Stripe webhook signature verification failures

**Cause**: `STRIPE_WEBHOOK_SECRET` mismatch or request body parsing issue.

**Fix**:
1. Verify the webhook secret in Stripe Dashboard matches `STRIPE_WEBHOOK_SECRET`
2. Ensure the `/api/stripe/webhook` route uses `express.raw()` middleware
3. Check that no middleware is modifying the request body before the webhook handler

### tRPC procedure not found

**Cause**: Procedure not registered in `server/routers.ts`.

**Fix**: Add the procedure to the appropriate router and register it in `appRouter`.

### High memory usage

**Cause**: Memory leak in long-running processes or large query results.

**Fix**:
```bash
# Check Node.js heap usage
kubectl exec -it <pod-name> -- node -e "console.log(process.memoryUsage())"

# Restart the portal pod
kubectl delete pod <pod-name>

# Add pagination to large queries (max limit: 100)
```

---

## mTLS Certificate Rotation

Internal service certificates expire every 90 days. To rotate:

```bash
cd infra/certs
./generate-certs.sh

# Restart services to pick up new certificates
kubectl rollout restart deployment/paygate-portal
kubectl rollout restart deployment/middleware-bridge
```

---

## Contact & Escalation

| Role | Contact | Availability |
|---|---|---|
| On-call Engineer | PagerDuty rotation | 24/7 |
| Engineering Lead | Slack @eng-lead | Business hours |
| Database Admin | Slack @dba | Business hours |
| Security Team | security@paygate.ng | 24/7 for P0 |
