"""
Tax Engine Microservice
Calculates Nigerian taxes: VAT (7.5%), Withholding Tax (WHT), Stamp Duty, and FIRS remittance.
Exposes:
  POST /calculate  - calculate all applicable taxes for a transaction
  GET  /rates      - get current tax rates
  POST /remittance - calculate monthly FIRS remittance summary
"""
import os
import logging
from datetime import datetime, timezone
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tax-engine")

app = Flask(__name__)

# ─── Mandatory internal service-to-service auth (fail closed) ───────────────
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks.
import hmac as _hmac_mod

_INTERNAL_AUTH_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@app.before_request
def _require_internal_api_key():
    if request.path in _AUTH_EXEMPT_PATHS:
        return None
    if not _INTERNAL_AUTH_KEY:
        return jsonify({"detail": "Service misconfigured: INTERNAL_API_KEY not set"}), 503
    if not _hmac_mod.compare_digest(
        request.headers.get("x-internal-key", ""), _INTERNAL_AUTH_KEY
    ):
        return jsonify({"detail": "Unauthorized"}), 401
    return None


# Nigerian Tax Rates (as of Finance Act 2023)
TAX_RATES = {
    "vat": {
        "rate": 0.075,  # 7.5% VAT
        "description": "Value Added Tax (Finance Act 2020)",
        "threshold_kobo": 0,  # applies to all transactions
        "remit_to": "FIRS",
    },
    "stamp_duty": {
        "rate": 0.0,
        "flat_kobo": 5000,  # ₦50 flat fee
        "description": "Electronic Money Transfer Levy (EMTL)",
        "threshold_kobo": 1_000_000,  # applies to transfers >= ₦10,000
        "remit_to": "FIRS",
    },
    "wht_services": {
        "rate": 0.05,  # 5% WHT on service payments
        "description": "Withholding Tax on Services",
        "threshold_kobo": 0,
        "remit_to": "FIRS",
    },
    "wht_rent": {
        "rate": 0.10,  # 10% WHT on rent
        "description": "Withholding Tax on Rent",
        "threshold_kobo": 0,
        "remit_to": "FIRS",
    },
    "wht_dividends": {
        "rate": 0.10,  # 10% WHT on dividends
        "description": "Withholding Tax on Dividends",
        "threshold_kobo": 0,
        "remit_to": "FIRS",
    },
    "cit": {
        "rate": 0.30,  # 30% CIT for large companies
        "description": "Companies Income Tax",
        "threshold_kobo": 0,
        "remit_to": "FIRS",
    },
    "cit_sme": {
        "rate": 0.20,  # 20% for medium companies
        "description": "Companies Income Tax (SME)",
        "threshold_kobo": 0,
        "remit_to": "FIRS",
    },
    "cit_small": {
        "rate": 0.0,  # 0% for small companies (turnover < ₦25M)
        "description": "Companies Income Tax (Small - exempt)",
        "threshold_kobo": 0,
        "remit_to": "FIRS",
    },
}

# Transaction type to applicable taxes mapping
TRANSACTION_TAX_MAP = {
    "payment": ["vat"],
    "bank_transfer": ["stamp_duty"],
    "service_fee": ["vat", "wht_services"],
    "subscription": ["vat"],
    "payout": ["stamp_duty"],
    "loan_disbursement": [],
    "loan_repayment": [],
    "invoice": ["vat"],
    "payroll": ["wht_services"],
}


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "tax-engine"})


@app.route("/rates")
def get_rates():
    return jsonify({
        "rates": TAX_RATES,
        "jurisdiction": "Nigeria",
        "authority": "FIRS",
        "effective_date": "2023-01-01",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/calculate", methods=["POST"])
def calculate():
    """Calculate applicable taxes for a transaction."""
    data = request.get_json() or {}
    amount_kobo = float(data.get("amount_kobo", 0))
    transaction_type = data.get("transaction_type", "payment")
    merchant_id = data.get("merchant_id")
    include_wht = data.get("include_wht", False)

    if not amount_kobo:
        return jsonify({"error": "amount_kobo required"}), 400

    applicable_taxes = TRANSACTION_TAX_MAP.get(transaction_type, ["vat"])
    if include_wht and "wht_services" not in applicable_taxes:
        applicable_taxes.append("wht_services")

    tax_breakdown = []
    total_tax_kobo = 0

    for tax_key in applicable_taxes:
        tax = TAX_RATES.get(tax_key)
        if not tax:
            continue

        # Check threshold
        if amount_kobo < tax.get("threshold_kobo", 0):
            continue

        if tax.get("flat_kobo"):
            tax_amount = tax["flat_kobo"]
        else:
            tax_amount = amount_kobo * tax["rate"]

        tax_breakdown.append({
            "tax_type": tax_key,
            "description": tax["description"],
            "rate": tax.get("rate", 0),
            "amount_kobo": round(tax_amount),
            "amount_ngn": round(tax_amount / 100, 2),
            "remit_to": tax["remit_to"],
        })
        total_tax_kobo += tax_amount

    net_amount_kobo = amount_kobo - total_tax_kobo

    return jsonify({
        "merchant_id": merchant_id,
        "transaction_type": transaction_type,
        "gross_amount_kobo": amount_kobo,
        "total_tax_kobo": round(total_tax_kobo),
        "net_amount_kobo": round(net_amount_kobo),
        "effective_tax_rate_pct": round(total_tax_kobo / amount_kobo * 100, 4) if amount_kobo > 0 else 0,
        "tax_breakdown": tax_breakdown,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
        "jurisdiction": "Nigeria",
    })


@app.route("/remittance", methods=["POST"])
def remittance():
    """Calculate monthly FIRS remittance summary."""
    data = request.get_json() or {}
    merchant_id = data.get("merchant_id")
    month = data.get("month", datetime.now(timezone.utc).strftime("%Y-%m"))
    vat_collected_kobo = float(data.get("vat_collected_kobo", 0))
    wht_withheld_kobo = float(data.get("wht_withheld_kobo", 0))
    stamp_duty_kobo = float(data.get("stamp_duty_kobo", 0))

    total_remittance_kobo = vat_collected_kobo + wht_withheld_kobo + stamp_duty_kobo
    due_date = f"{month}-21"  # FIRS remittance due by 21st of following month

    return jsonify({
        "merchant_id": merchant_id,
        "period": month,
        "remittance_breakdown": {
            "vat_kobo": round(vat_collected_kobo),
            "wht_kobo": round(wht_withheld_kobo),
            "stamp_duty_kobo": round(stamp_duty_kobo),
        },
        "total_remittance_kobo": round(total_remittance_kobo),
        "total_remittance_ngn": round(total_remittance_kobo / 100, 2),
        "due_date": due_date,
        "authority": "FIRS",
        "payment_reference": f"FIRS-{merchant_id[:8]}-{month.replace('-', '')}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9013))
    log.info("tax-engine starting on port %d", port)
    app.run(host="0.0.0.0", port=port)
