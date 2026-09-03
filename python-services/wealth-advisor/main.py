"""
PayGate Wealth Advisor Microservice
Provides ML-based risk profiling, portfolio recommendations, and wealth management insights.
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
import random
import math
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wealth-advisor")

import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(
    title="PayGate Wealth Advisor Service",
    version="1.0.0",
    description="ML-based wealth advisory, risk profiling, and portfolio recommendations",
)
setup_telemetry("wealth-advisor", app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models ──────────────────────────────────────────────────────────────────

class RiskProfileRequest(BaseModel):
    user_id: str
    age: int = Field(..., ge=18, le=100)
    monthly_income_kobo: int = Field(..., ge=0)
    monthly_expenses_kobo: int = Field(..., ge=0)
    existing_investments_kobo: int = Field(default=0, ge=0)
    investment_horizon_years: int = Field(..., ge=1, le=40)
    risk_tolerance: str = Field(..., pattern="^(conservative|moderate|aggressive)$")
    has_emergency_fund: bool = False
    has_dependents: bool = False
    debt_to_income_ratio: float = Field(default=0.0, ge=0.0, le=1.0)

class GoalRequest(BaseModel):
    user_id: str
    goal_name: str
    target_amount_kobo: int = Field(..., ge=100_000)
    target_date: str  # ISO date string
    current_savings_kobo: int = Field(default=0, ge=0)
    risk_profile: str = Field(default="moderate", pattern="^(conservative|moderate|aggressive)$")

class PortfolioRebalanceRequest(BaseModel):
    user_id: str
    current_holdings: List[Dict[str, Any]]
    risk_profile: str = Field(default="moderate")
    total_value_kobo: int = Field(..., ge=0)

class AdvisoryInsightRequest(BaseModel):
    user_id: str
    portfolio_value_kobo: int
    risk_profile: str
    age: int
    investment_horizon_years: int

# ─── Risk Profile Engine ──────────────────────────────────────────────────────

def compute_risk_score(req: RiskProfileRequest) -> float:
    """
    Compute a risk score from 0 (very conservative) to 100 (very aggressive).
    Uses a weighted scoring model based on financial profile inputs.
    """
    score = 50.0  # baseline

    # Age factor: younger = higher risk capacity
    age_factor = max(0, (65 - req.age) / 47) * 20
    score += age_factor

    # Income surplus factor
    monthly_surplus = req.monthly_income_kobo - req.monthly_expenses_kobo
    if req.monthly_income_kobo > 0:
        surplus_ratio = monthly_surplus / req.monthly_income_kobo
        score += surplus_ratio * 15

    # Investment horizon
    horizon_factor = min(req.investment_horizon_years / 30, 1.0) * 15
    score += horizon_factor

    # Risk tolerance
    tolerance_map = {"conservative": -20, "moderate": 0, "aggressive": 20}
    score += tolerance_map.get(req.risk_tolerance, 0)

    # Penalty factors
    if not req.has_emergency_fund:
        score -= 10
    if req.has_dependents:
        score -= 5
    if req.debt_to_income_ratio > 0.3:
        score -= 15
    elif req.debt_to_income_ratio > 0.1:
        score -= 5

    return max(0, min(100, score))

def score_to_profile(score: float) -> str:
    if score < 30:
        return "conservative"
    elif score < 60:
        return "moderate"
    elif score < 80:
        return "growth"
    else:
        return "aggressive"

# ─── Portfolio Allocation Models ──────────────────────────────────────────────

ALLOCATIONS = {
    "conservative": {
        "fixed_income": 0.60,
        "equities": 0.15,
        "money_market": 0.15,
        "real_estate": 0.05,
        "alternatives": 0.05,
    },
    "moderate": {
        "fixed_income": 0.40,
        "equities": 0.35,
        "money_market": 0.10,
        "real_estate": 0.10,
        "alternatives": 0.05,
    },
    "growth": {
        "fixed_income": 0.20,
        "equities": 0.55,
        "money_market": 0.05,
        "real_estate": 0.10,
        "alternatives": 0.10,
    },
    "aggressive": {
        "fixed_income": 0.10,
        "equities": 0.70,
        "money_market": 0.02,
        "real_estate": 0.08,
        "alternatives": 0.10,
    },
}

EXPECTED_RETURNS = {
    "conservative": 0.08,
    "moderate": 0.12,
    "growth": 0.16,
    "aggressive": 0.20,
}

# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "wealth-advisor", "version": "1.0.0"}

@app.post("/risk-profile")
def compute_risk_profile(req: RiskProfileRequest):
    """Compute ML-based risk profile for a user."""
    score = compute_risk_score(req)
    profile = score_to_profile(score)
    allocation = ALLOCATIONS.get(profile, ALLOCATIONS["moderate"])

    return {
        "userId": req.user_id,
        "riskScore": round(score, 1),
        "riskProfile": profile,
        "riskLabel": {
            "conservative": "Capital Preservation",
            "moderate": "Balanced Growth",
            "growth": "Growth Oriented",
            "aggressive": "Aggressive Growth",
        }.get(profile, "Balanced Growth"),
        "recommendedAllocation": allocation,
        "keyInsights": [
            f"Your risk score of {score:.0f}/100 places you in the {profile} category.",
            f"With a {req.investment_horizon_years}-year horizon, you can absorb market volatility.",
            "Diversification across asset classes reduces portfolio risk.",
        ],
        "computedAt": datetime.utcnow().isoformat(),
    }

@app.post("/goal-plan")
def create_goal_plan(req: GoalRequest):
    """Generate a savings/investment plan to achieve a financial goal."""
    target_date = datetime.fromisoformat(req.target_date)
    months_remaining = max(1, (target_date - datetime.utcnow()).days // 30)
    years_remaining = months_remaining / 12

    gap_kobo = max(0, req.target_amount_kobo - req.current_savings_kobo)
    expected_return = EXPECTED_RETURNS.get(req.risk_profile, 0.12)
    monthly_rate = expected_return / 12

    # Future value of current savings
    fv_current = req.current_savings_kobo * ((1 + monthly_rate) ** months_remaining)

    # Required monthly contribution (PMT formula)
    remaining_gap = max(0, req.target_amount_kobo - fv_current)
    if monthly_rate > 0 and months_remaining > 0:
        monthly_contribution = remaining_gap * monthly_rate / (((1 + monthly_rate) ** months_remaining) - 1)
    else:
        monthly_contribution = remaining_gap / max(1, months_remaining)

    feasibility = "achievable"
    if monthly_contribution > 0.5 * (gap_kobo / max(1, months_remaining)):
        feasibility = "challenging"
    if monthly_contribution > gap_kobo / max(1, months_remaining):
        feasibility = "difficult"

    return {
        "userId": req.user_id,
        "goalName": req.goal_name,
        "targetAmountKobo": req.target_amount_kobo,
        "currentSavingsKobo": req.current_savings_kobo,
        "gapKobo": int(gap_kobo),
        "monthsRemaining": months_remaining,
        "requiredMonthlyContributionKobo": int(monthly_contribution),
        "expectedAnnualReturn": expected_return,
        "projectedValueKobo": int(fv_current + monthly_contribution * months_remaining),
        "feasibility": feasibility,
        "milestones": [
            {
                "month": i * (months_remaining // 4),
                "projectedValueKobo": int(
                    req.current_savings_kobo * ((1 + monthly_rate) ** (i * months_remaining // 4))
                    + monthly_contribution * (((1 + monthly_rate) ** (i * months_remaining // 4)) - 1) / monthly_rate
                    if monthly_rate > 0 else
                    req.current_savings_kobo + monthly_contribution * (i * months_remaining // 4)
                ),
            }
            for i in range(1, 5)
        ],
    }

@app.post("/rebalance")
def rebalance_portfolio(req: PortfolioRebalanceRequest):
    """Generate rebalancing recommendations for a portfolio."""
    target_allocation = ALLOCATIONS.get(req.risk_profile, ALLOCATIONS["moderate"])

    rebalance_actions = []
    for asset_class, target_pct in target_allocation.items():
        target_value = int(req.total_value_kobo * target_pct)
        current_holding = next(
            (h for h in req.current_holdings if h.get("assetClass") == asset_class), None
        )
        current_value = current_holding.get("valueKobo", 0) if current_holding else 0
        delta = target_value - current_value

        if abs(delta) > req.total_value_kobo * 0.02:  # 2% threshold
            rebalance_actions.append({
                "assetClass": asset_class,
                "currentValueKobo": current_value,
                "targetValueKobo": target_value,
                "deltaKobo": delta,
                "action": "buy" if delta > 0 else "sell",
                "urgency": "high" if abs(delta / req.total_value_kobo) > 0.1 else "medium",
            })

    return {
        "userId": req.user_id,
        "totalValueKobo": req.total_value_kobo,
        "riskProfile": req.risk_profile,
        "targetAllocation": target_allocation,
        "rebalanceActions": rebalance_actions,
        "rebalanceRequired": len(rebalance_actions) > 0,
        "estimatedTaxImpactKobo": int(sum(
            abs(a["deltaKobo"]) * 0.01 for a in rebalance_actions if a["action"] == "sell"
        )),
        "generatedAt": datetime.utcnow().isoformat(),
    }

@app.post("/insights")
def get_advisory_insights(req: AdvisoryInsightRequest):
    """Generate personalized wealth advisory insights."""
    insights = []
    recommendations = []

    # Rule-based insights engine
    if req.portfolio_value_kobo < 1_000_000_00:  # < ₦1M
        insights.append({
            "type": "growth",
            "priority": "high",
            "title": "Build Your Emergency Fund First",
            "message": "Before investing, ensure you have 3-6 months of expenses in liquid savings.",
        })

    if req.age < 35:
        insights.append({
            "type": "opportunity",
            "priority": "medium",
            "title": "Leverage Compound Growth",
            "message": f"Starting early gives you {35 - req.age} extra years of compounding. Consider increasing equity allocation.",
        })
        recommendations.append({
            "action": "Increase equity allocation to 60-70%",
            "rationale": "Long time horizon supports higher risk tolerance",
            "expectedImpact": "+2-3% annual returns",
        })

    if req.risk_profile == "conservative" and req.investment_horizon_years > 10:
        insights.append({
            "type": "warning",
            "priority": "medium",
            "title": "Risk Profile Mismatch",
            "message": "Your conservative profile may not meet long-term goals. Consider reviewing your risk tolerance.",
        })

    # Projected wealth
    annual_return = EXPECTED_RETURNS.get(req.risk_profile, 0.12)
    projected_10y = int(req.portfolio_value_kobo * ((1 + annual_return) ** 10))
    projected_20y = int(req.portfolio_value_kobo * ((1 + annual_return) ** 20))

    return {
        "userId": req.user_id,
        "insights": insights,
        "recommendations": recommendations,
        "projections": {
            "current": req.portfolio_value_kobo,
            "in10Years": projected_10y,
            "in20Years": projected_20y,
            "assumedAnnualReturn": annual_return,
        },
        "wealthScore": min(100, int(
            (req.portfolio_value_kobo / 100_000_000) * 40  # ₦1M = 40 pts
            + (req.investment_horizon_years / 30) * 30
            + ({"conservative": 10, "moderate": 20, "growth": 25, "aggressive": 30}.get(req.risk_profile, 20))
        )),
        "generatedAt": datetime.utcnow().isoformat(),
    }

@app.get("/market-outlook")
def get_market_outlook():
    """Get current market outlook and macro indicators."""
    return {
        "outlook": "cautiously_optimistic",
        "summary": "Nigerian equities remain resilient amid global headwinds. Fixed income yields attractive at current CBN rates.",
        "indicators": [
            {"name": "NGX All-Share Index", "value": "98,450.21", "change": "+0.8%", "trend": "up"},
            {"name": "CBN MPR", "value": "27.25%", "change": "0.0%", "trend": "stable"},
            {"name": "USD/NGN", "value": "1,580.00", "change": "-0.3%", "trend": "down"},
            {"name": "Inflation Rate", "value": "32.7%", "change": "-0.4%", "trend": "down"},
            {"name": "T-Bill Rate (91-day)", "value": "21.5%", "change": "+0.2%", "trend": "up"},
        ],
        "sectorOutlook": [
            {"sector": "Banking", "rating": "overweight", "rationale": "Strong earnings, improving NPLs"},
            {"sector": "Consumer Goods", "rating": "neutral", "rationale": "Margin pressure from FX costs"},
            {"sector": "Technology", "rating": "overweight", "rationale": "Fintech growth driving valuations"},
            {"sector": "Oil & Gas", "rating": "underweight", "rationale": "Production shortfalls, pipeline issues"},
        ],
        "updatedAt": datetime.utcnow().isoformat(),
    }

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
    import uvicorn
    port = int(os.getenv("PORT", "8020"))
    uvicorn.run(app, host="0.0.0.0", port=port)
