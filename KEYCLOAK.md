# Keycloak Authentication Guide — PayGate Merchant Portal

## Overview

The PayGate Merchant Portal ships with a **dual-mode authentication strategy**. When the environment variable `KEYCLOAK_ISSUER_URL` is absent or empty, the portal falls back to Manus OAuth (the built-in development identity provider). Setting `KEYCLOAK_ISSUER_URL` activates the full Keycloak integration, which validates RS256-signed JWTs using JWKS key discovery.

No code changes are required to switch between modes — the runtime detects the variable and routes accordingly.

---

## Quick Activation

Set the following environment variables via the Secrets panel (Settings → Secrets in the Management UI):

| Variable | Required | Example Value |
|---|---|---|
| `KEYCLOAK_ISSUER_URL` | Yes | `https://auth.yourcompany.com/realms/paygate` |
| `KEYCLOAK_CLIENT_ID` | Yes | `paygate-merchant` |
| `KEYCLOAK_CLIENT_SECRET` | Yes (confidential clients) | `abc123...` |
| `KEYCLOAK_AUDIENCE` | No | `paygate-merchant` (defaults to client ID) |

Once `KEYCLOAK_ISSUER_URL` is set and the server restarts, all `/api/trpc` requests will be authenticated against Keycloak's JWKS endpoint at:

```
${KEYCLOAK_ISSUER_URL}/protocol/openid-connect/certs
```

---

## How It Works

### Authentication Flow

The auth module (`server/_core/auth.ts`) performs the following steps on every protected request:

1. Extracts the `pg_session` cookie from the request.
2. Checks whether `KEYCLOAK_ISSUER_URL` is configured.
3. **Keycloak path**: Fetches the JWKS from `${issuerUrl}/protocol/openid-connect/certs`, caches the key set in memory (refreshed every 5 minutes), and verifies the JWT using `jose` (RS256 algorithm, audience check, issuer check).
4. **Manus fallback path**: Verifies the JWT using the symmetric `JWT_SECRET` (HS256).
5. Extracts `sub`, `email`, `preferred_username`, and `realm_access.roles` from the token claims and populates `ctx.user`.

### Role Mapping

Keycloak realm roles are mapped to the portal's internal role system as follows:

| Keycloak Realm Role | Portal Role |
|---|---|
| `paygate-admin` | `admin` |
| `paygate-merchant` | `user` |
| *(any other role)* | `user` |

To grant a user admin access, assign the `paygate-admin` role in the Keycloak Admin Console under **Realm roles → Users → Role Mappings**.

---

## Keycloak Realm Setup

The following steps configure a minimal Keycloak realm for PayGate.

### 1. Create the Realm

In the Keycloak Admin Console, create a new realm named `paygate` (or any name — use the full URL in `KEYCLOAK_ISSUER_URL`).

### 2. Create the Client

Under **Clients → Create client**:

- **Client ID**: `paygate-merchant`
- **Client Protocol**: `openid-connect`
- **Access Type**: `confidential` (for server-side token validation)
- **Valid Redirect URIs**: `https://your-portal-domain.manus.space/*`
- **Web Origins**: `https://your-portal-domain.manus.space`

After saving, copy the **Client Secret** from the **Credentials** tab.

### 3. Create Realm Roles

Under **Realm roles → Create role**:

- `paygate-admin` — for portal administrators
- `paygate-merchant` — for regular merchant users

### 4. Configure Token Claims

Under **Client Scopes → roles → Mappers**, ensure the **realm roles** mapper is active so that `realm_access.roles` appears in the access token.

### 5. Test Token Issuance

```bash
curl -X POST \
  "${KEYCLOAK_ISSUER_URL}/protocol/openid-connect/token" \
  -d "client_id=paygate-merchant" \
  -d "client_secret=${KEYCLOAK_CLIENT_SECRET}" \
  -d "username=merchant@example.com" \
  -d "password=yourpassword" \
  -d "grant_type=password" | jq .access_token
```

Paste the token into [jwt.io](https://jwt.io) to verify the `iss`, `aud`, and `realm_access.roles` claims.

---

## High Availability Configuration

For production deployments, run Keycloak in cluster mode with the following recommended settings:

```yaml
# docker-compose snippet (Keycloak HA)
keycloak:
  image: quay.io/keycloak/keycloak:24.0
  command: start --optimized
  environment:
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
    KC_DB_USERNAME: keycloak
    KC_DB_PASSWORD: ${KC_DB_PASSWORD}
    KC_HOSTNAME: auth.yourcompany.com
    KC_PROXY: edge
    KC_CACHE: ispn
    KC_CACHE_STACK: kubernetes
    JAVA_OPTS_APPEND: "-Djgroups.dns.query=keycloak-headless"
  replicas: 3
```

Key HA considerations:

- Use **Infinispan distributed cache** (`KC_CACHE=ispn`) so session state is shared across nodes.
- Place Keycloak behind a load balancer with **sticky sessions disabled** (Keycloak handles session affinity via the distributed cache).
- Configure **database connection pooling** (HikariCP defaults are adequate for most loads; tune `KC_DB_POOL_MAX_SIZE` for >10k concurrent users).
- Enable **JWKS caching** in the portal (already implemented — 5-minute TTL, configurable via `KEYCLOAK_JWKS_CACHE_TTL_SECONDS`).

---

## Fallback Behaviour

If `KEYCLOAK_ISSUER_URL` is not set:

- The portal uses Manus OAuth (HS256 JWT signed with `JWT_SECRET`).
- All existing login flows, session cookies, and `protectedProcedure` guards continue to work without modification.
- This is the default for local development and sandbox environments.

To explicitly disable the Keycloak path in production (not recommended), set `KEYCLOAK_ISSUER_URL=""`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` on all requests | JWKS fetch failed | Check `KEYCLOAK_ISSUER_URL` is reachable from the server container |
| `JWT audience mismatch` | `aud` claim does not match `KEYCLOAK_CLIENT_ID` | Set `KEYCLOAK_AUDIENCE` to match the `aud` value in the token |
| `JWT issuer mismatch` | Realm URL differs from token `iss` | Ensure `KEYCLOAK_ISSUER_URL` exactly matches the `iss` in the token (no trailing slash) |
| Users lose session after Keycloak restart | Keycloak session store not persisted | Configure Keycloak with a persistent DB and Infinispan persistence |
| Admin role not recognised | Role not mapped in token | Verify `realm_access.roles` contains `paygate-admin` in the decoded token |

---

*Last updated: Wave 27 — March 2026*
