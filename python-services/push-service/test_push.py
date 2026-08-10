"""
Tests for the PayGate Push Notification Service.
Run with: pytest test_push.py -v
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock
import os

# Ensure no real Firebase/DB connections in tests
os.environ.setdefault("FIREBASE_PROJECT_ID", "")
os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("API_KEY", "test-key")

from main import app, DispatchResult

client = TestClient(app)
HEADERS = {"Authorization": "Bearer test-key"}

# ─── Health check ─────────────────────────────────────────────────────────────
def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "push-service"

# ─── Auth guard ───────────────────────────────────────────────────────────────
def test_notify_consumer_requires_auth():
    resp = client.post("/notify/consumer", json={
        "user_id": 1,
        "notification": {"title": "Test", "body": "Hello"},
    })
    assert resp.status_code == 401

def test_notify_tokens_requires_auth():
    resp = client.post("/notify/tokens", json={
        "tokens": ["tok1"],
        "notification": {"title": "Test", "body": "Hello"},
    })
    assert resp.status_code == 401

# ─── Notify consumer (no DB — returns 0 tokens) ───────────────────────────────
def test_notify_consumer_no_tokens():
    with patch("main.get_consumer_tokens", new_callable=AsyncMock, return_value=[]):
        resp = client.post("/notify/consumer", headers=HEADERS, json={
            "user_id": 42,
            "notification": {"title": "Credit", "body": "You received ₦500"},
            "notification_type": "wallet_credit",
            "data": {"amount": "50000"},
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success_count"] == 0
        assert data["total_tokens"] == 0

# ─── Notify consumer with tokens (simulated FCM) ──────────────────────────────
def test_notify_consumer_with_tokens():
    with patch("main.get_consumer_tokens", new_callable=AsyncMock, return_value=["fcm_token_1", "fcm_token_2"]):
        with patch("main.get_fcm_app", return_value=None):  # Simulated mode
            resp = client.post("/notify/consumer", headers=HEADERS, json={
                "user_id": 42,
                "notification": {"title": "P2P Received", "body": "You received ₦1,000"},
                "notification_type": "p2p_received",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["success_count"] == 2
            assert data["total_tokens"] == 2

# ─── Notify merchant ──────────────────────────────────────────────────────────
def test_notify_merchant_no_tokens():
    with patch("main.get_merchant_tokens", new_callable=AsyncMock, return_value=[]):
        resp = client.post("/notify/merchant", headers=HEADERS, json={
            "merchant_id": "merchant-123",
            "notification": {"title": "New Order", "body": "Order #456 received"},
            "notification_type": "new_order",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success_count"] == 0

def test_notify_merchant_with_tokens():
    with patch("main.get_merchant_tokens", new_callable=AsyncMock, return_value=["tok1", "tok2", "tok3"]):
        with patch("main.get_fcm_app", return_value=None):
            resp = client.post("/notify/merchant", headers=HEADERS, json={
                "merchant_id": "merchant-123",
                "notification": {"title": "Settlement", "body": "₦50,000 settled"},
                "notification_type": "settlement_complete",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["success_count"] == 3

# ─── Notify tokens ────────────────────────────────────────────────────────────
def test_notify_tokens_simulated():
    with patch("main.get_fcm_app", return_value=None):
        resp = client.post("/notify/tokens", headers=HEADERS, json={
            "tokens": ["tok1", "tok2"],
            "notification": {"title": "Alert", "body": "Fraud detected"},
            "notification_type": "fraud_alert",
            "data": {"risk_score": "85"},
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success_count"] == 2

def test_notify_tokens_empty_list_rejected():
    resp = client.post("/notify/tokens", headers=HEADERS, json={
        "tokens": [],
        "notification": {"title": "Test", "body": "Test"},
    })
    assert resp.status_code == 422  # Pydantic validation error (min_length=1)

# ─── Notify topic ─────────────────────────────────────────────────────────────
def test_notify_topic_simulated():
    with patch("main.get_fcm_app", return_value=None):
        resp = client.post("/notify/topic", headers=HEADERS, json={
            "topic": "merchant-paygate-123",
            "notification": {"title": "Broadcast", "body": "System maintenance"},
            "notification_type": "system",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success_count"] == 1

def test_notify_topic_invalid_name():
    resp = client.post("/notify/topic", headers=HEADERS, json={
        "topic": "invalid topic name!",
        "notification": {"title": "Test", "body": "Test"},
    })
    assert resp.status_code == 422

# ─── Token registration ───────────────────────────────────────────────────────
def test_register_token_no_db():
    resp = client.post("/tokens/register", headers=HEADERS, json={
        "token": "fcm_token_abc",
        "platform": "fcm",
        "device_id": "device-001",
        "merchant_id": "merchant-123",
        "user_id": 42,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["registered"] is True

def test_register_token_invalid_platform():
    resp = client.post("/tokens/register", headers=HEADERS, json={
        "token": "tok",
        "platform": "windows",
        "device_id": "dev",
    })
    assert resp.status_code == 422

def test_deregister_token_no_db():
    resp = client.post("/tokens/deregister", headers=HEADERS, json={
        "token": "fcm_token_abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["deregistered"] is True

# ─── Metrics ─────────────────────────────────────────────────────────────────
def test_metrics_endpoint():
    resp = client.get("/metrics")
    assert resp.status_code == 200
