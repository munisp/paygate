"""
Insurance Pricing Microservice
Calculates parametric insurance premiums for merchants based on transaction volume,
industry risk, and historical chargeback rates.
Exposes:
  POST /quote   - get insurance premium quote
  GET  /products - list available insurance products
  POST /enroll  - enroll merchant in insurance product
"""
import os
import logging
from datetime import datetime, timezone
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("insurance-pricing")

app = Flask(__name__)

# Insurance product catalogue
PRODUCTS = [
    {
        "product_id": "INS-CHARGEBACK-BASIC",
        "name": "Chargeback Shield Basic",
        "description": "Covers up to ₦500,000 in chargeback losses per month",
        "type": "chargeback_protection",
        "coverage_kobo": 50_000_000,
        "base_rate_pct": 0.25,
        "min_premium_kobo": 500_000,
        "max_premium_kobo": 5_000_000,
        "deductible_pct": 10,
    },
    {
        "product_id": "INS-CHARGEBACK-PRO",
        "name": "Chargeback Shield Pro",
        "description": "Covers up to ₦5,000,000 in chargeback losses per month",
        "type": "chargeback_protection",
        "coverage_kobo": 500_000_000,
        "base_rate_pct": 0.20,
        "min_premium_kobo": 2_000_000,
        "max_premium_kobo": 20_000_000,
        "deductible_pct": 5,
    },
    {
        "product_id": "INS-CYBER-BASIC",
        "name": "Cyber Liability Basic",
        "description": "Covers data breach notification costs up to ₦2,000,000",
        "type": "cyber_liability",
        "coverage_kobo": 200_000_000,
        "base_rate_pct": 0.15,
        "min_premium_kobo": 1_000_000,
        "max_premium_kobo": 10_000_000,
        "deductible_pct": 15,
    },
    {
        "product_id": "INS-FRAUD-BASIC",
        "name": "Fraud Loss Protection",
        "description": "Covers verified fraud losses up to ₦1,000,000 per incident",
        "type": "fraud_protection",
        "coverage_kobo": 100_000_000,
        "base_rate_pct": 0.30,
        "min_premium_kobo": 800_000,
        "max_premium_kobo": 8_000_000,
        "deductible_pct": 20,
    },
]

# Industry risk multipliers
INDUSTRY_RISK = {
    "ecommerce": 1.2,
    "travel": 1.5,
    "gaming": 1.8,
    "financial_services": 1.3,
    "retail": 1.0,
    "food_delivery": 0.9,
    "healthcare": 0.8,
    "education": 0.7,
    "default": 1.0,
}


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "insurance-pricing"})


@app.route("/products")
def list_products():
    product_type = request.args.get("type")
    products = PRODUCTS
    if product_type:
        products = [p for p in products if p["type"] == product_type]
    return jsonify({
        "products": products,
        "count": len(products),
        "currency": "NGN",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/quote", methods=["POST"])
def get_quote():
    """Calculate insurance premium for a merchant."""
    data = request.get_json() or {}
    merchant_id = data.get("merchant_id")
    product_id = data.get("product_id")
    monthly_volume_kobo = float(data.get("monthly_volume_kobo", 0))
    industry = data.get("industry", "default")
    chargeback_rate_pct = float(data.get("chargeback_rate_pct", 0.5))

    if not all([merchant_id, product_id, monthly_volume_kobo]):
        return jsonify({"error": "merchant_id, product_id, monthly_volume_kobo required"}), 400

    product = next((p for p in PRODUCTS if p["product_id"] == product_id), None)
    if not product:
        return jsonify({"error": "product not found"}), 404

    # Risk-adjusted premium calculation
    industry_multiplier = INDUSTRY_RISK.get(industry, INDUSTRY_RISK["default"])
    chargeback_multiplier = 1.0 + (chargeback_rate_pct - 0.5) * 0.5  # +50% per 1% above baseline
    chargeback_multiplier = max(0.8, min(3.0, chargeback_multiplier))

    base_premium = monthly_volume_kobo * (product["base_rate_pct"] / 100)
    adjusted_premium = base_premium * industry_multiplier * chargeback_multiplier
    final_premium = max(product["min_premium_kobo"], min(product["max_premium_kobo"], adjusted_premium))

    return jsonify({
        "merchant_id": merchant_id,
        "product_id": product_id,
        "product_name": product["name"],
        "monthly_volume_kobo": monthly_volume_kobo,
        "industry": industry,
        "chargeback_rate_pct": chargeback_rate_pct,
        "coverage_kobo": product["coverage_kobo"],
        "deductible_pct": product["deductible_pct"],
        "premium_kobo": round(final_premium),
        "premium_ngn": round(final_premium / 100, 2),
        "risk_factors": {
            "industry_multiplier": round(industry_multiplier, 2),
            "chargeback_multiplier": round(chargeback_multiplier, 2),
        },
        "valid_until": datetime.now(timezone.utc).isoformat(),
        "quote_id": f"QT-{merchant_id[:8]}-{product_id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
    })


@app.route("/enroll", methods=["POST"])
def enroll():
    """Enroll merchant in an insurance product (after payment)."""
    data = request.get_json() or {}
    merchant_id = data.get("merchant_id")
    product_id = data.get("product_id")
    quote_id = data.get("quote_id")
    premium_kobo = data.get("premium_kobo")

    if not all([merchant_id, product_id, quote_id, premium_kobo]):
        return jsonify({"error": "merchant_id, product_id, quote_id, premium_kobo required"}), 400

    product = next((p for p in PRODUCTS if p["product_id"] == product_id), None)
    if not product:
        return jsonify({"error": "product not found"}), 404

    policy_id = f"POL-{merchant_id[:8]}-{product_id}-{datetime.now(timezone.utc).strftime('%Y%m')}"

    return jsonify({
        "policy_id": policy_id,
        "merchant_id": merchant_id,
        "product_id": product_id,
        "product_name": product["name"],
        "coverage_kobo": product["coverage_kobo"],
        "premium_kobo": premium_kobo,
        "status": "active",
        "enrolled_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": datetime.now(timezone.utc).replace(month=datetime.now(timezone.utc).month % 12 + 1).isoformat(),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9012))
    log.info("insurance-pricing starting on port %d", port)
    app.run(host="0.0.0.0", port=port)
