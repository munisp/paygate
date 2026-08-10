/**
 * NextHub Security Router
 *
 * Manages security events, AML rules, DFSP certificate monitoring,
 * and the security dashboard for the NextHub payment hub.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { nexthubSecurityEvents as securityEvents, amlRules, nexthubDfsps } from "../../drizzle/schema";
import { eq, desc, sql, and, lt, count, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const nexthubSecurityRouter = router({

  // ─── Security Events ─────────────────────────────────────────────────────────

  /** List security events */
  listEvents: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "ALL"]).default("ALL"),
      eventType: z.string().optional(),
      acknowledged: z.boolean().optional(),
      dfspId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      

      const conditions = [];
      if (input.severity !== "ALL") conditions.push(eq(securityEvents.severity, input.severity));
      if (input.eventType) conditions.push(eq(securityEvents.eventType, input.eventType));
      if (input.acknowledged !== undefined) conditions.push(eq(securityEvents.acknowledged, input.acknowledged));
      if (input.dfspId) conditions.push(eq(securityEvents.dfspId, input.dfspId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [events, countResult] = await Promise.all([
        db.select().from(securityEvents)
          .where(whereClause)
          .orderBy(desc(securityEvents.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(securityEvents)
          .where(whereClause),
      ]);

      return { events, total: countResult[0]?.count ?? 0 };
    }),

  /** Record a new security event */
  recordEvent: protectedProcedure
    .input(z.object({
      eventType: z.enum([
        "JWS_FAILURE", "CERT_EXPIRY", "CIRCUIT_OPEN", "AML_FLAG",
        "FRAUD_BLOCK", "RATE_LIMIT", "CERT_REVOKED", "SUSPICIOUS_PATTERN",
        "STR_FILED", "SANCTIONS_HIT", "REPLAY_ATTACK", "BRUTE_FORCE",
      ]),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      dfspId: z.string().optional(),
      sourceIp: z.string().optional(),
      description: z.string(),
      metadata: z.string().optional(), // JSON
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [event] = await db.insert(securityEvents).values({
        eventType: input.eventType,
        severity: input.severity,
        dfspId: input.dfspId,
        sourceIp: input.sourceIp,
        description: input.description,
        metadata: input.metadata,
        acknowledged: false,
      }).returning();
      return event;
    }),

  /** Acknowledge a security event */
  acknowledgeEvent: protectedProcedure
    .input(z.object({
      eventId: z.string(),
      acknowledgedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(securityEvents)
        .set({
          acknowledged: true,
          acknowledgedBy: input.acknowledgedBy,
          acknowledgedAt: new Date(),
        })
        .where(eq(securityEvents.id, input.eventId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Security event not found" });
      return updated;
    }),

  /** Bulk acknowledge all unacknowledged events below a severity */
  bulkAcknowledge: protectedProcedure
    .input(z.object({
      maxSeverity: z.enum(["LOW", "MEDIUM"]).default("LOW"),
      acknowledgedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const updated = await db.update(securityEvents)
        .set({
          acknowledged: true,
          acknowledgedBy: input.acknowledgedBy,
          acknowledgedAt: new Date(),
        })
        .where(and(
          eq(securityEvents.acknowledged, false),
          eq(securityEvents.severity, input.maxSeverity),
        ))
        .returning();

      return { acknowledged: updated.length };
    }),

  // ─── AML Rules ───────────────────────────────────────────────────────────────

  /** List all AML rules */
  listAmlRules: protectedProcedure
    .input(z.object({ dfspId: z.string().optional() }).optional())
    .query(async () => {
      const db = await getDb();
      const rules = await db.select().from(amlRules)
        .orderBy(amlRules.ruleCategory, amlRules.ruleName);
      return { rules };
    }),

  /** Create an AML rule */
  createAmlRule: protectedProcedure
    .input(z.object({
      ruleName: z.string().min(3).max(100),
      ruleCategory: z.enum(["VELOCITY", "THRESHOLD", "STRUCTURING", "SANCTIONS", "GEOGRAPHY"]),
      parameters: z.string(), // JSON
      action: z.enum(["FLAG", "BLOCK", "REVIEW", "STR"]).default("FLAG"),
      isEnabled: z.boolean().default(true),
      createdBy: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [rule] = await db.insert(amlRules).values({
        ruleName: input.ruleName,
        ruleCategory: input.ruleCategory,
        parameters: input.parameters,
        action: input.action,
        isEnabled: input.isEnabled,
        createdBy: input.createdBy,
      }).returning();
      return rule;
    }),

  /** Toggle an AML rule on/off */
  toggleAmlRule: protectedProcedure
    .input(z.object({
      ruleId: z.string(),
      enabled: z.boolean().optional(),
      isEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const enabledValue = input.enabled ?? input.isEnabled ?? true;
      const [updated] = await db.update(amlRules)
        .set({ isEnabled: enabledValue, updatedAt: new Date() })
        .where(eq(amlRules.id, input.ruleId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "AML rule not found" });
      return updated;
    }),

  // ─── Certificate Monitoring ───────────────────────────────────────────────────

  /** List DFSPs with certificates expiring within N days */
  getExpiringCertificates: protectedProcedure
    .input(z.object({ withinDays: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.withinDays);

      return db.select({
        dfspId: nexthubDfsps.dfspId,
        dfspName: nexthubDfsps.dfspName,
        certificateExpiresAt: nexthubDfsps.certificateExpiresAt,
        status: nexthubDfsps.status,
      })
        .from(nexthubDfsps)
        .where(and(
          lt(nexthubDfsps.certificateExpiresAt, cutoff),
          eq(nexthubDfsps.status, "ACTIVE"),
        ))
        .orderBy(nexthubDfsps.certificateExpiresAt);
    }),

  // ─── Security Dashboard ───────────────────────────────────────────────────────

  /** Get security dashboard statistics */
  getDashboardStats: protectedProcedure
    .query(async () => {
      const db = await getDb();

      const [eventStats] = await db.select({
        totalUnacknowledged: sql<number>`sum(case when acknowledged = false then 1 else 0 end)::int`,
        criticalUnacknowledged: sql<number>`sum(case when acknowledged = false and severity = 'CRITICAL' then 1 else 0 end)::int`,
        highUnacknowledged: sql<number>`sum(case when acknowledged = false and severity = 'HIGH' then 1 else 0 end)::int`,
        eventsToday: sql<number>`sum(case when created_at >= now( then 1 else 0 end) - interval '24 hours')::int`,
        fraudBlocksToday: sql<number>`sum(case when event_type = 'FRAUD_BLOCK' and created_at >= now( then 1 else 0 end) - interval '24 hours')::int`,
        amlFlagsToday: sql<number>`sum(case when event_type = 'AML_FLAG' and created_at >= now( then 1 else 0 end) - interval '24 hours')::int`,
        strFiledThisMonth: sql<number>`sum(case when event_type = 'STR_FILED' and created_at >= date_trunc('month', now( then 1 else 0 end)))::int`,
      }).from(securityEvents);

      const [amlStats] = await db.select({
        totalRules: sql<number>`count(*)::int`,
        enabledRules: sql<number>`sum(case when is_enabled = true then 1 else 0 end)::int`,
        blockRules: sql<number>`sum(case when action = 'BLOCK' and is_enabled = true then 1 else 0 end)::int`,
      }).from(amlRules);

      // Certificates expiring in 30 days
      const certCutoff = new Date();
      certCutoff.setDate(certCutoff.getDate() + 30);
      const [certStats] = await db.select({
        expiringCerts: sql<number>`sum(case when certificate_expires_at < ${certCutoff} and status = 'ACTIVE' then 1 else 0 end)::int`,
        expiredCerts: sql<number>`sum(case when certificate_expires_at < now( then 1 else 0 end) and status = 'ACTIVE')::int`,
      }).from(nexthubDfsps);

      return { ...eventStats, ...amlStats, ...certStats };
    }),

  /** listSecurityEvents — paginated list of security events */
  listSecurityEvents: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [];
      if (input.severity) conditions.push(eq(securityEvents.severity, input.severity));
      const rows = await db.select().from(securityEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(securityEvents.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(securityEvents);
      return { events: rows, total };
    }),

  /** getSecurityStats — aggregate security metrics */
  getSecurityStats: protectedProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      const [stats] = await db.select({
        totalEvents: sql<number>`count(*)::int`,
        criticalCount: sql<number>`coalesce(sum(case when severity = 'CRITICAL' then 1 else 0 end), 0)::int`,
        highCount: sql<number>`coalesce(sum(case when severity = 'HIGH' then 1 else 0 end), 0)::int`,
        unacknowledgedCount: sql<number>`coalesce(sum(case when acknowledged = false then 1 else 0 end), 0)::int`,
      }).from(securityEvents);
      // amlAlertsToday - count from amlRules as proxy
      const [amlStats] = await db.select({
        amlAlertsToday: sql<number>`count(*)::int`,
      }).from(amlRules);
      return { ...stats, amlAlertsToday: amlStats?.amlAlertsToday ?? 0 };
    }),
});