"""
PayGate NextHub — Temporal Worker Entrypoint
=============================================
Registers all NextHub workflows and activities with a Temporal server.

Environment variables:
  TEMPORAL_HOST_PORT   — e.g. "temporal.internal:7233" (default: "localhost:7233")
  TEMPORAL_NAMESPACE   — e.g. "nexthub-production" (default: "default")
  TEMPORAL_TASK_QUEUE  — e.g. "nexthub-srbe" (default: "nexthub-srbe")
  PG_DATABASE_URL      — PostgreSQL connection string for activity DB access
  S3_BUCKET            — S3 bucket for Lakehouse Parquet writes and invoice PDFs
  AWS_REGION           — AWS region for S3
  SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS — SMTP for DFSP notifications
  TIGERBEETLE_ADDRESS  — TigerBeetle cluster address for billing invoice posting

Usage:
  python -m nexthub.temporal.worker
"""

import asyncio
import logging
import os
import signal
from typing import Any

from temporalio.client import Client, TLSConfig
from temporalio.worker import Worker

# ── Workflow imports ──────────────────────────────────────────────────────────
from nexthub.temporal.workflows.reconciliation import ReconciliationWorkflow
from nexthub.temporal.workflows.billing import MonthlyBillingWorkflow
from nexthub.temporal.workflows.aml_str import SuspiciousTransactionReportWorkflow
from nexthub.temporal.workflows.dispute import DisputeResolutionWorkflow
from nexthub.temporal.workflows.dfsp_cert_rotation import DfspCertRotationWorkflow

# ── Activity imports ──────────────────────────────────────────────────────────
from nexthub.temporal.activities.reconciliation_activities import (
    fetch_hub_records,
    fetch_rail_records,
    compute_breaks,
    write_reconciliation_report,
    auto_resolve_timing_breaks,
    escalate_unresolved_breaks,
)
from nexthub.temporal.activities.billing_activities import (
    aggregate_fee_postings,
    generate_invoice_pdf,
    upload_invoice_to_s3,
    notify_dfsp_invoice_ready,
    post_tigerbeetle_invoice_transfer,
    mark_invoice_issued,
)
from nexthub.temporal.activities.aml_activities import (
    evaluate_aml_rules,
    create_aml_alert,
    file_str_report,
    notify_compliance_officer,
)
from nexthub.temporal.activities.dispute_activities import (
    fetch_dispute_evidence,
    evaluate_dispute_outcome,
    post_reversal_transfer,
    post_penalty_billing,
    notify_dispute_parties,
)
from nexthub.temporal.activities.cert_activities import (
    generate_dfsp_certificate,
    revoke_old_certificate,
    update_apisix_cert,
    notify_dfsp_cert_rotated,
)

logger = logging.getLogger(__name__)

TASK_QUEUE = os.getenv("TEMPORAL_TASK_QUEUE", "nexthub-srbe")
TEMPORAL_HOST = os.getenv("TEMPORAL_HOST_PORT", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "default")


async def run_worker() -> None:
    """Connect to Temporal and run the NextHub worker until interrupted."""
    logger.info(
        "Connecting to Temporal at %s namespace=%s queue=%s",
        TEMPORAL_HOST,
        TEMPORAL_NAMESPACE,
        TASK_QUEUE,
    )

    # Build TLS config if certs are provided (production)
    tls: TLSConfig | None = None
    client_cert_path = os.getenv("TEMPORAL_CLIENT_CERT")
    client_key_path = os.getenv("TEMPORAL_CLIENT_KEY")
    server_root_ca_path = os.getenv("TEMPORAL_SERVER_ROOT_CA")
    if client_cert_path and client_key_path:
        with open(client_cert_path, "rb") as f:
            client_cert = f.read()
        with open(client_key_path, "rb") as f:
            client_key = f.read()
        server_root_ca = None
        if server_root_ca_path:
            with open(server_root_ca_path, "rb") as f:
                server_root_ca = f.read()
        tls = TLSConfig(
            client_cert=client_cert,
            client_private_key=client_key,
            server_root_ca_cert=server_root_ca,
        )

    client = await Client.connect(
        TEMPORAL_HOST,
        namespace=TEMPORAL_NAMESPACE,
        tls=tls,
    )

    # All workflows registered in this worker
    workflows = [
        ReconciliationWorkflow,
        MonthlyBillingWorkflow,
        SuspiciousTransactionReportWorkflow,
        DisputeResolutionWorkflow,
        DfspCertRotationWorkflow,
    ]

    # All activities registered in this worker
    activities = [
        # Reconciliation
        fetch_hub_records,
        fetch_rail_records,
        compute_breaks,
        write_reconciliation_report,
        auto_resolve_timing_breaks,
        escalate_unresolved_breaks,
        # Billing
        aggregate_fee_postings,
        generate_invoice_pdf,
        upload_invoice_to_s3,
        notify_dfsp_invoice_ready,
        post_tigerbeetle_invoice_transfer,
        mark_invoice_issued,
        # AML
        evaluate_aml_rules,
        create_aml_alert,
        file_str_report,
        notify_compliance_officer,
        # Dispute
        fetch_dispute_evidence,
        evaluate_dispute_outcome,
        post_reversal_transfer,
        post_penalty_billing,
        notify_dispute_parties,
        # Certificate rotation
        generate_dfsp_certificate,
        revoke_old_certificate,
        update_apisix_cert,
        notify_dfsp_cert_rotated,
    ]

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=workflows,
        activities=activities,
        # Concurrency limits — tune for your pod resources
        max_concurrent_activities=50,
        max_concurrent_workflow_tasks=100,
    )

    logger.info("NextHub Temporal worker started on queue '%s'", TASK_QUEUE)

    # Graceful shutdown on SIGTERM / SIGINT
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _handle_signal(*_: Any) -> None:
        logger.info("Shutdown signal received — draining worker…")
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_signal)

    async with worker:
        await stop_event.wait()

    logger.info("NextHub Temporal worker stopped cleanly")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
