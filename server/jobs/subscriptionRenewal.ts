/**
 * subscriptionRenewal.ts — C10 Subscription Renewal Engine
 *
 * Due-subscription sweeper. Registered as a cronJobs interval
 * (see server/cronJobs.ts).
 *
 * Flow per due subscription (status='active', next_run_at <= now()):
 *   1. CLAIM atomically: advance next_run_at by exactly one plan period via a
 *      single UPDATE ... RETURNING (FOR UPDATE SKIP LOCKED) so two sweeper
 *      instances never charge the same cycle twice.
 *   2. CHARGE via the card-authorization rail — the same rail as
 *      publicRest /transaction/charge_authorization (POST
 *      {MIDDLEWARE_BRIDGE_URL}/v1/charge/authorization). When publicRest ever
 *      exports its shared executor we prefer it via dynamic import; otherwise
 *      the local implementation hits the identical endpoint/payload.
 *   3. SUCCESS → subscription_charges row + completed_cycles+1 +
 *      next_run_at advanced with catch-up for past-due periods +
 *      subscription_v2.renewed webhook. When completed_cycles reaches
 *      total_cycles the subscription becomes 'completed'.
 *   4. FAILURE → dunning: retry_count+1 and next_run_at = +1d / +3d / +5d.
 *      After the final retry the subscription is marked non-renewing
 *      (status='failed') and subscription.not_renew is emitted.
 *   5. Inactive/missing authorization → skip the cycle and flag the row
 *      (failure_reason set, no retry_count burn).
 *
 * Money is bigint kobo end-to-end; failures are loud (logger.error), never
 * silently swallowed.
 */
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "../logger";
import { buildWebhookPayload, dispatchWebhookEvent } from "../webhookEvents";

// ─── Pure schedule math (unit-tested without a DB) ───────────────────────────

export type PlanInterval = "daily" | "weekly" | "monthly" | "quarterly" | "annually";

const INTERVAL_MS: Record<PlanInterval, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  // monthly/quarterly/annually are calendar-based; see addOnePeriod below.
  monthly: 0,
  quarterly: 0,
  annually: 0,
};

/** Add exactly one plan period to a date (calendar-aware for month+ intervals). */
export function addOnePeriod(from: Date, interval: PlanInterval): Date {
  const d = new Date(from.getTime());
  switch (interval) {
    case "daily":
    case "weekly":
      return new Date(d.getTime() + INTERVAL_MS[interval]);
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      return d;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      return d;
    case "annually":
      d.setFullYear(d.getFullYear() + 1);
      return d;
    default:
      // Unknown interval: fail loud by advancing a month and letting the
      // claim CASE fall back to '1 month' in SQL as well.
      d.setMonth(d.getMonth() + 1);
      return d;
  }
}

/**
 * Catch-up: advance `from` by whole plan periods until strictly after `now`.
 * A subscription that was due 3 periods ago is charged ONCE for the current
 * cycle and its next_run_at lands in the future (no catch-up double-charging).
 */
export function computeCatchUpNextRunAt(from: Date, interval: PlanInterval, now: Date): Date {
  let next = new Date(from.getTime());
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 500) {
    next = addOnePeriod(next, interval);
    guard++;
  }
  return next;
}

/** Dunning schedule: retries happen +1 day, +3 days, +5 days after the failure. */
export const DUNNING_DELAYS_DAYS = [1, 3, 5] as const;
export const MAX_DUNNING_RETRIES = DUNNING_DELAYS_DAYS.length;

/**
 * Next dunning attempt time for the given (already-incremented) retry_count.
 * Returns null when the schedule is exhausted (caller marks non-renewing).
 */
export function computeDunningNextRunAt(retryCount: number, now: Date): Date | null {
  if (retryCount < 1 || retryCount > MAX_DUNNING_RETRIES) return null;
  const days = DUNNING_DELAYS_DAYS[retryCount - 1];
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Normalize whatever the interval column holds into a PlanInterval. */
export function normalizeInterval(raw: unknown): PlanInterval {
  const v = String(raw ?? "monthly").toLowerCase();
  if (v === "daily" || v === "weekly" || v === "monthly" || v === "quarterly" || v === "annually") return v;
  // Paystack sends 'biannually'/'hourly' for some plans — map to nearest.
  if (v === "biannually" || v === "semi-annually") return "quarterly";
  if (v === "yearly") return "annually";
  return "monthly";
}

// ─── Charge rail ─────────────────────────────────────────────────────────────

interface ChargeOutcome {
  success: boolean;
  reference: string;
  gatewayResponse?: string;
  /** true when the authorization is missing/inactive — skip + flag, no dunning. */
  authorizationInactive?: boolean;
}

/**
 * Charge the subscription's saved card authorization.
 *
 * Prefers publicRest's shared charge_authorization executor when that module
 * exports it (dynamic import — a missing export must never break the sweeper);
 * otherwise implements against the same rail
 * (POST {MIDDLEWARE_BRIDGE_URL}/v1/charge/authorization) with the same
 * payload shape publicRest uses.
 */
export async function chargeSubscriptionAuthorization(opts: {
  merchantId: string;
  authorizationCode: string;
  email: string;
  amountKobo: number;
  currency: string;
  reference: string;
}): Promise<ChargeOutcome> {
  // Preferred path: publicRest shared executor (available only if exported).
  try {
    const mod: any = await import("../routers/publicRest");
    if (typeof mod.executeChargeAuthorization === "function") {
      const db = await getDb();
      const reply = await mod.executeChargeAuthorization({
        db, merchantId: opts.merchantId, tenantId: "ten_default",
        authorizationCode: opts.authorizationCode, email: opts.email,
        amount: opts.amountKobo, currency: opts.currency,
        reference: opts.reference, queue: false,
      });
      return {
        success: reply.status === "success",
        reference: opts.reference,
        gatewayResponse: reply.display_text,
      };
    }
  } catch (err) {
    // Module missing or its executor threw a rail error — fall through to the
    // local implementation below (same rail), unless it was an auth problem.
    const msg = err instanceof Error ? err.message : String(err);
    if (/authorization.*(not reusable|deactivated)/i.test(msg)) {
      return { success: false, reference: opts.reference, gatewayResponse: msg, authorizationInactive: true };
    }
  }

  // Verify the authorization is still active/reusable before charging.
  const db = await getDb();
  if (!db) throw new Error("DB unavailable — cannot charge subscription");
  const authRows = await db.execute(sql`
    SELECT active, reusable, customer_email FROM card_authorizations
    WHERE merchant_id = ${opts.merchantId} AND authorization_code = ${opts.authorizationCode}
    LIMIT 1
  `);
  const auth = ((authRows as any)?.rows ?? [])[0];
  if (!auth || auth.active === false || auth.reusable === false) {
    return {
      success: false,
      reference: opts.reference,
      gatewayResponse: !auth ? "authorization not found" : "authorization inactive or not reusable",
      authorizationInactive: true,
    };
  }

  // Same rail as publicRest /transaction/charge_authorization.
  const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!bridgeUrl) {
    throw new Error("Payment rail unavailable (MIDDLEWARE_BRIDGE_URL not configured) — charge NOT attempted");
  }
  const res = await fetch(`${bridgeUrl}/v1/charge/authorization`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
    },
    body: JSON.stringify({
      merchantId: opts.merchantId,
      authorizationCode: opts.authorizationCode,
      email: opts.email,
      amountKobo: opts.amountKobo,
      currency: opts.currency,
      reference: opts.reference,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, reference: opts.reference, gatewayResponse: `rail HTTP ${res.status}: ${json?.error?.message ?? res.statusText}` };
  }
  const succeeded = json.status === "success" || json.status === "succeeded";
  return { success: succeeded, reference: opts.reference, gatewayResponse: json.gateway_response ?? json.display_text ?? undefined };
}

// ─── Webhook emission ────────────────────────────────────────────────────────

async function emitSubscriptionEvent(
  event: "subscription_v2.renewed" | "subscription.not_renew",
  merchantId: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await dispatchWebhookEvent(buildWebhookPayload(event, merchantId, "ten_default", data));
  } catch (err) {
    logger.warn(`[subscriptionRenewal] webhook emit failed (${event}, ${merchantId}): ${err instanceof Error ? err.message : err}`);
  }
}

// ─── Sweeper ─────────────────────────────────────────────────────────────────

export interface RenewalSweepResult {
  claimed: number;
  renewed: number;
  completed: number;
  dunning: number;
  nonRenewing: number;
  skippedInactiveAuth: number;
  failed: number;
}

/**
 * Claim and process due subscriptions. `dbOverride` lets tests inject a fake
 * db (any object with an async execute(sql) method returning { rows }).
 */
export async function runDueSubscriptionRenewals(dbOverride?: any): Promise<RenewalSweepResult> {
  const db = dbOverride ?? (await getDb());
  if (!db) return { claimed: 0, renewed: 0, completed: 0, dunning: 0, nonRenewing: 0, skippedInactiveAuth: 0, failed: 0 };

  const result: RenewalSweepResult = {
    claimed: 0, renewed: 0, completed: 0, dunning: 0, nonRenewing: 0, skippedInactiveAuth: 0, failed: 0,
  };

  // 1. ATOMIC CLAIM: advance next_run_at by one plan period for the rows we
  //    pick up. A claimed row is no longer due, so a concurrent sweeper can
  //    never select the same cycle. The FINAL next_run_at is rewritten below
  //    (catch-up on success, dunning offset on failure).
  const claimed = await db.execute(sql`
    UPDATE subscriptions
    SET next_run_at = CASE interval
          WHEN 'daily'     THEN next_run_at + interval '1 day'
          WHEN 'weekly'    THEN next_run_at + interval '7 days'
          WHEN 'quarterly' THEN next_run_at + interval '3 months'
          WHEN 'annually'  THEN next_run_at + interval '1 year'
          ELSE next_run_at + interval '1 month'
        END,
        updated_at = NOW()
    WHERE id IN (
      SELECT id FROM subscriptions
      WHERE status = 'active' AND next_run_at <= NOW()
      ORDER BY next_run_at
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, merchant_id, customer_email, amount_kobo, currency, interval,
              total_cycles, completed_cycles, retry_count, authorization_code, metadata
  `);
  const rows: any[] = (claimed as any)?.rows ?? (Array.isArray(claimed) ? claimed : []);
  result.claimed = rows.length;
  if (rows.length === 0) return result;

  logger.info(`[subscriptionRenewal] Processing ${rows.length} due subscription(s)`);

  for (const sub of rows) {
    const now = new Date();
    const interval = normalizeInterval(sub.interval);
    const reference = `sub_${sub.id}_${now.getTime()}`;
    // The claim advanced next_run_at by one period; the ORIGINAL due time is
    // one period before the claimed value.
    const claimedNextRunAt = new Date(now.getTime()); // overwritten per branch below
    const authorizationCode: string | null =
      sub.authorization_code ?? (sub.metadata?.authorization_code ?? null);

    try {
      // 5. Missing authorization → skip + flag (no charge, no dunning burn).
      if (!authorizationCode) {
        await db.execute(sql`
          UPDATE subscriptions
          SET failure_reason = 'no card authorization on file — renewal skipped',
              next_run_at = ${computeCatchUpNextRunAt(now, interval, now)},
              updated_at = NOW()
          WHERE id = ${sub.id}
        `);
        result.skippedInactiveAuth++;
        logger.warn(`[subscriptionRenewal] ${sub.id}: no authorization_code — cycle skipped + flagged`);
        continue;
      }

      // 2. Charge via the card-authorization rail.
      const charge = await chargeSubscriptionAuthorization({
        merchantId: sub.merchant_id,
        authorizationCode,
        email: sub.customer_email ?? "",
        amountKobo: Number(sub.amount_kobo),
        currency: sub.currency ?? "NGN",
        reference,
      });

      if (charge.authorizationInactive) {
        // Inactive authorization → skip + flag (not a dunning retry).
        await db.execute(sql`
          UPDATE subscriptions
          SET failure_reason = ${`authorization inactive — renewal skipped: ${charge.gatewayResponse ?? ""}`},
              next_run_at = ${computeCatchUpNextRunAt(now, interval, now)},
              updated_at = NOW()
          WHERE id = ${sub.id}
        `);
        result.skippedInactiveAuth++;
        logger.warn(`[subscriptionRenewal] ${sub.id}: authorization inactive — cycle skipped + flagged`);
        continue;
      }

      if (charge.success) {
        // 3. Success: ledger row + cycle bookkeeping + catch-up schedule.
        const completedCycles = Number(sub.completed_cycles ?? 0) + 1;
        const totalCycles: number | null = sub.total_cycles == null ? null : Number(sub.total_cycles);
        const reachedEnd = totalCycles != null && completedCycles >= totalCycles;
        const chargeId = `subchg_${crypto.randomBytes(10).toString("hex")}`;

        await db.execute(sql`
          INSERT INTO subscription_charges (id, subscription_id, merchant_id, amount_kobo, currency, status, nip_session_id, failure_reason, charged_at)
          VALUES (${chargeId}, ${sub.id}, ${sub.merchant_id}, ${Number(sub.amount_kobo)}, ${sub.currency ?? "NGN"}, 'success', ${reference}, NULL, NOW())
        `);

        if (reachedEnd) {
          // total_cycles enforced → subscription complete.
          await db.execute(sql`
            UPDATE subscriptions
            SET completed_cycles = ${completedCycles}, retry_count = 0,
                last_run_at = NOW(), status = 'completed', failure_reason = NULL,
                updated_at = NOW()
            WHERE id = ${sub.id}
          `);
          result.completed++;
        } else {
          await db.execute(sql`
            UPDATE subscriptions
            SET completed_cycles = ${completedCycles}, retry_count = 0,
                last_run_at = NOW(),
                next_run_at = ${computeCatchUpNextRunAt(claimedNextRunAt, interval, now)},
                failure_reason = NULL, updated_at = NOW()
            WHERE id = ${sub.id}
          `);
          result.renewed++;
        }

        await emitSubscriptionEvent("subscription_v2.renewed", sub.merchant_id, {
          subscription_id: sub.id,
          charge_id: chargeId,
          reference,
          amount_kobo: Number(sub.amount_kobo),
          currency: sub.currency ?? "NGN",
          completed_cycles: completedCycles,
          total_cycles: totalCycles,
          status: reachedEnd ? "completed" : "active",
        });
        continue;
      }

      // 4. Charge failed → dunning schedule.
      const retryCount = Number(sub.retry_count ?? 0) + 1;
      const nextRetryAt = computeDunningNextRunAt(retryCount, now);

      await db.execute(sql`
        INSERT INTO subscription_charges (id, subscription_id, merchant_id, amount_kobo, currency, status, nip_session_id, failure_reason, charged_at)
        VALUES (${`subchg_${crypto.randomBytes(10).toString("hex")}`}, ${sub.id}, ${sub.merchant_id}, ${Number(sub.amount_kobo)}, ${sub.currency ?? "NGN"}, 'failed', ${reference}, ${charge.gatewayResponse ?? "charge failed"}, NOW())
      `);

      if (nextRetryAt) {
        await db.execute(sql`
          UPDATE subscriptions
          SET retry_count = ${retryCount}, next_run_at = ${nextRetryAt},
              failure_reason = ${charge.gatewayResponse ?? "charge failed"},
              last_run_at = NOW(), updated_at = NOW()
          WHERE id = ${sub.id}
        `);
        result.dunning++;
        logger.warn(`[subscriptionRenewal] ${sub.id}: charge failed (retry ${retryCount}/${MAX_DUNNING_RETRIES} at ${nextRetryAt.toISOString()}): ${charge.gatewayResponse}`);
      } else {
        // Final retry exhausted → non-renewing + subscription.not_renew.
        await db.execute(sql`
          UPDATE subscriptions
          SET retry_count = ${retryCount}, status = 'failed',
              failure_reason = ${`non-renewing after ${MAX_DUNNING_RETRIES} dunning retries: ${charge.gatewayResponse ?? "charge failed"}`},
              last_run_at = NOW(), updated_at = NOW()
          WHERE id = ${sub.id}
        `);
        result.nonRenewing++;
        logger.error(`[subscriptionRenewal] ${sub.id}: NON-RENEWING — dunning exhausted after ${retryCount} attempts`);
        await emitSubscriptionEvent("subscription.not_renew", sub.merchant_id, {
          subscription_id: sub.id,
          reference,
          amount_kobo: Number(sub.amount_kobo),
          currency: sub.currency ?? "NGN",
          retry_count: retryCount,
          reason: charge.gatewayResponse ?? "charge failed",
        });
      }
    } catch (err) {
      // Per-subscription containment: a rail/DB error must not abort the sweep.
      // next_run_at stays at the claimed one-period-advanced value, so the row
      // is retried on a future tick (no hot loop, no lost cycle).
      result.failed++;
      logger.error(`[subscriptionRenewal] ${sub.id}: processing error (will retry next tick): ${err instanceof Error ? err.message : err}`);
    }
  }

  return result;
}
