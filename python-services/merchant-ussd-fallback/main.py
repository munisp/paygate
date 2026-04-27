"""
PayGate — Merchant USSD/SMS Fallback Service (Wave 110)
==========================================================
FastAPI microservice providing USSD + SMS channel for merchants
who cannot access the web portal due to poor connectivity.

Critical operations supported via USSD (*737*PG#):
  1. Check settlement balance
  2. Approve / reject pending payout
  3. View last 5 transactions
  4. Generate payment link (SMS delivery)
  5. Check dispute status
  6. Emergency account freeze

Localisation (Wave 110):
  - Supported: en (English), ha (Hausa), yo (Yoruba), ig (Igbo), fr (French)
  - Language detected from ?lang= query param, persisted in session
  - Locale strings loaded from locales/{lang}.json at startup

Architecture:
  - Africa's Talking USSD callback → this service → Go bridge → tRPC
  - Termii SMS API for outbound messages
  - In-memory session store (swap with aioredis in production)
  - Rate limiting: 10 req/min per phone number
"""

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import httpx
import uvicorn
from fastapi import FastAPI, Form, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

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
DEFAULT_LANG = os.getenv("DEFAULT_LANG", "en")

# ─── Supported languages ──────────────────────────────────────────────────────
SUPPORTED_LANGS = {"en", "ha", "yo", "ig", "fr"}

# ─── Locale store ─────────────────────────────────────────────────────────────
_LOCALES: dict[str, dict] = {}


def _load_locales() -> None:
    """Load all locale JSON files from the locales/ directory at startup."""
    locales_dir = Path(__file__).parent / "locales"
    for lang in SUPPORTED_LANGS:
        locale_file = locales_dir / f"{lang}.json"
        if locale_file.exists():
            try:
                with open(locale_file, encoding="utf-8") as f:
                    data = json.load(f)
                _LOCALES[lang] = data.get("menu", {})
                logger.info("Loaded locale: %s (%s)", lang, data.get("name", lang))
            except Exception as exc:
                logger.warning("Failed to load locale %s: %s", lang, exc)
        else:
            logger.warning("Locale file not found: %s", locale_file)
    if "en" not in _LOCALES:
        _LOCALES["en"] = {}


def t(lang: str, key: str, **kwargs) -> str:
    """
    Translate key into the requested language.
    Falls back to English, then to the key itself.
    Applies str.format(**kwargs) for variable substitution.
    """
    text = _LOCALES.get(lang, {}).get(key) or _LOCALES.get("en", {}).get(key, key)
    if kwargs:
        try:
            text = text.format(**kwargs)
        except (KeyError, ValueError):
            pass
    return text


def _normalize_lang(lang: Optional[str]) -> str:
    """Normalise and validate a language code, falling back to DEFAULT_LANG."""
    if lang and lang.lower() in SUPPORTED_LANGS:
        return lang.lower()
    return DEFAULT_LANG


# ─── Session / rate-limit store ───────────────────────────────────────────────
_sessions: dict[str, dict] = {}
_rate_limits: dict[str, list[float]] = {}
SESSION_TTL = 300
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 10

# ─── Metrics ──────────────────────────────────────────────────────────────────
_metrics: dict[str, int] = {
    "ussd_sessions": 0,
    "sms_sent": 0,
    "bridge_calls": 0,
    "bridge_errors": 0,
    "rate_limited": 0,
}


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _bridge_headers() -> dict:
    return {"X-Internal-Key": BRIDGE_KEY, "Content-Type": "application/json"}


def _check_rate_limit(phone: str) -> bool:
    now = time.time()
    window = [ts for ts in _rate_limits.get(phone, []) if now - ts < RATE_LIMIT_WINDOW]
    if len(window) >= RATE_LIMIT_MAX:
        _metrics["rate_limited"] += 1
        return False
    window.append(now)
    _rate_limits[phone] = window
    return True


def _get_session(session_id: str) -> dict:
    session = _sessions.get(session_id, {})
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
    if not BRIDGE_URL:
        return None
    _metrics["bridge_calls"] += 1
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{BRIDGE_URL}{path}", headers=_bridge_headers(), params=params or {}
            )
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        _metrics["bridge_errors"] += 1
        logger.warning("Bridge GET %s failed: %s", path, exc)
        return None


async def bridge_post(path: str, body: dict) -> Optional[dict]:
    if not BRIDGE_URL:
        return None
    _metrics["bridge_calls"] += 1
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{BRIDGE_URL}{path}", headers=_bridge_headers(), json=body
            )
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        _metrics["bridge_errors"] += 1
        logger.warning("Bridge POST %s failed: %s", path, exc)
        return None


async def send_sms(phone: str, message: str) -> bool:
    if not TERMII_API_KEY:
        logger.info("[SMS STUB] To %s: %s", phone, message)
        _metrics["sms_sent"] += 1
        return True
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.ng.termii.com/api/sms/send",
                json={
                    "to": phone,
                    "from": TERMII_SENDER_ID,
                    "sms": message,
                    "type": "plain",
                    "channel": "generic",
                    "api_key": TERMII_API_KEY,
                },
            )
            r.raise_for_status()
            _metrics["sms_sent"] += 1
            return True
    except Exception as exc:
        logger.error("SMS send failed to %s: %s", phone, exc)
        return False


def _mask_amount(kobo: int) -> str:
    return f"NGN {kobo / 100:,.2f}"


# ─── USSD state machine ───────────────────────────────────────────────────────
async def handle_merchant_ussd(
    session_id: str,
    phone: str,
    text: str,
    service_code: str,
    lang: str = "en",
) -> str:
    """
    Main USSD state machine for merchant operations.
    Returns a string starting with CON (continue) or END (terminate).
    `lang` is persisted in the session so multi-step flows stay localised.
    """
    _metrics["ussd_sessions"] += 1
    session = _get_session(session_id)

    # Honour session language over request language mid-flow
    session_lang = session.get("lang", lang) if session else lang

    inputs = [v.strip() for v in text.split("*") if v.strip()] if text else []
    depth = len(inputs)
    logger.info(
        "USSD session=%s phone=%s depth=%d lang=%s", session_id, phone, depth, session_lang
    )

    # ── Root menu ──────────────────────────────────────────────────────────────
    if depth == 0:
        _set_session(session_id, {"phone": phone, "menu": "main", "lang": session_lang})
        return (
            f"CON {t(session_lang, 'app_name', default='PayGate Merchant')}\n"
            f"1. {t(session_lang, 'menu_balance_label', default='Settlement Balance')}\n"
            f"2. {t(session_lang, 'menu_payout_label', default='Approve Payout')}\n"
            f"3. {t(session_lang, 'menu_recent_label', default='Recent Transactions')}\n"
            f"4. {t(session_lang, 'menu_paylink_label', default='Generate Payment Link')}\n"
            f"5. {t(session_lang, 'menu_dispute_label', default='Dispute Status')}\n"
            f"6. {t(session_lang, 'menu_freeze_label', default='Freeze Account')}\n"
            f"0. {t(session_lang, 'menu_exit_label', default='Exit')}"
        )

    choice = inputs[-1]

    # ── Main menu choices ──────────────────────────────────────────────────────
    if depth == 1:
        if choice == "0":
            _clear_session(session_id)
            return f"END {t(session_lang, 'goodbye', default='Thank you for using PayGate.')}"

        if choice == "1":
            data = await bridge_get("/v1/merchant/settlement-balance", {"phone": phone})
            if data and data.get("balance_kobo") is not None:
                bal = _mask_amount(data["balance_kobo"])
                pending = _mask_amount(data.get("pending_kobo", 0))
                return (
                    f"END {t(session_lang, 'balance_result', default='Settlement Balance')}\n"
                    f"{t(session_lang, 'available_label', default='Available')}: {bal}\n"
                    f"{t(session_lang, 'pending_label', default='Pending')}: {pending}\n"
                    f"Updated: {data.get('updated_at', 'N/A')}"
                )
            return f"END {t(session_lang, 'balance_error', default='Unable to fetch balance. Please try again.')}"

        if choice == "2":
            data = await bridge_get("/v1/merchant/pending-payouts", {"phone": phone})
            payouts = (data or {}).get("payouts", [])
            if not payouts:
                return f"END {t(session_lang, 'no_pending_payouts', default='No pending payouts found.')}"
            _set_session(session_id, {
                "phone": phone, "menu": "payout", "payouts": payouts, "lang": session_lang,
            })
            items = "\n".join(
                f"{i+1}. {_mask_amount(p['amount_kobo'])} → {p['bank_name']}"
                for i, p in enumerate(payouts[:5])
            )
            return (
                f"CON {t(session_lang, 'pending_payouts_header', default='Pending Payouts:')}\n"
                f"{items}\n"
                f"{t(session_lang, 'payout_select_prompt', default='Enter payout number')}\n"
                f"0. {t(session_lang, 'back_label', default='Back')}"
            )

        if choice == "3":
            data = await bridge_get("/v1/merchant/recent-transactions", {"phone": phone})
            txns = (data or {}).get("transactions", [])
            if not txns:
                return f"END {t(session_lang, 'no_recent_txns', default='No recent transactions found.')}"
            lines = []
            for txn in txns[:5]:
                status = "✓" if txn.get("status") == "success" else "✗"
                lines.append(f"{status} {_mask_amount(txn['amount_kobo'])} - {txn.get('reference', '')[:8]}")
            return (
                f"END {t(session_lang, 'recent_txns_header', default='Recent Transactions:')}\n"
                + "\n".join(lines)
            )

        if choice == "4":
            _set_session(session_id, {"phone": phone, "menu": "paylink", "lang": session_lang})
            return f"CON {t(session_lang, 'enter_amount', default='Enter amount in Naira (e.g. 5000)')}"

        if choice == "5":
            data = await bridge_get("/v1/merchant/open-disputes", {"phone": phone})
            disputes = (data or {}).get("disputes", [])
            if not disputes:
                return f"END {t(session_lang, 'no_disputes', default='No open disputes.')}"
            lines = [
                f"{d.get('reference', '')[:10]} - {d.get('status', 'unknown')}"
                for d in disputes[:5]
            ]
            return (
                f"END {t(session_lang, 'disputes_header', default='Open Disputes:')}\n"
                + "\n".join(lines)
            )

        if choice == "6":
            _set_session(session_id, {"phone": phone, "menu": "freeze", "lang": session_lang})
            return (
                f"CON {t(session_lang, 'freeze_warning', default='EMERGENCY ACCOUNT FREEZE')}\n"
                f"{t(session_lang, 'freeze_description', default='This will block all incoming payments.')}\n"
                f"1. {t(session_lang, 'confirm_label', default='Confirm freeze')}\n"
                f"2. {t(session_lang, 'cancel_label', default='Cancel')}"
            )

        return f"END {t(session_lang, 'invalid_option', default='Invalid option. Please try again.')}"

    # ── Payout selection ───────────────────────────────────────────────────────
    if session.get("menu") == "payout" and depth == 2:
        payouts = session.get("payouts", [])
        if choice == "0":
            _clear_session(session_id)
            return f"END {t(session_lang, 'goodbye', default='Thank you for using PayGate.')}"
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(payouts):
                payout = payouts[idx]
                _set_session(session_id, {
                    **session, "menu": "payout_confirm", "selected_payout": payout,
                })
                return (
                    f"CON {t(session_lang, 'payout_confirm_header', default='Approve payout?')}\n"
                    f"{t(session_lang, 'amount_label', default='Amount')}: {_mask_amount(payout['amount_kobo'])}\n"
                    f"{t(session_lang, 'bank_label', default='Bank')}: {payout['bank_name']}\n"
                    f"{t(session_lang, 'account_label', default='Account')}: {payout.get('account_number', 'N/A')}\n"
                    f"1. {t(session_lang, 'approve_label', default='Approve')}\n"
                    f"2. {t(session_lang, 'reject_label', default='Reject')}\n"
                    f"0. {t(session_lang, 'cancel_label', default='Cancel')}"
                )
            return f"END {t(session_lang, 'invalid_selection', default='Invalid selection.')}"
        except ValueError:
            return f"END {t(session_lang, 'invalid_option', default='Invalid option.')}"

    # ── Payout confirmation ────────────────────────────────────────────────────
    if session.get("menu") == "payout_confirm" and depth == 3:
        payout = session.get("selected_payout", {})
        if choice == "1":
            result = await bridge_post("/v1/merchant/approve-payout", {
                "phone": phone, "payout_id": payout.get("id"), "channel": "ussd",
            })
            _clear_session(session_id)
            if result and result.get("success"):
                await send_sms(
                    phone,
                    f"PayGate: Payout of {_mask_amount(payout['amount_kobo'])} approved via USSD. Ref: {result.get('reference', 'N/A')}",
                )
                return (
                    f"END {t(session_lang, 'payout_approved', default='Payout approved!')}\n"
                    f"Ref: {result.get('reference', 'N/A')}"
                )
            return f"END {t(session_lang, 'payout_approval_failed', default='Approval failed. Please try the portal.')}"
        if choice == "2":
            result = await bridge_post("/v1/merchant/reject-payout", {
                "phone": phone, "payout_id": payout.get("id"), "channel": "ussd",
            })
            _clear_session(session_id)
            return (
                f"END {t(session_lang, 'payout_rejected', default='Payout rejected.')}"
                if result
                else f"END {t(session_lang, 'payout_rejection_failed', default='Rejection failed.')}"
            )
        _clear_session(session_id)
        return f"END {t(session_lang, 'transfer_cancelled', default='Cancelled.')}"

    # ── Payment link ───────────────────────────────────────────────────────────
    if session.get("menu") == "paylink" and depth == 2:
        try:
            amount_naira = float(choice.replace(",", ""))
            if amount_naira <= 0 or amount_naira > 10_000_000:
                return f"END {t(session_lang, 'amount_invalid', default='Invalid amount. Must be between 1 and 10,000,000 NGN.')}"
            amount_kobo = int(amount_naira * 100)
            result = await bridge_post("/v1/merchant/generate-payment-link", {
                "phone": phone, "amount_kobo": amount_kobo, "channel": "ussd",
            })
            _clear_session(session_id)
            if result and result.get("link"):
                await send_sms(phone, f"PayGate: Your payment link for {_mask_amount(amount_kobo)}: {result['link']}")
                return (
                    f"END {t(session_lang, 'paylink_created', default='Payment link created!')}\n"
                    f"{t(session_lang, 'paylink_sms_sent', default='Sent to')} {phone} {t(session_lang, 'via_sms', default='via SMS')}."
                )
            return f"END {t(session_lang, 'paylink_failed', default='Failed to create link. Try again.')}"
        except ValueError:
            return f"END {t(session_lang, 'amount_invalid', default='Invalid amount entered.')}"

    # ── Freeze confirmation ────────────────────────────────────────────────────
    if session.get("menu") == "freeze" and depth == 2:
        if choice == "1":
            result = await bridge_post("/v1/merchant/emergency-freeze", {
                "phone": phone, "channel": "ussd",
            })
            _clear_session(session_id)
            if result and result.get("success"):
                await send_sms(
                    phone,
                    "PayGate ALERT: Your merchant account has been frozen via USSD. Contact support to unfreeze: support@paygate.ng",
                )
                return f"END {t(session_lang, 'freeze_success', default='Account frozen. SMS confirmation sent. Contact support to unfreeze.')}"
            return f"END {t(session_lang, 'freeze_error', default='Freeze failed. Contact support immediately.')}"
        _clear_session(session_id)
        return f"END {t(session_lang, 'freeze_cancelled', default='Freeze cancelled.')}"

    _clear_session(session_id)
    return f"END {t(session_lang, 'session_timeout', default='Session expired. Please dial again.')}"


# ─── SMS OTP fallback ─────────────────────────────────────────────────────────
_otp_store: dict[str, dict] = {}
OTP_TTL = 300


def _generate_otp(phone: str) -> str:
    import random
    otp = f"{random.randint(100000, 999999)}"
    _otp_store[phone] = {"otp": otp, "expires": time.time() + OTP_TTL}
    return otp


def _verify_otp(phone: str, otp: str) -> bool:
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
    _load_locales()
    logger.info(
        "Merchant USSD Fallback Service v2.0 starting on port %d (locales: %s)",
        PORT, ", ".join(sorted(_LOCALES.keys())),
    )
    yield
    logger.info("Merchant USSD Fallback Service shutting down")


app = FastAPI(
    title="PayGate Merchant USSD Fallback",
    version="2.0.0",
    description="USSD/SMS fallback for merchants in low-connectivity environments. Supports EN/HA/YO/IG/FR.",
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
        "version": "2.0.0",
        "bridge_configured": bool(BRIDGE_URL),
        "sms_configured": bool(TERMII_API_KEY),
        "ussd_configured": bool(AT_API_KEY),
        "active_sessions": len(_sessions),
        "supported_languages": sorted(SUPPORTED_LANGS),
        "loaded_locales": sorted(_LOCALES.keys()),
        "default_lang": DEFAULT_LANG,
    }


@app.post("/v1/ussd/merchant/callback", response_class=PlainTextResponse)
async def merchant_ussd_callback(
    request: Request,
    sessionId: str = Form(...),
    phoneNumber: str = Form(...),
    text: str = Form(default=""),
    serviceCode: str = Form(default=""),
    lang: Optional[str] = Query(
        default=None,
        description="Language code: en (English), ha (Hausa), yo (Yoruba), ig (Igbo), fr (French)",
    ),
):
    """
    Africa's Talking USSD callback for merchant operations.

    Language selection:
    - Pass ?lang=ha for Hausa, ?lang=yo for Yoruba, ?lang=ig for Igbo, ?lang=fr for French
    - Defaults to DEFAULT_LANG env var (default: en)
    - Language is persisted in the session for multi-step flows
    """
    resolved_lang = _normalize_lang(lang)
    # Honour existing session language mid-flow
    existing_session = _get_session(sessionId)
    if existing_session and "lang" in existing_session:
        resolved_lang = existing_session["lang"]

    if not _check_rate_limit(phoneNumber):
        return PlainTextResponse(
            f"END {t(resolved_lang, 'rate_limit_exceeded', default='Too many requests. Please try again in 1 minute.')}"
        )
    try:
        response = await handle_merchant_ussd(
            session_id=sessionId,
            phone=phoneNumber,
            text=text,
            service_code=serviceCode,
            lang=resolved_lang,
        )
        return PlainTextResponse(response)
    except Exception as exc:
        logger.error("USSD handler error: %s", exc, exc_info=True)
        return PlainTextResponse(
            f"END {t(resolved_lang, 'error_generic', default='Service error. Please try again.')}"
        )


@app.post("/v1/sms/send-otp")
async def send_otp(
    request: Request,
    x_internal_key: Optional[str] = Header(default=None),
):
    """Send OTP via SMS when app push notifications are unavailable."""
    _check_internal_key(x_internal_key)
    body = await request.json()
    phone = body.get("phone")
    lang = _normalize_lang(body.get("lang"))
    if not phone:
        raise HTTPException(status_code=400, detail="phone required")
    if not _check_rate_limit(f"otp:{phone}"):
        raise HTTPException(status_code=429, detail="Too many OTP requests")
    otp = _generate_otp(phone)
    otp_messages = {
        "en": f"PayGate OTP: {otp}. Valid for 5 minutes. Do not share.",
        "ha": f"PayGate OTP: {otp}. Yana da inganci na minti 5. Kada ka raba.",
        "yo": f"PayGate OTP: {otp}. Wulo fun iṣẹju 5. Má pín.",
        "ig": f"PayGate OTP: {otp}. Dị mma maka nkeji 5. Echekwala.",
        "fr": f"PayGate OTP: {otp}. Valide 5 minutes. Ne pas partager.",
    }
    message = otp_messages.get(lang, otp_messages["en"])
    sent = await send_sms(phone, message)
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
    return {"valid": _verify_otp(phone, str(otp))}


@app.post("/v1/sms/send-alert")
async def send_alert(
    request: Request,
    x_internal_key: Optional[str] = Header(default=None),
):
    """Send a custom SMS alert to a merchant phone number."""
    _check_internal_key(x_internal_key)
    body = await request.json()
    phone = body.get("phone")
    message = body.get("message")
    if not phone or not message:
        raise HTTPException(status_code=400, detail="phone and message required")
    sent = await send_sms(phone, message)
    return {"success": sent}


@app.get("/v1/locales")
async def list_locales():
    """Return available locale codes and their display names."""
    result = {}
    locales_dir = Path(__file__).parent / "locales"
    for lang in SUPPORTED_LANGS:
        locale_file = locales_dir / f"{lang}.json"
        if locale_file.exists():
            try:
                with open(locale_file, encoding="utf-8") as f:
                    data = json.load(f)
                result[lang] = {
                    "name": data.get("name", lang),
                    "loaded": lang in _LOCALES,
                    "key_count": len(_LOCALES.get(lang, {})),
                }
            except Exception:
                result[lang] = {"name": lang, "loaded": False, "key_count": 0}
    return result


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics(x_internal_key: Optional[str] = Header(default=None)):
    """Prometheus-compatible metrics endpoint."""
    _check_internal_key(x_internal_key)
    lines = [
        "# HELP paygate_ussd_sessions_total Total USSD sessions handled",
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
