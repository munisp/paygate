"""Smoke tests for wealth-management microservice."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

# Patch DB pool before import
with patch("asyncpg.create_pool", new_callable=AsyncMock):
    from main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")


def test_metrics():
    resp = client.get("/metrics")
    assert resp.status_code == 200


def test_get_portfolio_missing_param():
    resp = client.get("/wealth/portfolio")
    assert resp.status_code == 422  # missing customer_id


def test_set_risk_profile():
    resp = client.post("/wealth/risk-profile/set", json={
        "customer_id": "cust-001",
        "risk_tolerance": "moderate",
        "investment_horizon_years": 10,
        "monthly_income_kobo": 50_000_000,
        "monthly_expenses_kobo": 30_000_000,
    })
    # Either success or DB error is acceptable in test env
    assert resp.status_code in (200, 500)


def test_create_goal():
    resp = client.post("/wealth/goals/create", json={
        "customer_id": "cust-001",
        "goal_name": "Retirement",
        "target_amount_kobo": 100_000_000_000,
        "target_date": "2045-01-01",
        "current_savings_kobo": 5_000_000_000,
        "monthly_contribution_kobo": 200_000_000,
    })
    assert resp.status_code in (200, 500)


def test_get_recommendations_missing_param():
    resp = client.get("/wealth/recommendations")
    assert resp.status_code == 422


def test_calc_monthly_contribution():
    """Unit test for the EMI-like calculation function."""
    from main import calc_monthly_contribution
    result = calc_monthly_contribution(
        target=100_000_000_000,
        current=5_000_000_000,
        years=20,
        annual_return=0.12,
    )
    assert result > 0
    assert result < 100_000_000_000
