"""
Odoo adapter.

Two authentication modes, chosen per connection:

  1. API-key / password mode (default, self-hosted and Odoo.sh):
     the TS layer passes the per-connection credentials in the exchange
     request body (`odoo: {db, login, api_key, base_url}`) — these are NEVER
     read from this service's environment. Authentication runs through
     POST {base_url}/web/session/authenticate (jsonrpc); the validated
     connection parameters are then encrypted into the access token blob.

  2. OAuth2 mode (Odoo Online accounts) — only when ODOO_CLIENT_ID /
     ODOO_CLIENT_SECRET / ODOO_REDIRECT_URI are set in the environment.
     Otherwise the OAuth endpoints raise ProviderNotConfigured ->
     503 `provider_not_configured`. There is NO mock mode.

Data access uses /jsonrpc service=object method=execute_kw on model
account.move (move_type: in_invoice = bill, out_invoice = invoice) and
account.payment. The connection's realm_id stores the Odoo database name;
the base URL travels inside the encrypted token blob.
"""

import logging
import os
from typing import Any
from urllib.parse import urlencode

import httpx

from . import ProviderHttpError, ProviderNotConfigured
from crypto_util import decrypt_token, encrypt_token
import json

logger = logging.getLogger("accounting-sync.odoo")

CLIENT_ID = os.getenv("ODOO_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("ODOO_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("ODOO_REDIRECT_URI", "")

OAUTH_AUTHORIZE_URL = "https://accounts.odoo.com/oauth2/auth"
OAUTH_TOKEN_URL = "https://accounts.odoo.com/oauth2/token"
OAUTH_SCOPE = "userinfo"

# paygate entity -> (model, move_type or None)
ENTITY_MODEL = {
    "bill": ("account.move", "in_invoice"),
    "invoice": ("account.move", "out_invoice"),
    "payment": ("account.payment", None),
}

MOVE_FIELDS = [
    "name", "ref", "partner_id", "amount_total", "invoice_date_due",
    "currency_id", "write_date", "state", "move_type",
]
PAYMENT_FIELDS = [
    "name", "ref", "partner_id", "amount", "date", "currency_id", "write_date",
]


def _oauth_configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET and REDIRECT_URI)


async def _raise_for_status(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        raise ProviderHttpError(resp.status_code, resp.text)


async def _jsonrpc(client: httpx.AsyncClient, base_url: str, payload: dict) -> Any:
    resp = await client.post(
        f"{base_url.rstrip('/')}/jsonrpc",
        json={"jsonrpc": "2.0", "method": "call", "id": 1, "params": payload},
        headers={"Content-Type": "application/json"},
    )
    await _raise_for_status(resp)
    body = resp.json()
    if body.get("error"):
        err = body["error"]
        message = (err.get("data") or {}).get("message") or err.get("message")
        raise ProviderHttpError(502, f"odoo jsonrpc error: {message}")
    return body.get("result")


# ─── OAuth / authentication ───────────────────────────────────────────────────
async def consent_url(state: str | None = None, base_url: str | None = None,
                      **_kwargs: Any) -> dict:
    if not _oauth_configured():
        raise ProviderNotConfigured("odoo")
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": OAUTH_SCOPE,
        "state": state or "paygate",
    }
    if base_url:
        params["base_url"] = base_url
    return {"url": f"{OAUTH_AUTHORIZE_URL}?{urlencode(params)}"}


async def _authenticate_api_key(base_url: str, db: str, login: str,
                                api_key: str) -> dict:
    """Validate credentials via /web/session/authenticate; returns uid."""
    async with httpx.AsyncClient(timeout=30) as client:
        result = await _jsonrpc(client, base_url, {
            "service": "common",
            "method": "authenticate",
            "args": [db, login, api_key, {}],
        })
    if not result:
        raise ProviderHttpError(401, "odoo authentication failed for "
                                f"db={db} login={login}")
    return {"uid": result}


def _blob(connection: dict) -> str:
    """Encrypt the full connection parameter set into the access token blob."""
    return encrypt_token(json.dumps(connection))


def _unblob(access_token_enc: str) -> dict:
    return json.loads(decrypt_token(access_token_enc))


async def exchange(code: str | None = None, realm_id: str | None = None,
                   odoo: dict | None = None, **_kwargs: Any) -> dict:
    # ── Mode 1: per-connection API-key credentials in the request body ────────
    if odoo:
        base_url = (odoo.get("base_url") or "").rstrip("/")
        db = odoo.get("db")
        login = odoo.get("login")
        api_key = odoo.get("api_key")
        if not (base_url and db and login and api_key):
            raise ProviderHttpError(
                400, "odoo exchange requires base_url, db, login, api_key")
        auth = await _authenticate_api_key(base_url, db, login, api_key)
        connection = {
            "mode": "api_key", "base_url": base_url, "db": db,
            "login": login, "api_key": api_key, "uid": auth["uid"],
        }
        return {
            "access_token_enc": _blob(connection),
            "refresh_token_enc": _blob(connection),  # api keys don't expire
            "expires_in": None,
            "realm_id": db,
            "scopes": "api_key",
        }

    # ── Mode 2: OAuth2 authorization code (Odoo Online accounts) ──────────────
    if not _oauth_configured():
        raise ProviderNotConfigured("odoo")
    if not code:
        raise ProviderHttpError(400, "odoo oauth exchange requires code")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(OAUTH_TOKEN_URL, data={
            "grant_type": "authorization_code",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "code": code,
        })
    await _raise_for_status(resp)
    token_json = resp.json()
    return {
        "access_token_enc": encrypt_token(json.dumps({
            "mode": "oauth",
            "access_token": token_json["access_token"],
            "base_url": (realm_id or "").split("|")[0] if realm_id else "",
        })),
        "refresh_token_enc": encrypt_token(token_json.get("refresh_token", "")),
        "expires_in": token_json.get("expires_in"),
        "realm_id": realm_id,
        "scopes": token_json.get("scope", OAUTH_SCOPE),
    }


async def refresh(refresh_token_enc: str, **_kwargs: Any) -> dict:
    blob = decrypt_token(refresh_token_enc)
    # API-key mode: re-authenticate to confirm the key is still valid.
    try:
        connection = json.loads(blob)
    except json.JSONDecodeError:
        connection = None
    if connection and connection.get("mode") == "api_key":
        await _authenticate_api_key(
            connection["base_url"], connection["db"],
            connection["login"], connection["api_key"])
        return {
            "access_token_enc": _blob(connection),
            "refresh_token_enc": refresh_token_enc,
            "expires_in": None,
            "realm_id": connection["db"],
            "scopes": "api_key",
        }

    # OAuth2 mode: refresh-token grant against Odoo accounts.
    if not _oauth_configured():
        raise ProviderNotConfigured("odoo")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(OAUTH_TOKEN_URL, data={
            "grant_type": "refresh_token",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "refresh_token": blob,
        })
    await _raise_for_status(resp)
    token_json = resp.json()
    return {
        "access_token_enc": encrypt_token(json.dumps({
            "mode": "oauth", "access_token": token_json["access_token"],
        })),
        "refresh_token_enc": encrypt_token(
            token_json.get("refresh_token", blob)),
        "expires_in": token_json.get("expires_in"),
        "realm_id": None,
        "scopes": token_json.get("scope", OAUTH_SCOPE),
    }


# ─── execute_kw plumbing ──────────────────────────────────────────────────────
async def _execute_kw(connection: dict, model: str, method: str,
                      args: list, kwargs: dict | None = None) -> Any:
    base_url = connection["base_url"]
    if connection.get("mode") == "oauth":
        password = connection["access_token"]
        uid = connection.get("uid", 2)  # oauth tokens act as the user key
        db = connection.get("db") or connection.get("login")
    else:
        password = connection["api_key"]
        uid = connection["uid"]
        db = connection["db"]
    async with httpx.AsyncClient(timeout=60) as client:
        return await _jsonrpc(client, base_url, {
            "service": "object",
            "method": "execute_kw",
            "args": [db, uid, password, model, method, args, kwargs or {}],
        })


# ─── Push ─────────────────────────────────────────────────────────────────────
def _to_move_payload(entity: str, record: dict) -> dict:
    move_type = ENTITY_MODEL[entity][1]
    total = (record.get("total_kobo") or 0) / 100
    return {
        "move_type": move_type,
        "ref": record.get("bill_number"),
        "invoice_date_due": record.get("due_date"),
        "invoice_line_ids": [(0, 0, {
            "name": record.get("bill_number") or "Synced from PayGate",
            "quantity": 1,
            "price_unit": total,
        })],
    }


def _to_payment_payload(record: dict) -> dict:
    return {
        "payment_type": "outbound",
        "partner_type": "supplier",
        "amount": (record.get("total_kobo") or 0) / 100,
        "ref": record.get("bill_number"),
        "date": record.get("due_date"),
    }


async def push(entity: str, access_token_enc: str, realm_id: str,
               records: list[dict], **_kwargs: Any) -> dict:
    if entity not in ENTITY_MODEL:
        raise ProviderHttpError(400, f"unsupported entity for odoo push: {entity}")
    connection = _unblob(access_token_enc)
    model, move_type = ENTITY_MODEL[entity]
    pushed: list[dict] = []
    for record in records:
        if model == "account.move":
            payload = _to_move_payload(entity, record)
        else:
            payload = _to_payment_payload(record)
        existing = record.get("remote_id")
        if existing:
            await _execute_kw(connection, model, "write",
                              [[int(existing)], payload])
            remote_id = existing
        else:
            remote_id = await _execute_kw(connection, model, "create",
                                          [[payload]])
        pushed.append({
            "local_id": record.get("local_id"),
            "remote_id": str(remote_id),
            "raw": {"id": remote_id, "model": model},
        })
    return {"pushed": pushed, "records_out": len(pushed)}


# ─── Pull ─────────────────────────────────────────────────────────────────────
def _normalize(entity: str, raw: dict) -> dict:
    partner = raw.get("partner_id") or [None, None]
    currency = raw.get("currency_id") or [None, None]
    total = raw.get("amount_total") if entity != "payment" else raw.get("amount")
    return {
        "remote_id": str(raw.get("id")),
        "vendor_name": partner[1] if len(partner) > 1 else None,
        "bill_number": raw.get("ref") or raw.get("name"),
        "total_kobo": int(round(float(total or 0) * 100)),
        "due_date": raw.get("invoice_date_due") or raw.get("date") or None,
        "currency": currency[1] if len(currency) > 1 else None,
        "updated_at": raw.get("write_date"),
        "raw": raw,
    }


async def pull(entity: str, access_token_enc: str, realm_id: str,
               cursor: str | None = None, **_kwargs: Any) -> dict:
    if entity not in ENTITY_MODEL:
        raise ProviderHttpError(400, f"unsupported entity for odoo pull: {entity}")
    connection = _unblob(access_token_enc)
    model, move_type = ENTITY_MODEL[entity]
    domain: list = [["move_type", "=", move_type]] if move_type else []
    if cursor:
        domain.append(["write_date", ">", cursor])
    fields = MOVE_FIELDS if model == "account.move" else PAYMENT_FIELDS
    items = await _execute_kw(connection, model, "search_read",
                              [domain],
                              {"fields": fields, "order": "write_date asc",
                               "limit": 200})
    records = [_normalize(entity, item) for item in (items or [])]
    next_cursor = records[-1]["updated_at"] if records else None
    return {
        "records": records,
        "records_in": len(records),
        "next_cursor": next_cursor,
    }
