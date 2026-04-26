"""
Unit tests for PayGate Threat Intelligence Engine.
Run with: python -m pytest test_main.py -v
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import time
import pytest
from fastapi.testclient import TestClient
from main import app, _known_bad_ips, _login_fail_windows, _request_windows

client = TestClient(app)
# Pass internal key if set in environment (fail-open in dev when key is empty)
AUTH_HEADERS = {"x-internal-key": os.getenv("INTERNAL_API_KEY", "")}


# ─── Health Check ──────────────────────────────────────────────────────────────

def test_health_check():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "threat-intel"
    assert "model_trained" in data


# ─── Transaction Anomaly Detection ────────────────────────────────────────────

def test_normal_transaction():
    payload = {
        "account_id": "acc_001",
        "amount": 5000.0,
        "currency": "NGN",
        "merchant_category": "retail",
        "hour_of_day": 14,
        "day_of_week": 2,
        "is_international": False,
        "velocity_1h": 2,
        "velocity_24h": 5,
    }
    resp = client.post("/analyze/transaction", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "is_anomaly" in data
    assert data["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def test_high_velocity_transaction_flagged():
    payload = {
        "account_id": "acc_002",
        "amount": 1000.0,
        "currency": "NGN",
        "merchant_category": "unknown",
        "hour_of_day": 3,  # Unusual hour
        "day_of_week": 1,
        "is_international": False,
        "velocity_1h": 25,  # Extreme velocity
        "velocity_24h": 50,
    }
    resp = client.post("/analyze/transaction", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    # Should be flagged due to extreme velocity + unusual hour
    assert len(data["reasons"]) >= 1
    assert data["risk_level"] in ("MEDIUM", "HIGH", "CRITICAL")


def test_large_international_transaction_flagged():
    payload = {
        "account_id": "acc_003",
        "amount": 200_000.0,  # Large amount
        "currency": "NGN",
        "merchant_category": "financial",
        "hour_of_day": 10,
        "day_of_week": 3,
        "is_international": True,  # International
        "velocity_1h": 1,
        "velocity_24h": 2,
    }
    resp = client.post("/analyze/transaction", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    # Should flag large NGN + international
    reasons_text = " ".join(data["reasons"])
    assert "international" in reasons_text.lower() or "large" in reasons_text.lower()


def test_transaction_returns_model_trained_field():
    payload = {
        "account_id": "acc_004",
        "amount": 100.0,
        "currency": "USD",
        "merchant_category": "food",
        "hour_of_day": 12,
        "day_of_week": 4,
        "is_international": False,
        "velocity_1h": 1,
        "velocity_24h": 3,
    }
    resp = client.post("/analyze/transaction", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "model_trained" in data
    assert isinstance(data["model_trained"], bool)


# ─── Brute Force Detection ─────────────────────────────────────────────────────

def test_single_failed_login_not_brute_force():
    _login_fail_windows.clear()
    payload = {
        "identifier": "user@test.com",
        "success": False,
        "ip": "192.168.1.100",
    }
    resp = client.post("/analyze/login", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_brute_force"] is False
    assert data["attempts_last_10min"] == 1


def test_brute_force_detected_after_5_failures():
    _login_fail_windows.clear()
    payload = {
        "identifier": "victim@test.com",
        "success": False,
        "ip": "10.0.0.1",
    }
    # Send 5 failed attempts
    for _ in range(5):
        resp = client.post("/analyze/login", json=payload, headers=AUTH_HEADERS)
        assert resp.status_code == 200

    data = resp.json()
    assert data["is_brute_force"] is True
    assert data["lockout_recommended"] is True
    assert data["risk_level"] in ("HIGH", "CRITICAL")


def test_successful_login_not_counted():
    _login_fail_windows.clear()
    payload = {
        "identifier": "gooduser@test.com",
        "success": True,
        "ip": "10.0.0.2",
    }
    resp = client.post("/analyze/login", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["attempts_last_10min"] == 0
    assert data["is_brute_force"] is False


# ─── DDoS Detection ───────────────────────────────────────────────────────────

def test_low_request_rate_not_ddos():
    _request_windows.clear()
    payload = {
        "ip": "203.0.113.1",
        "path": "/api/health",
        "method": "GET",
        "status_code": 200,
        "response_time_ms": 45.0,
    }
    resp = client.post("/analyze/ddos", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_ddos"] is False
    assert data["risk_level"] == "LOW"


def test_high_request_rate_flagged_as_ddos():
    _request_windows.clear()
    now_ms = int(time.time() * 1000)

    # Simulate 200 requests in the last 60 seconds
    payload = {
        "ip": "198.51.100.1",
        "path": "/api/trpc",
        "method": "POST",
        "status_code": 200,
        "response_time_ms": 10.0,
        "timestamp_ms": now_ms,
    }
    for _ in range(200):
        client.post("/analyze/ddos", json=payload, headers=AUTH_HEADERS)

    resp = client.post("/analyze/ddos", json=payload, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_ddos"] is True
    assert data["risk_level"] in ("HIGH", "CRITICAL")


# ─── IP Reputation ────────────────────────────────────────────────────────────

def test_clean_ip_reputation():
    _known_bad_ips.clear()
    _request_windows.clear()
    _login_fail_windows.clear()

    resp = client.post("/analyze/ip-reputation", params={"ip": "8.8.8.8"}, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_known_bad"] is False
    assert data["reputation_score"] < 0.5


def test_known_bad_ip_flagged():
    _known_bad_ips.clear()
    _known_bad_ips.add("1.2.3.4")

    resp = client.post("/analyze/ip-reputation", params={"ip": "1.2.3.4"}, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_known_bad"] is True
    assert data["reputation_score"] >= 0.8


# ─── Threat Feed Ingestion ────────────────────────────────────────────────────

def test_ingest_threat_feed():
    _known_bad_ips.clear()
    entries = [
        {"ip": "192.0.2.1", "threat_type": "scanner", "confidence": 0.9, "source": "test"},
        {"ip": "192.0.2.2", "threat_type": "botnet", "confidence": 0.8, "source": "test"},
        {"ip": "192.0.2.3", "threat_type": "spam", "confidence": 0.3, "source": "test"},  # Below threshold
    ]
    resp = client.post("/threat-feed/ingest", json=entries, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ingested"] == 2  # Only 2 above 0.5 confidence
    assert data["total_known_bad_ips"] == 2


def test_threat_feed_stats():
    resp = client.get("/threat-feed/stats", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "known_bad_ips" in data
    assert "iso_forest_trained" in data
    assert "timestamp" in data
