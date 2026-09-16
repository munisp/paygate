/**
 * auditSweepers.ts — Central sweeper module for platform-ops audit fixes.
 *
 * Currently hosts:
 *   - resendMissingReceipts (M9): completed hosted checkout sessions whose
 *     receipt email was never sent get a resend after a 5-minute grace window.
 *
 * Sweepers are registered as cronJobs intervals (see server/cronJobs.ts) with
 * per-run error containment. Each sweeper accepts an optional db override so
 * tests can inject a fake db.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "../logger";

// ─── M9: receipt email retry ─────────────────────────────────────────────────

const RECEIPT_GRACE_MS = 5 * 60 * 1000; // 5 minutes
let warnedMissingReceiptExport = false;

type ReceiptEmailFn = (opts: {
  to: string;
  customerName: string;
  amountKobo: number;
  currency: string;
  reference: string;
  merchantName: string;
  description?: string;
}) => Promise<void>;

/**
 * Resolve the receipt sender: prefer the existing sendReceiptEmail from
 * hostedCheckout via dynamic import (a missing export must never break the
 * sweeper). When the export is absent, fall back to the same email bridge
 * endpoint sendReceiptEmail uses (MIDDLEWARE_BRIDGE_URL/email/send).
 */
async function resolveReceiptSender(): Promise<ReceiptEmailFn | null> {
  try {
    const mod: any = await import("../routers/hostedCheckout");
    if (typeof mod.sendReceiptEmail === "function") {
      return mod.sendReceiptEmail as ReceiptEmailFn;
    }
    if (!warnedMissingReceiptExport) {
      warnedMissingReceiptExport = true;
      logger.warn("[auditSweepers] hostedCheckout does not export sendReceiptEmail — using mirrored email-bridge fallback for receipt resends");
    }
  } catch (err) {
    if (!warnedMissingReceiptExport) {
      warnedMissingReceiptExport = true;
      logger.warn(`[auditSweepers] hostedCheckout import failed (${err instanceof Error ? err.message : err}) — using mirrored email-bridge fallback`);
    }
  }

  // Mirrored fallback — identical endpoint/payload shape as hostedCheckout's
  // sendReceiptEmail.
  return async (opts) => {
    const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
    if (!bridgeUrl && !process.env.SMTP_HOST) return;
    const endpoint = bridgeUrl ? `${bridgeUrl}/email/send` : `http://localhost:${process.env.SMTP_PORT ?? 587}/send`;
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({
        to: opts.to,
        subject: `Payment Receipt — ${opts.reference}`,
        text: `Payment of ${opts.currency} ${(opts.amountKobo / 100).toLocaleString()} to ${opts.merchantName} confirmed. Reference: ${opts.reference}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
  };
}

export interface ReceiptSweepResult {
  candidates: number;
  resent: number;
  failed: number;
}

/**
 * M9: resend receipts for sessions completed > 5 min ago where
 * receipt_email_sent_at IS NULL. Each row is claimed with a guarded UPDATE so
 * concurrent sweepers never double-send; the claim is rolled back when the
 * send fails so the next tick retries.
 */
export async function resendMissingReceipts(dbOverride?: any): Promise<ReceiptSweepResult> {
  const db = dbOverride ?? (await getDb());
  const result: ReceiptSweepResult = { candidates: 0, resent: 0, failed: 0 };
  if (!db) return result;

  const cutoff = new Date(Date.now() - RECEIPT_GRACE_MS);
  let rows: any[] = [];
  try {
    const found = await db.execute(sql`
      SELECT s.id, s.merchant_id, s.customer_email, s.customer_name,
             s.amount_kobo, s.currency, s.reference, s.description,
             COALESCE(m.business_name, 'PayGate Merchant') AS merchant_name
      FROM hosted_payment_sessions s
      LEFT JOIN merchants m ON m.id = s.merchant_id
      WHERE s.status = 'completed'
        AND s.receipt_email_sent_at IS NULL
        AND s.paid_at IS NOT NULL
        AND s.paid_at < ${cutoff}
        AND s.customer_email IS NOT NULL
      ORDER BY s.paid_at
      LIMIT 50
    `);
    rows = (found as any)?.rows ?? (Array.isArray(found) ? found : []);
  } catch (err) {
    logger.error(`[auditSweepers] receipt sweep query failed: ${err instanceof Error ? err.message : err}`);
    return result;
  }

  result.candidates = rows.length;
  if (rows.length === 0) return result;

  const send = await resolveReceiptSender();
  if (!send) {
    logger.warn("[auditSweepers] no receipt sender available — skipping run");
    return result;
  }

  for (const row of rows) {
    // Claim: guarded flip to a sent-marker-in-progress is not available on
    // this column (single timestamp), so claim by stamping receipt_email_sent_at
    // only when still NULL; losers see 0 rows.
    try {
      const claimed = await db.execute(sql`
        UPDATE hosted_payment_sessions
        SET receipt_email_sent_at = NOW(), updated_at = NOW()
        WHERE id = ${row.id} AND receipt_email_sent_at IS NULL
        RETURNING id
      `);
      const claimRows: any[] = (claimed as any)?.rows ?? (Array.isArray(claimed) ? claimed : []);
      if (claimRows.length === 0) continue; // claimed by another instance

      try {
        await send({
          to: row.customer_email,
          customerName: row.customer_name ?? "Customer",
          amountKobo: Number(row.amount_kobo),
          currency: row.currency ?? "NGN",
          reference: row.reference,
          merchantName: row.merchant_name,
          description: row.description ?? undefined,
        });
        result.resent++;
        logger.info(`[auditSweepers] receipt resent for session ${row.id} (${row.reference})`);
      } catch (sendErr) {
        // Roll the claim back so the next tick retries.
        await db.execute(sql`
          UPDATE hosted_payment_sessions
          SET receipt_email_sent_at = NULL, updated_at = NOW()
          WHERE id = ${row.id}
        `).catch((rbErr: Error) =>
          logger.error(`[auditSweepers] CRITICAL: receipt claim rollback failed for ${row.id}: ${rbErr.message}`));
        result.failed++;
        logger.error(`[auditSweepers] receipt resend failed for ${row.id}: ${sendErr instanceof Error ? sendErr.message : sendErr}`);
      }
    } catch (err) {
      result.failed++;
      logger.error(`[auditSweepers] receipt sweep row error (${row.id}): ${err instanceof Error ? err.message : err}`);
    }
  }

  return result;
}
