import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { nexthubOracles } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";

export const nexthubOraclesRouter = router({
  // List all registered oracles
  list: protectedProcedure
    .input(z.object({
      partyIdType: z.string().optional(),
      isActive: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [];
      if (input?.partyIdType) {
        conditions.push(eq(nexthubOracles.partyIdType, input.partyIdType));
      }
      if (input?.isActive !== undefined) {
        conditions.push(eq(nexthubOracles.isActive, input.isActive ? 1 : 0));
      }
      return db
        .select()
        .from(nexthubOracles)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(nexthubOracles.createdAt));
    }),

  // Register a new oracle
  register: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      partyIdType: z.enum(["MSISDN", "IBAN", "BVN", "EMAIL", "ALIAS", "ACCOUNT_ID", "PERSONAL_ID"]),
      endpoint: z.string().url(),
      currency: z.string().length(3).optional(),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const oracleId = `oracle-${input.partyIdType.toLowerCase()}-${randomUUID().slice(0, 8)}`;

      // If setting as default, unset existing default for this partyIdType
      if (input.isDefault) {
        await db
          .update(nexthubOracles)
          .set({ isDefault: 0 })
          .where(and(
            eq(nexthubOracles.partyIdType, input.partyIdType),
            eq(nexthubOracles.isDefault, 1),
          ));
      }

      const [oracle] = await db
        .insert(nexthubOracles)
        .values({
          oracleId,
          name: input.name,
          partyIdType: input.partyIdType,
          endpoint: input.endpoint,
          currency: input.currency,
          isDefault: input.isDefault ? 1 : 0,
          isActive: 1,
          healthStatus: "UNKNOWN",
        })
        .returning();

      return oracle;
    }),

  // Update oracle endpoint or status
  update: protectedProcedure
    .input(z.object({
      oracleId: z.string(),
      endpoint: z.string().url().optional(),
      isActive: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { oracleId, ...updates } = input;

      const existing = await db
        .select()
        .from(nexthubOracles)
        .where(eq(nexthubOracles.oracleId, oracleId))
        .limit(1);

      if (!existing.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Oracle ${oracleId} not found` });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.endpoint !== undefined) updateData.endpoint = updates.endpoint;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive ? 1 : 0;
      if (updates.isDefault !== undefined) updateData.isDefault = updates.isDefault ? 1 : 0;

      const [updated] = await db
        .update(nexthubOracles)
        .set(updateData)
        .where(eq(nexthubOracles.oracleId, oracleId))
        .returning();

      return updated;
    }),

  // Deregister an oracle
  deregister: protectedProcedure
    .input(z.object({ oracleId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(nexthubOracles)
        .set({ isActive: 0, updatedAt: new Date() })
        .where(eq(nexthubOracles.oracleId, input.oracleId));
      return { success: true };
    }),

  // Health check — ping oracle endpoint and update healthStatus
  healthCheck: protectedProcedure
    .input(z.object({ oracleId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [oracle] = await db
        .select()
        .from(nexthubOracles)
        .where(eq(nexthubOracles.oracleId, input.oracleId))
        .limit(1);

      if (!oracle) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Oracle ${input.oracleId} not found` });
      }

      let healthStatus = "UNHEALTHY";
      try {
        const response = await fetch(`${oracle.endpoint}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        healthStatus = response.ok ? "HEALTHY" : "DEGRADED";
      } catch {
        healthStatus = "UNHEALTHY";
      }

      const [updated] = await db
        .update(nexthubOracles)
        .set({ healthStatus, lastHealthCheck: new Date(), updatedAt: new Date() })
        .where(eq(nexthubOracles.oracleId, input.oracleId))
        .returning();

      return { oracleId: input.oracleId, healthStatus, checkedAt: updated.lastHealthCheck };
    }),

  // Get oracle statistics
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    const all = await db.select().from(nexthubOracles);
    return {
      total: all.length,
      active: all.filter((o) => o.isActive === 1).length,
      healthy: all.filter((o) => o.healthStatus === "HEALTHY").length,
      degraded: all.filter((o) => o.healthStatus === "DEGRADED").length,
      unhealthy: all.filter((o) => o.healthStatus === "UNHEALTHY").length,
      byPartyIdType: Object.fromEntries(
        ["MSISDN", "IBAN", "BVN", "EMAIL", "ALIAS"].map((t) => [
          t,
          all.filter((o) => o.partyIdType === t).length,
        ])
      ),
    };
  }),
});
