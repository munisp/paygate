# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM rust:1.78-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src

COPY src ./src
RUN touch src/main.rs && cargo build --release

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/loyalty-ledger /usr/local/bin/loyalty-ledger

RUN useradd -r -s /bin/false appuser
USER appuser

EXPOSE 8092

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8092/health || exit 1

ENV PORT=8092
ENV RUST_LOG=loyalty_ledger=info

ENTRYPOINT ["/usr/local/bin/loyalty-ledger"]
