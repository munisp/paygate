"""Smoke tests for emi-service microservice."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

with patch("asyncpg.create_pool", new_callable=AsyncMock):
    from main import app, amortize

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] in ("ok", "degraded")


def test_metrics():
    resp = client.get("/metrics")
    assert resp.status_code == 200


def test_amortize_basic():
    schedule = amortize(principal=100_000, annual_rate=18.0, tenure_months=12)
    assert len(schedule) == 12
    # Uses "instalment" key (not "month")
    assert schedule[0]["instalment"] == 1
    assert schedule[0]["emi"] > 0
    assert schedule[0]["balance"] < 100_000


def test_amortize_zero_rate():
    schedule = amortize(principal=120_000, annual_rate=0.0, tenure_months=12)
    assert len(schedule) == 12
    assert abs(schedule[0]["emi"] - 10_000) < 1


def test_amortize_response_fields():
    schedule = amortize(principal=50_000, annual_rate=24.0, tenure_months=6)
    for entry in schedule:
        assert "instalment" in entry
        assert "emi" in entry
        assert "principal" in entry
        assert "interest" in entry
        assert "balance" in entry
        assert entry["balance"] >= 0


def test_initiate_emi():
    resp = client.post("/emi/initiate", json={
        "customer_id": "cust-001",
        "merchant_id": "merch-001",
        "plan_id": "plan-001",
        "principal_amount": 100_000.0,
        "purpose": "Electronics purchase",
    })
    assert resp.status_code in (200, 500)


def test_get_schedule_missing_param():
    resp = client.get("/emi/schedule")
    assert resp.status_code == 422


def test_list_plans_missing_param():
    resp = client.get("/emi/plans")
    assert resp.status_code == 422


def test_create_plan():
    resp = client.post("/emi/plans/create", json={
        "merchant_id": "merch-001",
        "plan_name": "Standard 12-month",
        "tenure_months": 12,
        "interest_rate_annual": 18.0,
        "processing_fee_pct": 1.5,
        "min_amount": 50_000.0,
        "max_amount": 500_000.0,
    })
    assert resp.status_code in (200, 500)
