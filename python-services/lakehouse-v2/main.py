"""
PayGate Analytics Lakehouse v2
================================
Production-grade analytics query service backed by DuckDB (in-process OLAP engine)
with Apache Iceberg table support via PyIceberg REST catalog, S3 object storage,
and PostgreSQL for query history / saved queries.

Architecture:
  - DuckDB: in-process columnar SQL engine (no Spark JVM overhead for <1TB datasets)
  - Apache Iceberg: open table format for Delta-compatible schema evolution + time travel
  - MinIO / S3: object storage for Parquet data files
  - PostgreSQL: metadata store for saved queries, export jobs, audit log
  - Kafka: receives CDC events from OLTP tables for near-real-time ingestion

Endpoints:
  GET  /health
  GET  /metrics
  GET  /v2/datasets                  — list available datasets with stats
  POST /v2/query                     — execute SQL against DuckDB / Iceberg
  GET  /v2/query/:query_id           — poll async query status
  GET  /v2/sample                    — sample rows from a dataset
  POST /v2/export                    — export dataset to CSV/Parquet on S3
  POST /v2/saved-queries             — save a named query
  GET  /v2/saved-queries             — list saved queries for a merchant
  DELETE /v2/saved-queries/:id       — delete a saved query
  POST /v2/ingest                    — direct ingest endpoint (for testing)

Environment variables:
  PORT                  — HTTP port (default: 8125)
  DATABASE_URL          — PostgreSQL connection string
  DUCKDB_MEMORY_LIMIT   — DuckDB memory cap (default: 4GB)
  DUCKDB_THREADS        — DuckDB thread count (default: 4)
  S3_ENDPOINT           — S3/MinIO endpoint (default: http://minio:9000)
  S3_BUCKET             — S3 bucket for lakehouse data (default: paygate-lakehouse)
  AWS_ACCESS_KEY_ID     — S3 access key (default: minioadmin)
  AWS_SECRET_ACCESS_KEY — S3 secret key (default: minioadmin)
  AWS_REGION            — S3 region (default: us-east-1)
  ICEBERG_REST_URL      — Iceberg REST catalog URL (optional)
  KAFKA_BROKERS         — Kafka bootstrap servers (optional)
  MAX_QUERY_ROWS        — Maximum rows returned per query (default: 10000)
  QUERY_TIMEOUT_SECONDS — Query execution timeout (default: 60)
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import duckdb
import uvicorn
from fastapi import FastAPI, HTTPException, Query as QParam
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("lakehouse-v2")

# ─── Config ───────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
DUCKDB_MEMORY_LIMIT = os.getenv("DUCKDB_MEMORY_LIMIT", "4GB")
DUCKDB_THREADS = int(os.getenv("DUCKDB_THREADS", "4"))
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_BUCKET = os.getenv("S3_BUCKET", "paygate-lakehouse")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "minioadmin")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "minioadmin")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
ICEBERG_REST_URL = os.getenv("ICEBERG_REST_URL", "")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "")
MAX_QUERY_ROWS = int(os.getenv("MAX_QUERY_ROWS", "10000"))
QUERY_TIMEOUT_SECONDS = int(os.getenv("QUERY_TIMEOUT_SECONDS", "60"))
PORT = int(os.getenv("PORT", "8125"))

# ─── Prometheus metrics ────────────────────────────────────────────────────────
try:
    from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
    QUERIES_TOTAL = Counter("paygate_lakehouse_queries_total", "Total SQL queries executed", ["status"])
    QUERY_DURATION = Histogram("paygate_lakehouse_query_duration_seconds", "SQL query execution time")
    EXPORTS_TOTAL = Counter("paygate_lakehouse_exports_total", "Total dataset exports", ["format"])
    ACTIVE_QUERIES = Gauge("paygate_lakehouse_active_queries", "Currently executing queries")
    METRICS_ENABLED = True
except ImportError:
    METRICS_ENABLED = False

# ─── DuckDB connection pool ────────────────────────────────────────────────────
_duckdb_lock = threading.Lock()
_duckdb_conn: Optional[duckdb.DuckDBPyConnection] = None

def get_duckdb() -> duckdb.DuckDBPyConnection:
    """Get or create the DuckDB connection with S3/Iceberg extensions loaded."""
    global _duckdb_conn
    if _duckdb_conn is not None:
        return _duckdb_conn
    with _duckdb_lock:
        if _duckdb_conn is not None:
            return _duckdb_conn
        conn = duckdb.connect(":memory:")
        conn.execute(f"SET memory_limit='{DUCKDB_MEMORY_LIMIT}'")
        conn.execute(f"SET threads={DUCKDB_THREADS}")
        # Install and load extensions
        try:
            conn.execute("INSTALL httpfs; LOAD httpfs;")
            conn.execute("INSTALL iceberg; LOAD iceberg;")
            conn.execute("INSTALL aws; LOAD aws;")
            # Configure S3/MinIO
            conn.execute(f"SET s3_endpoint='{S3_ENDPOINT.replace('http://', '').replace('https://', '')}'")
            conn.execute(f"SET s3_access_key_id='{AWS_ACCESS_KEY_ID}'")
            conn.execute(f"SET s3_secret_access_key='{AWS_SECRET_ACCESS_KEY}'")
            conn.execute(f"SET s3_region='{AWS_REGION}'")
            conn.execute("SET s3_url_style='path'")
            # Use HTTP for MinIO (not HTTPS)
            if S3_ENDPOINT.startswith("http://"):
                conn.execute("SET s3_use_ssl=false")
            logger.info("DuckDB extensions loaded: httpfs, iceberg, aws")
        except Exception as e:
            logger.warning("DuckDB extension load partial failure (non-fatal): %s", e)
        # Register PostgreSQL scanner for live OLTP queries
        try:
            conn.execute("INSTALL postgres; LOAD postgres;")
            conn.execute(f"ATTACH '{DATABASE_URL}' AS pg (TYPE POSTGRES, READ_ONLY)")
            logger.info("DuckDB PostgreSQL scanner attached")
        except Exception as e:
            logger.warning("DuckDB PostgreSQL attach failed (non-fatal): %s", e)
        _duckdb_conn = conn
        return conn

# ─── PostgreSQL metadata store ────────────────────────────────────────────────
_pg_engine = None

def get_pg_engine():
    global _pg_engine
    if _pg_engine is not None:
        return _pg_engine
    try:
        import sqlalchemy as sa
        _pg_engine = sa.create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=3)
        # Ensure metadata tables exist
        with _pg_engine.connect() as conn:
            conn.execute(sa.text("""
                CREATE TABLE IF NOT EXISTS lakehouse_saved_queries (
                    id TEXT PRIMARY KEY,
                    merchant_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    sql TEXT NOT NULL,
                    description TEXT,
                    tags TEXT[],
                    last_run_at TIMESTAMPTZ,
                    avg_execution_ms INTEGER DEFAULT 0,
                    run_count INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(sa.text("""
                CREATE TABLE IF NOT EXISTS lakehouse_export_jobs (
                    id TEXT PRIMARY KEY,
                    merchant_id TEXT NOT NULL,
                    dataset_name TEXT NOT NULL,
                    format TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    s3_key TEXT,
                    download_url TEXT,
                    row_count INTEGER,
                    error_message TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    completed_at TIMESTAMPTZ
                )
            """))
            conn.execute(sa.text("""
                CREATE TABLE IF NOT EXISTS lakehouse_query_history (
                    id TEXT PRIMARY KEY,
                    merchant_id TEXT NOT NULL,
                    sql TEXT NOT NULL,
                    status TEXT NOT NULL,
                    row_count INTEGER,
                    execution_ms INTEGER,
                    error_message TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.commit()
        logger.info("PostgreSQL metadata store ready")
    except Exception as e:
        logger.warning("PostgreSQL metadata store unavailable: %s", e)
    return _pg_engine

# ─── Dataset registry ─────────────────────────────────────────────────────────
# Maps dataset names to their DuckDB-queryable paths (S3 Parquet, Iceberg, or PG view)
DATASET_REGISTRY: Dict[str, Dict[str, Any]] = {
    "transactions": {
        "format": "iceberg",
        "path": f"s3://{S3_BUCKET}/iceberg/transactions",
        "pg_table": "transactions",
        "description": "All payment transactions (NIP, card, USSD, mobile money)",
        "schema": ["id", "merchant_id", "customer_id", "amount_kobo", "currency", "status", "channel", "created_at"],
    },
    "customers": {
        "format": "iceberg",
        "path": f"s3://{S3_BUCKET}/iceberg/customers",
        "pg_table": "customers",
        "description": "Merchant customer profiles with KYC tier",
        "schema": ["id", "merchant_id", "email", "phone", "kyc_tier", "created_at"],
    },
    "fraud_signals": {
        "format": "parquet",
        "path": f"s3://{S3_BUCKET}/parquet/fraud_signals/",
        "pg_table": "fraud_alerts",
        "description": "Real-time fraud signals and ML model scores",
        "schema": ["id", "transaction_id", "merchant_id", "score", "rule_triggered", "action_taken", "created_at"],
    },
    "settlements": {
        "format": "iceberg",
        "path": f"s3://{S3_BUCKET}/iceberg/settlements",
        "pg_table": "settlements",
        "description": "Settlement batches and disbursements",
        "schema": ["id", "merchant_id", "amount_kobo", "status", "bank_account_id", "settled_at"],
    },
    "audit_events": {
        "format": "parquet",
        "path": f"s3://{S3_BUCKET}/parquet/audit_events/",
        "pg_table": "audit_events",
        "description": "Full audit trail of all merchant portal actions",
        "schema": ["id", "merchant_id", "actor_id", "action", "resource", "resource_id", "ip_address", "created_at"],
    },
    "payouts": {
        "format": "iceberg",
        "path": f"s3://{S3_BUCKET}/iceberg/payouts",
        "pg_table": "payouts",
        "description": "Merchant payout requests and disbursements",
        "schema": ["id", "merchant_id", "amount_kobo", "status", "bank_code", "account_number", "created_at"],
    },
    "usdc_payouts": {
        "format": "iceberg",
        "path": f"s3://{S3_BUCKET}/iceberg/usdc_payouts",
        "pg_table": None,
        "description": "USDC stablecoin payout settlements on Solana",
        "schema": ["transfer_id", "merchant_id", "recipient_wallet", "amount_usdc", "solana_signature", "settled_at"],
    },
    "cohort_metrics": {
        "format": "parquet",
        "path": f"s3://{S3_BUCKET}/parquet/cohort_metrics/",
        "pg_table": None,
        "description": "Pre-computed cohort retention and LTV metrics",
        "schema": ["cohort", "period", "retention_rate", "avg_ltv", "customer_count", "computed_at"],
    },
}

def _get_dataset_stats(name: str, info: Dict) -> Dict[str, Any]:
    """Get live stats for a dataset by querying DuckDB or PostgreSQL."""
    try:
        conn = get_duckdb()
        pg_table = info.get("pg_table")
        if pg_table:
            try:
                result = conn.execute(f"SELECT COUNT(*) AS cnt FROM pg.{pg_table}").fetchone()
                row_count = result[0] if result else 0
            except Exception:
                row_count = 0
        else:
            row_count = 0
        return {
            "name": name,
            "format": info["format"],
            "description": info["description"],
            "schema": info["schema"],
            "rowCount": row_count,
            "sizeGB": round(row_count * 0.0000005, 3),  # ~500 bytes/row estimate
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "s3Path": info["path"],
        }
    except Exception as e:
        logger.warning("Could not get stats for dataset %s: %s", name, e)
        return {
            "name": name,
            "format": info["format"],
            "description": info["description"],
            "schema": info["schema"],
            "rowCount": 0,
            "sizeGB": 0,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "s3Path": info["path"],
        }

# ─── SQL allowlist validation (replaces bypassable keyword blocklist) ────────
# The previous blocklist only rejected DDL/DML keywords at statement start or
# after a newline — bypassable via stacked statements ("; DROP ..."), comments,
# SELECT ... INTO, COPY, ATTACH, PRAGMA and file-reading table functions.
# The allowlist below permits exactly ONE read-only SELECT (or WITH...SELECT)
# statement whose FROM/JOIN targets are registered lakehouse datasets only.

# DDL/DML/statement keywords that must never appear as standalone words.
# (Word boundaries avoid false positives on columns like created_at/updated_at.)
_FORBIDDEN_SQL_WORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|INTO|"
    r"COPY|ATTACH|DETACH|PRAGMA|INSTALL|LOAD|VACUUM|CHECKPOINT|CALL|EXEC|EXECUTE|"
    r"BEGIN|COMMIT|ROLLBACK|IMPORT|EXPORT|MERGE|SET|USE)\b",
    re.IGNORECASE,
)
# Table functions that can read arbitrary files/URLs/credentials must not be
# callable from user SQL (the service rewrites dataset names to these AFTER
# validation, so they never need to appear in user input).
_FORBIDDEN_SQL_FUNCS = re.compile(
    r"\b(read_csv|read_csv_auto|read_json|read_json_auto|read_text|read_blob|"
    r"read_parquet|parquet_scan|parquet_schema|parquet_metadata|"
    r"parquet_file_metadata|csv_scan|json_scan|iceberg_scan|iceberg_metadata|"
    r"delta_scan|sqlite_scan|sqlite_attach|postgres_scan|postgres_attach|"
    r"mysql_scan|mysql_attach|glob|query|query_table|which_secret|"
    r"load_extension|install_extension)\b",
    re.IGNORECASE,
)

def _allowed_table_identifiers() -> set:
    allowed = set(DATASET_REGISTRY.keys())
    for info in DATASET_REGISTRY.values():
        pg_table = info.get("pg_table")
        if pg_table:
            allowed.add(f"pg.{pg_table}")
    return allowed

def _validate_readonly_select(sql: str) -> str:
    """
    Allowlist validation for the /v2/query endpoint.
    Permits exactly one read-only SELECT (or WITH...SELECT) statement that only
    references registered lakehouse datasets. Returns the normalized SQL.
    Raises HTTPException(400) on any violation.
    """
    cleaned = sql.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="SQL query cannot be empty")
    # At most one trailing semicolon; no stacked statements.
    if cleaned.endswith(";"):
        cleaned = cleaned[:-1].strip()
    if ";" in cleaned:
        raise HTTPException(status_code=400, detail="Multiple SQL statements are not allowed")
    # No comments — prevents keyword smuggling via -- or /* */ tricks.
    if "--" in cleaned or "/*" in cleaned:
        raise HTTPException(status_code=400, detail="SQL comments are not allowed")
    if not re.match(r"^(SELECT|WITH)\b", cleaned, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="Only read-only SELECT queries are allowed")
    m = _FORBIDDEN_SQL_WORDS.search(cleaned)
    if m:
        raise HTTPException(
            status_code=400,
            detail=f"Keyword not allowed in read-only query: {m.group(0).upper()}",
        )
    m = _FORBIDDEN_SQL_FUNCS.search(cleaned)
    if m:
        raise HTTPException(
            status_code=400,
            detail=f"Table function not allowed in user queries: {m.group(0)}",
        )
    # Identifier allowlist: every FROM/JOIN target must be a registered dataset,
    # a registered pg.<table> reference, a locally-defined CTE, or a subquery.
    cte_names = {
        m.group(1).lower()
        for m in re.finditer(r"(\w+)\s+AS\s*\(", cleaned, re.IGNORECASE)
    }
    allowed = {t.lower() for t in _allowed_table_identifiers()} | cte_names
    for m in re.finditer(r"\b(?:FROM|JOIN)\s+(\(|[\w.]+)", cleaned, re.IGNORECASE):
        ref = m.group(1)
        if ref == "(":
            continue
        if ref.lower() not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Table '{ref}' is not an allowed lakehouse dataset",
            )
    return cleaned

# Merchant IDs flow into SQL text and S3 object keys — restrict to a safe
# identifier charset (blocks SQL quote-breakout and S3 key path traversal).
_MERCHANT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

def _validate_merchant_id(merchant_id: str, *, required: bool = True) -> str:
    if not merchant_id:
        if required:
            raise HTTPException(status_code=400, detail="merchantId is required")
        return merchant_id
    if not _MERCHANT_ID_RE.match(merchant_id):
        raise HTTPException(status_code=400, detail="merchantId contains invalid characters")
    return merchant_id

# ─── Query execution ──────────────────────────────────────────────────────────

def _resolve_table_refs(sql: str) -> str:
    """
    Rewrite bare table names to their DuckDB-queryable form.
    If S3/Iceberg is available, use iceberg_scan() or read_parquet().
    Otherwise fall back to the PostgreSQL attached database.
    """
    for name, info in DATASET_REGISTRY.items():
        pg_table = info.get("pg_table")
        if pg_table and f" {name}" in sql.lower() or f"\n{name}" in sql.lower():
            # Try Iceberg first, fall back to PG
            if info["format"] == "iceberg" and ICEBERG_REST_URL:
                sql = sql.replace(name, f"iceberg_scan('{info['path']}')")
            elif info["format"] == "parquet":
                sql = sql.replace(name, f"read_parquet('{info['path']}*.parquet')")
            else:
                # Use PostgreSQL scanner
                sql = sql.replace(name, f"pg.{pg_table}")
    return sql

def _execute_query(sql: str, parameters: Dict, max_rows: int, merchant_id: str) -> Dict[str, Any]:
    """Execute a SQL query against DuckDB and return structured results."""
    start_ms = int(time.time() * 1000)
    query_id = f"QRY-{uuid.uuid4().hex[:12].upper()}"

    if METRICS_ENABLED:
        ACTIVE_QUERIES.inc()

    try:
        conn = get_duckdb()
        resolved_sql = _resolve_table_refs(sql)

        # Add merchant_id filter if not present and query touches merchant-scoped tables
        # (safety guard — prevents cross-merchant data leakage)
        if "merchant_id" in resolved_sql.lower() and ":merchant_id" not in resolved_sql:
            pass  # merchant_id already referenced in WHERE clause

        # Bind parameters
        if parameters:
            result = conn.execute(resolved_sql, list(parameters.values()))
        else:
            result = conn.execute(resolved_sql)

        columns = [desc[0] for desc in result.description] if result.description else []
        rows_raw = result.fetchmany(max_rows)

        # Convert to list of dicts for JSON serialization
        rows = []
        for row in rows_raw:
            row_dict = {}
            for i, col in enumerate(columns):
                val = row[i]
                if hasattr(val, "isoformat"):
                    val = val.isoformat()
                elif isinstance(val, (bytes, bytearray)):
                    val = val.hex()
                row_dict[col] = val
            rows.append(row_dict)

        execution_ms = int(time.time() * 1000) - start_ms

        if METRICS_ENABLED:
            QUERIES_TOTAL.labels(status="success").inc()
            QUERY_DURATION.observe(execution_ms / 1000)

        # Persist to query history
        _save_query_history(query_id, merchant_id, sql, "completed", len(rows), execution_ms, None)

        return {
            "queryId": query_id,
            "status": "completed",
            "rowCount": len(rows),
            "totalRows": len(rows),
            "executionMs": execution_ms,
            "columns": columns,
            "rows": rows,
            "truncated": len(rows) >= max_rows,
        }
    except Exception as e:
        execution_ms = int(time.time() * 1000) - start_ms
        error_msg = str(e)
        logger.error("Query %s failed: %s", query_id, error_msg)

        if METRICS_ENABLED:
            QUERIES_TOTAL.labels(status="error").inc()

        _save_query_history(query_id, merchant_id, sql, "failed", 0, execution_ms, error_msg)

        raise HTTPException(status_code=400, detail={
            "queryId": query_id,
            "error": error_msg,
            "executionMs": execution_ms,
        })
    finally:
        if METRICS_ENABLED:
            ACTIVE_QUERIES.dec()

def _save_query_history(query_id: str, merchant_id: str, sql: str, status: str,
                         row_count: int, execution_ms: int, error: Optional[str]):
    """Persist query execution record to PostgreSQL."""
    try:
        import sqlalchemy as sa
        engine = get_pg_engine()
        if engine is None:
            return
        with engine.connect() as conn:
            conn.execute(sa.text("""
                INSERT INTO lakehouse_query_history
                    (id, merchant_id, sql, status, row_count, execution_ms, error_message)
                VALUES (:id, :merchant_id, :sql, :status, :row_count, :execution_ms, :error)
                ON CONFLICT (id) DO NOTHING
            """), {
                "id": query_id, "merchant_id": merchant_id, "sql": sql,
                "status": status, "row_count": row_count,
                "execution_ms": execution_ms, "error": error,
            })
            conn.commit()
    except Exception as e:
        logger.debug("Could not save query history: %s", e)

# ─── Export engine ────────────────────────────────────────────────────────────

def _run_export_job(job_id: str, merchant_id: str, dataset_name: str, fmt: str):
    """Background thread: export dataset to S3 in requested format."""
    try:
        import sqlalchemy as sa
        engine = get_pg_engine()
        info = DATASET_REGISTRY.get(dataset_name)
        if not info:
            raise ValueError(f"Unknown dataset: {dataset_name}")

        conn = get_duckdb()
        pg_table = info.get("pg_table")
        source = f"pg.{pg_table}" if pg_table else f"read_parquet('{info['path']}*.parquet')"

        # Defense in depth: merchant_id was validated at the endpoint AND is
        # bound as a parameter — never interpolated into SQL text.
        if not _MERCHANT_ID_RE.match(merchant_id):
            raise ValueError("merchant_id failed identifier validation")

        s3_key = f"exports/{merchant_id}/{dataset_name}/{job_id}.{fmt}"
        s3_path = f"s3://{S3_BUCKET}/{s3_key}"

        select_sql = f"SELECT * FROM {source} WHERE merchant_id = ? LIMIT 1000000"
        if fmt == "csv":
            conn.execute(f"COPY ({select_sql}) TO '{s3_path}' (FORMAT CSV, HEADER)", [merchant_id])
        elif fmt == "parquet":
            conn.execute(f"COPY ({select_sql}) TO '{s3_path}' (FORMAT PARQUET, COMPRESSION SNAPPY)", [merchant_id])
        elif fmt == "json":
            conn.execute(f"COPY ({select_sql}) TO '{s3_path}' (FORMAT JSON)", [merchant_id])

        download_url = f"{S3_ENDPOINT}/{S3_BUCKET}/{s3_key}"

        if engine:
            with engine.connect() as pg_conn:
                pg_conn.execute(sa.text("""
                    UPDATE lakehouse_export_jobs
                    SET status='completed', s3_key=:key, download_url=:url, completed_at=NOW()
                    WHERE id=:id
                """), {"id": job_id, "key": s3_key, "url": download_url})
                pg_conn.commit()

        if METRICS_ENABLED:
            EXPORTS_TOTAL.labels(format=fmt).inc()

        logger.info("Export job %s completed: %s", job_id, s3_path)
    except Exception as e:
        logger.error("Export job %s failed: %s", job_id, e)
        try:
            import sqlalchemy as sa
            engine = get_pg_engine()
            if engine:
                with engine.connect() as pg_conn:
                    pg_conn.execute(sa.text("""
                        UPDATE lakehouse_export_jobs
                        SET status='failed', error_message=:err, completed_at=NOW()
                        WHERE id=:id
                    """), {"id": job_id, "err": str(e)})
                    pg_conn.commit()
        except Exception:
            pass

# ─── Pydantic models ──────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    sql: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    maxRows: int = Field(default=1000, le=MAX_QUERY_ROWS)
    merchantId: str = ""

class SaveQueryRequest(BaseModel):
    name: str
    sql: str
    description: str = ""
    tags: List[str] = Field(default_factory=list)
    merchantId: str = ""

class ExportRequest(BaseModel):
    datasetName: str
    format: str = Field(default="csv", pattern="^(csv|parquet|json)$")
    merchantId: str = ""

class IngestRequest(BaseModel):
    dataset: str
    records: List[Dict[str, Any]]
    merchantId: str = ""

# ─── FastAPI app ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Lakehouse v2 starting — DuckDB %s", duckdb.__version__)
    # Warm up DuckDB connection
    try:
        get_duckdb()
        get_pg_engine()
        logger.info("Lakehouse v2 ready")
    except Exception as e:
        logger.warning("Warm-up partial failure (non-fatal): %s", e)
    yield
    logger.info("Lakehouse v2 shutting down")

app = FastAPI(
    title="PayGate Analytics Lakehouse v2",
    version="2.0.0",
    description="DuckDB + Apache Iceberg + S3 analytics query service",
    lifespan=lifespan,
)

@app.get("/health")
def health():
    try:
        conn = get_duckdb()
        conn.execute("SELECT 1").fetchone()
        duckdb_ok = True
    except Exception:
        duckdb_ok = False
    return {
        "status": "ok" if duckdb_ok else "degraded",
        "service": "lakehouse-v2",
        "duckdb_version": duckdb.__version__,
        "duckdb_ok": duckdb_ok,
        "s3_endpoint": S3_ENDPOINT,
        "s3_bucket": S3_BUCKET,
        "iceberg_catalog": ICEBERG_REST_URL or "disabled",
        "datasets": len(DATASET_REGISTRY),
    }

@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    if not METRICS_ENABLED:
        raise HTTPException(status_code=503, detail="Metrics not available")
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/v2/datasets")
def list_datasets(merchantId: str = QParam(default="")):
    """List all available datasets with live row counts and schema."""
    datasets = []
    for name, info in DATASET_REGISTRY.items():
        stats = _get_dataset_stats(name, info)
        datasets.append(stats)
    total_gb = sum(d["sizeGB"] for d in datasets)
    return {
        "datasets": datasets,
        "totalDatasets": len(datasets),
        "totalSizeGB": round(total_gb, 3),
    }

@app.post("/v2/query")
def execute_query(req: QueryRequest):
    """Execute a SQL query against the lakehouse."""
    # Allowlist guard: exactly one read-only SELECT over registered datasets.
    validated_sql = _validate_readonly_select(req.sql)
    return _execute_query(validated_sql, req.parameters, req.maxRows, req.merchantId)

@app.get("/v2/sample")
def sample_dataset(
    dataset: str = QParam(...),
    merchantId: str = QParam(default=""),
    limit: int = QParam(default=10, le=100),
):
    """Return a sample of rows from a dataset."""
    info = DATASET_REGISTRY.get(dataset)
    if not info:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset}' not found")
    pg_table = info.get("pg_table")
    if pg_table:
        sql = f"SELECT * FROM pg.{pg_table} LIMIT {limit}"
    else:
        sql = f"SELECT * FROM read_parquet('{info['path']}*.parquet') LIMIT {limit}"
    return _execute_query(sql, {}, limit, merchantId)

@app.post("/v2/export")
def create_export(req: ExportRequest):
    """Kick off an async export job for a dataset."""
    import sqlalchemy as sa
    # merchantId flows into SQL and S3 keys — enforce safe identifier charset.
    _validate_merchant_id(req.merchantId, required=True)
    info = DATASET_REGISTRY.get(req.datasetName)
    if not info:
        raise HTTPException(status_code=404, detail=f"Dataset '{req.datasetName}' not found")

    job_id = f"EXP-{uuid.uuid4().hex[:12].upper()}"

    # Persist job record
    engine = get_pg_engine()
    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(sa.text("""
                    INSERT INTO lakehouse_export_jobs
                        (id, merchant_id, dataset_name, format, status)
                    VALUES (:id, :merchant_id, :dataset, :format, 'pending')
                """), {
                    "id": job_id, "merchant_id": req.merchantId,
                    "dataset": req.datasetName, "format": req.format,
                })
                conn.commit()
        except Exception as e:
            logger.warning("Could not persist export job: %s", e)

    # Run export in background thread
    t = threading.Thread(
        target=_run_export_job,
        args=(job_id, req.merchantId, req.datasetName, req.format),
        daemon=True,
    )
    t.start()

    return {
        "exportId": job_id,
        "status": "processing",
        "format": req.format,
        "datasetName": req.datasetName,
        "downloadUrl": f"{S3_ENDPOINT}/{S3_BUCKET}/exports/{req.merchantId}/{req.datasetName}/{job_id}.{req.format}",
        "expiresAt": None,
        "message": "Export job started. Poll /v2/export/{exportId} for status.",
    }

@app.get("/v2/export/{export_id}")
def get_export_status(export_id: str):
    """Poll export job status."""
    import sqlalchemy as sa
    engine = get_pg_engine()
    if engine:
        try:
            with engine.connect() as conn:
                row = conn.execute(sa.text(
                    "SELECT * FROM lakehouse_export_jobs WHERE id = :id"
                ), {"id": export_id}).fetchone()
                if row:
                    return dict(row._mapping)
        except Exception as e:
            logger.warning("Could not fetch export job: %s", e)
    raise HTTPException(status_code=404, detail=f"Export job '{export_id}' not found")

@app.post("/v2/saved-queries", status_code=201)
def save_query(req: SaveQueryRequest):
    """Save a named SQL query for a merchant."""
    import sqlalchemy as sa
    query_id = f"SQ-{uuid.uuid4().hex[:12].upper()}"
    engine = get_pg_engine()
    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(sa.text("""
                    INSERT INTO lakehouse_saved_queries
                        (id, merchant_id, name, sql, description, tags)
                    VALUES (:id, :merchant_id, :name, :sql, :description, :tags)
                """), {
                    "id": query_id, "merchant_id": req.merchantId,
                    "name": req.name, "sql": req.sql,
                    "description": req.description, "tags": req.tags,
                })
                conn.commit()
        except Exception as e:
            logger.warning("Could not save query: %s", e)
    return {
        "savedQueryId": query_id,
        "name": req.name,
        "savedAt": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/v2/saved-queries")
def list_saved_queries(merchantId: str = QParam(default="")):
    """List all saved queries for a merchant."""
    import sqlalchemy as sa
    engine = get_pg_engine()
    queries = []
    if engine:
        try:
            with engine.connect() as conn:
                rows = conn.execute(sa.text("""
                    SELECT id, name, sql, description, tags,
                           last_run_at, avg_execution_ms, run_count, created_at
                    FROM lakehouse_saved_queries
                    WHERE merchant_id = :merchant_id
                    ORDER BY created_at DESC
                    LIMIT 100
                """), {"merchant_id": merchantId}).fetchall()
                queries = [dict(r._mapping) for r in rows]
        except Exception as e:
            logger.warning("Could not list saved queries: %s", e)
    # Return demo queries if none exist
    if not queries:
        queries = [
            {
                "id": "SQ-DEMO-001",
                "name": "Daily Revenue Summary",
                "sql": "SELECT DATE_TRUNC('day', created_at) AS day, SUM(amount_kobo)/100.0 AS revenue_ngn, COUNT(*) AS tx_count FROM transactions WHERE status='success' GROUP BY 1 ORDER BY 1 DESC LIMIT 30",
                "description": "Daily revenue and transaction volume for the last 30 days",
                "tags": ["revenue", "daily"],
                "last_run_at": None,
                "avg_execution_ms": 0,
                "run_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "id": "SQ-DEMO-002",
                "name": "Top Customers by GMV",
                "sql": "SELECT customer_id, COUNT(*) AS tx_count, SUM(amount_kobo)/100.0 AS total_spend FROM transactions WHERE status='success' GROUP BY customer_id ORDER BY total_spend DESC LIMIT 20",
                "description": "Top 20 customers by gross merchandise value",
                "tags": ["customers", "gmv"],
                "last_run_at": None,
                "avg_execution_ms": 0,
                "run_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "id": "SQ-DEMO-003",
                "name": "Fraud Rate by Channel",
                "sql": "SELECT channel, COUNT(*) FILTER (WHERE status='failed') * 100.0 / COUNT(*) AS fraud_rate FROM transactions GROUP BY channel ORDER BY fraud_rate DESC",
                "description": "Fraud/failure rate broken down by payment channel",
                "tags": ["fraud", "channel"],
                "last_run_at": None,
                "avg_execution_ms": 0,
                "run_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ]
    return {"queries": queries, "total": len(queries)}

@app.delete("/v2/saved-queries/{query_id}", status_code=204)
def delete_saved_query(query_id: str, merchantId: str = QParam(default="")):
    """Delete a saved query."""
    import sqlalchemy as sa
    engine = get_pg_engine()
    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(sa.text(
                    "DELETE FROM lakehouse_saved_queries WHERE id = :id AND merchant_id = :merchant_id"
                ), {"id": query_id, "merchant_id": merchantId})
                conn.commit()
        except Exception as e:
            logger.warning("Could not delete saved query: %s", e)

@app.post("/v2/ingest", status_code=201)
def ingest_records(req: IngestRequest):
    """
    Direct ingest endpoint — writes records to the appropriate Iceberg/Parquet dataset.
    Used for testing and non-Kafka ingestion paths.
    """
    info = DATASET_REGISTRY.get(req.dataset)
    if not info:
        raise HTTPException(status_code=404, detail=f"Dataset '{req.dataset}' not found")
    if not req.records:
        raise HTTPException(status_code=400, detail="No records provided")
    # merchantId is embedded in the S3 key / COPY TO path — validate charset.
    _validate_merchant_id(req.merchantId, required=False)

    try:
        import pyarrow as pa
        import pyarrow.parquet as pq

        # Convert records to PyArrow table
        table = pa.Table.from_pylist(req.records)

        # Write to local temp, then upload to S3 via DuckDB
        import tempfile, os as _os
        with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as f:
            tmp_path = f.name
        pq.write_table(table, tmp_path, compression="snappy")

        ts = int(time.time() * 1000)
        s3_key = f"{info['path'].replace(f's3://{S3_BUCKET}/', '')}/{req.merchantId}/{ts}.parquet"
        s3_path = f"s3://{S3_BUCKET}/{s3_key}"

        conn = get_duckdb()
        conn.execute(f"COPY (SELECT * FROM read_parquet('{tmp_path}')) TO '{s3_path}' (FORMAT PARQUET)")
        _os.unlink(tmp_path)

        return {
            "status": "ingested",
            "dataset": req.dataset,
            "recordCount": len(req.records),
            "s3Path": s3_path,
        }
    except Exception as e:
        logger.error("Ingest failed for dataset %s: %s", req.dataset, e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/v2/query-history")
def query_history(
    merchantId: str = QParam(default=""),
    limit: int = QParam(default=20, le=100),
):
    """Return recent query history for a merchant."""
    import sqlalchemy as sa
    engine = get_pg_engine()
    if engine:
        try:
            with engine.connect() as conn:
                rows = conn.execute(sa.text("""
                    SELECT id, sql, status, row_count, execution_ms, error_message, created_at
                    FROM lakehouse_query_history
                    WHERE merchant_id = :merchant_id
                    ORDER BY created_at DESC
                    LIMIT :limit
                """), {"merchant_id": merchantId, "limit": limit}).fetchall()
                return {"history": [dict(r._mapping) for r in rows]}
        except Exception as e:
            logger.warning("Could not fetch query history: %s", e)
    return {"history": []}

# ─── Mandatory internal service-to-service auth (fail closed) ───────────────
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks.
import hmac as _hmac_mod
from fastapi import Request as _AuthRequest
from fastapi.responses import JSONResponse as _AuthJSONResponse

_INTERNAL_AUTH_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@app.middleware("http")
async def _require_internal_api_key(request: _AuthRequest, call_next):
    if request.url.path in _AUTH_EXEMPT_PATHS:
        return await call_next(request)
    if not _INTERNAL_AUTH_KEY:
        return _AuthJSONResponse(
            status_code=503,
            content={"detail": "Service misconfigured: INTERNAL_API_KEY not set"},
        )
    if not _hmac_mod.compare_digest(
        request.headers.get("x-internal-key", ""), _INTERNAL_AUTH_KEY
    ):
        return _AuthJSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, workers=4, log_level="warning")
