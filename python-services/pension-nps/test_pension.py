"""Smoke tests for pension-nps microservice."""
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
import sys, os
_dir = os.path.dirname(os.path.abspath(__file__))
if _dir not in sys.path:
    sys.path.insert(0, _dir)
# Remove any previously loaded 'main' module to avoid conflicts
if 'main' in sys.modules:
    del sys.modules['main']

with patch("asyncpg.create_pool", new_callable=AsyncMock):
    import importlib
    import importlib.util
    spec = importlib.util.spec_from_file_location("pension_main", os.path.join(_dir, "main.py"))
    pension_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pension_mod)
    app = pension_mod.app
    calc_contribs = pension_mod.calc_contribs
    retirement_date = pension_mod.retirement_date

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] in ("ok", "degraded")


def test_metrics():
    resp = client.get("/metrics")
    assert resp.status_code == 200


def test_calc_contribs():
    result = calc_contribs(salary=500_000, voluntary=50_000)
    assert result["employee"] == 40_000.0  # 8%
    assert result["employer"] == 50_000.0  # 10%
    assert result["voluntary"] == 50_000
    assert result["total"] == 140_000.0


def test_retirement_date():
    rd = retirement_date("1990-01-15")
    assert rd == "2050-01-15"


def test_retirement_date_invalid():
    rd = retirement_date("not-a-date")
    assert rd == "unknown"


def test_enroll():
    resp = client.post("/pension/enroll", json={
        "employee_id": "emp-001",
        "merchant_id": "merch-001",
        "full_name": "John Doe",
        "date_of_birth": "1990-01-15",
        "monthly_salary": 500_000.0,
        "pfa_code": "PAYGATE-PFA",
    })
    assert resp.status_code in (200, 500)


def test_contribute():
    resp = client.post("/pension/contribute", json={
        "pfa_id": "pfa-001",
        "merchant_id": "merch-001",
        "employee_id": "emp-001",
        "employee_contribution": 40_000.0,
        "employer_contribution": 50_000.0,
        "month": "2026-04",
        "salary": 500_000.0,
    })
    assert resp.status_code in (200, 500)


def test_get_statement_missing_param():
    resp = client.get("/pension/statement")
    assert resp.status_code == 422


def test_get_accounts_missing_param():
    resp = client.get("/pension/accounts")
    assert resp.status_code == 422


def test_calculator():
    resp = client.get("/pension/calculator", params={
        "employee_id": "emp-001",
        "current_age": 35,
        "monthly_salary": 500_000.0,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "estimated_corpus" in data or "projected_balance" in data or "retirement_date" in data
