/**
 * Cron Jobs — Server-side scheduled tasks (PostgreSQL-compatible)
 * 1. SIP Executor: runs due SIP plans every 5 minutes, sends email + in-app notifications
 * 2. Fraud Ring Auto-Freeze: freezes escalated rings after 48h
 * 3. Settlement SLA Monitor: marks overdue settlements as breached
 * 4. Loyalty Tier Auto-Promotion: promotes/demotes accounts every 6 hours
 * 5. BNPL Overdue Alert: marks overdue instalments and applies late fee every hour
 * 6. STR 24h Deadline Monitor: alerts compliance team and auto-retries NFIU submission every 15 minutes
 * 7. Interchange Fee Auto-Calculation: calculates fees for completed transactions every 5 minutes
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendEmail } from "./emailService";
import { notifyOwner } from "./_core/notification";
import { isSuppressedWorkerError } from './workerErrorFilter';

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
    if (!isSuppressedWorkerError(err)) {
      logger.error(`[SIP] Cron error: ${err.message}`);
    }
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
    if (!isSuppressedWorkerError(err)) {
      logger.error(`[FraudRing] Auto-freeze cron error: ${err.message}`);
    }
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
    if (!isSuppressedWorkerError(err) && !err.message?.includes("column") && !err.message?.includes("does not exist")) {
      logger.error(`[SLA] Settlement SLA cron error: ${err.message}`);
    }
  }
}

// ─── Loyalty Tier Auto-Promotion ─────────────────────────────────────────────

async function runLoyaltyTierPromotion(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    // Tier thresholds: bronze < 500, silver 500–1999, gold 2000–9999, platinum 10000+
    const result = await db.execute(sql`
      UPDATE consumer_loyalty_accounts
      SET tier = CASE
            WHEN lifetime_points >= 10000 THEN 'platinum'
            WHEN lifetime_points >= 2000 THEN 'gold'
            WHEN lifetime_points >= 500 THEN 'silver'
            ELSE 'bronze'
          END,
          updated_at = now()
      WHERE tier != CASE
            WHEN lifetime_points >= 10000 THEN 'platinum'
            WHEN lifetime_points >= 2000 THEN 'gold'
            WHEN lifetime_points >= 500 THEN 'silver'
            ELSE 'bronze'
          END
      RETURNING id, user_id, tier
    `);
    const promoted = result.rows.length;
    if (promoted > 0) {
      logger.info(`[LoyaltyTier] Promoted/demoted ${promoted} accounts`);
      notifyOwner({
        title: `Loyalty Tier Update: ${promoted} accounts changed`,
        content: `${promoted} consumer loyalty accounts were promoted or demoted based on lifetime points.`,
      }).catch(() => {});
    }
  } catch (err: any) {
    if (!isSuppressedWorkerError(err) && !err.message?.includes('does not exist') && !err.message?.includes('consumer_loyalty_accounts')) {
      logger.warn(`[LoyaltyTier] Tier promotion error: ${err.message}`);
    }
  }
}

// ─── BNPL Overdue Alert ───────────────────────────────────────────────────────

async function runBnplOverdueAlerts(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    // Mark overdue instalments (due_date < now and status = pending) and apply 2% late fee
    const result = await db.execute(sql`
      UPDATE bnpl_repayment_schedules
      SET status = 'overdue',
          late_fee_ngn = GREATEST(COALESCE(late_fee_ngn, 0), total_due_ngn * 0.02),
          updated_at = now()
      WHERE status = 'pending'
        AND due_date < now()
      RETURNING id, user_id, bnpl_loan_id, total_due_ngn
    `);
    const overdue = result.rows.length;
    if (overdue > 0) {
      logger.info(`[BNPL] Marked ${overdue} instalments as overdue`);
      notifyOwner({
        title: `BNPL Overdue: ${overdue} instalments past due`,
        content: `${overdue} BNPL repayment instalments are now overdue. A 2% late fee has been applied.`,
      }).catch(() => {});
    }
  } catch (err: any) {
    if (!isSuppressedWorkerError(err) && !err.message?.includes('does not exist') && !err.message?.includes('bnpl_repayment_schedules')) {
      logger.warn(`[BNPL] Overdue alert error: ${err.message}`);
    }
  }
}

// ─── STR 24-Hour Deadline Monitor ────────────────────────────────────────────
/**
 * Runs every 15 minutes.
 * 1. Alerts the compliance team (via notifyOwner) when an STR is within 1 hour of
 *    the 24-hour NFIU submission deadline.
 * 2. Auto-retries failed/pending STR submissions via the Go bridge (max 3 attempts).
 *
 * CBN/NFIU requirement: STRs must be filed within 24 hours of detection.
 * Reference: CBN AML/CFT Regulations 2022, Section 6.2.
 */
async function monitorStrDeadlines(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const now = new Date();
    // 23h ago = less than 1 hour remaining before 24h deadline
    const deadline1h = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    // 24h ago = deadline has passed
    const deadline24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. STRs approaching deadline (filed 23–24h ago, still pending)
    const approaching = await db.execute(sql`
      SELECT id, merchant_id, transaction_id, filed_at, submission_attempts
      FROM str_records
      WHERE submission_status = 'pending'
        AND filed_at <= ${deadline1h.toISOString()}::timestamptz
        AND filed_at > ${deadline24h.toISOString()}::timestamptz
    `);

    for (const str of approaching.rows as any[]) {
      const filedAt = new Date(str.filed_at);
      const minutesLeft = Math.round((filedAt.getTime() + 24 * 60 * 60 * 1000 - now.getTime()) / 60000);
      logger.warn(`[STR] DEADLINE ALERT: STR ${str.id} for merchant ${str.merchant_id} — ${minutesLeft}m until NFIU deadline`);
      await notifyOwner({
        title: `⚠️ STR Deadline Alert — ${minutesLeft} minutes remaining`,
        content: `STR ${str.id} (transaction: ${str.transaction_id}) for merchant ${str.merchant_id} must be submitted to NFIU within ${minutesLeft} minutes. Filed at: ${filedAt.toISOString()}. Submission attempts so far: ${str.submission_attempts}.`,
      });
    }

    // 2. Overdue STRs (>24h, still pending, <3 attempts) — auto-retry via Go bridge
    const overdue = await db.execute(sql`
      SELECT id, merchant_id, transaction_id, subject_data, transaction_data,
             suspicion_grounds, narrative, filed_by, submission_attempts
      FROM str_records
      WHERE submission_status = 'pending'
        AND filed_at <= ${deadline24h.toISOString()}::timestamptz
        AND submission_attempts < 3
    `);

    for (const str of overdue.rows as any[]) {
      logger.error(`[STR] OVERDUE: STR ${str.id} — auto-retry attempt ${str.submission_attempts + 1}/3`);
      try {
        const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL ?? 'http://go-bridge:8080';
        const res = await fetch(`${bridgeUrl}/api/cbn/str/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': process.env.MIDDLEWARE_INTERNAL_KEY ?? '',
          },
          body: JSON.stringify({
            str_id: str.id,
            merchant_id: str.merchant_id,
            transaction_id: str.transaction_id,
            subject_data: typeof str.subject_data === 'string' ? JSON.parse(str.subject_data) : str.subject_data,
            transaction_data: typeof str.transaction_data === 'string' ? JSON.parse(str.transaction_data) : str.transaction_data,
            suspicion_grounds: str.suspicion_grounds,
            narrative: str.narrative,
            filed_by: str.filed_by,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          const result = await res.json() as any;
          await db.execute(sql`
            UPDATE str_records
            SET submission_status = 'submitted',
                nfiu_ref = ${result.nfiu_ref ?? null},
                nfiu_submitted_at = NOW(),
                submission_attempts = submission_attempts + 1,
                last_attempt_at = NOW()
            WHERE id = ${str.id}
          `);
          logger.info(`[STR] Auto-retry succeeded for ${str.id}, NFIU ref: ${result.nfiu_ref}`);
        } else {
          await db.execute(sql`
            UPDATE str_records
            SET submission_attempts = submission_attempts + 1,
                last_attempt_at = NOW()
            WHERE id = ${str.id}
          `);
          logger.error(`[STR] Auto-retry failed for ${str.id}: HTTP ${res.status}`);
        }
      } catch (retryErr: any) {
        await db.execute(sql`
          UPDATE str_records
          SET submission_attempts = submission_attempts + 1,
              last_attempt_at = NOW()
          WHERE id = ${str.id}
        `).catch(() => {});
        logger.error(`[STR] Auto-retry error for ${str.id}: ${retryErr.message}`);
      }
    }

    if (approaching.rows.length > 0 || overdue.rows.length > 0) {
      logger.info(`[STR] Monitor: ${approaching.rows.length} approaching deadline, ${overdue.rows.length} overdue auto-retried`);
    }
  } catch (err: any) {
    if (!isSuppressedWorkerError(err) && !err.message?.includes('does not exist') && !err.message?.includes('str_records')) {
      logger.error(`[STR] Deadline monitor error: ${err.message}`);
    }
  }
}

// ─── Interchange Fee Auto-Calculation ────────────────────────────────────────
/**
 * Runs every 5 minutes.
 * Finds completed NIP/card/USSD/Mojaloop transactions that do not yet have an
 * interchange fee record and calculates the fee using the active schedule.
 * Writes results to interchange_fee_records for billing and P&L reporting.
 *
 * Fee formula: fee = (amount_kobo * basis_points / 10000) + fixed_fee_kobo
 * Capped by min_fee_kobo and max_fee_kobo from the schedule.
 */
async function calculatePendingInterchangeFees(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    // Find completed transactions without interchange fee records (last 24h window)
    const pending = await db.execute(sql`
      SELECT t.id, t.merchant_id, t.amount, t.currency, t.payment_method,
             t.card_type, t.card_network, t.created_at
      FROM transactions t
      LEFT JOIN interchange_fee_records ifr ON ifr.transaction_id = t.id
      WHERE t.status = 'completed'
        AND t.created_at >= NOW() - INTERVAL '24 hours'
        AND ifr.id IS NULL
        AND t.payment_method IN ('card', 'nip', 'ussd', 'mojaloop')
      LIMIT 200
    `);

    if (!pending.rows.length) return;

    // Load active interchange schedules
    const schedules = await db.execute(sql`
      SELECT id, scheme, card_type, channel, basis_points, fixed_fee_kobo,
             min_fee_kobo, max_fee_kobo
      FROM interchange_schedule
      WHERE is_active = true
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
    `);

    if (!schedules.rows.length) return; // No schedules configured yet

    let processed = 0;
    for (const tx of pending.rows as any[]) {
      const channel = tx.payment_method;
      const cardType = tx.card_type ?? 'debit';
      const scheme = tx.card_network ?? (channel === 'nip' ? 'nip' : 'verve');
      const amountKobo = Number(tx.amount);

      // Find best matching schedule: exact match first, then progressively looser
      const schedule = (schedules.rows as any[]).find(s =>
        s.channel === channel && s.scheme === scheme && s.card_type === cardType
      ) ?? (schedules.rows as any[]).find(s =>
        s.channel === channel && s.scheme === scheme
      ) ?? (schedules.rows as any[]).find(s =>
        s.channel === channel
      );

      if (!schedule) continue; // No matching schedule — skip this transaction

      // Calculate fee components
      const percentageFeeKobo = Math.round((amountKobo * schedule.basis_points) / 10000);
      const fixedFeeKobo = Number(schedule.fixed_fee_kobo ?? 0);
      let totalFeeKobo = percentageFeeKobo + fixedFeeKobo;
      const minFee = Number(schedule.min_fee_kobo ?? 0);
      const maxFee = Number(schedule.max_fee_kobo ?? 0);
      if (minFee > 0) totalFeeKobo = Math.max(totalFeeKobo, minFee);
      if (maxFee > 0) totalFeeKobo = Math.min(totalFeeKobo, maxFee);

      const billingPeriod = new Date(tx.created_at).toISOString().slice(0, 7); // YYYY-MM
      const recordId = `ifr_${tx.id.replace(/[^a-z0-9]/gi, '').slice(-8)}_${Date.now()}`;

      await db.execute(sql`
        INSERT INTO interchange_fee_records
          (id, transaction_id, merchant_id, schedule_id, scheme, card_type, channel,
           transaction_amount_kobo, fee_kobo, percentage_fee_kobo, fixed_fee_kobo,
           basis_points, billing_period, created_at)
        VALUES
          (${recordId}, ${tx.id}, ${tx.merchant_id}, ${schedule.id}, ${scheme},
           ${cardType}, ${channel}, ${amountKobo}, ${totalFeeKobo},
           ${percentageFeeKobo}, ${fixedFeeKobo}, ${schedule.basis_points},
           ${billingPeriod}, NOW())
        ON CONFLICT DO NOTHING
      `);
      processed++;
    }

    if (processed > 0) {
      logger.info(`[Interchange] Calculated fees for ${processed} transactions`);
    }
  } catch (err: any) {
    if (!isSuppressedWorkerError(err) && !err.message?.includes('does not exist') && !err.message?.includes('interchange')) {
      logger.error(`[Interchange] Fee calculation error: ${err.message}`);
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

  // Loyalty tier auto-promotion — every 6 hours
  setInterval(runLoyaltyTierPromotion, 6 * 60 * 60 * 1000);

  // BNPL overdue alert — every hour
  setInterval(runBnplOverdueAlerts, 60 * 60 * 1000);

  // STR 24h deadline monitor — every 15 minutes
  setInterval(monitorStrDeadlines, 15 * 60 * 1000);

  // Interchange fee auto-calculation — every 5 minutes
  setInterval(calculatePendingInterchangeFees, 5 * 60 * 1000);

  // Run immediately on startup (after a short delay to let DB connect)
  setTimeout(() => {
    executeDueSipPlans().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] SIP initial run: ${e.message}`); });
    autoFreezeEscalatedRings().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] FraudRing initial run: ${e.message}`); });
    checkSettlementSLA().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] SLA initial run: ${e.message}`); });
    runLoyaltyTierPromotion().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] LoyaltyTier initial run: ${e.message}`); });
    runBnplOverdueAlerts().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] BNPL initial run: ${e.message}`); });
    monitorStrDeadlines().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] STR initial run: ${e.message}`); });
    calculatePendingInterchangeFees().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] Interchange initial run: ${e.message}`); });
  }, 15_000);

  logger.info("[Cron] Scheduled jobs started: SIP(5m), FraudRingAutoFreeze(30m), SettlementSLA(15m), LoyaltyTier(6h), BnplOverdue(1h), STRDeadline(15m), InterchangeFee(5m)");
}
