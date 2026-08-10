FROM rust:1.78-slim AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/velocity-counter /usr/local/bin/velocity-counter
EXPOSE 8090
ENV RUST_LOG=info
CMD ["velocity-counter"]
