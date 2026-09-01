//! OpenTelemetry tracing initialisation.
//!
//! Env-gated (OTEL_IMPLEMENTATION_SPEC §5): when `OTEL_EXPORTER_OTLP_ENDPOINT`
//! is set, an OTLP tonic/gRPC span exporter layer is installed alongside the
//! fmt layer; otherwise only the fmt layer is active. Never panics — any
//! exporter/subscriber error falls back to fmt-only logging.

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Initialise the global tracing subscriber for `service_name`.
///
/// Safe to call once at startup; subsequent calls are no-ops.
pub fn init_tracing(service_name: &str) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let fmt_layer = tracing_subscriber::fmt::layer();

    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").unwrap_or_default();
    let otlp_layer = if endpoint.is_empty() {
        None
    } else {
        match build_otlp_layer(service_name, &endpoint) {
            Some(layer) => Some(layer),
            None => {
                eprintln!(
                    "telemetry: failed to build OTLP exporter for {endpoint}; continuing with fmt-only tracing"
                );
                None
            }
        }
    };

    // `try_init` so we never panic if a subscriber is already set.
    // OTLP layer is applied directly on the Registry so its `Layer<Registry>`
    // impl lines up; EnvFilter and fmt compose on top of any subscriber.
    let _ = tracing_subscriber::registry()
        .with(otlp_layer)
        .with(filter)
        .with(fmt_layer)
        .try_init();
}

fn build_otlp_layer(
    service_name: &str,
    endpoint: &str,
) -> Option<
    tracing_opentelemetry::OpenTelemetryLayer<
        tracing_subscriber::Registry,
        opentelemetry_sdk::trace::Tracer,
    >,
> {
    use opentelemetry::trace::TracerProvider as _;
    use opentelemetry::KeyValue;
    use opentelemetry_otlp::WithExportConfig;

    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint.to_string())
        .build()
        .ok()?;

    let provider = opentelemetry_sdk::trace::TracerProvider::builder()
        .with_batch_exporter(exporter, opentelemetry_sdk::runtime::Tokio)
        .with_resource(opentelemetry_sdk::Resource::new(vec![KeyValue::new(
            "service.name",
            service_name.to_string(),
        )]))
        .build();

    let tracer = provider.tracer(service_name.to_string());
    opentelemetry::global::set_tracer_provider(provider);

    Some(tracing_opentelemetry::layer().with_tracer(tracer))
}
