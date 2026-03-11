import { and, count, desc, eq, gte, like, lte, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  type InsertApiKey, type InsertCustomer, type InsertDispute,
  type InsertMerchant, type InsertPayout, type InsertPaymentLink,
  type InsertTeamMember, type InsertTransaction, type InsertUser,
  type InsertVirtualCard, type InsertWebhook,
  apiKeys, customers, disputes, merchants, paymentLinks, payouts,
  teamMembers, transactions, users, virtualCards, webhooks,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(merchants).where(eq(merchants.ownerId, ownerId)).limit(1);
  return r[0] ?? null;
}
export async function getMerchantById(id: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createMerchant(data: InsertMerchant) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.insert(merchants).values(data); return getMerchantById(data.id);
}
export async function updateMerchant(id: string, data: Partial<InsertMerchant>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(merchants).set({ ...data, updatedAt: new Date() }).where(eq(merchants.id, id));
  return getMerchantById(id);
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function listTransactions(merchantId: string, opts: { limit?: number; offset?: number; status?: string; search?: string; from?: Date; to?: Date }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
  const conds = [eq(transactions.merchantId, merchantId)];
  if (opts.status) conds.push(eq(transactions.status, opts.status as any));
  if (opts.search) conds.push(like(transactions.reference, `%${opts.search}%`));
  if (opts.from) conds.push(gte(transactions.createdAt, opts.from));
  if (opts.to) conds.push(lte(transactions.createdAt, opts.to));
  const w = and(...conds); const lim = opts.limit ?? 20; const off = opts.offset ?? 0;
  const [rows, tot] = await Promise.all([
    db.select().from(transactions).where(w).orderBy(desc(transactions.createdAt)).limit(lim).offset(off),
    db.select({ count: count() }).from(transactions).where(w),
  ]);
  return { rows, total: tot[0]?.count ?? 0 };
}
export async function getTransactionById(id: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createTransaction(data: InsertTransaction) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.insert(transactions).values(data); return getTransactionById(data.id);
}
export async function updateTransaction(id: string, data: Partial<InsertTransaction>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(transactions).set({ ...data, updatedAt: new Date() }).where(eq(transactions.id, id));
}
export async function getTransactionStats(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return null;
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
  const r = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return r[0] ?? null;
}
export async function upsertCustomer(data: InsertCustomer) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.insert(customers).values(data).onConflictDoUpdate({ target: customers.id, set: { name: data.name, phone: data.phone, updatedAt: new Date() } });
  return getCustomerById(data.id);
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

export async function listPayouts(merchantId: string, opts: { limit?: number; offset?: number; status?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
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
  const r = await db.select().from(payouts).where(eq(payouts.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createPayout(data: InsertPayout) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.insert(payouts).values(data); return getPayoutById(data.id);
}
export async function updatePayout(id: string, data: Partial<InsertPayout>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(payouts).set({ ...data, updatedAt: new Date() }).where(eq(payouts.id, id));
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export async function listApiKeys(merchantId: string) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(apiKeys).where(and(eq(apiKeys.merchantId, merchantId), eq(apiKeys.isActive, true))).orderBy(desc(apiKeys.createdAt));
}
export async function createApiKey(data: InsertApiKey) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(apiKeys).values(data).returning();
  return r[0] ?? null;
}
export async function revokeApiKey(id: string, merchantId: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(apiKeys).set({ isActive: false, revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.merchantId, merchantId)));
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function listWebhooks(merchantId: string) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(webhooks).where(eq(webhooks.merchantId, merchantId)).orderBy(desc(webhooks.createdAt));
}
export async function createWebhook(data: InsertWebhook) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(webhooks).values(data).returning();
  return r[0] ?? null;
}
export async function deleteWebhook(id: string, merchantId: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.merchantId, merchantId)));
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

export async function listDisputes(merchantId: string, opts: { limit?: number; offset?: number; status?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
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
  const r = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createDispute(data: InsertDispute) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(disputes).values(data).returning();
  return r[0] ?? null;
}
export async function updateDispute(id: string, data: Partial<InsertDispute>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(disputes).set({ ...data, updatedAt: new Date() }).where(eq(disputes.id, id));
}

// ─── Virtual Cards ────────────────────────────────────────────────────────────

export async function listVirtualCards(merchantId: string) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(virtualCards).where(eq(virtualCards.merchantId, merchantId)).orderBy(desc(virtualCards.createdAt));
}
export async function getVirtualCardById(id: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(virtualCards).where(eq(virtualCards.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createVirtualCard(data: InsertVirtualCard) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(virtualCards).values(data).returning();
  return r[0] ?? null;
}
export async function updateVirtualCard(id: string, data: Partial<InsertVirtualCard>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(virtualCards).set({ ...data, updatedAt: new Date() }).where(eq(virtualCards.id, id));
}

// ─── Payment Links ────────────────────────────────────────────────────────────

export async function listPaymentLinks(merchantId: string) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(paymentLinks).where(eq(paymentLinks.merchantId, merchantId)).orderBy(desc(paymentLinks.createdAt));
}
export async function getPaymentLinkById(id: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(paymentLinks).where(eq(paymentLinks.id, id)).limit(1);
  return r[0] ?? null;
}
export async function createPaymentLink(data: InsertPaymentLink) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(paymentLinks).values(data).returning();
  return r[0] ?? null;
}
export async function updatePaymentLink(id: string, data: Partial<InsertPaymentLink>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(paymentLinks).set({ ...data, updatedAt: new Date() }).where(eq(paymentLinks.id, id));
}

// ─── Team Members ─────────────────────────────────────────────────────────────

export async function listTeamMembers(merchantId: string) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(teamMembers).where(eq(teamMembers.merchantId, merchantId)).orderBy(desc(teamMembers.createdAt));
}
export async function createTeamMember(data: InsertTeamMember) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const r = await db.insert(teamMembers).values(data).returning();
  return r[0] ?? null;
}
export async function updateTeamMember(id: number, data: Partial<InsertTeamMember>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(teamMembers).set({ ...data, updatedAt: new Date() }).where(eq(teamMembers.id, id));
}
export async function deleteTeamMember(id: number, merchantId: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.delete(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.merchantId, merchantId)));
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsOverview(merchantId: string, from: Date, to: Date) {
  const db = await getDb(); if (!db) return null;
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
