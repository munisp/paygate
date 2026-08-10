"""
PayGate NextHub — Temporal MonthlyBillingWorkflow
=================================================
Orchestrates the 5-step monthly billing pipeline for a DFSP:

  1. AggregateFeePostings      — sum scheme fees, interchange, FX markup, penalties
  2. GenerateInvoicePDF        — render PDF invoice using ReportLab
  3. UploadInvoiceToS3         — store PDF in S3 and get public URL
  4. NotifyDfspInvoiceReady    — send email to DFSP billing contact
  5. PostTigerBeetleTransfer   — post the invoice amount as a TigerBeetle transfer
  6. MarkInvoiceIssued         — update DB invoice status to 'issued'

Workflow is idempotent: re-running for the same (dfsp_id, period_start) is safe.

Trigger via tRPC: nexthubBilling.triggerMonthlyBilling({ dfspId, periodStart, periodEnd })
"""

from datetime import timedelta, datetime
from dataclasses import dataclass, field
from typing import Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from nexthub.temporal.activities.billing_activities import (
        aggregate_fee_postings,
        generate_invoice_pdf,
        upload_invoice_to_s3,
        notify_dfsp_invoice_ready,
        post_tigerbeetle_invoice_transfer,
        mark_invoice_issued,
    )


# ── Input / Output dataclasses ────────────────────────────────────────────────

@dataclass
class BillingInput:
    dfsp_id: str
    period_start_ms: int          # UTC epoch milliseconds
    period_end_ms: int            # UTC epoch milliseconds
    currency: str = "NGN"
    invoice_id: Optional[str] = None   # pre-created DB invoice ID (optional)
    dry_run: bool = False              # if True, skip TigerBeetle posting


@dataclass
class FeeSummary:
    scheme_fee_minor: int = 0
    interchange_minor: int = 0
    fx_markup_minor: int = 0
    penalty_minor: int = 0
    total_minor: int = 0
    transaction_count: int = 0


@dataclass
class BillingResult:
    dfsp_id: str
    invoice_id: str
    period_start_ms: int
    period_end_ms: int
    fee_summary: FeeSummary = field(default_factory=FeeSummary)
    pdf_s3_key: Optional[str] = None
    pdf_url: Optional[str] = None
    tigerbeetle_transfer_id: Optional[str] = None
    status: str = "COMPLETED"     # COMPLETED | DRY_RUN | FAILED


# ── Retry policies ────────────────────────────────────────────────────────────

_DB_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=1.5,
    maximum_interval=timedelta(minutes=2),
    maximum_attempts=10,
)

_IO_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)

_TIGERBEETLE_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=1),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=1),
    maximum_attempts=3,
    # Do NOT retry on duplicate transfer errors — TigerBeetle is idempotent
    # by transfer ID, so a duplicate will succeed silently on retry.
)


@workflow.defn(name="MonthlyBillingWorkflow")
class MonthlyBillingWorkflow:
    """
    Durable monthly billing pipeline for a single DFSP.

    Timeline:
      - Total timeout: 2 hours
      - PDF generation: up to 10 minutes (large invoices)
      - TigerBeetle posting: up to 1 minute with 3 retries
    """

    @workflow.run
    async def run(self, input: BillingInput) -> BillingResult:
        period_start = datetime.utcfromtimestamp(input.period_start_ms / 1000).strftime("%Y-%m")
        workflow.logger.info(
            "MonthlyBillingWorkflow started: dfsp=%s period=%s dry_run=%s",
            input.dfsp_id,
            period_start,
            input.dry_run,
        )

        # ── Step 1: Aggregate fee postings ────────────────────────────────────
        fee_summary_dict = await workflow.execute_activity(
            aggregate_fee_postings,
            args=[input.dfsp_id, input.period_start_ms, input.period_end_ms, input.currency],
            start_to_close_timeout=timedelta(minutes=15),
            retry_policy=_DB_RETRY,
        )
        fee_summary = FeeSummary(**fee_summary_dict)
        workflow.logger.info(
            "Aggregated fees for %s: total=%d minor (%s)",
            input.dfsp_id,
            fee_summary.total_minor,
            input.currency,
        )

        # ── Step 2: Generate PDF invoice ──────────────────────────────────────
        pdf_bytes_b64 = await workflow.execute_activity(
            generate_invoice_pdf,
            args=[
                input.dfsp_id,
                input.period_start_ms,
                input.period_end_ms,
                fee_summary_dict,
                input.currency,
                input.invoice_id,
            ],
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=_IO_RETRY,
            heartbeat_timeout=timedelta(minutes=2),
        )
        workflow.logger.info("Generated PDF invoice for %s", input.dfsp_id)

        # ── Step 3: Upload PDF to S3 ──────────────────────────────────────────
        upload_result = await workflow.execute_activity(
            upload_invoice_to_s3,
            args=[input.dfsp_id, input.period_start_ms, pdf_bytes_b64],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_IO_RETRY,
        )
        pdf_s3_key: str = upload_result["key"]
        pdf_url: str = upload_result["url"]
        workflow.logger.info("Uploaded invoice PDF to S3: %s", pdf_s3_key)

        # ── Step 4: Notify DFSP ───────────────────────────────────────────────
        await workflow.execute_activity(
            notify_dfsp_invoice_ready,
            args=[input.dfsp_id, pdf_url, input.period_start_ms, fee_summary.total_minor, input.currency],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_IO_RETRY,
        )
        workflow.logger.info("Notified DFSP %s of invoice availability", input.dfsp_id)

        # ── Step 5: Post TigerBeetle invoice transfer (skip if dry run) ───────
        tigerbeetle_transfer_id: Optional[str] = None
        if not input.dry_run and fee_summary.total_minor > 0:
            tigerbeetle_transfer_id = await workflow.execute_activity(
                post_tigerbeetle_invoice_transfer,
                args=[
                    input.dfsp_id,
                    fee_summary.total_minor,
                    input.currency,
                    input.invoice_id,
                    input.period_start_ms,
                ],
                start_to_close_timeout=timedelta(minutes=1),
                retry_policy=_TIGERBEETLE_RETRY,
            )
            workflow.logger.info(
                "Posted TigerBeetle invoice transfer %s for DFSP %s",
                tigerbeetle_transfer_id,
                input.dfsp_id,
            )

        # ── Step 6: Mark invoice as issued in DB ──────────────────────────────
        invoice_id = await workflow.execute_activity(
            mark_invoice_issued,
            args=[
                input.dfsp_id,
                input.period_start_ms,
                input.period_end_ms,
                fee_summary_dict,
                pdf_s3_key,
                pdf_url,
                tigerbeetle_transfer_id,
                input.invoice_id,
            ],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_DB_RETRY,
        )

        result = BillingResult(
            dfsp_id=input.dfsp_id,
            invoice_id=invoice_id,
            period_start_ms=input.period_start_ms,
            period_end_ms=input.period_end_ms,
            fee_summary=fee_summary,
            pdf_s3_key=pdf_s3_key,
            pdf_url=pdf_url,
            tigerbeetle_transfer_id=tigerbeetle_transfer_id,
            status="DRY_RUN" if input.dry_run else "COMPLETED",
        )

        workflow.logger.info(
            "MonthlyBillingWorkflow completed: dfsp=%s invoice=%s total=%d %s",
            input.dfsp_id,
            invoice_id,
            fee_summary.total_minor,
            input.currency,
        )
        return result
