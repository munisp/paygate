FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /adapter ./cmd/adapter/main.go

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /adapter .
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8100/health || exit 1
CMD ["./adapter"]
