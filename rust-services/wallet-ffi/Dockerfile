# =============================================================================
# PayGate Rust Wallet FFI (USDC payout signer) — Multi-stage Dockerfile
# Builds the Rust shared library (.so) and the wallet-ffi-server HTTP wrapper.
#
# NOTE: this crate is `wallet-ffi` (lib name `wallet_ffi`), NOT the
# `paygate-wallet-ffi` TigerBeetle ledger crate under rust/paygate-wallet-ffi.
# The artifact produced here is `libwallet_ffi.so`.
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

# Build the shared library AND the HTTP server binary (server feature).
RUN cargo build --release --lib --features server --bins

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /lib/paygate

# Copy the compiled shared library (this crate builds libwallet_ffi.so).
COPY --from=builder /app/target/release/libwallet_ffi.so ./libwallet_ffi.so

# Copy the HTTP server binary — serves GET /health, GET /ready and
# POST /v1/sign/usdc-transfer on $PORT (default 8099).
COPY --from=builder /app/target/release/wallet-ffi-server /usr/local/bin/wallet-ffi-server

# The Go bridge may also mount /lib/paygate and load the .so via cgo.
VOLUME ["/lib/paygate"]

# Run the actual HTTP server so compose/k8s healthchecks are meaningful.
# The server refuses to start without INTERNAL_API_KEY/INTERNAL_KEY configured.
CMD ["wallet-ffi-server"]
