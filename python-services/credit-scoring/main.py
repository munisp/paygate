"""
PayGate Credit Scoring Service
FastAPI REST wrapper around the Rust credit-scoring FFI library.
Exposes /score endpoint consumed by the Go bridge lending handler.
"""
from __future__ import annotations

import ctypes
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("credit-scoring")

# ─── Load Rust FFI library ────────────────────────────────────────────────────
LIB_PATHS = [
    Path(__file__).parent.parent.parent / "rust-services" / "credit-scoring" / "target" / "release" / "libcredit_scoring.so",
    Path(__file__).parent.parent.parent / "rust-services" / "credit-scoring" / "target" / "debug" / "libcredit_scoring.so",
    Path("/usr/local/lib/libcredit_scoring.so"),
]

_lib: Optional[ctypes.CDLL] = None

def _load_lib() -> Optional[ctypes.CDLL]:
    for path in LIB_PATHS:
        if path.exists():
            try:
                lib = ctypes.CDLL(str(path))
                lib.credit_score_compute.restype = ctypes.c_char_p
                lib.credit_score_compute.argtypes = [ctypes.c_char_p]
                lib.credit_score_free.restype = None
                lib.credit_score_free.argtypes = [ctypes.c_char_p]
                lib.credit_scoring_health.restype = ctypes.c_int
                logger.info(f"Loaded credit scoring library from {path}")
                return lib
            except Exception as e:
                logger.warning(f"Failed to load {path}: {e}")
    logger.warning("Rust credit scoring library not found — using Python fallback scorer")
    return None

_lib = _load_lib()

# ─── Python fallback scorer (used when Rust lib not compiled) ─────────────────
def _python_fallback_score(features: dict) -> dict:
    """Pure-Python credit scoring fallback (same algorithm as Rust)."""
    score = 500.0
    factors = []

    gmv_ngn = features.get("gmv_30d_kobo", 0) / 100.0
    gmv_score = min(gmv_ngn / 1_000_000.0, 1.0) * 100.0
    score += gmv_score
    if gmv_ngn >= 500_000:
        factors.append(f"Strong monthly GMV of ₦{gmv_ngn:,.0f}")
    elif gmv_ngn < 100_000:
        factors.append("Low monthly GMV reduces credit limit")
        score -= 30.0

    avg_txns = features.get("avg_daily_txns", 0.0)
    score += min(avg_txns / 50.0, 1.0) * 60.0
    if avg_txns >= 20:
        factors.append(f"Consistent transaction volume ({avg_txns:.1f} txns/day)")

    dispute_rate = features.get("dispute_rate", 0.0)
    if dispute_rate > 0.05:
        penalty = min((dispute_rate - 0.05) / 0.15, 1.0) * 150.0
        score -= penalty
        factors.append(f"High dispute rate ({dispute_rate*100:.1f}%) impacts score")

    chargeback_rate = features.get("chargeback_rate", 0.0)
    if chargeback_rate > 0.01:
        penalty = min((chargeback_rate - 0.01) / 0.05, 1.0) * 100.0
        score -= penalty
        factors.append(f"Chargeback rate ({chargeback_rate*100:.2f}%) negatively impacts score")

    age_days = features.get("account_age_days", 0)
    score += min(age_days / 365.0, 1.0) * 50.0
    if age_days >= 180:
        factors.append(f"Established account ({age_days} days)")

    repayment = features.get("repayment_history_score", 50.0)
    score += (repayment / 100.0) * 80.0
    if repayment >= 80:
        factors.append("Excellent repayment history")
    elif repayment < 50:
        factors.append("Poor repayment history reduces eligibility")
        score -= 40.0

    score += features.get("active_days_ratio", 0.5) * 30.0

    outstanding = features.get("outstanding_loan_kobo", 0) / 100.0
    if outstanding > 0:
        penalty = min(outstanding / max(gmv_ngn, 1.0), 1.0) * 50.0
        score -= penalty
        factors.append(f"Existing loan balance of ₦{outstanding:,.0f} considered")

    final_score = max(300, min(850, int(score)))

    if final_score >= 750:
        risk_band, multiplier, rate, term = "excellent", 3.0, 18.0, 365
    elif final_score >= 680:
        risk_band, multiplier, rate, term = "good", 2.0, 24.0, 270
    elif final_score >= 580:
        risk_band, multiplier, rate, term = "fair", 1.0, 30.0, 180
    elif final_score >= 500:
        risk_band, multiplier, rate, term = "poor", 0.5, 36.0, 90
    else:
        risk_band, multiplier, rate, term = "very_poor", 0.0, 0.0, 0

    max_loan_kobo = int(gmv_ngn * multiplier * 100) if multiplier > 0 else 0

    if not factors:
        factors.append("Score based on transaction history and business performance")

    return {
        "score": final_score,
        "risk_band": risk_band,
        "max_loan_kobo": max_loan_kobo,
        "recommended_rate_pct": rate,
        "max_term_days": term,
        "factors": factors,
    }

# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="PayGate Credit Scoring Service",
    version="1.0.0",
    description="ML-based merchant credit scoring for the PayGate lending engine",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

INTERNAL_KEY = os.getenv("INTERNAL_API_KEY", "")

class CreditFeaturesRequest(BaseModel):
    merchant_id: str = Field(..., description="Merchant identifier")
    gmv_30d_kobo: int = Field(..., ge=0, description="30-day GMV in kobo")
    avg_daily_txns: float = Field(..., ge=0.0, description="Average daily transactions")
    dispute_rate: float = Field(0.0, ge=0.0, le=1.0, description="Dispute rate (0–1)")
    chargeback_rate: float = Field(0.0, ge=0.0, le=1.0, description="Chargeback rate (0–1)")
    account_age_days: int = Field(0, ge=0, description="Days since first transaction")
    repayment_history_score: float = Field(50.0, ge=0.0, le=100.0, description="Repayment history score (0–100)")
    active_days_ratio: float = Field(0.5, ge=0.0, le=1.0, description="Active days ratio (0–1)")
    outstanding_loan_kobo: int = Field(0, ge=0, description="Outstanding loan balance in kobo")

class CreditScoreResponse(BaseModel):
    merchant_id: str
    score: int
    risk_band: str
    max_loan_kobo: int
    recommended_rate_pct: float
    max_term_days: int
    factors: list[str]
    engine: str

@app.post("/score", response_model=CreditScoreResponse)
async def score_merchant(
    request: CreditFeaturesRequest,
    x_internal_key: Optional[str] = Header(None),
):
    if INTERNAL_KEY and x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    features_dict = {
        "gmv_30d_kobo": request.gmv_30d_kobo,
        "avg_daily_txns": request.avg_daily_txns,
        "dispute_rate": request.dispute_rate,
        "chargeback_rate": request.chargeback_rate,
        "account_age_days": request.account_age_days,
        "repayment_history_score": request.repayment_history_score,
        "active_days_ratio": request.active_days_ratio,
        "outstanding_loan_kobo": request.outstanding_loan_kobo,
    }

    engine = "python_fallback"
    if _lib is not None:
        try:
            features_json = json.dumps(features_dict).encode("utf-8")
            result_ptr = _lib.credit_score_compute(features_json)
            if result_ptr:
                result_json = result_ptr.decode("utf-8")
                result = json.loads(result_json)
                engine = "rust_ffi"
            else:
                result = _python_fallback_score(features_dict)
        except Exception as e:
            logger.error(f"Rust FFI error: {e}, falling back to Python")
            result = _python_fallback_score(features_dict)
    else:
        result = _python_fallback_score(features_dict)

    logger.info(
        f"Scored merchant {request.merchant_id}: score={result['score']} "
        f"band={result['risk_band']} engine={engine}"
    )

    return CreditScoreResponse(
        merchant_id=request.merchant_id,
        score=result["score"],
        risk_band=result["risk_band"],
        max_loan_kobo=result["max_loan_kobo"],
        recommended_rate_pct=result["recommended_rate_pct"],
        max_term_days=result["max_term_days"],
        factors=result["factors"],
        engine=engine,
    )

@app.get("/health")
async def health():
    rust_available = _lib is not None and _lib.credit_scoring_health() == 1
    return {
        "status": "ok",
        "service": "credit-scoring",
        "rust_ffi": rust_available,
        "engine": "rust_ffi" if rust_available else "python_fallback",
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8095"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
