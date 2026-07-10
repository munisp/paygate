/**
 * NextHub Security Router
 *
 * Manages security events, AML rules, DFSP certificate monitoring,
 * and the security dashboard for the NextHub payment hub.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { nexthubSecurityEvents, amlRules, nexthubDfsps } from "../../drizzle/schema";
import { eq, desc, sql, and, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const nexthubSecurityRouter = router({

  // ─── Security Events ─────────────────────────────────────────────────────────

  /** List security events */
  listEvents: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "ALL"]).default("ALL"),
      eventType: z.string().optional(),
      acknowledged: z.boolean().optional(),
      dfspId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.severity !== "ALL") conditions.push(eq(nexthubSecurityEvents.severity, input.severity));
      if (input.eventType) conditions.push(eq(nexthubSecurityEvents.eventType, input.eventType));
      if (input.acknowledged !== undefined) conditions.push(eq(nexthubSecurityEvents.acknowledged, input.acknowledged));
      if (input.dfspId) conditions.push(eq(nexthubSecurityEvents.dfspId, input.dfspId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [events, countResult] = await Promise.all([
        db.select().from(nexthubSecurityEvents)
          .where(whereClause)
          .orderBy(desc(nexthubSecurityEvents.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(nexthubSecurityEvents)
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
      const [event] = await db.insert(nexthubSecurityEvents).values({
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
      const [updated] = await db.update(nexthubSecurityEvents)
        .set({
          acknowledged: true,
          acknowledgedBy: input.acknowledgedBy,
          acknowledgedAt: new Date(),
        })
        .where(eq(nexthubSecurityEvents.id, input.eventId))
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
      const updated = await db.update(nexthubSecurityEvents)
        .set({
          acknowledged: true,
          acknowledgedBy: input.acknowledgedBy,
          acknowledgedAt: new Date(),
        })
        .where(and(
          eq(nexthubSecurityEvents.acknowledged, false),
          eq(nexthubSecurityEvents.severity, input.maxSeverity),
        ))
        .returning();

      return { acknowledged: updated.length };
    }),

  // ─── AML Rules ───────────────────────────────────────────────────────────────

  /** List all AML rules */
  listAmlRules: protectedProcedure
    .query(async () => {
      const db = await getDb();
      return db.select().from(amlRules)
        .orderBy(amlRules.ruleCategory, amlRules.ruleName);
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
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(amlRules)
        .set({ isEnabled: input.isEnabled, updatedAt: new Date() })
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
        totalUnacknowledged: sql<number>`count(*) filter (where acknowledged = false)::int`,
        criticalUnacknowledged: sql<number>`count(*) filter (where acknowledged = false and severity = 'CRITICAL')::int`,
        highUnacknowledged: sql<number>`count(*) filter (where acknowledged = false and severity = 'HIGH')::int`,
        eventsToday: sql<number>`count(*) filter (where created_at >= now() - interval '24 hours')::int`,
        fraudBlocksToday: sql<number>`count(*) filter (where event_type = 'FRAUD_BLOCK' and created_at >= now() - interval '24 hours')::int`,
        amlFlagsToday: sql<number>`count(*) filter (where event_type = 'AML_FLAG' and created_at >= now() - interval '24 hours')::int`,
        strFiledThisMonth: sql<number>`count(*) filter (where event_type = 'STR_FILED' and created_at >= date_trunc('month', now()))::int`,
      }).from(nexthubSecurityEvents);

      const [amlStats] = await db.select({
        totalRules: sql<number>`count(*)::int`,
        enabledRules: sql<number>`count(*) filter (where is_enabled = true)::int`,
        blockRules: sql<number>`count(*) filter (where action = 'BLOCK' and is_enabled = true)::int`,
      }).from(amlRules);

      // Certificates expiring in 30 days
      const certCutoff = new Date();
      certCutoff.setDate(certCutoff.getDate() + 30);
      const [certStats] = await db.select({
        expiringCerts: sql<number>`count(*) filter (where certificate_expires_at < ${certCutoff} and status = 'ACTIVE')::int`,
        expiredCerts: sql<number>`count(*) filter (where certificate_expires_at < now() and status = 'ACTIVE')::int`,
      }).from(nexthubDfsps);

      return { ...eventStats, ...amlStats, ...certStats };
    }),
});
