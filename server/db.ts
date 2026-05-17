import { cpus } from "os";
import { and, asc, count, desc, eq, gte, like, lte, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { withCache, cache, TTL } from "./cache";
import {
  type InsertApiKey, type InsertCustomer, type InsertDispute,
  type InsertMerchant, type InsertPayout, type InsertPaymentLink,
  type InsertTeamMember, type InsertTransaction, type InsertUser,
  type InsertVirtualCard, type InsertWebhook, type InsertWebhookDelivery,
  type WebhookDelivery, type InsertFraudAlert, type InsertKycSubmission,
  type InsertBnplLoan, type InsertMobileMoneyReconRecord,
  apiKeys, customers, disputes, merchants, paymentLinks, payouts,
  teamMembers, transactions, users, virtualCards, webhooks, webhookDeliveries,
  fraudAlerts, kycSubmissions, bnplLoans, mobileMoneyRecon,
  // Wave 33 additions
  tenants, tenantConfig, idempotencyRequests, merchantNotifications,
  devicePushTokens, subscriptions, subscriptionCharges,
  posTerminals, posTransactions, ptspBatches,
  geofenceRules, agentNetwork,
  restaurantTables, restaurantOrders, restaurantOrderItems,
  splitBillSessions, splitBillShares,
  menuCategories, menuItems,
  loyaltyPrograms, loyaltyAccounts, loyaltyTransactions,
  kdsStations, inventoryItems, inventoryTransactions, recipeIngredients,
  staffMembers, staffShifts, payrollRuns,
  bnplPlans, type BnplPlan, type InsertBnplPlan,
  purchaseOrders, type PurchaseOrder, type InsertPurchaseOrder,
  fraudAlertComments, type FraudAlertComment, type InsertFraudAlertComment,
  reconciliationAlerts, type ReconciliationAlert, type InsertReconciliationAlert,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import * as schema from "../drizzle/schema";
export { schema };

// ─── DB singleton ─────────────────────────────────────────────────────────────
// PostgreSQL is the database of choice for PayGate.
// PG_DATABASE_URL takes precedence; DATABASE_URL is used only if it is already
// a postgres:// URL (e.g. a managed PG instance injected by the platform).
function resolveDbUrl(): string | undefined {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgresql://") || url.startsWith("postgres://")) return url;
  // Fall back to explicit PG override or the local dev instance
  return process.env.PG_DATABASE_URL ?? "postgresql://paygate_user:paygate_dev_2026@127.0.0.1:5432/paygate_db";
}

const cpuCount = cpus().length;
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db) {
    const dbUrl = resolveDbUrl();
    if (!dbUrl) return null;
    try {
      _pool = new Pool({
        connectionString: dbUrl,
        // 1B-payments lesson: pool size = 2×vCPU+1 (capped at env override)
        max: parseInt(process.env.PG_POOL_MAX ?? String(Math.min(2 * cpuCount + 1, 50))),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        allowExitOnIdle: false,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}


// ─── Raw SQL helper (parameterized queries for Drizzle) ───────────────────────
// Drizzle's .execute() only accepts a SQL object. This helper wraps raw SQL
// strings with positional $1/$2/... parameters using the underlying pg Pool.
export async function execRaw(
  _db: ReturnType<typeof drizzle> | null,
  query: string,
  params: unknown[] = []
): Promise<{ rows: Record<string, unknown>[] }> {
  if (!_pool) throw new Error("Database pool unavailable");
  const result = await _pool.query(query, params);
  return { rows: result.rows };
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    textFields.forEach(field => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      (values as any)[field] = normalized;
      updateSet[field] = normalized;
    });
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

// ─── Merchants ────────────────────────────────────────────────────────────────

export async function getMerchantByOwnerId(ownerId: number) {
  return withCache("merchant:profile", `owner:${ownerId}`, TTL.MERCHANT_PROFILE, async () => {
    const db = await getDb(); if (!db) return null;
    if (!db) throw new Error('Database unavailable');
    const r = await db.select().from(merchants).where(eq(merchants.ownerId, ownerId)).limit(1);
    return r[0] ?? null;
  });
}
export async function getMerchantById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createMerchant(data: InsertMerchant) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.insert(merchants).values(data); return getMerchantById(data.id);
}
export async function updateMerchant(id: string, data: Partial<InsertMerchant>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(merchants).set({ ...data, updatedAt: new Date() }).where(eq(merchants.id, id));
  // Invalidate merchant profile cache on update
  await cache.flush("merchant:profile").catch(() => {});
  return getMerchantById(id);
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function listTransactions(merchantId: string, opts: {
  limit?: number; offset?: number; status?: string; search?: string;
  from?: Date; to?: Date;
  channel?: string; currency?: string;
  amountMin?: number; amountMax?: number;
  sortBy?: 'createdAt' | 'amount' | 'status' | 'channel';
  sortOrder?: 'asc' | 'desc';
}) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds = [eq(transactions.merchantId, merchantId)];
  if (opts.status) conds.push(eq(transactions.status, opts.status as any));
  if (opts.search) conds.push(like(transactions.reference, `%${opts.search}%`));
  if (opts.from) conds.push(gte(transactions.createdAt, opts.from));
  if (opts.to) conds.push(lte(transactions.createdAt, opts.to));
  if (opts.channel) conds.push(eq(transactions.channel, opts.channel as any));
  if (opts.currency) conds.push(eq(transactions.currency, opts.currency));
  if (opts.amountMin != null) conds.push(gte(transactions.amount, opts.amountMin));
  if (opts.amountMax != null) conds.push(lte(transactions.amount, opts.amountMax));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  // Build sort expression
  const sortCol = opts.sortBy === 'amount' ? transactions.amount
    : opts.sortBy === 'status' ? transactions.status
    : opts.sortBy === 'channel' ? transactions.channel
    : transactions.createdAt;
  const orderExpr = opts.sortOrder === 'asc' ? asc(sortCol) : desc(sortCol);
  const [rows, tot] = await Promise.all([
    db.select().from(transactions).where(w).orderBy(orderExpr).limit(lim).offset(off),
    db.select({ count: count() }).from(transactions).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function getTransactionById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createTransaction(data: InsertTransaction) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.insert(transactions).values(data); return getTransactionById(data.id);
}
export async function updateTransaction(id: string, data: Partial<InsertTransaction>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(transactions).set({ ...data, updatedAt: new Date() }).where(eq(transactions.id, id));
}
export async function getTransactionStats(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select({
    totalCount: count(), totalVolume: sum(transactions.amount), totalFees: sum(transactions.feeAmount),
    completedCount: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    failedCount: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
  }).from(transactions).where(and(eq(transactions.merchantId, merchantId), gte(transactions.createdAt, from), lte(transactions.createdAt, to)));
  return r[0] ?? null;
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function listCustomers(merchantId: string, opts: { limit?: number; offset?: number; search?: string; riskLevel?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds = [eq(customers.merchantId, merchantId)];
  if (opts.search) conds.push(like(customers.email, `%${opts.search}%`));
  if (opts.riskLevel) conds.push(eq(customers.riskLevel, opts.riskLevel as any));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(customers).where(w).orderBy(desc(customers.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(customers).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function getCustomerById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return r[0] ?? null;
}
export async function upsertCustomer(data: InsertCustomer) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.insert(customers).values(data).onConflictDoUpdate({ target: customers.id, set: { name: data.name, phone: data.phone, updatedAt: new Date() } });
  return getCustomerById(data.id);
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

export async function listPayouts(merchantId: string, opts: { limit?: number; offset?: number; status?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds = [eq(payouts.merchantId, merchantId)];
  if (opts.status) conds.push(eq(payouts.status, opts.status as any));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(payouts).where(w).orderBy(desc(payouts.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(payouts).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function getPayoutById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select().from(payouts).where(eq(payouts.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createPayout(data: InsertPayout) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.insert(payouts).values(data); return getPayoutById(data.id);
}
export async function updatePayout(id: string, data: Partial<InsertPayout>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(payouts).set({ ...data, updatedAt: new Date() }).where(eq(payouts.id, id));
}
export async function listPayoutsByIds(merchantId: string, ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const { inArray } = await import('drizzle-orm');
  return db.select().from(payouts)
    .where(and(eq(payouts.merchantId, merchantId), inArray(payouts.id, ids)))
    .orderBy(desc(payouts.createdAt));
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export async function listApiKeys(merchantId: string, opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const lim = opts.limit ?? 50; const off = opts.offset ?? 0;
  return db.select().from(apiKeys).where(and(eq(apiKeys.merchantId, merchantId), eq(apiKeys.isActive, true))).orderBy(desc(apiKeys.createdAt)).limit(lim).offset(off);
}
export async function createApiKey(data: InsertApiKey) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const r = await db.insert(apiKeys).values(data).returning();
  return r[0] ?? null;
}
export async function revokeApiKey(id: string, merchantId: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(apiKeys).set({ isActive: false, revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.merchantId, merchantId)));
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function listWebhooks(merchantId: string, opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const lim = opts.limit ?? 50; const off = opts.offset ?? 0;
  return db.select().from(webhooks).where(eq(webhooks.merchantId, merchantId)).orderBy(desc(webhooks.createdAt)).limit(lim).offset(off);
}
export async function createWebhook(data: InsertWebhook) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const r = await db.insert(webhooks).values(data).returning();
  return r[0] ?? null;
}
export async function deleteWebhook(id: string, merchantId: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.merchantId, merchantId)));
}
export async function updateWebhook(id: string, merchantId: string, data: Partial<InsertWebhook>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(webhooks).set({ ...data, updatedAt: new Date() }).where(and(eq(webhooks.id, id), eq(webhooks.merchantId, merchantId)));
  return getWebhookById(id);
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

export async function listDisputes(merchantId: string, opts: { limit?: number; offset?: number; status?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds = [eq(disputes.merchantId, merchantId)];
  if (opts.status) conds.push(eq(disputes.status, opts.status as any));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(disputes).where(w).orderBy(desc(disputes.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(disputes).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function getDisputeById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createDispute(data: InsertDispute) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const r = await db.insert(disputes).values(data).returning();
  return r[0] ?? null;
}
export async function updateDispute(id: string, data: Partial<InsertDispute>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(disputes).set({ ...data, updatedAt: new Date() }).where(eq(disputes.id, id));
}

// ─── Virtual Cards ────────────────────────────────────────────────────────────

export async function listVirtualCards(merchantId: string, opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const lim = opts.limit ?? 50; const off = opts.offset ?? 0;
  return db.select().from(virtualCards).where(eq(virtualCards.merchantId, merchantId)).orderBy(desc(virtualCards.createdAt)).limit(lim).offset(off);
}
export async function getVirtualCardById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select().from(virtualCards).where(eq(virtualCards.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createVirtualCard(data: InsertVirtualCard) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const r = await db.insert(virtualCards).values(data).returning();
  return r[0] ?? null;
}
export async function updateVirtualCard(id: string, data: Partial<InsertVirtualCard>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(virtualCards).set({ ...data, updatedAt: new Date() }).where(eq(virtualCards.id, id));
}

// ─── Payment Links ────────────────────────────────────────────────────────────

export async function listPaymentLinks(merchantId: string, opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const lim = opts.limit ?? 50; const off = opts.offset ?? 0;
  return db.select().from(paymentLinks).where(eq(paymentLinks.merchantId, merchantId)).orderBy(desc(paymentLinks.createdAt)).limit(lim).offset(off);
}
export async function getPaymentLinkById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select().from(paymentLinks).where(eq(paymentLinks.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createPaymentLink(data: InsertPaymentLink) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const r = await db.insert(paymentLinks).values(data).returning();
  return r[0] ?? null;
}
export async function updatePaymentLink(id: string, data: Partial<InsertPaymentLink>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(paymentLinks).set({ ...data, updatedAt: new Date() }).where(eq(paymentLinks.id, id));
}

// ─── Team Members ─────────────────────────────────────────────────────────────

export async function listTeamMembers(merchantId: string, opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const lim = opts.limit ?? 50; const off = opts.offset ?? 0;
  return db.select().from(teamMembers).where(eq(teamMembers.merchantId, merchantId)).orderBy(desc(teamMembers.createdAt)).limit(lim).offset(off);
}
export async function createTeamMember(data: InsertTeamMember) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const r = await db.insert(teamMembers).values(data).returning();
  return r[0] ?? null;
}
export async function updateTeamMember(id: number, data: Partial<InsertTeamMember>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(teamMembers).set({ ...data, updatedAt: new Date() }).where(eq(teamMembers.id, id));
}
export async function deleteTeamMember(id: number, merchantId: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.delete(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.merchantId, merchantId)));
}
export async function updateTeamMemberRole(id: number, merchantId: string, role: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(teamMembers).set({ role: role as any, updatedAt: new Date() }).where(and(eq(teamMembers.id, id), eq(teamMembers.merchantId, merchantId)));
}
export async function getTeamMember(id: number, merchantId: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.merchantId, merchantId))).limit(1);
  return rows[0] ?? null;
}
export async function updateTeamMemberInviteToken(id: number, merchantId: string, token: string, expiry: Date) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  await db.update(teamMembers).set({ inviteToken: token, inviteExpiresAt: expiry, updatedAt: new Date() }).where(and(eq(teamMembers.id, id), eq(teamMembers.merchantId, merchantId)));
}
export async function acceptTeamInvite(token: string, email: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(teamMembers).where(and(eq(teamMembers.inviteToken, token), eq(teamMembers.email, email))).limit(1);
  const member = rows[0];
  if (!member) return null;
  if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) return null;
  await db.update(teamMembers).set({ status: 'active' as any, inviteToken: null, inviteExpiresAt: null, updatedAt: new Date() }).where(eq(teamMembers.id, member.id));
  return member;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsOverview(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [tx, po, di, cu] = await Promise.all([
    db.select({ totalVolume: sum(transactions.amount), totalFees: sum(transactions.feeAmount), totalCount: count(),
      completedCount: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      failedCount: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
    }).from(transactions).where(and(eq(transactions.merchantId, merchantId), gte(transactions.createdAt, from), lte(transactions.createdAt, to))),
    db.select({ totalPayouts: sum(payouts.amount), payoutCount: count() }).from(payouts)
      .where(and(eq(payouts.merchantId, merchantId), gte(payouts.createdAt, from), lte(payouts.createdAt, to))),
    db.select({ disputeCount: count() }).from(disputes)
      .where(and(eq(disputes.merchantId, merchantId), eq(disputes.status, "open"))),
    db.select({ customerCount: count() }).from(customers).where(eq(customers.merchantId, merchantId)),
  ]);
  return { transactions: tx[0], payouts: po[0], disputes: di[0], customers: cu[0] };
}

export async function getRevenueTimeSeries(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select({
    date: sql<string>`DATE(created_at)`,
    volume: sum(transactions.amount),
    fees: sum(transactions.feeAmount),
    count: count(),
  }).from(transactions)
    .where(and(eq(transactions.merchantId, merchantId), eq(transactions.status, "completed"), gte(transactions.createdAt, from), lte(transactions.createdAt, to)))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`);
}

export async function getChannelBreakdown(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select({
    channel: transactions.channel,
    volume: sum(transactions.amount),
    count: count(),
    successRate: sql<number>`ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)`,
  }).from(transactions)
    .where(and(eq(transactions.merchantId, merchantId), gte(transactions.createdAt, from), lte(transactions.createdAt, to)))
    .groupBy(transactions.channel)
    .orderBy(desc(sum(transactions.amount)));
}

// ─── Fraud Alerts ──────────────────────────────────────────────────────────────

export async function listFraudAlerts(merchantId: string, opts: { limit?: number; offset?: number; status?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(fraudAlerts.merchantId, merchantId)];
  if (opts.status) conds.push(eq(fraudAlerts.status, opts.status as any));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(fraudAlerts).where(w).orderBy(desc(fraudAlerts.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(fraudAlerts).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function createFraudAlert(data: InsertFraudAlert) {
  const db = await getDb(); if (!db) throw new Error('DB unavailable');
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.insert(fraudAlerts).values(data).returning();
  return row;
}
export async function updateFraudAlert(id: string, merchantId: string, data: Partial<InsertFraudAlert>) {
  const db = await getDb(); if (!db) throw new Error('DB unavailable');
  if (!db) throw new Error('Database unavailable');
  await db.update(fraudAlerts).set({ ...data, updatedAt: new Date() }).where(and(eq(fraudAlerts.id, id), eq(fraudAlerts.merchantId, merchantId)));
}
export async function getFraudStats(merchantId: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select({
    total: count(),
    open: sql<number>`SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)`,
    investigating: sql<number>`SUM(CASE WHEN status = 'investigating' THEN 1 ELSE 0 END)`,
    avgRiskScore: sql<number>`AVG(risk_score)`,
  }).from(fraudAlerts).where(eq(fraudAlerts.merchantId, merchantId));
  return r[0] ?? null;
}

// ─── KYC Submissions ──────────────────────────────────────────────────────────────

export async function listKycSubmissions(merchantId: string, opts: { limit?: number; offset?: number; status?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(kycSubmissions.merchantId, merchantId)];
  if (opts.status) conds.push(eq(kycSubmissions.status, opts.status as any));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(kycSubmissions).where(w).orderBy(desc(kycSubmissions.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(kycSubmissions).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function updateKycSubmission(id: string, merchantId: string, data: Partial<InsertKycSubmission>) {
  const db = await getDb(); if (!db) throw new Error('DB unavailable');
  if (!db) throw new Error('Database unavailable');
  await db.update(kycSubmissions).set({ ...data, updatedAt: new Date() }).where(and(eq(kycSubmissions.id, id), eq(kycSubmissions.merchantId, merchantId)));
}
export async function getKycStats(merchantId: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select({
    total: count(),
    approved: sql<number>`SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)`,
    pending: sql<number>`SUM(CASE WHEN status IN ('pending','under_review') THEN 1 ELSE 0 END)`,
    rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
  }).from(kycSubmissions).where(eq(kycSubmissions.merchantId, merchantId));
  return r[0] ?? null;
}

// ─── BNPL Loans ──────────────────────────────────────────────────────────────

export async function listBnplLoans(merchantId: string, opts: { limit?: number; offset?: number; status?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(bnplLoans.merchantId, merchantId)];
  if (opts.status) conds.push(eq(bnplLoans.status, opts.status as any));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(bnplLoans).where(w).orderBy(desc(bnplLoans.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(bnplLoans).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function createBnplLoan(data: InsertBnplLoan) {
  const db = await getDb(); if (!db) throw new Error('DB unavailable');
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(bnplLoans).values(data).returning();
  return r;
}
export async function getBnplStats(merchantId: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select({
    total: count(),
    active: sql<number>`SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)`,
    totalVolume: sum(bnplLoans.principalAmount),
    defaulted: sql<number>`SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END)`,
  }).from(bnplLoans).where(eq(bnplLoans.merchantId, merchantId));
  return r[0] ?? null;
}

// ─── Mobile Money Recon ──────────────────────────────────────────────────────────────

export async function listMobileMoneyRecon(merchantId: string, opts: { limit?: number; offset?: number; status?: string; provider?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(mobileMoneyRecon.merchantId, merchantId)];
  if (opts.status) conds.push(eq(mobileMoneyRecon.status, opts.status as any));
  if (opts.provider) conds.push(eq(mobileMoneyRecon.provider, opts.provider));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(mobileMoneyRecon).where(w).orderBy(desc(mobileMoneyRecon.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(mobileMoneyRecon).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function getMmReconStats(merchantId: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select({
    total: count(),
    matched: sql<number>`SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END)`,
    unmatched: sql<number>`SUM(CASE WHEN status = 'unmatched' THEN 1 ELSE 0 END)`,
    totalVolume: sum(mobileMoneyRecon.amount),
  }).from(mobileMoneyRecon).where(eq(mobileMoneyRecon.merchantId, merchantId));
  return r[0] ?? null;
}

// ─── Webhook Deliveries ───────────────────────────────────────────────────────

export async function listWebhookDeliveries(merchantId: string, webhookId?: string, limit = 50) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(webhookDeliveries.merchantId, merchantId)];
  if (webhookId) conds.push(eq(webhookDeliveries.webhookId, webhookId));
  return db.select().from(webhookDeliveries)
    .where(and(...conds))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}
export async function getWebhookById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function getWebhookDeliveryById(id: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createWebhookDelivery(data: InsertWebhookDelivery) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.insert(webhookDeliveries).values(data).returning();
  return row;
}
export async function updateWebhookDelivery(id: string, data: Partial<WebhookDelivery>) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.update(webhookDeliveries).set({ ...data }).where(eq(webhookDeliveries.id, id)).returning();
  return row;
}

// ─── FX Rates ─────────────────────────────────────────────────────────────────
import { type FxRate, type InsertFxRate, fxRates } from "../drizzle/schema";

export async function upsertFxRates(rates: InsertFxRate[]) {
  const db = await getDb(); if (!db || rates.length === 0) return;
  if (!db) throw new Error('Database unavailable');
  await db.insert(fxRates).values(rates)
    .onConflictDoNothing(); // insert fresh rows; old ones remain for history
}

export async function getLatestFxRates(base = "USD") {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  // Get the most recent fetchedAt timestamp for this base
  const [latest] = await db
    .select({ fetchedAt: fxRates.fetchedAt })
    .from(fxRates)
    .where(eq(fxRates.baseCurrency, base))
    .orderBy(desc(fxRates.fetchedAt))
    .limit(1);
  if (!latest) return [];
  return db.select().from(fxRates)
    .where(and(eq(fxRates.baseCurrency, base), eq(fxRates.fetchedAt, latest.fetchedAt)));
}

export async function getFxRateHistory(base: string, target: string, limit = 48) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(fxRates)
    .where(and(eq(fxRates.baseCurrency, base), eq(fxRates.targetCurrency, target)))
    .orderBy(desc(fxRates.fetchedAt))
    .limit(limit);
}

// ─── Transaction Export ────────────────────────────────────────────────────────
export async function getTransactionsForExport(
  merchantId: string,
  from?: Date,
  to?: Date,
  status?: string,
) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(transactions.merchantId, merchantId)];
  if (from) conds.push(gte(transactions.createdAt, from));
  if (to) conds.push(lte(transactions.createdAt, to));
  if (status) conds.push(eq(transactions.status, status as any));
  return db.select().from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.createdAt))
    .limit(10000); // cap at 10k rows per export
}

// ─── Wallet Helpers ────────────────────────────────────────────────────────────
import {
  type InsertWallet, type InsertWalletTransaction, type InsertCrossBorderTransfer,
  wallets, walletTransactions, crossBorderTransfers,
} from "../drizzle/schema";

export async function getOrCreateWallet(userId: string, merchantId?: string | null) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(wallets).values({
    userId, merchantId: merchantId ?? null, tenantId: "ten_default", currency: "NGN",
    balance: "0", ledgerBalance: "0", status: "active", tier: "basic",
    dailyLimit: "50000", monthlyLimit: "500000",
  }).returning();
  return created;
}

export async function getWalletByUserId(userId: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function updateWalletBalance(walletId: number, newBalance: string) {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.update(wallets).set({ balance: newBalance, updatedAt: new Date() }).where(eq(wallets.id, walletId));
}

export async function listWalletTransactions(walletId: number, opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(opts.limit ?? 50).offset(opts.offset ?? 0);
}

export async function createWalletTransaction(data: InsertWalletTransaction) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.insert(walletTransactions).values(data).returning();
  return row;
}

export async function getWalletTransactionCount(walletId: number) {
  const db = await getDb(); if (!db) return 0;
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.select({ count: count() }).from(walletTransactions).where(eq(walletTransactions.walletId, walletId));
  return Number(row?.count ?? 0);
}

// ─── Cross-Border Transfer Helpers ────────────────────────────────────────────
export async function createCrossBorderTransfer(data: InsertCrossBorderTransfer) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.insert(crossBorderTransfers).values(data).returning();
  return row;
}

export async function listCrossBorderTransfers(merchantId: string, opts: { limit?: number; offset?: number; status?: string } = {}) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(crossBorderTransfers.merchantId, merchantId)];
  if (opts.status) conds.push(eq(crossBorderTransfers.status, opts.status));
  return db.select().from(crossBorderTransfers)
    .where(and(...conds))
    .orderBy(desc(crossBorderTransfers.createdAt))
    .limit(opts.limit ?? 50).offset(opts.offset ?? 0);
}

export async function getCrossBorderTransferById(transferId: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(crossBorderTransfers).where(eq(crossBorderTransfers.transferId, transferId)).limit(1);
  return rows[0] ?? null;
}

export async function updateCrossBorderTransferStatusByTransferId(transferId: string, status: string, extra?: Partial<InsertCrossBorderTransfer>) {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.update(crossBorderTransfers).set({ status, ...(extra ?? {}), updatedAt: new Date() }).where(eq(crossBorderTransfers.transferId, transferId));
}

export async function updateCrossBorderTransferStatus(id: number, status: string, extra?: Partial<InsertCrossBorderTransfer>) {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.update(crossBorderTransfers).set({ status, ...(extra ?? {}), updatedAt: new Date() }).where(eq(crossBorderTransfers.id, id));
}

// ─── Corridor Volume (for FX heatmap) ─────────────────────────────────────────
export async function getCorridorVolume(daysSince = 7): Promise<
  { corridor: string; sourceCurrency: string; targetCurrency: string; transferCount: number; totalSourceAmount: number }[]
> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      corridor: crossBorderTransfers.corridor,
      sourceCurrency: crossBorderTransfers.sourceCurrency,
      targetCurrency: crossBorderTransfers.targetCurrency,
      transferCount: count(),
      totalSourceAmount: sql<string>`coalesce(sum(cast(${crossBorderTransfers.sourceAmount} as numeric)), 0)`,
    })
    .from(crossBorderTransfers)
    .where(gte(crossBorderTransfers.createdAt, since))
    .groupBy(
      crossBorderTransfers.corridor,
      crossBorderTransfers.sourceCurrency,
      crossBorderTransfers.targetCurrency,
    )
    .orderBy(desc(count()));
  return rows.map((r) => ({
    corridor: r.corridor,
    sourceCurrency: r.sourceCurrency,
    targetCurrency: r.targetCurrency,
    transferCount: Number(r.transferCount),
    totalSourceAmount: parseFloat(r.totalSourceAmount as string),
  }));
}

// ─── NIP Bank Directory ────────────────────────────────────────────────────────
import {
  type InsertNipBank, type NipBank, type InsertNipAccountCache,
  type InsertSettlement, type Settlement,
  nipBanks, nipAccountCache, settlements,
} from "../drizzle/schema";
import { ilike } from "drizzle-orm";

export async function listNipBanks(opts: { search?: string; active?: boolean } = {}): Promise<NipBank[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [];
  if (opts.active !== false) conds.push(eq(nipBanks.isActive, 1));
  if (opts.search) conds.push(ilike(nipBanks.bankName, `%${opts.search}%`));
  const w = conds.length > 0 ? and(...conds) : undefined;
  return db.select().from(nipBanks).where(w).orderBy(nipBanks.bankName);
}

export async function getNipBankByCode(bankCode: string): Promise<NipBank | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(nipBanks).where(eq(nipBanks.bankCode, bankCode)).limit(1);
  return rows[0] ?? null;
}

export async function upsertNipBanks(banks: InsertNipBank[]): Promise<void> {
  const db = await getDb(); if (!db || banks.length === 0) return;
  if (!db) throw new Error('Database unavailable');
  await db.insert(nipBanks).values(banks).onConflictDoUpdate({
    target: nipBanks.bankCode,
    set: { bankName: sql`excluded.bank_name`, shortName: sql`excluded.short_name`, isActive: sql`excluded.is_active`, lastSyncedAt: new Date(), updatedAt: new Date() },
  });
}

// ─── NIP Account Enquiry Cache ────────────────────────────────────────────────
export async function getCachedNipAccount(tenantId: string, bankCode: string, accountNumber: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(nipAccountCache).where(
    and(
      eq(nipAccountCache.tenantId, tenantId),
      eq(nipAccountCache.bankCode, bankCode),
      eq(nipAccountCache.accountNumber, accountNumber),
      gte(nipAccountCache.expiresAt, new Date()),
    )
  ).limit(1);
  return rows[0] ?? null;
}

export async function cacheNipAccount(data: InsertNipAccountCache): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.insert(nipAccountCache).values(data).onConflictDoUpdate({
    target: [nipAccountCache.tenantId, nipAccountCache.bankCode, nipAccountCache.accountNumber],
    set: { accountName: data.accountName, sessionId: data.sessionId, expiresAt: data.expiresAt },
  });
}

// ─── Settlements ──────────────────────────────────────────────────────────────
export async function createSettlement(data: InsertSettlement): Promise<Settlement | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.insert(settlements).values(data).returning();
  return row ?? null;
}

/**
 * Bulk-insert settlements with synchronous_commit = local for the batch.
 * Per the 1B payments/day benchmark: SET LOCAL synchronous_commit = local gives
 * 2-3x write throughput on bulk settlement reconciliation jobs.
 * Safe because settlement rows are idempotent and replayable from Kafka.
 */
export async function bulkCreateSettlements(rows: InsertSettlement[]): Promise<Settlement[]> {
  const db = await getDb(); if (!db || rows.length === 0) return [];
  if (!db) throw new Error('Database unavailable');
  return db.transaction(async (tx) => {
    // Relax fsync to local WAL only — replica lag is acceptable for bulk batch
    await tx.execute(sql`SET LOCAL synchronous_commit = local`);
    const inserted = await tx.insert(settlements).values(rows).returning();
    return inserted;
  });
}

export async function getSettlementById(id: string): Promise<Settlement | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.select().from(settlements).where(eq(settlements.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateSettlement(id: string, data: Partial<InsertSettlement>): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.update(settlements).set({ ...data, updatedAt: new Date() }).where(eq(settlements.id, id));
}

export async function listSettlements(merchantId: string, opts: { limit?: number; offset?: number; status?: string } = {}): Promise<{ rows: Settlement[]; total: number }> {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(settlements.merchantId, merchantId)];
  if (opts.status) conds.push(eq(settlements.status, opts.status as any));
  const w = and(...conds);
  const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(settlements).where(w).orderBy(desc(settlements.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(settlements).where(w),
  ]);
  return { rows, total: Number(tot[0]?.count ?? 0) };
}

export async function listSlaBreachedSettlements(tenantId?: string): Promise<Settlement[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const now = new Date();
  const conds: any[] = [
    eq(settlements.status, "pending" as any),
    lte(settlements.slaDeadlineAt, now),
  ];
  if (tenantId) conds.push(eq(settlements.tenantId, tenantId));
  return db.select().from(settlements).where(and(...conds)).orderBy(settlements.slaDeadlineAt);
}

export async function markSettlementSlaBreached(id: string): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.update(settlements).set({
    status: "sla_breached" as any,
    slaBreachedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(settlements.id, id));
}

export async function markSettlementSlaAlertSent(id: string): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.update(settlements).set({ slaAlertSentAt: new Date(), updatedAt: new Date() }).where(eq(settlements.id, id));
}

// ─── NIP Resolution Error Log ─────────────────────────────────────────────────
import {
  type NipResolutionError, type InsertNipResolutionError,
  nipResolutionErrors,
} from "../drizzle/schema";

export async function createNipResolutionError(data: InsertNipResolutionError): Promise<NipResolutionError | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.insert(nipResolutionErrors).values(data).returning();
  return row ?? null;
}

export async function listNipResolutionErrors(
  merchantId: string,
  opts: { limit?: number; offset?: number; bankCode?: string; accountNumber?: string } = {}
): Promise<{ rows: NipResolutionError[]; total: number }> {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  if (!db) throw new Error('Database unavailable');
  const conds: any[] = [eq(nipResolutionErrors.merchantId, merchantId)];
  if (opts.bankCode) conds.push(eq(nipResolutionErrors.bankCode, opts.bankCode));
  if (opts.accountNumber) conds.push(eq(nipResolutionErrors.accountNumber, opts.accountNumber));
  const w = and(...conds);
  const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(nipResolutionErrors).where(w).orderBy(desc(nipResolutionErrors.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(nipResolutionErrors).where(w),
  ]);
  return { rows, total: Number(tot[0]?.count ?? 0) };
}

export async function countNipResolutionErrors(merchantId: string, bankCode: string, accountNumber: string): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  if (!db) throw new Error('Database unavailable');
  const [row] = await db.select({ count: count() }).from(nipResolutionErrors).where(
    and(
      eq(nipResolutionErrors.merchantId, merchantId),
      eq(nipResolutionErrors.bankCode, bankCode),
      eq(nipResolutionErrors.accountNumber, accountNumber),
    )
  );
  return Number(row?.count ?? 0);
}

export async function markNipErrorResolved(merchantId: string, bankCode: string, accountNumber: string, accountName: string): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.update(nipResolutionErrors)
    .set({ resolvedAt: new Date(), resolvedAccountName: accountName })
    .where(
      and(
        eq(nipResolutionErrors.merchantId, merchantId),
        eq(nipResolutionErrors.bankCode, bankCode),
        eq(nipResolutionErrors.accountNumber, accountNumber),
        sql`resolved_at IS NULL`,
      )
    );
}

// ─── Merchant Notifications ────────────────────────────────────────────────────
export async function createMerchantNotification(data: {
  merchantId: string;
  type: string;
  title: string;
  body: string;
  entityId?: string;
  entityType?: string;
  priority?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ id: number; merchantId: string; type: string; title: string; body: string; entityId: string | null; entityType: string | null; isRead: boolean; priority: string; actionUrl: string | null; metadata: string | null; createdAt: Date } | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const result = await db.execute(sql`
    INSERT INTO merchant_notifications
      (merchant_id, type, title, body, entity_id, entity_type, is_read, priority, action_url, metadata, created_at)
    VALUES
      (${data.merchantId}, ${data.type}, ${data.title}, ${data.body},
       ${data.entityId ?? null}, ${data.entityType ?? null}, false,
       ${data.priority ?? 'medium'}, ${data.actionUrl ?? null},
       ${data.metadata ? JSON.stringify(data.metadata) : null}, NOW())
    RETURNING id, merchant_id, type, title, body, entity_id, entity_type, is_read, priority, action_url, metadata, created_at
  `) as any;
  const row = (result?.rows ?? result)?.[0];
  if (!row) return null;
  return {
    id: row.id,
    merchantId: row.merchant_id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityId: row.entity_id,
    entityType: row.entity_type,
    isRead: row.is_read,
    priority: row.priority ?? 'medium',
    actionUrl: row.action_url ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
  };
}

export async function listMerchantNotifications(
  merchantId: string,
  options?: { limit?: number; unreadOnly?: boolean; type?: string }
): Promise<Array<{
  id: number; merchantId: string; type: string; title: string; body: string;
  entityId: string | null; entityType: string | null; isRead: boolean;
  priority: string; actionUrl: string | null; metadata: string | null; createdAt: Date;
}>> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const limit = options?.limit ?? 50;
  const unreadFilter = options?.unreadOnly ? sql` AND is_read = false` : sql``;
  const typeFilter = options?.type ? sql` AND type = ${options.type}` : sql``;
  const result = await db.execute(sql`
    SELECT id, merchant_id, type, title, body, entity_id, entity_type, is_read,
           COALESCE(priority, 'medium') as priority,
           action_url, metadata, created_at
    FROM merchant_notifications
    WHERE merchant_id = ${merchantId}
      AND dismissed_at IS NULL
      ${unreadFilter}${typeFilter}
    ORDER BY
      CASE COALESCE(priority, 'medium')
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4
      END,
      created_at DESC
    LIMIT ${limit}
  `) as unknown as { rows: any[] } | any[];
  const rows: any[] = (result as any).rows ?? result;
  return rows.map((r: any) => ({
    id: r.id,
    merchantId: r.merchant_id,
    type: r.type,
    title: r.title,
    body: r.body,
    entityId: r.entity_id,
    entityType: r.entity_type,
    isRead: r.is_read,
    priority: r.priority ?? 'medium',
    actionUrl: r.action_url ?? null,
    metadata: r.metadata ?? null,
    createdAt: r.created_at,
  }));
}

export async function countUnreadNotifications(merchantId: string): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  if (!db) throw new Error('Database unavailable');
  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM merchant_notifications WHERE merchant_id = ${merchantId} AND is_read = false
  `) as unknown as { rows: any[] } | any[];
  const rows: any[] = (result as any).rows ?? result;
  return Number(rows[0]?.cnt ?? 0);
}

export async function markNotificationRead(id: number, merchantId: string): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.execute(sql`
    UPDATE merchant_notifications SET is_read = true WHERE id = ${id} AND merchant_id = ${merchantId}
  `);
}

export async function markAllNotificationsRead(merchantId: string): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.execute(sql`
    UPDATE merchant_notifications SET is_read = true WHERE merchant_id = ${merchantId} AND is_read = false
  `);
}
export async function dismissNotification(id: number, merchantId: string): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.execute(sql`
    UPDATE merchant_notifications
    SET dismissed_at = NOW(), is_read = true
    WHERE id = ${id} AND merchant_id = ${merchantId}
  `);
}
export async function dismissAllNotifications(merchantId: string): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.execute(sql`
    UPDATE merchant_notifications
    SET dismissed_at = NOW(), is_read = true
    WHERE merchant_id = ${merchantId} AND dismissed_at IS NULL
  `);
}

// ─── PTSP Batch Helpers ───────────────────────────────────────────────────────
export async function upsertPtspBatch(data: {
  id: string; merchantId: string; settlementDate: string;
  status?: string; nibssReference?: string | null;
  totalAmountKobo?: number; transactionCount?: number;
  submittedAt?: Date | null; confirmedAt?: Date | null; failureReason?: string | null;
}): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.execute(sql`
    INSERT INTO ptsp_batches (id, merchant_id, settlement_date, status, nibss_reference,
      total_amount_kobo, transaction_count, submitted_at, confirmed_at, failure_reason,
      created_at, updated_at)
    VALUES (
      ${data.id}, ${data.merchantId}, ${data.settlementDate},
      ${data.status ?? 'pending'}, ${data.nibssReference ?? null},
      ${data.totalAmountKobo ?? 0}, ${data.transactionCount ?? 0},
      ${data.submittedAt ?? null}, ${data.confirmedAt ?? null},
      ${data.failureReason ?? null}, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      nibss_reference = COALESCE(EXCLUDED.nibss_reference, ptsp_batches.nibss_reference),
      total_amount_kobo = COALESCE(EXCLUDED.total_amount_kobo, ptsp_batches.total_amount_kobo),
      transaction_count = COALESCE(EXCLUDED.transaction_count, ptsp_batches.transaction_count),
      submitted_at = COALESCE(EXCLUDED.submitted_at, ptsp_batches.submitted_at),
      confirmed_at = COALESCE(EXCLUDED.confirmed_at, ptsp_batches.confirmed_at),
      failure_reason = COALESCE(EXCLUDED.failure_reason, ptsp_batches.failure_reason),
      updated_at = NOW()
  `);
}

export async function listPtspBatches(merchantId: string, limit = 50): Promise<any[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const rows = await db.execute(sql`
    SELECT * FROM ptsp_batches WHERE merchant_id = ${merchantId}
    ORDER BY settlement_date DESC, created_at DESC LIMIT ${limit}
  `) as unknown as any[];
  return rows;
}

export async function getPtspBatchById(id: string): Promise<any | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const rows = await db.execute(sql`
    SELECT * FROM ptsp_batches WHERE id = ${id} LIMIT 1
  `) as unknown as any[];
  return rows[0] ?? null;
}

export async function confirmPtspBatch(
  batchId: string,
  nibssReference: string,
  status: 'confirmed' | 'failed' | 'partial',
  confirmedAt: string,
): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.execute(sql`
    UPDATE ptsp_batches
    SET status = ${status},
        nibss_reference = ${nibssReference},
        confirmed_at = ${confirmedAt}::timestamptz,
        updated_at = NOW()
    WHERE id = ${batchId}
  `);
}

// ─── Wave 32: Geofence Helpers ────────────────────────────────────────────────
export async function listGeofenceRules(merchantId: string) {
  const db = await getDb();
  if (!db) return [];
  const pool2 = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const rows = await pool2.query(`SELECT * FROM geofence_rules WHERE merchant_id = $1 ORDER BY created_at DESC`, [merchantId]);
  await pool2.end();
  return (rows.rows ?? rows) as any[];
}

export async function upsertGeofenceRule(data: {
  id?: string; merchantId: string; terminalId?: string | null;
  name: string; centerLat: number; centerLng: number; radiusMeters: number; active: boolean;
}) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = data.id ?? `gfr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO geofence_rules (id, merchant_id, terminal_id, name, center_lat, center_lng, radius_meters, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, center_lat=EXCLUDED.center_lat,
       center_lng=EXCLUDED.center_lng, radius_meters=EXCLUDED.radius_meters, active=EXCLUDED.active`,
    [id, data.merchantId, data.terminalId ?? null, data.name, data.centerLat, data.centerLng, data.radiusMeters, data.active]
  );
  await pool.end();
  return id;
}

export async function deleteGeofenceRule(id: string, merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`DELETE FROM geofence_rules WHERE id=$1 AND merchant_id=$2`, [id, merchantId]);
  await pool.end();
}

// ─── Wave 32: Agent Network Helpers ──────────────────────────────────────────
export async function listSubAgents(superAgentMerchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(
    `SELECT an.*, m.business_name, m.email FROM agent_network an
     LEFT JOIN merchants m ON m.id = an.sub_agent_merchant_id
     WHERE an.super_agent_merchant_id=$1 ORDER BY an.total_volume_kobo DESC`,
    [superAgentMerchantId]
  );
  await pool.end();
  return r.rows as any[];
}

export async function upsertSubAgent(data: { superAgentMerchantId: string; subAgentMerchantId: string; status?: string }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(
    `INSERT INTO agent_network (super_agent_merchant_id, sub_agent_merchant_id, status)
     VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [data.superAgentMerchantId, data.subAgentMerchantId, data.status ?? 'active']
  );
  await pool.end();
}

// ─── Wave 32: Restaurant Table Helpers ───────────────────────────────────────
export async function listRestaurantTables(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM restaurant_tables WHERE merchant_id=$1 ORDER BY table_number`, [merchantId]);
  await pool.end();
  return r.rows as any[];
}

export async function createRestaurantTable(data: { merchantId: string; tableNumber: string; capacity: number; section: string; posX: number; posY: number }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = `tbl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO restaurant_tables (id, merchant_id, table_number, capacity, section, pos_x, pos_y) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, data.merchantId, data.tableNumber, data.capacity, data.section, data.posX, data.posY]
  );
  await pool.end();
  return id;
}

export async function updateRestaurantTableStatus(id: string, merchantId: string, status: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE restaurant_tables SET status=$1 WHERE id=$2 AND merchant_id=$3`, [status, id, merchantId]);
  await pool.end();
}

export async function updateRestaurantTablePosition(id: string, merchantId: string, posX: number, posY: number) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE restaurant_tables SET pos_x=$1, pos_y=$2 WHERE id=$3 AND merchant_id=$4`, [posX, posY, id, merchantId]);
  await pool.end();
}

// ─── Wave 32: Restaurant Order Helpers ───────────────────────────────────────
export async function listRestaurantOrders(merchantId: string, status?: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  let r;
  if (status) {
    r = await pool.query(
      `SELECT o.*, t.table_number FROM restaurant_orders o LEFT JOIN restaurant_tables t ON t.id=o.table_id
       WHERE o.merchant_id=$1 AND o.status=$2 ORDER BY o.created_at DESC LIMIT 100`,
      [merchantId, status]
    );
  } else {
    r = await pool.query(
      `SELECT o.*, t.table_number FROM restaurant_orders o LEFT JOIN restaurant_tables t ON t.id=o.table_id
       WHERE o.merchant_id=$1 ORDER BY o.created_at DESC LIMIT 100`,
      [merchantId]
    );
  }
  await pool.end();
  return r.rows as any[];
}

export async function createRestaurantOrder(data: { merchantId: string; tableId?: string | null; covers: number; notes?: string }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO restaurant_orders (id, merchant_id, table_id, covers, notes) VALUES ($1,$2,$3,$4,$5)`,
    [id, data.merchantId, data.tableId ?? null, data.covers, data.notes ?? null]
  );
  if (data.tableId) {
    await pool.query(`UPDATE restaurant_tables SET status='occupied' WHERE id=$1`, [data.tableId]);
  }
  await pool.end();
  return id;
}

export async function addOrderItem(data: { orderId: string; name: string; qty: number; unitPriceKobo: number; courseNumber: number; notes?: string }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(
    `INSERT INTO restaurant_order_items (order_id, name, qty, unit_price_kobo, course_number, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [data.orderId, data.name, data.qty, data.unitPriceKobo, data.courseNumber, data.notes ?? null]
  );
  await pool.query(
    `UPDATE restaurant_orders SET total_kobo=(SELECT COALESCE(SUM(qty*unit_price_kobo),0) FROM restaurant_order_items WHERE order_id=$1), updated_at=NOW() WHERE id=$1`,
    [data.orderId]
  );
  await pool.end();
}

export async function updateOrderStatus(id: string, merchantId: string, status: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE restaurant_orders SET status=$1, updated_at=NOW() WHERE id=$2 AND merchant_id=$3`, [status, id, merchantId]);
  if (status === 'paid' || status === 'voided') {
    const r = await pool.query(`SELECT table_id FROM restaurant_orders WHERE id=$1`, [id]);
    if (r.rows[0]?.table_id) {
      await pool.query(`UPDATE restaurant_tables SET status='available' WHERE id=$1`, [r.rows[0].table_id]);
    }
  }
  await pool.end();
}

export async function getOrderWithItems(orderId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const orders = await pool.query(`SELECT * FROM restaurant_orders WHERE id=$1`, [orderId]);
  if (!orders.rows[0]) { await pool.end(); return null; }
  const items = await pool.query(`SELECT * FROM restaurant_order_items WHERE order_id=$1 ORDER BY course_number, id`, [orderId]);
  await pool.end();
  return { ...orders.rows[0], items: items.rows };
}

// ─── Wave 32: Split Bill Helpers ──────────────────────────────────────────────
export async function createSplitBillSession(data: { orderId: string; merchantId: string; totalKobo: number; splitCount: number }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = `sbs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO split_bill_sessions (id, order_id, merchant_id, total_kobo, split_count) VALUES ($1,$2,$3,$4,$5)`,
    [id, data.orderId, data.merchantId, data.totalKobo, data.splitCount]
  );
  const shareKobo = Math.ceil(data.totalKobo / data.splitCount);
  for (let i = 0; i < data.splitCount; i++) {
    const actual = i === data.splitCount - 1 ? data.totalKobo - shareKobo * (data.splitCount - 1) : shareKobo;
    await pool.query(`INSERT INTO split_bill_shares (session_id, share_kobo, share_index) VALUES ($1,$2,$3)`, [id, actual, i]);
  }
  await pool.end();
  return id;
}

export async function getSplitBillSession(id: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const s = await pool.query(`SELECT * FROM split_bill_sessions WHERE id=$1`, [id]);
  if (!s.rows[0]) { await pool.end(); return null; }
  const shares = await pool.query(`SELECT * FROM split_bill_shares WHERE session_id=$1 ORDER BY share_index`, [id]);
  await pool.end();
  return { ...s.rows[0], shares: shares.rows };
}

// ─── Wave 32: Menu Helpers ────────────────────────────────────────────────────
export async function listMenuCategories(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM menu_categories WHERE merchant_id=$1 ORDER BY display_order, name`, [merchantId]);
  await pool.end();
  return r.rows as any[];
}

export async function listMenuItems(merchantId: string, categoryId?: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  let r;
  if (categoryId) {
    r = await pool.query(`SELECT * FROM menu_items WHERE merchant_id=$1 AND category_id=$2 ORDER BY name`, [merchantId, categoryId]);
  } else {
    r = await pool.query(`SELECT * FROM menu_items WHERE merchant_id=$1 ORDER BY name`, [merchantId]);
  }
  await pool.end();
  return r.rows as any[];
}

export async function upsertMenuCategory(data: { id?: string; merchantId: string; name: string; displayOrder: number }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = data.id ?? `mcat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO menu_categories (id, merchant_id, name, display_order) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, display_order=EXCLUDED.display_order`,
    [id, data.merchantId, data.name, data.displayOrder]
  );
  await pool.end();
  return id;
}

export async function upsertMenuItem(data: { id?: string; categoryId: string; merchantId: string; name: string; description?: string | null; priceKobo: number; available: boolean; imageUrl?: string | null }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = data.id ?? `mitm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO menu_items (id, category_id, merchant_id, name, description, price_kobo, available, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
       price_kobo=EXCLUDED.price_kobo, available=EXCLUDED.available, image_url=EXCLUDED.image_url`,
    [id, data.categoryId, data.merchantId, data.name, data.description ?? null, data.priceKobo, data.available, data.imageUrl ?? null]
  );
  await pool.end();
  return id;
}

export async function toggleMenuItemAvailability(id: string, merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE menu_items SET available=NOT available WHERE id=$1 AND merchant_id=$2`, [id, merchantId]);
  await pool.end();
}

// ─── Wave 32: Loyalty Helpers ─────────────────────────────────────────────────
export async function getLoyaltyProgram(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM loyalty_programs WHERE merchant_id=$1`, [merchantId]);
  await pool.end();
  return r.rows[0] ?? null;
}

export async function upsertLoyaltyProgram(data: { merchantId: string; pointsPerKobo: number; redeemRate: number; active: boolean }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = `lp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO loyalty_programs (id, merchant_id, points_per_kobo, redeem_rate, active) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (merchant_id) DO UPDATE SET points_per_kobo=EXCLUDED.points_per_kobo, redeem_rate=EXCLUDED.redeem_rate, active=EXCLUDED.active`,
    [id, data.merchantId, data.pointsPerKobo, data.redeemRate, data.active]
  );
  await pool.end();
}

export async function getLoyaltyAccount(merchantId: string, customerId: number) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM loyalty_accounts WHERE merchant_id=$1 AND customer_id=$2`, [merchantId, customerId]);
  await pool.end();
  return r.rows[0] ?? null;
}

export async function getOrCreateLoyaltyAccount(merchantId: string, customerId: number) {
  const existing = await getLoyaltyAccount(merchantId, customerId);
  if (existing) return existing;
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = `la_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(`INSERT INTO loyalty_accounts (id, merchant_id, customer_id) VALUES ($1,$2,$3)`, [id, merchantId, customerId]);
  await pool.end();
  return getLoyaltyAccount(merchantId, customerId);
}

export async function earnLoyaltyPoints(accountId: string, points: number, orderId?: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE loyalty_accounts SET points_balance=points_balance+$1, lifetime_points=lifetime_points+$1 WHERE id=$2`, [points, accountId]);
  await pool.query(`INSERT INTO loyalty_transactions (account_id, type, points, order_id) VALUES ($1,'earn',$2,$3)`, [accountId, points, orderId ?? null]);
  await pool.end();
}

export async function redeemLoyaltyPoints(accountId: string, points: number, orderId?: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT points_balance FROM loyalty_accounts WHERE id=$1`, [accountId]);
  if (!r.rows[0] || r.rows[0].points_balance < points) { await pool.end(); return false; }
  await pool.query(`UPDATE loyalty_accounts SET points_balance=points_balance-$1 WHERE id=$2`, [points, accountId]);
  await pool.query(`INSERT INTO loyalty_transactions (account_id, type, points, order_id) VALUES ($1,'redeem',$2,$3)`, [accountId, -points, orderId ?? null]);
  await pool.end();
  return true;
}

export async function getLoyaltyHistory(accountId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM loyalty_transactions WHERE account_id=$1 ORDER BY created_at DESC LIMIT 50`, [accountId]);
  await pool.end();
  return r.rows as any[];
}

// ─── Wave 32: KDS Helpers ─────────────────────────────────────────────────────
export async function listKdsStations(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM kds_stations WHERE merchant_id=$1 AND active=TRUE ORDER BY name`, [merchantId]);
  await pool.end();
  return r.rows as any[];
}

export async function upsertKdsStation(data: { id?: string; merchantId: string; name: string; categories: string[]; active: boolean }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = data.id ?? `kds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO kds_stations (id, merchant_id, name, categories, active) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, categories=EXCLUDED.categories, active=EXCLUDED.active`,
    [id, data.merchantId, data.name, JSON.stringify(data.categories), data.active]
  );
  await pool.end();
  return id;
}

export async function listKdsOrders(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(
    `SELECT o.*, t.table_number FROM restaurant_orders o LEFT JOIN restaurant_tables t ON t.id=o.table_id
     WHERE o.merchant_id=$1 AND o.status IN ('open','sent_to_kitchen','ready') ORDER BY o.created_at ASC`,
    [merchantId]
  );
  const orders = r.rows as any[];
  for (const order of orders) {
    const items = await pool.query(`SELECT * FROM restaurant_order_items WHERE order_id=$1 ORDER BY course_number, id`, [order.id]);
    order.items = items.rows;
  }
  await pool.end();
  return orders;
}

export async function markOrderItemReady(itemId: number) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE restaurant_order_items SET status='ready' WHERE id=$1`, [itemId]);
  await pool.end();
}

export async function markOrderComplete(orderId: string, merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE restaurant_orders SET status='ready', updated_at=NOW() WHERE id=$1 AND merchant_id=$2`, [orderId, merchantId]);
  await pool.end();
}

// ─── Wave 32: Inventory Helpers ───────────────────────────────────────────────
export async function listInventoryItems(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM inventory_items WHERE merchant_id=$1 ORDER BY name`, [merchantId]);
  await pool.end();
  return r.rows as any[];
}

export async function upsertInventoryItem(data: { id?: string; merchantId: string; name: string; unit: string; currentStock: number; reorderLevel: number; costPerUnit: number }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = data.id ?? `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO inventory_items (id, merchant_id, name, unit, current_stock, reorder_level, cost_per_unit)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, unit=EXCLUDED.unit, current_stock=EXCLUDED.current_stock,
       reorder_level=EXCLUDED.reorder_level, cost_per_unit=EXCLUDED.cost_per_unit, updated_at=NOW()`,
    [id, data.merchantId, data.name, data.unit, data.currentStock, data.reorderLevel, data.costPerUnit]
  );
  await pool.end();
  return id;
}

export async function adjustInventoryStock(itemId: string, quantity: number, type: string, note?: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE inventory_items SET current_stock=current_stock+$1, updated_at=NOW() WHERE id=$2`, [quantity, itemId]);
  await pool.query(`INSERT INTO inventory_transactions (item_id, type, quantity, note) VALUES ($1,$2,$3,$4)`, [itemId, type, quantity, note ?? null]);
  await pool.end();
}

export async function getRecipeCost(menuItemId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(
    `SELECT COALESCE(SUM(ri.quantity_per_serving * ii.cost_per_unit / 100.0), 0) as total_cost
     FROM recipe_ingredients ri JOIN inventory_items ii ON ii.id=ri.inventory_item_id WHERE ri.menu_item_id=$1`,
    [menuItemId]
  );
  await pool.end();
  return Number(r.rows[0]?.total_cost ?? 0);
}

export async function upsertRecipeIngredient(data: { menuItemId: string; inventoryItemId: string; quantityPerServing: number }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(
    `INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, quantity_per_serving) VALUES ($1,$2,$3)
     ON CONFLICT (menu_item_id, inventory_item_id) DO UPDATE SET quantity_per_serving=EXCLUDED.quantity_per_serving`,
    [data.menuItemId, data.inventoryItemId, data.quantityPerServing]
  );
  await pool.end();
}

// ─── Wave 32: Staff & Payroll Helpers ────────────────────────────────────────
export async function listStaffMembers(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM staff_members WHERE merchant_id=$1 AND active=TRUE ORDER BY name`, [merchantId]);
  await pool.end();
  return r.rows as any[];
}

export async function upsertStaffMember(data: { id?: string; merchantId: string; name: string; role: string; hourlyRateKobo: number; bankCode?: string | null; accountNumber?: string | null }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = data.id ?? `stf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO staff_members (id, merchant_id, name, role, hourly_rate_kobo, bank_code, account_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role,
       hourly_rate_kobo=EXCLUDED.hourly_rate_kobo, bank_code=EXCLUDED.bank_code, account_number=EXCLUDED.account_number`,
    [id, data.merchantId, data.name, data.role, data.hourlyRateKobo, data.bankCode ?? null, data.accountNumber ?? null]
  );
  await pool.end();
  return id;
}

export async function recordStaffShift(data: { staffId: string; merchantId: string; clockIn: Date; clockOut?: Date | null; tipsKobo?: number }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const hoursWorked = data.clockOut ? Math.round((data.clockOut.getTime() - data.clockIn.getTime()) / 60000) : null;
  const r = await pool.query(
    `INSERT INTO staff_shifts (staff_id, merchant_id, clock_in, clock_out, tips_kobo, hours_worked)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [data.staffId, data.merchantId, data.clockIn, data.clockOut ?? null, data.tipsKobo ?? 0, hoursWorked]
  );
  await pool.end();
  return r.rows[0]?.id ?? null;
}

export async function listStaffShifts(merchantId: string, staffId?: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  let r;
  if (staffId) {
    r = await pool.query(
      `SELECT ss.*, sm.name as staff_name FROM staff_shifts ss JOIN staff_members sm ON sm.id=ss.staff_id
       WHERE ss.merchant_id=$1 AND ss.staff_id=$2 ORDER BY ss.clock_in DESC LIMIT 50`,
      [merchantId, staffId]
    );
  } else {
    r = await pool.query(
      `SELECT ss.*, sm.name as staff_name FROM staff_shifts ss JOIN staff_members sm ON sm.id=ss.staff_id
       WHERE ss.merchant_id=$1 ORDER BY ss.clock_in DESC LIMIT 100`,
      [merchantId]
    );
  }
  await pool.end();
  return r.rows as any[];
}

export async function createPayrollRun(data: { merchantId: string; periodStart: Date; periodEnd: Date }) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const id = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const shifts = await pool.query(
    `SELECT ss.staff_id, SUM(ss.hours_worked) as total_minutes, SUM(ss.tips_kobo) as total_tips, sm.hourly_rate_kobo
     FROM staff_shifts ss JOIN staff_members sm ON sm.id=ss.staff_id
     WHERE ss.merchant_id=$1 AND ss.clock_in>=$2 AND ss.clock_in<=$3 AND ss.clock_out IS NOT NULL
     GROUP BY ss.staff_id, sm.hourly_rate_kobo`,
    [data.merchantId, data.periodStart, data.periodEnd]
  );
  let totalKobo = 0;
  for (const s of shifts.rows) {
    const hours = (s.total_minutes ?? 0) / 60;
    totalKobo += Math.round(hours * s.hourly_rate_kobo) + Number(s.total_tips ?? 0);
  }
  await pool.query(
    `INSERT INTO payroll_runs (id, merchant_id, period_start, period_end, total_kobo, staff_count) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, data.merchantId, data.periodStart, data.periodEnd, totalKobo, shifts.rows.length]
  );
  await pool.end();
  return { id, totalKobo, staffCount: shifts.rows.length };
}

export async function listPayrollRuns(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(`SELECT * FROM payroll_runs WHERE merchant_id=$1 ORDER BY period_start DESC LIMIT 20`, [merchantId]);
  await pool.end();
  return r.rows as any[];
}

export async function approvePayrollRun(id: string, merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  await pool.query(`UPDATE payroll_runs SET status='approved' WHERE id=$1 AND merchant_id=$2`, [id, merchantId]);
  await pool.end();
}

// ─── Wave 32: Kiosk Health Summary ───────────────────────────────────────────
export async function getKioskHealthSummary(merchantId: string) {
  const pool = new Pool({ connectionString: resolveDbUrl(), max: 1 });
  const r = await pool.query(
    `SELECT id, terminal_label, terminal_type, status, last_heartbeat_at, latitude, longitude
     FROM pos_terminals WHERE merchant_id=$1 ORDER BY terminal_label`,
    [merchantId]
  );
  await pool.end();
  const now = Date.now();
  let online = 0, warning = 0, offline = 0;
  const terminals = r.rows.map((t: any) => {
    const ageMs = t.last_heartbeat_at ? now - new Date(t.last_heartbeat_at).getTime() : Infinity;
    const health = ageMs < 5 * 60000 ? 'online' : ageMs < 30 * 60000 ? 'warning' : 'offline';
    if (health === 'online') online++; else if (health === 'warning') warning++; else offline++;
    return { ...t, health };
  });
  return { total: terminals.length, online, warning, offline, terminals };
}



// ─── Wave 33: Missing helpers (raw pg Pool, matching Wave 32 pattern) ─────────
function pgPool() {
  return new Pool({ connectionString: resolveDbUrl(), max: 1 });
}
function genId(prefix: string) {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Tenants
export async function getTenant(id: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM tenants WHERE id=$1`, [id]);
  await pool.end();
  return r.rows[0] ?? null;
}
export async function getTenantBySlug(slug: string) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const r = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return r[0] ?? null;
}
export async function updateTenantBranding(id: string, data: {
  logoUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  customDomain?: string | null;
}) {
  const db = await getDb(); if (!db) throw new Error('DB unavailable');
  if (!db) throw new Error('Database unavailable');
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (data.logoUrl !== undefined) updateSet.logoUrl = data.logoUrl;
  if (data.primaryColor !== undefined) updateSet.primaryColor = data.primaryColor;
  if (data.accentColor !== undefined) updateSet.accentColor = data.accentColor;
  if (data.fontFamily !== undefined) updateSet.fontFamily = data.fontFamily;
  if (data.customDomain !== undefined) updateSet.customDomain = data.customDomain;
  await db.update(tenants).set(updateSet as any).where(eq(tenants.id, id));
  return getTenant(id);
}
export async function upsertTenant(data: { id: string; name: string; plan?: string }) {
  const pool = pgPool();
  await pool.query(
    `INSERT INTO tenants (id, name, plan) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=$2, plan=$3`,
    [data.id, data.name, data.plan ?? 'starter']
  );
  await pool.end();
}
export async function getTenantConfig(tenantId: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM tenant_config WHERE tenant_id=$1`, [tenantId]);
  await pool.end();
  return r.rows[0] ?? null;
}
export async function upsertTenantConfig(tenantId: string, configData: Record<string, unknown>) {
  const pool = pgPool();
  await pool.query(
    `INSERT INTO tenant_config (tenant_id, config, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (tenant_id) DO UPDATE SET config=$2, updated_at=NOW()`,
    [tenantId, JSON.stringify(configData)]
  );
  await pool.end();
}

// Idempotency
export async function getIdempotencyRequest(key: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM idempotency_requests WHERE key=$1`, [key]);
  await pool.end();
  return r.rows[0] ?? null;
}
export async function insertIdempotencyRequest(data: { key: string; merchantId: string; responseBody: unknown; statusCode: number }) {
  const pool = pgPool();
  await pool.query(
    `INSERT INTO idempotency_requests (key, merchant_id, response_body, status_code, created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
    [data.key, data.merchantId, JSON.stringify(data.responseBody), data.statusCode]
  );
  await pool.end();
}

// Device Push Tokens
export async function upsertDevicePushToken(data: { userId: number; token: string; platform: string; deviceId?: string }) {
  const pool = pgPool();
  await pool.query(
    `INSERT INTO device_push_tokens (user_id, token, platform, device_id, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (user_id, token) DO UPDATE SET platform=$3, updated_at=NOW()`,
    [data.userId, data.token, data.platform, data.deviceId ?? null]
  );
  await pool.end();
}
export async function listDevicePushTokens(userId: number) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM device_push_tokens WHERE user_id=$1`, [userId]);
  await pool.end();
  return r.rows;
}
export async function deleteDevicePushToken(token: string) {
  const pool = pgPool();
  await pool.query(`DELETE FROM device_push_tokens WHERE token=$1`, [token]);
  await pool.end();
}

// Subscriptions (full CRUD)
export async function listSubscriptions(merchantId: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM subscriptions WHERE merchant_id=$1 ORDER BY created_at DESC`, [merchantId]);
  await pool.end();
  return r.rows;
}
export async function getSubscription(id: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM subscriptions WHERE id=$1`, [id]);
  await pool.end();
  return r.rows[0] ?? null;
}
export async function upsertSubscription(data: {
  id: string; merchantId: string; customerId?: number; planId: string;
  status: string; currentPeriodStart?: Date; currentPeriodEnd?: Date;
  stripeSubscriptionId?: string;
}) {
  const pool = pgPool();
  await pool.query(
    `INSERT INTO subscriptions (id, merchant_id, customer_id, plan_id, status, current_period_start, current_period_end, stripe_subscription_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     ON CONFLICT (id) DO UPDATE SET status=$5, current_period_end=$7, updated_at=NOW()`,
    [data.id, data.merchantId, data.customerId ?? null, data.planId, data.status,
     data.currentPeriodStart ?? null, data.currentPeriodEnd ?? null, data.stripeSubscriptionId ?? null]
  );
  await pool.end();
}
export async function listSubscriptionCharges(subscriptionId: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM subscription_charges WHERE subscription_id=$1 ORDER BY created_at DESC`, [subscriptionId]);
  await pool.end();
  return r.rows;
}
export async function insertSubscriptionCharge(data: {
  id: string; subscriptionId: string; merchantId: string;
  amountKobo: number; status: string; stripeInvoiceId?: string;
}) {
  const pool = pgPool();
  await pool.query(
    `INSERT INTO subscription_charges (id, subscription_id, merchant_id, amount_kobo, status, stripe_invoice_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT DO NOTHING`,
    [data.id, data.subscriptionId, data.merchantId, data.amountKobo, data.status, data.stripeInvoiceId ?? null]
  );
  await pool.end();
}

// POS Terminals (full CRUD)
export async function listPosTerminals(merchantId: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM pos_terminals WHERE merchant_id=$1 ORDER BY created_at DESC`, [merchantId]);
  await pool.end();
  return r.rows;
}
export async function getPosTerminal(id: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM pos_terminals WHERE id=$1`, [id]);
  await pool.end();
  return r.rows[0] ?? null;
}
export async function upsertPosTerminal(data: {
  id?: string; merchantId: string; serialNumber: string; model?: string;
  status?: string; lat?: number; lng?: number; lastHeartbeatAt?: Date;
}) {
  const pool = pgPool();
  const id = data.id ?? genId('term_');
  await pool.query(
    `INSERT INTO pos_terminals (id, merchant_id, serial_number, model, status, lat, lng, last_heartbeat_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     ON CONFLICT (id) DO UPDATE SET status=$5, lat=$6, lng=$7, last_heartbeat_at=$8, updated_at=NOW()`,
    [id, data.merchantId, data.serialNumber, data.model ?? null, data.status ?? 'active',
     data.lat ?? null, data.lng ?? null, data.lastHeartbeatAt ?? null]
  );
  await pool.end();
  return id;
}
export async function deletePosTerminal(id: string, merchantId: string) {
  const pool = pgPool();
  await pool.query(`DELETE FROM pos_terminals WHERE id=$1 AND merchant_id=$2`, [id, merchantId]);
  await pool.end();
}

// POS Transactions (full CRUD)
export async function listPosTransactions(merchantId: string, limit = 50, offset = 0) {
  const pool = pgPool();
  const [rows, cnt] = await Promise.all([
    pool.query(`SELECT * FROM pos_transactions WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [merchantId, limit, offset]),
    pool.query(`SELECT COUNT(*) FROM pos_transactions WHERE merchant_id=$1`, [merchantId]),
  ]);
  await pool.end();
  return { rows: rows.rows, total: parseInt(cnt.rows[0].count, 10) };
}
export async function getPosTransaction(id: string) {
  const pool = pgPool();
  const r = await pool.query(`SELECT * FROM pos_transactions WHERE id=$1`, [id]);
  await pool.end();
  return r.rows[0] ?? null;
}
export async function insertPosTransaction(data: {
  id: string; merchantId: string; terminalId: string; amountKobo: number;
  currency?: string; status: string; channel?: string; rrn?: string;
  maskedPan?: string; cardScheme?: string; responseCode?: string;
}) {
  const pool = pgPool();
  await pool.query(
    `INSERT INTO pos_transactions (id, merchant_id, terminal_id, amount_kobo, currency, status, channel, rrn, masked_pan, card_scheme, response_code, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT DO NOTHING`,
    [data.id, data.merchantId, data.terminalId, data.amountKobo, data.currency ?? 'NGN',
     data.status, data.channel ?? null, data.rrn ?? null, data.maskedPan ?? null,
     data.cardScheme ?? null, data.responseCode ?? null]
  );
  await pool.end();
}
export async function updatePosTransactionSettlement(id: string, data: {
  settlementStatus: string; nibssReference?: string; settledAt?: Date;
}) {
  const pool = pgPool();
  await pool.query(
    `UPDATE pos_transactions SET settlement_status=$2, nibss_reference=$3, settled_at=$4 WHERE id=$1`,
    [id, data.settlementStatus, data.nibssReference ?? null, data.settledAt ?? null]
  );
  await pool.end();
}

// Agent commission disbursement
export async function disburseAgentCommissions(superAgentMerchantId: string) {
  const pool = pgPool();
  const r = await pool.query(
    `SELECT id, pending_commission_kobo FROM agent_network WHERE super_agent_merchant_id=$1 AND status='active' AND pending_commission_kobo > 0`,
    [superAgentMerchantId]
  );
  let disbursed = 0;
  let totalKobo = 0;
  for (const agent of r.rows) {
    const pending = parseInt(agent.pending_commission_kobo, 10);
    await pool.query(
      `UPDATE agent_network SET pending_commission_kobo=0, total_disbursed_kobo=total_disbursed_kobo+$2, last_disbursed_at=NOW() WHERE id=$1`,
      [agent.id, pending]
    );
    disbursed++;
    totalKobo += pending;
  }
  await pool.end();
  return { disbursed, totalKobo };
}

// Restaurant table-turn stats
export async function getRestaurantTableTurnStats(merchantId: string, date: string) {
  const pool = pgPool();
  const r = await pool.query(
    `SELECT covers, created_at, completed_at FROM restaurant_orders WHERE merchant_id=$1 AND status='paid' AND DATE(created_at)=$2`,
    [merchantId, date]
  );
  await pool.end();
  const turnsToday = r.rows.length;
  const coversServed = r.rows.reduce((s: number, o: any) => s + (parseInt(o.covers, 10) || 1), 0);
  const dwellTimes = r.rows
    .filter((o: any) => o.completed_at)
    .map((o: any) => (new Date(o.completed_at).getTime() - new Date(o.created_at).getTime()) / 60000);
  const avgDwellMinutes = dwellTimes.length > 0 ? Math.round(dwellTimes.reduce((a: number, b: number) => a + b, 0) / dwellTimes.length) : 0;
  return { turnsToday, avgDwellMinutes, coversServed };
}
export async function cancelSubscription(id: string, merchantId: string) {
  const pool = pgPool();
  await pool.query(
    `UPDATE subscriptions SET status='cancelled', updated_at=NOW() WHERE id=$1 AND merchant_id=$2`,
    [id, merchantId]
  );
  await pool.end();
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export async function logAuditEvent(params: {
  merchantId: string;
  actorId: string;
  actorName: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      INSERT INTO audit_events (merchant_id, actor_id, actor_name, action, resource, resource_id, metadata, ip_address, created_at)
      VALUES (
        ${params.merchantId},
        ${params.actorId},
        ${params.actorName},
        ${params.action},
        ${params.resource},
        ${params.resourceId ?? null},
        ${JSON.stringify(params.metadata ?? {})}::jsonb,
        ${params.ipAddress ?? null},
        NOW()
      )
    `);
  } catch (err) {
    console.warn("[AuditLog] Failed to log event:", err);
  }
}

export async function listAuditEvents(merchantId: string, opts: {
  limit?: number;
  offset?: number;
  action?: string;
  resource?: string;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return { events: [], total: 0 };
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  try {
    const result = await db.execute(sql`
      SELECT id, merchant_id, actor_id, actor_name, action, resource, resource_id, metadata, ip_address, created_at
      FROM audit_events
      WHERE merchant_id = ${merchantId}
        ${opts.action ? sql`AND action = ${opts.action}` : sql``}
        ${opts.resource ? sql`AND resource = ${opts.resource}` : sql``}
        ${opts.search ? sql`AND (actor_name ILIKE ${'%' + opts.search + '%'} OR action ILIKE ${'%' + opts.search + '%'} OR resource ILIKE ${'%' + opts.search + '%'})` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int as total FROM audit_events
      WHERE merchant_id = ${merchantId}
        ${opts.action ? sql`AND action = ${opts.action}` : sql``}
        ${opts.resource ? sql`AND resource = ${opts.resource}` : sql``}
    `);
    return {
      events: result.rows as any[],
      total: Number((countResult.rows[0] as any)?.total ?? 0),
    };
  } catch (err) {
    console.warn("[AuditLog] Failed to list events:", err);
    return { events: [], total: 0 };
  }
}

// ─── Fraud Trend Analytics ────────────────────────────────────────────────────
export async function getFraudTrend(
  merchantId: string,
  days: number = 30,
): Promise<Array<{
  date: string;
  total: number;
  blocked: number;
  flagged: number;
  clean: number;
  avgRiskScore: number;
  blockRate: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  try {
    const result = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', created_at)::date::text AS date,
        COUNT(*)::int                              AS total,
        SUM(CASE WHEN alert_type = 'transaction_blocked' THEN 1 ELSE 0 END)::int AS blocked,
        SUM(CASE WHEN alert_type IN ('high_risk_transaction','velocity_breach','geo_mismatch') THEN 1 ELSE 0 END)::int AS flagged,
        0::int                                     AS clean,
        ROUND(AVG(risk_score)::numeric, 2)         AS avg_risk_score
      FROM fraud_alerts
      WHERE merchant_id = ${merchantId}
        AND created_at >= NOW() - (${days} || ' days')::interval
      GROUP BY DATE_TRUNC('day', created_at)::date
      ORDER BY date ASC
    `);
    return (result.rows as any[]).map((r) => ({
      date: r.date,
      total: Number(r.total),
      blocked: Number(r.blocked),
      flagged: Number(r.flagged),
      clean: Math.max(0, Number(r.total) - Number(r.blocked) - Number(r.flagged)),
      avgRiskScore: Number(r.avg_risk_score),
      blockRate: Number(r.total) > 0
        ? Math.round((Number(r.blocked) / Number(r.total)) * 100)
        : 0,
    }));
  } catch (err) {
    console.warn("[FraudTrend] Failed to query:", err);
    return [];
  }
}

// ─── BNPL Plans ───────────────────────────────────────────────────────────────
export async function listBnplPlans(merchantId: string): Promise<BnplPlan[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(bnplPlans).where(eq(bnplPlans.merchantId, merchantId)).orderBy(desc(bnplPlans.createdAt));
}
export async function createBnplPlan(data: InsertBnplPlan): Promise<BnplPlan> {
  const db = await getDb(); if (!db) throw new Error('DB unavailable');
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(bnplPlans).values(data).returning();
  return r;
}
export async function updateBnplPlan(id: string, merchantId: string, data: Partial<BnplPlan>): Promise<BnplPlan | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.update(bnplPlans).set({ ...data, updatedAt: new Date() }).where(and(eq(bnplPlans.id, id), eq(bnplPlans.merchantId, merchantId))).returning();
  return r ?? null;
}

// ─── Reconciliation Alerts ────────────────────────────────────────────────────
export async function listReconciliationAlerts(
  merchantId: string | null,
  status: string | null,
  limit = 50,
  offset = 0,
): Promise<ReconciliationAlert[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  let q = db.select().from(reconciliationAlerts).$dynamic();
  if (merchantId) q = q.where(eq(reconciliationAlerts.merchantId, merchantId));
  if (status) q = q.where(eq(reconciliationAlerts.status, status as any));
  return q.orderBy(desc(reconciliationAlerts.createdAt)).limit(limit).offset(offset);
}

export async function countReconciliationAlerts(
  merchantId: string | null,
  status: string | null,
): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  if (!db) throw new Error('Database unavailable');
  let q = db.select({ n: count() }).from(reconciliationAlerts).$dynamic();
  if (merchantId) q = q.where(eq(reconciliationAlerts.merchantId, merchantId));
  if (status) q = q.where(eq(reconciliationAlerts.status, status as any));
  const [r] = await q;
  return Number(r?.n ?? 0);
}

export async function getReconciliationAlertById(id: string): Promise<ReconciliationAlert | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.select().from(reconciliationAlerts).where(eq(reconciliationAlerts.id, id)).limit(1);
  return r ?? null;
}

export async function updateReconciliationAlert(
  id: string,
  data: Partial<ReconciliationAlert>,
): Promise<ReconciliationAlert | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db
    .update(reconciliationAlerts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(reconciliationAlerts.id, id))
    .returning();
  return r ?? null;
}

export async function createReconciliationAlert(
  data: InsertReconciliationAlert,
): Promise<ReconciliationAlert> {
  const db = await getDb(); if (!db) throw new Error('DB unavailable');
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(reconciliationAlerts).values(data).returning();
  return r;
}

export async function getReconciliationStats(merchantId: string | null): Promise<{
  open: number; investigating: number; resolved: number; dismissed: number; totalDelta: number;
}> {
  const db = await getDb();
  if (!db) return { open: 0, investigating: 0, resolved: 0, dismissed: 0, totalDelta: 0 };
  const rows = await db
    .select({ status: reconciliationAlerts.status, n: count(), delta: sum(reconciliationAlerts.delta) })
    .from(reconciliationAlerts)
    .groupBy(reconciliationAlerts.status);
  const stats = { open: 0, investigating: 0, resolved: 0, dismissed: 0, totalDelta: 0 };
  for (const row of rows) {
    const s = row.status as keyof typeof stats;
    if (s in stats) (stats as any)[s] = Number(row.n);
    stats.totalDelta += Number(row.delta ?? 0);
  }
  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wave 77 — DB Helpers for New Feature Tables
// ─────────────────────────────────────────────────────────────────────────────
import {
  digitalGoldHoldings, digitalGoldTransactions, goldSipPlans,
  mutualFundHoldings, mutualFundTransactions,
  consumerInsurancePolicies, consumerInsuranceClaims,
  pensionAccounts, pensionContributions,
  cashbackBalances, cashbackTransactions,
  soundboxDevices,
  wealthRiskProfiles, wealthGoals,
  emiContracts, emiInstallments,
  bulkCollections, bulkCollectionItems,
  salaryAccounts, salaryTransactions,
  privacySettings, privacyAliases,
  reportJobs, scheduledReports,
  nodalAccounts, nodalTransactions,
  retailPosConfigs, retailSales,
  intlRemittanceTransfers,
  subscriptionPlansV2, subscriptionSubscribers,
  portalSubscriptions,
  type DigitalGoldHolding, type DigitalGoldTransaction, type GoldSipPlan,
  type MutualFundHolding, type MutualFundTransaction,
  type ConsumerInsurancePolicy, type ConsumerInsuranceClaim,
  type PensionAccount, type PensionContribution,
  type CashbackBalance, type CashbackTransaction,
  type SoundboxDevice,
  type WealthRiskProfile, type WealthGoal,
  type EmiContract, type EmiInstallment,
  type BulkCollection, type BulkCollectionItem,
  type SalaryAccount, type SalaryTransaction,
  type PrivacySettings, type PrivacyAlias,
  type ReportJob, type ScheduledReport,
  type NodalAccount, type NodalTransaction,
  type RetailPosConfig, type RetailSale,
  type IntlRemittanceTransfer,
  type SubscriptionPlanV2, type SubscriptionSubscriber,
  type PortalSubscription,
} from "../drizzle/schema";

// ─── Digital Gold Helpers ─────────────────────────────────────────────────────
export async function getOrCreateGoldHolding(merchantId: string): Promise<DigitalGoldHolding> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [existing] = await db.select().from(digitalGoldHoldings).where(eq(digitalGoldHoldings.merchantId, merchantId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(digitalGoldHoldings).values({ merchantId }).returning();
  return created;
}
export async function listGoldTransactions(merchantId: string, limit = 20): Promise<DigitalGoldTransaction[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(digitalGoldTransactions).where(eq(digitalGoldTransactions.merchantId, merchantId)).orderBy(desc(digitalGoldTransactions.createdAt)).limit(limit);
}
export async function createGoldTransaction(data: Omit<DigitalGoldTransaction, "id" | "createdAt">): Promise<DigitalGoldTransaction> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(digitalGoldTransactions).values(data).returning();
  return r;
}
export async function listGoldSipPlans(merchantId: string): Promise<GoldSipPlan[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(goldSipPlans).where(eq(goldSipPlans.merchantId, merchantId)).orderBy(desc(goldSipPlans.createdAt));
}
export async function createGoldSipPlan(data: Omit<GoldSipPlan, "id" | "createdAt" | "updatedAt">): Promise<GoldSipPlan> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(goldSipPlans).values(data).returning();
  return r;
}

// ─── Mutual Fund Helpers ──────────────────────────────────────────────────────
export async function listMutualFundHoldings(merchantId: string): Promise<MutualFundHolding[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(mutualFundHoldings).where(eq(mutualFundHoldings.merchantId, merchantId));
}
export async function upsertMutualFundHolding(merchantId: string, fundId: string, fundName: string, units: string, nav: string, amountKobo: number): Promise<MutualFundHolding> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [existing] = await db.select().from(mutualFundHoldings).where(and(eq(mutualFundHoldings.merchantId, merchantId), eq(mutualFundHoldings.fundId, fundId))).limit(1);
  if (existing) {
    const newUnits = (parseFloat(existing.units) + parseFloat(units)).toFixed(6);
    const [r] = await db.update(mutualFundHoldings).set({ units: newUnits, currentNav: nav, lastUpdated: new Date() }).where(eq(mutualFundHoldings.id, existing.id)).returning();
    return r;
  }
  const [r] = await db.insert(mutualFundHoldings).values({ merchantId, fundId, fundName, units, avgNavAtPurchase: nav, currentNav: nav, investedAmountKobo: amountKobo }).returning();
  return r;
}
export async function createMutualFundTransaction(data: Omit<MutualFundTransaction, "id" | "createdAt">): Promise<MutualFundTransaction> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(mutualFundTransactions).values(data).returning();
  return r;
}

// ─── Consumer Insurance Helpers ───────────────────────────────────────────────
export async function listInsurancePoliciesForMerchant(merchantId: string): Promise<ConsumerInsurancePolicy[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(consumerInsurancePolicies).where(eq(consumerInsurancePolicies.merchantId, merchantId)).orderBy(desc(consumerInsurancePolicies.createdAt));
}
export async function createInsurancePolicy(data: Omit<ConsumerInsurancePolicy, "id" | "createdAt">): Promise<ConsumerInsurancePolicy> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(consumerInsurancePolicies).values(data).returning();
  return r;
}
export async function listInsuranceClaims(merchantId: string): Promise<ConsumerInsuranceClaim[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(consumerInsuranceClaims).where(eq(consumerInsuranceClaims.merchantId, merchantId)).orderBy(desc(consumerInsuranceClaims.createdAt));
}
export async function createInsuranceClaim(data: Omit<ConsumerInsuranceClaim, "id" | "createdAt">): Promise<ConsumerInsuranceClaim> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(consumerInsuranceClaims).values(data).returning();
  return r;
}

// ─── Pension Helpers ──────────────────────────────────────────────────────────
export async function getOrCreatePensionAccount(merchantId: string): Promise<PensionAccount> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [existing] = await db.select().from(pensionAccounts).where(eq(pensionAccounts.merchantId, merchantId)).limit(1);
  if (existing) return existing;
  const rsaPin = `RSA${Date.now().toString().slice(-10)}`;
  const [created] = await db.insert(pensionAccounts).values({ merchantId, rsaPin }).returning();
  return created;
}
export async function createPensionContribution(data: Omit<PensionContribution, "id" | "createdAt">): Promise<PensionContribution> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(pensionContributions).values(data).returning();
  return r;
}
export async function listPensionContributions(pensionAccountId: string, limit = 12): Promise<PensionContribution[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(pensionContributions).where(eq(pensionContributions.pensionAccountId, pensionAccountId)).orderBy(desc(pensionContributions.createdAt)).limit(limit);
}

// ─── Cashback Helpers ─────────────────────────────────────────────────────────
export async function getOrCreateCashbackBalance(merchantId: string): Promise<CashbackBalance> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [existing] = await db.select().from(cashbackBalances).where(eq(cashbackBalances.merchantId, merchantId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(cashbackBalances).values({ merchantId }).returning();
  return created;
}
export async function listCashbackTransactions(merchantId: string, limit = 20): Promise<CashbackTransaction[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(cashbackTransactions).where(eq(cashbackTransactions.merchantId, merchantId)).orderBy(desc(cashbackTransactions.createdAt)).limit(limit);
}
export async function addCashbackTransaction(data: Omit<CashbackTransaction, "id" | "createdAt">): Promise<CashbackTransaction> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(cashbackTransactions).values(data).returning();
  return r;
}
export async function updateCashbackBalance(merchantId: string, delta: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  if (!db) throw new Error('Database unavailable');
  await db.update(cashbackBalances).set({ cashbackBalanceKobo: sql`cashback_balance_kobo + ${delta}`, updatedAt: new Date() }).where(eq(cashbackBalances.merchantId, merchantId));
}

// ─── Soundbox Helpers ─────────────────────────────────────────────────────────
export async function listSoundboxDevices(merchantId: string): Promise<SoundboxDevice[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(soundboxDevices).where(eq(soundboxDevices.merchantId, merchantId)).orderBy(desc(soundboxDevices.createdAt));
}
export async function createSoundboxDevice(data: Omit<SoundboxDevice, "id" | "createdAt">): Promise<SoundboxDevice> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(soundboxDevices).values(data).returning();
  return r;
}
export async function updateSoundboxDevice(deviceId: string, data: Partial<SoundboxDevice>): Promise<SoundboxDevice | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.update(soundboxDevices).set(data).where(eq(soundboxDevices.deviceId, deviceId)).returning();
  return r ?? null;
}

// ─── Wealth Management Helpers ────────────────────────────────────────────────
export async function getOrCreateRiskProfile(merchantId: string): Promise<WealthRiskProfile> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [existing] = await db.select().from(wealthRiskProfiles).where(eq(wealthRiskProfiles.merchantId, merchantId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(wealthRiskProfiles).values({ merchantId }).returning();
  return created;
}
export async function updateRiskProfile(merchantId: string, data: Partial<WealthRiskProfile>): Promise<WealthRiskProfile | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.update(wealthRiskProfiles).set({ ...data, lastAssessed: new Date() }).where(eq(wealthRiskProfiles.merchantId, merchantId)).returning();
  return r ?? null;
}
export async function listWealthGoals(merchantId: string): Promise<WealthGoal[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(wealthGoals).where(eq(wealthGoals.merchantId, merchantId)).orderBy(desc(wealthGoals.createdAt));
}
export async function createWealthGoal(data: Omit<WealthGoal, "id" | "createdAt" | "updatedAt">): Promise<WealthGoal> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(wealthGoals).values(data).returning();
  return r;
}

// ─── EMI Helpers ──────────────────────────────────────────────────────────────
export async function createEmiContract(data: Omit<EmiContract, "id" | "createdAt" | "updatedAt">): Promise<EmiContract> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(emiContracts).values(data).returning();
  return r;
}
export async function getEmiContract(orderId: string): Promise<EmiContract | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.select().from(emiContracts).where(eq(emiContracts.orderId, orderId)).limit(1);
  return r ?? null;
}
export async function createEmiInstallments(contractId: string, installments: Omit<EmiInstallment, "id" | "createdAt">[]): Promise<EmiInstallment[]> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  return db.insert(emiInstallments).values(installments).returning();
}
export async function listEmiInstallments(contractId: string): Promise<EmiInstallment[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(emiInstallments).where(eq(emiInstallments.emiContractId, contractId)).orderBy(emiInstallments.installmentNo);
}

// ─── Bulk Collections Helpers ─────────────────────────────────────────────────
export async function createBulkCollection(data: Omit<BulkCollection, "id" | "createdAt" | "updatedAt">): Promise<BulkCollection> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(bulkCollections).values(data).returning();
  return r;
}
export async function listBulkCollections(merchantId: string): Promise<BulkCollection[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(bulkCollections).where(eq(bulkCollections.merchantId, merchantId)).orderBy(desc(bulkCollections.createdAt));
}
export async function getBulkCollectionDetails(id: string): Promise<{ collection: BulkCollection | null; items: BulkCollectionItem[] }> {
  const db = await getDb(); if (!db) return { collection: null, items: [] };
  if (!db) throw new Error('Database unavailable');
  const [collection] = await db.select().from(bulkCollections).where(eq(bulkCollections.id, id)).limit(1);
  const items = await db.select().from(bulkCollectionItems).where(eq(bulkCollectionItems.collectionId, id));
  return { collection: collection ?? null, items };
}

// ─── Salary Account Helpers ───────────────────────────────────────────────────
export async function listSalaryAccounts(merchantId: string): Promise<SalaryAccount[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(salaryAccounts).where(eq(salaryAccounts.merchantId, merchantId)).orderBy(salaryAccounts.employeeName);
}
export async function createSalaryAccount(data: Omit<SalaryAccount, "id" | "createdAt" | "updatedAt">): Promise<SalaryAccount> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const accountNumber = `SA${Date.now().toString().slice(-10)}`;
  const maxAdvanceKobo = Math.floor(data.salaryKobo * 0.5);
  const [r] = await db.insert(salaryAccounts).values({ ...data, accountNumber, maxAdvanceKobo }).returning();
  return r;
}
export async function listSalaryTransactions(salaryAccountId: string, limit = 20): Promise<SalaryTransaction[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(salaryTransactions).where(eq(salaryTransactions.salaryAccountId, salaryAccountId)).orderBy(desc(salaryTransactions.createdAt)).limit(limit);
}

// ─── Privacy Settings Helpers ─────────────────────────────────────────────────
export async function getOrCreatePrivacySettings(merchantId: string): Promise<PrivacySettings> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [existing] = await db.select().from(privacySettings).where(eq(privacySettings.merchantId, merchantId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(privacySettings).values({ merchantId }).returning();
  return created;
}
export async function updatePrivacySettings(merchantId: string, data: Partial<PrivacySettings>): Promise<PrivacySettings | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.update(privacySettings).set({ ...data, updatedAt: new Date() }).where(eq(privacySettings.merchantId, merchantId)).returning();
  return r ?? null;
}
export async function createPrivacyAlias(merchantId: string, alias: string, expiresAt?: Date): Promise<PrivacyAlias> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(privacyAliases).values({ merchantId, alias, expiresAt }).returning();
  return r;
}
export async function listPrivacyAliasHistory(merchantId: string, limit = 20): Promise<PrivacyAlias[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(privacyAliases).where(eq(privacyAliases.merchantId, merchantId)).orderBy(desc(privacyAliases.createdAt)).limit(limit);
}

// ─── Report Job Helpers ───────────────────────────────────────────────────────
export async function createReportJob(data: Omit<ReportJob, "id" | "createdAt" | "completedAt">): Promise<ReportJob> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(reportJobs).values(data).returning();
  return r;
}
export async function listReportJobs(merchantId: string, limit = 20): Promise<ReportJob[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(reportJobs).where(eq(reportJobs.merchantId, merchantId)).orderBy(desc(reportJobs.createdAt)).limit(limit);
}
export async function updateReportJob(id: string, data: Partial<ReportJob>): Promise<ReportJob | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.update(reportJobs).set(data).where(eq(reportJobs.id, id)).returning();
  return r ?? null;
}
export async function createScheduledReport(data: Omit<ScheduledReport, "id" | "createdAt">): Promise<ScheduledReport> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(scheduledReports).values(data).returning();
  return r;
}
export async function listScheduledReports(merchantId: string): Promise<ScheduledReport[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(scheduledReports).where(eq(scheduledReports.merchantId, merchantId)).orderBy(desc(scheduledReports.createdAt));
}

// ─── Nodal Account Helpers ────────────────────────────────────────────────────
export async function createNodalAccount(data: Omit<NodalAccount, "id" | "createdAt" | "updatedAt">): Promise<NodalAccount> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const accountNumber = `NOD${Date.now().toString().slice(-10)}`;
  const [r] = await db.insert(nodalAccounts).values({ ...data, accountNumber }).returning();
  return r;
}
export async function listNodalAccounts(merchantId: string): Promise<NodalAccount[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(nodalAccounts).where(eq(nodalAccounts.merchantId, merchantId)).orderBy(desc(nodalAccounts.createdAt));
}
export async function listNodalTransactions(nodalAccountId: string, limit = 20): Promise<NodalTransaction[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(nodalTransactions).where(eq(nodalTransactions.nodalAccountId, nodalAccountId)).orderBy(desc(nodalTransactions.createdAt)).limit(limit);
}
export async function createNodalTransaction(data: Omit<NodalTransaction, "id" | "createdAt">): Promise<NodalTransaction> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(nodalTransactions).values(data).returning();
  return r;
}

// ─── Retail POS Helpers ───────────────────────────────────────────────────────
export async function getOrCreateRetailPosConfig(merchantId: string, storeName?: string): Promise<RetailPosConfig> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [existing] = await db.select().from(retailPosConfigs).where(eq(retailPosConfigs.merchantId, merchantId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(retailPosConfigs).values({ merchantId, storeName: storeName ?? "My Store" }).returning();
  return created;
}
export async function updateRetailPosConfig(merchantId: string, data: Partial<RetailPosConfig>): Promise<RetailPosConfig | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.update(retailPosConfigs).set({ ...data, updatedAt: new Date() }).where(eq(retailPosConfigs.merchantId, merchantId)).returning();
  return r ?? null;
}
export async function createRetailSale(data: Omit<RetailSale, "id" | "createdAt">): Promise<RetailSale> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const reference = `POS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const [r] = await db.insert(retailSales).values({ ...data, reference }).returning();
  return r;
}
export async function getRetailDailySummary(merchantId: string): Promise<{ totalSales: number; totalKobo: number; avgKobo: number }> {
  const db = await getDb(); if (!db) return { totalSales: 0, totalKobo: 0, avgKobo: 0 };
  if (!db) throw new Error('Database unavailable');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = await db.select({ n: count(), total: sum(retailSales.totalKobo) }).from(retailSales).where(and(eq(retailSales.merchantId, merchantId), gte(retailSales.createdAt, today)));
  const n = Number(rows[0]?.n ?? 0);
  const total = Number(rows[0]?.total ?? 0);
  return { totalSales: n, totalKobo: total, avgKobo: n > 0 ? Math.round(total / n) : 0 };
}

// ─── International Remittance Helpers ─────────────────────────────────────────
export async function createRemittanceTransfer(data: Omit<IntlRemittanceTransfer, "id" | "createdAt" | "updatedAt">): Promise<IntlRemittanceTransfer> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const trackingNumber = `TRK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const [r] = await db.insert(intlRemittanceTransfers).values({ ...data, trackingNumber }).returning();
  return r;
}
export async function getRemittanceByTracking(trackingNumber: string): Promise<IntlRemittanceTransfer | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.select().from(intlRemittanceTransfers).where(eq(intlRemittanceTransfers.trackingNumber, trackingNumber)).limit(1);
  return r ?? null;
}
export async function listRemittanceTransfers(merchantId: string, limit = 20): Promise<IntlRemittanceTransfer[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(intlRemittanceTransfers).where(eq(intlRemittanceTransfers.merchantId, merchantId)).orderBy(desc(intlRemittanceTransfers.createdAt)).limit(limit);
}

// ─── Subscription V2 Helpers ──────────────────────────────────────────────────
export async function createSubscriptionPlanV2(data: Omit<SubscriptionPlanV2, "id" | "createdAt" | "updatedAt">): Promise<SubscriptionPlanV2> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(subscriptionPlansV2).values(data).returning();
  return r;
}
export async function listSubscriptionPlansV2(merchantId: string): Promise<SubscriptionPlanV2[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(subscriptionPlansV2).where(eq(subscriptionPlansV2.merchantId, merchantId)).orderBy(desc(subscriptionPlansV2.createdAt));
}
export async function listSubscriptionSubscribers(planId: string, limit = 50): Promise<SubscriptionSubscriber[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(subscriptionSubscribers).where(eq(subscriptionSubscribers.planId, planId)).orderBy(desc(subscriptionSubscribers.createdAt)).limit(limit);
}
export async function createSubscriptionSubscriber(data: Omit<SubscriptionSubscriber, "id" | "createdAt" | "updatedAt">): Promise<SubscriptionSubscriber> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.insert(subscriptionSubscribers).values(data).returning();
  return r;
}
export async function updateSubscriptionSubscriber(id: string, data: Partial<SubscriptionSubscriber>): Promise<SubscriptionSubscriber | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.update(subscriptionSubscribers).set({ ...data, updatedAt: new Date() }).where(eq(subscriptionSubscribers.id, id)).returning();
  return r ?? null;
}

// ─── Portal Subscription (Stripe) Helpers ────────────────────────────────────
export async function getOrCreatePortalSubscription(merchantId: string): Promise<PortalSubscription> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  if (!db) throw new Error('Database unavailable');
  const [existing] = await db.select().from(portalSubscriptions).where(eq(portalSubscriptions.merchantId, merchantId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(portalSubscriptions).values({ merchantId }).returning();
  return created;
}
export async function updatePortalSubscription(merchantId: string, data: Partial<PortalSubscription>): Promise<PortalSubscription | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.update(portalSubscriptions).set({ ...data, updatedAt: new Date() }).where(eq(portalSubscriptions.merchantId, merchantId)).returning();
  return r ?? null;
}

// ─── Merchant Loans ───────────────────────────────────────────────────────────
import { merchantLoans, loanInstalments, type MerchantLoan } from "../drizzle/schema";

export async function listMerchantLoans(merchantId: string, opts: { limit?: number; offset?: number; status?: string } = {}): Promise<MerchantLoan[]> {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  if (opts.status) {
    return db.select().from(merchantLoans)
      .where(and(eq(merchantLoans.merchantId, merchantId), eq(merchantLoans.status, opts.status)))
      .orderBy(desc(merchantLoans.createdAt)).limit(opts.limit ?? 20).offset(opts.offset ?? 0);
  }
  return db.select().from(merchantLoans)
    .where(eq(merchantLoans.merchantId, merchantId))
    .orderBy(desc(merchantLoans.createdAt)).limit(opts.limit ?? 20).offset(opts.offset ?? 0);
}

export async function getMerchantLoanById(loanId: string): Promise<MerchantLoan | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const [r] = await db.select().from(merchantLoans).where(eq(merchantLoans.loanId, loanId)).limit(1);
  return r ?? null;
}

export async function createMerchantLoan(data: {
  loanId: string; merchantId: string; requestedKobo: number;
  purposeCode?: string; notes?: string; termDays?: number;
}): Promise<MerchantLoan | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  await db.insert(merchantLoans).values({
    ...data,
    status: "pending_review",
    creditScore: 650, // Baseline score; updated asynchronously by the credit scoring Temporal workflow
    riskBand: "B",
    rateAnnualPct: "24.0",
    termDays: data.termDays ?? 90,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return getMerchantLoanById(data.loanId);
}

export async function updateMerchantLoan(loanId: string, data: Partial<MerchantLoan>): Promise<MerchantLoan | null> {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  await db.update(merchantLoans).set({ ...data, updatedAt: new Date() }).where(eq(merchantLoans.loanId, loanId));
  return getMerchantLoanById(loanId);
}

export async function getLoanInstalments(loanId: string) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select().from(loanInstalments).where(eq(loanInstalments.loanId, loanId)).orderBy(loanInstalments.dueDate);
}

export async function payLoanInstalment(id: string, paidKobo: number) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  await db.update(loanInstalments).set({ paidKobo, status: "paid", paidAt: new Date() }).where(eq(loanInstalments.id, id));
  return id;
}

// ─── Settlement SLA Alerts ────────────────────────────────────────────────────
export async function getSettlementSLABreaches(merchantId: string, opts: { limit?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  const { settlements } = await import("../drizzle/schema");
  return db.select().from(settlements).where(
    and(eq(settlements.merchantId, merchantId), eq(settlements.status, "sla_breached"))
  ).orderBy(desc(settlements.createdAt)).limit(opts.limit ?? 50);
}

// ─── Extended Analytics Helpers (Merchant Analytics Dashboard) ───────────────

/** Top customers by total spend in a date range */
export async function getTopCustomers(merchantId: string, from: Date, to: Date, limit = 10) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select({
    customerId: transactions.merchantId,
    customerEmail: transactions.customerEmail,
    totalSpend: sum(transactions.amount),
    txCount: count(),
    lastTxAt: sql<string>`MAX(created_at)`,
  }).from(transactions)
    .where(and(
      eq(transactions.merchantId, merchantId),
      eq(transactions.status, "completed"),
      gte(transactions.createdAt, from),
      lte(transactions.createdAt, to),
    ))
    .groupBy(transactions.merchantId, transactions.customerEmail)
    .orderBy(desc(sum(transactions.amount)))
    .limit(limit);
}

/** Hourly transaction volume heatmap (0-23 hours x days-of-week 0-6) */
export async function getHourlyHeatmap(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select({
    hour: sql<number>`EXTRACT(HOUR FROM created_at)::int`,
    dow: sql<number>`EXTRACT(DOW FROM created_at)::int`,
    txCount: count(),
    volume: sum(transactions.amount),
  }).from(transactions)
    .where(and(
      eq(transactions.merchantId, merchantId),
      eq(transactions.status, "completed"),
      gte(transactions.createdAt, from),
      lte(transactions.createdAt, to),
    ))
    .groupBy(sql`EXTRACT(HOUR FROM created_at)`, sql`EXTRACT(DOW FROM created_at)`)
    .orderBy(sql`EXTRACT(DOW FROM created_at)`, sql`EXTRACT(HOUR FROM created_at)`);
}

/** Period-over-period comparison for KPIs */
export async function getPeriodComparison(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return null;
  if (!db) throw new Error('Database unavailable');
  const periodMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - periodMs);
  const prevTo = new Date(from.getTime());

  const query = (f: Date, t: Date) => db.select({
    totalVolume: sum(transactions.amount),
    totalFees: sum(transactions.feeAmount),
    totalCount: count(),
    completedCount: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    failedCount: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
    avgTxAmount: sql<number>`AVG(CASE WHEN status = 'completed' THEN amount END)`,
  }).from(transactions)
    .where(and(eq(transactions.merchantId, merchantId), gte(transactions.createdAt, f), lte(transactions.createdAt, t)));

  const [current, previous, custCurrent, custPrevious] = await Promise.all([
    query(from, to),
    query(prevFrom, prevTo),
    db.select({ count: count() }).from(customers)
      .where(and(eq(customers.merchantId, merchantId), gte(customers.createdAt, from), lte(customers.createdAt, to))),
    db.select({ count: count() }).from(customers)
      .where(and(eq(customers.merchantId, merchantId), gte(customers.createdAt, prevFrom), lte(customers.createdAt, prevTo))),
  ]);

  return {
    current: { ...current[0], newCustomers: custCurrent[0]?.count ?? 0 },
    previous: { ...previous[0], newCustomers: custPrevious[0]?.count ?? 0 },
  };
}

/** Daily transaction counts grouped by status for stacked bar chart */
export async function getDailyStatusBreakdown(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select({
    date: sql<string>`DATE(created_at)`,
    completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
    pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
    totalAmount: sum(transactions.amount),
  }).from(transactions)
    .where(and(eq(transactions.merchantId, merchantId), gte(transactions.createdAt, from), lte(transactions.createdAt, to)))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`);
}

/** Recent transactions with full details for the live feed */
export async function getRecentTransactionsFeed(merchantId: string, limit = 20) {
  const db = await getDb(); if (!db) return [];
  if (!db) throw new Error('Database unavailable');
  return db.select({
    id: transactions.id,
    amount: transactions.amount,
    currency: transactions.currency,
    status: transactions.status,
    channel: transactions.channel,
    customerEmail: transactions.customerEmail,
    description: transactions.description,
    createdAt: transactions.createdAt,
    feeAmount: transactions.feeAmount,
  }).from(transactions)
    .where(eq(transactions.merchantId, merchantId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
}

// ─── Synchronous-style db accessor for wave124 routers ───────────────────────
// wave124 uses `import { db }` pattern. This lazy accessor initialises the
// connection on first use and returns the Drizzle instance directly.
// NOTE: If the DB is unavailable, queries will throw — callers should handle.
let _dbSync: ReturnType<typeof drizzle> | null = null;
async function ensureDb() {
  if (!_dbSync) _dbSync = await getDb();
  return _dbSync!;
}
// Drizzle-compatible proxy: each method call awaits the connection first
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (...args: unknown[]) => ensureDb().then(d => (d as any)[prop](...args));
  },
});

// ─── Keycloak Event Logging ───────────────────────────────────────────────────

// In-memory geo cache to avoid hammering ip-api.com (free tier: 45 req/min)
const _geoCache = new Map<string, { country: string; city: string; ts: number }>();
const GEO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const GEO_SKIP_PREFIXES = ["10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31."];

async function enrichIpGeo(ip: string | null | undefined): Promise<{ country: string | null; city: string | null }> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return { country: null, city: null };
  if (GEO_SKIP_PREFIXES.some(p => ip.startsWith(p))) return { country: null, city: null };
  const cached = _geoCache.get(ip);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) return { country: cached.country, city: cached.city };
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { country: null, city: null };
    const data = await res.json() as { status: string; country?: string; city?: string };
    if (data.status !== "success") return { country: null, city: null };
    const geo = { country: data.country ?? null, city: data.city ?? null, ts: Date.now() };
    _geoCache.set(ip, { ...geo });
    return { country: geo.country, city: geo.city };
  } catch {
    return { country: null, city: null };
  }
}

/**
 * Persist a Keycloak auth event to the keycloak_events table.
 *
 * Called by the /api/internal/keycloak-events webhook endpoint.
 * Silently swallows errors so a DB hiccup never blocks the webhook response
 * (Keycloak will retry if the endpoint returns non-2xx).
 */
export async function logKeycloakEvent(params: {
  eventType: string;
  realmId?: string | null;
  clientId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  ipAddress?: string | null;
  error?: string | null;
  details?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) return;
  // Enrich IP with geo data (best-effort, non-blocking)
  const geo = await enrichIpGeo(params.ipAddress);
  try {
    await db.execute(sql`
      INSERT INTO keycloak_events
        (event_type, realm_id, client_id, user_id, session_id, ip_address, geo_country, geo_city, error, details, received_at)
      VALUES (
        ${params.eventType},
        ${params.realmId ?? null},
        ${params.clientId ?? null},
        ${params.userId ?? null},
        ${params.sessionId ?? null},
        ${params.ipAddress ?? null},
        ${geo.country},
        ${geo.city},
        ${params.error ?? null},
        ${params.details ? JSON.stringify(params.details) : null}::jsonb,
        NOW()
      )
    `);
  } catch (err) {
    console.error("[DB] logKeycloakEvent failed", err);
  }
}

/**
 * Retrieve recent Keycloak auth events for the audit log UI.
 * Returns up to `limit` events ordered by most recent first.
 */
export async function getKeycloakEvents(params: {
  limit?: number;
  offset?: number;
  userId?: string;
  eventType?: string;
  fromDate?: Date;
  toDate?: Date;
  /** When true, only return LOGIN events where geo_anomaly_acknowledged IS NOT TRUE */
  newCountryOnly?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  try {
    const { limit = 100, offset = 0, userId, eventType, fromDate, toDate, newCountryOnly } = params;
    const rows = await db.execute(sql`
      SELECT id, event_type, realm_id, client_id, user_id, session_id,
             ip_address, geo_country, geo_city, geo_anomaly_acknowledged, error, details, received_at
      FROM keycloak_events
      WHERE
        (${userId ?? null} IS NULL OR user_id = ${userId ?? null})
        AND (${eventType ?? null} IS NULL OR event_type = ${eventType ?? null})
        AND (${fromDate ?? null} IS NULL OR received_at >= ${fromDate ?? null})
        AND (${toDate ?? null} IS NULL OR received_at <= ${toDate ?? null})
        AND (${newCountryOnly ? true : null} IS NULL OR (
          event_type = 'LOGIN'
          AND geo_country IS NOT NULL
          AND (geo_anomaly_acknowledged IS NULL OR geo_anomaly_acknowledged = FALSE)
        ))
      ORDER BY received_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);
    return rows.rows as Array<{
      id: number;
      event_type: string;
      realm_id: string | null;
      client_id: string | null;
      user_id: string | null;
      session_id: string | null;
      ip_address: string | null;
      geo_country: string | null;
      geo_city: string | null;
      geo_anomaly_acknowledged: boolean | null;
      error: string | null;
      details: Record<string, unknown> | null;
      received_at: Date;
    }>;
  } catch (err) {
    console.error("[DB] getKeycloakEvents failed", err);
    return [];
  }
}

/**
 * Returns the distinct countries a user has previously logged in from.
 * Used for geo-based anomaly detection (new country alert).
 * Excludes the most recent event (last `excludeLastN` rows) so we can compare
 * the brand-new event against historical data.
 */
export async function getKnownCountriesForUser(
  userId: string,
  excludeLastN = 1,
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT geo_country
      FROM keycloak_events
      WHERE user_id = ${userId}
        AND event_type = 'LOGIN'
        AND geo_country IS NOT NULL
        AND id NOT IN (
          SELECT id FROM keycloak_events
          WHERE user_id = ${userId} AND event_type = 'LOGIN'
          ORDER BY received_at DESC
          LIMIT ${excludeLastN}
        )
    `);
    return (rows.rows as Array<{ geo_country: string }>)
      .map(r => r.geo_country)
      .filter(Boolean);
  } catch (err) {
    console.error("[DB] getKnownCountriesForUser failed", err);
    return [];
  }
}

/**
 * Get the anomaly detection config for an admin user.
 * Falls back to defaults (15 min window, threshold 5) if no row exists.
 */
export async function getAnomalyConfig(userId: number): Promise<{
  loginAnomalyWindowMinutes: number;
  loginAnomalyThreshold: number;
}> {
  const db = await getDb();
  if (!db) return { loginAnomalyWindowMinutes: 15, loginAnomalyThreshold: 5 };
  try {
    const rows = await db.execute(sql`
      SELECT login_anomaly_window_minutes, login_anomaly_threshold
      FROM admin_notification_prefs
      WHERE user_id = ${userId}
      LIMIT 1
    `);
    const row = rows.rows[0] as { login_anomaly_window_minutes: number; login_anomaly_threshold: number } | undefined;
    if (!row) return { loginAnomalyWindowMinutes: 15, loginAnomalyThreshold: 5 };
    return {
      loginAnomalyWindowMinutes: row.login_anomaly_window_minutes ?? 15,
      loginAnomalyThreshold: row.login_anomaly_threshold ?? 5,
    };
  } catch (err) {
    console.error("[DB] getAnomalyConfig failed", err);
    return { loginAnomalyWindowMinutes: 15, loginAnomalyThreshold: 5 };
  }
}

/**
 * Upsert the anomaly detection config for an admin user.
 */
export async function setAnomalyConfig(
  userId: number,
  windowMinutes: number,
  threshold: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      INSERT INTO admin_notification_prefs (id, user_id, login_anomaly_window_minutes, login_anomaly_threshold, updated_at)
      VALUES (${crypto.randomUUID()}, ${userId}, ${windowMinutes}, ${threshold}, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        login_anomaly_window_minutes = EXCLUDED.login_anomaly_window_minutes,
        login_anomaly_threshold = EXCLUDED.login_anomaly_threshold,
        updated_at = NOW()
    `);
  } catch (err) {
    console.error("[DB] setAnomalyConfig failed", err);
  }
}

/**
 * Mark a keycloak_event row as geo-anomaly acknowledged (admin dismissed the alert).
 */
export async function acknowledgeGeoAnomaly(eventId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      UPDATE keycloak_events
      SET geo_anomaly_acknowledged = TRUE
      WHERE id = ${eventId}
    `);
  } catch (err) {
    console.error("[DB] acknowledgeGeoAnomaly failed", err);
  }
}

/** Sentinel userId for the global/default anomaly config row */
export const GLOBAL_ANOMALY_CONFIG_USER_ID = 0;

/**
 * Get the global (admin-wide default) anomaly detection config.
 * Falls back to hardcoded defaults if no global row exists.
 */
export async function getGlobalAnomalyConfig(): Promise<{
  loginAnomalyWindowMinutes: number;
  loginAnomalyThreshold: number;
}> {
  const db = await getDb();
  if (!db) return { loginAnomalyWindowMinutes: 15, loginAnomalyThreshold: 5 };
  try {
    const rows = await db.execute(sql`
      SELECT login_anomaly_window_minutes, login_anomaly_threshold
      FROM admin_notification_prefs
      WHERE user_id = ${GLOBAL_ANOMALY_CONFIG_USER_ID}
      LIMIT 1
    `);
    const row = rows.rows[0] as { login_anomaly_window_minutes: number | null; login_anomaly_threshold: number | null } | undefined;
    return {
      loginAnomalyWindowMinutes: row?.login_anomaly_window_minutes ?? 15,
      loginAnomalyThreshold: row?.login_anomaly_threshold ?? 5,
    };
  } catch (err) {
    console.error("[DB] getGlobalAnomalyConfig failed", err);
    return { loginAnomalyWindowMinutes: 15, loginAnomalyThreshold: 5 };
  }
}

/**
 * Set the global (admin-wide default) anomaly detection config.
 * Uses the sentinel userId=0 row.
 */
export async function setGlobalAnomalyConfig(windowMinutes: number, threshold: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      INSERT INTO admin_notification_prefs (user_id, login_anomaly_window_minutes, login_anomaly_threshold)
      VALUES (${GLOBAL_ANOMALY_CONFIG_USER_ID}, ${windowMinutes}, ${threshold})
      ON CONFLICT (user_id) DO UPDATE
        SET login_anomaly_window_minutes = ${windowMinutes},
            login_anomaly_threshold = ${threshold}
    `);
  } catch (err) {
    console.error("[DB] setGlobalAnomalyConfig failed", err);
  }
}

// ─── Round 51: Anomaly Config Audit Log ──────────────────────────────────────

/**
 * Record a change to the anomaly config in the audit log.
 */
export async function recordAnomalyConfigChange(opts: {
  changedByUserId: number;
  isGlobal: boolean;
  oldWindowMinutes: number | null;
  oldThreshold: number | null;
  newWindowMinutes: number;
  newThreshold: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      INSERT INTO anomaly_config_audit
        (changed_by_user_id, is_global, old_window_minutes, old_threshold, new_window_minutes, new_threshold)
      VALUES
        (${opts.changedByUserId}, ${opts.isGlobal}, ${opts.oldWindowMinutes ?? null},
         ${opts.oldThreshold ?? null}, ${opts.newWindowMinutes}, ${opts.newThreshold})
    `);
  } catch (err) {
    console.error("[DB] recordAnomalyConfigChange failed", err);
  }
}

/**
 * Get the last N anomaly config audit entries (most recent first).
 */
export async function getAnomalyConfigAuditLog(limit = 5, offset = 0): Promise<Array<{
  id: number;
  changedByUserId: number;
  isGlobal: boolean;
  oldWindowMinutes: number | null;
  oldThreshold: number | null;
  newWindowMinutes: number;
  newThreshold: number;
  changedAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(sql`
      SELECT id, changed_by_user_id, is_global, old_window_minutes, old_threshold,
             new_window_minutes, new_threshold, changed_at
      FROM anomaly_config_audit
      ORDER BY changed_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return (rows.rows ?? []).map((r: any) => ({
      id: Number(r.id),
      changedByUserId: Number(r.changed_by_user_id),
      isGlobal: Boolean(r.is_global),
      oldWindowMinutes: r.old_window_minutes != null ? Number(r.old_window_minutes) : null,
      oldThreshold: r.old_threshold != null ? Number(r.old_threshold) : null,
      newWindowMinutes: Number(r.new_window_minutes),
      newThreshold: Number(r.new_threshold),
      changedAt: new Date(r.changed_at),
    }));
  } catch (err) {
    console.error("[DB] getAnomalyConfigAuditLog failed", err);
    return [];
  }
}

// ─── Round 51: Session Country Column ────────────────────────────────────────

/**
 * Get the most recent geo_country for each of the given Keycloak user IDs.
 * Returns a map of keycloakUserId → country string.
 */
export async function getLatestCountryForUsers(keycloakUserIds: string[]): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  if (!db || keycloakUserIds.length === 0) return {};
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (user_id) user_id, geo_country
      FROM keycloak_events
      WHERE user_id = ANY(${keycloakUserIds})
        AND event_type = 'LOGIN'
        AND geo_country IS NOT NULL
      ORDER BY user_id, received_at DESC
    `);
    const result: Record<string, string> = {};
    for (const r of (rows.rows ?? []) as any[]) {
      if (r.user_id && r.geo_country) result[r.user_id] = r.geo_country;
    }
    return result;
  } catch (err) {
    console.error("[DB] getLatestCountryForUsers failed", err);
    return {};
  }
}

// ─── FX Alerts ────────────────────────────────────────────────────────────────

export async function listFxAlerts(merchantId: string) {
  const db = await getDb();
  if (!db) return [];
  try {
    const { fxAlerts } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    return db.select().from(fxAlerts).where(eq(fxAlerts.merchantId, merchantId)).orderBy(fxAlerts.createdAt);
  } catch (err) {
    console.error("[DB] listFxAlerts failed", err);
    return [];
  }
}

export async function upsertFxAlert(merchantId: string, data: {
  pair: string; direction: "above" | "below"; threshold: number; active?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;
  try {
    const { fxAlerts } = await import("../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const existing = await db.select().from(fxAlerts)
      .where(and(eq(fxAlerts.merchantId, merchantId), eq(fxAlerts.pair, data.pair)))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(fxAlerts)
        .set({ direction: data.direction, threshold: data.threshold, active: data.active ?? true, updatedAt: new Date() })
        .where(eq(fxAlerts.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(fxAlerts)
      .values({ merchantId, pair: data.pair, direction: data.direction, threshold: data.threshold, active: data.active ?? true })
      .returning();
    return created;
  } catch (err) {
    console.error("[DB] upsertFxAlert failed", err);
    return null;
  }
}

export async function deleteFxAlert(id: number, merchantId: string) {
  const db = await getDb();
  if (!db) return false;
  try {
    const { fxAlerts } = await import("../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    await db.delete(fxAlerts).where(and(eq(fxAlerts.id, id), eq(fxAlerts.merchantId, merchantId)));
    return true;
  } catch (err) {
    console.error("[DB] deleteFxAlert failed", err);
    return false;
  }
}

// ─── Re-exports for legacy wave routers ──────────────────────────────────────
// wave90Router and other early routers import these from ./db instead of ./routers
export async function resolveUser(openId: string) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { users } = await import('../drizzle/schema');
  const { eq } = await import('drizzle-orm');
  const [u] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (!u) throw new Error('User not found');
  return u;
}

export async function requireMerchant(userId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { merchants } = await import('../drizzle/schema');
  const { eq } = await import('drizzle-orm');
  const [m] = await db.select().from(merchants).where(eq(merchants.ownerId, userId)).limit(1);
  if (!m) throw new Error('Merchant not found');
  return m;
}
