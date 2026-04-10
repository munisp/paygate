# ── Build stage ──────────────────────────────────────────────────────────────
FROM rust:1.78-slim-bookworm AS builder

# Install system dependencies for rdkafka cmake build
RUN apt-get update && apt-get install -y \
    cmake \
    libssl-dev \
    pkg-config \
    libsasl2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml ./
# Pre-fetch dependencies for layer caching
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo fetch
COPY src ./src
RUN cargo build --release

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libssl3 \
    libsasl2-2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/tigerbeetle-recon .

ENV RUST_LOG=info
ENV RECON_INTERVAL_SECS=300
ENV RECON_TOLERANCE_KOBO=100

ENTRYPOINT ["./tigerbeetle-recon"]
