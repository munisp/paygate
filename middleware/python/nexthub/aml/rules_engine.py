"""
NextHub AML Rules Engine
========================
Evaluates AML rules against transfer events in real time.

Rules are loaded from the database (aml_rules table) and cached in memory
with a 60-second TTL. Each rule is a Python expression evaluated against
a TransferContext dict.

Rule types:
  - VELOCITY:    N transactions in T seconds from same payer
  - AMOUNT:      Single transaction exceeds threshold
  - PATTERN:     Structuring detection (multiple transactions just below threshold)
  - COUNTERPARTY: Known bad actor list match
  - GEOGRAPHY:   High-risk corridor detection

Each triggered rule produces an AML alert published to Fluvio topic
`nexthub.aml.alerts` and written to the `aml_alerts` PostgreSQL table.

Suspicious Transaction Reports (STRs) are auto-filed via Temporal workflow
`STRFilingWorkflow` when a rule with `auto_str = True` is triggered.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

class RuleType(str, Enum):
    VELOCITY = "VELOCITY"
    AMOUNT = "AMOUNT"
    PATTERN = "PATTERN"
    COUNTERPARTY = "COUNTERPARTY"
    GEOGRAPHY = "GEOGRAPHY"


class AlertSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass
class AMLRule:
    id: str
    name: str
    rule_type: RuleType
    expression: str          # Python expression string
    threshold: float
    window_seconds: int
    severity: AlertSeverity
    auto_str: bool           # Auto-file STR if triggered
    enabled: bool = True
    created_at: float = field(default_factory=time.time)


@dataclass
class TransferContext:
    """Context object passed to rule expressions."""
    transfer_id: str
    payer_fsp_id: str
    payee_fsp_id: str
    payer_account: str
    payee_account: str
    amount_minor: int        # Amount in minor units (kobo, cents, etc.)
    currency: str
    timestamp_ms: int
    # Enrichment fields (populated by the rules engine)
    payer_velocity_1h: int = 0       # Transactions in last 1 hour
    payer_velocity_24h: int = 0      # Transactions in last 24 hours
    payer_amount_24h: int = 0        # Total amount in last 24 hours (minor units)
    is_known_bad_actor: bool = False
    corridor_risk_score: float = 0.0  # 0.0 = low, 1.0 = high


@dataclass
class AMLAlert:
    rule_id: str
    rule_name: str
    transfer_id: str
    payer_fsp_id: str
    severity: AlertSeverity
    description: str
    auto_str: bool
    triggered_at: float = field(default_factory=time.time)
    evidence: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Rules engine
# ---------------------------------------------------------------------------

class AMLRulesEngine:
    """
    Evaluates AML rules against a transfer context.

    Usage:
        engine = AMLRulesEngine(rules_loader=load_rules_from_db)
        alerts = await engine.evaluate(context)
    """

    # Built-in rules that are always active regardless of DB configuration.
    BUILTIN_RULES: list[AMLRule] = [
        AMLRule(
            id="builtin-001",
            name="High Value Single Transfer",
            rule_type=RuleType.AMOUNT,
            expression="ctx['amount_minor'] >= threshold",
            threshold=500_000_00,  # NGN 500,000 in kobo
            window_seconds=0,
            severity=AlertSeverity.HIGH,
            auto_str=False,
        ),
        AMLRule(
            id="builtin-002",
            name="Velocity Breach 1h",
            rule_type=RuleType.VELOCITY,
            expression="ctx['payer_velocity_1h'] >= threshold",
            threshold=20,
            window_seconds=3600,
            severity=AlertSeverity.MEDIUM,
            auto_str=False,
        ),
        AMLRule(
            id="builtin-003",
            name="Structuring Detection",
            rule_type=RuleType.PATTERN,
            # Multiple transactions just below the STR threshold
            expression=(
                "ctx['payer_velocity_24h'] >= 5 and "
                "ctx['amount_minor'] >= threshold * 0.85 and "
                "ctx['amount_minor'] < threshold"
            ),
            threshold=500_000_00,  # NGN 500,000 in kobo
            window_seconds=86400,
            severity=AlertSeverity.CRITICAL,
            auto_str=True,
        ),
        AMLRule(
            id="builtin-004",
            name="Known Bad Actor",
            rule_type=RuleType.COUNTERPARTY,
            expression="ctx['is_known_bad_actor']",
            threshold=0,
            window_seconds=0,
            severity=AlertSeverity.CRITICAL,
            auto_str=True,
        ),
        AMLRule(
            id="builtin-005",
            name="High-Risk Corridor",
            rule_type=RuleType.GEOGRAPHY,
            expression="ctx['corridor_risk_score'] >= threshold",
            threshold=0.8,
            window_seconds=0,
            severity=AlertSeverity.HIGH,
            auto_str=False,
        ),
    ]

    def __init__(self, db_rules: Optional[list[AMLRule]] = None):
        self._db_rules: list[AMLRule] = db_rules or []
        self._cache_ts: float = 0.0
        self._cache_ttl: float = 60.0  # seconds

    def evaluate(self, ctx: TransferContext) -> list[AMLAlert]:
        """
        Evaluate all active rules against the transfer context.
        Returns a list of triggered AML alerts.
        """
        alerts: list[AMLAlert] = []
        ctx_dict = self._context_to_dict(ctx)

        all_rules = self.BUILTIN_RULES + [r for r in self._db_rules if r.enabled]

        for rule in all_rules:
            try:
                triggered = self._evaluate_rule(rule, ctx_dict)
            except Exception as exc:
                # Never let a rule evaluation crash the transfer path.
                # Log and continue.
                print(f"AML rule {rule.id} evaluation error: {exc}")
                continue

            if triggered:
                alert = AMLAlert(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    transfer_id=ctx.transfer_id,
                    payer_fsp_id=ctx.payer_fsp_id,
                    severity=rule.severity,
                    description=self._build_description(rule, ctx),
                    auto_str=rule.auto_str,
                    evidence={
                        "amount_minor": ctx.amount_minor,
                        "currency": ctx.currency,
                        "payer_velocity_1h": ctx.payer_velocity_1h,
                        "payer_velocity_24h": ctx.payer_velocity_24h,
                        "payer_amount_24h": ctx.payer_amount_24h,
                        "corridor_risk_score": ctx.corridor_risk_score,
                        "rule_threshold": rule.threshold,
                        "rule_expression": rule.expression,
                    },
                )
                alerts.append(alert)

        return alerts

    def _evaluate_rule(self, rule: AMLRule, ctx_dict: dict) -> bool:
        """Evaluate a rule expression safely."""
        # Restrict builtins to prevent code injection.
        safe_globals = {"__builtins__": {}}
        local_vars = {
            "ctx": ctx_dict,
            "threshold": rule.threshold,
        }
        result = eval(rule.expression, safe_globals, local_vars)  # noqa: S307
        return bool(result)

    def _context_to_dict(self, ctx: TransferContext) -> dict:
        return {
            "transfer_id": ctx.transfer_id,
            "payer_fsp_id": ctx.payer_fsp_id,
            "payee_fsp_id": ctx.payee_fsp_id,
            "amount_minor": ctx.amount_minor,
            "currency": ctx.currency,
            "payer_velocity_1h": ctx.payer_velocity_1h,
            "payer_velocity_24h": ctx.payer_velocity_24h,
            "payer_amount_24h": ctx.payer_amount_24h,
            "is_known_bad_actor": ctx.is_known_bad_actor,
            "corridor_risk_score": ctx.corridor_risk_score,
        }

    def _build_description(self, rule: AMLRule, ctx: TransferContext) -> str:
        return (
            f"Rule '{rule.name}' triggered for transfer {ctx.transfer_id} "
            f"from DFSP {ctx.payer_fsp_id}. "
            f"Amount: {ctx.amount_minor} {ctx.currency} minor units. "
            f"Velocity 1h: {ctx.payer_velocity_1h}, 24h: {ctx.payer_velocity_24h}."
        )

    def update_rules(self, new_rules: list[AMLRule]) -> None:
        """Update the DB-sourced rules (called by the cache refresh task)."""
        self._db_rules = new_rules
        self._cache_ts = time.time()


# ---------------------------------------------------------------------------
# Singleton instance (used by the Temporal activity)
# ---------------------------------------------------------------------------

_engine: Optional[AMLRulesEngine] = None


def get_engine() -> AMLRulesEngine:
    global _engine
    if _engine is None:
        _engine = AMLRulesEngine()
    return _engine
