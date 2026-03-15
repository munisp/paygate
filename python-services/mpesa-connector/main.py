"""
PayGate M-Pesa Connector Microservice
=======================================
Handles M-Pesa STK Push (Lipa na M-Pesa), C2B, and B2C integrations
via the Safaricom Daraja API.

Endpoints:
  POST /v1/mpesa/stk-push        — Initiate STK Push payment
  POST /v1/mpesa/stk-callback    — Safaricom STK callback
  POST /v1/mpesa/b2c             — Business to Customer payout
  POST /v1/mpesa/b2c-callback    — Safaricom B2C result callback
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
    logger.info(f"M-Pesa connector starting — env={MPESA_ENV}")
    yield
    logger.info("M-Pesa connector shutting down")


app = FastAPI(title="PayGate M-Pesa Connector", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "mpesa-connector", "env": MPESA_ENV}


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
    """Safaricom STK Push callback — forward result to Go bridge."""
    body = await request.json()
    logger.info(f"STK callback received: {body}")
    # TODO: forward to bridge via BRIDGE_URL
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@app.post("/v1/mpesa/b2c")
async def b2c(req: B2CRequest):
    if not CONSUMER_KEY:
        raise HTTPException(status_code=503, detail="M-Pesa credentials not configured")

    token = await get_access_token()
    payload = {
        "InitiatorName": "PayGate",
        "SecurityCredential": "",  # Set from portal secrets
        "CommandID": "BusinessPayment",
        "Amount": req.amount,
        "PartyA": SHORTCODE,
        "PartyB": req.phone_number,
        "Remarks": req.remarks,
        "QueueTimeOutURL": "",
        "ResultURL": "",
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
    body = await request.json()
    logger.info(f"B2C callback: {body}")
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse("# mpesa metrics\n", media_type="text/plain")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8097"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
