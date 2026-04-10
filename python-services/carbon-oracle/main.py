"""
Carbon Oracle Microservice
Provides real-time carbon credit pricing, project verification, and emissions calculations.
Exposes:
  GET  /projects          - list available carbon projects
  GET  /price?project_id= - get current price for a project
  POST /calculate         - calculate emissions for a transaction
  POST /retire            - mark credits as retired (after purchase)
"""
import os
import json
import logging
from datetime import datetime, timezone
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("carbon-oracle")

app = Flask(__name__)

# Static project catalogue (in production, fetched from Gold Standard / Verra registry)
CARBON_PROJECTS = [
    {
        "project_id": "VCS-1234",
        "name": "Borno State Reforestation",
        "description": "Reforestation of 50,000 hectares in Borno State, Nigeria",
        "standard": "VCS",
        "vintage": "2023",
        "country": "NG",
        "type": "forestry",
        "price_usd_per_tonne": 12.50,
        "available_tonnes": 50000,
        "verified": True,
        "sdgs": [13, 15, 1],
    },
    {
        "project_id": "GS-5678",
        "name": "Lagos Solar Cookstoves",
        "description": "Distribution of clean cookstoves replacing charcoal in Lagos",
        "standard": "Gold Standard",
        "vintage": "2024",
        "country": "NG",
        "type": "clean_energy",
        "price_usd_per_tonne": 18.00,
        "available_tonnes": 12000,
        "verified": True,
        "sdgs": [7, 13, 3],
    },
    {
        "project_id": "ACR-9012",
        "name": "Niger Delta Mangrove Restoration",
        "description": "Blue carbon mangrove restoration in the Niger Delta",
        "standard": "ACR",
        "vintage": "2023",
        "country": "NG",
        "type": "blue_carbon",
        "price_usd_per_tonne": 22.00,
        "available_tonnes": 8000,
        "verified": True,
        "sdgs": [14, 13, 1],
    },
    {
        "project_id": "CAR-3456",
        "name": "Kano Wind Farm",
        "description": "100MW wind farm replacing diesel generators in Kano State",
        "standard": "CAR",
        "vintage": "2024",
        "country": "NG",
        "type": "renewable_energy",
        "price_usd_per_tonne": 9.50,
        "available_tonnes": 100000,
        "verified": True,
        "sdgs": [7, 13, 8],
    },
]

# NGN/USD rate (in production, fetched from FX service)
NGN_USD_RATE = 1600.0

# Emission factors (kgCO2e per unit)
EMISSION_FACTORS = {
    "payment_transaction": 0.0003,  # kg CO2e per NGN 1000 processed
    "card_payment": 0.0005,
    "mobile_money": 0.0002,
    "bank_transfer": 0.0001,
}


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "carbon-oracle"})


@app.route("/projects")
def list_projects():
    project_type = request.args.get("type")
    standard = request.args.get("standard")
    projects = CARBON_PROJECTS
    if project_type:
        projects = [p for p in projects if p["type"] == project_type]
    if standard:
        projects = [p for p in projects if p["standard"] == standard]
    return jsonify({
        "projects": projects,
        "count": len(projects),
        "ngn_usd_rate": NGN_USD_RATE,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/price")
def get_price():
    project_id = request.args.get("project_id")
    tonnes = float(request.args.get("tonnes", 1))
    if not project_id:
        return jsonify({"error": "project_id required"}), 400

    project = next((p for p in CARBON_PROJECTS if p["project_id"] == project_id), None)
    if not project:
        return jsonify({"error": "project not found"}), 404

    price_usd = project["price_usd_per_tonne"] * tonnes
    price_ngn = price_usd * NGN_USD_RATE
    price_kobo = int(price_ngn * 100)

    return jsonify({
        "project_id": project_id,
        "project_name": project["name"],
        "tonnes": tonnes,
        "price_usd": round(price_usd, 2),
        "price_ngn": round(price_ngn, 2),
        "price_kobo": price_kobo,
        "ngn_usd_rate": NGN_USD_RATE,
        "standard": project["standard"],
        "vintage": project["vintage"],
        "quoted_at": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/calculate", methods=["POST"])
def calculate_emissions():
    """Calculate carbon footprint for a merchant's transaction volume."""
    data = request.get_json() or {}
    merchant_id = data.get("merchant_id")
    amount_kobo = float(data.get("amount_kobo", 0))
    channel = data.get("channel", "payment_transaction")

    factor = EMISSION_FACTORS.get(channel, EMISSION_FACTORS["payment_transaction"])
    amount_ngn_thousands = amount_kobo / 100_000  # convert kobo to NGN thousands
    kg_co2e = amount_ngn_thousands * factor
    tonnes_co2e = kg_co2e / 1000

    # Recommend cheapest project to offset
    cheapest = min(CARBON_PROJECTS, key=lambda p: p["price_usd_per_tonne"])
    offset_cost_usd = tonnes_co2e * cheapest["price_usd_per_tonne"]
    offset_cost_kobo = int(offset_cost_usd * NGN_USD_RATE * 100)

    return jsonify({
        "merchant_id": merchant_id,
        "amount_kobo": amount_kobo,
        "channel": channel,
        "kg_co2e": round(kg_co2e, 6),
        "tonnes_co2e": round(tonnes_co2e, 6),
        "offset_recommendation": {
            "project_id": cheapest["project_id"],
            "project_name": cheapest["name"],
            "offset_cost_usd": round(offset_cost_usd, 4),
            "offset_cost_kobo": offset_cost_kobo,
        },
        "calculated_at": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/retire", methods=["POST"])
def retire_credits():
    """Record retirement of carbon credits (immutable ledger entry)."""
    data = request.get_json() or {}
    credit_id = data.get("credit_id")
    project_id = data.get("project_id")
    tonnes = float(data.get("tonnes", 0))
    merchant_id = data.get("merchant_id")

    if not all([credit_id, project_id, tonnes, merchant_id]):
        return jsonify({"error": "credit_id, project_id, tonnes, merchant_id required"}), 400

    # In production: submit to Gold Standard / Verra registry API
    retirement_serial = f"RET-{project_id}-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{credit_id[-6:]}"

    return jsonify({
        "credit_id": credit_id,
        "project_id": project_id,
        "merchant_id": merchant_id,
        "tonnes_retired": tonnes,
        "retirement_serial": retirement_serial,
        "registry": "paygate-internal",
        "status": "retired",
        "retired_at": datetime.now(timezone.utc).isoformat(),
        "certificate_url": f"https://registry.paygate.ng/certificates/{retirement_serial}",
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9011))
    log.info("carbon-oracle starting on port %d", port)
    app.run(host="0.0.0.0", port=port)
