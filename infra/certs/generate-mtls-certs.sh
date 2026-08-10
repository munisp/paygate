#!/bin/bash
# PayGate mTLS Certificate Generation Script
# Generates self-signed CA, server cert, and client cert for APISIX mTLS

set -e
CERTS_DIR="$(cd "$(dirname "$0")" && pwd)"
DAYS=3650
COUNTRY="NG"
ORG="PayGate Financial Services"
CN_CA="PayGate Internal CA"
CN_SERVER="paygate-app-server"
CN_CLIENT="apisix-gateway"

echo "=== Generating PayGate mTLS Certificates ==="

# 1. Generate CA key and cert
openssl genrsa -out "$CERTS_DIR/ca.key" 4096
openssl req -new -x509 -days $DAYS -key "$CERTS_DIR/ca.key" \
  -out "$CERTS_DIR/ca.crt" \
  -subj "/C=$COUNTRY/O=$ORG/CN=$CN_CA"
echo "✓ CA certificate generated"

# 2. Generate server key and CSR
openssl genrsa -out "$CERTS_DIR/server.key" 2048
openssl req -new -key "$CERTS_DIR/server.key" \
  -out "$CERTS_DIR/server.csr" \
  -subj "/C=$COUNTRY/O=$ORG/CN=$CN_SERVER"

# Server cert with SAN
cat > "$CERTS_DIR/server-ext.cnf" << EOF
[req]
req_extensions = v3_req
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = paygate-app
DNS.2 = localhost
IP.1 = 127.0.0.1
IP.2 = 172.20.0.10
EOF

openssl x509 -req -days $DAYS \
  -in "$CERTS_DIR/server.csr" \
  -CA "$CERTS_DIR/ca.crt" \
  -CAkey "$CERTS_DIR/ca.key" \
  -CAcreateserial \
  -out "$CERTS_DIR/server.crt" \
  -extfile "$CERTS_DIR/server-ext.cnf" \
  -extensions v3_req
echo "✓ Server certificate generated"

# 3. Generate APISIX client key and CSR
openssl genrsa -out "$CERTS_DIR/apisix-client.key" 2048
openssl req -new -key "$CERTS_DIR/apisix-client.key" \
  -out "$CERTS_DIR/apisix-client.csr" \
  -subj "/C=$COUNTRY/O=$ORG/CN=$CN_CLIENT"
openssl x509 -req -days $DAYS \
  -in "$CERTS_DIR/apisix-client.csr" \
  -CA "$CERTS_DIR/ca.crt" \
  -CAkey "$CERTS_DIR/ca.key" \
  -CAcreateserial \
  -out "$CERTS_DIR/apisix-client.crt"
echo "✓ APISIX client certificate generated"

# 4. Verify
echo ""
echo "=== Certificate Summary ==="
openssl x509 -in "$CERTS_DIR/ca.crt" -noout -subject -dates
openssl x509 -in "$CERTS_DIR/server.crt" -noout -subject -dates
openssl x509 -in "$CERTS_DIR/apisix-client.crt" -noout -subject -dates

echo ""
echo "=== Files Generated ==="
ls -la "$CERTS_DIR"/*.{key,crt,csr} 2>/dev/null

echo ""
echo "✅ mTLS certificates generated successfully"
echo "   Add to .gitignore: infra/certs/*.key infra/certs/*.crt infra/certs/*.csr"
