FROM rust:1.77-alpine AS builder
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
# Cache dependencies
RUN mkdir src && echo "fn main(){}" > src/main.rs && echo "" > src/lib.rs
RUN cargo build --release 2>/dev/null || true
COPY src ./src
RUN touch src/main.rs src/lib.rs && cargo build --release

FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/target/release/crypto-guard /crypto-guard
EXPOSE 8091
ENTRYPOINT ["/crypto-guard"]
