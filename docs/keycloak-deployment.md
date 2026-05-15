# Keycloak Deployment Guide

This document covers the on-premise Keycloak configuration required by the PayGate Merchant Portal. The portal uses Keycloak as its **sole** identity provider — there is no cloud-hosted auth dependency.

---

## Quick-Start

```bash
# 1. Start the full stack (Keycloak starts automatically)
docker compose -f docker-compose.production.yml up -d

# 2. Provision the realm (one-time, idempotent)
KEYCLOAK_CLIENT_SECRET=<your-secret> ./scripts/keycloak-bootstrap.sh

# 3. Copy the printed secrets into your .env
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=paygate
KEYCLOAK_CLIENT_ID=merchant-portal
KEYCLOAK_CLIENT_SECRET=<printed-above>
ALLOWED_ORIGINS=https://portal.your-domain.com
```

---

## Realm Bootstrap Modes

### Default (step-by-step API)

Creates the realm, roles, client, and first admin user via individual Admin REST API calls. Recommended for first-time setup.

```bash
./scripts/keycloak-bootstrap.sh
```

### `--import-realm` (fast, CI-friendly)

Imports `keycloak/paygate-realm.json` in a single API call, then patches the client secret and creates the admin user. Recommended for automated pipelines and new environment provisioning.

```bash
KEYCLOAK_CLIENT_SECRET=<secret> ./scripts/keycloak-bootstrap.sh --import-realm
```

### Docker auto-import

The `docker-compose.production.yml` Keycloak service is configured with `--import-realm` and mounts `./keycloak/paygate-realm.json` into the container. Keycloak will automatically import the realm on first start if it does not already exist — **no manual bootstrap step required** for a fresh deployment.

---

## Environment Variables

| Variable | Required | Example | Description |
|---|---|---|---|
| `KEYCLOAK_URL` | Yes | `http://keycloak:8080` | Keycloak base URL (internal Docker network URL or public URL) |
| `KEYCLOAK_REALM` | Yes | `paygate` | Realm name |
| `KEYCLOAK_CLIENT_ID` | Yes | `merchant-portal` | OIDC client ID |
| `KEYCLOAK_CLIENT_SECRET` | Yes | `abc123...` | Confidential client secret |
| `ALLOWED_ORIGINS` | Recommended | `https://portal.acme.ng` | Comma-separated list of allowed OAuth redirect origins |
| `KEYCLOAK_ADMIN` | Bootstrap only | `admin` | Keycloak master realm admin username |
| `KEYCLOAK_ADMIN_PASSWORD` | Bootstrap only | `keycloak_admin_2026` | Keycloak master realm admin password |
| `PAYGATE_ADMIN_EMAIL` | Bootstrap only | `admin@paygate.local` | First portal admin user email |
| `PAYGATE_ADMIN_PASSWORD` | Bootstrap only | `Admin@PayGate2026!` | First portal admin user password |

---

## ALLOWED_ORIGINS Hardening

`ALLOWED_ORIGINS` controls which browser origins are permitted as OAuth redirect targets. This prevents open-redirect attacks.

### Rules

| Environment | Behaviour |
|---|---|
| Development (`NODE_ENV != production`) | `localhost:*` and `127.0.0.1:*` are always allowed. `ALLOWED_ORIGINS` extends the allowlist. |
| Production (`NODE_ENV=production`) | **Only** the server's own origin and explicit `ALLOWED_ORIGINS` entries are accepted. Localhost is rejected. |

### Configuration

```bash
# Single domain
ALLOWED_ORIGINS=https://portal.acme.ng

# Multiple domains (comma-separated)
ALLOWED_ORIGINS=https://portal.acme.ng,https://portal-staging.acme.ng

# Wildcards are NOT supported and will be rejected with a security warning
ALLOWED_ORIGINS=*  # ← rejected
```

### Startup Logs

On startup the server logs the effective allowed origins:

```
[Auth] Keycloak OIDC enabled — https://auth.acme.ng/realms/paygate
[Auth] ALLOWED_ORIGINS: https://portal.acme.ng, https://portal-staging.acme.ng
```

If `ALLOWED_ORIGINS` is empty in production:

```
[Auth] WARNING: ALLOWED_ORIGINS is empty in production. Only the server's own origin will be accepted.
```

---

## SSO Logout

The portal implements full SSO logout: when a user clicks **Log out**, the portal:

1. Clears the portal session cookie (local logout).
2. Redirects the browser to Keycloak's end-session endpoint (`/protocol/openid-connect/logout`).
3. Keycloak invalidates the SSO session and redirects back to the portal root (`/`).

This ensures that on shared or kiosk machines, the user must enter credentials again on the next login attempt. Without this redirect, the Keycloak session cookie would persist and the user would be silently re-authenticated.

### How it works

The `auth.logout` tRPC mutation accepts an optional `origin` parameter from the client. The server builds the `post_logout_redirect_uri` from this origin and returns the full Keycloak end-session URL. The client then performs `window.location.href = ssoLogoutUrl`.

```
Client                     Portal Server              Keycloak
  │                              │                        │
  │── POST /api/trpc/auth.logout ─►                       │
  │   { origin: "https://..." }  │                        │
  │                              │── clears cookie        │
  │◄── { ssoLogoutUrl: "..." } ──│                        │
  │                              │                        │
  │── GET /logout?post_logout_redirect_uri=... ──────────►│
  │                              │                        │── invalidates SSO session
  │◄─────────────────────────────────────────────────────│
  │   redirect to /              │                        │
```

---

## Realm Roles

| Role | Description |
|---|---|
| `paygate-admin` | Platform administrator — full access |
| `paygate-merchant` | Merchant account — access to merchant portal |
| `paygate-consumer` | Consumer / end-user |
| `paygate-partner` | Integration partner |
| `paygate-operator` | Operations staff |

The portal maps `paygate-admin` → `admin` role and all others → `user` role internally.

---

## Exporting the Realm

After bootstrap, export the live realm from the Keycloak Admin UI to update `keycloak/paygate-realm.json`:

1. Log in to `http://<keycloak-host>:8081/admin`
2. Select the **paygate** realm
3. Go to **Realm Settings → Action → Export**
4. Enable "Export groups and roles" and "Export clients"
5. Download and replace `keycloak/paygate-realm.json`
6. Commit the updated file — new environments will auto-import it on first start

> **Note:** The exported JSON will not contain client secrets. Run `keycloak-bootstrap.sh --import-realm` after importing to patch the secret.

---

## Production Checklist

- [ ] `KEYCLOAK_URL` points to the internal Docker network address (e.g. `http://keycloak:8080`) — not `localhost`
- [ ] `KEYCLOAK_CLIENT_SECRET` is a randomly generated value (32+ hex chars)
- [ ] `ALLOWED_ORIGINS` is set to your exact portal domain(s)
- [ ] Keycloak is running behind a TLS-terminating reverse proxy (nginx/Caddy/Traefik) for internet-facing deployments
- [ ] `KC_HOSTNAME` is set in `docker-compose.production.yml` for internet-facing deployments (replace `start-dev` with `start`)
- [ ] Brute-force protection is enabled (it is in the default realm JSON)
- [ ] Admin user password has been changed from the default
- [ ] SMTP is configured in Keycloak for password-reset emails

---

## Session Timeout Policy

The `paygate-realm.json` ships with the following session and token lifetimes, which are tuned for financial-grade security:

| Parameter | Value | Purpose |
|---|---|---|
| `accessTokenLifespan` | 900 s (15 min) | Short-lived access tokens reduce the blast radius of token theft |
| `ssoSessionIdleTimeout` | 1800 s (30 min) | SSO session expires after 30 min of inactivity |
| `ssoSessionMaxLifespan` | 28800 s (8 hr) | Absolute maximum SSO session regardless of activity |
| `offlineSessionIdleTimeout` | 2592000 s (30 days) | Offline/refresh token idle expiry |
| `offlineSessionMaxLifespan` | 5184000 s (60 days) | Absolute maximum offline session |

The portal's silent refresh (`/api/auth/refresh`) re-issues the portal session JWT every 4 minutes using the stored `refresh_token` cookie, keeping users logged in without requiring a full Keycloak round-trip on every page load.

To change these values for your environment, edit `keycloak/paygate-realm.json` before running `--import-realm`, or patch them via the Admin REST API after provisioning:

```bash
curl -X PUT "$KEYCLOAK_URL/admin/realms/paygate" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accessTokenLifespan": 600, "ssoSessionIdleTimeout": 900}'
```

---

## TOTP / MFA

All users with the `paygate-admin` role are required to enrol in TOTP on first login. The realm is configured with:

- **Algorithm:** SHA-1 (TOTP RFC 6238 compatible with Google Authenticator, Authy, 1Password)
- **Digits:** 6
- **Period:** 30 seconds
- **Look-ahead window:** 1 (tolerates up to 30 s clock skew)

### TOTP Recovery Codes

The `RECOVERY_AUTHN_CODES` required action is registered in the realm. When enabled as a default action, users are prompted to generate one-time recovery codes during TOTP enrolment. These codes allow login if the TOTP device is unavailable.

To enable recovery codes as a default action (prompted at enrolment):

```bash
# In Keycloak Admin UI: Authentication → Required Actions → Recovery Authentication Codes → toggle Default On
# Or via API:
curl -X PUT "$KEYCLOAK_URL/admin/realms/paygate/authentication/required-actions/RECOVERY_AUTHN_CODES" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alias":"RECOVERY_AUTHN_CODES","enabled":true,"defaultAction":true}'
```

### Locked-Out Admin Recovery Runbook

If an admin loses their TOTP device and cannot log in:

1. Source the bootstrap script to load the helper functions:
   ```bash
   source ./scripts/keycloak-bootstrap.sh
   ```
2. Look up the admin's Keycloak user UUID:
   ```bash
   TOKEN=$(curl -sf -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
     -d "grant_type=password&client_id=admin-cli&username=$ADMIN_USER&password=$ADMIN_PASS" \
     | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
   curl -sf -H "Authorization: Bearer $TOKEN" \
     "$KEYCLOAK_URL/admin/realms/paygate/users?email=admin@example.com" \
     | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])"
   ```
3. Reset their TOTP and send a re-enrolment email:
   ```bash
   reset_admin_totp <keycloak-user-uuid>
   ```
4. The admin will receive an email with a link to re-configure TOTP on next login.

> **Important:** The `reset_admin_totp` function requires `KEYCLOAK_URL`, `REALM`, `ADMIN_USER`, and `ADMIN_PASS` to be set in the environment before sourcing the script.

---

## Auth Events Audit Log

The portal exposes a built-in **Auth Events** page at `/settings/auth-events` that shows all Keycloak login, logout, and error events stored in the `keycloak_events` database table.

Events are forwarded from Keycloak to the portal via the `/api/internal/keycloak-events` webhook endpoint. To configure Keycloak to send events:

1. In Keycloak Admin UI: **Realm Settings → Events → Event Listeners**
2. Add `http-event-listener` to the list
3. Configure the provider:
   - **URL:** `https://portal.your-domain.com/api/internal/keycloak-events`
   - **Secret:** value of `KEYCLOAK_WEBHOOK_SECRET` env var (set in `.env`)

The webhook uses HMAC-SHA256 signature verification (`X-Keycloak-Signature` header). If `KEYCLOAK_WEBHOOK_SECRET` is not set, signature verification is skipped (not recommended for production).

Events are also mirrored to the existing `audit_events` table for cross-system correlation.
