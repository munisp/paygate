/**
 * Regulator Portal Router — read-only oversight views for regulators.
 *
 * Backing client: client/src/pages/regulator/RegulatorDashboard.tsx
 *
 * All procedures are protected, read-only queries over real NextHub schema
 * tables. No data is fabricated: empty tables simply yield empty arrays.
 *
 *   participants.summary  — nexthub_participants grouped by status
 *   participants.list     — nexthub_participants rows
 *   limits.list           — nexthub_participant_limits rows
 *   limits.breaches       — limits joined to nexthub_participant_positions
 *                           where ndc_utilisation >= threshold
 *   compliance.summary    — compliance_check_results grouped by check_type/status
 *   settlement.banks      — settlement_banks rows
 *   dfsps.list            — nexthub_dfsps rows
 *   audit.list            — audit_logs rows (newest first, bounded)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql, desc } from "drizzle-orm";
import {
  nexthubParticipants,
  nexthubParticipantLimits,
  settlementBanks,
  nexthubDfsps,
  auditLogs,
} from "../../drizzle/schema";

const participantsRouter = router({
  // Client: participantSummary.find(s => s.status === "ACTIVE")?.count
  summary: protectedProcedure.query(async () => {
    const rows = await db.execute(sql`
      SELECT status, COUNT(*)::int AS count
      FROM nexthub_participants
      GROUP BY status
      ORDER BY status
    `);
    return rows.rows.map((r: any) => ({
      status: String(r.status),
      count: Number(r.count),
    }));
  }),

  // Client: p.id, p.dfspId, p.name, p.currency, p.schemeType, p.status
  list: protectedProcedure.query(async () => {
    return db
      .select({
        id: nexthubParticipants.id,
        dfspId: nexthubParticipants.dfspId,
        name: nexthubParticipants.name,
        currency: nexthubParticipants.currency,
        schemeType: nexthubParticipants.schemeType,
        status: nexthubParticipants.status,
        createdAt: nexthubParticipants.createdAt,
      })
      .from(nexthubParticipants)
      .orderBy(nexthubParticipants.name)
      .limit(500);
  }),
});

const limitsRouter = router({
  // Client: l.id, l.participantId, l.currency, l.netDebitCap, l.liquidityCover,
  //         l.positionLimit?, l.alertThreshold
  list: protectedProcedure.query(async () => {
    return db
      .select({
        id: nexthubParticipantLimits.id,
        participantId: nexthubParticipantLimits.participantId,
        currency: nexthubParticipantLimits.currency,
        netDebitCap: nexthubParticipantLimits.netDebitCap,
        liquidityCover: nexthubParticipantLimits.liquidityCover,
        positionLimit: nexthubParticipantLimits.positionLimit,
        alertThreshold: nexthubParticipantLimits.alertThreshold,
        suspendOnBreach: nexthubParticipantLimits.suspendOnBreach,
        updatedAt: nexthubParticipantLimits.updatedAt,
      })
      .from(nexthubParticipantLimits)
      .orderBy(nexthubParticipantLimits.participantId)
      .limit(500);
  }),

  // NDC breach alerts: limits whose live position utilisation meets/exceeds
  // the requested threshold (client passes { threshold: 0.8 } and matches
  // breaches to limits via b.id === l.id).
  breaches: protectedProcedure
    .input(
      z.object({
        threshold: z.number().min(0).max(1).default(0.8),
      })
    )
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT
          l.id,
          l.participant_id      AS "participantId",
          l.currency,
          l.net_debit_cap       AS "netDebitCap",
          l.alert_threshold     AS "alertThreshold",
          p.ndc_utilisation     AS "ndcUtilisation",
          p.position_status     AS "positionStatus",
          p.last_updated        AS "lastUpdated"
        FROM nexthub_participant_limits l
        JOIN nexthub_participant_positions p
          ON p.participant_id = l.participant_id
         AND p.currency = l.currency
        WHERE p.ndc_utilisation >= ${input.threshold}
        ORDER BY p.ndc_utilisation DESC
        LIMIT 500
      `);
      return rows.rows.map((r: any) => ({
        id: String(r.id),
        participantId: String(r.participantId),
        currency: String(r.currency),
        netDebitCap: Number(r.netDebitCap),
        alertThreshold: Number(r.alertThreshold),
        ndcUtilisation: Number(r.ndcUtilisation),
        positionStatus: String(r.positionStatus),
        lastUpdated: r.lastUpdated ?? null,
      }));
    }),
});

const complianceRouter = router({
  // Client: s.checkType, s.status ("passed" | "failed" | other), s.count
  summary: protectedProcedure.query(async () => {
    const rows = await db.execute(sql`
      SELECT check_type AS "checkType", status, COUNT(*)::int AS count
      FROM compliance_check_results
      GROUP BY check_type, status
      ORDER BY check_type, status
    `);
    return rows.rows.map((r: any) => ({
      checkType: String(r.checkType),
      status: String(r.status),
      count: Number(r.count),
    }));
  }),
});

const settlementRouter = router({
  // Client: b.id, b.bankName, b.bankCode, b.status
  banks: protectedProcedure.query(async () => {
    return db
      .select({
        id: settlementBanks.id,
        bankCode: settlementBanks.bankCode,
        bankName: settlementBanks.bankName,
        nipCode: settlementBanks.nipCode,
        swiftCode: settlementBanks.swiftCode,
        status: settlementBanks.status,
        isRtgsEnabled: settlementBanks.isRtgsEnabled,
        isNipEnabled: settlementBanks.isNipEnabled,
        createdAt: settlementBanks.createdAt,
      })
      .from(settlementBanks)
      .orderBy(settlementBanks.bankName)
      .limit(500);
  }),
});

const dfspsRouter = router({
  // Client: d.id, d.dfspName, d.dfspId, d.country, d.currency,
  //         d.status (compared against lowercase "active"), d.dfspType
  list: protectedProcedure.query(async () => {
    const rows = await db
      .select({
        id: nexthubDfsps.id,
        dfspId: nexthubDfsps.dfspId,
        dfspName: nexthubDfsps.dfspName,
        dfspType: nexthubDfsps.dfspType,
        country: nexthubDfsps.country,
        currency: nexthubDfsps.currency,
        status: nexthubDfsps.status,
        onboardedAt: nexthubDfsps.onboardedAt,
      })
      .from(nexthubDfsps)
      .orderBy(nexthubDfsps.dfspName)
      .limit(500);
    // Table stores uppercase status ("ACTIVE"); the portal compares lowercase.
    return rows.map((d) => ({ ...d, status: d.status.toLowerCase() }));
  }),
});

const auditRouter = router({
  // Client: { limit: 20 } → log.id, log.createdAt, log.action, log.resource,
  //         log.metadata ?? log.resourceId
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(20),
      })
    )
    .query(async ({ input }) => {
      return db
        .select({
          id: auditLogs.id,
          merchantId: auditLogs.merchantId,
          userId: auditLogs.userId,
          action: auditLogs.action,
          resource: auditLogs.resource,
          resourceId: auditLogs.resourceId,
          responseStatus: auditLogs.responseStatus,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);
    }),
});

export const regulatorPortalRouter = router({
  participants: participantsRouter,
  limits: limitsRouter,
  compliance: complianceRouter,
  settlement: settlementRouter,
  dfsps: dfspsRouter,
  audit: auditRouter,
});
