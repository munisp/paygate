/**
 * NextHub DFSP Management Router
 *
 * Manages DFSP onboarding, status, certificate lifecycle,
 * TigerBeetle account provisioning, and liquidity limits.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { nexthubDfsps, dfspFeeTiers } from "../../drizzle/schema";
import { eq, desc, sql, and, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const nexthubDfspsRouter = router({

  /** List all DFSPs */
  listDfsps: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      status: z.enum(["ACTIVE", "SUSPENDED", "OFFBOARDED", "ALL"]).default("ALL"),
      dfspType: z.enum(["bank", "mno", "fintech", "cbdc", "ALL"]).default("ALL"),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      

      const conditions = [];
      if (input.status !== "ALL") conditions.push(eq(nexthubDfsps.status, input.status));
      if (input.dfspType !== "ALL") conditions.push(eq(nexthubDfsps.dfspType, input.dfspType));
      if (input.search) conditions.push(ilike(nexthubDfsps.dfspName, `%${input.search}%`));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [dfsps, countResult] = await Promise.all([
        db.select().from(nexthubDfsps)
          .where(whereClause)
          .orderBy(nexthubDfsps.dfspName)
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(nexthubDfsps)
          .where(whereClause),
      ]);

      return { dfsps, total: countResult[0]?.count ?? 0 };
    }),

  /** Get a single DFSP with its fee tiers */
  /** Onboard a new DFSP */
  onboardDfsp: protectedProcedure
    .input(z.object({
      dfspId: z.string().min(3).max(50),
      dfspName: z.string().min(2).max(200),
      dfspType: z.enum(["bank", "mno", "fintech", "cbdc"]).default("bank"),
      country: z.string().default("NG"),
      currency: z.string().default("NGN"),
      callbackUrl: z.string().url().optional(),
      liquidityLimitKobo: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [existing] = await db.select({ id: nexthubDfsps.id })
        .from(nexthubDfsps)
        .where(eq(nexthubDfsps.dfspId, input.dfspId))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: `DFSP ${input.dfspId} already exists` });
      }

      const [dfsp] = await db.insert(nexthubDfsps).values({
        dfspId: input.dfspId,
        dfspName: input.dfspName,
        dfspType: input.dfspType,
        country: input.country,
        currency: input.currency,
        callbackUrl: input.callbackUrl,
        liquidityLimitKobo: input.liquidityLimitKobo,
        status: "ACTIVE",
        onboardedAt: new Date(),
      }).returning();

      // In production: Temporal workflow provisions TigerBeetle accounts
      // and publishes nexthub.dfsps.onboarded to Fluvio

      return dfsp;
    }),

  /** Update a DFSP's configuration */
  updateDfsp: protectedProcedure
    .input(z.object({
      dfspId: z.string(),
      callbackUrl: z.string().url().optional(),
      liquidityLimitKobo: z.number().int().min(0).optional(),
      status: z.enum(["ACTIVE", "SUSPENDED", "OFFBOARDED"]).optional(),
      tigerBeetlePositionAccountId: z.string().optional(),
      tigerBeetleLiquidityAccountId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const updates: Partial<typeof nexthubDfsps.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.callbackUrl !== undefined) updates.callbackUrl = input.callbackUrl;
      if (input.liquidityLimitKobo !== undefined) updates.liquidityLimitKobo = input.liquidityLimitKobo;
      if (input.status !== undefined) updates.status = input.status;
      if (input.tigerBeetlePositionAccountId !== undefined) updates.tigerBeetlePositionAccountId = input.tigerBeetlePositionAccountId;
      if (input.tigerBeetleLiquidityAccountId !== undefined) updates.tigerBeetleLiquidityAccountId = input.tigerBeetleLiquidityAccountId;

      const [updated] = await db.update(nexthubDfsps)
        .set(updates)
        .where(eq(nexthubDfsps.dfspId, input.dfspId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "DFSP not found" });
      return updated;
    }),

  /** Update DFSP certificate thumbprint and expiry */
  updateCertificate: protectedProcedure
    .input(z.object({
      dfspId: z.string(),
      thumbprint: z.string(),
      expiresAt: z.date(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(nexthubDfsps)
        .set({
          clientCertificateThumbprint: input.thumbprint,
          certificateExpiresAt: input.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(nexthubDfsps.dfspId, input.dfspId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "DFSP not found" });
      return updated;
    }),

  /** Get DFSP registry statistics */
  getStats: protectedProcedure
    .query(async () => {
      const db = await getDb();

      const [stats] = await db.select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`sum(case when status = 'ACTIVE' then 1 else 0 end)::int`,
        suspended: sql<number>`sum(case when status = 'SUSPENDED' then 1 else 0 end)::int`,
        banks: sql<number>`sum(case when dfsp_type = 'bank' then 1 else 0 end)::int`,
        mnos: sql<number>`sum(case when dfsp_type = 'mno' then 1 else 0 end)::int`,
        fintechs: sql<number>`sum(case when dfsp_type = 'fintech' then 1 else 0 end)::int`,
        cbdc: sql<number>`sum(case when dfsp_type = 'cbdc' then 1 else 0 end)::int`,
      }).from(nexthubDfsps);

      return stats;
    }),

  /** Alias for onboardDfsp — accepts extended input for API compatibility */
  createDfsp: protectedProcedure
    .input(z.object({
      fspId: z.string(),
      name: z.string(),
      type: z.enum(["BANK", "MOBILE_MONEY", "FINTECH", "MICROFINANCE"]),
      currency: z.string().default("NGN"),
      country: z.string().default("NG"),
      contactEmail: z.string().email().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [dfsp] = await db.insert(nexthubDfsps).values({
        dfspId: input.fspId,
        dfspName: input.name,
        dfspType: input.type.toLowerCase(),
        currency: input.currency,
        country: input.country,
        status: "PENDING",
      }).returning();
      return dfsp;
    }),

  /** activateDfsp — transitions a DFSP from PENDING to ACTIVE */
  activateDfsp: protectedProcedure
    .input(z.object({ dfspId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(nexthubDfsps)
        .set({ status: "ACTIVE", updatedAt: new Date() })
        .where(eq(nexthubDfsps.id, input.dfspId))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "DFSP not found" });
      return updated;
    }),

  /** getDfsp — returns a single DFSP by id */
  getDfsp: protectedProcedure
    .input(z.object({ dfspId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [dfsp] = await db.select().from(nexthubDfsps)
        .where(eq(nexthubDfsps.id, input.dfspId))
        .limit(1);
      if (!dfsp) return null;
      return { ...dfsp, name: dfsp.dfspName };
    }),
});