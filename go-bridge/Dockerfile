# =============================================================================
# PayGate Go Bridge — Multi-stage Dockerfile
# =============================================================================

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Copy go.mod and go.sum first for layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build the binary with optimisations
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.Version=$(git describe --tags --always --dirty 2>/dev/null || echo dev)" \
    -o /app/bridge \
    ./cmd/bridge

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM scratch

# Import CA certificates and timezone data from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy binary
COPY --from=builder /app/bridge /bridge

# Non-root user (UID 65534 = nobody)
USER 65534:65534

# Expose HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/bridge", "-healthcheck"]

ENTRYPOINT ["/bridge"]
