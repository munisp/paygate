"""
cbn_forms.py — CBN Regulatory Form Generators

Implements:
  - Form A: Monthly Return on Electronic Payment Transactions (CBN/PSMD/2021)
  - Form B: Quarterly Return on E-Payment Fraud (CBN/PSMD/2021)
  - Form C: Annual Return on AML/CFT Compliance (CBN AML/CFT Regulations 2022)

All amounts are in Naira (not kobo) for regulatory submission.
All forms include the mandatory CBN header fields.
"""

import uuid
from datetime import datetime, timezone
from typing import Any


# ─── Form A: Monthly Electronic Payment Transactions ─────────────────────────

def generate_form_a(
    merchant_id: str,
    period: str,  # YYYY-MM
    transaction_data: dict[str, Any],
    reporting_entity: dict[str, Any],
) -> dict[str, Any]:
    """
    Generate CBN Form A: Monthly Return on Electronic Payment Transactions.

    Required fields per CBN PSB Regulatory Framework 2021, Schedule 1:
    - Total volume and value by channel (NIP, USSD, POS, Web, Mobile)
    - Failed transaction counts
    - Dispute/chargeback counts
    - Customer complaint resolution rate
    """
    report_id = f"FORM-A-{merchant_id[:8].upper()}-{period}"

    channels = transaction_data.get("channels", {})

    return {
        "id": report_id,
        "form_type": "CBN_FORM_A",
        "version": "2021.1",
        "reporting_period": period,
        "submission_deadline": _get_monthly_deadline(period),
        "reporting_entity": {
            "name": reporting_entity.get("name", ""),
            "cbn_licence_no": reporting_entity.get("cbn_licence_no", ""),
            "rc_number": reporting_entity.get("rc_number", ""),
            "address": reporting_entity.get("address", ""),
            "contact_officer": reporting_entity.get("contact_officer", ""),
            "contact_email": reporting_entity.get("contact_email", ""),
            "contact_phone": reporting_entity.get("contact_phone", ""),
        },
        "section_1_nip": {
            "description": "NIP (NIBSS Instant Payment) Transactions",
            "outward_volume": channels.get("nip", {}).get("outward_volume", 0),
            "outward_value_ngn": _kobo_to_ngn(channels.get("nip", {}).get("outward_value_kobo", 0)),
            "inward_volume": channels.get("nip", {}).get("inward_volume", 0),
            "inward_value_ngn": _kobo_to_ngn(channels.get("nip", {}).get("inward_value_kobo", 0)),
            "failed_volume": channels.get("nip", {}).get("failed_volume", 0),
            "failed_value_ngn": _kobo_to_ngn(channels.get("nip", {}).get("failed_value_kobo", 0)),
        },
        "section_2_ussd": {
            "description": "USSD Transactions",
            "volume": channels.get("ussd", {}).get("volume", 0),
            "value_ngn": _kobo_to_ngn(channels.get("ussd", {}).get("value_kobo", 0)),
            "failed_volume": channels.get("ussd", {}).get("failed_volume", 0),
        },
        "section_3_pos": {
            "description": "POS Terminal Transactions",
            "volume": channels.get("pos", {}).get("volume", 0),
            "value_ngn": _kobo_to_ngn(channels.get("pos", {}).get("value_kobo", 0)),
            "failed_volume": channels.get("pos", {}).get("failed_volume", 0),
            "active_terminals": channels.get("pos", {}).get("active_terminals", 0),
        },
        "section_4_web_mobile": {
            "description": "Web/Mobile Payment Transactions",
            "web_volume": channels.get("web", {}).get("volume", 0),
            "web_value_ngn": _kobo_to_ngn(channels.get("web", {}).get("value_kobo", 0)),
            "mobile_volume": channels.get("mobile", {}).get("volume", 0),
            "mobile_value_ngn": _kobo_to_ngn(channels.get("mobile", {}).get("value_kobo", 0)),
        },
        "section_5_disputes": {
            "description": "Disputes and Chargebacks",
            "total_disputes": transaction_data.get("disputes", {}).get("total", 0),
            "resolved_disputes": transaction_data.get("disputes", {}).get("resolved", 0),
            "pending_disputes": transaction_data.get("disputes", {}).get("pending", 0),
            "resolution_rate_pct": _calc_resolution_rate(
                transaction_data.get("disputes", {}).get("resolved", 0),
                transaction_data.get("disputes", {}).get("total", 0),
            ),
            "chargeback_volume": transaction_data.get("chargebacks", {}).get("volume", 0),
            "chargeback_value_ngn": _kobo_to_ngn(
                transaction_data.get("chargebacks", {}).get("value_kobo", 0)
            ),
        },
        "section_6_summary": {
            "total_volume": transaction_data.get("total_volume", 0),
            "total_value_ngn": _kobo_to_ngn(transaction_data.get("total_value_kobo", 0)),
            "active_merchants": transaction_data.get("active_merchants", 0),
            "active_customers": transaction_data.get("active_customers", 0),
        },
        "certification": {
            "certified_by": reporting_entity.get("contact_officer", ""),
            "certification_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "statement": (
                "I certify that the information provided in this return is true, "
                "accurate, and complete to the best of my knowledge."
            ),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ─── Form B: Quarterly E-Payment Fraud Return ─────────────────────────────────

def generate_form_b(
    merchant_id: str,
    quarter: str,  # YYYY-Q1|Q2|Q3|Q4
    fraud_data: dict[str, Any],
    reporting_entity: dict[str, Any],
) -> dict[str, Any]:
    """
    Generate CBN Form B: Quarterly Return on E-Payment Fraud.

    Required fields per CBN PSB Regulatory Framework 2021, Schedule 2:
    - Fraud cases by type (card fraud, identity theft, account takeover, etc.)
    - Fraud losses by channel
    - Recovery amounts
    - Fraud prevention measures deployed
    """
    report_id = f"FORM-B-{merchant_id[:8].upper()}-{quarter}"

    fraud_types = fraud_data.get("by_type", {})
    fraud_channels = fraud_data.get("by_channel", {})

    return {
        "id": report_id,
        "form_type": "CBN_FORM_B",
        "version": "2021.1",
        "reporting_quarter": quarter,
        "submission_deadline": _get_quarterly_deadline(quarter),
        "reporting_entity": reporting_entity,
        "section_1_fraud_by_type": {
            "card_fraud": {
                "cases": fraud_types.get("card_fraud", {}).get("cases", 0),
                "loss_ngn": _kobo_to_ngn(fraud_types.get("card_fraud", {}).get("loss_kobo", 0)),
                "recovered_ngn": _kobo_to_ngn(fraud_types.get("card_fraud", {}).get("recovered_kobo", 0)),
            },
            "identity_theft": {
                "cases": fraud_types.get("identity_theft", {}).get("cases", 0),
                "loss_ngn": _kobo_to_ngn(fraud_types.get("identity_theft", {}).get("loss_kobo", 0)),
                "recovered_ngn": _kobo_to_ngn(fraud_types.get("identity_theft", {}).get("recovered_kobo", 0)),
            },
            "account_takeover": {
                "cases": fraud_types.get("account_takeover", {}).get("cases", 0),
                "loss_ngn": _kobo_to_ngn(fraud_types.get("account_takeover", {}).get("loss_kobo", 0)),
                "recovered_ngn": _kobo_to_ngn(fraud_types.get("account_takeover", {}).get("recovered_kobo", 0)),
            },
            "phishing": {
                "cases": fraud_types.get("phishing", {}).get("cases", 0),
                "loss_ngn": _kobo_to_ngn(fraud_types.get("phishing", {}).get("loss_kobo", 0)),
                "recovered_ngn": _kobo_to_ngn(fraud_types.get("phishing", {}).get("recovered_kobo", 0)),
            },
            "social_engineering": {
                "cases": fraud_types.get("social_engineering", {}).get("cases", 0),
                "loss_ngn": _kobo_to_ngn(fraud_types.get("social_engineering", {}).get("loss_kobo", 0)),
                "recovered_ngn": _kobo_to_ngn(fraud_types.get("social_engineering", {}).get("recovered_kobo", 0)),
            },
            "other": {
                "cases": fraud_types.get("other", {}).get("cases", 0),
                "loss_ngn": _kobo_to_ngn(fraud_types.get("other", {}).get("loss_kobo", 0)),
                "recovered_ngn": _kobo_to_ngn(fraud_types.get("other", {}).get("recovered_kobo", 0)),
            },
        },
        "section_2_fraud_by_channel": {
            channel: {
                "cases": fraud_channels.get(channel, {}).get("cases", 0),
                "loss_ngn": _kobo_to_ngn(fraud_channels.get(channel, {}).get("loss_kobo", 0)),
            }
            for channel in ("nip", "pos", "ussd", "web", "mobile", "atm")
        },
        "section_3_summary": {
            "total_fraud_cases": fraud_data.get("total_cases", 0),
            "total_fraud_loss_ngn": _kobo_to_ngn(fraud_data.get("total_loss_kobo", 0)),
            "total_recovered_ngn": _kobo_to_ngn(fraud_data.get("total_recovered_kobo", 0)),
            "net_loss_ngn": _kobo_to_ngn(
                fraud_data.get("total_loss_kobo", 0) - fraud_data.get("total_recovered_kobo", 0)
            ),
            "fraud_rate_pct": fraud_data.get("fraud_rate_pct", 0.0),
        },
        "section_4_prevention_measures": fraud_data.get("prevention_measures", [
            "3D Secure authentication",
            "Real-time fraud scoring engine",
            "Device fingerprinting",
            "Velocity limit controls",
            "BVN verification",
            "Liveness detection for KYC",
        ]),
        "section_5_str_filed": {
            "str_count": fraud_data.get("str_count", 0),
            "str_submitted_to_nfiu": fraud_data.get("str_submitted", 0),
        },
        "certification": {
            "certified_by": reporting_entity.get("contact_officer", ""),
            "certification_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ─── Form C: Annual AML/CFT Compliance Return ─────────────────────────────────

def generate_form_c(
    merchant_id: str,
    year: int,
    aml_data: dict[str, Any],
    reporting_entity: dict[str, Any],
) -> dict[str, Any]:
    """
    Generate CBN Form C: Annual Return on AML/CFT Compliance.

    Required fields per CBN AML/CFT Regulations 2022, Regulation 27:
    - KYC/CDD statistics
    - PEP screening results
    - STR/SAR filing statistics
    - Training and awareness programmes
    - MLRO (Money Laundering Reporting Officer) details
    """
    report_id = f"FORM-C-{merchant_id[:8].upper()}-{year}"

    kyc = aml_data.get("kyc", {})
    pep = aml_data.get("pep_screening", {})
    str_data = aml_data.get("str", {})
    training = aml_data.get("training", {})

    return {
        "id": report_id,
        "form_type": "CBN_FORM_C",
        "version": "2022.1",
        "reporting_year": year,
        "submission_deadline": f"{year + 1}-01-31",
        "reporting_entity": reporting_entity,
        "section_1_kyc_cdd": {
            "description": "Customer Due Diligence Statistics",
            "new_customers_onboarded": kyc.get("new_customers", 0),
            "enhanced_dd_conducted": kyc.get("enhanced_dd", 0),
            "simplified_dd_conducted": kyc.get("simplified_dd", 0),
            "customers_exited_aml_risk": kyc.get("customers_exited", 0),
            "bvn_verified_count": kyc.get("bvn_verified", 0),
            "nin_verified_count": kyc.get("nin_verified", 0),
            "cac_verified_count": kyc.get("cac_verified", 0),
            "kyb_completed_count": kyc.get("kyb_completed", 0),
        },
        "section_2_pep_screening": {
            "description": "Politically Exposed Person Screening",
            "customers_screened": pep.get("customers_screened", 0),
            "pep_matches_found": pep.get("pep_matches", 0),
            "pep_accounts_active": pep.get("pep_active", 0),
            "pep_accounts_closed": pep.get("pep_closed", 0),
            "sanctions_matches": pep.get("sanctions_matches", 0),
        },
        "section_3_str_sar": {
            "description": "Suspicious Transaction / Activity Reports",
            "str_filed": str_data.get("str_filed", 0),
            "str_submitted_to_nfiu": str_data.get("str_submitted", 0),
            "str_acknowledged_by_nfiu": str_data.get("str_acknowledged", 0),
            "str_late_submissions": str_data.get("str_late", 0),
            "average_filing_time_hours": str_data.get("avg_filing_hours", 0.0),
        },
        "section_4_training": {
            "description": "AML/CFT Training and Awareness",
            "staff_trained": training.get("staff_trained", 0),
            "training_hours_total": training.get("total_hours", 0),
            "training_programmes": training.get("programmes", []),
            "mlro_certification_valid": training.get("mlro_cert_valid", False),
        },
        "section_5_mlro": {
            "name": aml_data.get("mlro", {}).get("name", ""),
            "designation": aml_data.get("mlro", {}).get("designation", ""),
            "email": aml_data.get("mlro", {}).get("email", ""),
            "phone": aml_data.get("mlro", {}).get("phone", ""),
            "certification": aml_data.get("mlro", {}).get("certification", ""),
            "appointment_date": aml_data.get("mlro", {}).get("appointment_date", ""),
        },
        "section_6_risk_assessment": {
            "last_risk_assessment_date": aml_data.get("last_risk_assessment", ""),
            "overall_risk_rating": aml_data.get("risk_rating", "medium"),
            "high_risk_customers": aml_data.get("high_risk_customers", 0),
            "medium_risk_customers": aml_data.get("medium_risk_customers", 0),
            "low_risk_customers": aml_data.get("low_risk_customers", 0),
        },
        "certification": {
            "certified_by": reporting_entity.get("contact_officer", ""),
            "designation": reporting_entity.get("contact_designation", ""),
            "certification_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "statement": (
                "I certify that this institution has complied with all applicable "
                "AML/CFT regulations during the reporting period, and that the "
                "information provided is true, accurate, and complete."
            ),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _kobo_to_ngn(kobo: int) -> float:
    """Convert kobo (integer) to Naira (float, 2 decimal places)."""
    return round(kobo / 100.0, 2)


def _calc_resolution_rate(resolved: int, total: int) -> float:
    """Calculate dispute resolution rate as a percentage."""
    if total == 0:
        return 100.0
    return round((resolved / total) * 100, 2)


def _get_monthly_deadline(period: str) -> str:
    """CBN Form A is due by the 10th of the following month."""
    try:
        year, month = period.split("-")
        next_month = int(month) + 1
        next_year = int(year)
        if next_month > 12:
            next_month = 1
            next_year += 1
        return f"{next_year}-{next_month:02d}-10"
    except Exception:
        return ""


def _get_quarterly_deadline(quarter: str) -> str:
    """CBN Form B is due 30 days after quarter end."""
    deadlines = {
        "Q1": "-04-30",
        "Q2": "-07-31",
        "Q3": "-10-31",
        "Q4": "-01-31",  # next year
    }
    try:
        year, q = quarter.split("-")
        suffix = deadlines.get(q, "-01-31")
        if q == "Q4":
            return f"{int(year) + 1}{suffix}"
        return f"{year}{suffix}"
    except Exception:
        return ""
