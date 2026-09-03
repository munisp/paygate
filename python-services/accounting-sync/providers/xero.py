"""
Xero adapter.

OAuth2 (authorization-code) against Xero identity, tenant resolution via
/connections, and push/pull over the Xero Accounting API (api.xro/2.0).
Configuration is exclusively via environment — there is NO mock mode:
missing XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI raises
ProviderNotConfigured -> 503 `provider_not_configured`.

Env:
  XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI
"""

import base64
import logging
import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from . import ProviderHttpError, ProviderNotConfigured
from crypto_util import decrypt_token, encrypt_token

logger = logging.getLogger("accounting-sync.xero")

AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize"
TOKEN_URL = "https://identity.xero.com/connect/token"
CONNECTIONS_URL = "https://api.xero.com/connections"
API_BASE = "https://api.xero.com/api.xro/2.0"
SCOPES = "accounting.transactions accounting.contacts offline_access"

CLIENT_ID = os.getenv("XERO_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("XERO_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("XERO_REDIRECT_URI", "")

# paygate entity -> Xero invoice Type filter
INVOICE_TYPE = {"bill": "ACCPAY", "invoice": "ACCREC"}


def _require_config() -> None:
    if not (CLIENT_ID and CLIENT_SECRET and REDIRECT_URI):
        raise ProviderNotConfigured("xero")


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
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "state": state or "paygate",
    }
    return {"url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


async def _token_request(form: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            TOKEN_URL,
            data=form,
            headers={
                "Authorization": _basic_auth(),
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
        )
    await _raise_for_status(resp)
    return resp.json()


async def _tenant_id(access_token: str) -> str:
    """Resolve the Xero tenantId from the authorised /connections list."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            CONNECTIONS_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )
    await _raise_for_status(resp)
    connections = resp.json() or []
    if not connections:
        raise ProviderHttpError(502, "xero /connections returned no tenants")
    return connections[0]["tenantId"]


def _encrypt_token_payload(token_json: dict, tenant: str | None) -> dict:
    return {
        "access_token_enc": encrypt_token(token_json["access_token"]),
        "refresh_token_enc": encrypt_token(token_json["refresh_token"]),
        "expires_in": token_json.get("expires_in"),
        "realm_id": tenant,
        "scopes": token_json.get("scope", SCOPES),
    }


async def exchange(code: str, realm_id: str | None = None, **_kwargs: Any) -> dict:
    _require_config()
    token_json = await _token_request({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
    })
    tenant = realm_id or await _tenant_id(token_json["access_token"])
    return _encrypt_token_payload(token_json, tenant)


async def refresh(refresh_token_enc: str, **_kwargs: Any) -> dict:
    _require_config()
    refresh_token = decrypt_token(refresh_token_enc)
    token_json = await _token_request({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })
    return _encrypt_token_payload(token_json, None)


# ─── API helpers ──────────────────────────────────────────────────────────────
def _api_headers(access_token: str, tenant_id: str,
                 if_modified_since: str | None = None) -> dict:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "xero-tenant-id": tenant_id,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if if_modified_since:
        headers["If-Modified-Since"] = if_modified_since
    return headers


# ─── Push ─────────────────────────────────────────────────────────────────────
def _to_xero_invoice(entity: str, record: dict) -> dict:
    total = (record.get("total_kobo") or 0) / 100
    return {
        "Type": INVOICE_TYPE[entity],
        "Contact": {"Name": record.get("vendor_name") or "Unknown"},
        "InvoiceNumber": record.get("bill_number"),
        "DueDate": record.get("due_date"),
        "CurrencyCode": record.get("currency") or "NGN",
        "LineItems": [{
            "Description": record.get("bill_number") or "Synced from PayGate",
            "Quantity": 1,
            "UnitAmount": total,
        }],
    }


def _to_xero_payment(record: dict) -> dict:
    total = (record.get("total_kobo") or 0) / 100
    return {
        "Invoice": {"InvoiceNumber": record.get("bill_number")},
        "Account": {"Name": record.get("bank_account") or "Business Bank Account"},
        "Amount": total,
    }


async def push(entity: str, access_token_enc: str, realm_id: str,
               records: list[dict], **_kwargs: Any) -> dict:
    _require_config()
    access_token = decrypt_token(access_token_enc)
    pushed: list[dict] = []
    async with httpx.AsyncClient(timeout=60) as client:
        for record in records:
            if entity in INVOICE_TYPE:
                url = f"{API_BASE}/Invoices"
                payload = {"Invoices": [_to_xero_invoice(entity, record)]}
            elif entity == "payment":
                url = f"{API_BASE}/Payments"
                payload = {"Payments": [_to_xero_payment(record)]}
            else:
                raise ProviderHttpError(
                    400, f"unsupported entity for xero push: {entity}")
            resp = await client.post(
                url, json=payload,
                headers=_api_headers(access_token, realm_id),
            )
            await _raise_for_status(resp)
            body = resp.json()
            key = "Invoices" if entity in INVOICE_TYPE else "Payments"
            items = body.get(key) or []
            remote_id = (items[0].get("InvoiceID") or items[0].get("PaymentID")
                         if items else None)
            pushed.append({
                "local_id": record.get("local_id"),
                "remote_id": remote_id,
                "raw": items[0] if items else body,
            })
    return {"pushed": pushed, "records_out": len(pushed)}


# ─── Pull ─────────────────────────────────────────────────────────────────────
def _normalize(entity: str, raw: dict) -> dict:
    total = raw.get("Total") or raw.get("Amount") or 0
    contact = raw.get("Contact") or {}
    invoice = raw.get("Invoice") or {}
    if entity == "payment":
        remote_id = raw.get("PaymentID")
        number = invoice.get("InvoiceNumber")
        due = raw.get("Date")
    else:
        remote_id = raw.get("InvoiceID")
        number = raw.get("InvoiceNumber")
        due = raw.get("DueDate")
    updated = raw.get("UpdatedDateUTC") or raw.get("Date")
    if isinstance(due, str) and due.startswith("/Date("):
        # Xero JSON legacy date format /Date(<epoch ms>+0000)/
        try:
            epoch_ms = int(due[6:due.index("+") if "+" in due else due.index(")")])
            due = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).date().isoformat()
        except (ValueError, IndexError):
            pass
    return {
        "remote_id": str(remote_id),
        "vendor_name": contact.get("Name"),
        "bill_number": number,
        "total_kobo": int(round(float(total) * 100)),
        "due_date": due,
        "currency": raw.get("CurrencyCode"),
        "updated_at": updated,
        "raw": raw,
    }


async def pull(entity: str, access_token_enc: str, realm_id: str,
               cursor: str | None = None, **_kwargs: Any) -> dict:
    _require_config()
    access_token = decrypt_token(access_token_enc)
    headers = _api_headers(access_token, realm_id, if_modified_since=cursor)
    async with httpx.AsyncClient(timeout=60) as client:
        if entity in INVOICE_TYPE:
            resp = await client.get(
                f"{API_BASE}/Invoices",
                params={"where": f'Type=="{INVOICE_TYPE[entity]}"',
                        "order": "UpdatedDateUTC ASC"},
                headers=headers,
            )
            await _raise_for_status(resp)
            items = resp.json().get("Invoices") or []
        elif entity == "payment":
            resp = await client.get(
                f"{API_BASE}/Payments", headers=headers,
            )
            await _raise_for_status(resp)
            items = resp.json().get("Payments") or []
        else:
            raise ProviderHttpError(
                400, f"unsupported entity for xero pull: {entity}")
    records = [_normalize(entity, item) for item in items]
    # If-Modified-Since cursor: latest UpdatedDateUTC seen, RFC-1123 for the
    # next request header. Empty page -> cursor unchanged (None).
    next_cursor = None
    if records:
        next_cursor = datetime.now(timezone.utc).strftime(
            "%a, %d %b %Y %H:%M:%S GMT")
    return {
        "records": records,
        "records_in": len(records),
        "next_cursor": next_cursor,
    }
