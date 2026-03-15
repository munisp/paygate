"""
PayGate Kiosk Health Monitor
==============================
Aggregates health telemetry from POS kiosk devices and exposes
a summary endpoint for the portal dashboard.

Endpoints:
  POST /v1/kiosk/heartbeat  — Receive heartbeat from a kiosk
  GET  /v1/kiosk/summary    — Get health summary for all kiosks
  GET  /v1/kiosk/:id        — Get health for a specific kiosk
  GET  /health
  GET  /metrics

Environment variables:
  PORT              — HTTP port (default: 8096)
  HEARTBEAT_TTL_SEC — Seconds before a kiosk is marked offline (default: 120)
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("kiosk-health")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

HEARTBEAT_TTL = int(os.getenv("HEARTBEAT_TTL_SEC", "120"))

# ─── In-memory kiosk registry ─────────────────────────────────────────────────
kiosks: dict[str, dict] = {}


class KioskHeartbeat(BaseModel):
    kiosk_id: str
    merchant_id: str
    location: Optional[str] = None
    firmware_version: Optional[str] = None
    battery_percent: Optional[int] = Field(default=None, ge=0, le=100)
    paper_level_percent: Optional[int] = Field(default=None, ge=0, le=100)
    network_type: Optional[str] = None  # "wifi" | "4g" | "ethernet"
    signal_strength_dbm: Optional[int] = None
    last_transaction_at_ms: Optional[int] = None
    error_codes: list[str] = Field(default_factory=list)


class KioskStatus(BaseModel):
    kiosk_id: str
    merchant_id: str
    status: str  # "online" | "offline" | "warning"
    last_seen_ms: int
    location: Optional[str] = None
    battery_percent: Optional[int] = None
    paper_level_percent: Optional[int] = None
    error_codes: list[str] = []
    alerts: list[str] = []


class KioskSummary(BaseModel):
    total: int
    online: int
    offline: int
    warning: int
    kiosks: list[KioskStatus]


def get_kiosk_status(kiosk_id: str) -> KioskStatus:
    data = kiosks.get(kiosk_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Kiosk {kiosk_id} not found")

    now_ms = int(time.time() * 1000)
    age_sec = (now_ms - data["last_seen_ms"]) / 1000
    alerts = []

    if age_sec > HEARTBEAT_TTL:
        status = "offline"
        alerts.append(f"No heartbeat for {int(age_sec)}s")
    elif data.get("error_codes"):
        status = "warning"
        alerts.extend([f"Error: {e}" for e in data["error_codes"]])
    elif data.get("battery_percent") is not None and data["battery_percent"] < 20:
        status = "warning"
        alerts.append(f"Low battery: {data['battery_percent']}%")
    elif data.get("paper_level_percent") is not None and data["paper_level_percent"] < 15:
        status = "warning"
        alerts.append(f"Low paper: {data['paper_level_percent']}%")
    else:
        status = "online"

    return KioskStatus(
        kiosk_id=kiosk_id,
        merchant_id=data["merchant_id"],
        status=status,
        last_seen_ms=data["last_seen_ms"],
        location=data.get("location"),
        battery_percent=data.get("battery_percent"),
        paper_level_percent=data.get("paper_level_percent"),
        error_codes=data.get("error_codes", []),
        alerts=alerts,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Kiosk health monitor starting")
    yield
    logger.info("Kiosk health monitor shutting down")


app = FastAPI(title="PayGate Kiosk Health", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "kiosk-health", "kiosks_tracked": len(kiosks)}


@app.post("/v1/kiosk/heartbeat")
async def heartbeat(hb: KioskHeartbeat):
    kiosks[hb.kiosk_id] = {
        **hb.model_dump(),
        "last_seen_ms": int(time.time() * 1000),
    }
    return {"received": True, "kiosk_id": hb.kiosk_id}


@app.get("/v1/kiosk/summary", response_model=KioskSummary)
async def summary(merchant_id: Optional[str] = None):
    all_statuses = [get_kiosk_status(kid) for kid in kiosks if
                    (merchant_id is None or kiosks[kid]["merchant_id"] == merchant_id)]
    return KioskSummary(
        total=len(all_statuses),
        online=sum(1 for k in all_statuses if k.status == "online"),
        offline=sum(1 for k in all_statuses if k.status == "offline"),
        warning=sum(1 for k in all_statuses if k.status == "warning"),
        kiosks=all_statuses,
    )


@app.get("/v1/kiosk/{kiosk_id}", response_model=KioskStatus)
async def get_kiosk(kiosk_id: str):
    return get_kiosk_status(kiosk_id)


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    total = len(kiosks)
    return PlainTextResponse(
        f"paygate_kiosk_total {total}\n",
        media_type="text/plain",
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8096"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
