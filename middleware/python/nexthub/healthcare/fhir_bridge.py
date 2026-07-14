"""
FHIR R4 Bridge Service — Medplum ↔ NHIA ↔ PayGate
Open-source stack:
  - Medplum FHIR server: https://github.com/medplum/medplum (Apache 2.0)
  - fhir.resources: https://github.com/nazrulworld/fhir.resources (MIT)
  - httpx: async HTTP client

Architecture:
  NHIA/HMO → POST /fhir-bridge/claim → this service → Medplum FHIR server
  PayGate ClaimAdjudicationWorkflow → GET /fhir-bridge/claim/{id}/status
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="PayGate FHIR Bridge",
    description="Medplum FHIR R4 bridge for NHIA/HMO claim adjudication",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Config ──────────────────────────────────────────────────────────────────

MEDPLUM_BASE_URL = os.getenv("MEDPLUM_BASE_URL", "http://medplum:8103/fhir/R4")
MEDPLUM_CLIENT_ID = os.getenv("MEDPLUM_CLIENT_ID", "")
MEDPLUM_CLIENT_SECRET = os.getenv("MEDPLUM_CLIENT_SECRET", "")
MEDPLUM_PROJECT_ID = os.getenv("MEDPLUM_PROJECT_ID", "")
PAYGATE_BRIDGE_URL = os.getenv("PAYGATE_BRIDGE_URL", "http://paygate-bridge:8080")
NHIA_API_URL = os.getenv("NHIA_API_URL", "https://api.nhia.gov.ng/v1")
NHIA_API_KEY = os.getenv("NHIA_API_KEY", "")

_token_cache: dict[str, Any] = {}


# ─── Medplum OAuth2 ──────────────────────────────────────────────────────────

async def get_medplum_token() -> str:
    """Get or refresh Medplum OAuth2 client credentials token."""
    now = datetime.now(timezone.utc).timestamp()
    if _token_cache.get("token") and _token_cache.get("expiry", 0) > now + 60:
        return _token_cache["token"]

    token_url = MEDPLUM_BASE_URL.replace("/fhir/R4", "") + "/oauth2/token"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": MEDPLUM_CLIENT_ID,
                "client_secret": MEDPLUM_CLIENT_SECRET,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        _token_cache["token"] = data["access_token"]
        _token_cache["expiry"] = now + data.get("expires_in", 3600)
        return _token_cache["token"]


async def fhir_request(method: str, path: str, body: dict | None = None) -> dict:
    """Generic FHIR R4 request to Medplum."""
    token = await get_medplum_token()
    url = f"{MEDPLUM_BASE_URL}/{path.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/fhir+json",
        "Accept": "application/fhir+json",
    }
    if MEDPLUM_PROJECT_ID:
        headers["X-Medplum-Project"] = MEDPLUM_PROJECT_ID

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(method, url, json=body, headers=headers)
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Medplum FHIR error: {resp.text[:500]}",
            )
        return resp.json()


# ─── Request / Response Models ───────────────────────────────────────────────

class NHIAClaimRequest(BaseModel):
    """PayGate → FHIR bridge claim submission request."""
    paygate_claim_id: str = Field(..., description="PayGate healthcare_claims.id")
    patient_nhis_number: str = Field(..., description="NHIS card number")
    patient_name: str
    patient_dob: str  # ISO 8601
    provider_nhia_code: str  # NHIA-registered provider code
    provider_name: str
    hmo_code: str  # HMO code (NHIA-assigned)
    diagnosis_codes: list[str]  # ICD-10
    procedure_codes: list[str]  # CPT / SNOMED-CT
    total_amount: float
    currency: str = "NGN"
    service_date: str  # ISO 8601
    encounter_type: str = "outpatient"  # outpatient | inpatient | emergency


class FHIRClaimResult(BaseModel):
    paygate_claim_id: str
    fhir_claim_id: str
    fhir_patient_id: str
    fhir_provider_id: str
    fhir_coverage_id: str
    status: str
    medplum_url: str


class ClaimStatusResult(BaseModel):
    paygate_claim_id: str
    fhir_claim_id: str
    fhir_status: str
    adjudication_status: str | None
    approved_amount: float | None
    denial_reason: str | None
    eob_id: str | None


# ─── Core Endpoints ──────────────────────────────────────────────────────────

@app.post("/fhir-bridge/claim", response_model=FHIRClaimResult)
async def submit_claim(req: NHIAClaimRequest, background: BackgroundTasks):
    """
    Submit a PayGate healthcare claim to Medplum FHIR server.
    
    Flow:
    1. Upsert Patient (by NHIS number identifier)
    2. Upsert Practitioner (by NHIA provider code)
    3. Upsert Organization (HMO)
    4. Upsert Coverage (NHIS card → HMO)
    5. Create Claim resource
    6. Trigger NHIA eligibility check in background
    """
    # 1. Upsert Patient
    patient = await _upsert_patient(req)
    patient_id = patient["id"]

    # 2. Upsert Practitioner
    practitioner = await _upsert_practitioner(req.provider_nhia_code, req.provider_name)
    practitioner_id = practitioner["id"]

    # 3. Upsert Organization (HMO)
    org = await _upsert_organization(req.hmo_code)
    org_id = org["id"]

    # 4. Upsert Coverage
    coverage = await _upsert_coverage(patient_id, org_id, req.patient_nhis_number)
    coverage_id = coverage["id"]

    # 5. Create Claim
    claim = _build_fhir_claim(
        paygate_id=req.paygate_claim_id,
        patient_id=patient_id,
        practitioner_id=practitioner_id,
        coverage_id=coverage_id,
        diagnosis_codes=req.diagnosis_codes,
        procedure_codes=req.procedure_codes,
        total_amount=req.total_amount,
        currency=req.currency,
        service_date=req.service_date,
    )
    created_claim = await fhir_request("POST", "Claim", claim)
    fhir_claim_id = created_claim["id"]

    # 6. Background: NHIA eligibility + pre-auth
    background.add_task(
        _nhia_eligibility_check,
        req.patient_nhis_number,
        req.provider_nhia_code,
        req.paygate_claim_id,
        fhir_claim_id,
    )

    return FHIRClaimResult(
        paygate_claim_id=req.paygate_claim_id,
        fhir_claim_id=fhir_claim_id,
        fhir_patient_id=patient_id,
        fhir_provider_id=practitioner_id,
        fhir_coverage_id=coverage_id,
        status="submitted",
        medplum_url=f"{MEDPLUM_BASE_URL}/Claim/{fhir_claim_id}",
    )


@app.get("/fhir-bridge/claim/{fhir_claim_id}/status", response_model=ClaimStatusResult)
async def get_claim_status(fhir_claim_id: str, paygate_claim_id: str = ""):
    """Get claim adjudication status from Medplum."""
    # Get Claim
    claim = await fhir_request("GET", f"Claim/{fhir_claim_id}")

    # Search for ClaimResponse
    cr_bundle = await fhir_request("GET", f"ClaimResponse?request=Claim/{fhir_claim_id}")
    entries = cr_bundle.get("entry", [])

    if not entries:
        return ClaimStatusResult(
            paygate_claim_id=paygate_claim_id,
            fhir_claim_id=fhir_claim_id,
            fhir_status=claim.get("status", "active"),
            adjudication_status="pending",
            approved_amount=None,
            denial_reason=None,
            eob_id=None,
        )

    cr = entries[0]["resource"]
    outcome = cr.get("outcome", "queued")
    approved = None
    denial = None

    if outcome in ("complete", "partial"):
        # Extract approved amount from adjudication
        for item in cr.get("item", []):
            for adj in item.get("adjudication", []):
                cat = adj.get("category", {}).get("coding", [{}])[0].get("code", "")
                if cat == "benefit":
                    approved = adj.get("amount", {}).get("value")

    if outcome in ("error", "partial"):
        errors = cr.get("error", [])
        if errors:
            denial = errors[0].get("code", {}).get("coding", [{}])[0].get("display", "Denied")

    # Search for EOB
    eob_bundle = await fhir_request("GET", f"ExplanationOfBenefit?claim=Claim/{fhir_claim_id}")
    eob_entries = eob_bundle.get("entry", [])
    eob_id = eob_entries[0]["resource"]["id"] if eob_entries else None

    return ClaimStatusResult(
        paygate_claim_id=paygate_claim_id,
        fhir_claim_id=fhir_claim_id,
        fhir_status=claim.get("status", "active"),
        adjudication_status=outcome,
        approved_amount=approved,
        denial_reason=denial,
        eob_id=eob_id,
    )


@app.get("/fhir-bridge/patient/{nhis_number}")
async def get_patient_by_nhis(nhis_number: str):
    """Look up a FHIR Patient by NHIS number."""
    bundle = await fhir_request("GET", f"Patient?identifier=https://nhia.gov.ng/nhis|{nhis_number}")
    entries = bundle.get("entry", [])
    if not entries:
        raise HTTPException(status_code=404, detail=f"Patient with NHIS {nhis_number} not found")
    return entries[0]["resource"]


@app.post("/fhir-bridge/bundle")
async def process_bundle(bundle: dict):
    """Process a FHIR batch/transaction bundle (bulk claim submission)."""
    bundle["resourceType"] = "Bundle"
    return await fhir_request("POST", "", bundle)


@app.get("/fhir-bridge/health")
async def health():
    """Health check — verifies Medplum connectivity."""
    try:
        token = await get_medplum_token()
        return {"status": "ok", "medplum": "connected", "token_cached": bool(token)}
    except Exception as e:
        return {"status": "degraded", "medplum": "unreachable", "error": str(e)}


# ─── FHIR Resource Builders ──────────────────────────────────────────────────

async def _upsert_patient(req: NHIAClaimRequest) -> dict:
    """Find or create a FHIR Patient by NHIS number."""
    bundle = await fhir_request("GET", f"Patient?identifier=https://nhia.gov.ng/nhis|{req.patient_nhis_number}")
    if bundle.get("entry"):
        return bundle["entry"][0]["resource"]
    patient = {
        "resourceType": "Patient",
        "identifier": [{
            "system": "https://nhia.gov.ng/nhis",
            "value": req.patient_nhis_number,
        }],
        "name": [{"text": req.patient_name}],
        "birthDate": req.patient_dob,
    }
    return await fhir_request("POST", "Patient", patient)


async def _upsert_practitioner(nhia_code: str, name: str) -> dict:
    """Find or create a FHIR Practitioner by NHIA provider code."""
    bundle = await fhir_request("GET", f"Practitioner?identifier=https://nhia.gov.ng/provider|{nhia_code}")
    if bundle.get("entry"):
        return bundle["entry"][0]["resource"]
    prac = {
        "resourceType": "Practitioner",
        "identifier": [{"system": "https://nhia.gov.ng/provider", "value": nhia_code}],
        "name": [{"text": name}],
    }
    return await fhir_request("POST", "Practitioner", prac)


async def _upsert_organization(hmo_code: str) -> dict:
    """Find or create a FHIR Organization for the HMO."""
    bundle = await fhir_request("GET", f"Organization?identifier=https://nhia.gov.ng/hmo|{hmo_code}")
    if bundle.get("entry"):
        return bundle["entry"][0]["resource"]
    org = {
        "resourceType": "Organization",
        "identifier": [{"system": "https://nhia.gov.ng/hmo", "value": hmo_code}],
        "name": f"HMO-{hmo_code}",
        "type": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/organization-type", "code": "ins"}]}],
    }
    return await fhir_request("POST", "Organization", org)


async def _upsert_coverage(patient_id: str, org_id: str, nhis_number: str) -> dict:
    """Find or create a FHIR Coverage resource."""
    bundle = await fhir_request("GET", f"Coverage?subscriber=Patient/{patient_id}")
    if bundle.get("entry"):
        return bundle["entry"][0]["resource"]
    cov = {
        "resourceType": "Coverage",
        "status": "active",
        "subscriber": {"reference": f"Patient/{patient_id}"},
        "beneficiary": {"reference": f"Patient/{patient_id}"},
        "payor": [{"reference": f"Organization/{org_id}"}],
        "subscriberId": nhis_number,
        "type": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "PUBLICPOL"}]},
    }
    return await fhir_request("POST", "Coverage", cov)


def _build_fhir_claim(
    paygate_id: str,
    patient_id: str,
    practitioner_id: str,
    coverage_id: str,
    diagnosis_codes: list[str],
    procedure_codes: list[str],
    total_amount: float,
    currency: str,
    service_date: str,
) -> dict:
    diagnoses = [
        {
            "sequence": i + 1,
            "diagnosisCodeableConcept": {
                "coding": [{"system": "http://hl7.org/fhir/sid/icd-10", "code": code}]
            },
        }
        for i, code in enumerate(diagnosis_codes)
    ]
    items = [
        {
            "sequence": i + 1,
            "productOrService": {
                "coding": [{"system": "http://www.ama-assn.org/go/cpt", "code": code}]
            },
            "servicedDate": service_date,
            "net": {"value": total_amount / max(len(procedure_codes), 1), "currency": currency},
        }
        for i, code in enumerate(procedure_codes)
    ]
    return {
        "resourceType": "Claim",
        "id": paygate_id,
        "status": "active",
        "type": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/claim-type", "code": "institutional"}]},
        "use": "claim",
        "patient": {"reference": f"Patient/{patient_id}"},
        "created": datetime.now(timezone.utc).isoformat(),
        "provider": {"reference": f"Practitioner/{practitioner_id}"},
        "priority": {"coding": [{"code": "normal"}]},
        "insurance": [{"sequence": 1, "focal": True, "coverage": {"reference": f"Coverage/{coverage_id}"}}],
        "diagnosis": diagnoses,
        "item": items,
        "total": {"value": total_amount, "currency": currency},
        "billablePeriod": {"start": service_date, "end": service_date},
    }


# ─── NHIA Background Tasks ───────────────────────────────────────────────────

async def _nhia_eligibility_check(
    nhis_number: str,
    provider_code: str,
    paygate_claim_id: str,
    fhir_claim_id: str,
) -> None:
    """
    Call NHIA eligibility API and update the FHIR Claim status.
    In production this calls the real NHIA API; here we simulate the response.
    """
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{NHIA_API_URL}/eligibility",
                params={"nhisNumber": nhis_number, "providerCode": provider_code},
                headers={"X-API-Key": NHIA_API_KEY},
            )
            if resp.status_code == 200:
                data = resp.json()
                eligible = data.get("eligible", False)
                # Update Claim status in Medplum
                token = await get_medplum_token()
                claim = await fhir_request("GET", f"Claim/{fhir_claim_id}")
                claim["status"] = "active" if eligible else "cancelled"
                claim["extension"] = claim.get("extension", []) + [{
                    "url": "https://paygate.io/fhir/ext/nhia-eligibility",
                    "valueBoolean": eligible,
                }]
                await fhir_request("PUT", f"Claim/{fhir_claim_id}", claim)
    except Exception as e:
        # Non-fatal — PayGate workflow will retry
        print(f"[fhir_bridge] NHIA eligibility check failed for {paygate_claim_id}: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
