# =============================================================================
# PayGate Go Bridge — Multi-stage Dockerfile
# =============================================================================

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
# Use Debian (not Alpine) because TigerBeetle requires glibc for its CGO bindings.
FROM golang:1.22-bookworm AS builder

# Install CGO build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libc6-dev ca-certificates tzdata git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy go.mod and go.sum first for layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build the bridge binary (CGO required for TigerBeetle)
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.Version=$(git describe --tags --always --dirty 2>/dev/null || echo dev)" \
    -o /app/bridge \
    ./cmd/bridge

# Build the reconciler binary
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /app/reconciler \
    ./cmd/reconciler

# ─── Stage 2: Bridge Runtime ──────────────────────────────────────────────────
FROM debian:bookworm-slim AS bridge

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libc6 wget \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd -u 1000 -m -s /bin/sh paygate

COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /app/bridge /bridge

USER paygate

# Expose HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/bridge"]

# ─── Stage 3: Reconciler Runtime ──────────────────────────────────────────────
# Build with: docker build --target reconciler -t your-registry/paygate-reconciler:latest .
FROM debian:bookworm-slim AS reconciler

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libc6 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -u 1000 -m -s /bin/sh paygate

COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /app/reconciler /reconciler

USER paygate

ENTRYPOINT ["/reconciler"]
