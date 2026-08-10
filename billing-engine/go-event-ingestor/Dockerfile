FROM golang:1.22-bookworm AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o billing-event-ingestor ./cmd/ingestor/...

FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=builder /app/billing-event-ingestor ./
EXPOSE 8094
CMD ["./billing-event-ingestor"]
