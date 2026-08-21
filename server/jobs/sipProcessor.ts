/**
 * sipProcessor.ts
 * Gold SIP (Systematic Investment Plan) Auto-Debit Background Job
 *
 * Runs daily at 09:00 WAT (08:00 UTC) via cron.
 * Queries all active SIP plans due today, executes gold purchases,
 * updates plan records, and sends push notifications to merchants.
 *
 * Cron expression: 0 8 * * *  (08:00 UTC daily)
 */

import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { logger } from "../logger";
import { isBridgeAvailable, buyDigitalGoldViaMiddleware } from "../middlewareBridge";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SIPPlan {
  id: string;
  merchantId: string;
  userId: string;
  monthlyAmountNGN: number;
  frequency: "daily" | "weekly" | "monthly";
  dayOfMonth: number;
  status: "active" | "paused" | "cancelled";
  nextDebitAt: Date;
  totalGramsAccumulated: number;
  totalInvestedNGN: number;
  runCount: number;
  lastRunAt: Date | null;
  createdAt: Date;
}

export interface SIPProcessorResult {
  processed: number;
  succeeded: number;
  failed: number;
  totalGramsPurchased: number;
  totalNGNInvested: number;
  errors: Array<{ planId: string; error: string }>;
}

// ─── Gold Price Oracle ────────────────────────────────────────────────────────

let _cachedGoldPriceNGN: number = 0; // 0 = no real price fetched yet — must never trade on a seed value
let _goldPriceLastFetched = 0;
const GOLD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch live gold price from the middleware bridge or metals-api.
 * Falls back to the last known cached value (never returns a random number).
 */
export async function fetchAndCacheGoldPrice(): Promise<number> {
  const now = Date.now();
  if (now - _goldPriceLastFetched < GOLD_CACHE_TTL_MS) return _cachedGoldPriceNGN;
  try {
    const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
    if (bridgeUrl) {
      const res = await fetch(`${bridgeUrl}/market/gold-price-ngn`, {
        headers: { "x-internal-key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "" },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json() as { priceNgnPerGram?: number };
        if (data?.priceNgnPerGram && data.priceNgnPerGram > 0) {
          _cachedGoldPriceNGN = data.priceNgnPerGram;
          _goldPriceLastFetched = now;
        }
      }
    }
  } catch {
    // Network error — keep last cached value
  }
  return _cachedGoldPriceNGN;
}

/**
 * Returns the last real cached gold price. NO random jitter — an execution
 * price must be a real quote. Returns 0 when no real price has been fetched;
 * callers MUST treat 0 as "no price available" and refuse to execute.
 */
export function getGoldPriceNGN(): number {
  return _cachedGoldPriceNGN;
}

// ─── SIP Due Date Calculator ──────────────────────────────────────────────────

export function calculateNextDebitDate(
  plan: Pick<SIPPlan, "frequency" | "dayOfMonth">,
  from: Date = new Date()
): Date {
  const next = new Date(from);
  switch (plan.frequency) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
    default:
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(Math.min(plan.dayOfMonth, 28)); // Cap at 28 to avoid month overflow
      break;
  }
  next.setUTCHours(8, 0, 0, 0); // Always debit at 08:00 UTC
  return next;
}

export function isSIPDueToday(plan: Pick<SIPPlan, "nextDebitAt">): boolean {
  const now = new Date();
  const debitDate = new Date(plan.nextDebitAt);
  return (
    debitDate.getUTCFullYear() === now.getUTCFullYear() &&
    debitDate.getUTCMonth() === now.getUTCMonth() &&
    debitDate.getUTCDate() === now.getUTCDate()
  );
}

// ─── SIP Execution ────────────────────────────────────────────────────────────

/**
 * Execute one SIP plan. FAILS LOUD when the gold provider is unavailable or
 * returns an incomplete fill — grams and txId are only ever returned from a
 * real confirmed purchase. Callers must record the failure and alert.
 */
export async function executeSIPPlan(
  plan: SIPPlan,
  goldPriceNGN: number
): Promise<{ grams: number; amountNGN: number; txId: string }> {
  const amountNGN = plan.monthlyAmountNGN;
  if (!goldPriceNGN || goldPriceNGN <= 0) {
    throw new Error("No real gold price available — SIP execution refused");
  }

  if (!isBridgeAvailable()) {
    throw new Error("Gold provider bridge is not configured — SIP purchase NOT executed");
  }

  // Bridge signature is (merchantId, customerId, amountNGN) — merchant first.
  const result = await buyDigitalGoldViaMiddleware(
    plan.merchantId,
    plan.userId,
    amountNGN
  );
  if (!result || !result.txId) {
    throw new Error("Gold provider bridge returned no confirmed fill — SIP purchase NOT executed");
  }

  return {
    grams: result.grams ?? amountNGN / goldPriceNGN,
    amountNGN,
    txId: result.txId,
  };
}

// ─── Main Processor ───────────────────────────────────────────────────────────

export async function processDueSIPs(): Promise<SIPProcessorResult> {
  const result: SIPProcessorResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    totalGramsPurchased: 0,
    totalNGNInvested: 0,
    errors: [],
  };

  const db = await getDb();
  if (!db) {
    logger.warn("SIP Processor: DB unavailable, skipping run");
    return result;
  }

  // Refresh the real gold price before executing; abort the run loudly when
  // no real quote can be obtained rather than trading on a fabricated price.
  const goldPrice = await fetchAndCacheGoldPrice();
  if (!goldPrice || goldPrice <= 0) {
    const msg = "SIP Processor: ABORTING run — no real gold price available from the provider bridge";
    logger.error(msg);
    await notifyOwner({
      title: "Gold SIP Run Aborted: No Price Feed",
      content: `${msg}. ${result.processed} plan(s) were NOT executed. Manual intervention required.`,
    }).catch(() => {});
    result.errors.push({ planId: "*", error: msg });
    return result;
  }
  logger.info(`SIP Processor: Starting run. Gold price: ₦${goldPrice.toLocaleString()}/g`);

  try {
    // Query active SIP plans due today from gold_sip_plans table
    const duePlans: SIPPlan[] = await getDueSIPPlans(db);

    logger.info(`SIP Processor: Found ${duePlans.length} plans due today`);

    for (const plan of duePlans) {
      result.processed++;
      // Tracks whether the external purchase actually settled — a failure
      // AFTER settlement is a reconciliation emergency, not a "failed debit",
      // and must be messaged as such (the plan was already claimed, so there
      // is no double-debit risk, but the totals are stranded until reconciled).
      let purchaseSettled = false;
      try {
        const { grams, amountNGN, txId } = await executeSIPPlan(plan, goldPrice);
        purchaseSettled = true;

        // Money has moved. Update the plan totals — this MUST NOT fail
        // silently: updateSIPPlanAfterExecution throws on any DB error so the
        // failure path below records the stranded state and alerts the owner.
        // The plan's next_run_at was already advanced atomically at claim time
        // (see getDueSIPPlans), so a retry can never double-debit this plan.
        await updateSIPPlanAfterExecution(db, plan.id, {
          totalGramsAccumulated: plan.totalGramsAccumulated + grams,
          totalInvestedNGN: plan.totalInvestedNGN + amountNGN,
          runCount: plan.runCount + 1,
          lastRunAt: new Date(),
          nextDebitAt: calculateNextDebitDate(plan),
        });

        result.succeeded++;
        result.totalGramsPurchased += grams;
        result.totalNGNInvested += amountNGN;

        logger.info(
          `SIP Processor: Plan ${plan.id} executed. ` +
          `Purchased ${grams.toFixed(4)}g for ₦${amountNGN.toLocaleString()} (txId: ${txId})`
        );

        // Send push notification
        await notifyOwner({
          title: `Gold SIP Executed: ${grams.toFixed(4)}g purchased`,
          content:
            `SIP plan ${plan.id} auto-debit successful. ` +
            `Purchased ${grams.toFixed(4)} grams of gold for ₦${amountNGN.toLocaleString()} ` +
            `at ₦${goldPrice.toLocaleString()}/g. ` +
            `Total accumulated: ${(plan.totalGramsAccumulated + grams).toFixed(4)}g.`,
        }).catch(() => {}); // Non-blocking

      } catch (err) {
        result.failed++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.errors.push({ planId: plan.id, error: errorMsg });
        logger.error(`SIP Processor: Plan ${plan.id} failed: ${errorMsg}`);

        if (purchaseSettled) {
          // Money MOVED but bookkeeping failed — reconciliation emergency.
          // Do NOT message this as a failed debit; the debit succeeded.
          await notifyOwner({
            title: `🚨 Gold SIP RECONCILIATION REQUIRED: Plan ${plan.id}`,
            content:
              `The gold purchase for SIP plan ${plan.id} SETTLED at the provider, but the ` +
              `post-debit plan update failed: ${errorMsg}. The plan was already claimed ` +
              `(no duplicate debit can occur), but its totals are stale. Reconcile manually.`,
          }).catch(() => {});
        } else {
          // Notify owner of failure
          await notifyOwner({
            title: `Gold SIP Failed: Plan ${plan.id}`,
            content: `Auto-debit failed for SIP plan ${plan.id}: ${errorMsg}. Manual intervention may be required.`,
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    // FAIL LOUD — a fatal run error (e.g. the claim query failed) must
    // propagate to the scheduler/operator, not vanish into a log line.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`SIP Processor: Fatal error: ${msg}`);
    result.errors.push({ planId: "*", error: msg });
    throw err;
  }

  logger.info(
    `SIP Processor: Complete. ` +
    `Processed: ${result.processed}, Succeeded: ${result.succeeded}, Failed: ${result.failed}. ` +
    `Total: ${result.totalGramsPurchased.toFixed(4)}g / ₦${result.totalNGNInvested.toLocaleString()}`
  );

  return result;
}

// ─── DB Helpers (production-ready — wired to gold_sip_plans schema) ──────────────

/**
 * Map a gold_sip_plans row (snake_case from raw SQL) onto the SIPPlan shape.
 * The table stores kobo (NGN minor units); SIPPlan works in naira.
 */
function rowToSIPPlan(row: any): SIPPlan {
  const nextRunAt = row.next_run_at ?? row.nextRunAt ?? null;
  return {
    id: String(row.id),
    merchantId: String(row.merchant_id ?? row.merchantId),
    // gold_sip_plans has no separate user column — the merchant IS the investor.
    userId: String(row.merchant_id ?? row.merchantId),
    monthlyAmountNGN: Number(row.amount_kobo ?? row.amountKobo ?? 0) / 100,
    frequency: (row.frequency ?? "monthly") as SIPPlan["frequency"],
    dayOfMonth: nextRunAt ? new Date(nextRunAt).getUTCDate() : 1,
    status: (row.status ?? "active") as SIPPlan["status"],
    nextDebitAt: nextRunAt ? new Date(nextRunAt) : new Date(),
    totalGramsAccumulated: Number(row.total_gold_grams ?? row.totalGoldGrams ?? 0),
    totalInvestedNGN: Number(row.total_invested_kobo ?? row.totalInvestedKobo ?? 0) / 100,
    runCount: 0,
    lastRunAt: null,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

/**
 * Claim-then-execute: atomically advance next_run_at for every plan due today
 * and return the claimed rows. This is the idempotency guard for the external
 * gold purchase — once claimed, no concurrent cron instance (or retry of this
 * run) can select the same plan, so a plan can never be double-debited.
 * FOR UPDATE SKIP LOCKED makes two racing pollers claim disjoint sets.
 *
 * FAILS LOUD: a query error throws (it previously returned [], silently
 * skipping every due debit for the day).
 */
async function getDueSIPPlans(db: any): Promise<SIPPlan[]> {
  const { sql } = await import("drizzle-orm");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  let rows: any[];
  try {
    const res = await db.execute(sql`
      UPDATE gold_sip_plans
      SET next_run_at = CASE frequency
            WHEN 'daily'  THEN next_run_at + interval '1 day'
            WHEN 'weekly' THEN next_run_at + interval '7 days'
            ELSE next_run_at + interval '1 month'
          END,
          updated_at = now()
      WHERE id IN (
        SELECT id FROM gold_sip_plans
        WHERE status = 'active'
          AND next_run_at >= ${today}
          AND next_run_at < ${tomorrow}
        ORDER BY next_run_at
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    rows = ((res as any)?.rows ?? res ?? []) as any[];
  } catch (err) {
    // Table missing in a pre-migration environment → no plans, but LOG it;
    // any other failure is thrown so the run aborts loudly.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("gold_sip_plans") && msg.includes("does not exist")) {
      logger.warn("SIP Processor: gold_sip_plans table not migrated yet — skipping run");
      return [];
    }
    throw new Error(`SIP Processor: failed to claim due plans: ${msg}`);
  }
  return rows.map(rowToSIPPlan);
}

/**
 * Post-debit plan update. Money has ALREADY moved when this runs, so a silent
 * failure here strands state (totals never recorded) and, worse, used to be
 * swallowed entirely. This function FAILS LOUD: it logs and rethrows so the
 * caller records the plan as failed and alerts the owner for manual
 * reconciliation. The update is guarded (RETURNING) so a missing/inactive
 * plan row is an error, not a no-op.
 */
async function updateSIPPlanAfterExecution(
  db: any,
  planId: string,
  updates: Partial<SIPPlan>
): Promise<void> {
  const { sql } = await import("drizzle-orm");
  try {
    const res = await db.execute(sql`
      UPDATE gold_sip_plans
      SET total_gold_grams = ${String(updates.totalGramsAccumulated ?? 0)},
          total_invested_kobo = ${Math.round((updates.totalInvestedNGN ?? 0) * 100)},
          updated_at = now()
      WHERE id = ${planId} AND status = 'active'
      RETURNING id
    `);
    const rows = ((res as any)?.rows ?? res ?? []) as any[];
    if (rows.length === 0) {
      throw new Error(`no active gold_sip_plans row matched id=${planId}`);
    }
  } catch (err) {
    // FAIL LOUD — the gold purchase already settled; swallowing this strands
    // the execution state. Rethrow so the run marks the plan failed and the
    // owner is alerted. The plan's next_run_at was advanced at claim time,
    // so this can never cause a duplicate debit on retry.
    logger.error(
      `SIP Processor: CRITICAL — post-debit update failed for plan ${planId} ` +
      `after money moved: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}

// ─── Cron Scheduler ──────────────────────────────────────────────────────────

let sipCronInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the SIP processor cron job.
 * Runs daily at 08:00 UTC (09:00 WAT).
 * Call this from server startup (index.ts).
 */
export function startSIPProcessor(): void {
  if (sipCronInterval) return; // Already running

  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Calculate ms until next 08:00 UTC
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setUTCHours(8, 0, 0, 0);
  if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  const msUntilFirstRun = nextRun.getTime() - now.getTime();

  logger.info(
    `SIP Processor: Scheduled. First run in ${Math.round(msUntilFirstRun / 60000)} minutes ` +
    `(${nextRun.toISOString()})`
  );

  // First run at 08:00 UTC, then every 24h
  setTimeout(() => {
    processDueSIPs().catch((e) =>
      logger.error(`SIP Processor: Unhandled error: ${e?.message}`)
    );
    sipCronInterval = setInterval(() => {
      processDueSIPs().catch((e) =>
        logger.error(`SIP Processor: Unhandled error: ${e?.message}`)
      );
    }, INTERVAL_MS);
  }, msUntilFirstRun);
}

export function stopSIPProcessor(): void {
  if (sipCronInterval) {
    clearInterval(sipCronInterval);
    sipCronInterval = null;
    logger.info("SIP Processor: Stopped");
  }
}
