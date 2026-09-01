#!/usr/bin/env bash
# =============================================================================
# PayGate Keycloak Bootstrap Script
# =============================================================================
# Idempotently provisions the Keycloak realm, client, roles, and first admin
# user required by the PayGate Merchant Portal.
#
# Two modes:
#   --import-realm   Import keycloak/paygate-realm.json via the Admin REST API
#                    (faster, idempotent, recommended for CI/CD pipelines).
#                    The client secret is patched in after import.
#   (default)        Create realm, roles, client, and admin user step-by-step
#                    via individual Admin REST API calls.
#
# Usage:
#   ./scripts/keycloak-bootstrap.sh [--import-realm]
#
# Environment variables (with defaults):
#   KEYCLOAK_URL             — http://localhost:8081
#   KEYCLOAK_ADMIN           — admin
#   KEYCLOAK_ADMIN_PASSWORD  — (required, no default)
#   KEYCLOAK_REALM           — paygate
#   KEYCLOAK_CLIENT_ID       — merchant-portal
#   KEYCLOAK_CLIENT_SECRET   — (auto-generated if empty)
#   PAYGATE_ADMIN_EMAIL      — admin@paygate.local
#   PAYGATE_ADMIN_PASSWORD   — (required, no default)
#   PAYGATE_ADMIN_FIRST_NAME — PayGate
#   PAYGATE_ADMIN_LAST_NAME  — Admin
# =============================================================================

set -euo pipefail

# ─── Parse arguments ──────────────────────────────────────────────────────────
IMPORT_REALM=false
HEALTH_CHECK=false
for arg in "$@"; do
  case "$arg" in
    --import-realm) IMPORT_REALM=true ;;
    --health-check) HEALTH_CHECK=true ;;
    *) echo "[bootstrap] Unknown argument: $arg"; exit 1 ;;
  esac
done

# ─── Health-Check Mode ────────────────────────────────────────────────────────
# Usage: ./scripts/keycloak-bootstrap.sh --health-check
# Verifies Keycloak realm is reachable and client secret is valid.
# Returns exit code 0 on success, 1 on failure.
if [ "$HEALTH_CHECK" = true ]; then
  HC_URL="${KEYCLOAK_URL:-http://localhost:8081}"
  HC_REALM="${KEYCLOAK_REALM:-paygate}"
  HC_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-merchant-portal}"
  HC_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-}"
  HC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
  HC_ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-}"

  echo "[HealthCheck] Verifying Keycloak at $HC_URL/realms/$HC_REALM ..."

  # 1. Realm OIDC discovery endpoint
  DISC_HTTP=$(curl -so /dev/null -w "%{http_code}" \
    "$HC_URL/realms/$HC_REALM/.well-known/openid-configuration" 2>/dev/null)
  if [ "$DISC_HTTP" != "200" ]; then
    echo "[HealthCheck] FAIL: Realm discovery returned HTTP $DISC_HTTP (expected 200)"
    exit 1
  fi
  echo "[HealthCheck] OK: Realm discovery reachable (HTTP 200)"

  # 2. Client credentials grant (validates client secret)
  if [ -z "$HC_CLIENT_SECRET" ]; then
    echo "[HealthCheck] SKIP: KEYCLOAK_CLIENT_SECRET not set"
  else
    TOKEN_RESP=$(curl -sf -X POST \
      "$HC_URL/realms/$HC_REALM/protocol/openid-connect/token" \
      -d "grant_type=client_credentials" \
      -d "client_id=$HC_CLIENT_ID" \
      -d "client_secret=$HC_CLIENT_SECRET" 2>/dev/null)
    if echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'access_token' in d else 1)" 2>/dev/null; then
      echo "[HealthCheck] OK: Client credentials grant succeeded — secret valid"
    else
      ERR=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error_description','unknown'))" 2>/dev/null || echo "parse error")
      echo "[HealthCheck] FAIL: Client credentials grant failed — $ERR"
      exit 1
    fi
  fi

  # 3. Admin API realm check
  ADMIN_TOKEN=$(curl -sf -X POST \
    "$HC_URL/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" -d "client_id=admin-cli" \
    -d "username=$HC_ADMIN" -d "password=$HC_ADMIN_PASS" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
  if [ -n "$ADMIN_TOKEN" ]; then
    REALM_HTTP=$(curl -so /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      "$HC_URL/admin/realms/$HC_REALM" 2>/dev/null)
    [ "$REALM_HTTP" = "200" ] && echo "[HealthCheck] OK: Admin API accessible — realm '$HC_REALM' exists" \
      || echo "[HealthCheck] WARN: Admin API returned HTTP $REALM_HTTP"
  else
    echo "[HealthCheck] WARN: Could not obtain admin token — admin API check skipped"
  fi

  echo "[HealthCheck] All checks passed. Keycloak is ready for PayGate."
  exit 0
fi

# ─── Configuration ────────────────────────────────────────────────────────────
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD must be set — no default admin credentials allowed}"
REALM="${KEYCLOAK_REALM:-paygate}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-merchant-portal}"
CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-}"
PAYGATE_ADMIN_EMAIL="${PAYGATE_ADMIN_EMAIL:-admin@paygate.local}"
PAYGATE_ADMIN_PASSWORD="${PAYGATE_ADMIN_PASSWORD:?PAYGATE_ADMIN_PASSWORD must be set — no default admin credentials allowed}"
PAYGATE_ADMIN_FIRST="${PAYGATE_ADMIN_FIRST_NAME:-PayGate}"
PAYGATE_ADMIN_LAST="${PAYGATE_ADMIN_LAST_NAME:-Admin}"

# Resolve realm JSON path relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REALM_JSON="${SCRIPT_DIR}/../keycloak/paygate-realm.json"

# Auto-generate client secret if not provided
if [ -z "$CLIENT_SECRET" ]; then
  CLIENT_SECRET=$(openssl rand -hex 32)
  echo "[bootstrap] Generated KEYCLOAK_CLIENT_SECRET: $CLIENT_SECRET"
  echo "[bootstrap] Add this to your .env: KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET"
fi

# ─── Wait for Keycloak ────────────────────────────────────────────────────────
echo "[bootstrap] Waiting for Keycloak to be ready at $KEYCLOAK_URL ..."
until curl -sf "$KEYCLOAK_URL/realms/master" > /dev/null 2>&1; do
  sleep 3
done
echo "[bootstrap] Keycloak is up."

# ─── Obtain admin access token ────────────────────────────────────────────────
echo "[bootstrap] Authenticating as Keycloak admin ..."
ADMIN_TOKEN=$(curl -sf \
  -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=$KEYCLOAK_ADMIN" \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

AUTH_HEADER="Authorization: Bearer $ADMIN_TOKEN"

# ─── Mode: --import-realm ─────────────────────────────────────────────────────
if [ "$IMPORT_REALM" = true ]; then
  echo "[bootstrap] --import-realm mode: importing $REALM_JSON ..."

  if [ ! -f "$REALM_JSON" ]; then
    echo "[bootstrap] ERROR: Realm JSON not found at $REALM_JSON"
    exit 1
  fi

  # Check if realm already exists
  REALM_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "$AUTH_HEADER" \
    "$KEYCLOAK_URL/admin/realms/$REALM" || echo "404")

  if [ "$REALM_STATUS" = "200" ]; then
    echo "[bootstrap] Realm '$REALM' already exists — skipping import."
  else
    echo "[bootstrap] Importing realm from $REALM_JSON ..."
    curl -sf -X POST "$KEYCLOAK_URL/admin/realms" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d @"$REALM_JSON"
    echo "[bootstrap] Realm imported."
  fi

  # Patch the client secret (the JSON file ships without a secret)
  echo "[bootstrap] Patching client secret for '$CLIENT_ID' ..."
  EXISTING_CLIENTS=$(curl -sf \
    -H "$AUTH_HEADER" \
    "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID")
  CLIENT_UUID=$(echo "$EXISTING_CLIENTS" | python3 -c "
import sys, json
clients = json.load(sys.stdin)
print(clients[0]['id'] if clients else '')
" 2>/dev/null || echo "")

  if [ -n "$CLIENT_UUID" ]; then
    curl -sf -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"secret\": \"$CLIENT_SECRET\"}"
    echo "[bootstrap] Client secret patched."
  else
    echo "[bootstrap] WARNING: Client '$CLIENT_ID' not found after import — skipping secret patch."
  fi

  # Create the first admin user (not included in realm JSON for security)
  echo "[bootstrap] Creating admin user '$PAYGATE_ADMIN_EMAIL' ..."
  EXISTING_USERS=$(curl -sf \
    -H "$AUTH_HEADER" \
    "$KEYCLOAK_URL/admin/realms/$REALM/users?email=$PAYGATE_ADMIN_EMAIL&exact=true")
  USER_UUID=$(echo "$EXISTING_USERS" | python3 -c "
import sys, json
users = json.load(sys.stdin)
print(users[0]['id'] if users else '')
" 2>/dev/null || echo "")

  if [ -n "$USER_UUID" ]; then
    echo "[bootstrap] Admin user '$PAYGATE_ADMIN_EMAIL' already exists — skipping."
  else
    curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{
        \"username\": \"$PAYGATE_ADMIN_EMAIL\",
        \"email\": \"$PAYGATE_ADMIN_EMAIL\",
        \"firstName\": \"$PAYGATE_ADMIN_FIRST\",
        \"lastName\": \"$PAYGATE_ADMIN_LAST\",
        \"enabled\": true,
        \"emailVerified\": true,
        \"credentials\": [{
          \"type\": \"password\",
          \"value\": \"$PAYGATE_ADMIN_PASSWORD\",
          \"temporary\": false
        }]
      }"
    USER_UUID=$(curl -sf \
      -H "$AUTH_HEADER" \
      "$KEYCLOAK_URL/admin/realms/$REALM/users?email=$PAYGATE_ADMIN_EMAIL&exact=true" \
      | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'] if users else '')")
    echo "[bootstrap] Admin user created (UUID: $USER_UUID)."

    ROLE_REP=$(curl -sf \
      -H "$AUTH_HEADER" \
      "$KEYCLOAK_URL/admin/realms/$REALM/roles/paygate-admin")
    curl -sf -X POST \
      "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_UUID/role-mappings/realm" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "[$ROLE_REP]"
    echo "[bootstrap] 'paygate-admin' role assigned."

    # Enforce TOTP/MFA for the admin user.
    # CONFIGURE_TOTP is added as a required action so the user must enrol
    # in an authenticator app (Google Authenticator, Authy, etc.) on first login.
    # This cannot be skipped — the portal is inaccessible until TOTP is configured.
    echo "[bootstrap] Enforcing TOTP required action for admin user ..."
    curl -sf -X PUT \
      "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_UUID" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d '{"requiredActions": ["CONFIGURE_TOTP"]}'
    echo "[bootstrap] TOTP required action set — admin must enrol on first login."
  fi

  # Patch SMTP settings if KC_SMTP_HOST is provided
  if [ -n "${KC_SMTP_HOST:-}" ]; then
    echo "[bootstrap] Patching SMTP settings for realm '$REALM' ..."
    curl -sf -X PUT "$KEYCLOAK_URL/admin/realms/$REALM" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{
        \"smtpServer\": {
          \"host\": \"${KC_SMTP_HOST}\",
          \"port\": \"${KC_SMTP_PORT:-587}\",
          \"from\": \"${KC_SMTP_FROM:-no-reply@paygate.local}\",
          \"fromDisplayName\": \"${KC_SMTP_FROM_DISPLAY_NAME:-PayGate Identity}\",
          \"ssl\": \"${KC_SMTP_SSL:-false}\",
          \"starttls\": \"${KC_SMTP_STARTTLS:-true}\",
          \"auth\": \"${KC_SMTP_AUTH:-true}\",
          \"user\": \"${KC_SMTP_USER:-}\",
          \"password\": \"${KC_SMTP_PASSWORD:-}\"
        }
      }"
    echo "[bootstrap] SMTP configured (host: ${KC_SMTP_HOST}, port: ${KC_SMTP_PORT:-587})."
  else
    echo "[bootstrap] KC_SMTP_HOST not set — skipping SMTP configuration."
    echo "[bootstrap] Set KC_SMTP_HOST (and KC_SMTP_USER/KC_SMTP_PASSWORD) to enable email sending."
  fi

  echo ""
  echo "============================================================"
  echo " PayGate Keycloak Import Complete"
  echo "============================================================"
  echo " Realm:          $REALM"
  echo " Client ID:      $CLIENT_ID"
  echo " Client Secret:  $CLIENT_SECRET"
  echo " Admin email:    $PAYGATE_ADMIN_EMAIL"
  echo " Admin password: $PAYGATE_ADMIN_PASSWORD"
  echo ""
  echo " Add these to your portal .env:"
  echo "   KEYCLOAK_URL=$KEYCLOAK_URL"
  echo "   KEYCLOAK_REALM=$REALM"
  echo "   KEYCLOAK_CLIENT_ID=$CLIENT_ID"
  echo "   KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET"
  echo "============================================================"
  exit 0
fi

# ─── Mode: step-by-step API provisioning (default) ────────────────────────────

# Create realm
echo "[bootstrap] Checking realm '$REALM' ..."
REALM_EXISTS=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "$AUTH_HEADER" \
  "$KEYCLOAK_URL/admin/realms/$REALM" || echo "404")

if [ "$REALM_EXISTS" = "200" ]; then
  echo "[bootstrap] Realm '$REALM' already exists — skipping creation."
else
  echo "[bootstrap] Creating realm '$REALM' ..."
  curl -sf -X POST "$KEYCLOAK_URL/admin/realms" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{
      \"realm\": \"$REALM\",
      \"displayName\": \"PayGate\",
      \"enabled\": true,
      \"registrationAllowed\": false,
      \"loginWithEmailAllowed\": true,
      \"duplicateEmailsAllowed\": false,
      \"resetPasswordAllowed\": true,
      \"editUsernameAllowed\": false,
      \"bruteForceProtected\": true,
      \"permanentLockout\": false,
      \"maxFailureWaitSeconds\": 900,
      \"minimumQuickLoginWaitSeconds\": 60,
      \"waitIncrementSeconds\": 60,
      \"quickLoginCheckMilliSeconds\": 1000,
      \"maxDeltaTimeSeconds\": 43200,
      \"failureFactor\": 10,
      \"accessTokenLifespan\": 300,
      \"ssoSessionIdleTimeout\": 1800,
      \"ssoSessionMaxLifespan\": 36000,
      \"offlineSessionIdleTimeout\": 2592000,
      \"accessCodeLifespan\": 60,
      \"internationalizationEnabled\": false,
      \"defaultLocale\": \"en\"
    }"
  echo "[bootstrap] Realm '$REALM' created."
fi

# Create realm roles
for ROLE in "paygate-admin" "paygate-merchant" "paygate-consumer" "paygate-partner" "paygate-operator"; do
  ROLE_EXISTS=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "$AUTH_HEADER" \
    "$KEYCLOAK_URL/admin/realms/$REALM/roles/$ROLE" || echo "404")
  if [ "$ROLE_EXISTS" = "200" ]; then
    echo "[bootstrap] Role '$ROLE' already exists — skipping."
  else
    echo "[bootstrap] Creating role '$ROLE' ..."
    curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/roles" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"$ROLE\", \"description\": \"PayGate $ROLE role\"}"
    echo "[bootstrap] Role '$ROLE' created."
  fi
done

# Create confidential OIDC client
echo "[bootstrap] Checking client '$CLIENT_ID' ..."
EXISTING_CLIENTS=$(curl -sf \
  -H "$AUTH_HEADER" \
  "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID")
CLIENT_UUID=$(echo "$EXISTING_CLIENTS" | python3 -c "
import sys, json
clients = json.load(sys.stdin)
print(clients[0]['id'] if clients else '')
" 2>/dev/null || echo "")

CLIENT_PAYLOAD="{
  \"clientId\": \"$CLIENT_ID\",
  \"name\": \"PayGate Merchant Portal\",
  \"secret\": \"$CLIENT_SECRET\",
  \"enabled\": true,
  \"publicClient\": false,
  \"standardFlowEnabled\": true,
  \"implicitFlowEnabled\": false,
  \"directAccessGrantsEnabled\": false,
  \"serviceAccountsEnabled\": false,
  \"protocol\": \"openid-connect\",
  \"redirectUris\": [\"*\"],
  \"webOrigins\": [\"*\"],
  \"attributes\": {
    \"access.token.lifespan\": \"300\",
    \"post.logout.redirect.uris\": \"*\",
    \"backchannel.logout.session.required\": \"true\"
  }
}"

if [ -n "$CLIENT_UUID" ]; then
  echo "[bootstrap] Client '$CLIENT_ID' already exists (UUID: $CLIENT_UUID) — updating ..."
  curl -sf -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$CLIENT_PAYLOAD"
else
  echo "[bootstrap] Creating client '$CLIENT_ID' ..."
  curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$CLIENT_PAYLOAD"
  echo "[bootstrap] Client '$CLIENT_ID' created."
fi

# Create first admin user
echo "[bootstrap] Checking admin user '$PAYGATE_ADMIN_EMAIL' ..."
EXISTING_USERS=$(curl -sf \
  -H "$AUTH_HEADER" \
  "$KEYCLOAK_URL/admin/realms/$REALM/users?email=$PAYGATE_ADMIN_EMAIL&exact=true")
USER_UUID=$(echo "$EXISTING_USERS" | python3 -c "
import sys, json
users = json.load(sys.stdin)
print(users[0]['id'] if users else '')
" 2>/dev/null || echo "")

if [ -n "$USER_UUID" ]; then
  echo "[bootstrap] Admin user '$PAYGATE_ADMIN_EMAIL' already exists — skipping creation."
else
  echo "[bootstrap] Creating admin user '$PAYGATE_ADMIN_EMAIL' ..."
  curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"$PAYGATE_ADMIN_EMAIL\",
      \"email\": \"$PAYGATE_ADMIN_EMAIL\",
      \"firstName\": \"$PAYGATE_ADMIN_FIRST\",
      \"lastName\": \"$PAYGATE_ADMIN_LAST\",
      \"enabled\": true,
      \"emailVerified\": true,
      \"credentials\": [{
        \"type\": \"password\",
        \"value\": \"$PAYGATE_ADMIN_PASSWORD\",
        \"temporary\": false
      }]
    }"

  USER_UUID=$(curl -sf \
    -H "$AUTH_HEADER" \
    "$KEYCLOAK_URL/admin/realms/$REALM/users?email=$PAYGATE_ADMIN_EMAIL&exact=true" \
    | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'] if users else '')")
  echo "[bootstrap] Admin user created (UUID: $USER_UUID)."
fi

# Assign paygate-admin role to the admin user
if [ -n "$USER_UUID" ]; then
  echo "[bootstrap] Assigning 'paygate-admin' role to user ..."
  ROLE_REP=$(curl -sf \
    -H "$AUTH_HEADER" \
    "$KEYCLOAK_URL/admin/realms/$REALM/roles/paygate-admin")
  curl -sf -X POST \
    "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_UUID/role-mappings/realm" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "[$ROLE_REP]"
  echo "[bootstrap] 'paygate-admin' role assigned."
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " PayGate Keycloak Bootstrap Complete"
echo "============================================================"
echo " Realm:          $REALM"
echo " Client ID:      $CLIENT_ID"
echo " Client Secret:  $CLIENT_SECRET"
echo " Admin email:    $PAYGATE_ADMIN_EMAIL"
echo " Admin password: $PAYGATE_ADMIN_PASSWORD"
echo ""
echo " Add these to your portal .env:"
echo "   KEYCLOAK_URL=$KEYCLOAK_URL"
echo "   KEYCLOAK_REALM=$REALM"
echo "   KEYCLOAK_CLIENT_ID=$CLIENT_ID"
echo "   KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET"
echo ""
echo " Tip: Next time use --import-realm for faster idempotent provisioning:"
echo "   ./scripts/keycloak-bootstrap.sh --import-realm"
echo "============================================================"

# ─── TOTP Recovery Code Reset (Runbook) ──────────────────────────────────────
# When an admin loses their TOTP device, an operator must reset their required
# actions via the Keycloak Admin REST API. Run this function as:
#   reset_admin_totp <keycloak-user-uuid>
#
reset_admin_totp() {
  local USER_UUID="$1"
  if [ -z "$USER_UUID" ]; then
    echo "Usage: reset_admin_totp <keycloak-user-uuid>"
    return 1
  fi

  echo "[TOTP Reset] Resetting TOTP for user $USER_UUID..."

  # 1. Get a fresh admin token
  local TOKEN
  TOKEN=$(curl -sf -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password&client_id=admin-cli&username=$ADMIN_USER&password=$ADMIN_PASS" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

  # 2. Clear TOTP credentials
  local CREDS
  CREDS=$(curl -sf -H "Authorization: Bearer $TOKEN" \
    "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_UUID/credentials")
  local TOTP_ID
  TOTP_ID=$(echo "$CREDS" | python3 -c "
import sys,json
creds = json.load(sys.stdin)
for c in creds:
    if c.get('type') == 'otp':
        print(c['id'])
        break
")
  if [ -n "$TOTP_ID" ]; then
    curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
      "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_UUID/credentials/$TOTP_ID"
    echo "[TOTP Reset] OTP credential removed."
  else
    echo "[TOTP Reset] No OTP credential found — user may not have TOTP enrolled."
  fi

  # 3. Re-add CONFIGURE_TOTP required action so user must re-enrol on next login
  curl -sf -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_UUID/execute-actions-email" \
    -d '["CONFIGURE_TOTP"]' && echo "[TOTP Reset] CONFIGURE_TOTP action email sent."

  echo "[TOTP Reset] Done. User will be prompted to re-enrol TOTP on next login."
}
