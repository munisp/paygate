#!/bin/bash
# PayGate mTLS Certificate Generation Script
# Usage: ./generate-certs.sh [validity_days]
set -e
DAYS=${1:-3650}
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Generating PayGate mTLS certificates (validity: $DAYS days)..."

# CA
openssl genrsa -out "$DIR/ca.key" 4096 2>/dev/null
openssl req -new -x509 -days $DAYS -key "$DIR/ca.key" -out "$DIR/ca.crt" \
  -subj "/CN=PayGate Internal CA/O=PayGate Financial Services/C=NG" 2>/dev/null

# Server cert
openssl genrsa -out "$DIR/server.key" 4096 2>/dev/null
openssl req -new -key "$DIR/server.key" -out "$DIR/server.csr" \
  -subj "/CN=paygate-app-server/O=PayGate Financial Services/C=NG" 2>/dev/null
openssl x509 -req -days $DAYS -in "$DIR/server.csr" -CA "$DIR/ca.crt" -CAkey "$DIR/ca.key" \
  -CAcreateserial -out "$DIR/server.crt" 2>/dev/null

# Client cert (APISIX)
openssl genrsa -out "$DIR/client.key" 4096 2>/dev/null
openssl req -new -key "$DIR/client.key" -out "$DIR/client.csr" \
  -subj "/CN=apisix-gateway/O=PayGate Financial Services/C=NG" 2>/dev/null
openssl x509 -req -days $DAYS -in "$DIR/client.csr" -CA "$DIR/ca.crt" -CAkey "$DIR/ca.key" \
  -CAcreateserial -out "$DIR/client.crt" 2>/dev/null

echo "✓ Certificates generated in $DIR"
