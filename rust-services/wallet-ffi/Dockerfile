# =============================================================================
# PayGate Rust Wallet FFI — Multi-stage Dockerfile
# Builds the Rust shared library (.so) and packages it for use by the Go bridge
# =============================================================================

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM rust:1.78-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Cargo manifests first for layer caching
COPY Cargo.toml Cargo.lock ./
COPY src ./src

# Build release binary
RUN cargo build --release --lib

# ─── Stage 2: Runtime artifact ────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /lib/paygate

# Copy the compiled shared library
COPY --from=builder /app/target/release/libpaygate_wallet_ffi.so ./libpaygate_wallet_ffi.so
COPY --from=builder /app/target/release/libpaygate_wallet_ffi.a ./libpaygate_wallet_ffi.a

# The Go bridge mounts /lib/paygate and loads the .so at runtime
VOLUME ["/lib/paygate"]

CMD ["sh", "-c", "echo 'Rust FFI library ready at /lib/paygate' && sleep infinity"]
