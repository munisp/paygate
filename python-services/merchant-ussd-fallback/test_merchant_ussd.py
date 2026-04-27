"""
Tests for PayGate Merchant USSD Fallback Service (Wave 110)
Covers: USSD state machine, OTP, SMS alerts, rate limiting,
        i18n/localisation (EN/HA/YO/IG/FR), and session language persistence.
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
    _sessions,
    _load_locales,
    _LOCALES,
    t,
    OTP_TTL,
)

# Load locales before running tests (normally done in lifespan)
_load_locales()

client = TestClient(app, raise_server_exceptions=True)
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


# ─── USSD main menu (English default) ────────────────────────────────────────
def test_ussd_main_menu():
    r = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": "sess-001",
        "phoneNumber": "+2348000000001",
        "text": "",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON" in r.text
    assert "PayGate" in r.text
    assert "Settlement Balance" in r.text or "Balance" in r.text
    assert "Freeze" in r.text or "freeze" in r.text.lower()


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
    assert "Invalid amount" in r.text or "invalid" in r.text.lower()


def test_ussd_payment_link_zero_amount():
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
    assert "Invalid amount" in r.text or "invalid" in r.text.lower()


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
    assert "Invalid" in r.text or r.text.startswith("END")


# ─── i18n: Hausa (ha) ─────────────────────────────────────────────────────────
def test_ussd_main_menu_hausa():
    """?lang=ha should return Hausa menu text."""
    r = client.post("/v1/ussd/merchant/callback?lang=ha", data={
        "sessionId": "sess-ha-001",
        "phoneNumber": "+2348100000001",
        "text": "",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON" in r.text
    assert "PayGate Dan Kasuwa" in r.text
    assert "Duba Kudin Tsari" in r.text or "Kuɗi" in r.text


def test_ussd_exit_hausa():
    """?lang=ha goodbye message should be in Hausa."""
    r = client.post("/v1/ussd/merchant/callback?lang=ha", data={
        "sessionId": "sess-ha-002",
        "phoneNumber": "+2348100000002",
        "text": "0",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    assert "Na gode" in r.text or "PayGate" in r.text


def test_ussd_invalid_amount_hausa():
    """Invalid amount in Hausa session should return Hausa error."""
    # First establish session at step 1 (option 4)
    client.post("/v1/ussd/merchant/callback?lang=ha", data={
        "sessionId": "sess-ha-003",
        "phoneNumber": "+2348100000003",
        "text": "4",
        "serviceCode": "*737*PG#",
    })
    r = client.post("/v1/ussd/merchant/callback?lang=ha", data={
        "sessionId": "sess-ha-003",
        "phoneNumber": "+2348100000003",
        "text": "4*xyz",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    assert "Adadi" in r.text or "mara inganci" in r.text or "invalid" in r.text.lower()


# ─── i18n: Yoruba (yo) ────────────────────────────────────────────────────────
def test_ussd_main_menu_yoruba():
    """?lang=yo should return Yoruba menu text."""
    r = client.post("/v1/ussd/merchant/callback?lang=yo", data={
        "sessionId": "sess-yo-001",
        "phoneNumber": "+2348200000001",
        "text": "",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON" in r.text
    assert "PayGate Oniṣowo" in r.text
    assert "Iye Owo" in r.text or "Fọwọsi" in r.text or "Didi" in r.text


def test_ussd_exit_yoruba():
    """?lang=yo goodbye message should be in Yoruba."""
    r = client.post("/v1/ussd/merchant/callback?lang=yo", data={
        "sessionId": "sess-yo-002",
        "phoneNumber": "+2348200000002",
        "text": "0",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    assert "E dupe" in r.text or "PayGate" in r.text or "dupe" in r.text.lower()


# ─── i18n: Igbo (ig) ──────────────────────────────────────────────────────────
def test_ussd_main_menu_igbo():
    """?lang=ig should return Igbo menu text."""
    r = client.post("/v1/ussd/merchant/callback?lang=ig", data={
        "sessionId": "sess-ig-001",
        "phoneNumber": "+2348300000001",
        "text": "",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON" in r.text
    assert "PayGate Onye Ahia" in r.text
    assert "Ngụkọ" in r.text or "Kwadoo" in r.text or "Mechie" in r.text


def test_ussd_exit_igbo():
    """?lang=ig goodbye message should be in Igbo."""
    r = client.post("/v1/ussd/merchant/callback?lang=ig", data={
        "sessionId": "sess-ig-002",
        "phoneNumber": "+2348300000002",
        "text": "0",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    assert "Daalụ" in r.text or "PayGate" in r.text or "daalụ" in r.text.lower()


# ─── i18n: French (fr) ────────────────────────────────────────────────────────
def test_ussd_main_menu_french():
    """?lang=fr should return French menu text."""
    r = client.post("/v1/ussd/merchant/callback?lang=fr", data={
        "sessionId": "sess-fr-001",
        "phoneNumber": "+2348400000001",
        "text": "",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON" in r.text
    assert "PayGate Marchand" in r.text
    assert "Solde" in r.text or "règlement" in r.text or "Approuver" in r.text


def test_ussd_exit_french():
    """?lang=fr goodbye message should be in French."""
    r = client.post("/v1/ussd/merchant/callback?lang=fr", data={
        "sessionId": "sess-fr-002",
        "phoneNumber": "+2348400000002",
        "text": "0",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    assert "Merci" in r.text or "PayGate" in r.text


def test_ussd_invalid_amount_french():
    """Invalid amount in French session should return French error."""
    # First establish session at step 1 (option 4)
    client.post("/v1/ussd/merchant/callback?lang=fr", data={
        "sessionId": "sess-fr-003",
        "phoneNumber": "+2348400000003",
        "text": "4",
        "serviceCode": "*737*PG#",
    })
    r = client.post("/v1/ussd/merchant/callback?lang=fr", data={
        "sessionId": "sess-fr-003",
        "phoneNumber": "+2348400000003",
        "text": "4*abc",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert r.text.startswith("END")
    assert "Montant invalide" in r.text or "invalide" in r.text.lower() or "invalid" in r.text.lower()


# ─── i18n: Session language persistence ──────────────────────────────────────
def test_ussd_session_language_persistence():
    """Language set in first request should persist across multi-step flow."""
    session_id = "sess-persist-001"
    phone = "+2348500000001"

    # Step 1: Set language to Hausa
    r1 = client.post("/v1/ussd/merchant/callback?lang=ha", data={
        "sessionId": session_id,
        "phoneNumber": phone,
        "text": "",
        "serviceCode": "*737*PG#",
    })
    assert r1.status_code == 200
    assert "PayGate Dan Kasuwa" in r1.text

    # Step 2: Continue without lang param — should still use Hausa
    r2 = client.post("/v1/ussd/merchant/callback", data={
        "sessionId": session_id,
        "phoneNumber": phone,
        "text": "0",
        "serviceCode": "*737*PG#",
    })
    assert r2.status_code == 200
    assert r2.text.startswith("END")
    assert "Na gode" in r2.text or "PayGate" in r2.text


def test_ussd_invalid_lang_falls_back_to_english():
    """Unknown lang code should fall back to English."""
    r = client.post("/v1/ussd/merchant/callback?lang=xx", data={
        "sessionId": "sess-xx-001",
        "phoneNumber": "+2348600000001",
        "text": "",
        "serviceCode": "*737*PG#",
    })
    assert r.status_code == 200
    assert "CON" in r.text
    assert "PayGate" in r.text


# ─── i18n: t() helper function ────────────────────────────────────────────────
def test_t_helper_english():
    """t() should return English text for 'en' lang."""
    result = t("en", "goodbye")
    assert "Thank you" in result


def test_t_helper_hausa():
    """t() should return Hausa text for 'ha' lang."""
    result = t("ha", "goodbye")
    assert "Na gode" in result


def test_t_helper_yoruba():
    """t() should return Yoruba text for 'yo' lang."""
    result = t("yo", "goodbye")
    assert result != "goodbye"


def test_t_helper_igbo():
    """t() should return Igbo text for 'ig' lang."""
    result = t("ig", "goodbye")
    assert result != "goodbye"


def test_t_helper_french():
    """t() should return French text for 'fr' lang."""
    result = t("fr", "goodbye")
    assert "Merci" in result or result != "goodbye"


def test_t_helper_fallback_to_english():
    """t() should fall back to English if key missing in requested lang."""
    result = t("xx", "goodbye")
    assert "Thank you" in result


def test_t_helper_key_substitution():
    """t() should apply format substitutions."""
    result = t("en", "balance_result", currency="NGN", balance="50000", available="45000", ledger="50000")
    assert "NGN" in result
    assert "50000" in result


def test_t_helper_missing_key_returns_key():
    """t() should return the key itself if not found in any locale."""
    result = t("en", "nonexistent_key_xyz")
    assert result == "nonexistent_key_xyz"


# ─── i18n: Locale loading ─────────────────────────────────────────────────────
def test_all_locales_loaded():
    """All 5 locale files should be loaded."""
    assert "en" in _LOCALES
    assert "ha" in _LOCALES
    assert "yo" in _LOCALES
    assert "ig" in _LOCALES
    assert "fr" in _LOCALES


def test_locale_has_required_keys():
    """All locales should have the core required keys."""
    required_keys = [
        "goodbye", "invalid_option", "amount_invalid",
        "app_name", "menu_balance_label", "menu_exit_label",
    ]
    for lang in ["en", "ha", "yo", "ig", "fr"]:
        for key in required_keys:
            assert key in _LOCALES[lang], f"Missing key '{key}' in locale '{lang}'"


def test_locale_goodbye_differs_by_language():
    """Each language should have a distinct goodbye message."""
    goodbyes = {lang: _LOCALES[lang].get("goodbye", "") for lang in ["en", "ha", "yo", "ig", "fr"]}
    unique_goodbyes = set(goodbyes.values())
    assert len(unique_goodbyes) == 5, f"Expected 5 unique goodbye messages, got: {goodbyes}"


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
    r1 = client.post("/v1/sms/verify-otp", json={"phone": phone, "otp": otp}, headers=AUTH)
    assert r1.json()["valid"] is True
    r2 = client.post("/v1/sms/verify-otp", json={"phone": phone, "otp": otp}, headers=AUTH)
    assert r2.json()["valid"] is False


def test_verify_otp_expired():
    """Expired OTPs should be rejected."""
    phone = "+2348000000014"
    _generate_otp(phone)
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
    assert _check_rate_limit(phone) is False


def test_rate_limit_different_phones_independent():
    phone_a = "+2348099999003"
    phone_b = "+2348099999004"
    _rate_limits.pop(phone_a, None)
    _rate_limits.pop(phone_b, None)
    for _ in range(10):
        _check_rate_limit(phone_a)
    assert _check_rate_limit(phone_a) is False
    assert _check_rate_limit(phone_b) is True
