"""
PayGate NextHub — Temporal ReconciliationWorkflow
==================================================
Orchestrates the 4-step reconciliation pipeline for a settlement window:

  1. FetchHubRecords   — pull all transfers from the hub PostgreSQL database
  2. FetchRailRecords  — pull corresponding records from the payment rail (NIBSS / Mojaloop)
  3. ComputeBreaks     — diff hub vs rail, classify breaks, compute SLA deadlines
  4. WriteReport       — persist exceptions to DB + write Parquet to Lakehouse

Workflow is idempotent: re-running for the same windowId is safe (upserts on
reconciliation_exceptions using (window_id, hub_transfer_id) as the unique key).

Trigger via tRPC: nexthubReconciliation.triggerReconciliation({ windowId })
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

# Import activities using the late-binding pattern required by Temporal Python SDK
with workflow.unsafe.imports_passed_through():
    from nexthub.temporal.activities.reconciliation_activities import (
        fetch_hub_records,
        fetch_rail_records,
        compute_breaks,
        write_reconciliation_report,
        auto_resolve_timing_breaks,
        escalate_unresolved_breaks,
    )


# ── Input / Output dataclasses ────────────────────────────────────────────────

@dataclass
class ReconciliationInput:
    window_id: str
    currency: str = "NGN"
    rail: str = "NIBSS_NIP"          # NIBSS_NIP | MOJALOOP | RTGS
    auto_resolve: bool = True
    lakehouse_bucket: Optional[str] = None


@dataclass
class ReconciliationResult:
    window_id: str
    hub_record_count: int
    rail_record_count: int
    break_count: int
    auto_resolved_count: int
    escalated_count: int
    report_s3_key: Optional[str]
    status: str                       # COMPLETED | FAILED | PARTIAL


# ── Retry policy for external I/O activities ──────────────────────────────────

_IO_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)

_DB_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=1.5,
    maximum_interval=timedelta(minutes=2),
    maximum_attempts=10,
)


@workflow.defn(name="ReconciliationWorkflow")
class ReconciliationWorkflow:
    """
    Durable reconciliation pipeline for a single settlement window.

    Timeline:
      - Total timeout: 4 hours (DNS End-of-Day windows can be large)
      - Each activity: up to 30 minutes with retry
      - Heartbeat: every 60 seconds from long-running activities
    """

    @workflow.run
    async def run(self, input: ReconciliationInput) -> ReconciliationResult:
        workflow.logger.info(
            "ReconciliationWorkflow started: window_id=%s rail=%s",
            input.window_id,
            input.rail,
        )

        # ── Step 1: Fetch hub records ─────────────────────────────────────────
        hub_records = await workflow.execute_activity(
            fetch_hub_records,
            args=[input.window_id, input.currency],
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=_DB_RETRY,
        )
        workflow.logger.info(
            "Fetched %d hub records for window %s",
            len(hub_records),
            input.window_id,
        )

        # ── Step 2: Fetch rail records ────────────────────────────────────────
        rail_records = await workflow.execute_activity(
            fetch_rail_records,
            args=[input.window_id, input.rail, input.currency],
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=_IO_RETRY,
        )
        workflow.logger.info(
            "Fetched %d rail records for window %s from %s",
            len(rail_records),
            input.window_id,
            input.rail,
        )

        # ── Step 3: Compute breaks ────────────────────────────────────────────
        breaks = await workflow.execute_activity(
            compute_breaks,
            args=[input.window_id, hub_records, rail_records],
            start_to_close_timeout=timedelta(minutes=15),
            retry_policy=_DB_RETRY,
        )
        workflow.logger.info(
            "Computed %d breaks for window %s",
            len(breaks),
            input.window_id,
        )

        # ── Step 4: Write report to DB + Lakehouse ────────────────────────────
        report_key = await workflow.execute_activity(
            write_reconciliation_report,
            args=[input.window_id, breaks, input.lakehouse_bucket],
            start_to_close_timeout=timedelta(minutes=20),
            retry_policy=_DB_RETRY,
        )

        # ── Step 5 (optional): Auto-resolve timing breaks ─────────────────────
        auto_resolved_count = 0
        if input.auto_resolve:
            auto_resolved_count = await workflow.execute_activity(
                auto_resolve_timing_breaks,
                args=[input.window_id],
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=_DB_RETRY,
            )
            workflow.logger.info(
                "Auto-resolved %d timing breaks for window %s",
                auto_resolved_count,
                input.window_id,
            )

        # ── Step 6: Escalate breaks past SLA ─────────────────────────────────
        escalated_count = await workflow.execute_activity(
            escalate_unresolved_breaks,
            args=[input.window_id],
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=_DB_RETRY,
        )

        result = ReconciliationResult(
            window_id=input.window_id,
            hub_record_count=len(hub_records),
            rail_record_count=len(rail_records),
            break_count=len(breaks),
            auto_resolved_count=auto_resolved_count,
            escalated_count=escalated_count,
            report_s3_key=report_key,
            status="COMPLETED",
        )

        workflow.logger.info(
            "ReconciliationWorkflow completed: window=%s breaks=%d auto_resolved=%d escalated=%d",
            input.window_id,
            len(breaks),
            auto_resolved_count,
            escalated_count,
        )
        return result
