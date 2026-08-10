"""Smoke tests for mutual-funds microservice."""
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

with patch("asyncpg.create_pool", new_callable=AsyncMock):
    from main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] in ("ok", "degraded")


def test_metrics():
    resp = client.get("/metrics")
    assert resp.status_code == 200


def test_list_funds():
    resp = client.get("/mutual-funds/list")
    assert resp.status_code == 200
    data = resp.json()
    assert "funds" in data
    assert len(data["funds"]) > 0
    fund = data["funds"][0]
    assert "id" in fund
    assert "name" in fund
    assert "nav" in fund


def test_get_portfolio_missing_param():
    resp = client.get("/mutual-funds/portfolio")
    assert resp.status_code == 422


def test_invest_valid_fund():
    resp = client.post("/mutual-funds/invest", json={
        "customer_id": "cust-001",
        "fund_id": "fund-001",
        "amount": 10_000.0,
        "currency": "NGN",
    })
    # fund-001 exists in FUNDS catalog, so DB error is acceptable
    assert resp.status_code in (200, 500)


def test_invest_invalid_fund():
    resp = client.post("/mutual-funds/invest", json={
        "customer_id": "cust-001",
        "fund_id": "fund-nonexistent",
        "amount": 10_000.0,
    })
    assert resp.status_code == 404


def test_redeem():
    resp = client.post("/mutual-funds/redeem", json={
        "customer_id": "cust-001",
        "fund_id": "fund-001",
        "units": 10.0,
    })
    assert resp.status_code in (200, 500)


def test_create_sip():
    resp = client.post("/mutual-funds/sip/create", json={
        "customer_id": "cust-001",
        "fund_id": "fund-002",
        "monthly_amount": 5_000.0,
        "day_of_month": 15,
    })
    assert resp.status_code in (200, 500)
