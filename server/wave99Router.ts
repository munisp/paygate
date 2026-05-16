// @ts-nocheck
/**
 * Wave 99 Router — Sprint v99
 * CRUD for remaining 29 DB tables that had no procedures.
 * Covers: tenantConfig, subscriptionCharges, ptspBatches, geofenceRules,
 * agentNetwork, restaurantTables/Orders/Items, splitBill, loyalty,
 * inventory (reservations/audit/transactions), kdsStations, recipeIngredients,
 * staffMembers/Shifts, payrollRuns, auditEvents, consumerIdempotencyKeys,
 * mutualFundTransactions, consumerNotificationPrefs, adminNotificationPrefs,
 * rateLimitEvents, emiLoans, emiRepayments.
 */
import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "../drizzle/schema";

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return d;
}

// ─── Tenant Config ────────────────────────────────────────────────────────────
const tenantConfigRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50), offset: z.number().min(0).default(0) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.tenantConfig).limit(input.limit).offset(input.offset);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.tenantConfig).where(eq(schema.tenantConfig.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  upsert: protectedProcedure
    .input(z.object({ tenantId: z.string(), configKey: z.string(), configValue: z.string() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.insert(schema.tenantConfig).values(input)
        .onDuplicateKeyUpdate({ set: { configValue: input.configValue } });
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.tenantConfig).where(eq(schema.tenantConfig.id, input.id));
    return { success: true };
  }),
});

// ─── Subscription Charges ─────────────────────────────────────────────────────
const subscriptionChargesRouter = router({
  list: protectedProcedure
    .input(z.object({ subscriptionId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.subscriptionCharges)
        .orderBy(desc(schema.subscriptionCharges.createdAt))
        .limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.subscriptionCharges).where(eq(schema.subscriptionCharges.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      subscriptionId: z.number(),
      amountKobo: z.number().positive(),
      currency: z.string().default("NGN"),
      status: z.enum(["pending", "paid", "failed"]).default("pending"),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.subscriptionCharges).values(input).$returningId();
      return row;
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["pending", "paid", "failed"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(schema.subscriptionCharges).set({ status: input.status }).where(eq(schema.subscriptionCharges.id, input.id));
      return { success: true };
    }),
});

// ─── PTSP Batches ─────────────────────────────────────────────────────────────
const ptspBatchesRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.ptspBatches).orderBy(desc(schema.ptspBatches.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.ptspBatches).where(eq(schema.ptspBatches.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      batchRef: z.string(),
      totalAmountKobo: z.number(),
      terminalCount: z.number().default(0),
      settlementDate: z.string(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.ptspBatches).values({ ...input, status: "pending" }).$returningId();
      return row;
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["pending", "processing", "settled", "failed"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(schema.ptspBatches).set({ status: input.status }).where(eq(schema.ptspBatches.id, input.id));
      return { success: true };
    }),
});

// ─── Geofence Rules ───────────────────────────────────────────────────────────
const geofenceRulesRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.geofenceRules).orderBy(desc(schema.geofenceRules.createdAt)).limit(input.limit).offset(input.offset);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.geofenceRules).where(eq(schema.geofenceRules.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(500),
      lat: z.number(),
      lng: z.number(),
      radiusMeters: z.number().positive(),
      action: z.enum(["allow", "block", "flag"]),
      merchantId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.geofenceRules).values({ ...input, isActive: 1 }).$returningId();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      radiusMeters: z.number().optional(),
      action: z.enum(["allow", "block", "flag"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const d = await db();
      await d.update(schema.geofenceRules).set(rest).where(eq(schema.geofenceRules.id, id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.geofenceRules).where(eq(schema.geofenceRules.id, input.id));
    return { success: true };
  }),
});

// ─── Agent Network ────────────────────────────────────────────────────────────
const agentNetworkRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.agentNetwork).orderBy(desc(schema.agentNetwork.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.agentNetwork).where(eq(schema.agentNetwork.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      agentCode: z.string(),
      agentName: z.string(),
      phone: z.string(),
      state: z.string(),
      lga: z.string().optional(),
      merchantId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.agentNetwork).values({ ...input, status: "active" }).$returningId();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      agentName: z.string().optional(),
      phone: z.string().optional(),
      status: z.enum(["active", "suspended", "inactive"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const d = await db();
      await d.update(schema.agentNetwork).set(rest).where(eq(schema.agentNetwork.id, id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.agentNetwork).where(eq(schema.agentNetwork.id, input.id));
    return { success: true };
  }),
});

// ─── Restaurant Tables ────────────────────────────────────────────────────────
const restaurantTablesRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: z.number().optional() }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.restaurantTables).orderBy(schema.restaurantTables.tableNumber);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.restaurantTables).where(eq(schema.restaurantTables.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      tableNumber: z.string(),
      capacity: z.number().int().positive(),
      section: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.restaurantTables).values({ ...input, status: "available" }).$returningId();
      return row;
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["available", "occupied", "reserved", "cleaning"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(schema.restaurantTables).set({ status: input.status }).where(eq(schema.restaurantTables.id, input.id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.restaurantTables).where(eq(schema.restaurantTables.id, input.id));
    return { success: true };
  }),
});

// ─── Restaurant Orders ────────────────────────────────────────────────────────
const restaurantOrdersRouter = router({
  list: protectedProcedure
    .input(z.object({ tableId: z.number().optional(), status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.restaurantOrders).orderBy(desc(schema.restaurantOrders.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.restaurantOrders).where(eq(schema.restaurantOrders.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      tableId: z.number(),
      merchantId: z.number(),
      customerCount: z.number().int().default(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.restaurantOrders).values({ ...input, status: "open", totalKobo: 0 }).$returningId();
      return row;
    }),
  addItem: protectedProcedure
    .input(z.object({ orderId: z.number(), menuItemId: z.number(), quantity: z.number().int().positive(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.restaurantOrderItems).values({ ...input, status: "pending" }).$returningId();
      return row;
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["open", "preparing", "served", "paid", "cancelled"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(schema.restaurantOrders).set({ status: input.status }).where(eq(schema.restaurantOrders.id, input.id));
      return { success: true };
    }),
});

// ─── Split Bill Sessions ──────────────────────────────────────────────────────
const splitBillRouter = router({
  listSessions: protectedProcedure
    .input(z.object({ merchantId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.splitBillSessions).orderBy(desc(schema.splitBillSessions.createdAt)).limit(input.limit);
    }),
  getSession: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [session] = await d.select().from(schema.splitBillSessions).where(eq(schema.splitBillSessions.id, input.id)).limit(1);
    if (!session) throw new TRPCError({ code: "NOT_FOUND" });
    const shares = await d.select().from(schema.splitBillShares).where(eq(schema.splitBillShares.sessionId, input.id));
    return { session, shares };
  }),
  createSession: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      totalKobo: z.number().positive(),
      splitType: z.enum(["equal", "custom", "itemized"]),
      participantCount: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.splitBillSessions).values({ ...input, status: "open" }).$returningId();
      return row;
    }),
  addShare: protectedProcedure
    .input(z.object({ sessionId: z.number(), participantName: z.string(), amountKobo: z.number().positive() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.splitBillShares).values({ ...input, status: "pending" }).$returningId();
      return row;
    }),
  markSharePaid: protectedProcedure.input(z.object({ shareId: z.number(), paymentRef: z.string() })).mutation(async ({ input }) => {
    const d = await db();
    await d.update(schema.splitBillShares).set({ status: "paid", paymentRef: input.paymentRef, paidAt: new Date() }).where(eq(schema.splitBillShares.id, input.shareId));
    return { success: true };
  }),
});

// ─── Loyalty Programs / Accounts / Transactions ───────────────────────────────
const loyaltyRouter = router({
  listPrograms: protectedProcedure.query(async () => {
    const d = await db();
    return d.select().from(schema.loyaltyPrograms).limit(100);
  }),
  createProgram: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      name: z.string().min(1).max(500),
      pointsPerNaira: z.number().default(1),
      redemptionRate: z.number().default(100),
      expiryDays: z.number().default(365),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.loyaltyPrograms).values({ ...input, isActive: 1 }).$returningId();
      return row;
    }),
  listAccounts: protectedProcedure
    .input(z.object({ programId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.loyaltyAccounts).limit(input.limit);
    }),
  getAccount: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.loyaltyAccounts).where(eq(schema.loyaltyAccounts.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  createAccount: protectedProcedure
    .input(z.object({ programId: z.number(), customerId: z.string(), merchantId: z.number() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.loyaltyAccounts).values({ ...input, pointsBalance: 0, lifetimePoints: 0 }).$returningId();
      return row;
    }),
  listTransactions: protectedProcedure
    .input(z.object({ accountId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.loyaltyTransactions).orderBy(desc(schema.loyaltyTransactions.createdAt)).limit(input.limit);
    }),
  earnPoints: protectedProcedure
    .input(z.object({ accountId: z.number(), points: z.number().positive(), transactionRef: z.string() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.insert(schema.loyaltyTransactions).values({ ...input, type: "earn" });
      await d.update(schema.loyaltyAccounts).set({
        pointsBalance: sql`points_balance + ${input.points}`,
        lifetimePoints: sql`lifetime_points + ${input.points}`,
      }).where(eq(schema.loyaltyAccounts.id, input.accountId));
      return { success: true };
    }),
  redeemPoints: protectedProcedure
    .input(z.object({ accountId: z.number(), points: z.number().positive(), transactionRef: z.string() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [acct] = await d.select().from(schema.loyaltyAccounts).where(eq(schema.loyaltyAccounts.id, input.accountId)).limit(1);
      if (!acct || (acct.pointsBalance ?? 0) < input.points) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient points" });
      await d.insert(schema.loyaltyTransactions).values({ ...input, type: "redeem" });
      await d.update(schema.loyaltyAccounts).set({ pointsBalance: sql`points_balance - ${input.points}` }).where(eq(schema.loyaltyAccounts.id, input.accountId));
      return { success: true };
    }),
});

// ─── Inventory Reservations ───────────────────────────────────────────────────
const inventoryReservationsRouter = router({
  list: protectedProcedure
    .input(z.object({ itemId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.inventoryReservations).orderBy(desc(schema.inventoryReservations.createdAt)).limit(100);
    }),
  create: protectedProcedure
    .input(z.object({ itemId: z.number(), quantity: z.number().positive(), orderId: z.string(), expiresAt: z.string().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.inventoryReservations).values({ ...input, status: "reserved" }).$returningId();
      return row;
    }),
  release: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.update(schema.inventoryReservations).set({ status: "released", releasedAt: new Date() }).where(eq(schema.inventoryReservations.id, input.id));
    return { success: true };
  }),
  confirm: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.update(schema.inventoryReservations).set({ status: "consumed" }).where(eq(schema.inventoryReservations.id, input.id));
    return { success: true };
  }),
});

// ─── Inventory Audit Log ──────────────────────────────────────────────────────
const inventoryAuditLogRouter = router({
  list: protectedProcedure
    .input(z.object({ itemId: z.number().optional(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.inventoryAuditLog).orderBy(desc(schema.inventoryAuditLog.createdAt)).limit(input.limit);
    }),
  create: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      action: z.enum(["adjust", "reserve", "release", "consume", "restock"]),
      quantityBefore: z.number(),
      quantityAfter: z.number(),
      reason: z.string().optional(),
      performedBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const [row] = await d.insert(schema.inventoryAuditLog).values({
        ...input,
        performedBy: input.performedBy ?? ctx.user?.openId,
      }).$returningId();
      return row;
    }),
});

// ─── Inventory Transactions ───────────────────────────────────────────────────
const inventoryTransactionsRouter = router({
  list: protectedProcedure
    .input(z.object({ itemId: z.number().optional(), type: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.inventoryTransactions).orderBy(desc(schema.inventoryTransactions.createdAt)).limit(input.limit);
    }),
  create: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      type: z.enum(["purchase", "sale", "adjustment", "waste", "transfer"]),
      quantity: z.number(),
      unitCost: z.number().optional(),
      reference: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.inventoryTransactions).values(input).$returningId();
      return row;
    }),
});

// ─── KDS Stations ─────────────────────────────────────────────────────────────
const kdsStationsRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: z.number().optional() }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.kdsStations).limit(50);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.kdsStations).where(eq(schema.kdsStations.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({ merchantId: z.number(), name: z.string().min(1).max(500), stationType: z.enum(["grill", "cold", "bar", "pastry", "main"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.kdsStations).values({ ...input, isActive: 1 }).$returningId();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const d = await db();
      await d.update(schema.kdsStations).set(rest).where(eq(schema.kdsStations.id, id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.kdsStations).where(eq(schema.kdsStations.id, input.id));
    return { success: true };
  }),
});

// ─── Recipe Ingredients ───────────────────────────────────────────────────────
const recipeIngredientsRouter = router({
  list: protectedProcedure
    .input(z.object({ menuItemId: z.number().optional() }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.recipeIngredients).limit(200);
    }),
  create: protectedProcedure
    .input(z.object({ menuItemId: z.number(), inventoryItemId: z.number(), quantity: z.number().positive(), unit: z.string() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.recipeIngredients).values(input).$returningId();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), quantity: z.number().optional(), unit: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const d = await db();
      await d.update(schema.recipeIngredients).set(rest).where(eq(schema.recipeIngredients.id, id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.id, input.id));
    return { success: true };
  }),
});

// ─── Staff Members ────────────────────────────────────────────────────────────
const staffMembersRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: z.number().optional(), status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.staffMembers).orderBy(desc(schema.staffMembers.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.staffMembers).where(eq(schema.staffMembers.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      fullName: z.string(),
      role: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      salaryKobo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.staffMembers).values({ ...input, status: "active" }).$returningId();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      fullName: z.string().optional(),
      role: z.string().optional(),
      status: z.enum(["active", "inactive", "terminated"]).optional(),
      salaryKobo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const d = await db();
      await d.update(schema.staffMembers).set(rest).where(eq(schema.staffMembers.id, id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.staffMembers).where(eq(schema.staffMembers.id, input.id));
    return { success: true };
  }),
});

// ─── Staff Shifts ─────────────────────────────────────────────────────────────
const staffShiftsRouter = router({
  list: protectedProcedure
    .input(z.object({ staffId: z.number().optional(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.staffShifts).orderBy(desc(schema.staffShifts.startTime)).limit(input.limit);
    }),
  clockIn: protectedProcedure
    .input(z.object({ staffId: z.number(), merchantId: z.number() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.staffShifts).values({ ...input, startTime: new Date(), status: "active" }).$returningId();
      return row;
    }),
  clockOut: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    const endTime = new Date();
    await d.update(schema.staffShifts).set({ endTime, status: "completed" }).where(eq(schema.staffShifts.id, input.id));
    return { success: true };
  }),
});

// ─── Payroll Runs ─────────────────────────────────────────────────────────────
const payrollRunsRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: z.number().optional(), status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.payrollRuns).orderBy(desc(schema.payrollRuns.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      periodStart: z.string(),
      periodEnd: z.string(),
      totalGrossKobo: z.number(),
      totalNetKobo: z.number(),
      staffCount: z.number().int(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.payrollRuns).values({ ...input, status: "draft" }).$returningId();
      return row;
    }),
  approve: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const d = await db();
    await d.update(schema.payrollRuns).set({ status: "approved", approvedBy: ctx.user?.openId, approvedAt: new Date() }).where(eq(schema.payrollRuns.id, input.id));
    return { success: true };
  }),
  disburse: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.update(schema.payrollRuns).set({ status: "disbursed", disbursedAt: new Date() }).where(eq(schema.payrollRuns.id, input.id));
    return { success: true };
  }),
});

// ─── Audit Events ─────────────────────────────────────────────────────────────
const auditEventsRouter = router({
  list: protectedProcedure
    .input(z.object({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.auditEvents).orderBy(desc(schema.auditEvents.createdAt)).limit(input.limit);
    }),
  create: protectedProcedure
    .input(z.object({
      entityType: z.string(),
      entityId: z.string(),
      action: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const [row] = await d.insert(schema.auditEvents).values({
        ...input,
        actorId: ctx.user?.openId,
        metadata: JSON.stringify(input.metadata ?? {}),
      }).$returningId();
      return row;
    }),
});

// ─── Consumer Idempotency Keys ────────────────────────────────────────────────
const consumerIdempotencyRouter = router({
  check: protectedProcedure
    .input(z.object({ key: z.string(), userId: z.number() }))
    .query(async ({ input }) => {
      const d = await db();
      const [row] = await d.select().from(schema.consumerIdempotencyKeys)
        .where(and(eq(schema.consumerIdempotencyKeys.idempotencyKey, input.key), eq(schema.consumerIdempotencyKeys.userId, input.userId)))
        .limit(1);
      return { exists: !!row, response: row?.responsePayload ?? null };
    }),
  record: protectedProcedure
    .input(z.object({ key: z.string(), userId: z.number(), responsePayload: z.string(), expiresAt: z.string().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.insert(schema.consumerIdempotencyKeys).values({
        idempotencyKey: input.key,
        userId: input.userId,
        responsePayload: input.responsePayload,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 24 * 3600_000),
      }).onDuplicateKeyUpdate({ set: { responsePayload: input.responsePayload } });
      return { success: true };
    }),
});

// ─── Mutual Fund Transactions ─────────────────────────────────────────────────
const mutualFundTransactionsRouter = router({
  list: protectedProcedure
    .input(z.object({ userId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.mutualFundTransactions).orderBy(desc(schema.mutualFundTransactions.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.mutualFundTransactions).where(eq(schema.mutualFundTransactions.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      userId: z.number(),
      fundId: z.number(),
      type: z.enum(["purchase", "redemption", "switch"]),
      amountKobo: z.number().positive(),
      units: z.number().optional(),
      nav: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.mutualFundTransactions).values({ ...input, status: "pending" }).$returningId();
      return row;
    }),
  confirm: protectedProcedure.input(z.object({ id: z.number(), units: z.number(), nav: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.update(schema.mutualFundTransactions).set({ status: "completed", units: input.units, nav: input.nav, processedAt: new Date() }).where(eq(schema.mutualFundTransactions.id, input.id));
    return { success: true };
  }),
});

// ─── Consumer Notification Prefs ──────────────────────────────────────────────
const consumerNotifPrefsRouter = router({
  get: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.consumerNotificationPrefs).where(eq(schema.consumerNotificationPrefs.userId, input.userId)).limit(1);
    return row ?? null;
  }),
  upsert: protectedProcedure
    .input(z.object({
      userId: z.number(),
      emailEnabled: z.boolean().default(true),
      smsEnabled: z.boolean().default(true),
      pushEnabled: z.boolean().default(true),
      inAppEnabled: z.boolean().default(true),
      transactionAlerts: z.boolean().default(true),
      marketingEmails: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.insert(schema.consumerNotificationPrefs).values(input)
        .onDuplicateKeyUpdate({ set: { ...input } });
      return { success: true };
    }),
});

// ─── Admin Notification Prefs ─────────────────────────────────────────────────
const adminNotifPrefsRouter = router({
  get: protectedProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.adminNotificationPrefs).where(eq(schema.adminNotificationPrefs.userId, input.userId)).limit(1);
    return row ?? null;
  }),
  upsert: protectedProcedure
    .input(z.object({
      userId: z.number(),
      emailEnabled: z.boolean().default(true),
      smsEnabled: z.boolean().default(false),
      pushEnabled: z.boolean().default(true),
      alertThreshold: z.enum(["all", "high", "critical"]).default("high"),
      fraudAlerts: z.boolean().default(true),
      systemAlerts: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.insert(schema.adminNotificationPrefs).values(input)
        .onDuplicateKeyUpdate({ set: { ...input } });
      return { success: true };
    }),
});

// ─── Rate Limit Events ────────────────────────────────────────────────────────
const rateLimitEventsRouter = router({
  list: protectedProcedure
    .input(z.object({ endpoint: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.rateLimitEvents).orderBy(desc(schema.rateLimitEvents.createdAt)).limit(input.limit);
    }),
  stats: protectedProcedure.query(async () => {
    const d = await db();
    const rows = await d.select().from(schema.rateLimitEvents).limit(1000);
    const byEndpoint: Record<string, number> = {};
    rows.forEach(r => { const k = r.endpoint ?? "unknown"; byEndpoint[k] = (byEndpoint[k] ?? 0) + 1; });
    return { total: rows.length, byEndpoint };
  }),
  record: protectedProcedure
    .input(z.object({ endpoint: z.string(), ip: z.string(), userId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.insert(schema.rateLimitEvents).values(input);
      return { success: true };
    }),
});

// ─── EMI Loans ────────────────────────────────────────────────────────────────
const emiLoansRouter = router({
  list: protectedProcedure
    .input(z.object({ userId: z.number().optional(), status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.emiLoans).orderBy(desc(schema.emiLoans.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.emiLoans).where(eq(schema.emiLoans.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      userId: z.number(),
      merchantId: z.number().optional(),
      principalKobo: z.number().positive(),
      interestRatePct: z.number().min(0).max(100),
      tenureMonths: z.number().int().min(1).max(60),
      purpose: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const r = input.interestRatePct / 100 / 12;
      const n = input.tenureMonths;
      const emi = r === 0 ? input.principalKobo / n : (input.principalKobo * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      const d = await db();
      const [row] = await d.insert(schema.emiLoans).values({
        ...input,
        emiAmountKobo: Math.round(emi),
        status: "active",
        disbursedAt: new Date(),
      }).$returningId();
      return { ...row, emiAmountKobo: Math.round(emi) };
    }),
  close: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.update(schema.emiLoans).set({ status: "closed", closedAt: new Date() }).where(eq(schema.emiLoans.id, input.id));
    return { success: true };
  }),
  default: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    await d.update(schema.emiLoans).set({ status: "defaulted" }).where(eq(schema.emiLoans.id, input.id));
    return { success: true };
  }),
});

// ─── EMI Repayments ───────────────────────────────────────────────────────────
const emiRepaymentsRouter = router({
  list: protectedProcedure
    .input(z.object({ loanId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.emiRepayments).orderBy(desc(schema.emiRepayments.createdAt)).limit(input.limit);
    }),
  create: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      amountKobo: z.number().positive(),
      paymentRef: z.string(),
      installmentNumber: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.emiRepayments).values({ ...input, status: "paid", paidAt: new Date() }).$returningId();
      return row;
    }),
  listSchedule: protectedProcedure.input(z.object({ loanId: z.number() })).query(async ({ input }) => {
    const d = await db();
    return d.select().from(schema.emiRepayments).where(eq(schema.emiRepayments.loanId, input.loanId)).orderBy(schema.emiRepayments.installmentNumber);
  }),
});

// ─── Export ───────────────────────────────────────────────────────────────────
export const wave99Router = router({
  tenantConfig: tenantConfigRouter,
  subscriptionCharges: subscriptionChargesRouter,
  ptspBatches: ptspBatchesRouter,
  geofenceRules: geofenceRulesRouter,
  agentNetwork: agentNetworkRouter,
  restaurantTables: restaurantTablesRouter,
  restaurantOrders: restaurantOrdersRouter,
  splitBill: splitBillRouter,
  loyalty: loyaltyRouter,
  inventoryReservations: inventoryReservationsRouter,
  inventoryAuditLog: inventoryAuditLogRouter,
  inventoryTransactions: inventoryTransactionsRouter,
  kdsStations: kdsStationsRouter,
  recipeIngredients: recipeIngredientsRouter,
  staffMembers: staffMembersRouter,
  staffShifts: staffShiftsRouter,
  payrollRuns: payrollRunsRouter,
  auditEvents: auditEventsRouter,
  consumerIdempotency: consumerIdempotencyRouter,
  mutualFundTransactions: mutualFundTransactionsRouter,
  consumerNotifPrefs: consumerNotifPrefsRouter,
  adminNotifPrefs: adminNotifPrefsRouter,
  rateLimitEvents: rateLimitEventsRouter,
  emiLoans: emiLoansRouter,
  emiRepayments: emiRepaymentsRouter,
});
