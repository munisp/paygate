"""
PayGate — Merchant USSD/SMS Fallback Service (Wave 109)
==========================================================
FastAPI microservice that provides a USSD + SMS channel for merchants
who cannot access the web portal due to poor connectivity.

Critical operations supported via USSD (*737*PG#):
  1. Check settlement balance
  2. Approve / reject pending payout
  3. View last 5 transactions
  4. Generate payment link (SMS delivery)
  5. Check dispute status
  6. Emergency account freeze

SMS fallback (Termii / Africa's Talking):
  - Sends OTP for 2FA when app is unreachable
  - Delivers payment confirmations when push fails
  - Sends settlement alerts

Architecture:
  - Africa's Talking USSD callback → this service → Go bridge → tRPC
  - Termii SMS API for outbound messages
  - Redis for session state (TTL: 5 min)
  - Rate limiting: 10 req/min per phone number

Environment variables:
  PORT                  — HTTP port (default: 8099)
  BRIDGE_URL            — Go bridge base URL
  BRIDGE_INTERNAL_KEY   — Bridge authentication key
  AT_USERNAME           — Africa's Talking username
  AT_API_KEY            — Africa's Talking API key
  TERMII_API_KEY        — Termii API key for SMS
  TERMII_SENDER_ID      — Termii sender ID (default: PayGate)
  REDIS_URL             — Redis connection URL
  INTERNAL_API_KEY      — Internal API key for /admin endpoints
  LOG_LEVEL             — Logging level (default: INFO)
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import httpx
import uvicorn
from fastapi import FastAPI, Form, Header, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

logger = logging.getLogger("merchant-ussd-fallback")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ─── Config ───────────────────────────────────────────────────────────────────
PORT = int(os.getenv("PORT", "8099"))
BRIDGE_URL = os.getenv("BRIDGE_URL", "").rstrip("/")
BRIDGE_KEY = os.getenv("BRIDGE_INTERNAL_KEY", "")
AT_USERNAME = os.getenv("AT_USERNAME", "")
AT_API_KEY = os.getenv("AT_API_KEY", "")
TERMII_API_KEY = os.getenv("TERMII_API_KEY", "")
TERMII_SENDER_ID = os.getenv("TERMII_SENDER_ID", "PayGate")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# ─── In-memory session store (Redis replacement for dev) ─────────────────────
# In production, swap with aioredis
_sessions: dict[str, dict] = {}
_rate_limits: dict[str, list[float]] = {}

SESSION_TTL = 300  # 5 minutes
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 10  # requests per window

# ─── Metrics ──────────────────────────────────────────────────────────────────
_metrics = {
    "ussd_sessions": 0,
    "sms_sent": 0,
    "bridge_calls": 0,
    "bridge_errors": 0,
    "rate_limited": 0,
}

# ─── USSD menu strings ────────────────────────────────────────────────────────
MAIN_MENU = (
    "CON PayGate Merchant\n"
    "1. Settlement Balance\n"
    "2. Approve Payout\n"
    "3. Recent Transactions\n"
    "4. Generate Payment Link\n"
    "5. Dispute Status\n"
    "6. Freeze Account\n"
    "0. Exit"
)

PAYOUT_MENU = (
    "CON Pending Payouts:\n"
    "{items}\n"
    "Enter payout number to approve\n"
    "Or 0 to go back"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _bridge_headers() -> dict:
    return {
        "X-Internal-Key": BRIDGE_KEY,
        "Content-Type": "application/json",
    }


def _check_rate_limit(phone: str) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    now = time.time()
    window = _rate_limits.get(phone, [])
    # Remove entries outside the window
    window = [t for t in window if now - t < RATE_LIMIT_WINDOW]
    if len(window) >= RATE_LIMIT_MAX:
        _metrics["rate_limited"] += 1
        return False
    window.append(now)
    _rate_limits[phone] = window
    return True


def _get_session(session_id: str) -> dict:
    session = _sessions.get(session_id, {})
    # Check TTL
    if session and time.time() - session.get("_created", 0) > SESSION_TTL:
        _sessions.pop(session_id, None)
        return {}
    return session


def _set_session(session_id: str, data: dict) -> None:
    data["_created"] = data.get("_created", time.time())
    _sessions[session_id] = data


def _clear_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


async def bridge_get(path: str, params: dict = None) -> Optional[dict]:
    """Call the Go bridge with a GET request."""
    if not BRIDGE_URL:
        return None
    _metrics["bridge_calls"] += 1
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{BRIDGE_URL}{path}",
                headers=_bridge_headers(),
                params=params or {},
            )
            r.raise_for_status()
            return r.json()
    except Exception as e:
        _metrics["bridge_errors"] += 1
        logger.warning("Bridge GET %s failed: %s", path, e)
        return None


async def bridge_post(path: str, body: dict) -> Optional[dict]:
    """Call the Go bridge with a POST request."""
    if not BRIDGE_URL:
        return None
    _metrics["bridge_calls"] += 1
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{BRIDGE_URL}{path}",
                headers=_bridge_headers(),
                json=body,
            )
            r.raise_for_status()
            return r.json()
    except Exception as e:
        _metrics["bridge_errors"] += 1
        logger.warning("Bridge POST %s failed: %s", path, e)
        return None


async def send_sms(phone: str, message: str) -> bool:
    """Send SMS via Termii API."""
    if not TERMII_API_KEY:
        logger.info("[SMS STUB] To %s: %s", phone, message)
        _metrics["sms_sent"] += 1
        return True
    try:
        payload = {
            "to": phone,
            "from": TERMII_SENDER_ID,
            "sms": message,
            "type": "plain",
            "channel": "generic",
            "api_key": TERMII_API_KEY,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.ng.termii.com/api/sms/send",
                json=payload,
            )
            r.raise_for_status()
            _metrics["sms_sent"] += 1
            logger.info("SMS sent to %s", phone)
            return True
    except Exception as e:
        logger.error("SMS send failed to %s: %s", phone, e)
        return False


def _mask_amount(kobo: int) -> str:
    """Format kobo amount as NGN string."""
    naira = kobo / 100
    return f"NGN {naira:,.2f}"


# ─── USSD session handler ─────────────────────────────────────────────────────

async def handle_merchant_ussd(
    session_id: str,
    phone: str,
    text: str,
    service_code: str,
) -> str:
    """
    Main USSD state machine for merchant operations.
    Returns a string starting with CON (continue) or END (terminate).
    """
    _metrics["ussd_sessions"] += 1
    session = _get_session(session_id)
    inputs = [t.strip() for t in text.split("*") if t.strip()] if text else []
    depth = len(inputs)

    logger.info("USSD session=%s phone=%s text=%r depth=%d", session_id, phone, text, depth)

    # ── Root menu ──────────────────────────────────────────────────────────────
    if depth == 0:
        _set_session(session_id, {"phone": phone, "menu": "main"})
        return MAIN_MENU

    choice = inputs[-1]

    # ── Main menu choices ──────────────────────────────────────────────────────
    if depth == 1:
        if choice == "0":
            _clear_session(session_id)
            return "END Thank you for using PayGate."

        if choice == "1":
            # Settlement balance
            data = await bridge_get("/v1/merchant/settlement-balance", {"phone": phone})
            if data and data.get("balance_kobo") is not None:
                bal = _mask_amount(data["balance_kobo"])
                pending = _mask_amount(data.get("pending_kobo", 0))
                return (
                    f"END Settlement Balance\n"
                    f"Available: {bal}\n"
                    f"Pending: {pending}\n"
                    f"Updated: {data.get('updated_at', 'N/A')}"
                )
            return "END Unable to fetch balance. Please try again."

        if choice == "2":
            # Approve payout — list pending payouts
            data = await bridge_get("/v1/merchant/pending-payouts", {"phone": phone})
            payouts = (data or {}).get("payouts", [])
            if not payouts:
                return "END No pending payouts found."
            _set_session(session_id, {
                "phone": phone,
                "menu": "payout",
                "payouts": payouts,
            })
            items = "\n".join(
                f"{i+1}. {_mask_amount(p['amount_kobo'])} → {p['bank_name']}"
                for i, p in enumerate(payouts[:5])
            )
            return PAYOUT_MENU.format(items=items)

        if choice == "3":
            # Recent transactions
            data = await bridge_get("/v1/merchant/recent-transactions", {"phone": phone})
            txns = (data or {}).get("transactions", [])
            if not txns:
                return "END No recent transactions found."
            lines = []
            for t in txns[:5]:
                status = "✓" if t.get("status") == "success" else "✗"
                lines.append(f"{status} {_mask_amount(t['amount_kobo'])} - {t.get('reference', '')[:8]}")
            return "END Recent Transactions:\n" + "\n".join(lines)

        if choice == "4":
            # Generate payment link
            _set_session(session_id, {"phone": phone, "menu": "paylink"})
            return "CON Enter amount in Naira\n(e.g. 5000 for NGN 5,000)"

        if choice == "5":
            # Dispute status
            data = await bridge_get("/v1/merchant/open-disputes", {"phone": phone})
            disputes = (data or {}).get("disputes", [])
            if not disputes:
                return "END No open disputes."
            lines = [
                f"{d.get('reference', '')[:10]} - {d.get('status', 'unknown')}"
                for d in disputes[:5]
            ]
            return "END Open Disputes:\n" + "\n".join(lines)

        if choice == "6":
            # Emergency freeze
            _set_session(session_id, {"phone": phone, "menu": "freeze"})
            return (
                "CON EMERGENCY ACCOUNT FREEZE\n"
                "This will block all incoming payments.\n"
                "1. Confirm freeze\n"
                "2. Cancel"
            )

        return "END Invalid option. Please try again."

    # ── Payout approval flow ───────────────────────────────────────────────────
    if session.get("menu") == "payout" and depth == 2:
        payouts = session.get("payouts", [])
        if choice == "0":
            _clear_session(session_id)
            return MAIN_MENU.replace("CON ", "END ")

        try:
            idx = int(choice) - 1
            if 0 <= idx < len(payouts):
                payout = payouts[idx]
                _set_session(session_id, {
                    **session,
                    "menu": "payout_confirm",
                    "selected_payout": payout,
                })
                return (
                    f"CON Approve payout?\n"
                    f"Amount: {_mask_amount(payout['amount_kobo'])}\n"
                    f"Bank: {payout['bank_name']}\n"
                    f"Account: {payout.get('account_number', 'N/A')}\n"
                    f"1. Approve\n"
                    f"2. Reject\n"
                    f"0. Cancel"
                )
        except (ValueError, IndexError):
            pass
        return "END Invalid selection."

    if session.get("menu") == "payout_confirm" and depth == 3:
        payout = session.get("selected_payout", {})
        if choice == "1":
            result = await bridge_post("/v1/merchant/approve-payout", {
                "phone": phone,
                "payout_id": payout.get("id"),
                "channel": "ussd",
            })
            _clear_session(session_id)
            if result and result.get("success"):
                await send_sms(
                    phone,
                    f"PayGate: Payout of {_mask_amount(payout['amount_kobo'])} approved via USSD. Ref: {result.get('reference', 'N/A')}"
                )
                return f"END Payout approved!\nRef: {result.get('reference', 'N/A')}"
            return "END Approval failed. Please try the portal."

        if choice == "2":
            result = await bridge_post("/v1/merchant/reject-payout", {
                "phone": phone,
                "payout_id": payout.get("id"),
                "channel": "ussd",
            })
            _clear_session(session_id)
            return "END Payout rejected." if result else "END Rejection failed."

        _clear_session(session_id)
        return "END Cancelled."

    # ── Payment link flow ──────────────────────────────────────────────────────
    if session.get("menu") == "paylink" and depth == 2:
        try:
            amount_naira = float(choice.replace(",", ""))
            if amount_naira <= 0 or amount_naira > 10_000_000:
                return "END Invalid amount. Must be between 1 and 10,000,000 NGN."
            amount_kobo = int(amount_naira * 100)
            result = await bridge_post("/v1/merchant/generate-payment-link", {
                "phone": phone,
                "amount_kobo": amount_kobo,
                "channel": "ussd",
            })
            _clear_session(session_id)
            if result and result.get("link"):
                link = result["link"]
                await send_sms(phone, f"PayGate: Your payment link for {_mask_amount(amount_kobo)}: {link}")
                return f"END Payment link created!\nSent to {phone} via SMS."
            return "END Failed to create link. Try again."
        except ValueError:
            return "END Invalid amount entered."

    # ── Freeze confirmation ────────────────────────────────────────────────────
    if session.get("menu") == "freeze" and depth == 2:
        if choice == "1":
            result = await bridge_post("/v1/merchant/emergency-freeze", {
                "phone": phone,
                "channel": "ussd",
            })
            _clear_session(session_id)
            if result and result.get("success"):
                await send_sms(
                    phone,
                    "PayGate ALERT: Your merchant account has been frozen via USSD. Contact support to unfreeze: support@paygate.ng"
                )
                return "END Account frozen.\nSMS confirmation sent.\nContact support to unfreeze."
            return "END Freeze failed. Contact support immediately."
        _clear_session(session_id)
        return "END Freeze cancelled."

    _clear_session(session_id)
    return "END Session expired. Please dial again."


# ─── SMS OTP fallback ─────────────────────────────────────────────────────────

_otp_store: dict[str, dict] = {}  # phone → {otp, expires}
OTP_TTL = 300  # 5 minutes


def _generate_otp(phone: str) -> str:
    """Generate a 6-digit OTP and store it."""
    import random
    otp = f"{random.randint(100000, 999999)}"
    _otp_store[phone] = {"otp": otp, "expires": time.time() + OTP_TTL}
    return otp


def _verify_otp(phone: str, otp: str) -> bool:
    """Verify OTP and consume it."""
    stored = _otp_store.get(phone)
    if not stored:
        return False
    if time.time() > stored["expires"]:
        _otp_store.pop(phone, None)
        return False
    if stored["otp"] != otp:
        return False
    _otp_store.pop(phone, None)
    return True


# ─── App ──────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Merchant USSD Fallback Service starting on port %d", PORT)
    yield
    logger.info("Merchant USSD Fallback Service shutting down")


app = FastAPI(
    title="PayGate Merchant USSD Fallback",
    version="1.0.0",
    lifespan=lifespan,
)


def _check_internal_key(x_internal_key: Optional[str]) -> None:
    if INTERNAL_API_KEY and x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "merchant-ussd-fallback",
        "version": "1.0.0",
        "bridge_configured": bool(BRIDGE_URL),
        "sms_configured": bool(TERMII_API_KEY),
        "ussd_configured": bool(AT_API_KEY),
        "active_sessions": len(_sessions),
    }


@app.post("/v1/ussd/merchant/callback", response_class=PlainTextResponse)
async def merchant_ussd_callback(
    request: Request,
    sessionId: str = Form(...),
    phoneNumber: str = Form(...),
    text: str = Form(default=""),
    serviceCode: str = Form(default=""),
):
    """Africa's Talking USSD callback for merchant operations."""
    if not _check_rate_limit(phoneNumber):
        return PlainTextResponse("END Too many requests. Please try again in 1 minute.")

    try:
        response = await handle_merchant_ussd(
            session_id=sessionId,
            phone=phoneNumber,
            text=text,
            service_code=serviceCode,
        )
        return PlainTextResponse(response)
    except Exception as e:
        logger.error("USSD handler error: %s", e, exc_info=True)
        return PlainTextResponse("END Service error. Please try again.")


@app.post("/v1/sms/send-otp")
async def send_otp(
    request: Request,
    x_internal_key: Optional[str] = Header(default=None),
):
    """Send OTP via SMS when app push notifications are unavailable."""
    _check_internal_key(x_internal_key)
    body = await request.json()
    phone = body.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="phone required")

    if not _check_rate_limit(f"otp:{phone}"):
        raise HTTPException(status_code=429, detail="Too many OTP requests")

    otp = _generate_otp(phone)
    sent = await send_sms(phone, f"PayGate OTP: {otp}. Valid for 5 minutes. Do not share.")

    return {"success": sent, "expires_in": OTP_TTL}


@app.post("/v1/sms/verify-otp")
async def verify_otp(
    request: Request,
    x_internal_key: Optional[str] = Header(default=None),
):
    """Verify OTP submitted by merchant."""
    _check_internal_key(x_internal_key)
    body = await request.json()
    phone = body.get("phone")
    otp = body.get("otp")
    if not phone or not otp:
        raise HTTPException(status_code=400, detail="phone and otp required")

    valid = _verify_otp(phone, str(otp))
    return {"valid": valid}


@app.post("/v1/sms/send-alert")
async def send_alert(
    request: Request,
    x_internal_key: Optional[str] = Header(default=None),
):
    """Send a payment/settlement alert SMS when push notification fails."""
    _check_internal_key(x_internal_key)
    body = await request.json()
    phone = body.get("phone")
    message = body.get("message")
    if not phone or not message:
        raise HTTPException(status_code=400, detail="phone and message required")

    sent = await send_sms(phone, message)
    return {"success": sent}


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics(x_internal_key: Optional[str] = Header(default=None)):
    _check_internal_key(x_internal_key)
    lines = [
        "# HELP paygate_ussd_sessions_total Total USSD sessions",
        "# TYPE paygate_ussd_sessions_total counter",
        f"paygate_ussd_sessions_total {_metrics['ussd_sessions']}",
        "# HELP paygate_sms_sent_total Total SMS messages sent",
        "# TYPE paygate_sms_sent_total counter",
        f"paygate_sms_sent_total {_metrics['sms_sent']}",
        "# HELP paygate_bridge_calls_total Total Go bridge calls",
        "# TYPE paygate_bridge_calls_total counter",
        f"paygate_bridge_calls_total {_metrics['bridge_calls']}",
        "# HELP paygate_bridge_errors_total Total Go bridge errors",
        "# TYPE paygate_bridge_errors_total counter",
        f"paygate_bridge_errors_total {_metrics['bridge_errors']}",
        "# HELP paygate_rate_limited_total Total rate-limited requests",
        "# TYPE paygate_rate_limited_total counter",
        f"paygate_rate_limited_total {_metrics['rate_limited']}",
        "# HELP paygate_active_sessions Current active USSD sessions",
        "# TYPE paygate_active_sessions gauge",
        f"paygate_active_sessions {len(_sessions)}",
    ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
