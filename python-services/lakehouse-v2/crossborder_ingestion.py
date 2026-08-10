"""
PayGate Lakehouse Cross-Border Ingestion Pipeline
==================================================
Delta Lake / Apache Iceberg ingestion pipeline for CIPS, UPI, PIX, and
Mojaloop cross-border transfer events. Consumes from Kafka and writes to
the lakehouse for analytics, regulatory reporting, and ML feature stores.

Tables:
  - crossborder_transfers      — all cross-border transfer events
  - cips_settlements           — CIPS-specific settlement records
  - upi_transactions           — UPI NPCI transaction records
  - pix_payments               — PIX BACEN payment records
  - mojaloop_fulfillments      — Mojaloop FSPIOP fulfillment records
  - fx_rates_history           — FX rate snapshots per corridor
  - corridor_analytics         — aggregated corridor metrics (hourly)

Architecture:
  - Kafka: source of truth for all events
  - Delta Lake (via deltalake Python library): ACID lakehouse storage
  - Parquet: columnar storage format
  - S3 / local filesystem: storage backend
  - FastAPI: HTTP API for queries and ingestion triggers

Environment variables:
  PORT                  — HTTP port (default: 8125)
  LAKEHOUSE_PATH        — Base path for Delta tables (default: /data/lakehouse)
  KAFKA_BROKERS         — Kafka bootstrap servers
  DATABASE_URL          — PostgreSQL for metadata
  LOG_LEVEL             — Logging level
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel

logger = logging.getLogger("lakehouse-crossborder")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

LAKEHOUSE_PATH = os.getenv("LAKEHOUSE_PATH", "/data/lakehouse")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "")
PORT = int(os.getenv("PORT", "8125"))

# ─── Schema Definitions ───────────────────────────────────────────────────────

CROSSBORDER_SCHEMA = {
    "transfer_id": "string",
    "merchant_id": "string",
    "rail": "string",           # cips | upi | pix | mojaloop | brics
    "corridor": "string",       # e.g. NGN-CNY, USD-INR
    "source_currency": "string",
    "target_currency": "string",
    "source_amount": "int64",
    "target_amount": "int64",
    "exchange_rate": "double",
    "fee_amount": "int64",
    "status": "string",
    "receiver_id": "string",
    "receiver_name": "string",
    "sender_id": "string",
    "purpose_code": "string",   # ISO 20022 purpose code
    "rail_reference": "string", # CIPS message ID / UPI ref / PIX E2EID / Mojaloop transfer ID
    "aml_cleared": "boolean",
    "fraud_score": "double",
    "created_at": "timestamp",
    "settled_at": "timestamp",
    "ingested_at": "timestamp",
}

CIPS_SCHEMA = {
    "transfer_id": "string",
    "merchant_id": "string",
    "cips_message_id": "string",
    "cnaps_code": "string",
    "beneficiary_bank": "string",
    "amount_cny": "int64",
    "amount_usd": "int64",
    "exchange_rate_cny_usd": "double",
    "purpose_code": "string",
    "settlement_batch": "string",
    "status": "string",
    "submitted_at": "timestamp",
    "settled_at": "timestamp",
}

UPI_SCHEMA = {
    "transfer_id": "string",
    "merchant_id": "string",
    "upi_ref": "string",
    "npci_ref": "string",
    "payer_vpa": "string",
    "payee_vpa": "string",
    "psp_name": "string",
    "amount_inr": "int64",
    "remarks": "string",
    "status": "string",
    "submitted_at": "timestamp",
    "settled_at": "timestamp",
}

PIX_SCHEMA = {
    "transfer_id": "string",
    "merchant_id": "string",
    "end_to_end_id": "string",
    "pix_key": "string",
    "pix_key_type": "string",
    "amount_brl": "int64",
    "description": "string",
    "bacen_status": "string",   # ACSC | RJCT | ACCP
    "submitted_at": "timestamp",
    "settled_at": "timestamp",
}

FX_RATES_SCHEMA = {
    "rate_id": "string",
    "corridor": "string",
    "source_currency": "string",
    "target_currency": "string",
    "rate": "double",
    "spread_bps": "int64",
    "provider": "string",
    "rail": "string",
    "valid_from": "timestamp",
    "valid_to": "timestamp",
    "recorded_at": "timestamp",
}

# ─── In-memory tables (fallback) ─────────────────────────────────────────────

_tables: Dict[str, List[Dict[str, Any]]] = {
    "crossborder_transfers": [],
    "cips_settlements": [],
    "upi_transactions": [],
    "pix_payments": [],
    "mojaloop_fulfillments": [],
    "fx_rates_history": [],
    "corridor_analytics": [],
}

_delta_available = False


def _try_import_delta():
    """Try to import delta-rs for Delta Lake support."""
    global _delta_available
    try:
        import deltalake  # noqa
        _delta_available = True
        logger.info("Delta Lake (deltalake) available")
    except ImportError:
        logger.warning("deltalake not installed — using in-memory fallback")


def _write_delta(table_name: str, records: List[Dict[str, Any]]):
    """Write records to Delta Lake table."""
    if not _delta_available or not records:
        _tables[table_name].extend(records)
        return

    try:
        import pyarrow as pa
        from deltalake import write_deltalake

        table_path = os.path.join(LAKEHOUSE_PATH, table_name)
        os.makedirs(table_path, exist_ok=True)

        # Convert to PyArrow table
        df = pa.Table.from_pylist(records)
        write_deltalake(table_path, df, mode="append")
        logger.info(f"Written {len(records)} records to Delta table: {table_name}")
    except Exception as e:
        logger.warning(f"Delta write failed, using memory fallback: {e}")
        _tables[table_name].extend(records)


def _query_table(table_name: str, filters: Optional[Dict] = None, limit: int = 100) -> List[Dict]:
    """Query a Delta Lake or in-memory table."""
    if _delta_available:
        try:
            from deltalake import DeltaTable
            table_path = os.path.join(LAKEHOUSE_PATH, table_name)
            if os.path.exists(table_path):
                dt = DeltaTable(table_path)
                df = dt.to_pandas()
                if filters:
                    for k, v in filters.items():
                        df = df[df[k] == v]
                return df.head(limit).to_dict(orient="records")
        except Exception as e:
            logger.warning(f"Delta query failed: {e}")

    # Fallback: in-memory
    records = _tables.get(table_name, [])
    if filters:
        for k, v in filters.items():
            records = [r for r in records if r.get(k) == v]
    return records[-limit:]


# ─── Ingestion Functions ──────────────────────────────────────────────────────

def ingest_crossborder_event(event: Dict[str, Any]) -> str:
    """Ingest a cross-border transfer event into the lakehouse."""
    record = {
        "transfer_id": event.get("transfer_id", str(uuid.uuid4())),
        "merchant_id": event.get("merchant_id", ""),
        "rail": event.get("rail", "unknown"),
        "corridor": event.get("corridor", f"{event.get('source_currency', '')}-{event.get('target_currency', '')}"),
        "source_currency": event.get("source_currency", ""),
        "target_currency": event.get("target_currency", ""),
        "source_amount": int(event.get("source_amount", event.get("amount", 0))),
        "target_amount": int(event.get("target_amount", 0)),
        "exchange_rate": float(event.get("exchange_rate", 1.0)),
        "fee_amount": int(event.get("fee_amount", event.get("fee", 0))),
        "status": event.get("status", "pending"),
        "receiver_id": event.get("receiver_id", ""),
        "receiver_name": event.get("receiver_name", ""),
        "sender_id": event.get("sender_id", event.get("merchant_id", "")),
        "purpose_code": event.get("purpose_code", "TRAD"),
        "rail_reference": event.get("rail_reference", event.get("cips_message_id",
                          event.get("upi_ref", event.get("end_to_end_id", "")))),
        "aml_cleared": bool(event.get("aml_cleared", True)),
        "fraud_score": float(event.get("fraud_score", 0.1)),
        "created_at": event.get("created_at", datetime.now(timezone.utc).isoformat()),
        "settled_at": event.get("settled_at"),
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }

    _write_delta("crossborder_transfers", [record])

    # Also write to rail-specific table
    rail = record["rail"]
    if rail == "cips":
        cips_record = {
            "transfer_id": record["transfer_id"],
            "merchant_id": record["merchant_id"],
            "cips_message_id": event.get("cips_message_id", ""),
            "cnaps_code": event.get("cnaps_code", ""),
            "beneficiary_bank": event.get("beneficiary_bank", ""),
            "amount_cny": record["target_amount"],
            "amount_usd": record["source_amount"],
            "exchange_rate_cny_usd": record["exchange_rate"],
            "purpose_code": record["purpose_code"],
            "settlement_batch": event.get("settlement_batch", ""),
            "status": record["status"],
            "submitted_at": record["created_at"],
            "settled_at": record["settled_at"],
        }
        _write_delta("cips_settlements", [cips_record])

    elif rail == "upi":
        upi_record = {
            "transfer_id": record["transfer_id"],
            "merchant_id": record["merchant_id"],
            "upi_ref": event.get("upi_ref", ""),
            "npci_ref": event.get("npci_ref", ""),
            "payer_vpa": event.get("payer_vpa", ""),
            "payee_vpa": event.get("payee_vpa", ""),
            "psp_name": event.get("psp_name", ""),
            "amount_inr": record["target_amount"],
            "remarks": event.get("remarks", ""),
            "status": record["status"],
            "submitted_at": record["created_at"],
            "settled_at": record["settled_at"],
        }
        _write_delta("upi_transactions", [upi_record])

    elif rail == "pix":
        pix_record = {
            "transfer_id": record["transfer_id"],
            "merchant_id": record["merchant_id"],
            "end_to_end_id": event.get("end_to_end_id", ""),
            "pix_key": event.get("pix_key", ""),
            "pix_key_type": event.get("pix_key_type", ""),
            "amount_brl": record["target_amount"],
            "description": event.get("description", ""),
            "bacen_status": event.get("bacen_status", "ACSC"),
            "submitted_at": record["created_at"],
            "settled_at": record["settled_at"],
        }
        _write_delta("pix_payments", [pix_record])

    return record["transfer_id"]


def ingest_fx_rate(rate_event: Dict[str, Any]) -> str:
    """Ingest an FX rate snapshot."""
    record = {
        "rate_id": str(uuid.uuid4()),
        "corridor": rate_event.get("corridor", ""),
        "source_currency": rate_event.get("source_currency", ""),
        "target_currency": rate_event.get("target_currency", ""),
        "rate": float(rate_event.get("rate", 1.0)),
        "spread_bps": int(rate_event.get("spread_bps", 50)),
        "provider": rate_event.get("provider", "paygate-fx"),
        "rail": rate_event.get("rail", ""),
        "valid_from": rate_event.get("valid_from", datetime.now(timezone.utc).isoformat()),
        "valid_to": rate_event.get("valid_to"),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_delta("fx_rates_history", [record])
    return record["rate_id"]


# ─── Models ───────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    table: str
    events: List[Dict[str, Any]]


class QueryRequest(BaseModel):
    table: str
    filters: Optional[Dict[str, Any]] = None
    limit: int = 100


class CorridorAnalyticsQuery(BaseModel):
    corridor: Optional[str] = None
    rail: Optional[str] = None
    days: int = 7


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="PayGate Lakehouse Cross-Border Pipeline", version="v97")


@app.on_event("startup")
def startup():
    _try_import_delta()
    os.makedirs(LAKEHOUSE_PATH, exist_ok=True)
    _seed_demo_data()
    if KAFKA_BROKERS:
        threading.Thread(target=_kafka_consumer_loop, daemon=True).start()


def _seed_demo_data():
    """Seed demo cross-border and FX rate data."""
    demo_transfers = [
        {
            "transfer_id": f"cb_seed_{i:04d}",
            "merchant_id": "merchant_demo_001",
            "rail": ["cips", "upi", "pix", "mojaloop"][i % 4],
            "source_currency": ["NGN", "USD", "NGN", "NGN"][i % 4],
            "target_currency": ["CNY", "INR", "BRL", "KES"][i % 4],
            "source_amount": (i + 1) * 100000,
            "target_amount": (i + 1) * 1500,
            "exchange_rate": [0.0052, 83.5, 0.028, 13.2][i % 4],
            "fee_amount": (i + 1) * 1500,
            "status": "settled" if i % 5 != 0 else "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settled_at": datetime.now(timezone.utc).isoformat() if i % 5 != 0 else None,
        }
        for i in range(20)
    ]
    for t in demo_transfers:
        ingest_crossborder_event(t)

    # Seed FX rates
    fx_rates = [
        {"corridor": "NGN-CNY", "source_currency": "NGN", "target_currency": "CNY",
         "rate": 0.0052, "spread_bps": 80, "provider": "cips-fx", "rail": "cips"},
        {"corridor": "USD-INR", "source_currency": "USD", "target_currency": "INR",
         "rate": 83.5, "spread_bps": 30, "provider": "npci-fx", "rail": "upi"},
        {"corridor": "NGN-BRL", "source_currency": "NGN", "target_currency": "BRL",
         "rate": 0.028, "spread_bps": 120, "provider": "bacen-fx", "rail": "pix"},
        {"corridor": "NGN-KES", "source_currency": "NGN", "target_currency": "KES",
         "rate": 13.2, "spread_bps": 100, "provider": "mojaloop-fx", "rail": "mojaloop"},
        {"corridor": "USD-CNY", "source_currency": "USD", "target_currency": "CNY",
         "rate": 7.24, "spread_bps": 20, "provider": "cips-fx", "rail": "cips"},
    ]
    for rate in fx_rates:
        ingest_fx_rate(rate)

    logger.info(f"Seeded {len(demo_transfers)} cross-border transfers and {len(fx_rates)} FX rates")


def _kafka_consumer_loop():
    """Consume Kafka events and ingest into lakehouse."""
    try:
        from kafka import KafkaConsumer
        topics = [
            "paygate.cips.transfer.settled",
            "paygate.upi.pay.settled",
            "paygate.pix.payment.settled",
            "paygate.mojaloop.transfer.fulfilled",
            "paygate.fx.rate.updated",
        ]
        consumer = KafkaConsumer(
            *topics,
            bootstrap_servers=KAFKA_BROKERS.split(","),
            group_id="lakehouse-crossborder-ingestion",
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="latest",
        )
        logger.info(f"Kafka consumer started for: {topics}")

        for msg in consumer:
            try:
                event = msg.value
                topic = msg.topic
                if "fx.rate" in topic:
                    ingest_fx_rate(event)
                else:
                    ingest_crossborder_event(event)
            except Exception as e:
                logger.error(f"Error ingesting Kafka event: {e}")
    except ImportError:
        logger.warning("kafka-python not installed — Kafka consumer disabled")
    except Exception as e:
        logger.error(f"Kafka consumer error: {e}")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "lakehouse-crossborder",
        "version": "v97",
        "delta_available": _delta_available,
        "lakehouse_path": LAKEHOUSE_PATH,
        "tables": {k: len(v) for k, v in _tables.items()},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/v1/lakehouse/ingest")
def ingest(req: IngestRequest):
    """Ingest events into a lakehouse table."""
    if req.table not in _tables:
        raise HTTPException(status_code=400, detail=f"Unknown table: {req.table}")

    ingested = 0
    for event in req.events:
        if req.table == "crossborder_transfers":
            ingest_crossborder_event(event)
        elif req.table == "fx_rates_history":
            ingest_fx_rate(event)
        else:
            _write_delta(req.table, [event])
        ingested += 1

    return {"ingested": ingested, "table": req.table}


@app.post("/v1/lakehouse/query")
def query(req: QueryRequest):
    """Query a lakehouse table."""
    if req.table not in _tables:
        raise HTTPException(status_code=400, detail=f"Unknown table: {req.table}")

    records = _query_table(req.table, req.filters, req.limit)
    return {"records": records, "count": len(records), "table": req.table}


@app.get("/v1/lakehouse/tables")
def list_tables():
    """List all lakehouse tables with record counts."""
    return {
        "tables": {k: {"record_count": len(v), "schema": list(CROSSBORDER_SCHEMA.keys())} for k, v in _tables.items()},
        "total_tables": len(_tables),
        "delta_available": _delta_available,
    }


@app.post("/v1/lakehouse/analytics/corridors")
def corridor_analytics(req: CorridorAnalyticsQuery):
    """Compute corridor analytics (volume, count, avg rate)."""
    records = _query_table("crossborder_transfers", limit=10000)

    if req.corridor:
        records = [r for r in records if r.get("corridor") == req.corridor]
    if req.rail:
        records = [r for r in records if r.get("rail") == req.rail]

    # Aggregate by corridor and rail
    stats: Dict[str, Any] = {}
    for r in records:
        key = f"{r.get('corridor', 'unknown')}|{r.get('rail', 'unknown')}"
        if key not in stats:
            stats[key] = {
                "corridor": r.get("corridor"),
                "rail": r.get("rail"),
                "count": 0,
                "total_source_amount": 0,
                "total_target_amount": 0,
                "total_fees": 0,
                "avg_exchange_rate": 0.0,
                "rates": [],
                "statuses": {},
            }
        s = stats[key]
        s["count"] += 1
        s["total_source_amount"] += r.get("source_amount", 0)
        s["total_target_amount"] += r.get("target_amount", 0)
        s["total_fees"] += r.get("fee_amount", 0)
        s["rates"].append(r.get("exchange_rate", 1.0))
        status = r.get("status", "unknown")
        s["statuses"][status] = s["statuses"].get(status, 0) + 1

    for s in stats.values():
        if s["rates"]:
            s["avg_exchange_rate"] = sum(s["rates"]) / len(s["rates"])
        del s["rates"]

    return {
        "corridors": list(stats.values()),
        "total_corridors": len(stats),
        "total_records": len(records),
    }


@app.get("/v1/lakehouse/fx-rates")
def get_fx_rates(corridor: Optional[str] = None, rail: Optional[str] = None):
    """Get latest FX rates per corridor."""
    filters = {}
    if corridor:
        filters["corridor"] = corridor
    if rail:
        filters["rail"] = rail

    rates = _query_table("fx_rates_history", filters, limit=100)
    # Return latest rate per corridor
    latest: Dict[str, Dict] = {}
    for rate in rates:
        key = rate.get("corridor", "")
        if key not in latest or rate.get("recorded_at", "") > latest[key].get("recorded_at", ""):
            latest[key] = rate

    return {"rates": list(latest.values()), "count": len(latest)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
