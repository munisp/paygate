# OTEL_IMPLEMENTATION_SPEC — Platform-Wide OpenTelemetry + Alerting

Baseline recon (2026-08-25). All work in /mnt/agents/output/paygate (FUSE — re-read after every write; run heavy gates from a local-disk copy). Env-gated everywhere: instrumentation MUST no-op cleanly when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset. No mocks on production paths; fail-loud.

## 1. Tenant attribute convention (mandatory, all languages)
- Span attributes: `paygate.tenant_id`, `paygate.merchant_id` (when known), `paygate.user_id` (hashed/not raw PII — use internal id).
- Metric attributes (low-cardinality only): `tenant_tier` allowed; raw tenant_id on metrics ONLY for per-tenant SLO series gated by `OTEL_TENANT_METRICS=true`.
- Baggage: propagate `tenant_id` via W3C baggage on internal service-to-service calls.

## 2. TypeScript (Agent A)
- Extend `server/tracing.ts`: keep NodeSDK; add `OTEL_SDK_DISABLED` kill-switch; add resource attr `service.namespace=paygate`.
- NEW `server/_core/trpc.ts` middleware `telemetryMiddleware` applied to ALL procedures (public/protected/pbac): creates span `trpc.<path>` (kind SERVER), sets `paygate.tenant_id`/`merchant_id` from ctx when present, records `recordTrpcCall(path, durationMs, ok)` from server/metrics.ts on finish, sets span status on TRPCError. Must be cheap and non-blocking; wrap in try/catch that logs and re-throws original errors (never swallow).
- Wire tenant attributes helper `setTenantAttrs(span, ctx)` in server/tracing.ts (exported).
- Tests: server/tracing.test.ts or extend existing — middleware sets attributes, records metrics, passes errors through. Run vitest + tsc server gate.

## 3. Python (Agent B)
- REWRITE `python-services/shared/telemetry.py`: `setup_telemetry(service_name: str, app=None)` → TracerProvider + OTLP HTTP exporter (`{OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`); instrument FastAPIInstrumentor (if app is FastAPI), FlaskInstrumentor (Flask), RequestsInstrumentor, and best-effort Redis/Kafka/psycopg instrumentors behind try/except ImportError (never fail startup). Keep `_NoOpTracer` fallback. Add `set_tenant_context(tenant_id, merchant_id)` helper attaching attrs to current span.
- WIRE into ALL 52 services (47 FastAPI, 6 Flask): each service's main.py — `from shared.telemetry import setup_telemetry` (path shim as services already do for shared imports) + call right after app creation. Mechanical, uniform.
- Add opentelemetry pins to `python-services/shared/requirements.txt`: opentelemetry-sdk, opentelemetry-exporter-otlp-proto-http, opentelemetry-instrumentation-fastapi, -flask, -requests, -redis.
- Gate: `python3 -m py_compile` on every touched main.py (all 53) must pass.

## 4. Go (Agent C)
- REPLACE `go-bridge/internal/telemetry/telemetry.go` logging stub with real OTel SDK: `go.opentelemetry.io/otel`, `sdk/trace`, `exporters/otlp/otlptrace/otlptracehttp`, `otelhttp` middleware; `Init(ctx, serviceName)` env-gated (no-op + passthrough middleware when endpoint unset); `TenantAttrs(tenantID, merchantID)` helper. Vendor the new deps (`go mod tidy && go mod vendor`).
- Mount in `go-bridge/cmd/bridge/main.go`: wrap mux with telemetry middleware BEFORE authMiddleware; set service.name=paygate-bridge.
- Temporal: add `go.temporal.io/sdk/contrib/opentelemetry` interceptor in `go-bridge/internal/temporal/client.go` (tracing interceptor on client options, env-gated).
- go-services (cips-gateway, liveness-gateway, mojaloop-fspiop-adapter, pbac-engine, pix-gateway, upi-gateway — separate modules): add the same telemetry package (copy file into each `internal/telemetry/`) + mount otelhttp-style middleware on their root mux. Each has its own go.mod — add OTel deps per module.
- Gate: `cp -r` each module to /tmp and `go build ./...` there (FUSE readdirent breaks on-mount builds). EXIT=0 required.

## 5. Rust (Agent D)
- For the 5 services already using tracing (cross-border-fraud-engine, crypto-guard, inventory-engine, kyc-ocr-engine, liveness-signal-processor) PLUS tigerbeetle-ledger, credit-scoring, velocity-counter, loyalty-ledger, billing-engine, insider-threat-engine, tigerbeetle-recon: add `opentelemetry`, `opentelemetry-otlp`, `tracing-opentelemetry` to Cargo.toml; add `src/telemetry.rs` with `init_tracing(service_name)` (env-gated: OTLP exporter when OTEL_EXPORTER_OTLP_ENDPOINT set, else fmt layer only); call in main.rs first line.
- Gate: `cargo check` from a local-disk copy. If the sandbox cannot fetch crates (no network to crates.io), vendor decision: implement code correctly, run `cargo check --offline` if lockfile allows, otherwise document env-blocked with exact error — do NOT claim pass.

## 6. Collector + middleware infra (Agent E)
- CONSOLIDATE to single config `infra/otel-collector/otel-collector.yml` (tempo-oriented one wins). Add:
  - Receivers: `kafkametrics` (brokers kafka-1:9092), `postgresql` (paygate_monitor), `redis` (redis:6379), `prometheus` scrape jobs for: keycloak:8080/metrics, permify:3476/metrics, apisix:9091, opensearch:9600, openappsec:8090, temporal:8000, spark:4040, trino:8080 (jmx/prom exporter endpoints as configured), tigerbeetle stats via tigerbeetle-ledger /metrics.
  - Logs pipeline: `filelog` receiver (/var/log/paygate/*.log) → `loki` exporter (loki:3100).
  - Processors: keep memory_limiter/filter/resource/batch; ADD `attributes/tenant` processor upserting deployment env; group-by-tenant NOT default (cardinality).
  - Exporters: otlp/tempo, prometheus:8889, loki. Update pipelines traces+metrics+logs.
- `infra/docker-compose.observability.yml`: add tempo, loki, promtail, novu (novu api+worker+ws+mongodb+redis — images novuhq/novu latest pinned), keep alertmanager; add standalone `infra/alertmanager/alertmanager.yml` (SMTP receivers paygate-ops/paygate-critical + NEW webhook receiver `novu-bridge` → push-service:8090/alerts/webhook with tenant grouping).
- `infra/prometheus/prometheus.yml`: also load `alert-rules.yaml` (merge rules into paygate-alerts.yml if simpler — keep both rule_files entries); remove duplicate wave79 jobs.
- APISIX: add `opentelemetry` plugin to global rules in infra/apisix/config.yaml (sampler 0.1, collector otel-collector:4318).
- Keycloak: document + set env in compose: KC_TRACING_ENABLED=true, KC_TRACING_ENDPOINT=http://otel-collector:4318/v1/traces (Keycloak 25+).
- Dapr: infra/dapr configuration.yaml zipkin/otel endpoint → otel-collector.
- Gate: YAML lint all touched files (python yaml.safe_load each), `docker compose config -q` if docker available, else lint-only.

## 7. Novu alert bridge (Agent F)
- Extend `python-services/push-service/main.py`: NEW `POST /alerts/webhook` (X-Internal-Key auth) — accepts Alertmanager v4 payload, resolves tenant from alert labels, dispatches via Novu REST API (`NOVU_API_KEY`, `NOVU_API_URL` env, default http://novu-api:3000) triggering workflow `paygate-alert` to tenant subscribers; fail-loud 502 if Novu unreachable; record metric `paygate_alert_dispatch_total{channel,severity}`. NO fabricated delivery.
- NEW tRPC router `server/routers/alertSubscriptions.ts`: merchant-scoped (`resolveMerchantId` pattern from crud119.ts:110) — `list`, `subscribe` (channels email/sms/in-app, severities), `unsubscribe`; table `alert_subscriptions` in drizzle/schema.ts + migration `drizzle/0093_alert_subscriptions.sql` (idempotent); register router in server/routers.ts; tests (vi.mock pattern like hostedCheckout.test.ts); vitest + tsc gates.
- Push-service py_compile gate; Novu subscriber sync: on subscribe, call Novu subscribers API (fail-loud, idempotent by merchantId).

## Cross-cutting
- Every agent: verify writes (re-read files), run own gates, report file:line + gate EXIT codes. No test weakening. Follow existing code style.
