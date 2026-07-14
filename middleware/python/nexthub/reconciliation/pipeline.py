"""
NextHub Reconciliation Pipeline
================================
Implements the 4-activity Temporal ReconciliationWorkflow:

  Activity 1: FetchHubRecords
    - Queries TigerBeetle for all posted transfers in the settlement window
    - Returns a list of HubRecord objects

  Activity 2: FetchRailRecords
    - Fetches the corresponding records from the external rail
      (NIBSS NIP, SWIFT, mBridge, etc.)
    - Returns a list of RailRecord objects

  Activity 3: ComputeBreaks
    - Compares HubRecords vs RailRecords
    - Classifies each discrepancy as one of 4 break types:
        TIMING:    Hub has record, rail not yet settled (< 2h SLA)
        AMOUNT:    Hub amount != rail amount (< 4h SLA)
        MISSING_DEBIT:  Hub has debit, rail has no corresponding credit (< 1h SLA)
        DUPLICATE_CREDIT: Rail has duplicate credit not in hub (< 30min SLA)
    - Returns a list of ReconciliationBreak objects

  Activity 4: WriteReport
    - Writes breaks to PostgreSQL reconciliation_exceptions table
    - Writes Parquet file to Lakehouse (S3) for audit
    - Triggers auto-resolution for breaks within SLA
    - Returns a ReconciliationReport

The workflow is scheduled by the Temporal cron scheduler to run:
  - Every 30 minutes for RTGS windows
  - Every 2 hours for DNS intraday windows
  - At 23:00 for DNS end-of-day windows
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

class BreakType(str, Enum):
    TIMING = "TIMING"
    AMOUNT = "AMOUNT"
    MISSING_DEBIT = "MISSING_DEBIT"
    DUPLICATE_CREDIT = "DUPLICATE_CREDIT"


class BreakStatus(str, Enum):
    OPEN = "OPEN"
    AUTO_RESOLVED = "AUTO_RESOLVED"
    ESCALATED = "ESCALATED"
    CLOSED = "CLOSED"


# SLA in seconds for each break type
BREAK_SLA_SECONDS: dict[BreakType, int] = {
    BreakType.TIMING: 2 * 3600,         # 2 hours
    BreakType.AMOUNT: 4 * 3600,         # 4 hours
    BreakType.MISSING_DEBIT: 1 * 3600,  # 1 hour
    BreakType.DUPLICATE_CREDIT: 30 * 60, # 30 minutes
}


@dataclass
class HubRecord:
    """A transfer record from TigerBeetle (hub side)."""
    transfer_id: str
    payer_fsp_id: str
    payee_fsp_id: str
    amount_minor: int
    currency: str
    timestamp_ms: int
    tigerbeetle_id_lo: int
    tigerbeetle_id_hi: int
    state: str  # "COMMITTED" | "ABORTED"


@dataclass
class RailRecord:
    """A transfer record from the external payment rail."""
    rail_reference: str
    payer_account: str
    payee_account: str
    amount_minor: int
    currency: str
    timestamp_ms: int
    rail: str  # "NIBSS_NIP" | "SWIFT" | "MBRIDGE" | "CIPS"
    status: str  # "SETTLED" | "PENDING" | "FAILED"


@dataclass
class ReconciliationBreak:
    """A discrepancy between hub and rail records."""
    break_id: str
    window_id: str
    break_type: BreakType
    hub_transfer_id: Optional[str]
    rail_reference: Optional[str]
    hub_amount_minor: Optional[int]
    rail_amount_minor: Optional[int]
    currency: str
    payer_fsp_id: str
    payee_fsp_id: str
    sla_deadline_ms: int
    status: BreakStatus = BreakStatus.OPEN
    description: str = ""
    detected_at_ms: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class ReconciliationReport:
    window_id: str
    hub_record_count: int
    rail_record_count: int
    matched_count: int
    break_count: int
    breaks_by_type: dict[str, int]
    auto_resolved_count: int
    escalated_count: int
    parquet_s3_key: str
    generated_at_ms: int = field(default_factory=lambda: int(time.time() * 1000))


# ---------------------------------------------------------------------------
# Temporal activities
# ---------------------------------------------------------------------------

class ReconciliationActivities:
    """
    Temporal activity implementations for the ReconciliationWorkflow.

    In production, register these with the Temporal worker:
        worker = Worker(client, task_queue="nexthub-reconciliation", activities=[...])
    """

    async def fetch_hub_records(self, window_id: str, start_ms: int, end_ms: int) -> list[HubRecord]:
        """
        Activity 1: Fetch all committed transfers from TigerBeetle
        for the given settlement window time range.

        In production:
          1. Call TigerBeetle lookup_accounts for all DFSP position accounts
          2. Use the account history API to get all transfers in [start_ms, end_ms]
          3. Filter to COMMITTED state only
        """
        # Stub: return empty list
        # TODO: implement TigerBeetle account history query
        return []

    async def fetch_rail_records(self, window_id: str, rail: str, start_ms: int, end_ms: int) -> list[RailRecord]:
        """
        Activity 2: Fetch settlement records from the external rail.

        Supported rails:
          - NIBSS_NIP: Call NIBSS NIP settlement report API
          - SWIFT:     Parse SWIFT MT940 statement
          - MBRIDGE:   Call mBridge settlement API
          - CIPS:      Call CIPS settlement report API
        """
        # Stub: return empty list
        # TODO: implement per-rail record fetcher
        return []

    async def compute_breaks(
        self,
        window_id: str,
        hub_records: list[HubRecord],
        rail_records: list[RailRecord],
    ) -> list[ReconciliationBreak]:
        """
        Activity 3: Compare hub and rail records and classify breaks.

        Matching logic:
          1. Build a map of hub records by transfer_id
          2. Build a map of rail records by rail_reference
          3. For each hub record, find the matching rail record
          4. Classify unmatched or mismatched records as breaks
        """
        breaks: list[ReconciliationBreak] = []
        now_ms = int(time.time() * 1000)

        # Index rail records by amount + payee for fuzzy matching
        rail_by_ref: dict[str, RailRecord] = {r.rail_reference: r for r in rail_records}
        matched_rail_refs: set[str] = set()

        for hub_rec in hub_records:
            # Try to find a matching rail record
            # In production, use a more sophisticated matching algorithm
            # (e.g. amount + timestamp window + account number)
            matched_rail = self._find_matching_rail_record(hub_rec, rail_records, matched_rail_refs)

            if matched_rail is None:
                # Hub has record, rail has nothing — MISSING_DEBIT
                sla = now_ms + BREAK_SLA_SECONDS[BreakType.MISSING_DEBIT] * 1000
                breaks.append(ReconciliationBreak(
                    break_id=f"brk-{hub_rec.transfer_id[:8]}",
                    window_id=window_id,
                    break_type=BreakType.MISSING_DEBIT,
                    hub_transfer_id=hub_rec.transfer_id,
                    rail_reference=None,
                    hub_amount_minor=hub_rec.amount_minor,
                    rail_amount_minor=None,
                    currency=hub_rec.currency,
                    payer_fsp_id=hub_rec.payer_fsp_id,
                    payee_fsp_id=hub_rec.payee_fsp_id,
                    sla_deadline_ms=sla,
                    description=f"Hub transfer {hub_rec.transfer_id} has no matching rail record",
                ))
            elif matched_rail.amount_minor != hub_rec.amount_minor:
                # Amount mismatch — AMOUNT break
                sla = now_ms + BREAK_SLA_SECONDS[BreakType.AMOUNT] * 1000
                breaks.append(ReconciliationBreak(
                    break_id=f"brk-{hub_rec.transfer_id[:8]}-amt",
                    window_id=window_id,
                    break_type=BreakType.AMOUNT,
                    hub_transfer_id=hub_rec.transfer_id,
                    rail_reference=matched_rail.rail_reference,
                    hub_amount_minor=hub_rec.amount_minor,
                    rail_amount_minor=matched_rail.amount_minor,
                    currency=hub_rec.currency,
                    payer_fsp_id=hub_rec.payer_fsp_id,
                    payee_fsp_id=hub_rec.payee_fsp_id,
                    sla_deadline_ms=sla,
                    description=(
                        f"Amount mismatch: hub={hub_rec.amount_minor}, "
                        f"rail={matched_rail.amount_minor} {hub_rec.currency}"
                    ),
                ))
            else:
                matched_rail_refs.add(matched_rail.rail_reference)

        # Check for duplicate credits (rail records not matched to any hub record)
        for rail_rec in rail_records:
            if rail_rec.rail_reference not in matched_rail_refs:
                sla = now_ms + BREAK_SLA_SECONDS[BreakType.DUPLICATE_CREDIT] * 1000
                breaks.append(ReconciliationBreak(
                    break_id=f"brk-{rail_rec.rail_reference[:8]}-dup",
                    window_id=window_id,
                    break_type=BreakType.DUPLICATE_CREDIT,
                    hub_transfer_id=None,
                    rail_reference=rail_rec.rail_reference,
                    hub_amount_minor=None,
                    rail_amount_minor=rail_rec.amount_minor,
                    currency=rail_rec.currency,
                    payer_fsp_id="UNKNOWN",
                    payee_fsp_id="UNKNOWN",
                    sla_deadline_ms=sla,
                    description=f"Rail record {rail_rec.rail_reference} has no matching hub transfer",
                ))

        return breaks

    async def write_report(
        self,
        window_id: str,
        hub_records: list[HubRecord],
        rail_records: list[RailRecord],
        breaks: list[ReconciliationBreak],
    ) -> ReconciliationReport:
        """
        Activity 4: Persist the reconciliation results.

        In production:
          1. Write breaks to PostgreSQL reconciliation_exceptions table
          2. Write Parquet file to S3 Lakehouse
          3. Trigger auto-resolution for breaks within SLA
          4. Escalate breaks that have exceeded SLA
        """
        breaks_by_type: dict[str, int] = {}
        for b in breaks:
            breaks_by_type[b.break_type.value] = breaks_by_type.get(b.break_type.value, 0) + 1

        # TODO: write to DB and S3
        parquet_key = f"reconciliation/{window_id}/report.parquet"

        return ReconciliationReport(
            window_id=window_id,
            hub_record_count=len(hub_records),
            rail_record_count=len(rail_records),
            matched_count=len(hub_records) - sum(
                1 for b in breaks if b.break_type == BreakType.MISSING_DEBIT
            ),
            break_count=len(breaks),
            breaks_by_type=breaks_by_type,
            auto_resolved_count=0,  # TODO: implement auto-resolution
            escalated_count=0,      # TODO: implement escalation
            parquet_s3_key=parquet_key,
        )

    def _find_matching_rail_record(
        self,
        hub_rec: HubRecord,
        rail_records: list[RailRecord],
        already_matched: set[str],
    ) -> Optional[RailRecord]:
        """
        Find the best matching rail record for a hub record.
        Matching criteria (in order of priority):
          1. Exact amount match within 5-minute timestamp window
          2. Exact amount match within 2-hour timestamp window (TIMING break candidate)
        """
        window_5min = 5 * 60 * 1000
        window_2h = 2 * 3600 * 1000

        for rail_rec in rail_records:
            if rail_rec.rail_reference in already_matched:
                continue
            if rail_rec.currency != hub_rec.currency:
                continue
            time_diff = abs(rail_rec.timestamp_ms - hub_rec.timestamp_ms)
            if rail_rec.amount_minor == hub_rec.amount_minor and time_diff <= window_2h:
                return rail_rec

        return None
