#!/usr/bin/env bash
# keycloak-realm-backup.sh — Nightly Keycloak realm export → S3 (Wave 133)
#
# Usage:
#   ./scripts/keycloak-realm-backup.sh
#
# Required environment variables:
#   KEYCLOAK_URL            — Keycloak base URL (e.g. http://keycloak:8080)
#   KEYCLOAK_REALM          — Realm name to export (default: paygate)
#   KEYCLOAK_ADMIN_USER     — Admin username (default: admin)
#   KEYCLOAK_ADMIN_PASSWORD — Admin password
#   AWS_S3_BACKUP_BUCKET    — S3 bucket for backups (e.g. s3://paygate-backups)
#   AWS_DEFAULT_REGION      — AWS region (default: us-east-1)
#
# Optional:
#   BACKUP_RETENTION_DAYS   — Delete backups older than N days (default: 30)
#   BACKUP_DIR              — Local temp directory (default: /tmp/kc-backup)

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────
KC_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
KC_REALM="${KEYCLOAK_REALM:-paygate}"
KC_ADMIN="${KEYCLOAK_ADMIN_USER:-admin}"
KC_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"
S3_BUCKET="${AWS_S3_BACKUP_BUCKET:-}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/kc-backup}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="${BACKUP_DIR}/realm-${KC_REALM}-${TIMESTAMP}.json"
BACKUP_KEY="keycloak-backups/realm-${KC_REALM}-${TIMESTAMP}.json"

mkdir -p "${BACKUP_DIR}"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

# ─── Step 1: Obtain admin access token ────────────────────────────────────────
log "Obtaining Keycloak admin token from ${KC_URL}..."
TOKEN_RESPONSE=$(curl -sf \
  -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=${KC_ADMIN}" \
  -d "password=${KC_PASS}")

ACCESS_TOKEN=$(echo "${TOKEN_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
if [ -z "${ACCESS_TOKEN}" ]; then
  log "ERROR: Failed to obtain admin token"
  exit 1
fi
log "Admin token obtained"

# ─── Step 2: Export realm ─────────────────────────────────────────────────────
log "Exporting realm '${KC_REALM}' to ${BACKUP_FILE}..."
HTTP_STATUS=$(curl -sf \
  -o "${BACKUP_FILE}" \
  -w "%{http_code}" \
  -X GET "${KC_URL}/admin/realms/${KC_REALM}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Accept: application/json")

if [ "${HTTP_STATUS}" != "200" ]; then
  log "ERROR: Realm export returned HTTP ${HTTP_STATUS}"
  exit 1
fi

BACKUP_SIZE=$(wc -c < "${BACKUP_FILE}")
log "Realm exported: ${BACKUP_SIZE} bytes"

# ─── Step 3: Validate JSON ────────────────────────────────────────────────────
python3 -c "import json,sys; json.load(open('${BACKUP_FILE}')); print('JSON valid')" || {
  log "ERROR: Exported file is not valid JSON"
  exit 1
}

# ─── Step 4: Upload to S3 ─────────────────────────────────────────────────────
if [ -n "${S3_BUCKET}" ]; then
  log "Uploading to ${S3_BUCKET}/${BACKUP_KEY}..."
  aws s3 cp "${BACKUP_FILE}" "${S3_BUCKET}/${BACKUP_KEY}" \
    --region "${AWS_DEFAULT_REGION:-us-east-1}" \
    --storage-class STANDARD_IA
  log "Upload complete"

  # ─── Step 5: Enforce retention ────────────────────────────────────────────
  log "Enforcing ${RETENTION_DAYS}-day retention policy..."
  CUTOFF=$(date -u -d "${RETENTION_DAYS} days ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
           date -u -v-${RETENTION_DAYS}d +"%Y-%m-%dT%H:%M:%SZ")

  aws s3api list-objects-v2 \
    --bucket "$(echo ${S3_BUCKET} | sed 's|s3://||')" \
    --prefix "keycloak-backups/" \
    --query "Contents[?LastModified<='${CUTOFF}'].Key" \
    --output text 2>/dev/null | tr '\t' '\n' | while read -r key; do
    if [ -n "${key}" ] && [ "${key}" != "None" ]; then
      log "Deleting old backup: ${key}"
      aws s3 rm "${S3_BUCKET}/${key}"
    fi
  done
  log "Retention enforcement complete"
else
  log "WARNING: AWS_S3_BACKUP_BUCKET not set — backup saved locally only: ${BACKUP_FILE}"
fi

# ─── Step 6: Write latest-backup metadata ─────────────────────────────────────
METADATA_FILE="${BACKUP_DIR}/latest-backup.json"
cat > "${METADATA_FILE}" << METADATA
{
  "realm": "${KC_REALM}",
  "timestamp": "${TIMESTAMP}",
  "size_bytes": ${BACKUP_SIZE},
  "s3_key": "${BACKUP_KEY}",
  "local_path": "${BACKUP_FILE}"
}
METADATA

log "Backup complete: ${BACKUP_KEY} (${BACKUP_SIZE} bytes)"
exit 0
