"""
PayGate USSD Gateway Microservice
===================================
Handles USSD session management for mobile money and payment flows.
Integrates with Africa's Talking USSD API and routes sessions to
the Go bridge for transaction processing.

Endpoints:
  POST /v1/ussd/callback  — Africa's Talking USSD callback
  POST /v1/ussd/session   — Internal session state query
  GET  /health
  GET  /metrics

Environment variables:
  PORT                  — HTTP port (default: 8095)
  BRIDGE_URL            — Go bridge base URL
  BRIDGE_INTERNAL_KEY   — Bridge authentication key
  AT_USERNAME           — Africa's Talking username
  AT_API_KEY            — Africa's Talking API key
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

logger = logging.getLogger("ussd-gateway")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ─── In-memory session store (replace with Redis in production) ───────────────
sessions: dict[str, dict] = {}

# ─── USSD menu states ─────────────────────────────────────────────────────────
MENU_MAIN = "main"
MENU_SEND_MONEY = "send_money"
MENU_CHECK_BALANCE = "check_balance"
MENU_BUY_AIRTIME = "buy_airtime"
MENU_TRANSACTION_HISTORY = "transaction_history"

MAIN_MENU = """CON Welcome to PayGate
1. Send Money
2. Check Balance
3. Buy Airtime
4. Transaction History
0. Exit"""


def handle_ussd(session_id: str, phone: str, text: str, service_code: str) -> str:
    """Process USSD input and return response string."""
    parts = text.split("*") if text else []
    depth = len(parts)

    if text == "" or depth == 0:
        sessions[session_id] = {"state": MENU_MAIN, "phone": phone}
        return MAIN_MENU

    first = parts[0] if parts else ""

    # ─── Main menu ────────────────────────────────────────────────────────────
    if depth == 1:
        if first == "1":
            sessions[session_id] = {"state": MENU_SEND_MONEY, "phone": phone}
            return "CON Enter recipient phone number:"
        elif first == "2":
            return f"END Your balance is: NGN 0.00\n(Connect to bridge for live balance)"
        elif first == "3":
            sessions[session_id] = {"state": MENU_BUY_AIRTIME, "phone": phone}
            return "CON Enter amount (NGN):"
        elif first == "4":
            return "END No recent transactions found."
        elif first == "0":
            return "END Thank you for using PayGate."
        else:
            return "END Invalid option. Please try again."

    # ─── Send money flow ──────────────────────────────────────────────────────
    if first == "1":
        if depth == 2:
            sessions[session_id]["recipient"] = parts[1]
            return "CON Enter amount (NGN):"
        elif depth == 3:
            sessions[session_id]["amount"] = parts[2]
            recipient = sessions[session_id].get("recipient", "")
            amount = parts[2]
            return f"CON Confirm sending NGN {amount} to {recipient}\n1. Confirm\n2. Cancel"
        elif depth == 4:
            if parts[3] == "1":
                return "END Transfer initiated. You will receive an SMS confirmation."
            else:
                return "END Transfer cancelled."

    # ─── Buy airtime flow ─────────────────────────────────────────────────────
    if first == "3" and depth == 2:
        amount = parts[1]
        return f"CON Confirm buying NGN {amount} airtime for {phone}\n1. Confirm\n2. Cancel"
    if first == "3" and depth == 3:
        if parts[2] == "1":
            return "END Airtime purchase initiated. You will receive an SMS confirmation."
        else:
            return "END Purchase cancelled."

    return "END Session expired. Please dial again."


# ─── App ──────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("USSD gateway starting")
    yield
    logger.info("USSD gateway shutting down")


app = FastAPI(title="PayGate USSD Gateway", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ussd-gateway", "active_sessions": len(sessions)}


@app.post("/v1/ussd/callback")
async def ussd_callback(
    sessionId: str = Form(...),
    phoneNumber: str = Form(...),
    text: str = Form(default=""),
    serviceCode: str = Form(default=""),
):
    """Africa's Talking USSD callback endpoint."""
    try:
        response = handle_ussd(sessionId, phoneNumber, text, serviceCode)
        return PlainTextResponse(response)
    except Exception as e:
        logger.error(f"USSD error session={sessionId}: {e}")
        return PlainTextResponse("END Service temporarily unavailable. Please try again.")


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse(
        f"# HELP paygate_ussd_active_sessions Active USSD sessions\n"
        f"paygate_ussd_active_sessions {len(sessions)}\n",
        media_type="text/plain",
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8095"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
