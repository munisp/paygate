/**
 * PayGate OpenTelemetry Tracing Setup
 *
 * Initialises OpenTelemetry SDK with OTLP exporter.
 * Import this module at the very top of server/_core/index.ts
 * BEFORE any other imports to ensure instrumentation is applied.
 *
 * Environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP collector endpoint (default: disabled)
 *   OTEL_SERVICE_NAME            — Service name (default: paygate-portal)
 *   OTEL_SAMPLING_RATE           — Sampling rate 0.0–1.0 (default: 0.1 in prod, 1.0 in dev)
 *   OTEL_SDK_DISABLED            — Kill-switch: "true" disables the SDK even when
 *                                  OTEL_EXPORTER_OTLP_ENDPOINT is set
 *
 * Usage in server/_core/index.ts:
 *   import "./tracing"; // Must be first import
 */

const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const SDK_DISABLED = process.env.OTEL_SDK_DISABLED === "true";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "paygate-portal";
const IS_PROD = process.env.NODE_ENV === "production";
const SAMPLING_RATE = parseFloat(process.env.OTEL_SAMPLING_RATE ?? (IS_PROD ? "0.1" : "1.0"));

if (!OTLP_ENDPOINT || SDK_DISABLED) {
  // Tracing disabled — no-op
} else {
  // Dynamic import to avoid hard dependency when OTEL is not configured
  (async () => {
    try {
      const { NodeSDK } = await import("@opentelemetry/sdk-node" as any);
      const { OTLPTraceExporter } = await import(
        "@opentelemetry/exporter-trace-otlp-http" as any
      );
      const { Resource } = await import("@opentelemetry/resources" as any);
      const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } = await import(
        "@opentelemetry/semantic-conventions" as any
      );
      const { TraceIdRatioBasedSampler } = await import(
        "@opentelemetry/sdk-trace-base" as any
      );
      const { getNodeAutoInstrumentations } = await import(
        "@opentelemetry/auto-instrumentations-node" as any
      );

      const sdk = new NodeSDK({
        resource: new Resource({
          [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
          [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version ?? "0.0.0",
          "service.namespace": "paygate",
          "deployment.environment": process.env.NODE_ENV ?? "development",
        }),
        traceExporter: new OTLPTraceExporter({
          url: `${OTLP_ENDPOINT}/v1/traces`,
          headers: {},
        }),
        sampler: new TraceIdRatioBasedSampler(SAMPLING_RATE),
        instrumentations: [
          getNodeAutoInstrumentations({
            "@opentelemetry/instrumentation-http": { enabled: true },
            "@opentelemetry/instrumentation-express": { enabled: true },
            "@opentelemetry/instrumentation-pg": { enabled: true },
            "@opentelemetry/instrumentation-ioredis": { enabled: true },
            "@opentelemetry/instrumentation-dns": { enabled: false },
            "@opentelemetry/instrumentation-net": { enabled: false },
          }),
        ],
      });

      sdk.start();
      console.info(`[otel] tracing initialised — service=${SERVICE_NAME} endpoint=${OTLP_ENDPOINT} sampling=${SAMPLING_RATE}`);

      process.on("SIGTERM", () => {
        sdk.shutdown().catch((err: unknown) => console.error("[otel] shutdown error:", err));
      });
    } catch (err) {
      console.warn("[otel] tracing not available — install @opentelemetry/sdk-node to enable");
    }
  })();
}

/**
 * Set the standard PayGate tenant attributes on a span when they are known.
 *
 * Attribute convention (OTEL_IMPLEMENTATION_SPEC §1):
 *   paygate.tenant_id    — internal tenant id
 *   paygate.merchant_id  — internal merchant id
 *   paygate.user_id      — internal user id (never raw PII)
 *
 * Values are read from ctx (tenantId / merchantId) with a fallback to
 * ctx.user.tenantId. Never throws — telemetry must not break requests.
 */
export function setTenantAttrs(span: unknown, ctx: unknown): void {
  try {
    if (!span || typeof (span as { setAttribute?: unknown }).setAttribute !== "function") return;
    const c = (ctx ?? {}) as {
      tenantId?: string | number | null;
      merchantId?: string | number | null;
      user?: { id?: string | number | null; tenantId?: string | number | null } | null;
    };
    const s = span as { setAttribute: (key: string, value: string) => void };
    const tenantId = c.tenantId ?? c.user?.tenantId;
    if (tenantId !== undefined && tenantId !== null) {
      s.setAttribute("paygate.tenant_id", String(tenantId));
    }
    if (c.merchantId !== undefined && c.merchantId !== null) {
      s.setAttribute("paygate.merchant_id", String(c.merchantId));
    }
    if (c.user?.id !== undefined && c.user?.id !== null) {
      s.setAttribute("paygate.user_id", String(c.user.id));
    }
  } catch (err) {
    console.warn("[otel] setTenantAttrs failed:", err instanceof Error ? err.message : err);
  }
}
