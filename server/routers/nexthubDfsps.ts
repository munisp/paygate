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
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      status: z.enum(["ACTIVE", "SUSPENDED", "OFFBOARDED", "ALL"]).default("ALL"),
      dfspType: z.enum(["bank", "mno", "fintech", "cbdc", "ALL"]).default("ALL"),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.status !== "ALL") conditions.push(eq(nexthubDfsps.status, input.status));
      if (input.dfspType !== "ALL") conditions.push(eq(nexthubDfsps.dfspType, input.dfspType));
      if (input.search) conditions.push(ilike(nexthubDfsps.dfspName, `%${input.search}%`));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [dfsps, countResult] = await Promise.all([
        db.select().from(nexthubDfsps)
          .where(whereClause)
          .orderBy(nexthubDfsps.dfspName)
          .limit(input.pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(nexthubDfsps)
          .where(whereClause),
      ]);

      return { dfsps, total: countResult[0]?.count ?? 0 };
    }),

  /** Get a single DFSP with its fee tiers */
  getDfsp: protectedProcedure
    .input(z.object({ dfspId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [dfsp] = await db.select()
        .from(nexthubDfsps)
        .where(eq(nexthubDfsps.dfspId, input.dfspId))
        .limit(1);

      if (!dfsp) throw new TRPCError({ code: "NOT_FOUND", message: "DFSP not found" });

      const feeTiers = await db.select()
        .from(dfspFeeTiers)
        .where(eq(dfspFeeTiers.dfspId, input.dfspId))
        .orderBy(desc(dfspFeeTiers.effectiveFrom));

      return { dfsp, feeTiers };
    }),

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
        active: sql<number>`count(*) filter (where status = 'ACTIVE')::int`,
        suspended: sql<number>`count(*) filter (where status = 'SUSPENDED')::int`,
        banks: sql<number>`count(*) filter (where dfsp_type = 'bank')::int`,
        mnos: sql<number>`count(*) filter (where dfsp_type = 'mno')::int`,
        fintechs: sql<number>`count(*) filter (where dfsp_type = 'fintech')::int`,
        cbdc: sql<number>`count(*) filter (where dfsp_type = 'cbdc')::int`,
      }).from(nexthubDfsps);

      return stats;
    }),
});
