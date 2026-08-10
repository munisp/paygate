"""
temporal_activities.py — Temporal workflow/activity stubs for terminal events.

Triggers Temporal workflows for:
  - txn_completed → TerminalSettlementWorkflow (T+0 settlement)
  - txn_failed    → TerminalRetryWorkflow (retry with exponential backoff)
  - refunded      → TerminalRefundWorkflow (reverse settlement, notify merchant)

Uses the Temporal HTTP API (temporal-http-bridge) to start workflows without
requiring the Temporal Python SDK to be installed in this service.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger("terminal.temporal_activities")

TEMPORAL_BRIDGE_URL = os.getenv("TEMPORAL_BRIDGE_URL", "http://localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "paygate")
TEMPORAL_TASK_QUEUE = "terminal-workflows"
INTERNAL_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")


class TerminalTemporalStub:
    """Triggers Temporal workflows for terminal events via the HTTP bridge."""

    def __init__(self):
        self._http = httpx.AsyncClient(timeout=10.0)

    async def trigger(self, event: Any) -> None:
        """Dispatch the event to the appropriate Temporal workflow."""
        event_type = event.event_type
        if event_type == "txn_completed":
            await self._start_settlement_workflow(event)
        elif event_type == "txn_failed":
            await self._start_retry_workflow(event)
        elif event_type == "refunded":
            await self._start_refund_workflow(event)

    async def _start_settlement_workflow(self, event: Any) -> None:
        payload = event.payload
        workflow_id = f"terminal-settlement-{payload.get('transaction_id', event.event_id)}"
        await self._start_workflow(
            workflow_type="TerminalSettlementWorkflow",
            workflow_id=workflow_id,
            input={
                "event_id": event.event_id,
                "terminal_id": event.terminal_id,
                "merchant_id": event.merchant_id,
                "tenant_id": event.tenant_id,
                "transaction_id": payload.get("transaction_id"),
                "amount_kobo": payload.get("amount_kobo"),
                "currency": payload.get("currency", "NGN"),
                "reference": payload.get("reference"),
                "payment_method": payload.get("payment_method"),
                "card_brand": payload.get("card_brand"),
                "card_last4": payload.get("card_last4"),
                "auth_code": payload.get("auth_code"),
                "rrn": payload.get("rrn"),
                "timestamp": event.timestamp,
            },
        )

    async def _start_retry_workflow(self, event: Any) -> None:
        payload = event.payload
        workflow_id = f"terminal-retry-{payload.get('transaction_id', event.event_id)}"
        await self._start_workflow(
            workflow_type="TerminalRetryWorkflow",
            workflow_id=workflow_id,
            input={
                "event_id": event.event_id,
                "terminal_id": event.terminal_id,
                "merchant_id": event.merchant_id,
                "transaction_id": payload.get("transaction_id"),
                "response_code": payload.get("response_code"),
                "amount_kobo": payload.get("amount_kobo"),
                "currency": payload.get("currency", "NGN"),
                "timestamp": event.timestamp,
            },
        )

    async def _start_refund_workflow(self, event: Any) -> None:
        payload = event.payload
        workflow_id = f"terminal-refund-{payload.get('refund_id', event.event_id)}"
        await self._start_workflow(
            workflow_type="TerminalRefundWorkflow",
            workflow_id=workflow_id,
            input={
                "event_id": event.event_id,
                "terminal_id": event.terminal_id,
                "merchant_id": event.merchant_id,
                "refund_id": payload.get("refund_id"),
                "original_txn_id": payload.get("original_txn_id"),
                "amount_kobo": payload.get("amount_kobo"),
                "currency": payload.get("currency", "NGN"),
                "reference": payload.get("reference"),
                "timestamp": event.timestamp,
            },
        )

    async def _start_workflow(
        self,
        workflow_type: str,
        workflow_id: str,
        input: dict,
    ) -> None:
        """Start a Temporal workflow via the HTTP bridge."""
        body = {
            "namespace": TEMPORAL_NAMESPACE,
            "workflow_type": workflow_type,
            "workflow_id": workflow_id,
            "task_queue": TEMPORAL_TASK_QUEUE,
            "input": input,
            "workflow_execution_timeout": "3600s",
            "workflow_run_timeout": "1800s",
            "workflow_task_timeout": "30s",
            "id_reuse_policy": "WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE",
        }

        try:
            resp = await self._http.post(
                f"{TEMPORAL_BRIDGE_URL}/api/v1/namespaces/{TEMPORAL_NAMESPACE}/workflows",
                json=body,
                headers={
                    "X-Internal-Key": INTERNAL_KEY,
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code == 409:
                # Duplicate workflow ID — idempotent, not an error
                logger.debug("Temporal: duplicate workflow_id=%s (idempotent)", workflow_id)
                return
            resp.raise_for_status()
            logger.info(
                "Temporal: started %s workflow_id=%s", workflow_type, workflow_id
            )
        except httpx.HTTPStatusError as e:
            logger.error(
                "Temporal: failed to start %s workflow_id=%s: %s",
                workflow_type, workflow_id, e,
            )
        except Exception as e:
            logger.error("Temporal: unexpected error: %s", e)
