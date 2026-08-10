"""
PayGate Spark Compaction Service
Compacts Parquet files in the Lakehouse (Delta Lake / Iceberg style compaction)
to maintain optimal read performance and reduce small-file overhead.
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

app = FastAPI(title="PayGate Spark Compaction Service", version="1.0.0")

S3_ENDPOINT = os.getenv("S3_ENDPOINT_URL", "http://minio:9000")
LAKEHOUSE_BUCKET = os.getenv("LAKEHOUSE_BUCKET", "paygate-lakehouse")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "paygate_internal_dev_key_2026")

# ── Models ────────────────────────────────────────────────────────────────────

class CompactionRequest(BaseModel):
    table: str  # e.g. "transactions", "audit_events"
    partition: str | None = None  # e.g. "2026-04"
    target_file_size_mb: int = 128
    dry_run: bool = False

class CompactionResult(BaseModel):
    table: str
    partition: str | None
    files_before: int
    files_after: int
    bytes_saved: int
    duration_ms: int
    status: str
    timestamp: str

class CompactionStatus(BaseModel):
    job_id: str
    table: str
    status: str  # running | completed | failed
    progress_pct: float
    started_at: str
    completed_at: str | None

# In-memory job tracker
_jobs: dict[str, CompactionStatus] = {}

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "spark-compaction",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "s3_endpoint": S3_ENDPOINT,
        "lakehouse_bucket": LAKEHOUSE_BUCKET,
    }

# ── Compaction Endpoints ──────────────────────────────────────────────────────

@app.post("/v1/compact", response_model=CompactionResult)
async def compact_table(req: CompactionRequest):
    """
    Compact small Parquet files in a Lakehouse table partition into larger files.
    Simulates Spark-style file compaction with configurable target file size.
    """
    start = time.time()
    log.info(f"Starting compaction for table={req.table} partition={req.partition} dry_run={req.dry_run}")

    # Simulate compaction work (in production, this would call PySpark or DuckDB)
    await asyncio.sleep(0.1)

    # Simulated metrics
    files_before = 47
    files_after = 3 if not req.dry_run else files_before
    bytes_saved = (files_before - files_after) * req.target_file_size_mb * 1024 * 1024 // 4

    duration_ms = int((time.time() - start) * 1000)

    result = CompactionResult(
        table=req.table,
        partition=req.partition,
        files_before=files_before,
        files_after=files_after,
        bytes_saved=bytes_saved,
        duration_ms=duration_ms,
        status="dry_run" if req.dry_run else "completed",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    log.info(f"Compaction complete: {files_before} → {files_after} files, saved {bytes_saved:,} bytes in {duration_ms}ms")
    return result

@app.post("/v1/compact/async")
async def compact_table_async(req: CompactionRequest):
    """Start an async compaction job and return a job ID for polling."""
    import uuid
    job_id = str(uuid.uuid4())
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
    """List all Lakehouse tables available for compaction."""
    tables = [
        {"name": "transactions", "partitions": ["2026-01", "2026-02", "2026-03", "2026-04"], "file_count": 47, "size_gb": 2.3},
        {"name": "audit_events", "partitions": ["2026-04"], "file_count": 128, "size_gb": 0.8},
        {"name": "fraud_scores", "partitions": ["2026-04"], "file_count": 23, "size_gb": 0.1},
        {"name": "settlement_records", "partitions": ["2026-04"], "file_count": 12, "size_gb": 0.4},
        {"name": "kyc_documents", "partitions": ["2026-04"], "file_count": 8, "size_gb": 1.2},
    ]
    return {"tables": tables, "total": len(tables)}

@app.post("/v1/vacuum")
async def vacuum_table(table: str, retain_hours: int = 168):
    """
    Vacuum old Parquet files that are no longer referenced (Delta Lake VACUUM equivalent).
    Retains files newer than retain_hours (default 7 days).
    """
    log.info(f"Vacuuming table={table} retain_hours={retain_hours}")
    await asyncio.sleep(0.05)
    return {
        "table": table,
        "retain_hours": retain_hours,
        "files_deleted": 12,
        "bytes_freed": 256 * 1024 * 1024,
        "status": "completed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

# ── Internal helpers ──────────────────────────────────────────────────────────

async def _run_compaction_job(job_id: str, req: CompactionRequest):
    """Background task simulating async compaction with progress updates."""
    job = _jobs[job_id]
    try:
        for progress in [10, 30, 60, 80, 100]:
            await asyncio.sleep(0.2)
            job.progress_pct = float(progress)
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc).isoformat()
        log.error(f"Compaction job {job_id} failed: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=4, log_level="warning")
