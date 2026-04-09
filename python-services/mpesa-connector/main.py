"""
PayGate M-Pesa Connector Microservice
=======================================
Handles M-Pesa STK Push (Lipa na M-Pesa), C2B, and B2C integrations
via the Safaricom Daraja API.

Endpoints:
  POST /v1/mpesa/stk-push        — Initiate STK Push payment
  POST /v1/mpesa/stk-callback    — Safaricom STK callback → forwarded to Go bridge
  POST /v1/mpesa/b2c             — Business to Customer payout
  POST /v1/mpesa/b2c-callback    — Safaricom B2C result callback → forwarded to Go bridge
  GET  /health
  GET  /metrics

Environment variables:
  PORT                  — HTTP port (default: 8097)
  MPESA_CONSUMER_KEY    — Daraja API consumer key
  MPESA_CONSUMER_SECRET — Daraja API consumer secret
  MPESA_SHORTCODE       — Business shortcode
  MPESA_PASSKEY         — Lipa na M-Pesa passkey
  MPESA_ENV             — "sandbox" | "production" (default: sandbox)
  BRIDGE_URL            — Go bridge base URL for posting results
  BRIDGE_INTERNAL_KEY   — Bridge authentication key
"""

import base64
import hashlib
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("mpesa-connector")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

MPESA_ENV = os.getenv("MPESA_ENV", "sandbox")
DARAJA_BASE = (
    "https://api.safaricom.co.ke"
    if MPESA_ENV == "production"
    else "https://sandbox.safaricom.co.ke"
)

CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY", "")
CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET", "")
SHORTCODE = os.getenv("MPESA_SHORTCODE", "174379")
PASSKEY = os.getenv("MPESA_PASSKEY", "")
BRIDGE_URL = os.getenv("BRIDGE_URL", "")
BRIDGE_INTERNAL_KEY = os.getenv("BRIDGE_INTERNAL_KEY", "")

# ─── Token cache ──────────────────────────────────────────────────────────────
_token_cache: dict = {"token": None, "expires_at": 0}


async def get_access_token() -> str:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]

    credentials = base64.b64encode(f"{CONSUMER_KEY}:{CONSUMER_SECRET}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {credentials}"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        _token_cache["token"] = data["access_token"]
        _token_cache["expires_at"] = now + int(data.get("expires_in", 3600)) - 60
        return _token_cache["token"]


def generate_password() -> tuple[str, str]:
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    raw = f"{SHORTCODE}{PASSKEY}{timestamp}"
    password = base64.b64encode(raw.encode()).decode()
    return password, timestamp


async def forward_to_bridge(path: str, payload: dict) -> dict:
    """Forward a callback payload to the Go bridge.

    The bridge endpoint is at BRIDGE_URL/path.  We include the internal
    authentication key so the bridge can verify the request origin.

    Returns the bridge response body (or a synthetic ack on error so that
    Safaricom always receives a 200 OK and does not retry).
    """
    if not BRIDGE_URL:
        logger.warning("BRIDGE_URL not set — callback not forwarded to bridge")
        return {"forwarded": False, "reason": "BRIDGE_URL not configured"}

    url = f"{BRIDGE_URL.rstrip('/')}{path}"
    headers = {
        "Content-Type": "application/json",
        "X-Internal-Key": BRIDGE_INTERNAL_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            logger.info("Forwarded to bridge: path=%s status=%d", path, resp.status_code)
            return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Bridge returned error: path=%s status=%d body=%s",
            path, exc.response.status_code, exc.response.text,
        )
        return {"forwarded": False, "bridge_status": exc.response.status_code}
    except Exception as exc:
        logger.error("Bridge forwarding failed: path=%s error=%s", path, exc)
        return {"forwarded": False, "error": str(exc)}


# ─── Models ───────────────────────────────────────────────────────────────────

class STKPushRequest(BaseModel):
    phone_number: str = Field(..., description="254XXXXXXXXX format")
    amount: int = Field(..., gt=0, description="Amount in KES")
    account_reference: str
    transaction_desc: str
    callback_url: str


class B2CRequest(BaseModel):
    phone_number: str
    amount: int = Field(..., gt=0)
    remarks: str
    occasion: Optional[str] = None


# ─── App ──────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"M-Pesa connector starting — env={MPESA_ENV} bridge={BRIDGE_URL or 'not configured'}")
    yield
    logger.info("M-Pesa connector shutting down")


app = FastAPI(title="PayGate M-Pesa Connector", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "mpesa-connector",
        "env": MPESA_ENV,
        "bridge_configured": bool(BRIDGE_URL),
    }


@app.post("/v1/mpesa/stk-push")
async def stk_push(req: STKPushRequest):
    if not CONSUMER_KEY:
        raise HTTPException(status_code=503, detail="M-Pesa credentials not configured")

    token = await get_access_token()
    password, timestamp = generate_password()

    payload = {
        "BusinessShortCode": SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": req.amount,
        "PartyA": req.phone_number,
        "PartyB": SHORTCODE,
        "PhoneNumber": req.phone_number,
        "CallBackURL": req.callback_url,
        "AccountReference": req.account_reference,
        "TransactionDesc": req.transaction_desc,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{DARAJA_BASE}/mpesa/stkpush/v1/processrequest",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


@app.post("/v1/mpesa/stk-callback")
async def stk_callback(request: Request):
    """Safaricom STK Push callback — forward result to Go bridge.

    Safaricom expects a 200 OK with ResultCode=0 regardless of our internal
    processing outcome.  We forward asynchronously and always return success.
    """
    body = await request.json()
    logger.info("STK callback received: %s", body)

    # Extract key fields for structured logging
    stkb = body.get("Body", {}).get("stkCallback", {})
    merchant_request_id = stkb.get("MerchantRequestID", "unknown")
    result_code = stkb.get("ResultCode", -1)
    logger.info(
        "STK callback: merchant_request_id=%s result_code=%s",
        merchant_request_id, result_code,
    )

    # Forward to Go bridge — non-blocking (fire and forget is acceptable here
    # because Safaricom will retry if we return non-200, but we always return 200)
    bridge_result = await forward_to_bridge("/v1/mpesa/stk-callback", body)
    logger.info("Bridge forward result: %s", bridge_result)

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@app.post("/v1/mpesa/b2c")
async def b2c(req: B2CRequest):
    if not CONSUMER_KEY:
        raise HTTPException(status_code=503, detail="M-Pesa credentials not configured")

    token = await get_access_token()
    security_credential = os.getenv("MPESA_SECURITY_CREDENTIAL", "")
    queue_timeout_url = os.getenv("MPESA_B2C_TIMEOUT_URL", "")
    result_url = os.getenv("MPESA_B2C_RESULT_URL", "")

    payload = {
        "InitiatorName": os.getenv("MPESA_INITIATOR_NAME", "PayGate"),
        "SecurityCredential": security_credential,
        "CommandID": "BusinessPayment",
        "Amount": req.amount,
        "PartyA": SHORTCODE,
        "PartyB": req.phone_number,
        "Remarks": req.remarks,
        "QueueTimeOutURL": queue_timeout_url,
        "ResultURL": result_url,
        "Occasion": req.occasion or "",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{DARAJA_BASE}/mpesa/b2c/v3/paymentrequest",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


@app.post("/v1/mpesa/b2c-callback")
async def b2c_callback(request: Request):
    """Safaricom B2C result callback — forward to Go bridge for settlement."""
    body = await request.json()
    logger.info("B2C callback received: %s", body)

    # Extract key fields for structured logging
    result = body.get("Result", {})
    transaction_id = result.get("TransactionID", "unknown")
    result_code = result.get("ResultCode", -1)
    logger.info(
        "B2C callback: transaction_id=%s result_code=%s",
        transaction_id, result_code,
    )

    # Forward to Go bridge
    bridge_result = await forward_to_bridge("/v1/mpesa/b2c-callback", body)
    logger.info("Bridge forward result: %s", bridge_result)

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse(
        "# HELP mpesa_connector_up M-Pesa connector availability\n"
        "# TYPE mpesa_connector_up gauge\n"
        f"mpesa_connector_up 1\n"
        "# HELP mpesa_bridge_configured Whether bridge forwarding is configured\n"
        "# TYPE mpesa_bridge_configured gauge\n"
        f"mpesa_bridge_configured {1 if BRIDGE_URL else 0}\n",
        media_type="text/plain",
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8097"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
