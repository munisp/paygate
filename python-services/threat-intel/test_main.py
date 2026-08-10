"""
Tests for PayGate Threat Intelligence Engine v2.0
"""
import os
import pytest
from fastapi.testclient import TestClient

# Set INTERNAL_API_KEY before importing app
TEST_KEY = "test-internal-key-wave108"
os.environ["INTERNAL_API_KEY"] = TEST_KEY
os.environ["REDIS_URL"] = ""  # Disable Redis for unit tests

from main import app

client = TestClient(app)
AUTH = {"X-Internal-Key": TEST_KEY}


# ─── Health ────────────────────────────────────────────────────────────────────

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["version"] == "2.0.0"
    assert "model_trained" in data
    assert "redis_connected" in data
    assert "geoip_available" in data


# ─── Auth ──────────────────────────────────────────────────────────────────────

def test_auth_required():
    r = client.post("/analyze/transaction", json={
        "account_id": "acc_1",
        "amount": 1000,
        "hour_of_day": 10,
        "day_of_week": 1,
        "velocity_1h": 1,
        "velocity_24h": 5,
    })
    assert r.status_code == 401


def test_auth_valid():
    r = client.post("/analyze/transaction", headers=AUTH, json={
        "account_id": "acc_1",
        "amount": 1000,
        "hour_of_day": 10,
        "day_of_week": 1,
        "velocity_1h": 1,
        "velocity_24h": 5,
    })
    assert r.status_code == 200


# ─── Transaction Analysis ──────────────────────────────────────────────────────

def test_normal_transaction():
    r = client.post("/analyze/transaction", headers=AUTH, json={
        "account_id": "acc_normal",
        "amount": 5000,
        "currency": "NGN",
        "merchant_category": "retail",
        "hour_of_day": 14,
        "day_of_week": 2,
        "is_international": False,
        "velocity_1h": 2,
        "velocity_24h": 5,
    })
    assert r.status_code == 200
    data = r.json()
    assert "is_anomaly" in data
    assert "risk_level" in data
    assert "model_trained" in data
    assert "geo_velocity_anomaly" in data


def test_high_velocity_transaction():
    r = client.post("/analyze/transaction", headers=AUTH, json={
        "account_id": "acc_high_vel",
        "amount": 10000,
        "currency": "NGN",
        "merchant_category": "financial",
        "hour_of_day": 3,
        "day_of_week": 0,
        "is_international": True,
        "velocity_1h": 25,
        "velocity_24h": 100,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["is_anomaly"] is True
    assert data["risk_level"] in ("HIGH", "CRITICAL")
    assert len(data["reasons"]) >= 1


def test_large_amount_transaction():
    r = client.post("/analyze/transaction", headers=AUTH, json={
        "account_id": "acc_large",
        "amount": 750000,
        "currency": "NGN",
        "merchant_category": "unknown",
        "hour_of_day": 10,
        "day_of_week": 1,
        "is_international": False,
        "velocity_1h": 1,
        "velocity_24h": 2,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["is_anomaly"] is True
    assert any("Large NGN" in r for r in data["reasons"])


def test_transaction_with_ip():
    """Transaction with IP field should not error even without GeoIP DB."""
    r = client.post("/analyze/transaction", headers=AUTH, json={
        "account_id": "acc_ip_test",
        "amount": 1000,
        "hour_of_day": 10,
        "day_of_week": 1,
        "velocity_1h": 1,
        "velocity_24h": 5,
        "ip": "8.8.8.8",
    })
    assert r.status_code == 200
    data = r.json()
    assert "geo_velocity_anomaly" in data


# ─── Login Analysis ────────────────────────────────────────────────────────────

def test_normal_login():
    r = client.post("/analyze/login", headers=AUTH, json={
        "identifier": "user@example.com",
        "success": True,
        "ip": "1.2.3.4",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["is_brute_force"] is False
    assert data["risk_level"] == "LOW"


def test_brute_force_detection():
    """Send 6 failed logins in quick succession — should trigger brute force."""
    for _ in range(6):
        client.post("/analyze/login", headers=AUTH, json={
            "identifier": "victim@example.com",
            "success": False,
            "ip": "5.6.7.8",
        })
    r = client.post("/analyze/login", headers=AUTH, json={
        "identifier": "victim@example.com",
        "success": False,
        "ip": "5.6.7.8",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["is_brute_force"] is True
    assert data["lockout_recommended"] is True


# ─── DDoS Analysis ─────────────────────────────────────────────────────────────

def test_normal_request():
    r = client.post("/analyze/ddos", headers=AUTH, json={
        "ip": "10.0.0.1",
        "path": "/api/health",
        "method": "GET",
        "status_code": 200,
        "response_time_ms": 50.0,
    })
    assert r.status_code == 200
    data = r.json()
    assert "is_ddos" in data
    assert "requests_per_minute" in data
    assert "spike_ratio" in data


def test_ddos_detection():
    """Send 250 requests from same IP — should trigger DDoS detection."""
    for _ in range(250):
        client.post("/analyze/ddos", headers=AUTH, json={
            "ip": "99.99.99.99",
            "path": "/api/trpc",
            "method": "POST",
            "status_code": 200,
            "response_time_ms": 10.0,
        })
    r = client.post("/analyze/ddos", headers=AUTH, json={
        "ip": "99.99.99.99",
        "path": "/api/trpc",
        "method": "POST",
        "status_code": 200,
        "response_time_ms": 10.0,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["is_ddos"] is True
    assert data["risk_level"] in ("HIGH", "CRITICAL")


# ─── IP Reputation ─────────────────────────────────────────────────────────────

def test_clean_ip():
    r = client.post("/analyze/ip-reputation", headers=AUTH, params={"ip": "192.168.1.1"})
    assert r.status_code == 200
    data = r.json()
    assert data["is_known_bad"] is False
    assert data["reputation_score"] < 0.5


def test_known_bad_ip():
    # First ingest a bad IP
    client.post("/threat-feed/ingest", headers=AUTH, json=[{
        "ip": "1.2.3.4",
        "threat_type": "botnet",
        "confidence": 0.9,
        "source": "test",
    }])
    r = client.post("/analyze/ip-reputation", headers=AUTH, params={"ip": "1.2.3.4"})
    assert r.status_code == 200
    data = r.json()
    assert data["is_known_bad"] is True
    assert data["reputation_score"] >= 0.8


# ─── Threat Feed ───────────────────────────────────────────────────────────────

def test_ingest_threat_feed():
    r = client.post("/threat-feed/ingest", headers=AUTH, json=[
        {"ip": "10.20.30.40", "threat_type": "scanner", "confidence": 0.7, "source": "test"},
        {"ip": "10.20.30.41", "threat_type": "scanner", "confidence": 0.3, "source": "test"},  # Below threshold
    ])
    assert r.status_code == 200
    data = r.json()
    assert data["ingested"] == 1  # Only 1 above 0.5 confidence


def test_threat_feed_stats():
    r = client.get("/threat-feed/stats", headers=AUTH)
    assert r.status_code == 200
    data = r.json()
    assert "known_bad_ips" in data
    assert "iso_forest_trained" in data
    assert "redis_connected" in data
    assert "geoip_available" in data


# ─── Model Retrain ─────────────────────────────────────────────────────────────

def test_retrain_insufficient_data():
    """Retrain should fail if not enough training samples."""
    from main import _iso_training_buffer
    if len(_iso_training_buffer) < 50:
        r = client.post("/model/retrain", headers=AUTH)
        assert r.status_code == 400


def test_metrics_endpoint():
    r = client.get("/metrics")
    assert r.status_code == 200
    assert b"threat_intel" in r.content
