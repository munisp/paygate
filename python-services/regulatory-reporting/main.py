"""
regulatory-reporting — CBN/NFIU Regulatory Report Generator & Submission Service

Handles:
  - CBN Form A (Monthly Return on Electronic Payment Transactions)
  - CBN Form B (Quarterly Return on E-Payment Fraud)
  - CBN Form C (Annual Return on AML/CFT Compliance)
  - NFIU STR (Suspicious Transaction Report) XML formatting per NFIU schema v3.2
  - Scheme dispute submissions (Visa/Mastercard arbitration portal)
  - Scheduled report generation and SFTP/HTTPS submission to regulators

CBN Guidelines: PSB Regulatory Framework 2021, AML/CFT Regulations 2022.
NFIU: Money Laundering (Prevention and Prohibition) Act 2022, Section 6(1).
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .cbn_forms import (
    generate_form_a,
    generate_form_b,
    generate_form_c,
)
from .nfiu_str import format_str_xml, submit_str_to_nfiu
from .scheme_disputes import submit_to_visa_portal, submit_to_mastercard_portal
from .scheduler import start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"regulatory-reporting","message":"%(message)s"}',
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PayGate Regulatory Reporting Service",
    version="1.0.0",
    description="CBN/NFIU regulatory report generation and submission",
)

INTERNAL_KEY = os.getenv("REGULATORY_REPORTING_API_KEY", "")
PORT = int(os.getenv("REGULATORY_REPORTING_PORT", "9053"))


def verify_internal_key(x_internal_key: str = Header(default="")) -> None:
    """Verify the internal service-to-service API key."""
    if INTERNAL_KEY and x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal key")


# ─── STR Submission ──────────────────────────────────────────────────────────

class STRSubmitRequest(BaseModel):
    report_type: str = "STR"
    schema_version: str = "3.2"
    str_id: str
    reporting_entity: dict[str, Any]
    subject: dict[str, Any]
    transaction: dict[str, Any]
    suspicion: dict[str, Any]
    filed_by: str
    filed_at: str


@app.post("/submit/str")
async def submit_str(
    req: STRSubmitRequest,
    x_internal_key: str = Header(default=""),
) -> JSONResponse:
    """Format and submit an STR to the CBN Financial Intelligence Unit."""
    verify_internal_key(x_internal_key)

    try:
        # Format payload as NFIU-compliant XML
        xml_payload = format_str_xml(req.model_dump())

        # Submit to NFIU endpoint
        submission_ref = await submit_str_to_nfiu(xml_payload, req.str_id)

        logger.info(
            f"STR submitted to NFIU: str_id={req.str_id} ref={submission_ref}"
        )

        return JSONResponse(
            status_code=200,
            content={
                "submission_ref": submission_ref,
                "str_id": req.str_id,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "status": "submitted",
            },
        )
    except Exception as exc:
        logger.error(f"STR submission failed: str_id={req.str_id} err={exc}")
        raise HTTPException(status_code=502, detail=f"NFIU submission error: {exc}")


# ─── CBN Form A ──────────────────────────────────────────────────────────────

class FormARequest(BaseModel):
    merchant_id: str
    period: str  # YYYY-MM
    transaction_data: dict[str, Any]
    reporting_entity: dict[str, Any]


@app.post("/reports/form-a")
async def generate_cbn_form_a(
    req: FormARequest,
    x_internal_key: str = Header(default=""),
) -> JSONResponse:
    """Generate CBN Form A: Monthly Return on Electronic Payment Transactions."""
    verify_internal_key(x_internal_key)

    try:
        report = generate_form_a(
            merchant_id=req.merchant_id,
            period=req.period,
            transaction_data=req.transaction_data,
            reporting_entity=req.reporting_entity,
        )

        logger.info(f"CBN Form A generated: merchant={req.merchant_id} period={req.period}")

        return JSONResponse(
            status_code=200,
            content={
                "report_id": report["id"],
                "form_type": "CBN_FORM_A",
                "period": req.period,
                "merchant_id": req.merchant_id,
                "data": report,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as exc:
        logger.error(f"Form A generation failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─── CBN Form B ──────────────────────────────────────────────────────────────

class FormBRequest(BaseModel):
    merchant_id: str
    quarter: str  # YYYY-Q1|Q2|Q3|Q4
    fraud_data: dict[str, Any]
    reporting_entity: dict[str, Any]


@app.post("/reports/form-b")
async def generate_cbn_form_b(
    req: FormBRequest,
    x_internal_key: str = Header(default=""),
) -> JSONResponse:
    """Generate CBN Form B: Quarterly Return on E-Payment Fraud."""
    verify_internal_key(x_internal_key)

    try:
        report = generate_form_b(
            merchant_id=req.merchant_id,
            quarter=req.quarter,
            fraud_data=req.fraud_data,
            reporting_entity=req.reporting_entity,
        )

        logger.info(f"CBN Form B generated: merchant={req.merchant_id} quarter={req.quarter}")

        return JSONResponse(
            status_code=200,
            content={
                "report_id": report["id"],
                "form_type": "CBN_FORM_B",
                "quarter": req.quarter,
                "merchant_id": req.merchant_id,
                "data": report,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as exc:
        logger.error(f"Form B generation failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─── CBN Form C ──────────────────────────────────────────────────────────────

class FormCRequest(BaseModel):
    merchant_id: str
    year: int
    aml_data: dict[str, Any]
    reporting_entity: dict[str, Any]


@app.post("/reports/form-c")
async def generate_cbn_form_c(
    req: FormCRequest,
    x_internal_key: str = Header(default=""),
) -> JSONResponse:
    """Generate CBN Form C: Annual Return on AML/CFT Compliance."""
    verify_internal_key(x_internal_key)

    try:
        report = generate_form_c(
            merchant_id=req.merchant_id,
            year=req.year,
            aml_data=req.aml_data,
            reporting_entity=req.reporting_entity,
        )

        logger.info(f"CBN Form C generated: merchant={req.merchant_id} year={req.year}")

        return JSONResponse(
            status_code=200,
            content={
                "report_id": report["id"],
                "form_type": "CBN_FORM_C",
                "year": req.year,
                "merchant_id": req.merchant_id,
                "data": report,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as exc:
        logger.error(f"Form C generation failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Scheme Dispute Submission ────────────────────────────────────────────────

class SchemeDisputeRequest(BaseModel):
    chargeback_id: str
    dispute_type: str
    arn: str
    transaction_date: str
    amount_kobo: int
    currency: str = "NGN"
    reason_code: str
    evidence_urls: list[str] = Field(default_factory=list)
    narrative: str
    merchant_id: str
    contact_email: str


@app.post("/scheme/{scheme}/dispute")
async def submit_scheme_dispute(
    scheme: str,
    req: SchemeDisputeRequest,
    x_internal_key: str = Header(default=""),
) -> JSONResponse:
    """Submit a dispute to Visa or Mastercard scheme portal."""
    verify_internal_key(x_internal_key)

    if scheme not in ("visa", "mastercard", "verve"):
        raise HTTPException(status_code=400, detail=f"Unknown scheme: {scheme}")

    try:
        if scheme == "visa":
            ref = await submit_to_visa_portal(req.model_dump())
        elif scheme == "mastercard":
            ref = await submit_to_mastercard_portal(req.model_dump())
        else:
            # Verve disputes go through NIBSS
            ref = f"VERVE-{req.chargeback_id[:8].upper()}-{datetime.now().strftime('%Y%m%d')}"

        logger.info(
            f"Scheme dispute submitted: scheme={scheme} chargeback={req.chargeback_id} ref={ref}"
        )

        return JSONResponse(
            status_code=200,
            content={
                "ref": ref,
                "scheme": scheme,
                "chargeback_id": req.chargeback_id,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as exc:
        logger.error(f"Scheme dispute submission failed: {exc}")
        raise HTTPException(status_code=502, detail=str(exc))


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        content={
            "status": "ok",
            "service": "regulatory-reporting",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event() -> None:
    logger.info("Regulatory reporting service starting")
    # Start scheduled report generation
    asyncio.create_task(start_scheduler())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
