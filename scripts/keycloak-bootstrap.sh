#!/usr/bin/env bash
# =============================================================================
# PayGate Keycloak Bootstrap Script
# =============================================================================
# Idempotently provisions the Keycloak realm, client, roles, and first admin
# user required by the PayGate Merchant Portal.
#
# Run this ONCE after Keycloak starts for the first time.
# Safe to re-run — all operations use GET-then-CREATE logic.
#
# Usage:
#   ./scripts/keycloak-bootstrap.sh
#
# Environment variables (with defaults):
#   KEYCLOAK_URL             — http://localhost:8081
#   KEYCLOAK_ADMIN           — admin
#   KEYCLOAK_ADMIN_PASSWORD  — keycloak_admin_2026
#   KEYCLOAK_REALM           — paygate
#   KEYCLOAK_CLIENT_ID       — merchant-portal
#   KEYCLOAK_CLIENT_SECRET   — (auto-generated if empty)
#   PAYGATE_ADMIN_EMAIL      — admin@paygate.local
#   PAYGATE_ADMIN_PASSWORD   — Admin@PayGate2026!
#   PAYGATE_ADMIN_FIRST_NAME — PayGate
#   PAYGATE_ADMIN_LAST_NAME  — Admin
# =============================================================================

set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-keycloak_admin_2026}"
REALM="${KEYCLOAK_REALM:-paygate}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-merchant-portal}"
CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-}"
PAYGATE_ADMIN_EMAIL="${PAYGATE_ADMIN_EMAIL:-admin@paygate.local}"
PAYGATE_ADMIN_PASSWORD="${PAYGATE_ADMIN_PASSWORD:-Admin@PayGate2026!}"
PAYGATE_ADMIN_FIRST="${PAYGATE_ADMIN_FIRST_NAME:-PayGate}"
PAYGATE_ADMIN_LAST="${PAYGATE_ADMIN_LAST_NAME:-Admin}"

# Auto-generate client secret if not provided
if [ -z "$CLIENT_SECRET" ]; then
  CLIENT_SECRET=$(openssl rand -hex 32)
  echo "[bootstrap] Generated KEYCLOAK_CLIENT_SECRET: $CLIENT_SECRET"
  echo "[bootstrap] Add this to your .env: KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET"
fi

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

# ─── Create realm ─────────────────────────────────────────────────────────────
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

# ─── Create realm roles ───────────────────────────────────────────────────────
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

# ─── Create confidential OIDC client ─────────────────────────────────────────
echo "[bootstrap] Checking client '$CLIENT_ID' ..."
EXISTING_CLIENTS=$(curl -sf \
  -H "$AUTH_HEADER" \
  "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID")
CLIENT_UUID=$(echo "$EXISTING_CLIENTS" | python3 -c "
import sys, json
clients = json.load(sys.stdin)
print(clients[0]['id'] if clients else '')
" 2>/dev/null || echo "")

if [ -n "$CLIENT_UUID" ]; then
  echo "[bootstrap] Client '$CLIENT_ID' already exists (UUID: $CLIENT_UUID) — updating secret ..."
  curl -sf -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{
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
        \"post.logout.redirect.uris\": \"*\"
      }
    }"
else
  echo "[bootstrap] Creating client '$CLIENT_ID' ..."
  curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{
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
        \"post.logout.redirect.uris\": \"*\"
      }
    }"
  echo "[bootstrap] Client '$CLIENT_ID' created."
fi

# ─── Create first admin user ──────────────────────────────────────────────────
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

  # Fetch the newly created user UUID
  USER_UUID=$(curl -sf \
    -H "$AUTH_HEADER" \
    "$KEYCLOAK_URL/admin/realms/$REALM/users?email=$PAYGATE_ADMIN_EMAIL&exact=true" \
    | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'] if users else '')")
  echo "[bootstrap] Admin user created (UUID: $USER_UUID)."
fi

# ─── Assign paygate-admin role to the admin user ──────────────────────────────
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
echo "============================================================"
