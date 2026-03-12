import { and, count, desc, eq, gte, like, lte, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// ─── DB singleton ─────────────────────────────────────────────────────────────
// The Manus platform injects a MySQL/TiDB DATABASE_URL. Since this project uses
// PostgreSQL (pg-core), we fall back to the locally installed PostgreSQL when
// the system URL is not a postgres:// URL.
function resolveDbUrl(): string | undefined {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgresql://") || url.startsWith("postgres://")) return url;
  // System URL is MySQL — use local PG or explicit override
  return process.env.PG_DATABASE_URL ?? "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev";
}

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db) {
    const dbUrl = resolveDbUrl();
    if (!dbUrl) return null;
    try {
      _pool = new Pool({ connectionString: dbUrl, max: 10 });
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
export async function updateWebhook(id: string, merchantId: string, data: Partial<InsertWebhook>) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.update(webhooks).set({ ...data, updatedAt: new Date() }).where(and(eq(webhooks.id, id), eq(webhooks.merchantId, merchantId)));
  return getWebhookById(id);
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

// ─── Fraud Alerts ──────────────────────────────────────────────────────────────

export async function listFraudAlerts(merchantId: string, opts: { limit?: number; offset?: number; status?: string }) {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
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
  const [row] = await db.insert(fraudAlerts).values(data).returning();
  return row;
}
export async function updateFraudAlert(id: string, merchantId: string, data: Partial<InsertFraudAlert>) {
  const db = await getDb(); if (!db) throw new Error('DB unavailable');
  await db.update(fraudAlerts).set({ ...data, updatedAt: new Date() }).where(and(eq(fraudAlerts.id, id), eq(fraudAlerts.merchantId, merchantId)));
}
export async function getFraudStats(merchantId: string) {
  const db = await getDb(); if (!db) return null;
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
  await db.update(kycSubmissions).set({ ...data, updatedAt: new Date() }).where(and(eq(kycSubmissions.id, id), eq(kycSubmissions.merchantId, merchantId)));
}
export async function getKycStats(merchantId: string) {
  const db = await getDb(); if (!db) return null;
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
  const [r] = await db.insert(bnplLoans).values(data).returning();
  return r;
}
export async function getBnplStats(merchantId: string) {
  const db = await getDb(); if (!db) return null;
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
  const conds: any[] = [eq(webhookDeliveries.merchantId, merchantId)];
  if (webhookId) conds.push(eq(webhookDeliveries.webhookId, webhookId));
  return db.select().from(webhookDeliveries)
    .where(and(...conds))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}
export async function getWebhookById(id: string) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function getWebhookDeliveryById(id: string) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createWebhookDelivery(data: InsertWebhookDelivery) {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.insert(webhookDeliveries).values(data).returning();
  return row;
}
export async function updateWebhookDelivery(id: string, data: Partial<WebhookDelivery>) {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.update(webhookDeliveries).set({ ...data }).where(eq(webhookDeliveries.id, id)).returning();
  return row;
}

// ─── FX Rates ─────────────────────────────────────────────────────────────────
import { type FxRate, type InsertFxRate, fxRates } from "../drizzle/schema";

export async function upsertFxRates(rates: InsertFxRate[]) {
  const db = await getDb(); if (!db || rates.length === 0) return;
  await db.insert(fxRates).values(rates)
    .onConflictDoNothing(); // insert fresh rows; old ones remain for history
}

export async function getLatestFxRates(base = "USD") {
  const db = await getDb(); if (!db) return [];
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
  const rows = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function updateWalletBalance(walletId: number, newBalance: string) {
  const db = await getDb(); if (!db) return;
  await db.update(wallets).set({ balance: newBalance, updatedAt: new Date() }).where(eq(wallets.id, walletId));
}

export async function listWalletTransactions(walletId: number, opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(opts.limit ?? 50).offset(opts.offset ?? 0);
}

export async function createWalletTransaction(data: InsertWalletTransaction) {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.insert(walletTransactions).values(data).returning();
  return row;
}

export async function getWalletTransactionCount(walletId: number) {
  const db = await getDb(); if (!db) return 0;
  const [row] = await db.select({ count: count() }).from(walletTransactions).where(eq(walletTransactions.walletId, walletId));
  return Number(row?.count ?? 0);
}

// ─── Cross-Border Transfer Helpers ────────────────────────────────────────────
export async function createCrossBorderTransfer(data: InsertCrossBorderTransfer) {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.insert(crossBorderTransfers).values(data).returning();
  return row;
}

export async function listCrossBorderTransfers(merchantId: string, opts: { limit?: number; offset?: number; status?: string } = {}) {
  const db = await getDb(); if (!db) return [];
  const conds: any[] = [eq(crossBorderTransfers.merchantId, merchantId)];
  if (opts.status) conds.push(eq(crossBorderTransfers.status, opts.status));
  return db.select().from(crossBorderTransfers)
    .where(and(...conds))
    .orderBy(desc(crossBorderTransfers.createdAt))
    .limit(opts.limit ?? 50).offset(opts.offset ?? 0);
}

export async function getCrossBorderTransferById(transferId: string) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(crossBorderTransfers).where(eq(crossBorderTransfers.transferId, transferId)).limit(1);
  return rows[0] ?? null;
}

export async function updateCrossBorderTransferStatusByTransferId(transferId: string, status: string, extra?: Partial<InsertCrossBorderTransfer>) {
  const db = await getDb(); if (!db) return;
  await db.update(crossBorderTransfers).set({ status, ...(extra ?? {}), updatedAt: new Date() }).where(eq(crossBorderTransfers.transferId, transferId));
}

export async function updateCrossBorderTransferStatus(id: number, status: string, extra?: Partial<InsertCrossBorderTransfer>) {
  const db = await getDb(); if (!db) return;
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
  const conds: any[] = [];
  if (opts.active !== false) conds.push(eq(nipBanks.isActive, 1));
  if (opts.search) conds.push(ilike(nipBanks.bankName, `%${opts.search}%`));
  const w = conds.length > 0 ? and(...conds) : undefined;
  return db.select().from(nipBanks).where(w).orderBy(nipBanks.bankName);
}

export async function getNipBankByCode(bankCode: string): Promise<NipBank | null> {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(nipBanks).where(eq(nipBanks.bankCode, bankCode)).limit(1);
  return rows[0] ?? null;
}

export async function upsertNipBanks(banks: InsertNipBank[]): Promise<void> {
  const db = await getDb(); if (!db || banks.length === 0) return;
  await db.insert(nipBanks).values(banks).onConflictDoUpdate({
    target: nipBanks.bankCode,
    set: { bankName: sql`excluded.bank_name`, shortName: sql`excluded.short_name`, isActive: sql`excluded.is_active`, lastSyncedAt: new Date(), updatedAt: new Date() },
  });
}

// ─── NIP Account Enquiry Cache ────────────────────────────────────────────────
export async function getCachedNipAccount(tenantId: string, bankCode: string, accountNumber: string) {
  const db = await getDb(); if (!db) return null;
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
  await db.insert(nipAccountCache).values(data).onConflictDoUpdate({
    target: [nipAccountCache.tenantId, nipAccountCache.bankCode, nipAccountCache.accountNumber],
    set: { accountName: data.accountName, sessionId: data.sessionId, expiresAt: data.expiresAt },
  });
}

// ─── Settlements ──────────────────────────────────────────────────────────────
export async function createSettlement(data: InsertSettlement): Promise<Settlement | null> {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.insert(settlements).values(data).returning();
  return row ?? null;
}

export async function getSettlementById(id: string): Promise<Settlement | null> {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(settlements).where(eq(settlements.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateSettlement(id: string, data: Partial<InsertSettlement>): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(settlements).set({ ...data, updatedAt: new Date() }).where(eq(settlements.id, id));
}

export async function listSettlements(merchantId: string, opts: { limit?: number; offset?: number; status?: string } = {}): Promise<{ rows: Settlement[]; total: number }> {
  const db = await getDb(); if (!db) return { rows: [], total: 0 };
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
  await db.update(settlements).set({
    status: "sla_breached" as any,
    slaBreachedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(settlements.id, id));
}

export async function markSettlementSlaAlertSent(id: string): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(settlements).set({ slaAlertSentAt: new Date(), updatedAt: new Date() }).where(eq(settlements.id, id));
}
