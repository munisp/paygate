"""
Mojaloop Temporal Activity Stubs
==================================
Temporal activities for post-transfer workflows:
  - Send receipt email to payer
  - Update merchant ledger balance
  - Trigger settlement reconciliation
  - Write to Lakehouse for reporting
"""
import logging
import os
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker

from models import TransferCompletedEvent

logger = logging.getLogger(__name__)

TEMPORAL_HOST = os.getenv("TEMPORAL_HOST_PORT", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "paygate")
TASK_QUEUE = "mojaloop-transfers"


# ─── Activities ───────────────────────────────────────────────────────────────

@activity.defn(name="send_transfer_receipt")
async def send_transfer_receipt(transfer_id: str, merchant_id: str, amount: str, currency: str) -> bool:
    """Send a payment receipt email/notification to the merchant and payer."""
    logger.info("Sending transfer receipt: transfer_id=%s merchant_id=%s", transfer_id, merchant_id)
    # In production: call SMTP/Termii/notification service
    return True


@activity.defn(name="update_merchant_ledger")
async def update_merchant_ledger(transfer_id: str, merchant_id: str, amount: str, currency: str) -> bool:
    """Update the merchant's available balance in the application ledger."""
    logger.info("Updating merchant ledger: transfer_id=%s merchant_id=%s amount=%s %s",
                transfer_id, merchant_id, amount, currency)
    # In production: call internal balance API or TigerBeetle directly
    return True


@activity.defn(name="trigger_settlement_recon")
async def trigger_settlement_recon(transfer_id: str, merchant_id: str) -> bool:
    """Trigger settlement reconciliation for the completed transfer."""
    logger.info("Triggering settlement recon: transfer_id=%s", transfer_id)
    # In production: publish to settlement Kafka topic
    return True


@activity.defn(name="write_transfer_to_lakehouse")
async def write_transfer_to_lakehouse(transfer_data: dict) -> bool:
    """Write the completed transfer record to the Lakehouse (S3 Parquet)."""
    logger.info("Writing transfer to Lakehouse: transfer_id=%s", transfer_data.get("transfer_id"))
    # In production: use pyarrow + boto3 to write Parquet to S3
    return True


# ─── Workflow ─────────────────────────────────────────────────────────────────

@workflow.defn(name="MojaloopTransferWorkflow")
class MojaloopTransferWorkflow:
    """Orchestrates post-transfer activities after a Mojaloop transfer completes."""

    @workflow.run
    async def run(self, transfer_id: str, merchant_id: str, amount: str, currency: str) -> str:
        # 1. Send receipt
        await workflow.execute_activity(
            send_transfer_receipt,
            args=[transfer_id, merchant_id, amount, currency],
            start_to_close_timeout=timedelta(seconds=30),
        )
        # 2. Update merchant ledger
        await workflow.execute_activity(
            update_merchant_ledger,
            args=[transfer_id, merchant_id, amount, currency],
            start_to_close_timeout=timedelta(seconds=30),
        )
        # 3. Settlement reconciliation
        await workflow.execute_activity(
            trigger_settlement_recon,
            args=[transfer_id, merchant_id],
            start_to_close_timeout=timedelta(seconds=30),
        )
        # 4. Lakehouse write
        await workflow.execute_activity(
            write_transfer_to_lakehouse,
            args=[{"transfer_id": transfer_id, "merchant_id": merchant_id,
                   "amount": amount, "currency": currency}],
            start_to_close_timeout=timedelta(seconds=60),
        )
        return f"transfer:{transfer_id}:completed"


# ─── Trigger helper ───────────────────────────────────────────────────────────

async def trigger_transfer_workflow(event: TransferCompletedEvent):
    """Connect to Temporal and start a MojaloopTransferWorkflow."""
    client = await Client.connect(TEMPORAL_HOST, namespace=TEMPORAL_NAMESPACE)
    await client.start_workflow(
        MojaloopTransferWorkflow.run,
        args=[event.transfer_id, event.merchant_id, event.amount, event.currency],
        id=f"mojaloop-transfer-{event.transfer_id}",
        task_queue=TASK_QUEUE,
    )
    logger.info("Temporal workflow started for transfer %s", event.transfer_id)
