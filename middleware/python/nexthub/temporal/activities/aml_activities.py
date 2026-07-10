"""
PayGate NextHub — AML Temporal Activities
=========================================
Activities for the SuspiciousTransactionReportWorkflow.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import asyncpg
from temporalio import activity

logger = logging.getLogger(__name__)
PG_DSN = os.getenv("PG_DATABASE_URL", "postgresql://paygate_user:paygate_dev_2026@127.0.0.1/paygate_db")
CBN_FIU_URL = os.getenv("CBN_FIU_URL", "https://fiu.cbn.gov.ng/api/v1/str")
CBN_FIU_KEY = os.getenv("CBN_FIU_API_KEY", "")


async def _get_pg() -> asyncpg.Connection:
    return await asyncpg.connect(PG_DSN)


@activity.defn(name="evaluate_aml_rules")
async def evaluate_aml_rules(
    transfer_id: str,
    amount_minor: int,
    currency: str,
    payer_account: str,
    payee_account: str,
    triggered_rule_ids: list,
) -> dict:
    """Evaluate all active AML rules and return evidence dict."""
    activity.heartbeat("Evaluating AML rules")
    conn = await _get_pg()
    try:
        rules = await conn.fetch(
            "SELECT id, rule_name, rule_type, threshold_minor FROM aml_rules WHERE is_active = true"
        )
        evidence: dict[str, Any] = {
            "transfer_id": transfer_id,
            "amount_minor": amount_minor,
            "currency": currency,
            "triggered_rules": [],
        }
        for rule in rules:
            if rule["rule_type"] == "VELOCITY" and amount_minor > rule["threshold_minor"]:
                evidence["triggered_rules"].append({
                    "rule_id": str(rule["id"]),
                    "rule_name": rule["rule_name"],
                    "reason": f"Amount {amount_minor} exceeds velocity threshold {rule['threshold_minor']}",
                })
            elif rule["rule_type"] == "STRUCTURING":
                # Detect multiple transactions just below reporting threshold
                count = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM transfers
                    WHERE payer_account = $1
                      AND amount_minor BETWEEN $2 AND $3
                      AND created_at > NOW() - INTERVAL '24 hours'
                    """,
                    payer_account,
                    int(rule["threshold_minor"] * 0.85),
                    rule["threshold_minor"],
                )
                if count and count >= 3:
                    evidence["triggered_rules"].append({
                        "rule_id": str(rule["id"]),
                        "rule_name": rule["rule_name"],
                        "reason": f"Structuring detected: {count} transactions near threshold in 24h",
                    })
        return evidence
    finally:
        await conn.close()


@activity.defn(name="create_aml_alert")
async def create_aml_alert(
    transfer_id: str,
    dfsp_id: str,
    rule_results: dict,
) -> str:
    """Persist AML alert to DB and return alert_id."""
    activity.heartbeat("Creating AML alert")
    conn = await _get_pg()
    try:
        alert_id = str(uuid.uuid4())
        import json
        await conn.execute(
            """
            INSERT INTO aml_alerts
              (id, transfer_id, dfsp_id, triggered_rules, status, created_at_ms)
            VALUES ($1, $2, $3, $4, 'pending_review', $5)
            """,
            alert_id, transfer_id, dfsp_id,
            json.dumps(rule_results.get("triggered_rules", [])),
            int(datetime.now(timezone.utc).timestamp() * 1000),
        )
        return alert_id
    finally:
        await conn.close()


@activity.defn(name="notify_compliance_officer")
async def notify_compliance_officer(
    alert_id: str,
    transfer_id: str,
    amount_minor: int,
    currency: str,
) -> None:
    """Send push notification to compliance officer via portal notification system."""
    import aiohttp
    activity.heartbeat("Notifying compliance officer")
    portal_url = os.getenv("MERCHANT_PORTAL_URL", "http://localhost:3000")
    internal_key = os.getenv("INTERNAL_API_KEY", "")
    async with aiohttp.ClientSession() as session:
        await session.post(
            f"{portal_url}/api/internal/notify-compliance",
            json={
                "alert_id": alert_id,
                "transfer_id": transfer_id,
                "amount_minor": amount_minor,
                "currency": currency,
                "message": f"AML alert requires review: transfer {transfer_id[:8]}... amount {amount_minor/100:.2f} {currency}",
            },
            headers={"X-Internal-Key": internal_key},
            timeout=aiohttp.ClientTimeout(total=10),
        )


@activity.defn(name="file_str_report")
async def file_str_report(
    alert_id: str,
    transfer_id: str,
    dfsp_id: str,
    amount_minor: int,
    currency: str,
    rule_results: dict,
) -> str:
    """File STR with CBN Financial Intelligence Unit and return reference number."""
    import aiohttp
    activity.heartbeat("Filing STR with CBN FIU")
    async with aiohttp.ClientSession() as session:
        async with session.post(
            CBN_FIU_URL,
            json={
                "reporting_institution": dfsp_id,
                "transaction_reference": transfer_id,
                "amount": amount_minor / 100,
                "currency": currency,
                "suspicious_indicators": rule_results.get("triggered_rules", []),
                "report_date": datetime.now(timezone.utc).isoformat(),
            },
            headers={
                "Authorization": f"Bearer {CBN_FIU_KEY}",
                "Content-Type": "application/json",
            },
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            if resp.status in (200, 201):
                data = await resp.json()
                return data.get("reference", f"STR-{alert_id[:8].upper()}")
            else:
                # Log and return a local reference if CBN FIU is unreachable
                logger.error("CBN FIU STR filing failed: %s", await resp.text())
                return f"STR-LOCAL-{alert_id[:8].upper()}"
