FROM golang:1.22-bookworm AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o billing-audit-rbac ./cmd/audit/...

FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=builder /app/billing-audit-rbac ./
EXPOSE 8096
CMD ["./billing-audit-rbac"]
