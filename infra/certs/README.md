# PayGate mTLS Certificates

This directory contains TLS certificates for mutual TLS (mTLS) between APISIX and the PayGate app server.

## Files

| File | Description |
|------|-------------|
| `ca.crt` | Root Certificate Authority certificate |
| `ca.key` | Root CA private key (KEEP SECRET) |
| `server.crt` | PayGate app server certificate |
| `server.key` | App server private key (KEEP SECRET) |
| `apisix-client.crt` | APISIX gateway client certificate |
| `apisix-client.key` | APISIX client private key (KEEP SECRET) |
| `generate-mtls-certs.sh` | Script to regenerate all certificates |

## Usage

### Generate certificates (first time or renewal)
```bash
bash infra/certs/generate-mtls-certs.sh
```

### APISIX upstream mTLS config
```yaml
upstream:
  tls:
    client_cert: |
      <contents of apisix-client.crt>
    client_key: |
      <contents of apisix-client.key>
    verify: true
    trusted_ca_cert: |
      <contents of ca.crt>
```

### Express server mTLS config
```typescript
import https from 'https';
import fs from 'fs';

const server = https.createServer({
  cert: fs.readFileSync('infra/certs/server.crt'),
  key: fs.readFileSync('infra/certs/server.key'),
  ca: fs.readFileSync('infra/certs/ca.crt'),
  requestCert: true,        // Require client cert
  rejectUnauthorized: true, // Reject if client cert is invalid
}, app);
```

## Security Notes
- Private keys (*.key) are excluded from git via .gitignore
- Certificates expire in 10 years — renew before expiry
- In production, use a proper PKI (HashiCorp Vault, cert-manager, AWS ACM)
- Rotate certificates annually as a security best practice
