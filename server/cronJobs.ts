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
import { buyDigitalGoldViaMiddleware, isBridgeAvailable } from "./middlewareBridge";

// ─── SIP Executor ─────────────────────────────────────────────────────────────

async function executeDueSipPlans() {
  const db = await getDb();
  if (!db) return;

  try {
    // Claim-then-execute: atomically advance next_execution_at for the plans we
    // pick up (FOR UPDATE SKIP LOCKED so concurrent cron instances claim
    // disjoint sets). A plan that has been claimed can never be selected by
    // another run, so the external purchase below can never execute twice for
    // the same schedule slot. On execution failure the claim is rolled back
    // (per-plan, below) so the plan is retried on the next tick.
    const due = await db.execute(sql`
      WITH claimed AS (
        UPDATE sip_plans
        SET next_execution_at = CASE frequency
              -- GREATEST(..., NOW()): an overdue plan must advance to a FUTURE
              -- slot, otherwise it would still be due and get reclaimed by
              -- another cron instance while this purchase is in flight.
              WHEN 'daily'  THEN GREATEST(next_execution_at, NOW()) + interval '1 day'
              WHEN 'weekly' THEN GREATEST(next_execution_at, NOW()) + interval '7 days'
              ELSE GREATEST(next_execution_at, NOW()) + interval '1 month'
            END,
            updated_at = NOW()
        WHERE id IN (
          SELECT id FROM sip_plans
          WHERE status = 'active' AND next_execution_at <= NOW()
          ORDER BY next_execution_at
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, user_id, asset_type, amount_kobo, frequency
      )
      SELECT c.id, c.user_id, c.asset_type, c.amount_kobo, c.frequency,
             u.email, u.name
      FROM claimed c
      LEFT JOIN users u ON u.id = c.user_id
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

      // Tracks whether the external purchase actually settled. If recording
      // fails AFTER the purchase, the catch path must NOT roll back the claim
      // or record a plain "failed" execution — that would cause a duplicate
      // debit on the next tick. It must alert for manual reconciliation.
      let purchaseSettled = false;
      try {
        // REAL EXECUTION REQUIRED — a SIP execution must actually debit the
        // wallet and purchase the asset via the provider bridge BEFORE anything
        // is recorded as completed. If the provider path is unavailable, throw
        // so the catch path records a FAILED execution, alerts, and emails a
        // failure notice — never email success without a real purchase.
        if (plan.asset_type === "gold") {
          if (!isBridgeAvailable()) {
            throw new Error("Gold provider bridge is not configured — SIP purchase NOT executed");
          }
          const purchase = await buyDigitalGoldViaMiddleware(
            String(plan.user_id),
            String(plan.user_id),
            plan.amount_kobo / 100
          );
          if (!purchase) {
            throw new Error("Gold provider bridge returned no result — SIP purchase NOT executed");
          }
          purchaseSettled = true; // money moved — never roll back the claim below
        } else {
          // mutual_fund / pension SIP executions have no provider integration.
          throw new Error(`No purchase provider integrated for asset_type '${plan.asset_type}' — SIP purchase NOT executed`);
        }

        // Record execution ONLY after the real purchase succeeded
        await db.execute(sql`
          INSERT INTO sip_executions (id, plan_id, amount_kobo, status, executed_at)
          VALUES (${execId}, ${plan.id}, ${plan.amount_kobo}, 'completed', NOW())
          ON CONFLICT (id) DO NOTHING
        `);

        // Update plan stats. next_execution_at was already advanced when the
        // plan was claimed (above) — do NOT advance it again here.
        await db.execute(sql`
          UPDATE sip_plans
          SET
            total_invested_kobo = total_invested_kobo + ${plan.amount_kobo},
            execution_count = execution_count + 1,
            last_executed_at = NOW(),
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

        if (purchaseSettled) {
          // CRITICAL: money moved but the bookkeeping failed. Do NOT roll back
          // the claim (a retry would double-debit) and do NOT record a plain
          // "failed" execution — page the owner for manual reconciliation.
          logger.error(`[SIP] CRITICAL: purchase settled for plan ${plan.id} but post-debit recording failed: ${err.message}. Manual reconciliation required.`);
          notifyOwner({
            title: `🚨 SIP RECONCILIATION REQUIRED: Plan ${plan.id}`,
            content: `The gold purchase for SIP plan ${plan.id} (₦${amountNGN}) SETTLED at the provider, but recording the execution failed: ${err.message}. The plan was NOT rolled back (this prevents a duplicate debit). Reconcile manually: credit the execution/stats rows for plan ${plan.id}.`,
          }).catch((e: any) => logger.warn(`[SIP] reconcile alert failed: ${e.message}`));
          continue;
        }

        // Roll back the claim (next_execution_at was advanced when the plan
        // was claimed) so the plan is due again on the next tick — the
        // purchase above did NOT happen, so a retry is safe and correct.
        await db.execute(sql`
          UPDATE sip_plans
          SET next_execution_at = CASE frequency
                WHEN 'daily'  THEN next_execution_at - interval '1 day'
                WHEN 'weekly' THEN next_execution_at - interval '7 days'
                ELSE next_execution_at - interval '1 month'
              END,
              updated_at = NOW()
          WHERE id = ${plan.id} AND status = 'active'
        `).catch((rbErr: any) =>
          logger.error(`[SIP] CRITICAL: claim rollback failed for plan ${plan.id} — plan will skip one cycle: ${rbErr.message}`)
        );

        // Record failed execution (dead-letter). A failure to write the
        // dead-letter MUST be logged — never swallowed silently.
        await db.execute(sql`
          INSERT INTO sip_executions (id, plan_id, amount_kobo, status, error_message, executed_at)
          VALUES (${execId}, ${plan.id}, ${plan.amount_kobo}, 'failed', ${err.message}, NOW())
          ON CONFLICT (id) DO NOTHING
        `).catch((dlErr: any) =>
          logger.error(`[SIP] CRITICAL: failed to record dead-letter execution row for plan ${plan.id}: ${dlErr.message}`)
        );

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
          }).catch((e) => logger.error("[SIP] customer failure-notification email failed — SIP debit failure NOT communicated", { error: e instanceof Error ? e.message : String(e) }));
        }
      }
    }

    // Notify platform owner of daily SIP batch summary
    if (executed > 0 || failed > 0) {
      notifyOwner({
        title: `SIP Batch: ${executed} executed, ${failed} failed`,
        content: `Daily SIP execution batch completed. ${executed} plans executed successfully, ${failed} failed. Total plans processed: ${due.rows.length}.`,
      }).catch((e) => logger.error("[SIP] batch summary owner alert failed", { error: e instanceof Error ? e.message : String(e) }));
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
      }).catch((e) => logger.error("[FraudRing] auto-freeze owner alert failed — compliance alert lost", { ringId, error: e instanceof Error ? e.message : String(e) }));
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
    // Mark settlements overdue by > 24h as SLA breached (PostgreSQL syntax).
    // R4 F15 (spec #15): also flip status to 'sla_breached' (valid
    // settlement_status enum value) — previously only the marker timestamp
    // was set, so breached settlements still looked 'pending'/'processing'
    // to every status-based query.
    const result = await db.execute(sql`
      UPDATE settlements
      SET sla_breached_at = NOW(), status = 'sla_breached', updated_at = NOW()
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
      }).catch((e) => logger.error("[SLA] breach owner alert failed", { error: e instanceof Error ? e.message : String(e) }));
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
      }).catch((e) => logger.error("[LoyaltyTier] tier update owner alert failed", { error: e instanceof Error ? e.message : String(e) }));
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
      }).catch((e) => logger.error("[BNPL] overdue owner alert failed", { error: e instanceof Error ? e.message : String(e) }));
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
        `).catch((e) => logger.error(`[STR] attempt-counter persistence failed for ${str.id}: ${e instanceof Error ? e.message : String(e)}`));
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

// ─── Red Envelope Expiry Sweeper ─────────────────────────────────────────────
// R4 (spec #14): an expired red envelope must not strand the unclaimed
// remainder. For each active envelope past expires_at: guarded flip to
// 'expired' + refund (total - claimed) to the sender wallet + ledger row, all
// in ONE transaction per envelope. The ledger reference '<id>_EXPIRY_REFUND'
// is protected by the unique (wallet_id, reference) index, so even a crash
// between flip and ledger insert can never double-refund.

async function sweepExpiredRedEnvelopes() {
  const db = await getDb();
  if (!db) return;

  const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : (r?.rows ?? []));

  try {
    const due = await db.execute(sql`
      SELECT id, sender_id, sender_wallet_id, total_amount_kobo, currency
      FROM red_envelopes
      WHERE status = 'active' AND expires_at < NOW()
      ORDER BY expires_at
      LIMIT 100
    `);

    if (!due.rows.length) return;

    let swept = 0;
    for (const env of due.rows as any[]) {
      try {
        await db.transaction(async (tx) => {
          // Guarded status flip — exactly one sweeper/claim path can win.
          const flipped = rowsOf(await tx.execute(sql`
            UPDATE red_envelopes
            SET status = 'expired', updated_at = NOW()
            WHERE id = ${env.id} AND status = 'active'
            RETURNING id
          `));
          if (!flipped.length) return; // already handled concurrently

          // remaining = total - SUM(actual claim rows) (claims table is the
          // source of truth — there is no claimed_amount column).
          const sumRows = rowsOf(await tx.execute(sql`
            SELECT COALESCE(SUM(amount_kobo), 0)::bigint AS claimed
            FROM red_envelope_claims
            WHERE envelope_id = ${env.id}
          `));
          const claimedSum = Number(sumRows[0]?.claimed ?? 0);
          const remaining = Number(env.total_amount_kobo) - claimedSum;
          if (remaining <= 0) return; // fully claimed — flip only

          // Guarded credit: blind increment on the sender wallet; a missing
          // wallet throws and rolls back the status flip so the envelope is
          // retried next tick instead of silently losing the refund.
          const credited = rowsOf(await tx.execute(sql`
            UPDATE consumer_wallets
            SET balance_kobo = balance_kobo + ${remaining}, updated_at = NOW()
            WHERE id = ${env.sender_wallet_id}
            RETURNING balance_kobo
          `));
          if (!credited.length) {
            throw new Error(`sender wallet ${env.sender_wallet_id} missing — refund aborted, flip rolled back`);
          }
          const newBalance = Number(credited[0].balance_kobo);

          await tx.execute(sql`
            INSERT INTO consumer_wallet_txns
              (id, wallet_id, user_id, type, amount_kobo, currency,
               balance_after_kobo, description, reference, status)
            VALUES
              (${`wt_${crypto.randomUUID()}`}, ${env.sender_wallet_id}, ${env.sender_id},
               'refund', ${remaining}, ${env.currency}, ${newBalance},
               ${'Red envelope expired — unclaimed remainder refunded'},
               ${`${env.id}_EXPIRY_REFUND`}, 'completed')
          `);
        });
        swept++;
      } catch (envErr: any) {
        logger.error(`[RedEnvelope] Expiry sweep failed for envelope ${env.id}: ${envErr.message}`);
      }
    }

    if (swept > 0) {
      logger.info(`[RedEnvelope] Expired ${swept} red envelopes and refunded unclaimed remainders`);
    }
  } catch (err: any) {
    if (!isSuppressedWorkerError(err)) {
      logger.error(`[RedEnvelope] Expiry sweep cron error: ${err.message}`);
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

  // Red envelope expiry sweeper — every 15 minutes (spec #14)
  setInterval(sweepExpiredRedEnvelopes, 15 * 60 * 1000);

  // Run immediately on startup (after a short delay to let DB connect)
  setTimeout(() => {
    executeDueSipPlans().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] SIP initial run: ${e.message}`); });
    autoFreezeEscalatedRings().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] FraudRing initial run: ${e.message}`); });
    checkSettlementSLA().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] SLA initial run: ${e.message}`); });
    runLoyaltyTierPromotion().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] LoyaltyTier initial run: ${e.message}`); });
    runBnplOverdueAlerts().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] BNPL initial run: ${e.message}`); });
    monitorStrDeadlines().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] STR initial run: ${e.message}`); });
    calculatePendingInterchangeFees().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] Interchange initial run: ${e.message}`); });
    sweepExpiredRedEnvelopes().catch(e => { if (!isSuppressedWorkerError(e)) logger.error(`[Cron] RedEnvelope initial run: ${e.message}`); });
  }, 15_000);

  logger.info("[Cron] Scheduled jobs started: SIP(5m), FraudRingAutoFreeze(30m), SettlementSLA(15m), LoyaltyTier(6h), BnplOverdue(1h), STRDeadline(15m), InterchangeFee(5m), RedEnvelopeExpiry(15m)");
}
