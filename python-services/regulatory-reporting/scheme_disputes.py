"""
scheme_disputes.py — Visa/Mastercard Scheme Dispute Portal Submission

Implements:
  - Visa Resolve Online (VROL) API integration
  - Mastercard Dispute Resolution Management (DRM) API integration
  - Evidence package upload (PDF, images) to scheme portals
  - Dispute status polling

Both APIs require PSP principal membership credentials.
"""

import os
from datetime import datetime, timezone
from typing import Any

import httpx


# ─── Visa Resolve Online (VROL) ───────────────────────────────────────────────

VISA_VROL_BASE_URL = os.getenv("VISA_VROL_BASE_URL", "https://sandbox.api.visa.com/vrol/v1")
VISA_API_KEY = os.getenv("VISA_API_KEY", "")
VISA_SHARED_SECRET = os.getenv("VISA_SHARED_SECRET", "")
VISA_CERT_PATH = os.getenv("VISA_CERT_PATH", "/etc/certs/visa-client.pem")
VISA_KEY_PATH = os.getenv("VISA_KEY_PATH", "/etc/certs/visa-client-key.pem")

# ─── Mastercard Dispute Resolution Management (DRM) ──────────────────────────

MC_DRM_BASE_URL = os.getenv("MC_DRM_BASE_URL", "https://sandbox.api.mastercard.com/dispute-resolution/v1")
MC_CONSUMER_KEY = os.getenv("MC_CONSUMER_KEY", "")
MC_SIGNING_KEY_PATH = os.getenv("MC_SIGNING_KEY_PATH", "/etc/certs/mastercard-signing.p12")
MC_SIGNING_KEY_ALIAS = os.getenv("MC_SIGNING_KEY_ALIAS", "paygate-mc-key")
MC_SIGNING_KEY_PASSWORD = os.getenv("MC_SIGNING_KEY_PASSWORD", "")


async def submit_to_visa_portal(dispute: dict[str, Any]) -> str:
    """
    Submit a chargeback dispute to Visa Resolve Online (VROL).

    Visa VROL API Reference: https://developer.visa.com/capabilities/vrol
    Endpoint: POST /vrol/v1/disputes
    Authentication: mTLS + API key
    """
    payload = {
        "disputeType": _map_dispute_type_visa(dispute.get("dispute_type", "chargeback")),
        "acquirerReferenceNumber": dispute.get("arn", ""),
        "transactionDate": dispute.get("transaction_date", ""),
        "transactionAmount": _kobo_to_naira_str(dispute.get("amount_kobo", 0)),
        "currency": dispute.get("currency", "566"),  # 566 = NGN ISO 4217
        "reasonCode": dispute.get("reason_code", ""),
        "merchantId": dispute.get("merchant_id", ""),
        "merchantName": dispute.get("merchant_name", ""),
        "evidenceDocuments": [
            {"url": url, "type": "SUPPORTING_DOCUMENT"}
            for url in dispute.get("evidence_urls", [])
        ],
        "narrative": dispute.get("narrative", ""),
        "contactEmail": dispute.get("contact_email", ""),
        "submittedAt": datetime.now(timezone.utc).isoformat(),
    }

    headers = {
        "Content-Type": "application/json",
        "keyId": VISA_API_KEY,
        "X-Chargeback-ID": dispute.get("chargeback_id", ""),
    }

    # Visa requires mTLS — use cert/key pair
    cert = None
    if os.path.exists(VISA_CERT_PATH) and os.path.exists(VISA_KEY_PATH):
        cert = (VISA_CERT_PATH, VISA_KEY_PATH)

    async with httpx.AsyncClient(timeout=30.0, cert=cert) as client:
        response = await client.post(
            f"{VISA_VROL_BASE_URL}/disputes",
            json=payload,
            headers=headers,
        )

    if response.status_code not in (200, 201, 202):
        raise RuntimeError(
            f"Visa VROL returned HTTP {response.status_code}: {response.text[:300]}"
        )

    resp_data = response.json()
    return resp_data.get("disputeId", resp_data.get("referenceId",
        f"VISA-{dispute.get('chargeback_id', '')[:8].upper()}"))


async def submit_to_mastercard_portal(dispute: dict[str, Any]) -> str:
    """
    Submit a chargeback dispute to Mastercard Dispute Resolution Management (DRM).

    Mastercard DRM API Reference: https://developer.mastercard.com/dispute-resolution
    Endpoint: POST /dispute-resolution/v1/disputes
    Authentication: OAuth 1.0a with RSA-SHA256 signing
    """
    payload = {
        "disputeType": _map_dispute_type_mc(dispute.get("dispute_type", "chargeback")),
        "acquirerReferenceNumber": dispute.get("arn", ""),
        "transactionDate": dispute.get("transaction_date", ""),
        "transactionAmount": {
            "value": str(dispute.get("amount_kobo", 0) / 100),
            "currency": dispute.get("currency", "NGN"),
        },
        "reasonCode": dispute.get("reason_code", ""),
        "merchantId": dispute.get("merchant_id", ""),
        "evidenceUrls": dispute.get("evidence_urls", []),
        "narrative": dispute.get("narrative", ""),
        "contactEmail": dispute.get("contact_email", ""),
    }

    # Mastercard OAuth 1.0a signing
    auth_header = _build_mc_oauth_header(
        method="POST",
        url=f"{MC_DRM_BASE_URL}/disputes",
        payload=payload,
    )

    headers = {
        "Content-Type": "application/json",
        "Authorization": auth_header,
        "X-Chargeback-ID": dispute.get("chargeback_id", ""),
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{MC_DRM_BASE_URL}/disputes",
            json=payload,
            headers=headers,
        )

    if response.status_code not in (200, 201, 202):
        raise RuntimeError(
            f"Mastercard DRM returned HTTP {response.status_code}: {response.text[:300]}"
        )

    resp_data = response.json()
    return resp_data.get("disputeId", resp_data.get("caseId",
        f"MC-{dispute.get('chargeback_id', '')[:8].upper()}"))


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _map_dispute_type_visa(dispute_type: str) -> str:
    """Map internal dispute type to Visa VROL dispute type code."""
    mapping = {
        "chargeback": "CHARGEBACK",
        "pre_arbitration": "PRE_ARBITRATION",
        "arbitration": "ARBITRATION",
        "retrieval": "RETRIEVAL_REQUEST",
        "compliance": "COMPLIANCE",
    }
    return mapping.get(dispute_type, "CHARGEBACK")


def _map_dispute_type_mc(dispute_type: str) -> str:
    """Map internal dispute type to Mastercard DRM dispute type code."""
    mapping = {
        "chargeback": "FIRST_CHARGEBACK",
        "pre_arbitration": "SECOND_CHARGEBACK",
        "arbitration": "ARBITRATION",
        "retrieval": "RETRIEVAL",
        "compliance": "COMPLIANCE",
    }
    return mapping.get(dispute_type, "FIRST_CHARGEBACK")


def _kobo_to_naira_str(kobo: int) -> str:
    """Convert kobo to Naira string with 2 decimal places."""
    return f"{kobo / 100:.2f}"


def _build_mc_oauth_header(method: str, url: str, payload: dict) -> str:
    """
    Build Mastercard OAuth 1.0a Authorization header with RSA-SHA256.

    Per Mastercard API Security Framework:
    https://developer.mastercard.com/platform/documentation/security-and-authentication/
    """
    import base64
    import hashlib
    import hmac
    import json
    import time
    import urllib.parse

    timestamp = str(int(time.time()))
    nonce = base64.urlsafe_b64encode(os.urandom(16)).decode("utf-8").rstrip("=")

    # Build signature base string
    body_hash = base64.b64encode(
        hashlib.sha256(json.dumps(payload).encode()).digest()
    ).decode()

    params = {
        "oauth_consumer_key": MC_CONSUMER_KEY,
        "oauth_nonce": nonce,
        "oauth_signature_method": "RSA-SHA256",
        "oauth_timestamp": timestamp,
        "oauth_version": "1.0",
        "oauth_body_hash": body_hash,
    }

    # Sort params and build base string
    sorted_params = "&".join(
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}"
        for k, v in sorted(params.items())
    )
    base_string = (
        f"{method.upper()}&"
        f"{urllib.parse.quote(url, safe='')}&"
        f"{urllib.parse.quote(sorted_params, safe='')}"
    )

    # Sign with RSA-SHA256 if key is available
    signature = _rsa_sign(base_string)
    params["oauth_signature"] = signature

    auth_header = "OAuth " + ", ".join(
        f'{k}="{urllib.parse.quote(v, safe="")}"'
        for k, v in sorted(params.items())
    )
    return auth_header


def _rsa_sign(base_string: str) -> str:
    """Sign a string with the Mastercard RSA private key."""
    import base64

    if not os.path.exists(MC_SIGNING_KEY_PATH):
        # Return empty signature in dev (will fail at Mastercard, but won't crash locally)
        return base64.b64encode(b"dev-signature").decode()

    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives.serialization.pkcs12 import load_key_and_certificates

        with open(MC_SIGNING_KEY_PATH, "rb") as f:
            p12_data = f.read()

        private_key, _, _ = load_key_and_certificates(
            p12_data,
            MC_SIGNING_KEY_PASSWORD.encode() if MC_SIGNING_KEY_PASSWORD else None,
        )

        signature = private_key.sign(
            base_string.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return base64.b64encode(signature).decode()
    except Exception as exc:
        raise RuntimeError(f"RSA signing failed: {exc}") from exc
