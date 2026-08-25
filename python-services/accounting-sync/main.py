"""
PayGate Accounting Sync Service
===============================
OAuth + push/pull bridge between PayGate and external accounting systems:
  - QuickBooks Online (v3 API)
  - Xero (api.xro/2.0)
  - Odoo (jsonrpc / account.move + account.payment)

Endpoints (all require X-Internal-Key except /health):
  POST /{provider}/oauth/url       — build consent URL
  POST /{provider}/oauth/exchange  — code (or odoo creds) -> encrypted tokens
  POST /{provider}/refresh         — refresh_token_enc -> new encrypted tokens
  POST /{provider}/push            — normalized records -> provider entities
  POST /{provider}/pull            — cursor-based provider -> normalized records
  GET  /health                     — health check

Provider here is one of: quickbooks | xero | odoo.
There are NO mock adapters: a provider whose env credentials are absent
answers 503 `provider_not_configured`; upstream HTTP errors propagate with
status + body excerpt.
"""

import logging
import os
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from crypto_util import TokenCryptoNotConfigured
from providers import PROVIDERS, ProviderHttpError, ProviderNotConfigured

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("accounting-sync")

app = FastAPI(title="PayGate Accounting Sync", version="1.0.0")


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "providers": sorted(PROVIDERS.keys()),
        "token_crypto_configured": bool(os.getenv("ACCOUNTING_TOKEN_KEY", "")),
    }


# ─── Mandatory internal service-to-service auth (fail closed) ───────────────
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks.
import hmac as _hmac_mod
from fastapi import Request as _AuthRequest
from fastapi.responses import JSONResponse as _AuthJSONResponse

_INTERNAL_AUTH_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@app.middleware("http")
async def _require_internal_api_key(request: _AuthRequest, call_next):
    if request.url.path in _AUTH_EXEMPT_PATHS:
        return await call_next(request)
    if not _INTERNAL_AUTH_KEY:
        return _AuthJSONResponse(
            status_code=503,
            content={"detail": "Service misconfigured: INTERNAL_API_KEY not set"},
        )
    if not _hmac_mod.compare_digest(
        request.headers.get("x-internal-key", ""), _INTERNAL_AUTH_KEY
    ):
        return _AuthJSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


# ─── Request models ───────────────────────────────────────────────────────────
class OAuthUrlBody(BaseModel):
    state: str | None = None
    base_url: str | None = None  # odoo: per-connection instance URL


class OdooCredentials(BaseModel):
    base_url: str
    db: str
    login: str
    api_key: str


class ExchangeBody(BaseModel):
    code: str | None = None
    realm_id: str | None = None
    odoo: OdooCredentials | None = None


class RefreshBody(BaseModel):
    refresh_token_enc: str


class PushBody(BaseModel):
    entity: str  # bill | invoice | payment
    access_token_enc: str
    realm_id: str
    records: list[dict[str, Any]]


class PullBody(BaseModel):
    entity: str  # bill | invoice | payment
    access_token_enc: str
    realm_id: str
    cursor: str | None = None


# ─── Error translation ────────────────────────────────────────────────────────
def _provider_or_404(name: str):
    module = PROVIDERS.get(name)
    if module is None:
        raise ProviderHttpError(404, f"unknown provider: {name}")
    return module


@app.exception_handler(ProviderNotConfigured)
async def _not_configured_handler(_req: Request, exc: ProviderNotConfigured):
    return JSONResponse(
        status_code=503,
        content={"detail": "provider_not_configured", "provider": str(exc)},
    )


@app.exception_handler(TokenCryptoNotConfigured)
async def _crypto_not_configured_handler(_req: Request,
                                         exc: TokenCryptoNotConfigured):
    return JSONResponse(
        status_code=503,
        content={"detail": "token_crypto_not_configured", "reason": str(exc)},
    )


@app.exception_handler(ProviderHttpError)
async def _provider_http_handler(_req: Request, exc: ProviderHttpError):
    # Propagate upstream status (or the 4xx the adapter itself produced) with
    # a bounded body excerpt — never swallow provider failures.
    status = exc.status if 400 <= exc.status < 600 else 502
    return JSONResponse(
        status_code=status,
        content={"detail": exc.body_excerpt, "upstream_status": exc.status},
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.post("/{provider}/oauth/url")
async def oauth_url(provider: str, body: OAuthUrlBody):
    module = _provider_or_404(provider)
    return await module.consent_url(state=body.state, base_url=body.base_url)


@app.post("/{provider}/oauth/exchange")
async def oauth_exchange(provider: str, body: ExchangeBody):
    module = _provider_or_404(provider)
    return await module.exchange(
        code=body.code,
        realm_id=body.realm_id,
        odoo=body.odoo.model_dump() if body.odoo else None,
    )


@app.post("/{provider}/refresh")
async def refresh(provider: str, body: RefreshBody):
    module = _provider_or_404(provider)
    return await module.refresh(refresh_token_enc=body.refresh_token_enc)


@app.post("/{provider}/push")
async def push(provider: str, body: PushBody):
    module = _provider_or_404(provider)
    return await module.push(
        entity=body.entity,
        access_token_enc=body.access_token_enc,
        realm_id=body.realm_id,
        records=body.records,
    )


@app.post("/{provider}/pull")
async def pull(provider: str, body: PullBody):
    module = _provider_or_404(provider)
    return await module.pull(
        entity=body.entity,
        access_token_enc=body.access_token_enc,
        realm_id=body.realm_id,
        cursor=body.cursor,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8107, workers=2, log_level="warning")
