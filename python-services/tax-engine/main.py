"""
Tax Engine Microservice
Calculates Nigerian taxes: VAT (7.5%), Withholding Tax (WHT), Stamp Duty, and FIRS remittance.
Exposes:
  POST /calculate    - calculate all applicable taxes for a transaction
  GET  /rates        - get current tax rates
  POST /remittance   - calculate monthly FIRS remittance summary
  GET  /wht/rates    - Nigerian WHT rate table (services/goods/rent/commission/dividends)
  POST /tin/validate - validate a Nigerian TIN (JTB/FIRS); fail-closed when the
                       external registry lookup is not configured
"""
import os
import re
import logging
from datetime import datetime, timezone
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tax-engine")

import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = Flask(__name__)
setup_telemetry("tax-engine", app)

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


# ─── Nigerian WHT rate table ─────────────────────────────────────────────────
# Source: FIRS WHT rates, verify annually
# (Deduction of Tax at Source (Withholding) Regulations; Finance Acts).
# Rates are expressed in percent. No general de-minimis threshold applies to
# vendor WHT; applicability is determined by vendor/entity classification.
WHT_RATES = {
    "services_company": {
        "rate_pct": 10.0,
        "description": "WHT on services rendered by companies (10%)",
        "remit_to": "FIRS",
    },
    "services_individual": {
        "rate_pct": 5.0,
        "description": "WHT on services rendered by individuals (5%)",
        "remit_to": "FIRS",
    },
    "goods": {
        "rate_pct": 5.0,
        "description": "WHT on supply of goods (5%)",
        "remit_to": "FIRS",
    },
    "rent": {
        "rate_pct": 10.0,
        "description": "WHT on rent (10%)",
        "remit_to": "FIRS",
    },
    "commission": {
        "rate_pct": 5.0,
        "description": "WHT on commission and consultancy (5%)",
        "remit_to": "FIRS",
    },
    "dividends": {
        "rate_pct": 10.0,
        "description": "WHT on dividends (10%)",
        "remit_to": "FIRS",
    },
}


@app.route("/wht/rates")
def get_wht_rates():
    """Return the Nigerian WHT rate table used for vendor withholding."""
    return jsonify({
        "wht_rates": WHT_RATES,
        "jurisdiction": "Nigeria",
        "authority": "FIRS",
        "source": "FIRS WHT rates, verify annually",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    })


# ─── TIN validation (JTB/FIRS) ────────────────────────────────────────────────
# Nigerian Tax Identification Numbers are issued by the Joint Tax Board / FIRS.
# Format: 8-14 digits. There is NO publicly documented official checksum
# algorithm, so this service is FAIL-CLOSED: a TIN is only ever reported as
# "valid" when the external registry lookup confirms it. Without the
# TIN_LOOKUP_URL env var the status is always "unverified" — never fabricated.
_TIN_FORMAT_RE = re.compile(r"^\d{8,14}$")


def _tin_checksum_ok(tin: str) -> bool:
    """Internal structural mod-11 screen over the digit string.

    JTB/FIRS publishes no official TIN checksum; this is a structural
    consistency screen reported to callers as metadata only. It is NEVER
    used on its own to declare a TIN valid.
    """
    digits = [int(c) for c in tin]
    weights = [(i % 8) + 2 for i in range(len(digits))]
    total = sum(d * w for d, w in zip(reversed(digits), weights))
    return total % 11 == 0


def _external_tin_lookup(tin: str):
    """Query the external JTB/FIRS TIN registry.

    Returns (entity_type, error):
      - (entity_type, None)  on a definitive registry answer
        (entity_type is "company" | "individual" | None when not found)
      - (None, error)        when the lookup itself failed
    Only called when TIN_LOOKUP_URL is configured.
    """
    lookup_url = os.getenv("TIN_LOOKUP_URL")
    try:
        import httpx  # imported lazily: only required when lookup is configured
    except ImportError:
        return None, "lookup_client_unavailable"
    try:
        resp = httpx.post(
            lookup_url,
            json={"tin": tin},
            headers={"X-Internal-Key": _INTERNAL_AUTH_KEY},
            timeout=15.0,
        )
        if resp.status_code != 200:
            return None, f"external_lookup_http_{resp.status_code}"
        body = resp.json()
        if not body.get("found"):
            return None, None  # definitive: not present in registry
        return body.get("entity_type") or "company", None
    except Exception as exc:  # timeout, DNS, connection, JSON, ...
        log.warning("external TIN lookup failed: %s", exc)
        return None, "external_lookup_error"


@app.route("/tin/validate", methods=["POST"])
def tin_validate():
    """Validate a Nigerian TIN.

    Fail-closed semantics:
      - malformed / degenerate TIN          -> status "invalid"
      - external lookup not configured      -> status "unverified"
        (reason "external_lookup_not_configured") — NEVER fabricated valid
      - external lookup error               -> status "unverified"
      - registry says not found             -> status "invalid"
      - registry confirms                   -> status "valid" + WHT profile
    """
    data = request.get_json(silent=True) or {}
    tin = str(data.get("tin", "")).strip()
    if not tin:
        return jsonify({"error": "tin required"}), 400

    checksum_ok = _tin_checksum_ok(tin) if _TIN_FORMAT_RE.match(tin) else False

    def _payload(status, reason, entity_type=None, wht=None):
        return {
            "tin": tin,
            "status": status,
            "reason": reason,
            "entity_type": entity_type,
            "wht": wht,
            "checksum_ok": checksum_ok,
            "validated_at": datetime.now(timezone.utc).isoformat(),
        }

    # 1. Format check: TIN = 8-14 digits.
    if not _TIN_FORMAT_RE.match(tin):
        return jsonify(_payload("invalid", "invalid_format"))

    # 2. Structure check: reject degenerate sequences (all identical digits).
    if len(set(tin)) == 1:
        return jsonify(_payload("invalid", "degenerate_tin"))

    # 3. External registry lookup — only when explicitly configured.
    if not os.getenv("TIN_LOOKUP_URL"):
        return jsonify(_payload("unverified", "external_lookup_not_configured"))

    entity_type, error = _external_tin_lookup(tin)
    if error is not None:
        return jsonify(_payload("unverified", error))
    if entity_type is None:
        return jsonify(_payload("invalid", "not_found_in_registry"))

    # Registry-confirmed TIN: attach default WHT profile for services
    # (10% companies / 5% individuals per the rate table above).
    rate = WHT_RATES["services_company" if entity_type == "company"
                     else "services_individual"]["rate_pct"]
    return jsonify(_payload(
        "valid",
        "registry_confirmed",
        entity_type=entity_type,
        wht={"applicable": True, "category": "services", "rate_pct": rate},
    ))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9013))
    log.info("tax-engine starting on port %d", port)
    app.run(host="0.0.0.0", port=port)
