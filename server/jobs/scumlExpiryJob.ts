/**
 * SCUML Expiry Nightly Job — Fix 5
 *
 * Endpoint: POST /api/scheduled/scuml-expiry-check
 * Schedule: 0 30 6 * * * (daily at 06:30 UTC — before business hours)
 *
 * This handler:
 *  1. Authenticates the Heartbeat cron caller.
 *  2. Queries all SCUML checks expiring within 30 days (warning) or already expired.
 *  3. Sends an owner notification for each affected merchant.
 *  4. Publishes a `scuml.expiry.warning` or `scuml.expiry.lapsed` Kafka event per record.
 *  5. Returns a summary of affected merchants and records processed.
 *
 * The job is idempotent — re-running it on the same day will re-send notifications
 * only if the SCUML check is still in the expiry window.
 */

import type { Request, Response } from "express";
import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { publishEvent, KAFKA_TOPICS } from "../kafkaClient";
import { logger } from "../logger";
// Cron authentication uses direct header check instead of sdk
import { scumlChecks } from "../../drizzle/schema";
import { and, lte, eq, gte, inArray } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────
const WARNING_DAYS = 30;  // notify when expiry is within 30 days
const CRITICAL_DAYS = 7;  // escalate when expiry is within 7 days

// ─── Job Handler ──────────────────────────────────────────────────────────────
export async function scumlExpiryJobHandler(req: Request, res: Response) {
  try {
    // ── Auth: only the Heartbeat cron caller may invoke this endpoint ──────────
    const authHeader = req.headers.authorization ?? "";
    const apiKey = process.env.BUILT_IN_FORGE_API_KEY ?? "";
    const internalKey = process.env.MIDDLEWARE_INTERNAL_KEY ?? "";
    // R4 F12: fail CLOSED — each comparison is gated on the key being
    // non-empty, so an unset env var can never be matched by an empty/forged
    // header (securityAuditJob.ts pattern).
    const isCron =
      (apiKey !== "" && authHeader === `Bearer ${apiKey}`) ||
      (internalKey !== "" && authHeader === `Bearer ${internalKey}`) ||
      (apiKey !== "" && req.headers["x-cron-secret"] === apiKey);
    if (!isCron) {
      logger.warn("scuml_expiry_job: rejected unauthenticated invocation (cron keys unset or mismatch)");
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    const db = await getDb();
    if (!db) {
      logger.error("scuml_expiry_job", { message: "Database unavailable" });
      return res.status(503).json({ error: "Database unavailable" });
    }

    const now = new Date();
    const warningCutoff = new Date(now.getTime() + WARNING_DAYS * 86_400_000);
    const criticalCutoff = new Date(now.getTime() + CRITICAL_DAYS * 86_400_000);

    // ── Query 1: Already expired (expiresAt < now, status = 'cleared') ────────
    const expiredRows = await db
      .select()
      .from(scumlChecks)
      .where(
        and(
          lte(scumlChecks.expiresAt, now),
          eq(scumlChecks.status, "cleared"),
        )
      )
      .limit(200);

    // ── Query 2: Expiring within WARNING_DAYS (not yet expired) ───────────────
    const expiringRows = await db
      .select()
      .from(scumlChecks)
      .where(
        and(
          gte(scumlChecks.expiresAt, now),
          lte(scumlChecks.expiresAt, warningCutoff),
          eq(scumlChecks.status, "cleared"),
        )
      )
      .limit(200);

    const allAffected = [
      ...expiredRows.map(r => ({ ...r, eventType: "scuml.expiry.lapsed" as const })),
      ...expiringRows.map(r => ({
        ...r,
        eventType: (r.expiresAt && r.expiresAt <= criticalCutoff
          ? "scuml.expiry.critical"
          : "scuml.expiry.warning") as "scuml.expiry.critical" | "scuml.expiry.warning",
      })),
    ];

    if (allAffected.length === 0) {
      logger.info("scuml_expiry_job", { message: "No expiring or lapsed SCUML registrations found" });
      return res.json({ ok: true, processed: 0, expired: 0, expiring: 0 });
    }

    let notified = 0;
    let kafkaPublished = 0;

    for (const record of allAffected) {
      const daysUntilExpiry = record.expiresAt
        ? Math.ceil((record.expiresAt.getTime() - now.getTime()) / 86_400_000)
        : 0;

      const isLapsed = record.eventType === "scuml.expiry.lapsed";
      const isCritical = record.eventType === "scuml.expiry.critical";

      // ── Owner notification ─────────────────────────────────────────────────
      try {
        await notifyOwner({ title: isLapsed
            ? "SCUML Registration Lapsed — Action Required"
            : isCritical
              ? `SCUML Registration Expires in ${daysUntilExpiry} Day${daysUntilExpiry === 1 ? "" : "s"} — Urgent`
              : `SCUML Registration Expiring in ${daysUntilExpiry} Days`, content: isLapsed
            ? `Your SCUML registration (ref: ${record.scumlRef ?? "N/A" }) for ${record.entityName} has lapsed. ` +
              `You must renew immediately to remain compliant with CBN AML/CFT regulations. ` +
              `Failure to renew may result in suspension of payment processing.`
            : `Your SCUML registration (ref: ${record.scumlRef ?? "N/A"}) for ${record.entityName} expires on ` +
              `${record.expiresAt?.toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" })}. ` +
              `Please initiate renewal to avoid disruption to your payment services.` });
        notified++;
      } catch (err) {
        logger.warn("scuml_expiry_job", {
          message: "Failed to send owner notification",
          merchantId: record.merchantId,
          scumlCheckId: record.id,
          error: String(err),
        });
      }

      // ── Kafka event ────────────────────────────────────────────────────────
      publishEvent(
        KAFKA_TOPICS.KYC,
        {
          type: record.eventType,
          scumlCheckId: record.id,
          merchantId: record.merchantId,
          verificationId: record.verificationId ?? null,
          entityName: record.entityName,
          rcNumber: record.rcNumber ?? null,
          scumlRef: record.scumlRef ?? null,
          checkType: record.checkType,
          expiresAt: record.expiresAt?.toISOString() ?? null,
          daysUntilExpiry,
          timestamp: now.toISOString(),
        },
        record.merchantId,
        { "x-event-type": record.eventType },
      ).then(() => { kafkaPublished++; }).catch((e) => {
        logger.error("scuml_expiry_job: Kafka alert publish failed — SCUML alert lost", {
          error: e instanceof Error ? e.message : String(e),
          merchantId: record.merchantId,
          checkType: record.checkType,
        });
      });
    }

    // ── Mark lapsed records as expired in the DB ───────────────────────────
    if (expiredRows.length > 0) {
      const expiredIds = expiredRows.map(r => r.id);
      await db
        .update(scumlChecks)
        .set({ status: "error", flagReason: "Registration lapsed — renewal required" })
        .where(
          and(
            inArray(scumlChecks.id, expiredIds),
            eq(scumlChecks.status, "cleared"),
          )
        );
    }

    const summary = {
      ok: true,
      processed: allAffected.length,
      expired: expiredRows.length,
      expiring: expiringRows.length,
      notified,
      kafkaPublished,
      runAt: now.toISOString(),
    };

    logger.info("scuml_expiry_job", summary);
    return res.json(summary);

  } catch (err) {
    logger.error("scuml_expiry_job", { error: String(err) });
    return res.status(500).json({ error: "Internal server error", detail: String(err) });
  }
}
