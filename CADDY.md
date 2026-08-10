# Caddy Edge Proxy — PayGate Integration Guide

## Overview

[Caddy](https://github.com/caddyserver/caddy) replaces nginx as the **edge proxy** for the PayGate platform. It sits at the outermost layer of the request pipeline and provides:

| Capability | Value |
|---|---|
| **Automatic TLS** | Zero-config HTTPS via ACME (Let's Encrypt / ZeroSSL). Wildcard certs via DNS-01 challenge (Cloudflare). No manual cert rotation. |
| **HTTP/3 QUIC** | Native HTTP/3 support on all endpoints. Reduces payment API latency by ~30% on high-latency mobile networks (critical for Nigeria/Africa). |
| **OIDC enforcement** | caddy-security plugin enforces Keycloak authentication at the edge — before requests reach APISIX or the app. Eliminates auth bypass via direct APISIX access. |
| **WAF chaining** | Caddy → OpenAppSec WAF → APISIX → App. OpenAppSec ML-based WAF inspects every request. Caddy injects `X-Target-Upstream` so OpenAppSec knows where to forward. |
| **L4 TCP proxy** | caddy-l4 adds TLS termination for TigerBeetle (port 3001), PgBouncer (5433), Redis (6380), and Kafka (9093). Encrypts all internal service communication. |
| **Dynamic config** | Admin API on `:2019` enables zero-downtime route updates, cert inspection, and upstream health checks from the Go bridge service. |
| **Prometheus metrics** | Built-in `/metrics` endpoint. No nginx-prometheus-exporter sidecar needed. |
| **Zero-downtime reload** | `caddy reload` via Admin API — no process restart, no dropped connections. |

---

## Architecture

```
Internet
   │
   ▼
Caddy :443 (TLS 1.3, HTTP/3 QUIC)
   │  ├─ OIDC enforcement (caddy-security → Keycloak)
   │  ├─ Security headers (HSTS, CSP, X-Frame-Options)
   │  └─ Rate limiting (caddy-ratelimit)
   │
   ▼
OpenAppSec WAF :8080
   │  ├─ ML-based threat detection (OWASP Top-10)
   │  ├─ Bot mitigation
   │  └─ WAF events → Kafka (paygate.waf.events)
   │
   ▼
APISIX :9080
   │  ├─ Route matching (portal, bridge, nexthub, mojaloop)
   │  ├─ Rate limiting per consumer
   │  ├─ Prometheus metrics
   │  └─ Caddy auth header → APISIX consumer context
   │
   ▼
App Services (paygate_app :3000, go-bridge :8080, python-services, etc.)
```

**L4 TCP proxy (separate listener):**
```
External client :3001 → Caddy L4 TLS termination → TigerBeetle :3000
External client :5433 → Caddy L4 TLS termination → PgBouncer :5432
External client :6380 → Caddy L4 TLS termination → Redis :6379
External client :9093 → Caddy L4 TLS termination → Kafka :9092
```

---

## Quick Start

### 1. Build Custom Caddy Binary

```bash
cd caddy && ./scripts/build.sh
```

Or use the pre-built Docker image:

```bash
docker compose -f docker-compose.production.yml \
               -f caddy/docker-compose.caddy.yml \
               build paygate_caddy
```

### 2. Set Required Environment Variables

```env
# Cloudflare API token for DNS-01 ACME challenge (wildcard certs)
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token

# Keycloak OIDC
KEYCLOAK_ISSUER_URL=https://keycloak.paygate.ng/realms/paygate
KEYCLOAK_CLIENT_ID=paygate-merchant
KEYCLOAK_CLIENT_SECRET=your_keycloak_client_secret

# JWT secret (shared with app for caddy-security token signing)
JWT_SECRET=your_jwt_secret_min_32_chars

# OpenAppSec (optional — leave empty for community mode)
OPENAPPSEC_TOKEN=
```

### 3. Start the Stack

```bash
# Start Caddy alongside the existing production stack
docker compose \
  -f docker-compose.production.yml \
  -f caddy/docker-compose.caddy.yml \
  up -d paygate_caddy paygate_openappsec paygate_apisix
```

### 4. Validate Configuration

```bash
docker exec paygate_caddy caddy validate \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
```

---

## Integration Details

### Caddy ↔ Keycloak

The `caddy-security` plugin acts as an OIDC Relying Party. It:

1. Redirects unauthenticated requests to `https://auth.paygate.ng/auth/login`
2. Completes the OIDC authorization code flow with Keycloak
3. Issues a signed JWT cookie (`pg_session`) using `JWT_SECRET`
4. Injects `X-Caddy-Auth-User` and `X-Caddy-Auth-Roles` headers on all authenticated requests
5. Enforces role-based access: `paygate-merchant` for the portal, `paygate-admin` for NextHub/admin routes

**Keycloak client configuration required:**
- Valid Redirect URIs: `https://auth.paygate.ng/auth/callback`
- Web Origins: `https://paygate.ng`, `https://api.paygate.ng`, `https://nexthub.paygate.ng`

### Caddy ↔ OpenAppSec WAF

Caddy forwards all requests to OpenAppSec on port `8080`. The `X-Target-Upstream` header tells OpenAppSec where to forward the inspected request:

- `paygate_apisix:9080` — for API routes
- `paygate_app:3000` — for direct app routes (webhooks, OAuth callbacks)

OpenAppSec publishes WAF events to the Python `openappsec-waf` service at `http://paygate_openappsec_waf:8130/v1/waf/event`, which then publishes to Kafka topic `paygate.waf.events`.

### Caddy ↔ APISIX

APISIX is configured to **only accept traffic from Caddy** (IP restriction to Docker bridge network). Direct internet access to APISIX is blocked.

Caddy injects two headers that APISIX uses for consumer context:
- `X-Caddy-Auth-User` — Keycloak user ID
- `X-Caddy-Auth-Roles` — Keycloak realm roles (comma-separated)

The APISIX `serverless-pre-function` plugin maps these to APISIX consumer context for downstream rate limiting and audit logging.

### Caddy Admin API (Go Bridge Integration)

The Go bridge exposes Caddy management endpoints:

| Endpoint | Description |
|---|---|
| `GET /internal/bridge/caddy/status` | Upstream health + certificate expiry |
| `POST /internal/bridge/caddy/reload` | Zero-downtime config reload |

---

## Monitoring

Caddy exposes Prometheus metrics at `http://paygate_caddy:2019/metrics` (internal only).

Key metrics to alert on:

| Metric | Alert Threshold |
|---|---|
| `caddy_http_requests_total{status=~"5.."}` | > 1% of total requests |
| `caddy_http_request_duration_seconds{quantile="0.99"}` | > 2s |
| `caddy_tls_handshake_errors_total` | > 10/min |
| `caddy_reverse_proxy_upstreams_healthy` | < 1 (any upstream down) |

---

## Migration from nginx

The existing `nginx/nginx.conf` handles TLS termination and proxying to `paygate_app:3000`. Caddy provides a superset of this functionality.

**Migration steps:**
1. Deploy Caddy alongside nginx (different ports initially)
2. Test all routes via Caddy
3. Update DNS to point to Caddy's IP
4. Stop nginx: `docker compose stop paygate_nginx`
5. Remove nginx from `docker-compose.production.yml` or keep as fallback

**nginx → Caddy feature mapping:**

| nginx feature | Caddy equivalent |
|---|---|
| `ssl_certificate` / `ssl_certificate_key` | Automatic ACME (no manual certs) |
| `limit_req_zone` | `caddy-ratelimit` plugin |
| `proxy_pass` | `reverse_proxy` directive |
| `add_header` | `header` directive |
| `gzip on` | Built-in (automatic) |
| `access_log` | `log` block with JSON format |
| `server_tokens off` | `header -Server` |

---

## Security Considerations

1. **Admin API** (`:2019`) must be firewalled — accessible only from the Docker internal network and the Go bridge service.
2. **Keycloak client secret** must be stored in Docker secrets or a vault — never in plain `.env` files in production.
3. **DNS-01 ACME** requires a Cloudflare API token with `Zone:DNS:Edit` permission scoped to `paygate.ng` only.
4. **L4 TLS** for TigerBeetle/PgBouncer/Redis uses the same wildcard cert as the HTTP layer — no separate cert management needed.
5. **OpenAppSec** runs in `prevent-learn` mode — it blocks known attacks immediately and learns new patterns. Review the WAF dashboard weekly to tune false positives.

