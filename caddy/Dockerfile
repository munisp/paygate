# =============================================================================
# PayGate Caddy — Custom Build with Required Plugins
# =============================================================================
FROM caddy:2.9-builder AS builder

RUN xcaddy build \
    --with github.com/greenpau/caddy-security@v1.1.28 \
    --with github.com/mholt/caddy-l4@v0.0.0-20241209172512-4b8f824e2d24 \
    --with github.com/caddy-dns/cloudflare@v0.0.0-20240703190432-89f16b99c18e \
    --with github.com/mholt/caddy-ratelimit@v0.0.0-20220811233237-2f9a6f2c2f0d \
    --with github.com/caddyserver/cache-handler@v0.14.0

FROM caddy:2.9-alpine

# Copy custom Caddy binary with plugins
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Create log directories
RUN mkdir -p /var/log/caddy /etc/caddy/certs /data/caddy /config/caddy

# Copy Caddyfile and configs
COPY Caddyfile /etc/caddy/Caddyfile
COPY config/ /etc/caddy/config/

# ZeroSSL root cert (for ACME)
RUN wget -q -O /etc/caddy/certs/zerossl-root.pem \
    https://crt.sh/?d=1199354 || true

EXPOSE 80 443 443/udp 2019 3001 5433 6380 9093

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD caddy validate --config /etc/caddy/Caddyfile || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
