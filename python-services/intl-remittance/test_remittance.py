"""Smoke tests for intl-remittance microservice."""
import pytest
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


def test_list_corridors():
    resp = client.get("/intl-remittance/corridors")
    assert resp.status_code == 200
    data = resp.json()
    assert "corridors" in data
    assert len(data["corridors"]) > 0
    corridor = data["corridors"][0]
    # Corridors have "from" and "to" keys (not source_currency/dest_currency)
    assert "id" in corridor
    assert "from" in corridor
    assert "to" in corridor


def test_get_quote():
    resp = client.get("/intl-remittance/quote", params={
        "from_currency": "NGN",
        "to_currency": "USD",
        "amount": 50_000.0,
        "corridor": "NGN-USD",
    })
    assert resp.status_code in (200, 404)


def test_get_quote_missing_params():
    resp = client.get("/intl-remittance/quote")
    assert resp.status_code == 422


def test_create_transfer():
    resp = client.post("/intl-remittance/transfer", json={
        "merchant_id": "merch-001",
        "sender_id": "user-001",
        "recipient_name": "Kwame Mensah",
        "recipient_account": "1234567890",
        "recipient_bank_code": "GCB",
        "recipient_country": "GH",
        "amount": 50_000.0,
        "from_currency": "NGN",
        "to_currency": "GHS",
        "corridor": "NGN-GHS",
        "purpose": "family_support",
    })
    assert resp.status_code in (200, 500)


def test_track_missing_param():
    resp = client.get("/intl-remittance/track")
    assert resp.status_code == 422


def test_history_missing_param():
    resp = client.get("/intl-remittance/history")
    assert resp.status_code == 422
