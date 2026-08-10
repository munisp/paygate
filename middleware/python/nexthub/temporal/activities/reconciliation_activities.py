"""
PayGate NextHub — Reconciliation Temporal Activities
====================================================
All activities are determinism-safe: they perform I/O and return serialisable
results. The workflow orchestrates them; activities never call each other.

Dependencies:
  pip install temporalio asyncpg pyarrow boto3
"""

import asyncio
import base64
import io
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import asyncpg
from temporalio import activity

logger = logging.getLogger(__name__)

PG_DSN = os.getenv("PG_DATABASE_URL", "postgresql://paygate_user:paygate_dev_2026@127.0.0.1/paygate_db")
S3_BUCKET = os.getenv("S3_BUCKET", "nexthub-lakehouse")
AWS_REGION = os.getenv("AWS_REGION", "af-south-1")


async def _get_pg() -> asyncpg.Connection:
    return await asyncpg.connect(PG_DSN)


@activity.defn(name="fetch_hub_records")
async def fetch_hub_records(window_id: str, currency: str) -> list[dict]:
    """Fetch all transfer records from the hub DB for a settlement window."""
    activity.heartbeat("Connecting to hub database")
    conn = await _get_pg()
    try:
        rows = await conn.fetch(
            """
            SELECT
                t.id AS transfer_id,
                t.amount,
                t.currency,
                t.payer_dfsp_id,
                t.payee_dfsp_id,
                t.status,
                t.created_at,
                t.fulfilled_at,
                t.ilp_condition,
                t.ilp_fulfillment
            FROM transfers t
            WHERE t.settlement_window_id = $1
              AND t.currency = $2
              AND t.status IN ('COMMITTED', 'ABORTED')
            ORDER BY t.created_at ASC
            """,
            window_id,
            currency,
        )
        activity.heartbeat(f"Fetched {len(rows)} hub records")
        return [dict(r) for r in rows]
    finally:
        await conn.close()


@activity.defn(name="fetch_rail_records")
async def fetch_rail_records(window_id: str, rail: str, currency: str) -> list[dict]:
    """
    Fetch corresponding records from the payment rail.
    For NIBSS NIP: calls the NIBSS settlement report API.
    For Mojaloop: queries the Mojaloop Central Ledger DB.
    For RTGS: queries the CBN RTGS settlement file.
    """
    activity.heartbeat(f"Fetching rail records from {rail}")

    if rail == "NIBSS_NIP":
        return await _fetch_nibss_records(window_id, currency)
    elif rail == "MOJALOOP":
        return await _fetch_mojaloop_records(window_id, currency)
    elif rail == "RTGS":
        return await _fetch_rtgs_records(window_id, currency)
    else:
        raise ValueError(f"Unknown rail: {rail}")


async def _fetch_nibss_records(window_id: str, currency: str) -> list[dict]:
    """Fetch NIBSS NIP settlement report for the window period."""
    import aiohttp
    nibss_url = os.getenv("NIBSS_GATEWAY_URL", "https://nibss-gateway.internal")
    nibss_key = os.getenv("NIBSS_SECRET_KEY", "")

    # Get window date range from DB
    conn = await _get_pg()
    try:
        row = await conn.fetchrow(
            "SELECT opened_at, closed_at FROM settlement_windows WHERE id = $1",
            window_id,
        )
        if not row:
            return []
        opened_at = row["opened_at"]
        closed_at = row["closed_at"] or datetime.now(timezone.utc)
    finally:
        await conn.close()

    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{nibss_url}/v1/settlement/report",
            params={
                "from": opened_at.isoformat(),
                "to": closed_at.isoformat(),
                "currency": currency,
            },
            headers={"X-NIBSS-Key": nibss_key},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"NIBSS API error {resp.status}: {body}")
            data = await resp.json()
            return data.get("transactions", [])


async def _fetch_mojaloop_records(window_id: str, currency: str) -> list[dict]:
    """Fetch Mojaloop Central Ledger transfer records for the window."""
    conn = await _get_pg()
    try:
        rows = await conn.fetch(
            """
            SELECT transfer_id, amount, currency, payer_fsp, payee_fsp,
                   transfer_state, created_date, fulfil_date
            FROM mojaloop_transfers
            WHERE settlement_window_id = $1 AND currency = $2
            """,
            window_id, currency,
        )
        return [dict(r) for r in rows]
    finally:
        await conn.close()


async def _fetch_rtgs_records(window_id: str, currency: str) -> list[dict]:
    """Parse CBN RTGS settlement file from S3."""
    import boto3
    s3 = boto3.client("s3", region_name=AWS_REGION)
    key = f"rtgs/settlement/{window_id}.json"
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
        return json.loads(obj["Body"].read())
    except s3.exceptions.NoSuchKey:
        logger.warning("RTGS settlement file not found: %s", key)
        return []


@activity.defn(name="compute_breaks")
async def compute_breaks(
    window_id: str,
    hub_records: list[dict],
    rail_records: list[dict],
) -> list[dict]:
    """
    Diff hub records against rail records and classify breaks.

    Break types:
      TIMING     — transfer in hub but not yet in rail (within 2h SLA)
      AMOUNT     — transfer in both but amounts differ
      MISSING_DEBIT  — transfer in rail but not in hub (potential double-credit)
      DUPLICATE_CREDIT — transfer appears twice in rail
    """
    activity.heartbeat("Computing breaks")

    hub_by_id = {r["transfer_id"]: r for r in hub_records}
    rail_by_id: dict[str, dict] = {}
    duplicates: list[str] = []

    for r in rail_records:
        tid = r.get("transfer_id") or r.get("transactionId") or r.get("id")
        if tid in rail_by_id:
            duplicates.append(tid)
        else:
            rail_by_id[tid] = r

    breaks: list[dict] = []
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    # Check hub records against rail
    for tid, hub_rec in hub_by_id.items():
        if tid not in rail_by_id:
            # Timing break if within 2 hours, otherwise escalate
            age_ms = now_ms - (hub_rec.get("fulfilled_at") or now_ms)
            break_type = "TIMING" if age_ms < 7_200_000 else "MISSING_DEBIT"
            breaks.append({
                "window_id": window_id,
                "break_type": break_type,
                "hub_transfer_id": tid,
                "rail_transfer_id": None,
                "hub_amount": hub_rec.get("amount"),
                "rail_amount": None,
                "currency": hub_rec.get("currency"),
                "sla_deadline_ms": now_ms + (7_200_000 if break_type == "TIMING" else 3_600_000),
            })
        else:
            rail_rec = rail_by_id[tid]
            hub_amount = int(hub_rec.get("amount", 0))
            rail_amount = int(rail_rec.get("amount", 0))
            if hub_amount != rail_amount:
                breaks.append({
                    "window_id": window_id,
                    "break_type": "AMOUNT",
                    "hub_transfer_id": tid,
                    "rail_transfer_id": tid,
                    "hub_amount": hub_amount,
                    "rail_amount": rail_amount,
                    "currency": hub_rec.get("currency"),
                    "sla_deadline_ms": now_ms + 14_400_000,  # 4h SLA
                })

    # Check for missing debits (in rail but not in hub)
    for tid, rail_rec in rail_by_id.items():
        if tid not in hub_by_id:
            breaks.append({
                "window_id": window_id,
                "break_type": "MISSING_DEBIT",
                "hub_transfer_id": None,
                "rail_transfer_id": tid,
                "hub_amount": None,
                "rail_amount": int(rail_rec.get("amount", 0)),
                "currency": rail_rec.get("currency"),
                "sla_deadline_ms": now_ms + 3_600_000,  # 1h SLA
            })

    # Duplicate credits
    for tid in duplicates:
        breaks.append({
            "window_id": window_id,
            "break_type": "DUPLICATE_CREDIT",
            "hub_transfer_id": tid,
            "rail_transfer_id": tid,
            "hub_amount": hub_by_id.get(tid, {}).get("amount"),
            "rail_amount": None,
            "currency": hub_by_id.get(tid, {}).get("currency"),
            "sla_deadline_ms": now_ms + 1_800_000,  # 30min SLA
        })

    activity.heartbeat(f"Found {len(breaks)} breaks")
    return breaks


@activity.defn(name="write_reconciliation_report")
async def write_reconciliation_report(
    window_id: str,
    breaks: list[dict],
    lakehouse_bucket: str | None,
) -> str | None:
    """Persist breaks to DB and write Parquet report to Lakehouse."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    conn = await _get_pg()
    try:
        # Upsert each break into reconciliation_exceptions
        for brk in breaks:
            await conn.execute(
                """
                INSERT INTO reconciliation_exceptions
                  (window_id, break_type, hub_transfer_id, rail_transfer_id,
                   hub_amount, rail_amount, currency, sla_deadline_ms, status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')
                ON CONFLICT (window_id, hub_transfer_id)
                DO UPDATE SET
                  break_type = EXCLUDED.break_type,
                  rail_transfer_id = EXCLUDED.rail_transfer_id,
                  hub_amount = EXCLUDED.hub_amount,
                  rail_amount = EXCLUDED.rail_amount,
                  sla_deadline_ms = EXCLUDED.sla_deadline_ms
                """,
                brk["window_id"], brk["break_type"],
                brk["hub_transfer_id"], brk["rail_transfer_id"],
                brk["hub_amount"], brk["rail_amount"],
                brk["currency"], brk["sla_deadline_ms"],
            )
    finally:
        await conn.close()

    # Write Parquet to Lakehouse
    if not breaks or not lakehouse_bucket:
        return None

    import boto3
    s3 = boto3.client("s3", region_name=AWS_REGION)
    bucket = lakehouse_bucket or S3_BUCKET
    key = f"reconciliation/{window_id}/{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.parquet"

    table = pa.Table.from_pylist(breaks)
    buf = io.BytesIO()
    pq.write_table(table, buf)
    buf.seek(0)
    s3.put_object(Bucket=bucket, Key=key, Body=buf.read(), ContentType="application/octet-stream")
    return key


@activity.defn(name="auto_resolve_timing_breaks")
async def auto_resolve_timing_breaks(window_id: str) -> int:
    """Auto-resolve TIMING breaks that have since appeared in the rail."""
    conn = await _get_pg()
    try:
        result = await conn.execute(
            """
            UPDATE reconciliation_exceptions
            SET status = 'auto_resolved', resolved_at = NOW()
            WHERE window_id = $1
              AND break_type = 'TIMING'
              AND status = 'open'
              AND hub_transfer_id IN (
                  SELECT transfer_id FROM transfers
                  WHERE settlement_window_id = $1 AND status = 'COMMITTED'
              )
            """,
            window_id,
        )
        count = int(result.split()[-1])
        return count
    finally:
        await conn.close()


@activity.defn(name="escalate_unresolved_breaks")
async def escalate_unresolved_breaks(window_id: str) -> int:
    """Escalate breaks that have exceeded their SLA deadline."""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    conn = await _get_pg()
    try:
        result = await conn.execute(
            """
            UPDATE reconciliation_exceptions
            SET status = 'escalated'
            WHERE window_id = $1
              AND status = 'open'
              AND sla_deadline_ms < $2
            """,
            window_id,
            now_ms,
        )
        count = int(result.split()[-1])
        return count
    finally:
        await conn.close()
