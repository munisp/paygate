"""
PayGate NextHub — Temporal SuspiciousTransactionReportWorkflow
==============================================================
Orchestrates the STR (Suspicious Transaction Report) filing pipeline:

  1. EvaluateAmlRules      — run all active AML rules against the transaction
  2. CreateAmlAlert        — persist alert to DB with evidence
  3. NotifyComplianceOfficer — send email/push to compliance team
  4. FileStrReport         — if officer confirms, file STR with CBN FIU

SLA: officer must act within 23 hours; auto-files at hour 24.
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from nexthub.temporal.activities.aml_activities import (
        evaluate_aml_rules,
        create_aml_alert,
        file_str_report,
        notify_compliance_officer,
    )


@dataclass
class StrInput:
    transfer_id: str
    dfsp_id: str
    amount_minor: int
    currency: str
    payer_account: str
    payee_account: str
    transfer_timestamp_ms: int
    triggered_rule_ids: list


@dataclass
class StrResult:
    transfer_id: str
    alert_id: str
    str_reference: Optional[str]
    status: str   # FILED | DISMISSED | PENDING_OFFICER


_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)


@workflow.defn(name="SuspiciousTransactionReportWorkflow")
class SuspiciousTransactionReportWorkflow:
    """STR filing workflow with 24-hour officer action window."""

    _officer_decision: Optional[str] = None  # "CONFIRM" | "DISMISS"

    @workflow.signal
    def officer_decision(self, decision: str) -> None:
        """Signal sent by compliance officer via portal UI."""
        self._officer_decision = decision

    @workflow.run
    async def run(self, input: StrInput) -> StrResult:
        workflow.logger.info(
            "STR workflow started: transfer=%s dfsp=%s amount=%d %s",
            input.transfer_id, input.dfsp_id, input.amount_minor, input.currency,
        )

        # Step 1: Evaluate AML rules
        rule_results = await workflow.execute_activity(
            evaluate_aml_rules,
            args=[input.transfer_id, input.amount_minor, input.currency,
                  input.payer_account, input.payee_account, input.triggered_rule_ids],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_RETRY,
        )

        # Step 2: Create alert
        alert_id = await workflow.execute_activity(
            create_aml_alert,
            args=[input.transfer_id, input.dfsp_id, rule_results],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_RETRY,
        )

        # Step 3: Notify compliance officer
        await workflow.execute_activity(
            notify_compliance_officer,
            args=[alert_id, input.transfer_id, input.amount_minor, input.currency],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=_RETRY,
        )

        # Step 4: Wait up to 23 hours for officer decision
        await workflow.wait_condition(
            lambda: self._officer_decision is not None,
            timeout=timedelta(hours=23),
        )

        decision = self._officer_decision or "CONFIRM"  # auto-file on timeout

        if decision == "DISMISS":
            workflow.logger.info("STR dismissed by officer: alert=%s", alert_id)
            return StrResult(
                transfer_id=input.transfer_id,
                alert_id=alert_id,
                str_reference=None,
                status="DISMISSED",
            )

        # Step 5: File STR with CBN FIU
        str_reference = await workflow.execute_activity(
            file_str_report,
            args=[alert_id, input.transfer_id, input.dfsp_id,
                  input.amount_minor, input.currency, rule_results],
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=_RETRY,
        )

        workflow.logger.info(
            "STR filed: alert=%s reference=%s", alert_id, str_reference
        )
        return StrResult(
            transfer_id=input.transfer_id,
            alert_id=alert_id,
            str_reference=str_reference,
            status="FILED",
        )
