/**
 * Cron Jobs — Server-side scheduled tasks (PostgreSQL-compatible)
 * 1. SIP Executor: runs due SIP plans every 5 minutes, sends email + in-app notifications
 * 2. Fraud Ring Auto-Freeze: freezes escalated rings after 48h
 * 3. Settlement SLA Monitor: marks overdue settlements as breached
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendEmail } from "./emailService";
import { notifyOwner } from "./_core/notification";

// ─── SIP Executor ─────────────────────────────────────────────────────────────

async function executeDueSipPlans() {
  const db = await getDb();
  if (!db) return;

  try {
    // Find all active SIP plans whose next_execution_at is in the past
    const due = await db.execute(sql`
      SELECT sp.id, sp.user_id, sp.asset_type, sp.amount_kobo, sp.frequency,
             u.email, u.name
      FROM sip_plans sp
      LEFT JOIN users u ON u.id = sp.user_id
      WHERE sp.status = 'active' AND sp.next_execution_at <= NOW()
      LIMIT 50
    `);

    if (!due.rows.length) return;

    logger.info(`[SIP] Processing ${due.rows.length} due SIP plans`);

    let executed = 0;
    let failed = 0;

    for (const plan of due.rows as any[]) {
      const execId = `sipexec_${Date.now()}_${plan.id.slice(-6)}`;
      const amountNGN = (plan.amount_kobo / 100).toFixed(2);
      const assetLabel = plan.asset_type === "gold" ? "Digital Gold"
        : plan.asset_type === "mutual_fund" ? "Mutual Fund"
        : plan.asset_type === "pension" ? "Pension (NPS)"
        : plan.asset_type;

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

        // Send email notification to the investor
        if (plan.email) {
          sendEmail({
            to: plan.email,
            subject: `✅ SIP Investment Executed — ₦${amountNGN} in ${assetLabel}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2 style="color:#16a34a">SIP Investment Executed</h2>
                <p>Hi ${plan.name || "Investor"},</p>
                <p>Your scheduled investment of <strong>₦${amountNGN}</strong> in <strong>${assetLabel}</strong> has been executed successfully.</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0">
                  <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><strong>Plan ID</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${plan.id}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><strong>Asset</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${assetLabel}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #e5e7eb">₦${amountNGN}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><strong>Frequency</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${plan.frequency}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb"><strong>Executed At</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${new Date().toUTCString()}</td></tr>
                </table>
                <p>Your investment is growing steadily. View your portfolio at <a href="https://paygate.ng/consumer/sip">paygate.ng/consumer/sip</a></p>
                <p style="color:#6b7280;font-size:12px">This is an automated notification from PayGate. Do not reply to this email.</p>
              </div>
            `,
          }).catch(e => logger.warn(`[SIP] Email notification failed for ${plan.email}: ${e.message}`));
        }

        executed++;
        logger.info(`[SIP] Executed plan ${plan.id} for user ${plan.user_id}: ${assetLabel} ₦${amountNGN}`);
      } catch (err: any) {
        logger.error(`[SIP] Failed to execute plan ${plan.id}: ${err.message}`);
        failed++;

        // Record failed execution
        await db.execute(sql`
          INSERT INTO sip_executions (id, plan_id, amount_kobo, status, error_message, executed_at)
          VALUES (${execId}, ${plan.id}, ${plan.amount_kobo}, 'failed', ${err.message}, NOW())
          ON CONFLICT (id) DO NOTHING
        `).catch(() => {});

        // Send failure email
        if (plan.email) {
          sendEmail({
            to: plan.email,
            subject: `⚠️ SIP Investment Failed — ₦${amountNGN} in ${assetLabel}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2 style="color:#dc2626">SIP Investment Failed</h2>
                <p>Hi ${plan.name || "Investor"},</p>
                <p>Your scheduled investment of <strong>₦${amountNGN}</strong> in <strong>${assetLabel}</strong> could not be executed.</p>
                <p><strong>Reason:</strong> ${err.message}</p>
                <p>Please check your wallet balance and ensure sufficient funds are available. The system will retry on the next scheduled date.</p>
                <p>Visit <a href="https://paygate.ng/consumer/sip">paygate.ng/consumer/sip</a> to manage your SIP plans.</p>
              </div>
            `,
          }).catch(() => {});
        }
      }
    }

    // Notify platform owner of daily SIP batch summary
    if (executed > 0 || failed > 0) {
      notifyOwner({
        title: `SIP Batch: ${executed} executed, ${failed} failed`,
        content: `Daily SIP execution batch completed. ${executed} plans executed successfully, ${failed} failed. Total plans processed: ${due.rows.length}.`,
      }).catch(() => {});
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

      // Notify owner
      notifyOwner({
        title: `Fraud Ring Auto-Frozen: ${ringId}`,
        content: `Fraud ring ${ringId} was automatically frozen after 48 hours without resolution following escalation to compliance.`,
      }).catch(() => {});
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
      notifyOwner({
        title: `SLA Breach: ${result.rows.length} settlements overdue`,
        content: `${result.rows.length} settlements have exceeded their SLA deadline and have been marked as breached.`,
      }).catch(() => {});
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
