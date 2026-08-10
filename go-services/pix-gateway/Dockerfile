FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /gateway ./cmd/gateway/main.go

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /gateway .
EXPOSE 8400
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8400/health || exit 1
CMD ["./gateway"]
