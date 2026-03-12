# PayGate Platform — Environment Variables Reference

This document lists every environment variable required across all three PayGate portals.
All secrets must be injected at deploy time; **never commit `.env` files**.

---

## Merchant Portal (`paygate-merchant-portal`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL/TiDB connection string for the merchant portal DB |
| `JWT_SECRET` | ✅ | Secret used to sign session cookies (min 32 chars) |
| `VITE_APP_ID` | ✅ | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | ✅ | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | ✅ | Manus login portal URL (frontend) |
| `OWNER_OPEN_ID` | ✅ | Owner's Manus OpenID (for notifications) |
| `OWNER_NAME` | ✅ | Owner's display name |
| `BUILT_IN_FORGE_API_URL` | ✅ | Manus built-in APIs base URL |
| `BUILT_IN_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | ✅ | Manus built-in APIs URL (frontend) |
| `MIDDLEWARE_BRIDGE_URL` | ⚠️ Optional | URL of the Go middleware bridge (Temporal, Kafka, Dapr). Falls back gracefully when absent. |
| `MIDDLEWARE_INTERNAL_KEY` | ⚠️ Optional | HMAC key for middleware bridge authentication |
| `AWS_ACCESS_KEY_ID` | ⚠️ Optional | S3-compatible storage access key (auto-injected by Manus) |
| `AWS_SECRET_ACCESS_KEY` | ⚠️ Optional | S3-compatible storage secret (auto-injected by Manus) |
| `AWS_REGION` | ⚠️ Optional | S3 region (auto-injected by Manus) |
| `S3_BUCKET_NAME` | ⚠️ Optional | S3 bucket name (auto-injected by Manus) |

---

## Consumer Portal (`paygate-consumer-portal`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL/TiDB connection string for the consumer portal DB |
| `JWT_SECRET` | ✅ | Secret used to sign consumer session tokens |
| `VITE_APP_ID` | ✅ | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | ✅ | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | ✅ | Manus login portal URL (frontend) |
| `BUILT_IN_FORGE_API_URL` | ✅ | Manus built-in APIs base URL |
| `BUILT_IN_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | ✅ | Manus built-in APIs URL (frontend) |
| `MERCHANT_PORTAL_URL` | ⚠️ Optional | Internal URL for merchant portal API calls |
| `AWS_ACCESS_KEY_ID` | ⚠️ Optional | S3 access key for KYC document uploads |
| `AWS_SECRET_ACCESS_KEY` | ⚠️ Optional | S3 secret for KYC document uploads |
| `AWS_REGION` | ⚠️ Optional | S3 region |
| `S3_BUCKET_NAME` | ⚠️ Optional | S3 bucket name |

---

## Admin Portal (`paygate-admin-portal`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string for the admin portal DB |
| `JWT_SECRET` | ✅ | Secret used to sign admin session tokens |
| `ADMIN_DEFAULT_EMAIL` | ⚠️ Optional | Default super-admin email for first-run seeding |
| `ADMIN_DEFAULT_PASSWORD` | ⚠️ Optional | Default super-admin password (change immediately after first login) |
| `BUILT_IN_FORGE_API_URL` | ✅ | Manus built-in APIs base URL |
| `BUILT_IN_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (server-side) |

---

## Go Middleware Bridge (`paygate-middleware`)

| Variable | Required | Description |
|---|---|---|
| `TEMPORAL_HOST` | ✅ | Temporal server host:port |
| `KAFKA_BROKERS` | ✅ | Comma-separated Kafka broker addresses |
| `DAPR_HTTP_PORT` | ✅ | Dapr sidecar HTTP port |
| `REDIS_URL` | ✅ | Redis connection URL for caching and rate limiting |
| `TIGERBEETLE_CLUSTER_ID` | ✅ | TigerBeetle cluster ID |
| `TIGERBEETLE_ADDRESSES` | ✅ | TigerBeetle node addresses |
| `INTERNAL_KEY` | ✅ | HMAC key for internal service authentication (must match `MIDDLEWARE_INTERNAL_KEY`) |
| `KEYCLOAK_URL` | ⚠️ Optional | Keycloak base URL for role sync |
| `KEYCLOAK_REALM` | ⚠️ Optional | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | ⚠️ Optional | Keycloak client ID |
| `KEYCLOAK_CLIENT_SECRET` | ⚠️ Optional | Keycloak client secret |
| `PERMIFY_URL` | ⚠️ Optional | Permify authorization service URL |
| `FLUVIO_URL` | ⚠️ Optional | Fluvio streaming platform URL |

---

## Security Notes

1. **JWT_SECRET** must be at least 32 characters of random entropy. Generate with: `openssl rand -base64 48`
2. **ADMIN_DEFAULT_PASSWORD** must be changed immediately after first login. The system enforces a minimum of 12 characters.
3. **MIDDLEWARE_INTERNAL_KEY** must match between the portal and bridge. Generate with: `openssl rand -hex 32`
4. All database passwords must be rotated before production go-live.
5. S3 bucket must have server-side encryption enabled (AES-256 or KMS).
6. Enable HTTPS/TLS termination at the load balancer level; the Node.js servers serve HTTP internally.

---

## Production Checklist

- [ ] All `✅ Required` variables are set in the deployment environment
- [ ] JWT_SECRET is at least 32 characters and unique per portal
- [ ] ADMIN_DEFAULT_PASSWORD has been changed after first login
- [ ] Database SSL mode is enabled (`?ssl=true` or `sslmode=require`)
- [ ] S3 bucket has server-side encryption enabled
- [ ] Rate limiting is tuned for expected production traffic
- [ ] CORS origins are restricted to known frontend domains
- [ ] Helmet security headers are enabled (already wired in all portals)
- [ ] Health check endpoints are configured at `/health`
- [ ] Log aggregation (e.g., Datadog, Loki) is connected
- [ ] Alerting is configured for error rate > 1% and p99 latency > 2s
