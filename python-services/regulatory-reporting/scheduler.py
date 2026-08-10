"""
scheduler.py — Automated CBN Regulatory Report Scheduler

Runs background tasks to:
  - Generate and submit CBN Form A on the 5th of each month (deadline: 10th)
  - Generate and submit CBN Form B on the 25th of each quarter end month
  - Generate and submit CBN Form C on January 15th each year
  - Check for STRs pending NFIU submission and retry failed ones
  - Alert compliance officer if any report is approaching its deadline

All report submissions are idempotent — duplicate runs are detected via
the report_id field which encodes merchant_id + period.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

PORTAL_URL = os.getenv("PORTAL_TRPC_URL", "http://localhost:3000")
INTERNAL_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")
CHECK_INTERVAL_SECONDS = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "3600"))  # 1 hour


async def start_scheduler() -> None:
    """Main scheduler loop — runs indefinitely."""
    logger.info("Regulatory report scheduler started")
    while True:
        try:
            await run_scheduled_tasks()
        except Exception as exc:
            logger.error(f"Scheduler error: {exc}")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


async def run_scheduled_tasks() -> None:
    """Run all scheduled tasks for the current time."""
    now = datetime.now(timezone.utc)
    day = now.day
    month = now.month

    # CBN Form A: generate on 5th of each month for previous month
    if day == 5:
        await trigger_form_a_generation(now)

    # CBN Form B: generate on 25th of March, June, September, December
    if day == 25 and month in (3, 6, 9, 12):
        await trigger_form_b_generation(now)

    # CBN Form C: generate on January 15th for previous year
    if day == 15 and month == 1:
        await trigger_form_c_generation(now)

    # Always: check for pending STRs and retry failed submissions
    await retry_pending_strs()

    # Always: check for approaching deadlines and alert
    await check_deadline_alerts(now)


async def trigger_form_a_generation(now: datetime) -> None:
    """Trigger Form A generation for the previous month."""
    prev_month = now.month - 1
    year = now.year
    if prev_month == 0:
        prev_month = 12
        year -= 1
    period = f"{year}-{prev_month:02d}"

    logger.info(f"Triggering CBN Form A generation for period={period}")
    await call_portal_internal("/api/internal/regulatory/generate-form-a", {"period": period})


async def trigger_form_b_generation(now: datetime) -> None:
    """Trigger Form B generation for the current quarter."""
    quarter_map = {3: "Q1", 6: "Q2", 9: "Q3", 12: "Q4"}
    quarter = quarter_map.get(now.month, "Q4")
    period = f"{now.year}-{quarter}"

    logger.info(f"Triggering CBN Form B generation for quarter={period}")
    await call_portal_internal("/api/internal/regulatory/generate-form-b", {"quarter": period})


async def trigger_form_c_generation(now: datetime) -> None:
    """Trigger Form C generation for the previous year."""
    year = now.year - 1
    logger.info(f"Triggering CBN Form C generation for year={year}")
    await call_portal_internal("/api/internal/regulatory/generate-form-c", {"year": year})


async def retry_pending_strs() -> None:
    """Retry STRs that failed NFIU submission."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{PORTAL_URL}/api/internal/regulatory/pending-strs",
                headers={"X-Internal-Key": INTERNAL_KEY},
            )
        if response.status_code == 200:
            pending = response.json().get("strs", [])
            if pending:
                logger.info(f"Found {len(pending)} pending STRs to retry")
                for str_record in pending:
                    await call_portal_internal(
                        "/api/internal/regulatory/retry-str",
                        {"str_id": str_record["id"]},
                    )
    except Exception as exc:
        logger.warning(f"Failed to check pending STRs: {exc}")


async def check_deadline_alerts(now: datetime) -> None:
    """Alert compliance officer if any report deadline is approaching within 3 days."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{PORTAL_URL}/api/internal/regulatory/upcoming-deadlines",
                headers={"X-Internal-Key": INTERNAL_KEY},
                params={"days_ahead": 3},
            )
        if response.status_code == 200:
            deadlines = response.json().get("deadlines", [])
            for deadline in deadlines:
                logger.warning(
                    f"Regulatory deadline approaching: "
                    f"form={deadline.get('form_type')} "
                    f"due={deadline.get('due_date')} "
                    f"merchant={deadline.get('merchant_id')}"
                )
    except Exception as exc:
        logger.debug(f"Deadline check skipped: {exc}")


async def call_portal_internal(path: str, body: dict) -> None:
    """Call a portal internal API endpoint."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{PORTAL_URL}{path}",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Key": INTERNAL_KEY,
                },
            )
        if response.status_code >= 300:
            logger.error(f"Portal internal call failed: {path} HTTP {response.status_code}")
        else:
            logger.info(f"Portal internal call succeeded: {path}")
    except Exception as exc:
        logger.error(f"Portal internal call error: {path} {exc}")
