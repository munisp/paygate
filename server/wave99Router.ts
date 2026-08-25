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
import { eq, desc, and, or, sql } from "drizzle-orm";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "./db";
import { demoOrFail } from "./_core/demoData";
import * as schema from "../drizzle/schema";

/** Resolve the caller's merchant (ownership anchor for merchant-scoped mutations). */
async function callerMerchant(openId: string | undefined) {
  if (!openId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Caller has no merchant account" });
  return merchant;
}

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return d;
}

/** Throws FORBIDDEN unless the caller's users.role is 'admin' (DB re-check, adminRouter pattern). */
async function requirePlatformAdmin(d: any, openId: string | undefined): Promise<void> {
  if (!openId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  const [caller] = await d.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.openId, openId)).limit(1);
  if (!caller || caller.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform admin access required" });
  }
}

/**
 * Backward-compatible id inputs: several tables in this router have TEXT primary
 * keys but older clients send numbers (and vice versa for integer columns that
 * receive numeric strings). Accept both and coerce to the column's real type.
 */
const textId = z.union([z.string(), z.number()]).transform((v) => String(v));
const intId = z.union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((n) => Number.isInteger(n), { message: "Expected a numeric integer id" });

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
      // tenant_config has no configKey/configValue columns — only tenant_id is
      // writable from this input; the PG upsert targets the tenant_id unique key.
      await d.insert(schema.tenantConfig).values({ tenantId: input.tenantId })
        .onConflictDoUpdate({ target: schema.tenantConfig.tenantId, set: { updatedAt: new Date() } });
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
    .input(z.object({ subscriptionId: textId.optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.subscriptionCharges)
        .orderBy(desc(schema.subscriptionCharges.createdAt))
        .limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.subscriptionCharges).where(eq(schema.subscriptionCharges.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      subscriptionId: textId,
      amountKobo: z.number().positive(),
      currency: z.string().default("NGN"),
      status: z.enum(["pending", "paid", "failed"]).default("pending"),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);
      // subscription_charges: id is a text PK with no default and merchant_id is
      // notNull — both must be supplied explicitly.
      const [row] = await d.insert(schema.subscriptionCharges).values({
        id: `subc_${crypto.randomUUID()}`,
        subscriptionId: input.subscriptionId,
        merchantId: merchant.id,
        amountKobo: input.amountKobo,
        currency: input.currency,
        status: input.status,
      }).returning();
      return row;
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: textId, status: z.enum(["pending", "paid", "failed"]) }))
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
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
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
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);
      // ptsp_batches: id (text PK, no default) and merchant_id are notNull.
      // batchRef has no column; terminalCount maps to transaction_count.
      const [row] = await d.insert(schema.ptspBatches).values({
        id: `ptsp_${crypto.randomUUID()}`,
        merchantId: merchant.id,
        settlementDate: input.settlementDate,
        totalAmountKobo: input.totalAmountKobo,
        transactionCount: input.terminalCount,
        status: "pending",
      }).returning();
      return row;
    }),
  updateStatus: protectedProcedure
    // ptsp_batch_status pgEnum: pending | submitted | confirmed | failed | partial
    .input(z.object({ id: textId, status: z.enum(["pending", "submitted", "confirmed", "failed", "partial"]) }))
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
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
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
      action: z.enum(["allow", "block", "flag"]).optional(),
      merchantId: textId.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);
      // geofence_rules: center_lat / center_lng are integers (degrees × 1e6) and
      // merchant_id is notNull. There is no `action` or `is_active` column —
      // `active` is a boolean defaulting to true.
      const [row] = await d.insert(schema.geofenceRules).values({
        merchantId: input.merchantId ?? merchant.id,
        name: input.name,
        centerLat: Math.round(input.lat * 1e6),
        centerLng: Math.round(input.lng * 1e6),
        radiusMeters: Math.round(input.radiusMeters),
      }).returning();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({
      id: textId,
      name: z.string().optional(),
      radiusMeters: z.number().optional(),
      action: z.enum(["allow", "block", "flag"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      // Only real columns may be set: name, radius_meters, active (from isActive).
      const set: Record<string, unknown> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.radiusMeters !== undefined) set.radiusMeters = input.radiusMeters;
      if (input.isActive !== undefined) set.active = input.isActive;
      if (Object.keys(set).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No updatable fields provided" });
      }
      await d.update(schema.geofenceRules).set(set).where(eq(schema.geofenceRules.id, input.id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: textId })).mutation(async ({ input }) => {
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
      // agent_network links a super-agent merchant to a sub-agent merchant —
      // subAgentMerchantId is the only writable identifier. agentCode/agentName/
      // phone/state/lga have no columns and are accepted only for compatibility.
      subAgentMerchantId: z.string(),
      agentCode: z.string().optional(),
      agentName: z.string().optional(),
      phone: z.string().optional(),
      state: z.string().optional(),
      lga: z.string().optional(),
      merchantId: textId.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);
      const [row] = await d.insert(schema.agentNetwork).values({
        superAgentMerchantId: merchant.id,
        subAgentMerchantId: input.subAgentMerchantId,
        status: "active",
      }).returning();
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
      const d = await db();
      // agentName / phone have no columns — only status is updatable.
      if (input.status === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No updatable fields provided" });
      }
      await d.update(schema.agentNetwork).set({ status: input.status }).where(eq(schema.agentNetwork.id, input.id));
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
    .input(z.object({ merchantId: textId.optional() }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.restaurantTables).orderBy(schema.restaurantTables.tableNumber);
    }),
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.restaurantTables).where(eq(schema.restaurantTables.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      merchantId: textId,
      tableNumber: z.string(),
      capacity: z.number().int().positive(),
      section: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.restaurantTables).values({ ...input, status: "available" }).returning();
      return row;
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: textId, status: z.enum(["available", "occupied", "reserved", "cleaning"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(schema.restaurantTables).set({ status: input.status }).where(eq(schema.restaurantTables.id, input.id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: textId })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.restaurantTables).where(eq(schema.restaurantTables.id, input.id));
    return { success: true };
  }),
});

// ─── Restaurant Orders ────────────────────────────────────────────────────────
const restaurantOrdersRouter = router({
  list: protectedProcedure
    .input(z.object({ tableId: textId.optional(), status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.restaurantOrders).orderBy(desc(schema.restaurantOrders.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.restaurantOrders).where(eq(schema.restaurantOrders.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      tableId: textId,
      merchantId: textId,
      customerCount: z.number().int().default(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      // restaurant_orders: customerCount maps to `covers` (no customer_count column).
      const [row] = await d.insert(schema.restaurantOrders).values({
        merchantId: input.merchantId,
        tableId: input.tableId,
        covers: input.customerCount,
        notes: input.notes,
        status: "open",
        totalKobo: 0,
      }).returning();
      return row;
    }),
  addItem: protectedProcedure
    .input(z.object({ orderId: textId, menuItemId: textId, quantity: z.number().int().positive(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      // restaurant_order_items requires name + unit_price_kobo (notNull) and has
      // no menu_item_id / quantity column — resolve them from the menu item.
      const [item] = await d.select().from(schema.menuItems).where(eq(schema.menuItems.id, input.menuItemId)).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Menu item not found" });
      const [row] = await d.insert(schema.restaurantOrderItems).values({
        orderId: input.orderId,
        name: item.name,
        qty: input.quantity,
        unitPriceKobo: item.priceKobo,
        status: "pending",
        notes: input.notes,
      }).returning();
      return row;
    }),
  updateStatus: protectedProcedure
    // restaurant_order_status pgEnum: open | sent_to_kitchen | ready | paid | voided
    .input(z.object({ id: textId, status: z.enum(["open", "sent_to_kitchen", "ready", "paid", "voided"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(schema.restaurantOrders).set({ status: input.status }).where(eq(schema.restaurantOrders.id, input.id));
      return { success: true };
    }),
});

// ─── Split Bill Sessions ──────────────────────────────────────────────────────
const splitBillRouter = router({
  listSessions: protectedProcedure
    .input(z.object({ merchantId: textId.optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.splitBillSessions).orderBy(desc(schema.splitBillSessions.createdAt)).limit(input.limit);
    }),
  getSession: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [session] = await d.select().from(schema.splitBillSessions).where(eq(schema.splitBillSessions.id, input.id)).limit(1);
    if (!session) throw new TRPCError({ code: "NOT_FOUND" });
    const shares = await d.select().from(schema.splitBillShares).where(eq(schema.splitBillShares.sessionId, input.id));
    return { session, shares };
  }),
  createSession: protectedProcedure
    .input(z.object({
      orderId: textId,
      totalKobo: z.number().positive(),
      splitType: z.enum(["equal", "custom", "itemized"]),
      participantCount: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);
      // split_bill_sessions: merchant_id + split_count are notNull; splitType and
      // participantCount have no columns (participantCount maps to split_count).
      const [row] = await d.insert(schema.splitBillSessions).values({
        orderId: input.orderId,
        merchantId: merchant.id,
        totalKobo: input.totalKobo,
        splitCount: input.participantCount,
        status: "open",
      }).returning();
      return row;
    }),
  addShare: protectedProcedure
    .input(z.object({ sessionId: textId, participantName: z.string(), amountKobo: z.number().positive() }))
    .mutation(async ({ input }) => {
      const d = await db();
      // split_bill_shares: share_kobo + share_index are notNull; there is no
      // participant_name / amount_kobo / status column.
      const existing = await d.select({ id: schema.splitBillShares.id }).from(schema.splitBillShares)
        .where(eq(schema.splitBillShares.sessionId, input.sessionId));
      const [row] = await d.insert(schema.splitBillShares).values({
        sessionId: input.sessionId,
        shareKobo: input.amountKobo,
        shareIndex: existing.length + 1,
      }).returning();
      return row;
    }),
  markSharePaid: protectedProcedure.input(z.object({ shareId: z.number(), paymentRef: z.string() })).mutation(async ({ input }) => {
    const d = await db();
    // split_bill_shares has no status / payment_ref column — the payment
    // reference is recorded in payment_link_id and paid_at marks it paid.
    await d.update(schema.splitBillShares).set({ paymentLinkId: input.paymentRef, paidAt: new Date() }).where(eq(schema.splitBillShares.id, input.shareId));
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
      merchantId: textId,
      name: z.string().min(1).max(500),
      pointsPerNaira: z.number().default(1),
      redemptionRate: z.number().default(100),
      expiryDays: z.number().default(365),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      // loyalty_programs columns: merchant_id (unique), points_per_kobo,
      // redeem_rate, active — there is no name / expiry_days / is_active column.
      const [row] = await d.insert(schema.loyaltyPrograms).values({
        merchantId: input.merchantId,
        pointsPerKobo: input.pointsPerNaira,
        redeemRate: input.redemptionRate,
        active: true,
      }).returning();
      return row;
    }),
  listAccounts: protectedProcedure
    .input(z.object({ programId: textId.optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.loyaltyAccounts).limit(input.limit);
    }),
  getAccount: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.loyaltyAccounts).where(eq(schema.loyaltyAccounts.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  createAccount: protectedProcedure
    // loyalty_accounts: program_id / merchant_id are text, customer_id is integer.
    .input(z.object({ programId: textId, customerId: intId, merchantId: textId }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d.insert(schema.loyaltyAccounts).values({ ...input, pointsBalance: 0, lifetimePoints: 0 }).returning();
      return row;
    }),
  listTransactions: protectedProcedure
    .input(z.object({ accountId: textId.optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.loyaltyTransactions).orderBy(desc(schema.loyaltyTransactions.createdAt)).limit(input.limit);
    }),
  earnPoints: protectedProcedure
    .input(z.object({ accountId: z.string(), points: z.number().positive(), transactionRef: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);

      // Ownership: the loyalty account must belong to the caller's merchant.
      const [acct] = await d.select().from(schema.loyaltyAccounts)
        .where(eq(schema.loyaltyAccounts.id, input.accountId)).limit(1);
      if (!acct || acct.merchantId !== merchant.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loyalty account not found" });
      }

      // Points may only be earned against a REAL completed transaction owned by
      // this merchant — fabricated refs are rejected. transactionRef matches the
      // transaction id or its public reference.
      const [txRow] = await d.select().from(schema.transactions)
        .where(and(
          eq(schema.transactions.merchantId, merchant.id),
          eq(schema.transactions.status, "completed"),
          or(eq(schema.transactions.id, input.transactionRef), eq(schema.transactions.reference, input.transactionRef)),
        ))
        .limit(1);
      if (!txRow) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction ref not found, not completed, or not owned by this merchant" });
      }

      // Dedup: one earn per (account, transactionRef). loyalty_transactions has no
      // transaction_ref column — the ref is stored in order_id.
      const [existing] = await d.select().from(schema.loyaltyTransactions)
        .where(and(
          eq(schema.loyaltyTransactions.accountId, acct.id),
          eq(schema.loyaltyTransactions.type, "earn"),
          eq(schema.loyaltyTransactions.orderId, input.transactionRef),
        ))
        .limit(1);
      if (existing) {
        return { success: true, deduplicated: true, points: existing.points };
      }

      await d.transaction(async (tx) => {
        await tx.insert(schema.loyaltyTransactions).values({
          accountId: acct.id,
          type: "earn",
          points: input.points,
          orderId: input.transactionRef,
          note: `Earn on transaction ${txRow.id}`,
        });
        await tx.update(schema.loyaltyAccounts).set({
          pointsBalance: sql`${schema.loyaltyAccounts.pointsBalance} + ${input.points}`,
          lifetimePoints: sql`${schema.loyaltyAccounts.lifetimePoints} + ${input.points}`,
          updatedAt: new Date(),
        }).where(eq(schema.loyaltyAccounts.id, acct.id));
      });
      return { success: true };
    }),
  redeemPoints: protectedProcedure
    .input(z.object({ accountId: z.string(), points: z.number().positive(), transactionRef: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);

      // Ownership: the loyalty account must belong to the caller's merchant.
      const [acct] = await d.select().from(schema.loyaltyAccounts)
        .where(eq(schema.loyaltyAccounts.id, input.accountId)).limit(1);
      if (!acct || acct.merchantId !== merchant.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loyalty account not found" });
      }

      await d.transaction(async (tx) => {
        // Single guarded decrement — no stale read, no negative balance race.
        const [updated] = await tx.update(schema.loyaltyAccounts)
          .set({
            pointsBalance: sql`${schema.loyaltyAccounts.pointsBalance} - ${input.points}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(schema.loyaltyAccounts.id, acct.id),
            sql`${schema.loyaltyAccounts.pointsBalance} >= ${input.points}`,
          ))
          .returning();
        if (!updated) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient points" });
        }
        await tx.insert(schema.loyaltyTransactions).values({
          accountId: acct.id,
          type: "redeem",
          points: input.points,
          orderId: input.transactionRef,
          note: "Points redemption",
        });
      });
      return { success: true };
    }),
});

// ─── Inventory Reservations ───────────────────────────────────────────────────
const inventoryReservationsRouter = router({
  list: protectedProcedure
    .input(z.object({ itemId: textId.optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.inventoryReservations).orderBy(desc(schema.inventoryReservations.createdAt)).limit(100);
    }),
  create: protectedProcedure
    .input(z.object({ itemId: textId, quantity: z.number().positive(), orderId: z.string(), expiresAt: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);
      // inventory_reservations: reservation_id is a text PK with no default;
      // merchant_id + expires_at are notNull.
      const [row] = await d.insert(schema.inventoryReservations).values({
        reservationId: `rsv_${crypto.randomUUID()}`,
        itemId: input.itemId,
        merchantId: merchant.id,
        quantity: input.quantity,
        orderId: input.orderId,
        status: "reserved",
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 24 * 3600_000),
      }).returning();
      return row;
    }),
  release: protectedProcedure.input(z.object({ id: textId })).mutation(async ({ input }) => {
    const d = await db();
    // PK column is reservation_id (there is no `id` column).
    await d.update(schema.inventoryReservations).set({ status: "released", releasedAt: new Date() }).where(eq(schema.inventoryReservations.reservationId, input.id));
    return { success: true };
  }),
  confirm: protectedProcedure.input(z.object({ id: textId })).mutation(async ({ input }) => {
    const d = await db();
    await d.update(schema.inventoryReservations).set({ status: "consumed" }).where(eq(schema.inventoryReservations.reservationId, input.id));
    return { success: true };
  }),
});

// ─── Inventory Audit Log ──────────────────────────────────────────────────────
const inventoryAuditLogRouter = router({
  list: protectedProcedure
    .input(z.object({ itemId: textId.optional(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.inventoryAuditLog).orderBy(desc(schema.inventoryAuditLog.createdAt)).limit(input.limit);
    }),
  create: protectedProcedure
    .input(z.object({
      itemId: textId,
      action: z.enum(["adjust", "reserve", "release", "consume", "restock"]),
      quantityBefore: z.number(),
      quantityAfter: z.number(),
      reason: z.string().optional(),
      performedBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);
      // inventory_audit_log columns: item_id, merchant_id (notNull), delta
      // (notNull), reason (notNull), previous_stock, new_stock. action /
      // performedBy have no columns — they are folded into reason.
      const [row] = await d.insert(schema.inventoryAuditLog).values({
        itemId: input.itemId,
        merchantId: merchant.id,
        delta: input.quantityAfter - input.quantityBefore,
        reason: input.reason ?? `${input.action} by ${input.performedBy ?? ctx.user?.openId ?? "unknown"}`,
        previousStock: input.quantityBefore,
        newStock: input.quantityAfter,
      }).returning();
      return row;
    }),
});

// ─── Inventory Transactions ───────────────────────────────────────────────────
const inventoryTransactionsRouter = router({
  list: protectedProcedure
    .input(z.object({ itemId: textId.optional(), type: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.inventoryTransactions).orderBy(desc(schema.inventoryTransactions.createdAt)).limit(input.limit);
    }),
  create: protectedProcedure
    .input(z.object({
      itemId: textId,
      type: z.enum(["purchase", "sale", "adjustment", "waste", "transfer"]),
      quantity: z.number(),
      unitCost: z.number().optional(),
      reference: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      // inventory_transactions columns: item_id, type, quantity, order_id, note —
      // unit_cost has no column; reference maps to note.
      const [row] = await d.insert(schema.inventoryTransactions).values({
        itemId: input.itemId,
        type: input.type,
        quantity: input.quantity,
        note: input.reference,
      }).returning();
      return row;
    }),
});

// ─── KDS Stations ─────────────────────────────────────────────────────────────
const kdsStationsRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: textId.optional() }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.kdsStations).limit(50);
    }),
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.kdsStations).where(eq(schema.kdsStations.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({ merchantId: textId, name: z.string().min(1).max(500), stationType: z.enum(["grill", "cold", "bar", "pastry", "main"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      // kds_stations columns: merchant_id, name, categories (jsonb string[]),
      // active — stationType maps into categories; there is no is_active column.
      const [row] = await d.insert(schema.kdsStations).values({
        merchantId: input.merchantId,
        name: input.name,
        categories: [input.stationType],
        active: true,
      }).returning();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({ id: textId, name: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const set: Record<string, unknown> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.isActive !== undefined) set.active = input.isActive;
      if (Object.keys(set).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No updatable fields provided" });
      }
      await d.update(schema.kdsStations).set(set).where(eq(schema.kdsStations.id, input.id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: textId })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.kdsStations).where(eq(schema.kdsStations.id, input.id));
    return { success: true };
  }),
});

// ─── Recipe Ingredients ───────────────────────────────────────────────────────
const recipeIngredientsRouter = router({
  list: protectedProcedure
    .input(z.object({ menuItemId: textId.optional() }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.recipeIngredients).limit(200);
    }),
  create: protectedProcedure
    .input(z.object({ menuItemId: textId, inventoryItemId: textId, quantity: z.number().positive(), unit: z.string() }))
    .mutation(async ({ input }) => {
      const d = await db();
      // recipe_ingredients columns: menu_item_id, inventory_item_id,
      // quantity_per_serving (integer, base unit × 100) — there is no
      // quantity / unit column.
      const [row] = await d.insert(schema.recipeIngredients).values({
        menuItemId: input.menuItemId,
        inventoryItemId: input.inventoryItemId,
        quantityPerServing: Math.round(input.quantity),
      }).returning();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), quantity: z.number().optional(), unit: z.string().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      if (input.quantity === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No updatable fields provided" });
      }
      await d.update(schema.recipeIngredients).set({ quantityPerServing: Math.round(input.quantity) }).where(eq(schema.recipeIngredients.id, input.id));
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
    .input(z.object({ merchantId: textId.optional(), status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.staffMembers).orderBy(desc(schema.staffMembers.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.staffMembers).where(eq(schema.staffMembers.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      merchantId: textId,
      fullName: z.string(),
      role: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      salaryKobo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      // staff_members columns: merchant_id, name, role, hourly_rate_kobo,
      // active — fullName maps to name, salaryKobo to hourly_rate_kobo; email /
      // phone / status have no columns.
      const [row] = await d.insert(schema.staffMembers).values({
        merchantId: input.merchantId,
        name: input.fullName,
        role: input.role,
        hourlyRateKobo: input.salaryKobo,
        active: true,
      }).returning();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({
      id: textId,
      fullName: z.string().optional(),
      role: z.string().optional(),
      status: z.enum(["active", "inactive", "terminated"]).optional(),
      salaryKobo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      const set: Record<string, unknown> = {};
      if (input.fullName !== undefined) set.name = input.fullName;
      if (input.role !== undefined) set.role = input.role;
      if (input.salaryKobo !== undefined) set.hourlyRateKobo = input.salaryKobo;
      if (input.status !== undefined) set.active = input.status === "active";
      if (Object.keys(set).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No updatable fields provided" });
      }
      await d.update(schema.staffMembers).set(set).where(eq(schema.staffMembers.id, input.id));
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: textId })).mutation(async ({ input }) => {
    const d = await db();
    await d.delete(schema.staffMembers).where(eq(schema.staffMembers.id, input.id));
    return { success: true };
  }),
});

// ─── Staff Shifts ─────────────────────────────────────────────────────────────
const staffShiftsRouter = router({
  list: protectedProcedure
    .input(z.object({ staffId: textId.optional(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const d = await db();
      // staff_shifts has no start_time column — order by clock_in.
      return d.select().from(schema.staffShifts).orderBy(desc(schema.staffShifts.clockIn)).limit(input.limit);
    }),
  clockIn: protectedProcedure
    .input(z.object({ staffId: textId, merchantId: textId }))
    .mutation(async ({ input }) => {
      const d = await db();
      // staff_shifts columns: staff_id, merchant_id, clock_in (notNull) —
      // there is no start_time / status column.
      const [row] = await d.insert(schema.staffShifts).values({
        staffId: input.staffId,
        merchantId: input.merchantId,
        clockIn: new Date(),
      }).returning();
      return row;
    }),
  clockOut: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    const endTime = new Date();
    const [shift] = await d.select().from(schema.staffShifts).where(eq(schema.staffShifts.id, input.id)).limit(1);
    if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "Shift not found" });
    // staff_shifts columns: clock_out + hours_worked (minutes) — there is no
    // end_time / status column.
    const hoursWorked = Math.max(0, Math.round((endTime.getTime() - new Date(shift.clockIn).getTime()) / 60000));
    await d.update(schema.staffShifts).set({ clockOut: endTime, hoursWorked }).where(eq(schema.staffShifts.id, input.id));
    return { success: true };
  }),
});

// ─── Payroll Runs ─────────────────────────────────────────────────────────────
const payrollRunsRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: textId.optional(), status: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      return d.select().from(schema.payrollRuns).orderBy(desc(schema.payrollRuns.createdAt)).limit(input.limit);
    }),
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      periodStart: z.string(),
      periodEnd: z.string(),
      totalGrossKobo: z.number(),
      totalNetKobo: z.number(),
      staffCount: z.number().int(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      // payroll_runs columns: id, merchant_id, period_start, period_end, status,
      // total_kobo, staff_count, created_at (no total_gross/total_net columns).
      const [row] = await d.insert(schema.payrollRuns).values({
        merchantId: input.merchantId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        totalKobo: input.totalNetKobo,
        staffCount: input.staffCount,
        status: "draft",
      }).returning();
      return row;
    }),
  approve: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const d = await db();
    const merchant = await callerMerchant(ctx.user?.openId);
    // Maker-checker: only a DRAFT run owned by the caller's merchant can be approved.
    const [updated] = await d.update(schema.payrollRuns)
      .set({ status: "approved" })
      .where(and(
        eq(schema.payrollRuns.id, input.id),
        eq(schema.payrollRuns.merchantId, merchant.id),
        eq(schema.payrollRuns.status, "draft"),
      ))
      .returning();
    if (!updated) {
      const [existing] = await d.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, input.id)).limit(1);
      if (!existing || existing.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });
      throw new TRPCError({ code: "BAD_REQUEST", message: `Payroll run is '${existing.status}', only 'draft' runs can be approved` });
    }
    return { success: true };
  }),
  disburse: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const d = await db();
    const merchant = await callerMerchant(ctx.user?.openId);
    // Ownership + maker-checker precondition, enforced atomically: only an APPROVED
    // run owned by the caller's merchant can move forward, and the atomic claim
    // prevents double-disbursement under concurrency.
    const [claimed] = await d.update(schema.payrollRuns)
      .set({ status: "disbursement_pending" })
      .where(and(
        eq(schema.payrollRuns.id, input.id),
        eq(schema.payrollRuns.merchantId, merchant.id),
        eq(schema.payrollRuns.status, "approved"),
      ))
      .returning();
    if (!claimed) {
      const [existing] = await d.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, input.id)).limit(1);
      if (!existing || existing.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });
      throw new TRPCError({ code: "BAD_REQUEST", message: `Payroll run is '${existing.status}', must be 'approved' before disbursement (maker-checker)` });
    }
    // No real payroll disbursement rail exists in this repo. Fail loud in
    // production (SERVICE_UNAVAILABLE); only simulate behind
    // PAYGATE_SIMULATION_MODE=true. Money is NEVER marked as moved: the run
    // stays in 'disbursement_pending' until a real rail settles it.
    const rail = demoOrFail(
      { runId: claimed.id, amountKobo: claimed.totalKobo, status: "disbursement_pending", rail: "none-in-repo" },
      "Payroll disbursement rail",
    );
    return { success: true, status: "disbursement_pending", rail };
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
      const merchant = await callerMerchant(ctx.user?.openId);
      // audit_events columns: merchant_id / actor_id / actor_name / action /
      // resource are notNull. entityType / entityId map to resource /
      // resource_id; metadata is jsonb (pass the object, not a string).
      const [row] = await d.insert(schema.auditEvents).values({
        merchantId: merchant.id,
        actorId: ctx.user?.openId ?? "unknown",
        actorName: ctx.user?.name ?? ctx.user?.openId ?? "unknown",
        actorEmail: ctx.user?.email ?? null,
        action: input.action,
        resource: input.entityType,
        resourceId: input.entityId,
        metadata: input.metadata ?? {},
      }).returning();
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
    .input(z.object({ key: z.string(), userId: z.number(), operation: z.string().optional(), responsePayload: z.string(), expiresAt: z.string().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      // consumer_idempotency_keys.operation is notNull — default it when the
      // caller doesn't supply one. PG upsert targets the idempotency_key
      // unique constraint.
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 24 * 3600_000);
      await d.insert(schema.consumerIdempotencyKeys).values({
        idempotencyKey: input.key,
        userId: input.userId,
        operation: input.operation ?? "unknown",
        responsePayload: input.responsePayload,
        expiresAt,
      }).onConflictDoUpdate({
        target: schema.consumerIdempotencyKeys.idempotencyKey,
        set: { responsePayload: input.responsePayload, expiresAt },
      });
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
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.mutualFundTransactions).where(eq(schema.mutualFundTransactions.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      userId: z.number(),
      fundId: textId,
      type: z.enum(["purchase", "redemption", "switch"]),
      amountKobo: z.number().positive(),
      units: z.number().optional(),
      nav: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const merchant = await callerMerchant(ctx.user?.openId);
      // mutual_fund_transactions columns: merchant_id (notNull), fund_id (text),
      // type, amount_kobo, units (text, notNull), nav_at_transaction (text,
      // notNull), status — there is no user_id / nav column.
      const [row] = await d.insert(schema.mutualFundTransactions).values({
        merchantId: merchant.id,
        fundId: input.fundId,
        type: input.type,
        amountKobo: input.amountKobo,
        units: String(input.units ?? 0),
        navAtTransaction: String(input.nav ?? 0),
        status: "pending",
      }).returning();
      return row;
    }),
  confirm: protectedProcedure.input(z.object({ id: textId, units: z.number(), nav: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    // units / nav_at_transaction are text columns; there is no processed_at column.
    await d.update(schema.mutualFundTransactions).set({
      status: "completed",
      units: String(input.units),
      navAtTransaction: String(input.nav),
    }).where(eq(schema.mutualFundTransactions.id, input.id));
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
      // Only real columns may be written: the four channel toggles.
      // transactionAlerts / marketingEmails have no columns.
      const set = {
        emailEnabled: input.emailEnabled,
        smsEnabled: input.smsEnabled,
        pushEnabled: input.pushEnabled,
        inAppEnabled: input.inAppEnabled,
        updatedAt: new Date(),
      };
      await d.insert(schema.consumerNotificationPrefs).values({ userId: input.userId, ...set })
        .onConflictDoUpdate({ target: schema.consumerNotificationPrefs.userId, set });
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
      // Only real columns may be written: emailEnabled + pushEnabled. There is
      // no sms_enabled (the admin table uses slack_enabled), alert_threshold,
      // fraud_alerts or system_alerts column.
      const set = {
        emailEnabled: input.emailEnabled,
        pushEnabled: input.pushEnabled,
        updatedAt: new Date(),
      };
      await d.insert(schema.adminNotificationPrefs).values({ userId: input.userId, ...set })
        .onConflictDoUpdate({ target: schema.adminNotificationPrefs.userId, set });
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
      // rate_limit_events columns: identifier / identifier_type / window_ms /
      // limit_val / count are notNull; the IP goes to ip_address and there is
      // no user_id / ip column.
      await d.insert(schema.rateLimitEvents).values({
        identifier: input.userId !== undefined ? String(input.userId) : input.ip,
        identifierType: input.userId !== undefined ? "user" : "ip",
        endpoint: input.endpoint,
        ipAddress: input.ip,
        windowMs: 60_000,
        limitVal: 1,
        count: 1,
        blocked: true,
      });
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
  get: protectedProcedure.input(z.object({ id: textId })).query(async ({ input }) => {
    const d = await db();
    const [row] = await d.select().from(schema.emiLoans).where(eq(schema.emiLoans.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure
    .input(z.object({
      // Optional legacy hint — the borrower is ALWAYS derived from the
      // authenticated session (F8-12); a mismatched value is rejected.
      userId: z.number().optional(),
      merchantId: z.number().optional(),
      principalKobo: z.number().positive(),
      interestRatePct: z.number().min(0).max(100),
      tenureMonths: z.number().int().min(1).max(60),
      purpose: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      if (input.userId !== undefined && input.userId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot originate a loan for another user" });
      }
      const r = input.interestRatePct / 100 / 12;
      const n = input.tenureMonths;
      const emi = r === 0 ? input.principalKobo / n : (input.principalKobo * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      const d = await db();
      // emi_loans columns: id (text PK, no default), user_id, principal_kobo,
      // emi_kobo, tenure_months, annual_rate_pct (integer), purpose (notNull),
      // status — there is no merchant_id / emi_amount_kobo / disbursed_at column.
      const [row] = await d.insert(schema.emiLoans).values({
        id: `emi_${crypto.randomUUID()}`,
        userId: user.id,
        principalKobo: input.principalKobo,
        emiKobo: Math.round(emi),
        tenureMonths: input.tenureMonths,
        annualRatePct: Math.round(input.interestRatePct),
        purpose: input.purpose ?? "general",
        status: "active",
      }).returning();
      return row;
    }),
  close: protectedProcedure.input(z.object({ id: textId })).mutation(async ({ input, ctx }) => {
    const d = await db();
    // Closing a loan is a platform servicing action (F8-12).
    await requirePlatformAdmin(d, ctx.user.openId);
    // emi_loans has no closed_at column. Guarded flip: only an active loan can
    // be closed (terminal states are not re-enterable).
    const [row] = await d.update(schema.emiLoans).set({ status: "closed" })
      .where(and(eq(schema.emiLoans.id, input.id), eq(schema.emiLoans.status, "active")))
      .returning({ id: schema.emiLoans.id });
    if (!row) throw new TRPCError({ code: "CONFLICT", message: "Loan is not active (already closed/defaulted)" });
    return { success: true };
  }),
  default: protectedProcedure.input(z.object({ id: textId })).mutation(async ({ input, ctx }) => {
    const d = await db();
    // Marking a loan defaulted is a platform servicing action (F8-12).
    await requirePlatformAdmin(d, ctx.user.openId);
    // Guarded flip: only an active loan can default.
    const [row] = await d.update(schema.emiLoans).set({ status: "defaulted" })
      .where(and(eq(schema.emiLoans.id, input.id), eq(schema.emiLoans.status, "active")))
      .returning({ id: schema.emiLoans.id });
    if (!row) throw new TRPCError({ code: "CONFLICT", message: "Loan is not active (already closed/defaulted)" });
    return { success: true };
  }),
});

// ─── EMI Repayments ───────────────────────────────────────────────────────────
const emiRepaymentsRouter = router({
  list: protectedProcedure
    .input(z.object({ loanId: textId.optional(), limit: z.number().default(50) }))
    .query(async ({ input, ctx }) => {
      const d = await db();
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      // Previously returned EVERY user's repayments (F8-12). Non-admins only
      // ever see their own; platform admins may list across users.
      const conds: any[] = [];
      if (user.role !== "admin") conds.push(eq(schema.emiRepayments.userId, user.id));
      if (input.loanId !== undefined) conds.push(eq(schema.emiRepayments.loanId, input.loanId));
      // emi_repayments has no created_at column — order by paid_at.
      let q = d.select().from(schema.emiRepayments).$dynamic();
      if (conds.length) q = q.where(and(...conds));
      return q.orderBy(desc(schema.emiRepayments.paidAt)).limit(input.limit);
    }),
  create: protectedProcedure
    .input(z.object({
      loanId: textId,
      amountKobo: z.number().positive(),
      paymentRef: z.string(),
      installmentNumber: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const d = await db();
      // emi_repayments: id (text PK, no default) and user_id are notNull —
      // user_id comes from the loan. paymentRef maps to payment_reference and
      // installmentNumber to instalment_number (schema spelling).
      const [loan] = await d.select().from(schema.emiLoans).where(eq(schema.emiLoans.id, input.loanId)).limit(1);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      const [row] = await d.insert(schema.emiRepayments).values({
        id: `repay_${crypto.randomUUID()}`,
        loanId: input.loanId,
        userId: loan.userId,
        amountKobo: input.amountKobo,
        paymentReference: input.paymentRef,
        instalmentNumber: input.installmentNumber,
        status: "paid",
        paidAt: new Date(),
      }).returning();
      return row;
    }),
  listSchedule: protectedProcedure.input(z.object({ loanId: textId })).query(async ({ input }) => {
    const d = await db();
    return d.select().from(schema.emiRepayments).where(eq(schema.emiRepayments.loanId, input.loanId)).orderBy(schema.emiRepayments.instalmentNumber);
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
