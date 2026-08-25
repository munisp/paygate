"""
QuickBooks Online adapter.

OAuth2 (authorization-code) against Intuit, plus push/pull over the QBO v3
API. Configuration is exclusively via environment — there is NO mock mode:
if QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_REDIRECT_URI are missing the
adapter raises ProviderNotConfigured and the API layer returns 503
`provider_not_configured`.

Env:
  QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI
"""

import base64
import logging
import os
from typing import Any
from urllib.parse import urlencode

import httpx

from . import ProviderHttpError, ProviderNotConfigured
from crypto_util import decrypt_token, encrypt_token

logger = logging.getLogger("accounting-sync.quickbooks")

AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
API_BASE = "https://quickbooks.api.intuit.com/v3/company"
SCOPE = "com.intuit.quickbooks.accounting"
MINOR_VERSION = "73"
PAGE_SIZE = 100

CLIENT_ID = os.getenv("QBO_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("QBO_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("QBO_REDIRECT_URI", "")

# entity name mapping: paygate entity -> QBO entity
ENTITY_MAP = {"bill": "Bill", "invoice": "Invoice", "payment": "Payment"}


def _require_config() -> None:
    if not (CLIENT_ID and CLIENT_SECRET and REDIRECT_URI):
        raise ProviderNotConfigured("quickbooks")


def _basic_auth() -> str:
    raw = f"{CLIENT_ID}:{CLIENT_SECRET}".encode()
    return "Basic " + base64.b64encode(raw).decode()


async def _raise_for_status(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        raise ProviderHttpError(resp.status_code, resp.text)


# ─── OAuth ────────────────────────────────────────────────────────────────────
async def consent_url(state: str | None = None, **_kwargs: Any) -> dict:
    _require_config()
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "state": state or "paygate",
    }
    return {"url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


async def _token_request(form: dict) -> dict:
    """POST to the Intuit token endpoint with HTTP basic auth."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            TOKEN_URL,
            data=form,
            headers={
                "Authorization": _basic_auth(),
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
    await _raise_for_status(resp)
    return resp.json()


def _encrypt_token_payload(token_json: dict, realm_id: str | None) -> dict:
    return {
        "access_token_enc": encrypt_token(token_json["access_token"]),
        "refresh_token_enc": encrypt_token(token_json["refresh_token"]),
        "expires_in": token_json.get("expires_in"),
        "realm_id": realm_id,
        "scopes": token_json.get("scope", SCOPE),
    }


async def exchange(code: str, realm_id: str | None = None, **_kwargs: Any) -> dict:
    _require_config()
    token_json = await _token_request({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
    })
    return _encrypt_token_payload(token_json, realm_id)


async def refresh(refresh_token_enc: str, **_kwargs: Any) -> dict:
    _require_config()
    refresh_token = decrypt_token(refresh_token_enc)
    token_json = await _token_request({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })
    return _encrypt_token_payload(token_json, None)


# ─── API helpers ──────────────────────────────────────────────────────────────
def _api_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


# ─── Push ─────────────────────────────────────────────────────────────────────
def _to_qbo_payload(entity: str, record: dict) -> dict:
    """Map a normalized paygate record to a QBO entity payload."""
    total = (record.get("total_kobo") or 0) / 100
    if entity == "bill":
        payload: dict = {
            "VendorRef": {"name": record.get("vendor_name") or "Unknown"},
            "DocNumber": record.get("bill_number"),
            "TotalAmt": total,
            "DueDate": record.get("due_date"),
            "Line": [{
                "Amount": total,
                "DetailType": "AccountBasedExpenseLineDetail",
                "AccountBasedExpenseLineDetail": {
                    "AccountRef": {"name": record.get("expense_account") or "Expenses"},
                },
            }],
        }
    elif entity == "invoice":
        payload = {
            "CustomerRef": {"name": record.get("vendor_name") or "Unknown"},
            "DocNumber": record.get("bill_number"),
            "TotalAmt": total,
            "DueDate": record.get("due_date"),
            "Line": [{
                "Amount": total,
                "DetailType": "SalesItemLineDetail",
                "SalesItemLineDetail": {"Qty": 1, "UnitPrice": total},
            }],
        }
    else:  # payment
        payload = {
            "TotalAmt": total,
            "VendorRef": {"name": record.get("vendor_name") or "Unknown"},
            "DocNumber": record.get("bill_number"),
        }
    return {k: v for k, v in payload.items() if v is not None}


async def push(entity: str, access_token_enc: str, realm_id: str,
               records: list[dict], **_kwargs: Any) -> dict:
    _require_config()
    qbo_entity = ENTITY_MAP.get(entity)
    if not qbo_entity:
        raise ProviderHttpError(400, f"unsupported entity for quickbooks push: {entity}")
    access_token = decrypt_token(access_token_enc)
    pushed: list[dict] = []
    async with httpx.AsyncClient(timeout=60) as client:
        for record in records:
            url = (f"{API_BASE}/{realm_id}/{qbo_entity.lower()}"
                   f"?minorversion={MINOR_VERSION}")
            resp = await client.post(
                url, json=_to_qbo_payload(entity, record),
                headers=_api_headers(access_token),
            )
            await _raise_for_status(resp)
            body = resp.json()
            remote = body.get(qbo_entity, {})
            pushed.append({
                "local_id": record.get("local_id"),
                "remote_id": remote.get("Id"),
                "raw": remote,
            })
    return {"pushed": pushed, "records_out": len(pushed)}


# ─── Pull ─────────────────────────────────────────────────────────────────────
def _normalize(entity: str, raw: dict) -> dict:
    """Normalize a QBO entity to the canonical paygate shape.

    Amounts are converted to integer kobo (x100).
    """
    if entity == "payment":
        vendor = (raw.get("VendorRef") or raw.get("CustomerRef") or {})
        number = raw.get("PaymentRefNum") or raw.get("DocNumber")
        due = None
    elif entity == "invoice":
        vendor = raw.get("CustomerRef") or {}
        number = raw.get("DocNumber")
        due = raw.get("DueDate")
    else:
        vendor = raw.get("VendorRef") or {}
        number = raw.get("DocNumber")
        due = raw.get("DueDate")
    total = raw.get("TotalAmt") or raw.get("Balance") or 0
    return {
        "remote_id": str(raw.get("Id")),
        "vendor_name": vendor.get("name"),
        "bill_number": number,
        "total_kobo": int(round(float(total) * 100)),
        "due_date": due,
        "currency": (raw.get("CurrencyRef") or {}).get("value"),
        "updated_at": (raw.get("MetaData") or {}).get("LastUpdatedTime"),
        "raw": raw,
    }


async def pull(entity: str, access_token_enc: str, realm_id: str,
               cursor: str | None = None, **_kwargs: Any) -> dict:
    _require_config()
    qbo_entity = ENTITY_MAP.get(entity)
    if not qbo_entity:
        raise ProviderHttpError(400, f"unsupported entity for quickbooks pull: {entity}")
    access_token = decrypt_token(access_token_enc)
    start = int(cursor) if cursor else 1
    query = (f"select * from {qbo_entity} startposition {start} "
             f"maxresults {PAGE_SIZE}")
    url = f"{API_BASE}/{realm_id}/query?minorversion={MINOR_VERSION}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(
            url, params={"query": query}, headers=_api_headers(access_token),
        )
    await _raise_for_status(resp)
    body = resp.json()
    items = (body.get("QueryResponse") or {}).get(qbo_entity, []) or []
    records = [_normalize(entity, item) for item in items]
    # Cursor = next startposition; None when the page was short (exhausted).
    next_cursor = str(start + len(items)) if len(items) >= PAGE_SIZE else None
    return {
        "records": records,
        "records_in": len(records),
        "next_cursor": next_cursor,
    }
