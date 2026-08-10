"""
middleware/python/str/temporal_activities.py
Temporal activity stubs for STR submission workflows.
Activities: submit_str_to_nfiu, retry_str_submission, escalate_overdue_str,
            poll_nfiu_acknowledgement, notify_compliance_officer.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker

from goaml_client import get_client

logger = logging.getLogger("paygate.str.temporal")

TEMPORAL_HOST = os.getenv("TEMPORAL_HOST_PORT", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = "str-submission"

# ─── Activities ───────────────────────────────────────────────────────────────

@activity.defn(name="submit_str_to_nfiu")
async def submit_str_to_nfiu(
    str_id: str,
    merchant_id: str,
    report_ref: str,
    payload: dict,
) -> dict:
    """Submit an STR to NFIU goAML. Returns goAML response."""
    activity.logger.info(f"Submitting STR {str_id} to NFIU goAML")
    client = await get_client()
    result = await client.submit_str(str_id, merchant_id, report_ref, payload)
    activity.logger.info(f"STR {str_id} submitted: nfiuRef={result.get('nfiuRef')}")
    return result


@activity.defn(name="poll_nfiu_acknowledgement")
async def poll_nfiu_acknowledgement(nfiu_ref: str) -> str:
    """Poll NFIU for STR acknowledgement. Returns status string."""
    activity.logger.info(f"Polling NFIU acknowledgement for {nfiu_ref}")
    client = await get_client()
    status = await client.poll_status(nfiu_ref)
    activity.logger.info(f"NFIU status for {nfiu_ref}: {status}")
    return status


@activity.defn(name="retry_str_submission")
async def retry_str_submission(
    str_id: str,
    merchant_id: str,
    report_ref: str,
    payload: dict,
    attempt: int,
) -> dict:
    """Retry STR submission after a failure. Includes exponential backoff."""
    wait_seconds = min(30 * (2 ** attempt), 3600)  # max 1 hour
    activity.logger.info(f"Retrying STR {str_id} submission (attempt {attempt}, wait {wait_seconds}s)")
    await asyncio.sleep(wait_seconds)
    client = await get_client()
    return await client.submit_str(str_id, merchant_id, report_ref, payload)


@activity.defn(name="escalate_overdue_str")
async def escalate_overdue_str(
    str_id: str,
    merchant_id: str,
    due_at: str,
    hours_overdue: int,
) -> dict:
    """Escalate an overdue STR to the compliance officer."""
    activity.logger.warning(
        f"STR {str_id} is {hours_overdue}h overdue (due: {due_at}). Escalating."
    )
    bridge_url = os.getenv("MIDDLEWARE_BRIDGE_URL", "")
    if bridge_url:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as http:
            await http.post(
                f"{bridge_url}/internal/str/escalate",
                json={
                    "strId": str_id,
                    "merchantId": merchant_id,
                    "dueAt": due_at,
                    "hoursOverdue": hours_overdue,
                    "escalatedAt": datetime.now(timezone.utc).isoformat(),
                },
                headers={"X-Internal-Key": os.getenv("MIDDLEWARE_INTERNAL_KEY", "")},
            )
    return {"escalated": True, "strId": str_id, "hoursOverdue": hours_overdue}


@activity.defn(name="notify_compliance_officer")
async def notify_compliance_officer(
    str_id: str,
    merchant_id: str,
    event_type: str,
    details: dict,
) -> bool:
    """Send a notification to the compliance officer via the owner notification API."""
    bridge_url = os.getenv("MIDDLEWARE_BRIDGE_URL", "")
    if not bridge_url:
        return False
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.post(
                f"{bridge_url}/internal/notify",
                json={
                    "channel": "compliance",
                    "title": f"STR Alert: {event_type}",
                    "content": f"STR {str_id} for merchant {merchant_id}: {event_type}. Details: {details}",
                    "priority": "high",
                },
                headers={"X-Internal-Key": os.getenv("MIDDLEWARE_INTERNAL_KEY", "")},
            )
            return resp.status_code < 300
    except Exception as e:
        activity.logger.warning(f"Compliance notification failed: {e}")
        return False


# ─── Workflow ─────────────────────────────────────────────────────────────────

@workflow.defn(name="STRSubmissionWorkflow")
class STRSubmissionWorkflow:
    """
    Durable workflow for STR submission with retry and escalation.
    Steps:
      1. Submit to NFIU goAML
      2. Poll for acknowledgement (up to 72h)
      3. Retry on failure (up to 3 times)
      4. Escalate if overdue
    """

    @workflow.run
    async def run(self, params: dict) -> dict:
        str_id = params["strId"]
        merchant_id = params["merchantId"]
        report_ref = params["reportRef"]
        payload = params.get("payload", {})
        due_at = params.get("dueAt")

        # Step 1: Submit
        result = await workflow.execute_activity(
            submit_str_to_nfiu,
            args=[str_id, merchant_id, report_ref, payload],
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=workflow.RetryPolicy(maximum_attempts=3),
        )
        nfiu_ref = result.get("nfiuRef")

        if not nfiu_ref:
            return {"status": "failed", "strId": str_id}

        # Step 2: Poll for acknowledgement (check every 4h for up to 72h)
        for _ in range(18):  # 18 × 4h = 72h
            await asyncio.sleep(0)  # yield to Temporal
            status = await workflow.execute_activity(
                poll_nfiu_acknowledgement,
                args=[nfiu_ref],
                start_to_close_timeout=timedelta(seconds=30),
            )
            if status == "acknowledged":
                await workflow.execute_activity(
                    notify_compliance_officer,
                    args=[str_id, merchant_id, "str_acknowledged", {"nfiuRef": nfiu_ref}],
                    start_to_close_timeout=timedelta(seconds=10),
                )
                return {"status": "acknowledged", "strId": str_id, "nfiuRef": nfiu_ref}
            elif status == "rejected":
                await workflow.execute_activity(
                    notify_compliance_officer,
                    args=[str_id, merchant_id, "str_rejected", {"nfiuRef": nfiu_ref}],
                    start_to_close_timeout=timedelta(seconds=10),
                )
                return {"status": "rejected", "strId": str_id, "nfiuRef": nfiu_ref}
            # Wait 4 hours before next poll
            await workflow.sleep(timedelta(hours=4))

        # Step 3: Escalate if still not acknowledged after 72h
        await workflow.execute_activity(
            escalate_overdue_str,
            args=[str_id, merchant_id, due_at or "", 72],
            start_to_close_timeout=timedelta(seconds=30),
        )
        return {"status": "escalated", "strId": str_id, "nfiuRef": nfiu_ref}


# ─── Worker entrypoint ────────────────────────────────────────────────────────

async def main():
    client = await Client.connect(TEMPORAL_HOST, namespace=TEMPORAL_NAMESPACE)
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[STRSubmissionWorkflow],
        activities=[
            submit_str_to_nfiu,
            poll_nfiu_acknowledgement,
            retry_str_submission,
            escalate_overdue_str,
            notify_compliance_officer,
        ],
    )
    logger.info(f"STR Temporal worker started on task queue: {TASK_QUEUE}")
    await worker.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
