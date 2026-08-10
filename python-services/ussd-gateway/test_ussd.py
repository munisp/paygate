"""
Tests for the PayGate USSD Gateway.
Run with: pytest test_ussd.py -v
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import os

os.environ.setdefault("BRIDGE_URL", "")
os.environ.setdefault("BRIDGE_INTERNAL_KEY", "test-key")

from main import app, handle_ussd, sessions

client = TestClient(app)


def fresh_session(session_id="sess1"):
    """Clear sessions before each test."""
    sessions.clear()
    return session_id


# ─── Health check ─────────────────────────────────────────────────────────────
def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "ussd-gateway"


# ─── Main menu ────────────────────────────────────────────────────────────────
def test_main_menu_empty_text():
    sid = fresh_session()
    result = handle_ussd(sid, "+2348012345678", "", "*737#")
    assert result.startswith("CON Welcome to PayGate")
    assert "1. Check Balance" in result
    assert "2. Send Money" in result
    assert "3. Pay Bill" in result
    assert "4. Buy Airtime" in result
    assert "5. Transaction History" in result
    assert "6. Change PIN" in result


def test_exit_option():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "0", "*737#")
    assert result.startswith("END")
    assert "Goodbye" in result or "Thank you" in result


def test_invalid_option():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "9", "*737#")
    assert "Invalid option" in result or result.startswith("CON")


# ─── Balance check ────────────────────────────────────────────────────────────
def test_check_balance_simulated():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    with patch("main.get_consumer_balance", return_value={"balance_kobo": 500000, "currency": "NGN", "simulated": True}):
        result = handle_ussd(sid, "+2348012345678", "1", "*737#")
    assert result.startswith("END")
    assert "5,000.00" in result
    assert "NGN" in result


def test_check_balance_bridge_failure():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    with patch("main.get_consumer_balance", return_value=None):
        result = handle_ussd(sid, "+2348012345678", "1", "*737#")
    assert result.startswith("END")
    assert "Unable to fetch" in result


# ─── Send money flow ──────────────────────────────────────────────────────────
def test_send_money_step1():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "2", "*737#")
    assert result.startswith("CON")
    assert "recipient" in result.lower() or "phone" in result.lower()


def test_send_money_step2():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "2*08098765432", "*737#")
    assert result.startswith("CON")
    assert "amount" in result.lower() or "NGN" in result


def test_send_money_step3_confirm():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "2*08098765432*1000", "*737#")
    assert result.startswith("CON")
    assert "Confirm" in result
    assert "1,000.00" in result


def test_send_money_step4_confirm():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    with patch("main.initiate_p2p_transfer", return_value={"success": True, "reference": "USSD-123", "simulated": True}):
        result = handle_ussd(sid, "+2348012345678", "2*08098765432*1000*1", "*737#")
    assert result.startswith("END")
    assert "successful" in result.lower()
    assert "USSD-123" in result


def test_send_money_step4_cancel():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "2*08098765432*1000*2", "*737#")
    assert result.startswith("END")
    assert "cancelled" in result.lower()


def test_send_money_invalid_amount():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "2*08098765432*abc", "*737#")
    assert result.startswith("END")
    assert "Invalid" in result


def test_send_money_transfer_failure():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    with patch("main.initiate_p2p_transfer", return_value=None):
        result = handle_ussd(sid, "+2348012345678", "2*08098765432*500*1", "*737#")
    assert result.startswith("END")
    assert "failed" in result.lower()


# ─── Bill payment flow ────────────────────────────────────────────────────────
def test_bill_menu():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "3", "*737#")
    assert result.startswith("CON")
    assert "EKEDC" in result or "Electricity" in result


def test_bill_select_biller():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "3*1", "*737#")
    assert result.startswith("CON")
    assert "EKEDC" in result or "account" in result.lower() or "meter" in result.lower()


def test_bill_enter_ref():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "3*1*1234567890", "*737#")
    assert result.startswith("CON")
    assert "amount" in result.lower()


def test_bill_confirm():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "3*1*1234567890*5000", "*737#")
    assert result.startswith("CON")
    assert "Confirm" in result
    assert "5,000.00" in result


def test_bill_pay_success():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    with patch("main.pay_bill", return_value={"success": True, "reference": "BILL-456", "simulated": True}):
        result = handle_ussd(sid, "+2348012345678", "3*1*1234567890*5000*1", "*737#")
    assert result.startswith("END")
    assert "successful" in result.lower()


def test_bill_pay_cancel():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "3*1*1234567890*5000*2", "*737#")
    assert result.startswith("END")
    assert "cancelled" in result.lower()


def test_bill_invalid_biller():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "3*9", "*737#")
    assert result.startswith("END")
    assert "Invalid" in result


# ─── Airtime flow ─────────────────────────────────────────────────────────────
def test_airtime_enter_amount():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "4", "*737#")
    assert result.startswith("CON")
    assert "amount" in result.lower() or "airtime" in result.lower()


def test_airtime_confirm():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "4*200", "*737#")
    assert result.startswith("CON")
    assert "200.00" in result
    assert "Confirm" in result


def test_airtime_purchase_success():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    with patch("main.pay_bill", return_value={"success": True, "reference": "AIR-789", "simulated": True}):
        result = handle_ussd(sid, "+2348012345678", "4*200*1", "*737#")
    assert result.startswith("END")
    assert "purchased" in result.lower() or "successful" in result.lower()


def test_airtime_cancel():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "4*200*2", "*737#")
    assert result.startswith("END")
    assert "cancelled" in result.lower()


# ─── Transaction history ──────────────────────────────────────────────────────
def test_history_no_transactions():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    with patch("main.get_transaction_history", return_value=[]):
        result = handle_ussd(sid, "+2348012345678", "5", "*737#")
    assert result.startswith("END")
    assert "No recent" in result


def test_history_with_transactions():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    txns = [
        {"amount_kobo": 100000, "type": "credit", "reference": "REF001"},
        {"amount_kobo": 50000, "type": "debit", "reference": "REF002"},
    ]
    with patch("main.get_transaction_history", return_value=txns):
        result = handle_ussd(sid, "+2348012345678", "5", "*737#")
    assert result.startswith("END")
    assert "1,000.00" in result
    assert "500.00" in result


# ─── PIN change flow ──────────────────────────────────────────────────────────
def test_pin_change_enter_old():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "6", "*737#")
    assert result.startswith("CON")
    assert "PIN" in result or "pin" in result.lower()


def test_pin_change_enter_new():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "6*1234", "*737#")
    assert result.startswith("CON")
    assert "new" in result.lower() or "PIN" in result


def test_pin_change_confirm_new():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "6*1234*5678", "*737#")
    assert result.startswith("CON")
    assert "Confirm" in result


def test_pin_change_success():
    sid = fresh_session()
    # Step 1: main menu
    handle_ussd(sid, "+2348012345678", "", "*737#")
    # Step 2: select PIN change
    handle_ussd(sid, "+2348012345678", "6", "*737#")
    # Step 3: enter old PIN
    handle_ussd(sid, "+2348012345678", "6*1234", "*737#")
    # Step 4: enter new PIN
    handle_ussd(sid, "+2348012345678", "6*1234*5678", "*737#")
    # Step 5: confirm new PIN
    with patch("main.change_pin", return_value=True):
        result = handle_ussd(sid, "+2348012345678", "6*1234*5678*5678", "*737#")
    assert result.startswith("END")
    assert "success" in result.lower()


def test_pin_change_mismatch():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "6*1234*5678*9999", "*737#")
    assert result.startswith("END")
    assert "match" in result.lower() or "do not" in result.lower()


def test_pin_change_invalid_length():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "6*1234*123", "*737#")
    assert result.startswith("END")
    assert "4 digits" in result or "exactly" in result.lower()


def test_pin_change_non_numeric():
    sid = fresh_session()
    handle_ussd(sid, "+2348012345678", "", "*737#")
    result = handle_ussd(sid, "+2348012345678", "6*1234*abcd", "*737#")
    assert result.startswith("END")
    assert "4 digits" in result or "digits" in result.lower()


# ─── USSD callback endpoint ───────────────────────────────────────────────────
def test_ussd_callback_main_menu():
    sessions.clear()
    resp = client.post("/v1/ussd/callback", data={
        "sessionId": "AT-sess-001",
        "phoneNumber": "+2348012345678",
        "text": "",
        "serviceCode": "*737#",
    })
    assert resp.status_code == 200
    assert "CON Welcome to PayGate" in resp.text


def test_ussd_callback_check_balance():
    sessions.clear()
    with patch("main.get_consumer_balance", return_value={"balance_kobo": 250000, "currency": "NGN"}):
        resp = client.post("/v1/ussd/callback", data={
            "sessionId": "AT-sess-002",
            "phoneNumber": "+2348012345678",
            "text": "1",
            "serviceCode": "*737#",
        })
    assert resp.status_code == 200
    assert "END" in resp.text
    assert "2,500.00" in resp.text


def test_ussd_callback_error_handling():
    sessions.clear()
    with patch("main.handle_ussd", side_effect=Exception("Unexpected error")):
        resp = client.post("/v1/ussd/callback", data={
            "sessionId": "AT-sess-003",
            "phoneNumber": "+2348012345678",
            "text": "",
            "serviceCode": "*737#",
        })
    assert resp.status_code == 200
    assert "END" in resp.text
    assert "unavailable" in resp.text.lower()


# ─── Metrics ─────────────────────────────────────────────────────────────────
def test_metrics():
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "paygate_ussd_active_sessions" in resp.text
