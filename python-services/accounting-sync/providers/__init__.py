"""
Provider adapters for the accounting-sync service.

Shared error types used by main.py to translate adapter failures into HTTP
responses:

  ProviderNotConfigured  -> 503 {"detail": "provider_not_configured"}
  ProviderHttpError      -> upstream status + body excerpt propagated

Exception types are defined BEFORE the submodule imports so adapters can do
`from . import ProviderNotConfigured` without a circular-import failure.
"""


class ProviderNotConfigured(Exception):
    """Raised when the required OAuth client env vars for a provider are unset."""


class ProviderHttpError(Exception):
    """Raised when an upstream provider API call fails.

    Carries the upstream HTTP status and a bounded excerpt of the response
    body so the API layer can propagate both verbatim (no swallowing).
    """

    def __init__(self, status: int, body_excerpt: str):
        self.status = status
        self.body_excerpt = body_excerpt[:500]
        super().__init__(f"provider HTTP {status}: {self.body_excerpt}")


from . import quickbooks, xero, odoo  # noqa: E402,F401

PROVIDERS = {
    "quickbooks": quickbooks,
    "xero": xero,
    "odoo": odoo,
}
