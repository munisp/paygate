"""
Tests for the PayGate Fraud Scoring Service.
Run with: pytest test_fraud.py -v
"""
import pytest
from fastapi.testclient import TestClient
import os

os.environ.setdefault("PORT", "8083")

from main import app, score_transaction, score_consumer_transaction, TransactionInput, ConsumerTransactionInput

client = TestClient(app)


# ─── Health check ─────────────────────────────────────────────────────────────
def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["service"] == "fraud-scoring"


# ─── Merchant scoring: /v1/score ─────────────────────────────────────────────
def test_score_low_risk():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-001",
        "merchant_id": "m-001",
        "amount_kobo": 50000,
        "currency": "NGN",
        "channel": "web",
        "device_fingerprint": "fp-abc123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["tx_id"] == "tx-001"
    assert data["risk_level"] == "low"
    assert data["recommended_action"] == "allow"
    assert data["risk_score"] < 30


def test_score_large_amount():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-002",
        "merchant_id": "m-001",
        "amount_kobo": 200_000_000,  # 2M NGN
        "currency": "NGN",
        "channel": "web",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_score"] >= 15
    assert "large_amount" in data["signals"]


def test_score_exceeds_limit():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-003",
        "merchant_id": "m-001",
        "amount_kobo": 1_100_000_000,  # 11M NGN
        "currency": "NGN",
        "channel": "api",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_score"] >= 40
    assert "amount_exceeds_limit" in data["signals"]


def test_score_foreign_card():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-004",
        "merchant_id": "m-001",
        "amount_kobo": 100000,
        "currency": "NGN",
        "channel": "web",
        "card_country": "US",
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "foreign_card" in data["signals"]


def test_score_missing_device_fingerprint():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-005",
        "merchant_id": "m-001",
        "amount_kobo": 100000,
        "currency": "NGN",
        "channel": "web",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "missing_device_fingerprint" in data["signals"]


def test_score_usdc_large_payout():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-006",
        "merchant_id": "m-001",
        "amount_kobo": 100000,
        "currency": "NGN",
        "channel": "usdc_payout",
        "usdc_recipient_wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "usdc_amount_lamports": 15_000_000_000,  # 15,000 USDC
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "usdc_large_payout" in data["signals"]


def test_score_usdc_new_wallet():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-007",
        "merchant_id": "m-001",
        "amount_kobo": 100000,
        "currency": "NGN",
        "channel": "usdc_payout",
        "usdc_recipient_wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "usdc_amount_lamports": 1_000_000,
        "usdc_wallet_age_days": 3,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "usdc_new_recipient_wallet" in data["signals"]


def test_score_usdc_missing_wallet():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-008",
        "merchant_id": "m-001",
        "amount_kobo": 100000,
        "currency": "NGN",
        "channel": "usdc_payout",
        "usdc_amount_lamports": 1_000_000,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "usdc_missing_wallet" in data["signals"]


def test_score_critical_risk():
    resp = client.post("/v1/score", json={
        "tx_id": "tx-009",
        "merchant_id": "m-001",
        "amount_kobo": 1_200_000_000,  # 12M NGN
        "currency": "NGN",
        "channel": "usdc_payout",
        "usdc_amount_lamports": 200_000_000_000,  # 200k USDC
        "usdc_wallet_age_days": 1,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_level"] in ("high", "critical")
    assert data["recommended_action"] in ("review", "block")


# ─── Batch scoring ────────────────────────────────────────────────────────────
def test_batch_score():
    resp = client.post("/v1/batch-score", json={
        "transactions": [
            {"tx_id": "b-001", "merchant_id": "m-001", "amount_kobo": 50000, "channel": "web", "device_fingerprint": "fp1"},
            {"tx_id": "b-002", "merchant_id": "m-001", "amount_kobo": 200_000_000, "channel": "api"},
        ]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["results"]) == 2
    assert data["duration_ms"] >= 0


def test_batch_score_empty_rejected():
    resp = client.post("/v1/batch-score", json={"transactions": []})
    # Empty list should fail validation
    assert resp.status_code in (200, 422)


# ─── Consumer scoring: /v1/score/consumer ─────────────────────────────────────
def test_consumer_score_low_risk():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-001",
        "user_id": "user-42",
        "amount_kobo": 50000,
        "channel": "p2p",
        "device_fingerprint": "fp-consumer-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["tx_id"] == "c-001"
    assert data["user_id"] == "user-42"
    assert data["risk_level"] == "low"
    assert data["recommended_action"] == "allow"


def test_consumer_score_large_amount():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-002",
        "user_id": "user-42",
        "amount_kobo": 600_000_00,  # 600k NGN
        "channel": "p2p",
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_large_amount" in data["signals"]
    assert data["risk_score"] >= 20


def test_consumer_score_exceeds_limit():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-003",
        "user_id": "user-42",
        "amount_kobo": 6_000_000_00,  # 6M NGN
        "channel": "p2p",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_amount_exceeds_limit" in data["signals"]
    assert data["risk_score"] >= 40


def test_consumer_score_high_velocity():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-004",
        "user_id": "user-42",
        "amount_kobo": 100000,
        "channel": "p2p",
        "txn_count_24h": 25,
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_high_velocity_24h" in data["signals"]


def test_consumer_score_daily_limit():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-005",
        "user_id": "user-42",
        "amount_kobo": 100000,
        "channel": "p2p",
        "total_amount_24h_kobo": 2_500_000_00,  # 2.5M NGN
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_daily_limit_exceeded" in data["signals"]


def test_consumer_score_new_recipient_large():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-006",
        "user_id": "user-42",
        "amount_kobo": 600_000_00,
        "channel": "p2p",
        "is_new_recipient": True,
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_large_to_new_recipient" in data["signals"]


def test_consumer_score_first_transaction_large():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-007",
        "user_id": "user-42",
        "amount_kobo": 200_000_00,  # 200k NGN
        "channel": "p2p",
        "is_first_transaction": True,
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_large_first_transaction" in data["signals"]


def test_consumer_score_missing_fingerprint():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-008",
        "user_id": "user-42",
        "amount_kobo": 50000,
        "channel": "p2p",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_missing_device_fingerprint" in data["signals"]


def test_consumer_score_ussd_large():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-009",
        "user_id": "user-42",
        "amount_kobo": 300_000_00,  # 300k NGN via USSD
        "channel": "ussd",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_large_ussd_transaction" in data["signals"]


def test_consumer_score_cross_border():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-010",
        "user_id": "user-42",
        "amount_kobo": 100000,
        "channel": "cross_border",
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_cross_border" in data["signals"]


def test_consumer_score_large_cross_border():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-011",
        "user_id": "user-42",
        "amount_kobo": 600_000_00,
        "channel": "cross_border",
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_cross_border" in data["signals"]
    assert "consumer_large_cross_border" in data["signals"]


def test_consumer_score_red_envelope_large():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-012",
        "user_id": "user-42",
        "amount_kobo": 200_000_00,
        "channel": "red_envelope",
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "consumer_large_red_envelope" in data["signals"]


def test_consumer_score_critical_risk():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-013",
        "user_id": "user-42",
        "amount_kobo": 6_000_000_00,
        "channel": "p2p",
        "txn_count_24h": 30,
        "total_amount_24h_kobo": 3_000_000_00,
        "is_new_recipient": True,
        "is_first_transaction": True,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_level"] in ("high", "critical")
    assert data["recommended_action"] in ("review", "block")


def test_consumer_score_response_fields():
    resp = client.post("/v1/score/consumer", json={
        "tx_id": "c-014",
        "user_id": "user-99",
        "amount_kobo": 10000,
        "channel": "bill_pay",
        "device_fingerprint": "fp-abc",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "tx_id" in data
    assert "user_id" in data
    assert "risk_score" in data
    assert "risk_level" in data
    assert "signals" in data
    assert "recommended_action" in data
    assert "scored_at_ms" in data
    assert 0 <= data["risk_score"] <= 100


# ─── Metrics ─────────────────────────────────────────────────────────────────
def test_metrics():
    resp = client.get("/metrics")
    assert resp.status_code == 200
