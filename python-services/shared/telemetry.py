"""
PayGate Python Services — OpenTelemetry Setup
=============================================
Provides a single `setup_telemetry(service_name)` function that initialises
the OpenTelemetry SDK with OTLP HTTP exporter when OTEL_EXPORTER_OTLP_ENDPOINT
is set. Falls back to a no-op tracer when the env var is absent.

Usage in each service's main.py:
    from shared.telemetry import setup_telemetry, get_tracer
    setup_telemetry("cashback-rewards")
    tracer = get_tracer()

    @app.route("/cashback/calculate")
    def calculate():
        with tracer.start_as_current_span("cashback.calculate") as span:
            span.set_attribute("user.id", user_id)
            ...
"""

import os
import logging
from typing import Optional

logger = logging.getLogger("paygate.telemetry")

_tracer = None


def setup_telemetry(service_name: str) -> None:
    """
    Initialise OpenTelemetry tracing for the given service.
    No-ops gracefully if the SDK is not installed or endpoint is not configured.
    """
    global _tracer

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if not endpoint:
        logger.info(f"[otel] tracing disabled for {service_name} — set OTEL_EXPORTER_OTLP_ENDPOINT to enable")
        _tracer = _NoOpTracer()
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.flask import FlaskInstrumentor
        from opentelemetry.instrumentation.requests import RequestsInstrumentor

        # Build resource
        resource = Resource(attributes={
            SERVICE_NAME: service_name,
            "deployment.environment": os.getenv("NODE_ENV", "production"),
            "service.version": os.getenv("SERVICE_VERSION", "1.0.0"),
        })

        # Build provider with OTLP exporter
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(
            endpoint=f"{endpoint}/v1/traces",
            headers={},
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        # Auto-instrument Flask and requests
        FlaskInstrumentor().instrument()
        RequestsInstrumentor().instrument()

        _tracer = trace.get_tracer(service_name)
        logger.info(f"[otel] tracing enabled for {service_name} → {endpoint}")

    except ImportError:
        logger.warning(
            f"[otel] opentelemetry SDK not installed for {service_name}. "
            "Install: pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http "
            "opentelemetry-instrumentation-flask opentelemetry-instrumentation-requests"
        )
        _tracer = _NoOpTracer()
    except Exception as exc:
        logger.warning(f"[otel] failed to initialise tracing for {service_name}: {exc}")
        _tracer = _NoOpTracer()


def get_tracer():
    """Return the configured tracer (or a no-op tracer if not initialised)."""
    global _tracer
    if _tracer is None:
        _tracer = _NoOpTracer()
    return _tracer


class _NoOpSpan:
    """No-op span context manager."""
    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def set_attribute(self, key: str, value) -> None:
        pass

    def set_status(self, status) -> None:
        pass

    def record_exception(self, exc) -> None:
        pass


class _NoOpTracer:
    """No-op tracer that satisfies the tracer interface without any overhead."""
    def start_as_current_span(self, name: str, **kwargs):
        return _NoOpSpan()

    def start_span(self, name: str, **kwargs):
        return _NoOpSpan()
