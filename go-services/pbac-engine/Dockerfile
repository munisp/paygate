FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o pbac-engine ./cmd/server

FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/pbac-engine /pbac-engine
EXPOSE 8090
ENTRYPOINT ["/pbac-engine"]
