"""
PayGate Automated Reconciliation Engine
Consumes Kafka transaction events, reconciles against bank statements,
writes results to the Postgres lakehouse, and surfaces discrepancies via tRPC.
"""
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from enum import Enum
from typing import Dict, List, Optional, Tuple

import asyncpg
from confluent_kafka import Consumer, KafkaError, KafkaException
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("reconciliation-engine")

# ─── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "reconciliation-engine")
PORT = int(os.getenv("PORT", "8096"))

# ─── Models ────────────────────────────────────────────────────────────────────

class ReconciliationStatus(str, Enum):
    MATCHED = "matched"
    UNMATCHED_INTERNAL = "unmatched_internal"   # in our ledger, not in bank
    UNMATCHED_EXTERNAL = "unmatched_external"   # in bank, not in our ledger
    AMOUNT_MISMATCH = "amount_mismatch"
    DUPLICATE = "duplicate"
    PENDING = "pending"


class ReconciliationRecord(BaseModel):
    recon_id: str
    merchant_id: str
    internal_tx_id: Optional[str]
    external_ref: Optional[str]
    internal_amount_kobo: Optional[int]
    external_amount_kobo: Optional[int]
    currency: str
    status: ReconciliationStatus
    discrepancy_kobo: int = 0
    reconciled_at: Optional[datetime]
    period_start: datetime
    period_end: datetime
    notes: Optional[str]


class BankStatementEntry(BaseModel):
    external_ref: str
    amount_kobo: int
    currency: str
    value_date: datetime
    description: str
    merchant_id: str


class ReconciliationRunRequest(BaseModel):
    merchant_id: str
    period_start: datetime
    period_end: datetime
    bank_statement: List[BankStatementEntry]


class ReconciliationRunResult(BaseModel):
    run_id: str
    merchant_id: str
    period_start: datetime
    period_end: datetime
    total_internal: int
    total_external: int
    matched: int
    unmatched_internal: int
    unmatched_external: int
    amount_mismatches: int
    duplicates: int
    total_discrepancy_kobo: int
    status: str
    completed_at: datetime


# ─── Database helpers ──────────────────────────────────────────────────────────

async def get_db_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)


_pool: Optional[asyncpg.Pool] = None


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await get_db_pool()
    return _pool


async def fetch_internal_transactions(
    merchant_id: str,
    period_start: datetime,
    period_end: datetime,
) -> List[Dict]:
    """Fetch all internal transactions from the paygate ledger for a period."""
    db = await pool()
    rows = await db.fetch(
        """
        SELECT
            t.id AS tx_id,
            t.amount_kobo,
            t.currency,
            t.reference,
            t.status,
            t.created_at,
            t.metadata
        FROM transactions t
        WHERE t.merchant_id = $1
          AND t.created_at BETWEEN $2 AND $3
          AND t.status IN ('completed', 'settled')
        ORDER BY t.created_at ASC
        """,
        merchant_id,
        period_start,
        period_end,
    )
    return [dict(r) for r in rows]


async def save_reconciliation_results(
    run_id: str,
    merchant_id: str,
    period_start: datetime,
    period_end: datetime,
    records: List[ReconciliationRecord],
    summary: ReconciliationRunResult,
) -> None:
    """Persist reconciliation results to the lakehouse."""
    db = await pool()
    async with db.transaction():
        # Save run summary
        await db.execute(
            """
            INSERT INTO reconciliation_runs (
                run_id, merchant_id, period_start, period_end,
                total_internal, total_external, matched,
                unmatched_internal, unmatched_external, amount_mismatches,
                duplicates, total_discrepancy_kobo, status, completed_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (run_id) DO UPDATE SET
                status = EXCLUDED.status,
                completed_at = EXCLUDED.completed_at
            """,
            run_id, merchant_id, period_start, period_end,
            summary.total_internal, summary.total_external, summary.matched,
            summary.unmatched_internal, summary.unmatched_external,
            summary.amount_mismatches, summary.duplicates,
            summary.total_discrepancy_kobo, summary.status, summary.completed_at,
        )

        # Save individual records
        for rec in records:
            await db.execute(
                """
                INSERT INTO reconciliation_records (
                    recon_id, run_id, merchant_id, internal_tx_id, external_ref,
                    internal_amount_kobo, external_amount_kobo, currency,
                    status, discrepancy_kobo, reconciled_at,
                    period_start, period_end, notes
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                ON CONFLICT (recon_id) DO NOTHING
                """,
                rec.recon_id, run_id, rec.merchant_id, rec.internal_tx_id,
                rec.external_ref, rec.internal_amount_kobo, rec.external_amount_kobo,
                rec.currency, rec.status.value, rec.discrepancy_kobo,
                rec.reconciled_at, rec.period_start, rec.period_end, rec.notes,
            )


# ─── Core reconciliation logic ─────────────────────────────────────────────────

def reconcile(
    internal_txs: List[Dict],
    bank_entries: List[BankStatementEntry],
    merchant_id: str,
    period_start: datetime,
    period_end: datetime,
) -> Tuple[List[ReconciliationRecord], ReconciliationRunResult]:
    """
    Core reconciliation algorithm.
    Matches internal transactions against bank statement entries by reference.
    Identifies unmatched, duplicate, and amount-mismatch records.
    """
    records: List[ReconciliationRecord] = []
    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Build lookup maps
    internal_by_ref: Dict[str, Dict] = {}
    for tx in internal_txs:
        ref = tx.get("reference", "")
        if ref:
            internal_by_ref[ref] = tx

    external_by_ref: Dict[str, BankStatementEntry] = {}
    seen_external_refs = set()
    duplicate_external_refs = set()

    for entry in bank_entries:
        if entry.external_ref in seen_external_refs:
            duplicate_external_refs.add(entry.external_ref)
        else:
            seen_external_refs.add(entry.external_ref)
            external_by_ref[entry.external_ref] = entry

    matched_refs = set()
    matched = 0
    unmatched_internal = 0
    unmatched_external = 0
    amount_mismatches = 0
    duplicates = len(duplicate_external_refs)
    total_discrepancy = 0

    # Match internal → external
    for ref, tx in internal_by_ref.items():
        recon_id = str(uuid.uuid4())
        if ref in external_by_ref:
            ext = external_by_ref[ref]
            matched_refs.add(ref)
            discrepancy = tx["amount_kobo"] - ext.amount_kobo

            if discrepancy == 0:
                status = ReconciliationStatus.MATCHED
                matched += 1
            else:
                status = ReconciliationStatus.AMOUNT_MISMATCH
                amount_mismatches += 1
                total_discrepancy += abs(discrepancy)

            records.append(ReconciliationRecord(
                recon_id=recon_id,
                merchant_id=merchant_id,
                internal_tx_id=tx["tx_id"],
                external_ref=ref,
                internal_amount_kobo=tx["amount_kobo"],
                external_amount_kobo=ext.amount_kobo,
                currency=tx.get("currency", "NGN"),
                status=status,
                discrepancy_kobo=discrepancy,
                reconciled_at=now,
                period_start=period_start,
                period_end=period_end,
                notes=f"Discrepancy: {discrepancy} kobo" if discrepancy != 0 else None,
            ))
        else:
            # Internal transaction not found in bank statement
            unmatched_internal += 1
            records.append(ReconciliationRecord(
                recon_id=recon_id,
                merchant_id=merchant_id,
                internal_tx_id=tx["tx_id"],
                external_ref=None,
                internal_amount_kobo=tx["amount_kobo"],
                external_amount_kobo=None,
                currency=tx.get("currency", "NGN"),
                status=ReconciliationStatus.UNMATCHED_INTERNAL,
                discrepancy_kobo=tx["amount_kobo"],
                reconciled_at=now,
                period_start=period_start,
                period_end=period_end,
                notes="Transaction in PayGate ledger but not in bank statement",
            ))
            total_discrepancy += tx["amount_kobo"]

    # Find external entries not matched to any internal transaction
    for ref, ext in external_by_ref.items():
        if ref not in matched_refs:
            unmatched_external += 1
            total_discrepancy += ext.amount_kobo
            records.append(ReconciliationRecord(
                recon_id=str(uuid.uuid4()),
                merchant_id=merchant_id,
                internal_tx_id=None,
                external_ref=ref,
                internal_amount_kobo=None,
                external_amount_kobo=ext.amount_kobo,
                currency=ext.currency,
                status=ReconciliationStatus.UNMATCHED_EXTERNAL,
                discrepancy_kobo=ext.amount_kobo,
                reconciled_at=now,
                period_start=period_start,
                period_end=period_end,
                notes="Transaction in bank statement but not in PayGate ledger",
            ))

    # Mark duplicates
    for ref in duplicate_external_refs:
        records.append(ReconciliationRecord(
            recon_id=str(uuid.uuid4()),
            merchant_id=merchant_id,
            internal_tx_id=None,
            external_ref=ref,
            internal_amount_kobo=None,
            external_amount_kobo=None,
            currency="NGN",
            status=ReconciliationStatus.DUPLICATE,
            discrepancy_kobo=0,
            reconciled_at=now,
            period_start=period_start,
            period_end=period_end,
            notes=f"Duplicate external reference: {ref}",
        ))

    summary = ReconciliationRunResult(
        run_id=run_id,
        merchant_id=merchant_id,
        period_start=period_start,
        period_end=period_end,
        total_internal=len(internal_txs),
        total_external=len(bank_entries),
        matched=matched,
        unmatched_internal=unmatched_internal,
        unmatched_external=unmatched_external,
        amount_mismatches=amount_mismatches,
        duplicates=duplicates,
        total_discrepancy_kobo=total_discrepancy,
        status="completed",
        completed_at=now,
    )

    return records, summary


# ─── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="PayGate Reconciliation Engine", version="1.0.0")


@app.post("/reconcile", response_model=ReconciliationRunResult)
async def run_reconciliation(req: ReconciliationRunRequest):
    """Run a reconciliation for a merchant against a bank statement."""
    try:
        internal_txs = await fetch_internal_transactions(
            req.merchant_id, req.period_start, req.period_end
        )
        records, summary = reconcile(
            internal_txs, req.bank_statement,
            req.merchant_id, req.period_start, req.period_end,
        )
        await save_reconciliation_results(
            summary.run_id, req.merchant_id,
            req.period_start, req.period_end,
            records, summary,
        )
        logger.info(
            f"Reconciliation completed: merchant={req.merchant_id} "
            f"matched={summary.matched} discrepancy={summary.total_discrepancy_kobo}"
        )
        return summary
    except Exception as e:
        logger.error(f"Reconciliation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reconciliation-runs")
async def list_reconciliation_runs(
    merchant_id: str = Query(...),
    limit: int = Query(20, le=100),
):
    """List reconciliation runs for a merchant."""
    db = await pool()
    rows = await db.fetch(
        """
        SELECT * FROM reconciliation_runs
        WHERE merchant_id = $1
        ORDER BY completed_at DESC
        LIMIT $2
        """,
        merchant_id, limit,
    )
    return {"runs": [dict(r) for r in rows], "count": len(rows)}


@app.get("/reconciliation-records")
async def list_reconciliation_records(
    run_id: str = Query(...),
    status: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    """List individual reconciliation records for a run."""
    db = await pool()
    if status:
        rows = await db.fetch(
            "SELECT * FROM reconciliation_records WHERE run_id = $1 AND status = $2 LIMIT $3",
            run_id, status, limit,
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM reconciliation_records WHERE run_id = $1 LIMIT $2",
            run_id, limit,
        )
    return {"records": [dict(r) for r in rows], "count": len(rows)}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "reconciliation-engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─── Kafka consumer for auto-reconciliation ────────────────────────────────────

async def kafka_consumer_loop():
    """Listen to paygate.settlements topic and trigger auto-reconciliation."""
    consumer = Consumer({
        "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe(["paygate.settlements", "paygate.transactions"])
    logger.info("Kafka consumer started — listening for settlement events")

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                await asyncio.sleep(0.1)
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error(f"Kafka error: {msg.error()}")
                continue

            try:
                event = json.loads(msg.value().decode("utf-8"))
                event_type = event.get("event_type", "")

                if event_type == "settlement.batch.completed":
                    merchant_id = event.get("merchant_id")
                    period_end = datetime.fromisoformat(event.get("settled_at", datetime.now(timezone.utc).isoformat()))
                    period_start = period_end - timedelta(days=1)
                    logger.info(f"Auto-reconciliation triggered for merchant {merchant_id}")
                    # In production: fetch bank statement from NIBSS/bank API and run reconcile()

            except Exception as e:
                logger.error(f"Error processing Kafka message: {e}")

    finally:
        consumer.close()


if __name__ == "__main__":
    import uvicorn

    async def startup():
        asyncio.create_task(kafka_consumer_loop())

    app.add_event_handler("startup", startup)
    uvicorn.run(app, host="0.0.0.0", port=PORT, workers=4, log_level="warning")
