/**
 * Corridor Router
 * Manages per-tenant payment corridors (source/dest currency pairs).
 * Allows enabling/disabling corridors, setting FX markup, and daily limits.
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

export const corridorRouter = router({
  /** List corridors for a tenant */
  list: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      enabledOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { tenantCorridors } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      const tenantId = input.tenantId ?? ctx.user.tenantId ?? "platform";

      const conditions = [eq(tenantCorridors.tenantId, tenantId)];
      if (input.enabledOnly) {
        conditions.push(eq(tenantCorridors.isEnabled, true));
      }
      return db.select().from(tenantCorridors).where(and(...conditions));
    }),

  /** Get a single corridor by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const { tenantCorridors } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      const rows = await db.select().from(tenantCorridors).where(eq(tenantCorridors.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Corridor not found" });
      return rows[0];
    }),

  /** Create a new corridor */
  create: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      sourceCurrency: z.string().length(3).toUpperCase(),
      destCurrency: z.string().length(3).toUpperCase(),
      isEnabled: z.boolean().default(true),
      fxMarkupPct: z.number().min(0).max(10).default(1.5),
      dailyLimitUsd: z.number().min(0).default(50000),
      minAmountUsd: z.number().min(0).default(1),
      maxAmountUsd: z.number().min(0).default(10000),
      flatFeeUsd: z.number().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { tenantCorridors } = await import("../drizzle/schema");
      const db = await getDb();
      const tenantId = input.tenantId ?? ctx.user.tenantId ?? "platform";

      const [corridor] = await db.insert(tenantCorridors).values({
        tenantId,
        sourceCurrency: input.sourceCurrency,
        destCurrency: input.destCurrency,
        isEnabled: input.isEnabled,
        fxMarkupPct: input.fxMarkupPct,
        dailyLimitUsd: input.dailyLimitUsd,
        minAmountUsd: input.minAmountUsd,
        maxAmountUsd: input.maxAmountUsd,
        flatFeeUsd: input.flatFeeUsd,
      }).returning();
      return corridor;
    }),

  /** Update corridor settings */
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      isEnabled: z.boolean().optional(),
      fxMarkupPct: z.number().min(0).max(10).optional(),
      dailyLimitUsd: z.number().min(0).optional(),
      minAmountUsd: z.number().min(0).optional(),
      maxAmountUsd: z.number().min(0).optional(),
      flatFeeUsd: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { tenantCorridors } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();

      const { id, ...updates } = input;
      const [updated] = await db
        .update(tenantCorridors)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(tenantCorridors.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Corridor not found" });
      return updated;
    }),

  /** Toggle corridor enabled/disabled */
  toggle: protectedProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { tenantCorridors } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();

      const [updated] = await db
        .update(tenantCorridors)
        .set({ isEnabled: input.enabled, updatedAt: new Date() })
        .where(eq(tenantCorridors.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Corridor not found" });
      return updated;
    }),

  /** Set FX markup for a corridor */
  setFxMarkup: protectedProcedure
    .input(z.object({ id: z.string(), fxMarkupPct: z.number().min(0).max(10) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { tenantCorridors } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();

      const [updated] = await db
        .update(tenantCorridors)
        .set({ fxMarkupPct: input.fxMarkupPct, updatedAt: new Date() })
        .where(eq(tenantCorridors.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Corridor not found" });
      return updated;
    }),

  /** Set daily limit for a corridor */
  setDailyLimit: protectedProcedure
    .input(z.object({ id: z.string(), dailyLimitUsd: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { tenantCorridors } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();

      const [updated] = await db
        .update(tenantCorridors)
        .set({ dailyLimitUsd: input.dailyLimitUsd, updatedAt: new Date() })
        .where(eq(tenantCorridors.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Corridor not found" });
      return updated;
    }),

  /** Delete a corridor */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { tenantCorridors } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();

      await db.delete(tenantCorridors).where(eq(tenantCorridors.id, input.id));
      return { success: true };
    }),
});
