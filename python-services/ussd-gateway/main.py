"""
PayGate USSD Gateway
====================================
FastAPI microservice that handles Africa's Talking USSD callbacks for
the PayGate consumer wallet.

Consumer flows:
  1. Check Balance
  2. Send Money (P2P transfer via Go bridge)
  3. Pay Bill (electricity, water, cable TV)
  4. Buy Airtime
  5. Transaction History (last 5)
  6. Change PIN
  0. Exit

Environment variables:
  PORT                  — HTTP port (default: 8095)
  BRIDGE_URL            — Go bridge base URL (REQUIRED — service refuses to
                          start without it; money movement is never simulated
                          in production)
  BRIDGE_INTERNAL_KEY   — Bridge authentication key
  AT_USERNAME           — Africa's Talking username
  AT_API_KEY            — Africa's Talking API key
  USSD_ALLOW_SIMULATION — DEV-ONLY escape hatch ("1"/"true"): allows running
                          without a bridge; every simulated result is marked
                          simulated:true and a loud WARN is logged at startup.
  LOG_LEVEL             — Logging level (default: INFO)
"""
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import httpx
import uvicorn
from fastapi import FastAPI, Form, Request
from fastapi.responses import PlainTextResponse

logger = logging.getLogger("ussd-gateway")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

BRIDGE_URL = os.getenv("BRIDGE_URL", "").rstrip("/")
BRIDGE_KEY = os.getenv("BRIDGE_INTERNAL_KEY", "")
ALLOW_SIMULATION = os.getenv("USSD_ALLOW_SIMULATION", "").lower() in ("1", "true", "yes")

if not BRIDGE_URL and not ALLOW_SIMULATION:
    # FAIL FAST: without a bridge, balance lookups would return 0 and P2P /
    # bill-pay would report fabricated success references. That is never
    # acceptable outside an explicitly gated dev session.
    raise RuntimeError(
        "BRIDGE_URL is not set. The USSD gateway cannot move real money or read "
        "real balances without the Go bridge, and it will not fabricate success. "
        "Set BRIDGE_URL (e.g. http://bridge-1:8080) or, for local development "
        "ONLY, set USSD_ALLOW_SIMULATION=1."
    )

if not BRIDGE_URL and ALLOW_SIMULATION:
    logger.warning(
        "USSD ALLOW_SIMULATION ACTIVE: BRIDGE_URL unset — balance/P2P/bill-pay "
        "responses are SIMULATED (simulation:true). Never enable in production."
    )

sessions: dict[str, dict] = {}

MAIN_MENU = (
    "CON Welcome to PayGate\n"
    "1. Check Balance\n"
    "2. Send Money\n"
    "3. Pay Bill\n"
    "4. Buy Airtime\n"
    "5. Transaction History\n"
    "6. Change PIN\n"
    "0. Exit"
)

BILL_MENU = (
    "CON Select biller:\n"
    "1. Electricity (EKEDC)\n"
    "2. Electricity (IKEDC)\n"
    "3. Water (LWC)\n"
    "4. Cable TV (DSTV)\n"
    "5. Internet (Spectranet)\n"
    "0. Back"
)

BILLER_NAMES = {"1": "EKEDC Electricity", "2": "IKEDC Electricity", "3": "LWC Water", "4": "DSTV Cable TV", "5": "Spectranet Internet"}
BILLER_CODES = {"1": "EKEDC", "2": "IKEDC", "3": "LWC", "4": "DSTV", "5": "SPECTRANET"}


def _bridge_headers() -> dict:
    return {"Authorization": f"Bearer {BRIDGE_KEY}", "Content-Type": "application/json"}


def get_consumer_balance(phone: str) -> Optional[dict]:
    if not BRIDGE_URL:
        # Only reachable behind the explicit USSD_ALLOW_SIMULATION dev gate.
        logger.warning(f"[simulation] balance lookup for {phone} — no bridge configured")
        return {"balance_kobo": 0, "currency": "NGN", "simulated": True, "simulation": True}
    try:
        resp = httpx.post(f"{BRIDGE_URL}/v1/consumer/wallet/balance", json={"phone": phone}, headers=_bridge_headers(), timeout=5.0)
        if resp.status_code == 200:
            return resp.json()
        logger.error(f"[bridge] get_consumer_balance HTTP {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        logger.error(f"[bridge] get_consumer_balance: {e}")
    return None


def initiate_p2p_transfer(phone: str, recipient_phone: str, amount_kobo: int) -> Optional[dict]:
    if not BRIDGE_URL:
        # Only reachable behind the explicit USSD_ALLOW_SIMULATION dev gate.
        logger.warning(f"[simulation] P2P {phone}->{recipient_phone} {amount_kobo}k — no bridge configured")
        return {"success": True, "reference": f"SIM-USSD-{int(time.time())}", "simulated": True, "simulation": True}
    try:
        resp = httpx.post(
            f"{BRIDGE_URL}/v1/consumer/transfer/p2p",
            json={"user_id": phone, "wallet_id": phone, "recipient_phone": recipient_phone, "amount_kobo": amount_kobo, "currency": "NGN", "reference": f"USSD-{int(time.time())}", "narration": "USSD transfer"},
            headers=_bridge_headers(), timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json()
        logger.error(f"[bridge] initiate_p2p_transfer HTTP {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        logger.error(f"[bridge] initiate_p2p_transfer: {e}")
    return None


def pay_bill(phone: str, biller_code: str, customer_ref: str, amount_kobo: int) -> Optional[dict]:
    if not BRIDGE_URL:
        # Only reachable behind the explicit USSD_ALLOW_SIMULATION dev gate.
        logger.warning(f"[simulation] billpay {biller_code} for {phone} {amount_kobo}k — no bridge configured")
        return {"success": True, "reference": f"SIM-BILL-{int(time.time())}", "simulated": True, "simulation": True}
    try:
        resp = httpx.post(
            f"{BRIDGE_URL}/v1/consumer/bill-pay",
            json={"user_id": phone, "wallet_id": phone, "biller_code": biller_code, "customer_reference": customer_ref, "amount_kobo": amount_kobo, "currency": "NGN", "reference": f"USSD-BILL-{int(time.time())}"},
            headers=_bridge_headers(), timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json()
        logger.error(f"[bridge] pay_bill HTTP {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        logger.error(f"[bridge] pay_bill: {e}")
    return None


def get_transaction_history(phone: str) -> list[dict]:
    if not BRIDGE_URL:
        return []
    try:
        resp = httpx.get(f"{BRIDGE_URL}/v1/consumer/wallet/history", params={"phone": phone, "limit": 5}, headers=_bridge_headers(), timeout=5.0)
        if resp.status_code == 200:
            return resp.json().get("transactions", [])
    except Exception as e:
        logger.warning(f"[bridge] get_transaction_history: {e}")
    return []


def change_pin(phone: str, old_pin: str, new_pin: str) -> bool:
    if not BRIDGE_URL:
        # Never fabricate a credential change, even in simulation mode.
        logger.warning(f"[simulation] PIN change for {phone} REFUSED — no bridge configured")
        return False
    try:
        resp = httpx.post(f"{BRIDGE_URL}/v1/consumer/pin/change", json={"phone": phone, "old_pin": old_pin, "new_pin": new_pin}, headers=_bridge_headers(), timeout=5.0)
        if resp.status_code != 200:
            logger.error(f"[bridge] change_pin HTTP {resp.status_code}: {resp.text[:300]}")
        return resp.status_code == 200
    except Exception as e:
        logger.error(f"[bridge] change_pin: {e}")
    return False


def handle_ussd(session_id: str, phone: str, text: str, service_code: str) -> str:
    parts = [p for p in text.split("*")] if text else []
    depth = len(parts)

    if text == "" or depth == 0:
        sessions[session_id] = {"state": "main", "phone": phone, "data": {}}
        return MAIN_MENU

    sess = sessions.setdefault(session_id, {"state": "main", "phone": phone, "data": {}})
    first = parts[0] if parts else ""

    if depth == 1:
        if first == "1":
            result = get_consumer_balance(phone)
            if result:
                bal = result.get("balance_kobo", 0) / 100
                cur = result.get("currency", "NGN")
                sim = " (simulated)" if result.get("simulated") else ""
                return f"END Your {cur} balance: {cur} {bal:,.2f}{sim}"
            return "END Unable to fetch balance. Please try again."
        elif first == "2":
            return "CON Enter recipient phone number\n(e.g. 08012345678):"
        elif first == "3":
            return BILL_MENU
        elif first == "4":
            return f"CON Enter airtime amount (NGN)\nfor {phone}:"
        elif first == "5":
            txns = get_transaction_history(phone)
            if not txns:
                return "END No recent transactions found."
            lines = ["END Last 5 transactions:"]
            for t in txns[:5]:
                amt = t.get("amount_kobo", 0) / 100
                typ = t.get("type", "txn")
                lines.append(f"  {typ}: NGN {amt:,.2f}")
            return "\n".join(lines)
        elif first == "6":
            return "CON Enter your current PIN:"
        elif first == "0":
            return "END Thank you for using PayGate. Goodbye!"
        else:
            return f"{MAIN_MENU}\n\nInvalid option."

    # Send money
    if first == "2":
        if depth == 2:
            sess["data"]["recipient_phone"] = parts[1]
            return f"CON Send to {parts[1]}\nEnter amount (NGN):"
        elif depth == 3:
            try:
                amt = float(parts[2])
                if amt <= 0:
                    return "END Invalid amount."
                sess["data"]["amount_kobo"] = int(amt * 100)
                recipient = sess["data"].get("recipient_phone", "")
                return f"CON Confirm transfer:\nTo: {recipient}\nAmount: NGN {amt:,.2f}\n1. Confirm\n2. Cancel"
            except ValueError:
                return "END Invalid amount."
        elif depth == 4:
            if parts[3] == "1":
                result = initiate_p2p_transfer(phone, sess["data"].get("recipient_phone", ""), sess["data"].get("amount_kobo", 0))
                if result and result.get("success"):
                    sim = " (simulated)" if result.get("simulated") else ""
                    return f"END Transfer successful!{sim}\nRef: {result.get('reference','')}\nSMS confirmation sent."
                return "END Transfer failed. Check your balance and try again."
            return "END Transfer cancelled."

    # Bill pay
    if first == "3":
        if depth == 2:
            if parts[1] == "0":
                return MAIN_MENU
            biller_name = BILLER_NAMES.get(parts[1])
            biller_code = BILLER_CODES.get(parts[1])
            if not biller_name:
                return "END Invalid biller."
            sess["data"]["biller_code"] = biller_code
            sess["data"]["biller_name"] = biller_name
            return f"CON {biller_name}\nEnter account/meter number:"
        elif depth == 3:
            sess["data"]["customer_ref"] = parts[2]
            return "CON Enter amount (NGN):"
        elif depth == 4:
            try:
                amt = float(parts[3])
                if amt <= 0:
                    return "END Invalid amount."
                sess["data"]["amount_kobo"] = int(amt * 100)
                return f"CON Confirm payment:\nBiller: {sess['data'].get('biller_name','')}\nRef: {sess['data'].get('customer_ref','')}\nAmount: NGN {amt:,.2f}\n1. Confirm\n2. Cancel"
            except ValueError:
                return "END Invalid amount."
        elif depth == 5:
            if parts[4] == "1":
                result = pay_bill(phone, sess["data"].get("biller_code", ""), sess["data"].get("customer_ref", ""), sess["data"].get("amount_kobo", 0))
                if result and result.get("success"):
                    sim = " (simulated)" if result.get("simulated") else ""
                    return f"END Bill payment successful!{sim}\nRef: {result.get('reference','')}\nToken sent via SMS."
                return "END Bill payment failed. Please try again."
            return "END Payment cancelled."

    # Airtime
    if first == "4":
        if depth == 2:
            try:
                amt = float(parts[1])
                if amt <= 0:
                    return "END Invalid amount."
                sess["data"]["airtime_amount"] = amt
                return f"CON Confirm airtime:\nPhone: {phone}\nAmount: NGN {amt:,.2f}\n1. Confirm\n2. Cancel"
            except ValueError:
                return "END Invalid amount."
        elif depth == 3:
            if parts[2] == "1":
                amt = sess["data"].get("airtime_amount", 0)
                result = pay_bill(phone, "AIRTIME", phone, int(amt * 100))
                if result and result.get("success"):
                    return f"END Airtime of NGN {amt:,.2f} purchased!\nSMS confirmation sent."
                return "END Airtime purchase failed. Check your balance."
            return "END Purchase cancelled."

    # PIN change
    if first == "6":
        if depth == 2:
            sess["data"]["old_pin"] = parts[1]
            return "CON Enter your new 4-digit PIN:"
        elif depth == 3:
            new_pin = parts[2]
            if len(new_pin) != 4 or not new_pin.isdigit():
                return "END PIN must be exactly 4 digits."
            sess["data"]["new_pin"] = new_pin
            return "CON Confirm your new PIN:"
        elif depth == 4:
            confirm = parts[3]
            new_pin = sess["data"].get("new_pin", "")
            if confirm != new_pin:
                return "END PINs do not match. Please try again."
            success = change_pin(phone, sess["data"].get("old_pin", ""), new_pin)
            if success:
                return "END PIN changed successfully!"
            return "END PIN change failed. Check your current PIN."

    return "END Session expired. Please dial again."


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("USSD gateway v2 starting")
    yield
    sessions.clear()
    logger.info("USSD gateway shutting down")


import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(title="PayGate USSD Gateway", version="2.0.0", lifespan=lifespan)
setup_telemetry("ussd-gateway", app)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ussd-gateway", "active_sessions": len(sessions), "bridge_configured": bool(BRIDGE_URL)}


@app.post("/v1/ussd/callback")
async def ussd_callback(
    sessionId: str = Form(...),
    phoneNumber: str = Form(...),
    text: str = Form(default=""),
    serviceCode: str = Form(default=""),
):
    try:
        response = handle_ussd(sessionId, phoneNumber, text, serviceCode)
        logger.info(f"[ussd] session={sessionId} phone={phoneNumber} text={repr(text)} -> {response[:50]}")
        return PlainTextResponse(response)
    except Exception as e:
        logger.error(f"[ussd] error session={sessionId}: {e}", exc_info=True)
        return PlainTextResponse("END Service temporarily unavailable. Please try again.")


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse(
        f"# HELP paygate_ussd_active_sessions Active USSD sessions\n"
        f"# TYPE paygate_ussd_active_sessions gauge\n"
        f"paygate_ussd_active_sessions {len(sessions)}\n",
        media_type="text/plain",
    )


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


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8095"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, workers=4, log_level="warning")
