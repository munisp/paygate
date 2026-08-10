FROM rust:1.75-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm src/main.rs
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/target/release/cross-border-fraud-engine .
EXPOSE 8500
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8500/health || exit 1
CMD ["./cross-border-fraud-engine"]
