"""
PayGate Python Services — OpenTelemetry Setup
=============================================
Provides a single `setup_telemetry(service_name, app=None)` function that
initialises the OpenTelemetry SDK with an OTLP HTTP exporter
(`{OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`). No-ops cleanly when the env var
is absent. Instrumentation failures NEVER fail service startup.

Usage in each service's main.py (right after app creation):
    from shared.telemetry import setup_telemetry
    setup_telemetry("cashback-rewards", app)

Tenant context on the active span:
    from shared.telemetry import set_tenant_context
    set_tenant_context(tenant_id="t-123", merchant_id="m-456")
"""

import logging
import os
from typing import Optional

logger = logging.getLogger("paygate.telemetry")

_tracer = None


def setup_telemetry(service_name: str, app=None) -> None:
    """
    Initialise OpenTelemetry tracing for the given service.
    No-ops gracefully if the endpoint is not configured or the SDK is missing.
    Never raises: service startup must not depend on telemetry.
    """
    global _tracer

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").rstrip("/")
    if not endpoint:
        logger.info(
            "[otel] tracing disabled for %s — set OTEL_EXPORTER_OTLP_ENDPOINT to enable",
            service_name,
        )
        _tracer = _NoOpTracer()
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource(attributes={
            SERVICE_NAME: service_name,
            "service.namespace": "paygate",
            "deployment.environment": os.getenv("NODE_ENV", os.getenv("APP_ENV", "production")),
            "service.version": os.getenv("SERVICE_VERSION", "1.0.0"),
        })

        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces")
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        # Framework instrumentation (app-aware).
        if app is not None:
            _instrument_app(app)

        # RequestsInstrumentor always (outbound HTTP).
        try:
            from opentelemetry.instrumentation.requests import RequestsInstrumentor
            RequestsInstrumentor().instrument()
        except ImportError:
            logger.debug("[otel] requests instrumentation not installed for %s", service_name)
        except Exception as exc:
            logger.warning("[otel] requests instrumentation failed for %s: %s", service_name, exc)

        # Best-effort optional instrumentors — never fail startup.
        _instrument_optional(service_name)

        _tracer = trace.get_tracer(service_name)
        logger.info("[otel] tracing enabled for %s → %s", service_name, endpoint)

    except ImportError:
        logger.warning(
            "[otel] opentelemetry SDK not installed for %s. "
            "Install: pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http "
            "opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-flask "
            "opentelemetry-instrumentation-requests",
            service_name,
        )
        _tracer = _NoOpTracer()
    except Exception as exc:
        logger.warning("[otel] failed to initialise tracing for %s: %s", service_name, exc)
        _tracer = _NoOpTracer()


def _instrument_app(app) -> None:
    """Instrument a FastAPI or Flask app object based on its type."""
    module = type(app).__module__
    if module.startswith("fastapi"):
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        FastAPIInstrumentor.instrument_app(app)
    elif module.startswith("flask"):
        from opentelemetry.instrumentation.flask import FlaskInstrumentor
        FlaskInstrumentor().instrument_app(app)
    else:
        logger.info("[otel] no framework instrumentor for app type %s.%s — skipped",
                    module, type(app).__name__)


def _instrument_optional(service_name: str) -> None:
    """Best-effort redis/kafka/psycopg instrumentation; ImportError-tolerant."""
    try:
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        RedisInstrumentor().instrument()
    except ImportError:
        logger.debug("[otel] redis instrumentation not installed for %s", service_name)
    except Exception as exc:
        logger.warning("[otel] redis instrumentation failed for %s: %s", service_name, exc)

    try:
        from opentelemetry.instrumentation.kafka import KafkaInstrumentor
        KafkaInstrumentor().instrument()
    except ImportError:
        logger.debug("[otel] kafka instrumentation not installed for %s", service_name)
    except Exception as exc:
        logger.warning("[otel] kafka instrumentation failed for %s: %s", service_name, exc)

    try:
        from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
        PsycopgInstrumentor().instrument()
    except ImportError:
        logger.debug("[otel] psycopg instrumentation not installed for %s", service_name)
    except Exception as exc:
        logger.warning("[otel] psycopg instrumentation failed for %s: %s", service_name, exc)


def set_tenant_context(tenant_id: Optional[str] = None, merchant_id: Optional[str] = None) -> None:
    """Attach paygate.tenant_id / paygate.merchant_id attributes to the current span."""
    try:
        from opentelemetry import trace
        span = trace.get_current_span()
        if span is None:
            return
        if tenant_id is not None:
            span.set_attribute("paygate.tenant_id", tenant_id)
        if merchant_id is not None:
            span.set_attribute("paygate.merchant_id", merchant_id)
    except ImportError:
        pass


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
