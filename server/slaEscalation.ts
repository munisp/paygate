/**
 * SLA Breach Auto-Escalation Scheduler
 * ─────────────────────────────────────
 * Runs every 15 minutes (configurable via SLA_ESCALATION_INTERVAL_MS).
 * Promotes `high` severity SLA breaches that have been unresolved for
 * ≥ 4 hours (configurable via SLA_ESCALATION_THRESHOLD_MS) to `critical`,
 * then re-fires a notifyOwner alert for each escalated breach.
 *
 * Usage: call startSlaEscalationScheduler() once at server startup.
 */

import { getDb } from "./db.js";
import { settlements } from "../drizzle/schema.js";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification.js";

const INTERVAL_MS = parseInt(process.env.SLA_ESCALATION_INTERVAL_MS ?? "900000", 10); // 15 min
const THRESHOLD_MS = parseInt(process.env.SLA_ESCALATION_THRESHOLD_MS ?? "14400000", 10); // 4 hours

export interface EscalationResult {
  escalatedCount: number;
  escalatedIds: string[];
  errors: string[];
  ranAt: Date;
}

/**
 * Escalate all unresolved `high` severity SLA-breached settlements
 * that have been breached for longer than THRESHOLD_MS.
 */
export async function runSlaEscalation(): Promise<EscalationResult> {
  const result: EscalationResult = {
    escalatedCount: 0,
    escalatedIds: [],
    errors: [],
    ranAt: new Date(),
  };

  const db = await getDb();
  if (!db) {
    result.errors.push("Database unavailable — skipping escalation run");
    return result;
  }

  const escalationCutoff = new Date(Date.now() - THRESHOLD_MS);

  try {
    // Find all unresolved `high` severity breaches older than the threshold
    const candidates = await db
      .select()
      .from(settlements)
      .where(
        and(
          eq(settlements.status, "sla_breached"),
          eq(settlements.severity, "high"),
          isNull(settlements.resolvedAt),
          // slaBreachedAt must be non-null and older than the cutoff
          lte(settlements.slaBreachedAt, escalationCutoff)
        )
      )
      .limit(200);

    for (const breach of candidates) {
      try {
        // Promote severity to critical
        await db
          .update(settlements)
          .set({
            severity: "critical",
            updatedAt: new Date(),
            notes: sql`COALESCE(${settlements.notes}, '') || ' [Auto-escalated to critical at ' || NOW()::text || ']'`,
          })
          .where(eq(settlements.id, breach.id));

        // Re-fire notifyOwner alert
        const slaBreachedAt = breach.slaBreachedAt ? new Date(breach.slaBreachedAt) : new Date();
        const hoursBreached = Math.round(
          (Date.now() - slaBreachedAt.getTime()) / 3_600_000
        );
        const slaDeadlineAt = breach.slaDeadlineAt ? new Date(breach.slaDeadlineAt).toISOString() : "N/A";

        await notifyOwner({
          title: `🚨 CRITICAL: Settlement SLA Breach Escalated — ${breach.reference}`,
          content: [
            `Settlement **${breach.reference}** has been auto-escalated from HIGH to **CRITICAL** severity.`,
            ``,
            `- **Merchant:** ${breach.merchantId}`,
            `- **Amount:** ${Number(breach.amount) / 100} ${breach.currency}`,
            `- **SLA Deadline:** ${slaDeadlineAt}`,
            `- **Breached At:** ${slaBreachedAt.toISOString()}`,
            `- **Hours Overdue:** ${hoursBreached}h`,
            ``,
            `Immediate action required. This settlement has exceeded the CBN NIP 2-hour SLA by more than 4 hours.`,
          ].join("\n"),
        });

        result.escalatedIds.push(breach.id);
        result.escalatedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Failed to escalate settlement ${breach.id}: ${msg}`);
        console.error(`[SLA Escalation] Error escalating ${breach.id}:`, err);
      }
    }

    if (result.escalatedCount > 0) {
      console.log(
        `[SLA Escalation] Escalated ${result.escalatedCount} settlement(s) to CRITICAL: ${result.escalatedIds.join(", ")}`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Escalation query failed: ${msg}`);
    console.error("[SLA Escalation] Query error:", err);
  }

  return result;
}

let _timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the SLA escalation scheduler.
 * Safe to call multiple times — only one timer will run.
 */
export function startSlaEscalationScheduler(): void {
  if (_timer) return;

  console.log(
    `[SLA Escalation] Scheduler started — interval: ${INTERVAL_MS / 60_000}min, threshold: ${THRESHOLD_MS / 3_600_000}h`
  );

  // Run once immediately on startup (with a short delay to let the DB connect)
  setTimeout(() => {
    runSlaEscalation().catch(err => console.error("[SLA Escalation] Startup run error:", err));
  }, 10_000);

  _timer = setInterval(() => {
    runSlaEscalation().catch(err => console.error("[SLA Escalation] Scheduled run error:", err));
  }, INTERVAL_MS);
}

/**
 * Stop the scheduler (for clean shutdown / testing).
 */
export function stopSlaEscalationScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log("[SLA Escalation] Scheduler stopped");
  }
}
