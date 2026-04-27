"""
Tests for PayGate Merchant USSD Fallback Service (Wave 109)
"""
import os
import sys
import time

# MUST set env vars before importing main so module-level constants are correct
os.environ["INTERNAL_API_KEY"] = "test-key-123"
os.environ["BRIDGE_URL"] = ""          # No bridge in unit tests
os.environ["TERMII_API_KEY"] = ""      # No real SMS in unit tests
os.environ["AT_API_KEY"] = ""          # No real USSD in unit tests
os.environ["LOG_LEVEL"] = "WARNING"   # Suppress log noise in tests

import pytest
from fastapi.testclient import TestClient
from main import (
    app,
    _generate_otp,
    _verify_otp,
    _check_rate_limit,
    _rate_limits,
    _otp_store,
    OTP_TTL,
)

client = TestClient(app)
AUTH = {"x-internal-key": "test-key-123"}


# ─── Health ───────────────────────────────────────────────────────────────────

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["service"] == "merchant-ussd-fallback"
    assert "active_sessions" in data
    assert isinstance(data["active_sessions"], int)


# ─── USSD main menu ───────────────────────────────────────────────────────────

def test_ussd_main_menu():
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-001",
        "phoneNumber": "+2348000000001",
        "text": "",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON PayGate Merchant" in r.text
    assert "Settlement Balance" in r.text
    assert "Approve Payout" in r.text
    assert "Freeze Account" in r.text


def test_ussd_exit():
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-002",
        "phoneNumber": "+2348000000002",
        "text": "0",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    assert "Thank you" in r.text


def test_ussd_balance_no_bridge():
    """Without bridge configured, should return graceful error message."""
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-003",
        "phoneNumber": "+2348000000003",
        "text": "1",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    # Should mention balance or unable
    assert any(w in r.text.lower() for w in ["balance", "unable", "fetch"])


def test_ussd_recent_transactions_no_bridge():
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-004",
        "phoneNumber": "+2348000000004",
        "text": "3",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")


def test_ussd_pending_payouts_no_bridge():
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-004b",
        "phoneNumber": "+2348000000004",
        "text": "2",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")


def test_ussd_disputes_no_bridge():
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-004c",
        "phoneNumber": "+2348000000004",
        "text": "5",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")


def test_ussd_payment_link_flow_step1():
    """Step 1: select option 4 — should ask for amount."""
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-005a",
        "phoneNumber": "+2348000000005",
        "text": "4",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON" in r.text
    assert "amount" in r.text.lower()


def test_ussd_payment_link_flow_step2():
    """Step 2: enter valid amount — should create link (no bridge → END with error)."""
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-005b",
        "phoneNumber": "+2348000000005",
        "text": "4*5000",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")


def test_ussd_payment_link_invalid_amount():
    # Must first establish session with step 1, then submit invalid amount
    client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-006-init",
        "phoneNumber": "+2348000000006",
        "text": "4",
        "serviceCode": "*737*PG#",
    })
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-006-init",
        "phoneNumber": "+2348000000006",
        "text": "4*abc",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "Invalid amount" in r.text


def test_ussd_payment_link_zero_amount():
    # Must first establish session with step 1, then submit zero amount
    client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-006b-init",
        "phoneNumber": "+2348000000006",
        "text": "4",
        "serviceCode": "*737*PG#",
    })
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-006b-init",
        "phoneNumber": "+2348000000006",
        "text": "4*0",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "Invalid amount" in r.text


def test_ussd_freeze_confirm_prompt():
    """Option 6 should show freeze confirmation prompt."""
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-007a",
        "phoneNumber": "+2348000000007",
        "text": "6",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON" in r.text
    assert "FREEZE" in r.text.upper()


def test_ussd_freeze_cancel():
    """Selecting 2 (cancel) in freeze flow should end session."""
    # Must first establish session with step 1 (option 6)
    client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-007b-init",
        "phoneNumber": "+2348000000007",
        "text": "6",
        "serviceCode": "*737*PG#",
    })
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-007b-init",
        "phoneNumber": "+2348000000007",
        "text": "6*2",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    assert "cancel" in r.text.lower() or "Cancel" in r.text


def test_ussd_freeze_confirm_no_bridge():
    """Confirming freeze without bridge should return graceful error."""
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-007c",
        "phoneNumber": "+2348000000007",
        "text": "6*1",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")


def test_ussd_invalid_option():
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-008",
        "phoneNumber": "+2348000000008",
        "text": "9",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "Invalid option" in r.text or r.text.startswith("END")


# ─── OTP ──────────────────────────────────────────────────────────────────────

def test_send_otp():
    r = client.post("/v1/sms/send-otp", json={"phone": "+2348000000010"}, headers=AUTH)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["expires_in"] == OTP_TTL


def test_send_otp_missing_phone():
    r = client.post("/v1/sms/send-otp", json={}, headers=AUTH)
    assert r.status_code == 400


def test_verify_otp_valid():
    phone = "+2348000000011"
    otp = _generate_otp(phone)
    r = client.post("/v1/sms/verify-otp", json={"phone": phone, "otp": otp}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["valid"] is True


def test_verify_otp_invalid():
    phone = "+2348000000012"
    _generate_otp(phone)
    r = client.post("/v1/sms/verify-otp", json={"phone": phone, "otp": "000000"}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["valid"] is False


def test_verify_otp_consumed():
    """OTP should only be valid once (consumed on first use)."""
    phone = "+2348000000013"
    otp = _generate_otp(phone)
    # First use — valid
    r1 = client.post("/v1/sms/verify-otp", json={"phone": phone, "otp": otp}, headers=AUTH)
    assert r1.json()["valid"] is True
    # Second use — invalid (consumed)
    r2 = client.post("/v1/sms/verify-otp", json={"phone": phone, "otp": otp}, headers=AUTH)
    assert r2.json()["valid"] is False


def test_verify_otp_expired():
    """Expired OTPs should be rejected."""
    phone = "+2348000000014"
    _generate_otp(phone)
    # Manually expire it
    _otp_store[phone]["expires"] = time.time() - 1
    stored_otp = _otp_store[phone]["otp"]
    r = client.post("/v1/sms/verify-otp", json={"phone": phone, "otp": stored_otp}, headers=AUTH)
    assert r.json()["valid"] is False


def test_verify_otp_missing_fields():
    r = client.post("/v1/sms/verify-otp", json={"phone": "+234"}, headers=AUTH)
    assert r.status_code == 400


# ─── SMS alert ────────────────────────────────────────────────────────────────

def test_send_alert():
    r = client.post("/v1/sms/send-alert", json={
        "phone": "+2348000000020",
        "message": "Test alert from PayGate",
    }, headers=AUTH)
    assert r.status_code == 200
    # success may be False if Termii not configured, but endpoint should return 200
    assert "success" in r.json()


def test_send_alert_missing_message():
    r = client.post("/v1/sms/send-alert", json={"phone": "+2348000000021"}, headers=AUTH)
    assert r.status_code == 400


def test_send_alert_missing_phone():
    r = client.post("/v1/sms/send-alert", json={"message": "hello"}, headers=AUTH)
    assert r.status_code == 400


# ─── Auth enforcement ─────────────────────────────────────────────────────────

def test_send_otp_no_auth():
    r = client.post("/v1/sms/send-otp", json={"phone": "+2348000000030"})
    assert r.status_code == 401


def test_verify_otp_no_auth():
    r = client.post("/v1/sms/verify-otp", json={"phone": "+234", "otp": "123456"})
    assert r.status_code == 401


def test_send_alert_no_auth():
    r = client.post("/v1/sms/send-alert", json={"phone": "+234", "message": "x"})
    assert r.status_code == 401


def test_metrics_no_auth():
    r = client.get("/metrics")
    assert r.status_code == 401


def test_metrics_with_auth():
    r = client.get("/metrics", headers=AUTH)
    assert r.status_code == 200
    assert "paygate_ussd_sessions_total" in r.text
    assert "paygate_sms_sent_total" in r.text


# ─── Rate limiting ────────────────────────────────────────────────────────────

def test_rate_limit_allows_up_to_max():
    phone = "+2348099999001"
    _rate_limits.pop(phone, None)
    for _ in range(10):
        assert _check_rate_limit(phone) is True


def test_rate_limit_blocks_over_max():
    phone = "+2348099999002"
    _rate_limits.pop(phone, None)
    for _ in range(10):
        _check_rate_limit(phone)
    # 11th request should be blocked
    assert _check_rate_limit(phone) is False


def test_rate_limit_different_phones_independent():
    phone_a = "+2348099999003"
    phone_b = "+2348099999004"
    _rate_limits.pop(phone_a, None)
    _rate_limits.pop(phone_b, None)
    for _ in range(10):
        _check_rate_limit(phone_a)
    # phone_a is rate limited but phone_b should still be allowed
    assert _check_rate_limit(phone_a) is False
    assert _check_rate_limit(phone_b) is True
