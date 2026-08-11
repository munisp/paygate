"""
PayGate Payroll Microservice
=============================
Handles payroll run computation, tax calculations (PAYE, pension, NHF),
and bulk disbursement to the Go bridge.

Endpoints:
  POST /v1/payroll/compute   — Compute net pay for a payroll run
  POST /v1/payroll/disburse  — Trigger bulk disbursement via bridge
  GET  /health
  GET  /metrics

Environment variables:
  PORT              — HTTP port (default: 8093)
  BRIDGE_URL        — Go bridge base URL
  BRIDGE_INTERNAL_KEY
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

logger = logging.getLogger("payroll")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ─── Nigeria tax constants (2024) ─────────────────────────────────────────────
PENSION_RATE = 0.08          # 8% employee pension
NHF_RATE = 0.025             # 2.5% NHF
PAYE_BANDS = [               # (upper_limit_annual, rate)
    (300_000, 0.07),
    (600_000, 0.11),
    (1_100_000, 0.15),
    (1_600_000, 0.19),
    (3_200_000, 0.21),
    (float("inf"), 0.24),
]


def compute_paye(annual_gross: float) -> float:
    """Compute annual PAYE tax using Nigeria's graduated bands."""
    # Consolidated Relief Allowance: higher of 200k or 1% of gross, plus 20% of gross
    cra = max(200_000, 0.01 * annual_gross) + 0.20 * annual_gross
    taxable = max(0, annual_gross - cra)
    tax = 0.0
    prev = 0.0
    for limit, rate in PAYE_BANDS:
        band = min(taxable, limit) - prev
        if band <= 0:
            break
        tax += band * rate
        prev = limit
    return tax


class EmployeeInput(BaseModel):
    employee_id: str
    name: str
    annual_gross_kobo: int = Field(..., gt=0)
    bank_code: str
    account_number: str


class PayrollRunRequest(BaseModel):
    run_id: str
    merchant_id: str
    employees: list[EmployeeInput] = Field(..., max_length=500)
    pay_period: str  # "2024-01"


class EmployeePayslip(BaseModel):
    employee_id: str
    name: str
    gross_kobo: int
    pension_kobo: int
    nhf_kobo: int
    paye_kobo: int
    net_kobo: int
    bank_code: str
    account_number: str


class PayrollRunResponse(BaseModel):
    run_id: str
    total_gross_kobo: int
    total_net_kobo: int
    total_deductions_kobo: int
    payslips: list[EmployeePayslip]
    computed_at_ms: int


def compute_payroll(req: PayrollRunRequest) -> PayrollRunResponse:
    payslips = []
    for emp in req.employees:
        annual_gross = emp.annual_gross_kobo / 100  # kobo → NGN
        monthly_gross = annual_gross / 12

        pension = monthly_gross * PENSION_RATE
        nhf = monthly_gross * NHF_RATE
        annual_paye = compute_paye(annual_gross)
        monthly_paye = annual_paye / 12

        net = monthly_gross - pension - nhf - monthly_paye

        payslips.append(EmployeePayslip(
            employee_id=emp.employee_id,
            name=emp.name,
            gross_kobo=int(monthly_gross * 100),
            pension_kobo=int(pension * 100),
            nhf_kobo=int(nhf * 100),
            paye_kobo=int(monthly_paye * 100),
            net_kobo=int(net * 100),
            bank_code=emp.bank_code,
            account_number=emp.account_number,
        ))

    total_gross = sum(p.gross_kobo for p in payslips)
    total_net = sum(p.net_kobo for p in payslips)

    return PayrollRunResponse(
        run_id=req.run_id,
        total_gross_kobo=total_gross,
        total_net_kobo=total_net,
        total_deductions_kobo=total_gross - total_net,
        payslips=payslips,
        computed_at_ms=int(time.time() * 1000),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Payroll service starting")
    yield
    logger.info("Payroll service shutting down")


app = FastAPI(title="PayGate Payroll", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "payroll"}


@app.post("/v1/payroll/compute", response_model=PayrollRunResponse)
async def compute(req: PayrollRunRequest):
    try:
        return compute_payroll(req)
    except Exception as e:
        logger.error(f"Payroll compute error run={req.run_id}: {e}")
        raise HTTPException(status_code=500, detail="Payroll computation failed")


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse("# payroll metrics\n", media_type="text/plain")


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
    port = int(os.getenv("PORT", "8093"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, workers=4, log_level="warning")
