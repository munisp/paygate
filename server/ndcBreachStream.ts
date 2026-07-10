/**
 * NDC Breach SSE Stream — /api/ndc-stream
 *
 * Polls nexthub_participant_positions every 5 s and pushes events when
 * ndcUtilisation >= alertThreshold (from nexthub_participant_limits).
 * When utilisation >= 0.9, fires an owner notification.
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import { nexthubParticipantLimits, nexthubParticipantPositions, nexthubDfsps } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

interface BreachEvent {
  participantId: string;
  dfspName: string;
  currency: string;
  ndcUtilisation: number;
  currentValue: number;
  netDebitCap: number;
  alertThreshold: number;
  severity: "warning" | "critical";
  timestamp: string;
}

// Track which participants have already triggered a critical notification
// to avoid spamming the owner on every poll cycle.
const notifiedCritical = new Set<string>();

export async function ndcBreachStreamHandler(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("connected", { ts: new Date().toISOString() });

  const poll = async () => {
    try {
      const db = await getDb();

      // Join positions with limits and dfsp names
      const rows = await db
        .select({
          participantId: nexthubParticipantPositions.participantId,
          currency: nexthubParticipantPositions.currency,
          ndcUtilisation: nexthubParticipantPositions.ndcUtilisation,
          currentValue: nexthubParticipantPositions.currentValue,
          positionStatus: nexthubParticipantPositions.positionStatus,
          netDebitCap: nexthubParticipantLimits.netDebitCap,
          alertThreshold: nexthubParticipantLimits.alertThreshold,
          dfspName: nexthubDfsps.dfspName,
        })
        .from(nexthubParticipantPositions)
        .leftJoin(
          nexthubParticipantLimits,
          sql`${nexthubParticipantLimits.participantId} = ${nexthubParticipantPositions.participantId}
              AND ${nexthubParticipantLimits.currency} = ${nexthubParticipantPositions.currency}`
        )
        .leftJoin(
          nexthubDfsps,
          eq(nexthubDfsps.id, nexthubParticipantPositions.participantId)
        );

      const breaches: BreachEvent[] = [];

      for (const row of rows) {
        const threshold = row.alertThreshold ?? 0.8;
        const utilisation = row.ndcUtilisation ?? 0;

        if (utilisation >= threshold) {
          const severity: "warning" | "critical" = utilisation >= 0.9 ? "critical" : "warning";
          const key = `${row.participantId}-${row.currency}`;

          breaches.push({
            participantId: row.participantId,
            dfspName: row.dfspName ?? row.participantId,
            currency: row.currency,
            ndcUtilisation: utilisation,
            currentValue: row.currentValue,
            netDebitCap: row.netDebitCap ?? 0,
            alertThreshold: threshold,
            severity,
            timestamp: new Date().toISOString(),
          });

          // Fire owner notification once per critical breach (reset after 1h)
          if (severity === "critical" && !notifiedCritical.has(key)) {
            notifiedCritical.add(key);
            setTimeout(() => notifiedCritical.delete(key), 60 * 60 * 1000);

            notifyOwner({
              title: `⚠️ NDC Critical Breach — ${row.dfspName ?? row.participantId}`,
              content: `Participant **${row.dfspName ?? row.participantId}** (${row.currency}) has reached **${(utilisation * 100).toFixed(1)}%** of its Net Debit Cap.\n\nCurrent position: ${row.currentValue?.toLocaleString()} / NDC: ${row.netDebitCap?.toLocaleString()}\n\nImmediate action may be required to prevent settlement suspension.`,
            }).catch(() => {/* non-fatal */});
          }
        }
      }

      if (breaches.length > 0) {
        send("breaches", breaches);
      } else {
        send("heartbeat", { ts: new Date().toISOString(), allClear: true });
      }
    } catch (err) {
      send("error", { message: String(err) });
    }
  };

  // Initial poll immediately
  await poll();

  // Then every 5 seconds
  const interval = setInterval(poll, 5000);

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
}
