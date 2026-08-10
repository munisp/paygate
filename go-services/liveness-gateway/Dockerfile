# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o liveness-gateway ./cmd/main.go

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/liveness-gateway /liveness-gateway
ENV PORT=8085
EXPOSE 8085
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s \
  CMD ["/liveness-gateway", "-health"]
ENTRYPOINT ["/liveness-gateway"]
