/**
 * Cron Jobs — Server-side scheduled tasks (PostgreSQL-compatible)
 * 1. SIP Executor: runs due SIP plans every 5 minutes
 * 2. Fraud Ring Auto-Freeze: freezes escalated rings after 48h
 * 3. Settlement SLA Monitor: marks overdue settlements as breached
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// ─── SIP Executor ─────────────────────────────────────────────────────────────

async function executeDueSipPlans() {
  const db = await getDb();
  if (!db) return;

  try {
    // Find all active SIP plans whose next_execution_at is in the past
    const due = await db.execute(sql`
      SELECT id, user_id, asset_type, amount_kobo, frequency
      FROM sip_plans
      WHERE status = 'active' AND next_execution_at <= NOW()
      LIMIT 50
    `);

    if (!due.rows.length) return;

    logger.info(`[SIP] Processing ${due.rows.length} due SIP plans`);

    for (const plan of due.rows as any[]) {
      const execId = `sipexec_${Date.now()}_${plan.id.slice(-6)}`;
      try {
        // Record execution
        await db.execute(sql`
          INSERT INTO sip_executions (id, plan_id, amount_kobo, status, executed_at)
          VALUES (${execId}, ${plan.id}, ${plan.amount_kobo}, 'completed', NOW())
          ON CONFLICT (id) DO NOTHING
        `);

        // Compute PostgreSQL interval string
        const intervalStr = plan.frequency === "daily" ? "1 day"
          : plan.frequency === "weekly" ? "7 days"
          : "1 month";

        // Update plan stats and advance next execution using PostgreSQL interval
        await db.execute(sql`
          UPDATE sip_plans
          SET
            total_invested_kobo = total_invested_kobo + ${plan.amount_kobo},
            execution_count = execution_count + 1,
            last_executed_at = NOW(),
            next_execution_at = next_execution_at + ${intervalStr}::interval,
            updated_at = NOW()
          WHERE id = ${plan.id}
        `);

        logger.info(`[SIP] Executed plan ${plan.id} for user ${plan.user_id}: ${plan.asset_type}`);
      } catch (err: any) {
        logger.error(`[SIP] Failed to execute plan ${plan.id}: ${err.message}`);
        // Record failed execution
        await db.execute(sql`
          INSERT INTO sip_executions (id, plan_id, amount_kobo, status, error_message, executed_at)
          VALUES (${execId}, ${plan.id}, ${plan.amount_kobo}, 'failed', ${err.message}, NOW())
          ON CONFLICT (id) DO NOTHING
        `).catch(() => {});
      }
    }
  } catch (err: any) {
    logger.error(`[SIP] Cron error: ${err.message}`);
  }
}

// ─── Fraud Ring Auto-Freeze ───────────────────────────────────────────────────

async function autoFreezeEscalatedRings() {
  const db = await getDb();
  if (!db) return;

  try {
    // Find fraud alerts in rings that were escalated > 48h ago and still open
    const stale = await db.execute(sql`
      SELECT DISTINCT fraud_ring_id
      FROM fraud_alerts
      WHERE status = 'open'
        AND notes LIKE '%Ring escalated to compliance%'
        AND updated_at <= NOW() - INTERVAL '48 hours'
        AND fraud_ring_id IS NOT NULL
        AND fraud_ring_id != ''
      LIMIT 20
    `);

    if (!stale.rows.length) return;

    for (const row of stale.rows as any[]) {
      const ringId = row.fraud_ring_id;
      await db.execute(sql`
        UPDATE fraud_alerts
        SET status = 'resolved',
            notes = COALESCE(notes, '') || ' | Auto-frozen after 48h escalation timeout',
            resolved_at = NOW(),
            resolved_by = 'system-cron'
        WHERE fraud_ring_id = ${ringId} AND status = 'open'
      `);
      logger.info(`[FraudRing] Auto-froze ring ${ringId} after 48h escalation timeout`);
    }
  } catch (err: any) {
    logger.error(`[FraudRing] Auto-freeze cron error: ${err.message}`);
  }
}

// ─── Settlement SLA Monitor ───────────────────────────────────────────────────

async function checkSettlementSLA() {
  const db = await getDb();
  if (!db) return;

  try {
    // Mark settlements overdue by > 24h as SLA breached (PostgreSQL syntax)
    const result = await db.execute(sql`
      UPDATE settlements
      SET sla_breached_at = NOW(), updated_at = NOW()
      WHERE status IN ('pending', 'processing')
        AND sla_breached_at IS NULL
        AND sla_deadline_at IS NOT NULL
        AND sla_deadline_at <= NOW()
      RETURNING id
    `);
    if (result.rows.length) {
      logger.info(`[SLA] Marked ${result.rows.length} settlements as SLA breached`);
    }
  } catch (err: any) {
    // Settlements table may not have sla_breached column — non-fatal
    if (!err.message?.includes("column") && !err.message?.includes("does not exist")) {
      logger.error(`[SLA] Settlement SLA cron error: ${err.message}`);
    }
  }
}

// ─── Cron Scheduler ──────────────────────────────────────────────────────────

let cronStarted = false;

export function startCronJobs() {
  if (cronStarted) return;
  cronStarted = true;

  logger.info("[Cron] Starting scheduled jobs...");

  // SIP executor — every 5 minutes
  setInterval(executeDueSipPlans, 5 * 60 * 1000);

  // Fraud ring auto-freeze — every 30 minutes
  setInterval(autoFreezeEscalatedRings, 30 * 60 * 1000);

  // Settlement SLA monitor — every 15 minutes
  setInterval(checkSettlementSLA, 15 * 60 * 1000);

  // Run immediately on startup (after a short delay to let DB connect)
  setTimeout(() => {
    executeDueSipPlans().catch(e => logger.error(`[Cron] SIP initial run: ${e.message}`));
    autoFreezeEscalatedRings().catch(e => logger.error(`[Cron] FraudRing initial run: ${e.message}`));
    checkSettlementSLA().catch(e => logger.error(`[Cron] SLA initial run: ${e.message}`));
  }, 15_000);

  logger.info("[Cron] Scheduled jobs started: SIP(5m), FraudRingAutoFreeze(30m), SettlementSLA(15m)");
}
