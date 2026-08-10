# ── Build stage ──────────────────────────────────────────────────────────────
FROM rust:1.79-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
# Cache dependencies
RUN mkdir src && echo "fn main(){}" > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/liveness-signal-processor /usr/local/bin/
ENV RUST_LOG=liveness_signal_processor=info,tower_http=warn
ENV PORT=8090
EXPOSE 8090
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s \
  CMD curl -sf http://localhost:8090/health || exit 1
CMD ["liveness-signal-processor"]
