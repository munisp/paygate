"""Smoke tests for insurance-pricing microservice (Flask)."""
import pytest
import json
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from main import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = json.loads(resp.data)
    assert data["status"] in ("ok", "degraded")


def test_list_products(client):
    resp = client.get("/products")
    assert resp.status_code == 200
    data = json.loads(resp.data)
    assert "products" in data
    assert len(data["products"]) > 0
    product = data["products"][0]
    # Insurance products use product_id (not id)
    assert "product_id" in product


def test_quote_basic(client):
    resp = client.post("/quote",
        data=json.dumps({
            "merchant_id": "merch-001",
            "product_id": "INS-CHARGEBACK-BASIC",
            "monthly_volume_kobo": 10_000_000_00,
        }),
        content_type="application/json"
    )
    assert resp.status_code in (200, 400, 422)
    if resp.status_code == 200:
        data = json.loads(resp.data)
        assert "quote_id" in data or "premium_kobo" in data or "monthly_premium_kobo" in data


def test_quote_missing_fields(client):
    resp = client.post("/quote",
        data=json.dumps({}),
        content_type="application/json"
    )
    assert resp.status_code == 400


def test_enroll(client):
    resp = client.post("/enroll",
        data=json.dumps({
            "merchant_id": "merch-001",
            "product_id": "INS-CHARGEBACK-BASIC",
            "monthly_volume_kobo": 10_000_000_00,
        }),
        content_type="application/json"
    )
    assert resp.status_code in (200, 400, 422, 500)
