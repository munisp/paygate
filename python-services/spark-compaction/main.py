"""
PayGate Spark Compaction Service
Compacts Parquet files in the Lakehouse (Delta Lake / Iceberg style compaction)
to maintain optimal read performance and reduce small-file overhead.

NO FABRICATED METRICS: when no compaction backend is available (PySpark /
Delta Lake not importable in this image), every endpoint reports
status="skipped_no_backend" (or HTTP 503) instead of invented file counts.
The deployed image (bitnami/spark) runs compact.py — the real PySpark job —
directly; this HTTP wrapper only performs work when the same libraries are
importable.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=os.getenv("LOG_LEVEL", "info").upper())
log = logging.getLogger("spark-compaction")

app = FastAPI(title="PayGate Spark Compaction Service", version="1.1.0")

S3_ENDPOINT = os.getenv("S3_ENDPOINT") or os.getenv("S3_ENDPOINT_URL", "http://minio:9000")
S3_BUCKET = os.getenv("S3_BUCKET") or os.getenv("LAKEHOUSE_BUCKET", "paygate-lakehouse")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
COMPACT_TARGET_SIZE_MB = int(os.getenv("COMPACT_TARGET_SIZE_MB", "128"))
VACUUM_RETAIN_HOURS = int(os.getenv("VACUUM_RETAIN_HOURS", "168"))


def _backend_available() -> bool:
    """A compaction backend exists only if PySpark + Delta Lake are importable."""
    try:
        import pyspark  # noqa: F401
        import delta.tables  # noqa: F401
        return True
    except ImportError:
        return False


BACKEND_AVAILABLE = _backend_available()
if not BACKEND_AVAILABLE:
    log.warning(
        "NO COMPACTION BACKEND: pyspark/delta-spark not importable in this image. "
        "Compaction endpoints will report status=skipped_no_backend — no lakehouse "
        "maintenance is being performed. Deploy the bitnami/spark image running "
        "compact.py for real nightly compaction."
    )

# ── Models ────────────────────────────────────────────────────────────────────

class CompactionRequest(BaseModel):
    table: str  # e.g. "transactions", "audit_events"
    partition: str | None = None  # e.g. "2026-04"
    target_file_size_mb: int = COMPACT_TARGET_SIZE_MB
    dry_run: bool = False

class CompactionResult(BaseModel):
    table: str
    partition: str | None
    files_before: int
    files_after: int
    bytes_saved: int
    duration_ms: int
    status: str
    detail: str | None = None
    timestamp: str

class CompactionStatus(BaseModel):
    job_id: str
    table: str
    status: str  # running | completed | failed | skipped_no_backend
    progress_pct: float
    started_at: str
    completed_at: str | None

# In-memory job tracker
_jobs: dict[str, CompactionStatus] = {}

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "healthy" if BACKEND_AVAILABLE else "degraded_no_backend",
        "service": "spark-compaction",
        "version": "1.1.0",
        "backend_available": BACKEND_AVAILABLE,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "s3_endpoint": S3_ENDPOINT,
        "lakehouse_bucket": S3_BUCKET,
    }

# ── Real compaction (only when the backend is importable) ─────────────────────

def _run_real_compaction(req: CompactionRequest) -> dict[str, Any]:
    """Execute real Delta Lake compaction via the compact.py job logic."""
    import compact as job  # compact.py — real PySpark/Delta implementation

    spark = job.get_spark()
    try:
        if req.dry_run:
            os.environ["DRY_RUN"] = "true"
        result = job.compact_table(spark, req.table)
        return result
    finally:
        spark.stop()


def _no_backend_result(req: CompactionRequest, start: float) -> CompactionResult:
    duration_ms = int((time.time() - start) * 1000)
    log.warning(
        f"Compaction request for table={req.table} partition={req.partition} "
        "NOT performed: no compaction backend in this image (skipped_no_backend)."
    )
    return CompactionResult(
        table=req.table,
        partition=req.partition,
        files_before=0,
        files_after=0,
        bytes_saved=0,
        duration_ms=duration_ms,
        status="skipped_no_backend",
        detail=(
            "No PySpark/Delta Lake backend available in this container; compaction "
            "was NOT performed and no metrics are reported. Run the compact.py "
            "Spark job image for real compaction."
        ),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

# ── Compaction Endpoints ──────────────────────────────────────────────────────

@app.post("/v1/compact", response_model=CompactionResult)
async def compact_table(req: CompactionRequest):
    """Compact small Parquet files in a Lakehouse table into larger files."""
    start = time.time()
    log.info(f"Compaction requested: table={req.table} partition={req.partition} dry_run={req.dry_run}")

    if not BACKEND_AVAILABLE:
        return _no_backend_result(req, start)

    try:
        result = await asyncio.to_thread(_run_real_compaction, req)
    except Exception as e:
        log.error(f"Real compaction failed for {req.table}: {e}")
        raise HTTPException(status_code=500, detail=f"Compaction failed: {e}")

    duration_ms = int((time.time() - start) * 1000)
    status = result.get("status", "error")
    return CompactionResult(
        table=req.table,
        partition=req.partition,
        files_before=int(result.get("files_before") or 0),
        files_after=int(result.get("files_after") or 0),
        bytes_saved=int(result.get("bytes_saved") or 0),
        duration_ms=duration_ms,
        status=status,
        detail=result.get("error"),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

@app.post("/v1/compact/async")
async def compact_table_async(req: CompactionRequest):
    """Start an async compaction job and return a job ID for polling."""
    import uuid
    job_id = str(uuid.uuid4())
    if not BACKEND_AVAILABLE:
        job = CompactionStatus(
            job_id=job_id,
            table=req.table,
            status="skipped_no_backend",
            progress_pct=0.0,
            started_at=datetime.now(timezone.utc).isoformat(),
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        _jobs[job_id] = job
        log.warning(f"Async compaction job {job_id} for {req.table}: skipped_no_backend")
        return {"job_id": job_id, "status": "skipped_no_backend"}
    job = CompactionStatus(
        job_id=job_id,
        table=req.table,
        status="running",
        progress_pct=0.0,
        started_at=datetime.now(timezone.utc).isoformat(),
        completed_at=None,
    )
    _jobs[job_id] = job
    asyncio.create_task(_run_compaction_job(job_id, req))
    return {"job_id": job_id, "status": "running"}

@app.get("/v1/compact/jobs/{job_id}", response_model=CompactionStatus)
async def get_job_status(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return _jobs[job_id]

@app.get("/v1/compact/jobs")
async def list_jobs():
    return {"jobs": list(_jobs.values()), "total": len(_jobs)}

@app.get("/v1/tables")
async def list_tables():
    """List Lakehouse table directories actually present in the object store.

    Returns real objects from S3/MinIO. When the object store is unreachable
    the list is empty and explicitly marked unavailable — table file counts
    are never invented.
    """
    if not (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY):
        return {"tables": [], "total": 0, "source": "unavailable",
                "detail": "Object-store credentials not configured"}
    try:
        import boto3
        s3 = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        )
        resp = await asyncio.to_thread(s3.list_objects_v2, Bucket=S3_BUCKET, Delimiter="/")
        prefixes = [p["Prefix"].rstrip("/") for p in resp.get("CommonPrefixes", [])]
        tables = [{"name": name} for name in sorted(prefixes)]
        return {"tables": tables, "total": len(tables), "source": "s3"}
    except Exception as e:
        log.error(f"Could not list lakehouse tables from object store: {e}")
        return {"tables": [], "total": 0, "source": "unavailable", "detail": str(e)}

@app.post("/v1/vacuum")
async def vacuum_table(table: str, retain_hours: int = VACUUM_RETAIN_HOURS):
    """Vacuum old Parquet files no longer referenced (Delta Lake VACUUM)."""
    log.info(f"Vacuum requested: table={table} retain_hours={retain_hours}")
    if not BACKEND_AVAILABLE:
        log.warning(f"Vacuum of {table} NOT performed: no compaction backend (skipped_no_backend)")
        return {
            "table": table,
            "retain_hours": retain_hours,
            "files_deleted": 0,
            "bytes_freed": 0,
            "status": "skipped_no_backend",
            "detail": "No PySpark/Delta Lake backend in this container; vacuum was NOT performed.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    try:
        import compact as job
        spark = job.get_spark()
        try:
            from delta.tables import DeltaTable
            path = f"s3a://{S3_BUCKET}/{table}"
            if not DeltaTable.isDeltaTable(spark, path):
                return {"table": table, "status": "not_delta", "files_deleted": 0,
                        "bytes_freed": 0, "timestamp": datetime.now(timezone.utc).isoformat()}
            dt = DeltaTable.forPath(spark, path)
            before = dt.detail().collect()[0]["numFiles"]
            await asyncio.to_thread(dt.vacuum, retain_hours)
            after = dt.detail().collect()[0]["numFiles"]
            return {
                "table": table,
                "retain_hours": retain_hours,
                "files_deleted": int(before - after),
                "bytes_freed": 0,  # Delta vacuum does not report bytes; not invented
                "status": "completed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        finally:
            spark.stop()
    except Exception as e:
        log.error(f"Vacuum failed for {table}: {e}")
        raise HTTPException(status_code=500, detail=f"Vacuum failed: {e}")

# ── Internal helpers ──────────────────────────────────────────────────────────

async def _run_compaction_job(job_id: str, req: CompactionRequest):
    """Background task running a REAL compaction job (backend-gated by caller)."""
    job = _jobs[job_id]
    try:
        job.progress_pct = 10.0
        result = await asyncio.to_thread(_run_real_compaction, req)
        job.progress_pct = 100.0
        job.status = "completed" if result.get("status") in ("compacted", "dry_run") else result.get("status", "failed")
        job.completed_at = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc).isoformat()
        log.error(f"Compaction job {job_id} failed: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=4, log_level="warning")
