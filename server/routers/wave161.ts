/**
 * Wave 161 — Resilient Connectivity Router
 *
 * Provides:
 *   1. offlineQueue.list        — list pending offline operations for a merchant
 *   2. offlineQueue.enqueue     — add an operation to the offline queue
 *   3. offlineQueue.sync        — mark operations as synced
 *   4. offlineQueue.retry       — manually trigger retry for failed operations
 *   5. offlineQueue.cancel      — cancel a pending operation
 *   6. offlineQueue.stats       — aggregate queue stats
 *   7. retryPolicy.list         — list retry policies for a merchant
 *   8. retryPolicy.upsert       — create or update a retry policy
 *   9. networkQuality.report    — record a network quality event
 *  10. networkQuality.getStatus — get current network quality for a merchant
 *  11. networkQuality.history   — get network quality history
 */
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import {
  offlineQueue, retryPolicies, networkQualityEvents,
} from "../../drizzle/schema";
import { eq, and, desc, gte, count, sql, or, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Exponential backoff helper ───────────────────────────────────────────────
function computeNextRetry(attempts: number, policy: { initialDelayMs: number; backoffMultiplier: number; maxDelayMs: number }): Date {
  const delay = Math.min(
    policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempts),
    policy.maxDelayMs,
  );
  return new Date(Date.now() + delay);
}

// ─── Default retry policies per operation type ────────────────────────────────
const DEFAULT_POLICIES: Record<string, { maxAttempts: number; initialDelayMs: number; backoffMultiplier: number; maxDelayMs: number }> = {
  "payment.create":    { maxAttempts: 5, initialDelayMs: 500,  backoffMultiplier: 2.0, maxDelayMs: 30_000 },
  "payout.approve":   { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2.0, maxDelayMs: 60_000 },
  "webhook.deliver":  { maxAttempts: 10, initialDelayMs: 1000, backoffMultiplier: 1.5, maxDelayMs: 300_000 },
  "kyc.submit":       { maxAttempts: 3, initialDelayMs: 2000, backoffMultiplier: 2.0, maxDelayMs: 120_000 },
  "default":          { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2.0, maxDelayMs: 60_000 },
};

export const wave161Router = router({
  // ─── Offline Queue ──────────────────────────────────────────────────────────
  offlineQueue: router({
    list: protectedProcedure
      .input(z.object({
        merchantId: z.string().optional(),
        status: z.enum(["pending", "syncing", "synced", "failed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { rows: [], total: 0 };

        const conditions = [];
        if (input.merchantId) conditions.push(eq(offlineQueue.merchantId, input.merchantId));
        if (input.status) conditions.push(eq(offlineQueue.status, input.status));

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [rows, [{ total }]] = await Promise.all([
          db.select().from(offlineQueue)
            .where(where)
            .orderBy(desc(offlineQueue.createdAt))
            .limit(input.limit)
            .offset(input.offset),
          db.select({ total: count() }).from(offlineQueue).where(where),
        ]);

        return { rows, total: Number(total) };
      }),

    enqueue: protectedProcedure
      .input(z.object({
        merchantId: z.string(),
        operationType: z.string(),
        payload: z.record(z.string(), z.unknown()),
        priority: z.enum(["critical", "high", "normal", "low"]).default("normal"),
        deviceId: z.string().optional(),
        networkType: z.string().optional(),
        bandwidthKbps: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const policy = DEFAULT_POLICIES[input.operationType] ?? DEFAULT_POLICIES.default;
        const id = `oq_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

        await db.insert(offlineQueue).values({
          id,
          merchantId: input.merchantId,
          operationType: input.operationType,
          payload: input.payload,
          priority: input.priority,
          maxAttempts: policy.maxAttempts,
          deviceId: input.deviceId ?? null,
          networkType: input.networkType ?? null,
          bandwidthKbps: input.bandwidthKbps ?? null,
        });

        return { id, policy };
      }),

    sync: protectedProcedure
      .input(z.object({
        ids: z.array(z.string()).min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        for (const id of input.ids) {
          await db.update(offlineQueue)
            .set({ status: "synced", syncedAt: new Date(), updatedAt: new Date() })
            .where(eq(offlineQueue.id, id));
        }

        return { synced: input.ids.length };
      }),

    retry: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const [item] = await db.select().from(offlineQueue)
          .where(eq(offlineQueue.id, input.id)).limit(1);

        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Queue item not found" });
        if (item.status === "synced") throw new TRPCError({ code: "BAD_REQUEST", message: "Already synced" });

        const policy = DEFAULT_POLICIES[item.operationType] ?? DEFAULT_POLICIES.default;
        const nextRetry = computeNextRetry(item.attempts, policy);

        await db.update(offlineQueue)
          .set({
            status: "pending",
            nextRetryAt: nextRetry,
            updatedAt: new Date(),
          })
          .where(eq(offlineQueue.id, input.id));

        return { id: input.id, nextRetryAt: nextRetry };
      }),

    cancel: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        await db.update(offlineQueue)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(and(
            eq(offlineQueue.id, input.id),
            eq(offlineQueue.status, "pending"),
          ));

        return { success: true };
      }),

    stats: protectedProcedure
      .input(z.object({ merchantId: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { total: 0, pending: 0, syncing: 0, synced: 0, failed: 0, cancelled: 0 };

        const conditions = input.merchantId ? [eq(offlineQueue.merchantId, input.merchantId)] : [];
        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const statusCounts = await db.select({
          status: offlineQueue.status,
          cnt: count(),
        }).from(offlineQueue).where(where).groupBy(offlineQueue.status);

        const byStatus: Record<string, number> = {};
        for (const row of statusCounts) {
          if (row.status) byStatus[row.status] = Number(row.cnt);
        }

        const total = Object.values(byStatus).reduce((s, n) => s + n, 0);
        return {
          total,
          pending:   byStatus["pending"]   ?? 0,
          syncing:   byStatus["syncing"]   ?? 0,
          synced:    byStatus["synced"]    ?? 0,
          failed:    byStatus["failed"]    ?? 0,
          cancelled: byStatus["cancelled"] ?? 0,
        };
      }),
  }),

  // ─── Retry Policies ─────────────────────────────────────────────────────────
  retryPolicy: router({
    list: protectedProcedure
      .input(z.object({ merchantId: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { policies: [] };

        const rows = await db.select().from(retryPolicies)
          .where(input.merchantId
            ? or(eq(retryPolicies.merchantId, input.merchantId), isNull(retryPolicies.merchantId))
            : isNull(retryPolicies.merchantId))
          .orderBy(retryPolicies.operationType);

        // Merge with defaults for any missing operation types
        const existing = new Set(rows.map(r => r.operationType));
        const defaults = Object.entries(DEFAULT_POLICIES)
          .filter(([op]) => !existing.has(op))
          .map(([op, p]) => ({
            id: `default_${op}`,
            merchantId: null,
            operationType: op,
            ...p,
            retryOnStatuses: [500, 502, 503, 504],
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));

        return { policies: [...rows, ...defaults] };
      }),

    upsert: protectedProcedure
      .input(z.object({
        merchantId: z.string().optional(),
        operationType: z.string(),
        maxAttempts: z.number().int().min(1).max(20),
        initialDelayMs: z.number().int().min(100).max(60_000),
        backoffMultiplier: z.number().min(1).max(10),
        maxDelayMs: z.number().int().min(1000).max(3_600_000),
        enabled: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const id = `rp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        await db.insert(retryPolicies).values({
          id,
          merchantId: input.merchantId ?? null,
          operationType: input.operationType,
          maxAttempts: input.maxAttempts,
          initialDelayMs: input.initialDelayMs,
          backoffMultiplier: input.backoffMultiplier,
          maxDelayMs: input.maxDelayMs,
          enabled: input.enabled,
        }).onConflictDoNothing();

        return { id, success: true };
      }),
  }),

  // ─── Network Quality ─────────────────────────────────────────────────────────
  networkQuality: router({
    report: protectedProcedure
      .input(z.object({
        merchantId: z.string(),
        deviceId: z.string().optional(),
        networkType: z.enum(["wifi", "4g", "3g", "2g", "offline", "unknown"]),
        bandwidthKbps: z.number().int().optional(),
        latencyMs: z.number().int().optional(),
        packetLossPct: z.number().min(0).max(100).optional(),
        wsConnected: z.boolean().default(true),
        wsFallbackActive: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const id = `nq_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        await db.insert(networkQualityEvents).values({
          id,
          merchantId: input.merchantId,
          deviceId: input.deviceId ?? null,
          networkType: input.networkType,
          bandwidthKbps: input.bandwidthKbps ?? null,
          latencyMs: input.latencyMs ?? null,
          packetLossPct: input.packetLossPct ?? null,
          wsConnected: input.wsConnected,
          wsFallbackActive: input.wsFallbackActive,
        });

        // Determine recommended transport
        const transport = input.networkType === "offline" ? "offline_queue"
          : (input.bandwidthKbps ?? 1000) < 100 ? "polling_fallback"
          : (input.bandwidthKbps ?? 1000) < 500 ? "sse_fallback"
          : "websocket";

        return { id, transport };
      }),

    getStatus: protectedProcedure
      .input(z.object({ merchantId: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { online: true, transport: "websocket", latencyMs: null, bandwidthKbps: null };

        const [latest] = await db.select().from(networkQualityEvents)
          .where(eq(networkQualityEvents.merchantId, input.merchantId))
          .orderBy(desc(networkQualityEvents.createdAt))
          .limit(1);

        if (!latest) return { online: true, transport: "websocket", latencyMs: null, bandwidthKbps: null };

        const transport = latest.networkType === "offline" ? "offline_queue"
          : (latest.bandwidthKbps ?? 1000) < 100 ? "polling_fallback"
          : (latest.bandwidthKbps ?? 1000) < 500 ? "sse_fallback"
          : "websocket";

        return {
          online: latest.networkType !== "offline",
          networkType: latest.networkType,
          transport,
          latencyMs: latest.latencyMs,
          bandwidthKbps: latest.bandwidthKbps,
          wsConnected: latest.wsConnected,
          wsFallbackActive: latest.wsFallbackActive,
          lastSeen: latest.createdAt,
        };
      }),

    history: protectedProcedure
      .input(z.object({
        merchantId: z.string(),
        hours: z.number().int().min(1).max(168).default(24),
        limit: z.number().int().min(1).max(500).default(100),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { rows: [] };

        const since = new Date(Date.now() - input.hours * 3_600_000);
        const rows = await db.select().from(networkQualityEvents)
          .where(and(
            eq(networkQualityEvents.merchantId, input.merchantId),
            gte(networkQualityEvents.createdAt, since),
          ))
          .orderBy(desc(networkQualityEvents.createdAt))
          .limit(input.limit);

        return { rows };
      }),
  }),
});
