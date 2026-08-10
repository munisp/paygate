#!/usr/bin/env python3
"""
PayGate Delta Lake Compaction Job
Runs as a periodic Spark job to compact small Parquet files in Delta tables,
run VACUUM to remove old snapshots, and update table statistics.
"""
import os
import sys
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("delta-compaction")

TABLES = [
    "audit_events",
    "transactions",
    "fraud_events",
    "usdc_transfers",
    "reconciliation_records",
    "settlement_batches",
]

S3_BUCKET = os.getenv("S3_BUCKET", "paygate-lakehouse")
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "minioadmin")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "minioadmin")
VACUUM_RETAIN_HOURS = int(os.getenv("VACUUM_RETAIN_HOURS", "168"))  # 7 days
COMPACT_TARGET_SIZE_MB = int(os.getenv("COMPACT_TARGET_SIZE_MB", "128"))
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"


def get_spark():
    """Create a SparkSession with Delta Lake and S3 support."""
    try:
        from pyspark.sql import SparkSession
        builder = (
            SparkSession.builder
            .appName("paygate-delta-compaction")
            .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
            .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
            .config("spark.hadoop.fs.s3a.endpoint", S3_ENDPOINT)
            .config("spark.hadoop.fs.s3a.access.key", AWS_ACCESS_KEY_ID)
            .config("spark.hadoop.fs.s3a.secret.key", AWS_SECRET_ACCESS_KEY)
            .config("spark.hadoop.fs.s3a.path.style.access", "true")
            .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
            .config("spark.jars.packages",
                    "io.delta:delta-spark_2.12:3.2.0,"
                    "org.apache.hadoop:hadoop-aws:3.3.4,"
                    "com.amazonaws:aws-java-sdk-bundle:1.12.262")
            .config("spark.sql.shuffle.partitions", "8")
            .config("spark.default.parallelism", "8")
        )
        return builder.getOrCreate()
    except ImportError:
        log.error("PySpark not available. Install pyspark to run compaction.")
        sys.exit(1)


def compact_table(spark, table_name: str) -> dict:
    """Compact a Delta table by coalescing small files."""
    path = f"s3a://{S3_BUCKET}/{table_name}"
    result = {"table": table_name, "status": "skipped", "files_before": 0, "files_after": 0}

    try:
        from delta.tables import DeltaTable

        if not DeltaTable.isDeltaTable(spark, path):
            log.warning(f"[{table_name}] Not a Delta table at {path}, skipping")
            result["status"] = "not_delta"
            return result

        dt = DeltaTable.forPath(spark, path)
        detail = dt.detail().collect()[0]
        files_before = detail["numFiles"]
        size_bytes = detail["sizeInBytes"]
        result["files_before"] = files_before

        log.info(f"[{table_name}] {files_before} files, {size_bytes / 1024 / 1024:.1f} MB")

        if DRY_RUN:
            log.info(f"[{table_name}] DRY RUN — skipping actual compaction")
            result["status"] = "dry_run"
            return result

        # Compact: read and rewrite with target file size
        target_bytes = COMPACT_TARGET_SIZE_MB * 1024 * 1024
        target_partitions = max(1, int(size_bytes / target_bytes))

        df = spark.read.format("delta").load(path)
        df.repartition(target_partitions).write.format("delta").mode("overwrite").option("overwriteSchema", "false").save(path)

        # Vacuum old snapshots
        dt.vacuum(VACUUM_RETAIN_HOURS)

        detail_after = dt.detail().collect()[0]
        result["files_after"] = detail_after["numFiles"]
        result["status"] = "compacted"
        log.info(f"[{table_name}] Compacted: {files_before} → {result['files_after']} files")

    except Exception as e:
        log.error(f"[{table_name}] Compaction failed: {e}")
        result["status"] = "error"
        result["error"] = str(e)

    return result


def main():
    log.info(f"=== PayGate Delta Lake Compaction Job ===")
    log.info(f"Bucket: s3a://{S3_BUCKET}")
    log.info(f"Tables: {TABLES}")
    log.info(f"Vacuum retain: {VACUUM_RETAIN_HOURS}h | Target file size: {COMPACT_TARGET_SIZE_MB}MB | Dry run: {DRY_RUN}")

    spark = get_spark()
    results = []
    start = datetime.utcnow()

    for table in TABLES:
        result = compact_table(spark, table)
        results.append(result)

    elapsed = (datetime.utcnow() - start).total_seconds()
    log.info(f"=== Compaction complete in {elapsed:.1f}s ===")
    for r in results:
        status_icon = "✓" if r["status"] == "compacted" else "○" if r["status"] == "dry_run" else "✗"
        log.info(f"  {status_icon} {r['table']}: {r['status']}")

    spark.stop()
    errors = [r for r in results if r["status"] == "error"]
    if errors:
        log.error(f"{len(errors)} table(s) failed compaction")
        sys.exit(1)


if __name__ == "__main__":
    main()
