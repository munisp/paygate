#!/usr/bin/env bash
# =============================================================================
# PayGate Kafka Topic Provisioning
# Run once against the production Kafka cluster.
# Requires: kafka-topics.sh in PATH (Kafka CLI tools)
# =============================================================================
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-kafka-1:9092,kafka-2:9092,kafka-3:9092}"
REPLICATION="${KAFKA_REPLICATION_FACTOR:-3}"

echo "=== PayGate Kafka Topic Provisioning ==="
echo "  Bootstrap : ${BOOTSTRAP}"
echo "  Replication factor: ${REPLICATION}"
echo ""

create_topic() {
  local topic="$1"
  local partitions="$2"
  local retention_ms="$3"
  echo "Creating topic: ${topic} (partitions=${partitions}, retention=${retention_ms}ms)"
  kafka-topics.sh \
    --bootstrap-server "${BOOTSTRAP}" \
    --create \
    --if-not-exists \
    --topic "${topic}" \
    --partitions "${partitions}" \
    --replication-factor "${REPLICATION}" \
    --config min.insync.replicas=2 \
    --config retention.ms="${retention_ms}" \
    --config compression.type=lz4 \
    --config cleanup.policy=delete
}

# ─── Core payment topics ──────────────────────────────────────────────────────
create_topic "paygate.transaction.completed"  32  604800000   # 7 days
create_topic "paygate.transaction.failed"     16  604800000   # 7 days
create_topic "paygate.payout.initiated"       16  604800000   # 7 days
create_topic "paygate.settlement.triggered"    8  604800000   # 7 days
create_topic "paygate.fraud.alert"             8  2592000000  # 30 days
create_topic "paygate.audit.events"           16  7776000000  # 90 days
create_topic "paygate.nibss.confirmation"      8  604800000   # 7 days

echo ""
echo "=== Listing all PayGate topics ==="
kafka-topics.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --list \
  | grep "^paygate\."

echo ""
echo "=== Topic provisioning complete ==="

# ─── Tier 6-8 New Feature Topics ─────────────────────────────────────────────
create_topic "paygate.insurance.policy.issued"       8  2592000000  # 30 days
create_topic "paygate.insurance.claim.submitted"     8  2592000000  # 30 days
create_topic "paygate.carbon.credit.minted"          4  7776000000  # 90 days
create_topic "paygate.carbon.credit.retired"         4  7776000000  # 90 days
create_topic "paygate.nft.badge.minted"              4  7776000000  # 90 days
create_topic "paygate.bnpl.plan.created"             8  2592000000  # 30 days
create_topic "paygate.bnpl.instalment.paid"          8  2592000000  # 30 days
create_topic "paygate.bnpl.default.flagged"          4  2592000000  # 30 days
create_topic "paygate.crypto.ramp.initiated"         8  604800000   # 7 days
create_topic "paygate.crypto.ramp.completed"         8  604800000   # 7 days
create_topic "paygate.escrow.created"                8  2592000000  # 30 days
create_topic "paygate.escrow.released"               8  2592000000  # 30 days
create_topic "paygate.escrow.disputed"               4  2592000000  # 30 days
create_topic "paygate.bulk.payment.scheduled"        8  604800000   # 7 days
create_topic "paygate.bulk.payment.executed"         8  604800000   # 7 days
create_topic "paygate.tax.withheld"                  8  7776000000  # 90 days
create_topic "paygate.tax.remitted"                  8  7776000000  # 90 days
create_topic "paygate.regulatory.sandbox.event"      4  604800000   # 7 days
create_topic "paygate.multicurrency.converted"       8  604800000   # 7 days
create_topic "paygate.rtgs.instruction.sent"         8  604800000   # 7 days
create_topic "paygate.rtgs.instruction.settled"      8  604800000   # 7 days
create_topic "paygate.iso20022.message.parsed"       8  604800000   # 7 days
create_topic "paygate.openbanking.consent.granted"   8  2592000000  # 30 days
create_topic "paygate.openbanking.consent.revoked"   8  2592000000  # 30 days
create_topic "paygate.openbanking.data.shared"       8  2592000000  # 30 days
create_topic "paygate.sdk.token.issued"              8  604800000   # 7 days
create_topic "paygate.sdk.webhook.delivered"         8  604800000   # 7 days
create_topic "paygate.superapp.mini.launched"        4  604800000   # 7 days
create_topic "paygate.lakehouse.sync.completed"      4  604800000   # 7 days
create_topic "paygate.payroll.run.completed"         8  2592000000  # 30 days
create_topic "paygate.payroll.disbursement.sent"     8  2592000000  # 30 days

# ─── KYB / Lending / Agent / Loyalty Topics ──────────────────────────────────
create_topic "paygate.kyb.status.updated"            8  7776000000  # 90 days
create_topic "paygate.kyb.document.uploaded"         8  7776000000  # 90 days
create_topic "paygate.lending.application.submitted" 8  7776000000  # 90 days
create_topic "paygate.lending.disbursed"             8  7776000000  # 90 days
create_topic "paygate.lending.repayment.received"    8  7776000000  # 90 days
create_topic "paygate.lending.default.flagged"       4  7776000000  # 90 days
create_topic "paygate.agent.registered"              8  7776000000  # 90 days
create_topic "paygate.agent.transaction.completed"   16 604800000   # 7 days
create_topic "paygate.agent.float.topped"            8  604800000   # 7 days
create_topic "paygate.loyalty.points.awarded"        16 2592000000  # 30 days
create_topic "paygate.loyalty.points.redeemed"       16 2592000000  # 30 days
create_topic "paygate.loyalty.tier.upgraded"         4  2592000000  # 30 days

# ─── DCC / Split / Reconciliation Topics ─────────────────────────────────────
create_topic "paygate.dcc.conversion.completed"      8  604800000   # 7 days
create_topic "paygate.split.payment.executed"        8  604800000   # 7 days
create_topic "paygate.reconciliation.completed"      4  2592000000  # 30 days
create_topic "paygate.reconciliation.discrepancy"    4  2592000000  # 30 days
create_topic "paygate.remittance.completed"          8  2592000000  # 30 days
create_topic "paygate.remittance.failed"             8  2592000000  # 30 days

# ─── CBN / FIRS Compliance Topics ────────────────────────────────────────────
create_topic "paygate.cbn.report.generated"          4  31536000000 # 365 days
create_topic "paygate.firs.wht.remitted"             4  31536000000 # 365 days
create_topic "paygate.aml.alert.raised"              8  31536000000 # 365 days
create_topic "paygate.aml.case.resolved"             8  31536000000 # 365 days

# ─── Stripe / Subscription Topics ────────────────────────────────────────────
create_topic "paygate.stripe.payment.succeeded"      8  2592000000  # 30 days
create_topic "paygate.stripe.subscription.updated"   8  2592000000  # 30 days
create_topic "paygate.stripe.invoice.paid"           8  2592000000  # 30 days
create_topic "paygate.subscription.billing.cycle"    8  2592000000  # 30 days

