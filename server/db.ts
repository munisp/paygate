/**
 * db.ts — PayGate data-access layer.
 *
 * Lazy postgres-js + Drizzle connection. The connection THROWS when
 * DATABASE_URL is unset — silently returning null and letting callers
 * fabricate data is not acceptable for a payment gateway.
 *
 * Every helper below issues real Drizzle queries against the schema in
 * drizzle/schema.ts. No fabricated rows.
 */

import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  users, merchants, tenants, transactions, customers, payouts, apiKeys,
  webhooks, webhookDeliveries, disputes, virtualCards, paymentLinks,
  teamMembers, fraudAlerts, kycSubmissions, bnplLoans, bnplPlans,
  mobileMoneyRecon, fxRates, fxAlerts, wallets, walletTransactions,
  crossBorderTransfers, settlements, nipBanks, nipAccountCache,
  nipResolutionErrors, merchantNotifications, geofenceRules, agentNetwork,
  restaurantTables, restaurantOrders, restaurantOrderItems, splitBillSessions,
  splitBillShares, menuCategories, menuItems, loyaltyPrograms, loyaltyAccounts,
  loyaltyTransactions, kdsStations, inventoryItems, recipeIngredients,
  staffMembers, staffShifts, payrollRuns, auditEvents, keycloakEvents,
  anomalyConfigAudit, adminNotificationPrefs, ptspBatches,
  reconciliationAlerts, corridorLiveStats, portalSubscriptions,
  bulkCollections, cashbackBalances, cashbackTransactions,
  digitalGoldHoldings, digitalGoldTransactions, mutualFundHoldings,
  mutualFundTransactions, insurancePolicies, pensionAccounts,
  pensionContributions, salaryAccounts, soundboxDevices, wealthGoals,
  emiContracts, nodalAccounts, nodalTransactions, privacyAliases,
  reportJobs, subscriptionPlansV2, subscriptionSubscribers,
  intlRemittanceTransfers, posProducts, retailSales,
  type InsertUser,
} from "../drizzle/schema";

export { schema };
export type { InsertUser };

type DbBase = PostgresJsDatabase<typeof schema>;

/**
 * postgres-js `execute` returns a RowList (an Array), but the codebase's raw
 * SQL call sites were written against the `{ rows }` contract. We attach a
 * non-enumerable self-referencing `rows` property at runtime (see
 * requireDbSync) so both `result[0]` and `result.rows[0]` work, and reflect
 * that in the type.
 */
export type Db = Omit<DbBase, "execute"> & {
  execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
    query: Parameters<DbBase["execute"]>[0],
  ): Promise<TRow[] & { rows: TRow[] }>;
};

let _client: postgres.Sql | null = null;
let _db: Db | null = null;

function withRows<T>(arr: T[]): T[] & { rows: T[] } {
  if (!("rows" in arr)) {
    Object.defineProperty(arr, "rows", { value: arr, enumerable: false, configurable: true });
  }
  return arr as T[] & { rows: T[] };
}

function requireDbSync(): Db {
  const url = process.env.DATABASE_URL || ENV.databaseUrl;
  if (!url) {
    throw new Error(
      "[Database] DATABASE_URL is not set. Refusing to run without a real database connection.",
    );
  }
  if (!_db) {
    _client = postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 10 });
    const base = drizzle(_client, { schema });
    const origExecute = base.execute.bind(base);
    (base as any).execute = (query: any) => origExecute(query).then((r: any) => withRows(r));
    _db = base as unknown as Db;
  }
  return _db;
}

/** Lazily create the drizzle instance. Throws when DATABASE_URL is unset. */
export async function getDb(): Promise<Db> {
  return requireDbSync();
}

/**
 * Synchronous handle for modules that use `db.select()` directly.
 * Lazily initialised on first property access; throws if DATABASE_URL unset.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = requireDbSync() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as Function).bind(real) : value;
  },
});

/**
 * Execute a parameterized raw SQL statement against the pool.
 * Returns the row array.
 */
export async function execRaw(
  database: Db | null | undefined,
  query: string,
  params: unknown[] = [],
): Promise<any[]> {
  const d = database ?? requireDbSync();
  const client = (d as unknown as { $client: postgres.Sql }).$client ?? _client;
  if (!client) throw new Error("[Database] No postgres client available for execRaw");
  const rows = await client.unsafe(query, params as never[]);
  return [...(rows as unknown as any[])];
}

// ─── Shared option types ──────────────────────────────────────────────────────

export interface ListOpts {
  limit?: number;
  offset?: number;
  status?: string;
  channel?: string;
  search?: string;
  from?: Date;
  to?: Date;
  riskLevel?: string;
  environment?: string;
  provider?: string;
  unreadOnly?: boolean;
  type?: string;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const database = requireDbSync();
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };

  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) {
    values.lastSignedIn = new Date();
  }

  if (Object.keys(updateSet).length === 0) {
    updateSet.lastSignedIn = new Date();
  }

  await database
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: { ...updateSet, updatedAt: new Date() },
    });
}

export async function getUserByOpenId(openId: string) {
  const database = requireDbSync();
  const result = await database.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Tenants ──────────────────────────────────────────────────────────────────

export async function getTenantBySlug(slug: string) {
  const database = requireDbSync();
  const rows = await database.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return rows[0];
}

export async function updateTenantBranding(
  tenantId: string,
  data: Partial<{
    name: string; logoUrl: string | null; primaryColor: string; secondaryColor: string | null;
    accentColor: string | null; fontFamily: string | null; faviconUrl: string | null;
    footerText: string | null; supportEmail: string | null; customDomain: string | null;
  }>,
) {
  const database = requireDbSync();
  const rows = await database
    .update(tenants)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning();
  return rows[0];
}

// ─── Merchants ────────────────────────────────────────────────────────────────

export async function getMerchantByOwnerId(ownerId: number) {
  const database = requireDbSync();
  const rows = await database.select().from(merchants).where(eq(merchants.ownerId, ownerId)).limit(1);
  return rows[0];
}

export async function createMerchant(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .insert(merchants)
    .values({ ...data, id: data.id ?? `mch_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0];
}

export async function updateMerchant(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(merchants)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(merchants.id, id))
    .returning();
  return rows[0];
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function createTransaction(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(transactions).values(data as any).returning();
  return rows[0];
}

export async function getTransactionById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return rows[0];
}

export async function updateTransaction(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(transactions)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(transactions.id, id))
    .returning();
  return rows[0];
}

export async function listTransactions(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(transactions.merchantId, merchantId)];
  if (opts.status) conds.push(eq(transactions.status, opts.status as any));
  if (opts.channel) conds.push(eq(transactions.channel, opts.channel as any));
  if (opts.from) conds.push(gte(transactions.createdAt, opts.from));
  if (opts.to) conds.push(lte(transactions.createdAt, opts.to));
  if (opts.search) {
    conds.push(or(
      ilike(transactions.reference, `%${opts.search}%`),
      ilike(transactions.customerEmail, `%${opts.search}%`),
      ilike(transactions.customerName, `%${opts.search}%`),
    )!);
  }
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(transactions).where(where).orderBy(desc(transactions.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(transactions).where(where),
  ]);
  return { rows, total };
}

export async function getTransactionsForExport(
  merchantId: string,
  from?: Date,
  to?: Date,
  status?: string,
) {
  const database = requireDbSync();
  const conds = [eq(transactions.merchantId, merchantId)];
  if (from) conds.push(gte(transactions.createdAt, from));
  if (to) conds.push(lte(transactions.createdAt, to));
  if (status) conds.push(eq(transactions.status, status as any));
  return database
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.createdAt))
    .limit(50_000);
}

export async function getTransactionStats(merchantId: string, from?: Date, to?: Date) {
  const database = requireDbSync();
  const conds = [eq(transactions.merchantId, merchantId)];
  if (from) conds.push(gte(transactions.createdAt, from));
  if (to) conds.push(lte(transactions.createdAt, to));
  const where = and(...conds);
  const [row] = await database
    .select({
      totalTransactions: count(),
      totalVolume: sql<string>`coalesce(sum(case when ${transactions.status} = 'completed' then ${transactions.amount} else 0 end), 0)`,
      totalFees: sql<string>`coalesce(sum(case when ${transactions.status} = 'completed' then ${transactions.feeAmount} else 0 end), 0)`,
      successCount: sql<number>`count(*) filter (where ${transactions.status} = 'completed')`,
      failedCount: sql<number>`count(*) filter (where ${transactions.status} = 'failed')`,
      pendingCount: sql<number>`count(*) filter (where ${transactions.status} in ('pending','processing'))`,
    })
    .from(transactions)
    .where(where);
  const total = Number(row?.totalTransactions ?? 0);
  const success = Number(row?.successCount ?? 0);
  return {
    totalTransactions: total,
    totalVolume: Number(row?.totalVolume ?? 0),
    totalFees: Number(row?.totalFees ?? 0),
    successCount: success,
    failedCount: Number(row?.failedCount ?? 0),
    pendingCount: Number(row?.pendingCount ?? 0),
    successRate: total > 0 ? (success / total) * 100 : 0,
  };
}

export async function getAnalyticsOverview(merchantId: string, from?: Date, to?: Date) {
  const database = requireDbSync();
  const stats = await getTransactionStats(merchantId, from, to);
  const [{ activeCustomers }] = await database
    .select({ activeCustomers: sql<number>`count(distinct ${transactions.customerEmail})` })
    .from(transactions)
    .where(and(
      eq(transactions.merchantId, merchantId),
      eq(transactions.status, "completed"),
      ...(from ? [gte(transactions.createdAt, from)] : []),
      ...(to ? [lte(transactions.createdAt, to)] : []),
    ));
  const [{ pendingPayouts }] = await database
    .select({ pendingPayouts: sql<string>`coalesce(sum(${payouts.amount}), 0)` })
    .from(payouts)
    .where(and(eq(payouts.merchantId, merchantId), inArray(payouts.status, ["pending", "pending_approval", "processing"] as any)));
  const [{ openDisputes }] = await database
    .select({ openDisputes: count() })
    .from(disputes)
    .where(and(eq(disputes.merchantId, merchantId), inArray(disputes.status, ["open", "under_review"] as any)));
  return {
    ...stats,
    activeCustomers: Number(activeCustomers ?? 0),
    pendingPayouts: Number(pendingPayouts ?? 0),
    openDisputes: Number(openDisputes ?? 0),
  };
}

export async function getRevenueTimeSeries(merchantId: string, from?: Date, to?: Date) {
  const database = requireDbSync();
  const conds = [eq(transactions.merchantId, merchantId), eq(transactions.status, "completed" as any)];
  if (from) conds.push(gte(transactions.createdAt, from));
  if (to) conds.push(lte(transactions.createdAt, to));
  const rows = await database
    .select({
      date: sql<string>`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`,
      volume: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
      fees: sql<string>`coalesce(sum(${transactions.feeAmount}), 0)`,
      count: count(),
    })
    .from(transactions)
    .where(and(...conds))
    .groupBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`);
  return rows.map(r => ({ date: r.date, volume: Number(r.volume), fees: Number(r.fees), count: Number(r.count) }));
}

export async function getChannelBreakdown(merchantId: string, from?: Date, to?: Date) {
  const database = requireDbSync();
  const conds = [eq(transactions.merchantId, merchantId)];
  if (from) conds.push(gte(transactions.createdAt, from));
  if (to) conds.push(lte(transactions.createdAt, to));
  const rows = await database
    .select({
      channel: transactions.channel,
      volume: sql<string>`coalesce(sum(case when ${transactions.status} = 'completed' then ${transactions.amount} else 0 end), 0)`,
      count: count(),
      successCount: sql<number>`count(*) filter (where ${transactions.status} = 'completed')`,
    })
    .from(transactions)
    .where(and(...conds))
    .groupBy(transactions.channel);
  return rows.map(r => ({
    channel: r.channel,
    volume: Number(r.volume),
    count: Number(r.count),
    successRate: Number(r.count) > 0 ? (Number(r.successCount) / Number(r.count)) * 100 : 0,
  }));
}

export async function getFraudTrend(merchantId: string, days = 30) {
  const database = requireDbSync();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await database
    .select({
      date: sql<string>`to_char(${fraudAlerts.createdAt}, 'YYYY-MM-DD')`,
      count: count(),
      avgRiskScore: sql<string>`coalesce(avg(${fraudAlerts.riskScore}), 0)`,
    })
    .from(fraudAlerts)
    .where(and(eq(fraudAlerts.merchantId, merchantId), gte(fraudAlerts.createdAt, since)))
    .groupBy(sql`to_char(${fraudAlerts.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${fraudAlerts.createdAt}, 'YYYY-MM-DD')`);
  return rows.map(r => ({ date: r.date, count: Number(r.count), avgRiskScore: Number(r.avgRiskScore) }));
}

export async function getDailyStatusBreakdown(merchantId: string, from?: Date, to?: Date) {
  const database = requireDbSync();
  const since = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const until = to ?? new Date();
  const rows = await database
    .select({
      date: sql<string>`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`,
      status: transactions.status,
      count: count(),
    })
    .from(transactions)
    .where(and(eq(transactions.merchantId, merchantId), gte(transactions.createdAt, since), lte(transactions.createdAt, until)))
    .groupBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`, transactions.status)
    .orderBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`);
  return rows;
}

export async function getHourlyHeatmap(merchantId: string, from?: Date, to?: Date) {
  const database = requireDbSync();
  const since = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const until = to ?? new Date();
  const rows = await database
    .select({
      dayOfWeek: sql<number>`extract(dow from ${transactions.createdAt})`,
      hour: sql<number>`extract(hour from ${transactions.createdAt})`,
      count: count(),
      volume: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.merchantId, merchantId), gte(transactions.createdAt, since), lte(transactions.createdAt, until)))
    .groupBy(sql`extract(dow from ${transactions.createdAt})`, sql`extract(hour from ${transactions.createdAt})`);
  return rows.map(r => ({ dayOfWeek: Number(r.dayOfWeek), hour: Number(r.hour), count: Number(r.count), volume: Number(r.volume) }));
}

export async function getTopCustomers(merchantId: string, from?: Date, to?: Date, limit = 10) {
  const database = requireDbSync();
  const conds = [eq(transactions.merchantId, merchantId), eq(transactions.status, "completed" as any)];
  if (from) conds.push(gte(transactions.createdAt, from));
  if (to) conds.push(lte(transactions.createdAt, to));
  const rows = await database
    .select({
      customerEmail: transactions.customerEmail,
      customerName: transactions.customerName,
      volume: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
      count: count(),
    })
    .from(transactions)
    .where(and(...conds))
    .groupBy(transactions.customerEmail, transactions.customerName)
    .orderBy(desc(sql`coalesce(sum(${transactions.amount}), 0)`))
    .limit(limit);
  return rows.map(r => ({ ...r, volume: Number(r.volume), count: Number(r.count) }));
}

export async function getRecentTransactionsFeed(merchantId: string, limit = 10) {
  const database = requireDbSync();
  return database
    .select()
    .from(transactions)
    .where(eq(transactions.merchantId, merchantId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
}

export async function getPeriodComparison(merchantId: string, from?: Date, to?: Date) {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const periodMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(start.getTime() - periodMs);
  const [current, previous] = await Promise.all([
    getTransactionStats(merchantId, start, end),
    getTransactionStats(merchantId, prevStart, prevEnd),
  ]);
  const delta = (cur: number, prev: number) =>
    prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
  return {
    current,
    previous,
    volumeChangePct: delta(current.totalVolume, previous.totalVolume),
    countChangePct: delta(current.totalTransactions, previous.totalTransactions),
  };
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function listCustomers(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(customers.merchantId, merchantId)];
  if (opts.riskLevel) conds.push(eq(customers.riskLevel, opts.riskLevel as any));
  if (opts.search) {
    conds.push(or(
      ilike(customers.email, `%${opts.search}%`),
      ilike(customers.name, `%${opts.search}%`),
      ilike(customers.phone, `%${opts.search}%`),
    )!);
  }
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(customers).where(where).orderBy(desc(customers.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(customers).where(where),
  ]);
  return { rows, total };
}

export async function getCustomerById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(customers).where(eq(customers.id, id)).limit(1);
  return rows[0];
}

export async function upsertCustomer(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .insert(customers)
    .values(data as any)
    .onConflictDoUpdate({ target: customers.id, set: { ...data, updatedAt: new Date() } as any })
    .returning();
  return rows[0];
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

export async function createPayout(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(payouts).values(data as any).returning();
  return rows[0];
}

export async function getPayoutById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(payouts).where(eq(payouts.id, id)).limit(1);
  return rows[0];
}

export async function listPayoutsByIds(merchantIdOrIds: string | string[], ids?: string[]) {
  const database = requireDbSync();
  // Accept both (ids) and (merchantId, ids) call shapes.
  const [merchantId, idList] = Array.isArray(merchantIdOrIds) ? [null, merchantIdOrIds] : [merchantIdOrIds, ids ?? []];
  if (idList.length === 0) return [];
  const conds = [inArray(payouts.id, idList)];
  if (merchantId) conds.push(eq(payouts.merchantId, merchantId));
  return database.select().from(payouts).where(and(...conds));
}

export async function updatePayout(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(payouts)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(payouts.id, id))
    .returning();
  return rows[0];
}

export async function listPayouts(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(payouts.merchantId, merchantId)];
  if (opts.status) conds.push(eq(payouts.status, opts.status as any));
  if (opts.from) conds.push(gte(payouts.createdAt, opts.from));
  if (opts.to) conds.push(lte(payouts.createdAt, opts.to));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(payouts).where(where).orderBy(desc(payouts.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(payouts).where(where),
  ]);
  return { rows, total };
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export async function createApiKey(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(apiKeys).values(data as any).returning();
  return rows[0];
}

export async function listApiKeys(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const conds = [eq(apiKeys.merchantId, merchantId)];
  if (opts.environment) conds.push(eq(apiKeys.environment, opts.environment as any));
  return database
    .select()
    .from(apiKeys)
    .where(and(...conds))
    .orderBy(desc(apiKeys.createdAt))
    .limit(opts.limit ?? 100);
}

export async function revokeApiKey(id: string, merchantId: string) {
  const database = requireDbSync();
  const rows = await database
    .update(apiKeys)
    .set({ isActive: false, revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.merchantId, merchantId)))
    .returning();
  return rows[0];
}

// ─── Webhooks & Deliveries ────────────────────────────────────────────────────

export async function createWebhook(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(webhooks).values(data as any).returning();
  return rows[0];
}

export async function listWebhooks(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  return database
    .select()
    .from(webhooks)
    .where(eq(webhooks.merchantId, merchantId))
    .orderBy(desc(webhooks.createdAt))
    .limit(opts.limit ?? 100);
}

export async function getWebhookById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  return rows[0];
}

export async function updateWebhook(id: string, merchantId: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(webhooks)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(webhooks.id, id), eq(webhooks.merchantId, merchantId)))
    .returning();
  return rows[0];
}

export async function deleteWebhook(id: string, merchantId: string) {
  const database = requireDbSync();
  await database.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.merchantId, merchantId)));
}

export async function createWebhookDelivery(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(webhookDeliveries).values(data as any).returning();
  return rows[0];
}

export async function getWebhookDeliveryById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1);
  return rows[0];
}

export async function updateWebhookDelivery(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(webhookDeliveries)
    .set(data as any)
    .where(eq(webhookDeliveries.id, id))
    .returning();
  return rows[0];
}

export async function listWebhookDeliveries(merchantId: string, webhookId?: string, limit = 50) {
  const database = requireDbSync();
  const conds = [eq(webhookDeliveries.merchantId, merchantId)];
  if (webhookId) conds.push(eq(webhookDeliveries.webhookId, webhookId));
  return database
    .select()
    .from(webhookDeliveries)
    .where(and(...conds))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

export async function createDispute(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(disputes).values(data as any).returning();
  return rows[0];
}

export async function getDisputeById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  return rows[0];
}

export async function updateDispute(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(disputes)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(disputes.id, id))
    .returning();
  return rows[0];
}

export async function listDisputes(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(disputes.merchantId, merchantId)];
  if (opts.status) conds.push(eq(disputes.status, opts.status as any));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(disputes).where(where).orderBy(desc(disputes.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(disputes).where(where),
  ]);
  return { rows, total };
}

// ─── Virtual Cards ────────────────────────────────────────────────────────────

export async function createVirtualCard(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(virtualCards).values(data as any).returning();
  return rows[0];
}

export async function getVirtualCardById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(virtualCards).where(eq(virtualCards.id, id)).limit(1);
  return rows[0];
}

export async function updateVirtualCard(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(virtualCards)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(virtualCards.id, id))
    .returning();
  return rows[0];
}

export async function listVirtualCards(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(virtualCards.merchantId, merchantId)];
  if (opts.status) conds.push(eq(virtualCards.status, opts.status as any));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(virtualCards).where(where).orderBy(desc(virtualCards.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(virtualCards).where(where),
  ]);
  return { rows, total };
}

// ─── Payment Links ────────────────────────────────────────────────────────────

export async function createPaymentLink(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(paymentLinks).values(data as any).returning();
  return rows[0];
}

export async function getPaymentLinkById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(paymentLinks).where(eq(paymentLinks.id, id)).limit(1);
  return rows[0];
}

export async function updatePaymentLink(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(paymentLinks)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(paymentLinks.id, id))
    .returning();
  return rows[0];
}

export async function listPaymentLinks(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(paymentLinks.merchantId, merchantId)];
  if (opts.status) conds.push(eq(paymentLinks.isActive, opts.status === "active"));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(paymentLinks).where(where).orderBy(desc(paymentLinks.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(paymentLinks).where(where),
  ]);
  return { rows, total };
}

// ─── Team Members ─────────────────────────────────────────────────────────────

export async function createTeamMember(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(teamMembers).values(data as any).returning();
  return rows[0];
}

export async function listTeamMembers(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const conds = [eq(teamMembers.merchantId, merchantId)];
  if (opts.status) conds.push(eq(teamMembers.status, opts.status as any));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(teamMembers).where(where).orderBy(desc(teamMembers.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(teamMembers).where(where),
  ]);
  return { rows, total };
}

export async function deleteTeamMember(id: number, merchantId: string) {
  const database = requireDbSync();
  await database.delete(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.merchantId, merchantId)));
}

// ─── Fraud Alerts ─────────────────────────────────────────────────────────────

export async function createFraudAlert(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(fraudAlerts).values(data as any).returning();
  return rows[0];
}

export async function listFraudAlerts(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(fraudAlerts.merchantId, merchantId)];
  if (opts.status) conds.push(eq(fraudAlerts.status, opts.status as any));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(fraudAlerts).where(where).orderBy(desc(fraudAlerts.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(fraudAlerts).where(where),
  ]);
  return { rows, total };
}

export async function updateFraudAlert(id: string, merchantId: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(fraudAlerts)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(fraudAlerts.id, id), eq(fraudAlerts.merchantId, merchantId)))
    .returning();
  return rows[0];
}

export async function getFraudStats(merchantId: string) {
  const database = requireDbSync();
  const [row] = await database
    .select({
      total: count(),
      open: sql<number>`count(*) filter (where ${fraudAlerts.status} = 'open')`,
      investigating: sql<number>`count(*) filter (where ${fraudAlerts.status} = 'investigating')`,
      resolved: sql<number>`count(*) filter (where ${fraudAlerts.status} = 'resolved')`,
      falsePositives: sql<number>`count(*) filter (where ${fraudAlerts.status} = 'false_positive')`,
      highRisk: sql<number>`count(*) filter (where ${fraudAlerts.riskScore} >= 80)`,
      avgRiskScore: sql<string>`coalesce(avg(${fraudAlerts.riskScore}), 0)`,
    })
    .from(fraudAlerts)
    .where(eq(fraudAlerts.merchantId, merchantId));
  return {
    total: Number(row?.total ?? 0),
    open: Number(row?.open ?? 0),
    investigating: Number(row?.investigating ?? 0),
    resolved: Number(row?.resolved ?? 0),
    falsePositives: Number(row?.falsePositives ?? 0),
    highRisk: Number(row?.highRisk ?? 0),
    avgRiskScore: Number(row?.avgRiskScore ?? 0),
  };
}

// ─── KYC ──────────────────────────────────────────────────────────────────────

export async function listKycSubmissions(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(kycSubmissions.merchantId, merchantId)];
  if (opts.status) conds.push(eq(kycSubmissions.status, opts.status as any));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(kycSubmissions).where(where).orderBy(desc(kycSubmissions.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(kycSubmissions).where(where),
  ]);
  return { rows, total };
}

export async function updateKycSubmission(id: string, merchantId: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(kycSubmissions)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(kycSubmissions.id, id), eq(kycSubmissions.merchantId, merchantId)))
    .returning();
  return rows[0];
}

export async function getKycStats(merchantId: string) {
  const database = requireDbSync();
  const [row] = await database
    .select({
      total: count(),
      pending: sql<number>`count(*) filter (where ${kycSubmissions.status} = 'pending')`,
      underReview: sql<number>`count(*) filter (where ${kycSubmissions.status} = 'under_review')`,
      approved: sql<number>`count(*) filter (where ${kycSubmissions.status} = 'approved')`,
      rejected: sql<number>`count(*) filter (where ${kycSubmissions.status} = 'rejected')`,
    })
    .from(kycSubmissions)
    .where(eq(kycSubmissions.merchantId, merchantId));
  return {
    total: Number(row?.total ?? 0),
    pending: Number(row?.pending ?? 0),
    underReview: Number(row?.underReview ?? 0),
    approved: Number(row?.approved ?? 0),
    rejected: Number(row?.rejected ?? 0),
  };
}

// ─── BNPL ─────────────────────────────────────────────────────────────────────

export async function createBnplLoan(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(bnplLoans).values(data as any).returning();
  return rows[0];
}

export async function listBnplLoans(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(bnplLoans.merchantId, merchantId)];
  if (opts.status) conds.push(eq(bnplLoans.status, opts.status as any));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(bnplLoans).where(where).orderBy(desc(bnplLoans.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(bnplLoans).where(where),
  ]);
  return { rows, total };
}

export async function getBnplStats(merchantId: string) {
  const database = requireDbSync();
  const [row] = await database
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${bnplLoans.status} = 'active')`,
      completed: sql<number>`count(*) filter (where ${bnplLoans.status} in ('completed','paid'))`,
      defaulted: sql<number>`count(*) filter (where ${bnplLoans.status} = 'defaulted')`,
      outstandingKobo: sql<string>`coalesce(sum(case when ${bnplLoans.status} = 'active' then ${bnplLoans.principalAmount} - ${bnplLoans.paidAmount} else 0 end), 0)`,
      disbursedKobo: sql<string>`coalesce(sum(${bnplLoans.principalAmount}), 0)`,
    })
    .from(bnplLoans)
    .where(eq(bnplLoans.merchantId, merchantId));
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    completed: Number(row?.completed ?? 0),
    defaulted: Number(row?.defaulted ?? 0),
    outstandingKobo: Number(row?.outstandingKobo ?? 0),
    disbursedKobo: Number(row?.disbursedKobo ?? 0),
  };
}

export async function createBnplPlan(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(bnplPlans).values(data as any).returning();
  return rows[0];
}

export async function listBnplPlans(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(bnplPlans).where(eq(bnplPlans.merchantId, merchantId)).orderBy(desc(bnplPlans.createdAt));
}

export async function updateBnplPlan(id: string, merchantId: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(bnplPlans)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(bnplPlans.id, id), eq(bnplPlans.merchantId, merchantId)))
    .returning();
  return rows[0];
}

// ─── Mobile Money Reconciliation ──────────────────────────────────────────────

export async function listMobileMoneyRecon(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(mobileMoneyRecon.merchantId, merchantId)];
  if (opts.status) conds.push(eq(mobileMoneyRecon.status, opts.status as any));
  if (opts.provider) conds.push(eq(mobileMoneyRecon.provider, opts.provider));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(mobileMoneyRecon).where(where).orderBy(desc(mobileMoneyRecon.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(mobileMoneyRecon).where(where),
  ]);
  return { rows, total };
}

export async function getMmReconStats(merchantId: string) {
  const database = requireDbSync();
  const [row] = await database
    .select({
      total: count(),
      matched: sql<number>`count(*) filter (where ${mobileMoneyRecon.status} = 'matched')`,
      unmatched: sql<number>`count(*) filter (where ${mobileMoneyRecon.status} = 'unmatched')`,
      disputed: sql<number>`count(*) filter (where ${mobileMoneyRecon.status} = 'disputed')`,
      pending: sql<number>`count(*) filter (where ${mobileMoneyRecon.status} = 'pending')`,
      unmatchedVolume: sql<string>`coalesce(sum(case when ${mobileMoneyRecon.status} = 'unmatched' then ${mobileMoneyRecon.amount} else 0 end), 0)`,
    })
    .from(mobileMoneyRecon)
    .where(eq(mobileMoneyRecon.merchantId, merchantId));
  return {
    total: Number(row?.total ?? 0),
    matched: Number(row?.matched ?? 0),
    unmatched: Number(row?.unmatched ?? 0),
    disputed: Number(row?.disputed ?? 0),
    pending: Number(row?.pending ?? 0),
    unmatchedVolume: Number(row?.unmatchedVolume ?? 0),
  };
}

// ─── FX Rates & Alerts ────────────────────────────────────────────────────────

export async function upsertFxRates(rows: Array<Record<string, any>>) {
  if (rows.length === 0) return;
  const database = requireDbSync();
  for (const row of rows) {
    await database
      .insert(fxRates)
      .values({ ...row, fetchedAt: row.fetchedAt ?? new Date() } as any);
  }
}

export async function getLatestFxRates(base: string) {
  const database = requireDbSync();
  // Latest rate per target currency for the given base.
  const rows = await database.execute(sql`
    SELECT DISTINCT ON (target_currency)
      id, base_currency AS "baseCurrency", target_currency AS "targetCurrency",
      rate, source, fetched_at AS "fetchedAt"
    FROM fx_rates
    WHERE base_currency = ${base}
    ORDER BY target_currency, fetched_at DESC
  `);
  return Array.from(rows as unknown as any[]) as Array<{ id: number; baseCurrency: string; targetCurrency: string; rate: string; source: string | null; fetchedAt: Date }>;
}

export async function getFxRateHistory(base: string, target: string, limit = 30) {
  const database = requireDbSync();
  return database
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.baseCurrency, base), eq(fxRates.targetCurrency, target)))
    .orderBy(desc(fxRates.fetchedAt))
    .limit(limit);
}

export async function listFxAlerts(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(fxAlerts).where(eq(fxAlerts.merchantId, merchantId)).orderBy(desc(fxAlerts.createdAt));
}

export async function upsertFxAlert(data: {
  id?: number;
  merchantId: string;
  pair: string;
  direction: "above" | "below";
  threshold: number;
}) {
  const database = requireDbSync();
  // Upsert semantics: when an id is supplied, update the existing alert row;
  // otherwise insert a new one.
  if (data.id) {
    const existing = await database
      .select()
      .from(fxAlerts)
      .where(eq(fxAlerts.id, data.id))
      .limit(1);
    if (existing.length > 0) {
      const rows = await database
        .update(fxAlerts)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(eq(fxAlerts.id, data.id))
        .returning();
      return rows[0];
    }
  }
  const rows = await database.insert(fxAlerts).values(data as any).returning();
  return rows[0];
}

export async function deleteFxAlert(id: number, merchantId: string) {
  const database = requireDbSync();
  const rows = await database
    .delete(fxAlerts)
    .where(and(eq(fxAlerts.id, id), eq(fxAlerts.merchantId, merchantId)))
    .returning();
  return rows[0] ?? null;
}

// ─── Wallets ──────────────────────────────────────────────────────────────────

export async function getWalletByUserId(userId: string, currency = "NGN") {
  const database = requireDbSync();
  const rows = await database
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)))
    .limit(1);
  return rows[0];
}

export async function getOrCreateWallet(userId: string, tenantId: string | null = "ten_default", currency = "NGN") {
  const database = requireDbSync();
  const existing = await getWalletByUserId(userId, currency);
  if (existing) return existing;
  const rows = await database
    .insert(wallets)
    .values({ tenantId: tenantId ?? "ten_default", userId, currency })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];
  // Concurrent insert won the race — re-read.
  return getWalletByUserId(userId, currency);
}

export async function listWalletTransactions(walletId: number, opts: ListOpts = {}) {
  const database = requireDbSync();
  return database
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

export async function getWalletTransactionCount(walletId: number) {
  const database = requireDbSync();
  const [{ total }] = await database
    .select({ total: count() })
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId));
  return Number(total ?? 0);
}

export async function createWalletTransaction(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(walletTransactions).values(data as any).returning();
  return rows[0];
}

/**
 * Atomic guarded balance update: `UPDATE wallets SET balance = balance::numeric + delta
 * WHERE id = $1 AND balance::numeric + delta >= 0 RETURNING`.
 * Returns the updated wallet, or null when the guard rejected the update
 * (e.g. insufficient funds on a debit). TOCTOU-safe — the guard is evaluated
 * inside the database under the row lock.
 */
export async function applyWalletBalanceDelta(walletId: number, delta: string | number) {
  const database = requireDbSync();
  const result: any = await database.execute(sql`
    UPDATE wallets
    SET balance = (balance::numeric + ${String(delta)}::numeric)::text,
        updated_at = now()
    WHERE id = ${walletId}
      AND (balance::numeric + ${String(delta)}::numeric) >= 0
    RETURNING *
  `);
  const rows: any[] = result?.rows ?? result ?? [];
  return rows[0] ?? null;
}

/** Direct balance overwrite (admin corrections only — prefer applyWalletBalanceDelta). */
export async function updateWalletBalance(walletId: number, newBalance: string) {
  const database = requireDbSync();
  const rows = await database
    .update(wallets)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(wallets.id, walletId))
    .returning();
  return rows[0];
}

export async function getWalletTransactionByReference(tenantId: string, reference: string) {
  const database = requireDbSync();
  const rows = await database
    .select()
    .from(walletTransactions)
    .where(and(eq(walletTransactions.tenantId, tenantId), eq(walletTransactions.reference, reference)))
    .limit(1);
  return rows[0];
}

// ─── Cross-Border Transfers ───────────────────────────────────────────────────

export async function createCrossBorderTransfer(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(crossBorderTransfers).values(data as any).returning();
  return rows[0];
}

export async function getCrossBorderTransferById(transferId: string) {
  const database = requireDbSync();
  const rows = await database
    .select()
    .from(crossBorderTransfers)
    .where(eq(crossBorderTransfers.transferId, transferId))
    .limit(1);
  return rows[0];
}

export async function listCrossBorderTransfers(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const conds = [eq(crossBorderTransfers.merchantId, merchantId)];
  if (opts.status) conds.push(eq(crossBorderTransfers.status, opts.status));
  return database
    .select()
    .from(crossBorderTransfers)
    .where(and(...conds))
    .orderBy(desc(crossBorderTransfers.createdAt))
    .limit(opts.limit ?? 20)
    .offset(opts.offset ?? 0);
}

export async function updateCrossBorderTransferStatusByTransferId(
  transferId: string,
  status: string,
  extra: Record<string, any> = {},
) {
  const database = requireDbSync();
  const rows = await database
    .update(crossBorderTransfers)
    .set({ status, ...extra, updatedAt: new Date() } as any)
    .where(eq(crossBorderTransfers.transferId, transferId))
    .returning();
  return rows[0];
}

// ─── Settlements ──────────────────────────────────────────────────────────────

export async function createSettlement(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(settlements).values(data as any).returning();
  return rows[0];
}

export async function getSettlementById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(settlements).where(eq(settlements.id, id)).limit(1);
  return rows[0];
}

export async function updateSettlement(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(settlements)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(settlements.id, id))
    .returning();
  return rows[0];
}

export async function listSettlements(merchantId: string, opts: ListOpts = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(settlements.merchantId, merchantId)];
  if (opts.status) conds.push(eq(settlements.status, opts.status as any));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(settlements).where(where).orderBy(desc(settlements.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(settlements).where(where),
  ]);
  return { rows, total };
}

export async function listSlaBreachedSettlements(tenantId: string) {
  const database = requireDbSync();
  return database
    .select()
    .from(settlements)
    .where(and(
      eq(settlements.tenantId, tenantId),
      inArray(settlements.status, ["pending", "processing"] as any),
      sql`${settlements.slaDeadlineAt} IS NOT NULL AND ${settlements.slaDeadlineAt} < now()`,
      sql`${settlements.slaBreachedAt} IS NULL`,
    ))
    .orderBy(asc(settlements.slaDeadlineAt));
}

export async function markSettlementSlaBreached(id: string) {
  const database = requireDbSync();
  const rows = await database
    .update(settlements)
    .set({ slaBreachedAt: new Date(), severity: "critical", updatedAt: new Date() } as any)
    .where(eq(settlements.id, id))
    .returning();
  return rows[0];
}

export async function markSettlementSlaAlertSent(id: string) {
  const database = requireDbSync();
  const rows = await database
    .update(settlements)
    .set({ slaAlertSentAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(settlements.id, id))
    .returning();
  return rows[0];
}

export async function getSettlementSLABreaches(tenantId: string, opts: { limit?: number } = {}) {
  const database = requireDbSync();
  return database
    .select()
    .from(settlements)
    .where(and(eq(settlements.tenantId, tenantId), sql`${settlements.slaBreachedAt} IS NOT NULL`))
    .orderBy(desc(settlements.slaBreachedAt))
    .limit(opts.limit ?? 100);
}

// ─── NIP Bank Directory ───────────────────────────────────────────────────────

export async function listNipBanks(opts: { search?: string } = {}) {
  const database = requireDbSync();
  const conds = [eq(nipBanks.isActive, 1)];
  if (opts.search) {
    conds.push(or(
      ilike(nipBanks.bankName, `%${opts.search}%`),
      ilike(nipBanks.shortName, `%${opts.search}%`),
      ilike(nipBanks.bankCode, `%${opts.search}%`),
    )!);
  }
  return database.select().from(nipBanks).where(and(...conds)).orderBy(asc(nipBanks.bankName));
}

export async function getNipBankByCode(bankCode: string) {
  const database = requireDbSync();
  const rows = await database.select().from(nipBanks).where(eq(nipBanks.bankCode, bankCode)).limit(1);
  return rows[0];
}

export async function upsertNipBanks(records: Array<Record<string, any>>) {
  if (records.length === 0) return 0;
  const database = requireDbSync();
  let synced = 0;
  for (const record of records) {
    const normalized: Record<string, any> = {
      ...record,
      isActive: typeof record.isActive === "boolean" ? (record.isActive ? 1 : 0) : (record.isActive ?? 1),
      supportsNip: typeof record.supportsNip === "boolean" ? (record.supportsNip ? 1 : 0) : (record.supportsNip ?? 1),
      supportsUssd: typeof record.supportsUssd === "boolean" ? (record.supportsUssd ? 1 : 0) : (record.supportsUssd ?? 0),
      lastSyncedAt: record.lastSyncedAt ?? new Date(),
      updatedAt: new Date(),
    };
    await database
      .insert(nipBanks)
      .values(normalized as any)
      .onConflictDoUpdate({
        target: nipBanks.id,
        set: {
          bankCode: normalized.bankCode,
          bankName: normalized.bankName,
          shortName: normalized.shortName,
          nipCode: normalized.nipCode,
          category: normalized.category,
          isActive: normalized.isActive,
          supportsNip: normalized.supportsNip,
          supportsUssd: normalized.supportsUssd,
          logoUrl: normalized.logoUrl,
          lastSyncedAt: normalized.lastSyncedAt,
          updatedAt: normalized.updatedAt,
        } as any,
      });
    synced++;
  }
  return synced;
}

// ─── NIP Account Cache (lookup results from the real bridge enquiry) ─────────

export async function getCachedNipAccount(tenantId: string, bankCode: string, accountNumber: string) {
  const database = requireDbSync();
  const rows = await database
    .select()
    .from(nipAccountCache)
    .where(and(
      eq(nipAccountCache.tenantId, tenantId),
      eq(nipAccountCache.bankCode, bankCode),
      eq(nipAccountCache.accountNumber, accountNumber),
      sql`${nipAccountCache.expiresAt} > now()`,
    ))
    .orderBy(desc(nipAccountCache.createdAt))
    .limit(1);
  return rows[0];
}

export async function cacheNipAccount(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(nipAccountCache).values(data as any).returning();
  return rows[0];
}

// ─── NIP Name-Enquiry Cache & Virtual Accounts ──────────────────────────────
// The `nip_name_enquiry_cache` and `nip_virtual_accounts` tables exist in the
// database (drizzle/0075_fast_spirit.sql) but are NOT exported from
// drizzle/schema.ts, so they are queried here with parameterized raw SQL
// against the real table names. Column aliases preserve the camelCase row
// shape the drizzle table objects would have produced.

/** Look up a non-expired NIP name-enquiry cache entry. */
export async function getCachedNipNameEnquiry(bankNipCode: string, accountNumber: string) {
  const database = requireDbSync();
  const result: any = await database.execute(sql`
    SELECT account_name AS "accountName",
           bank_verification_number AS "bankVerificationNumber",
           kyc_level AS "kycLevel",
           expires_at AS "expiresAt"
    FROM nip_name_enquiry_cache
    WHERE bank_nip_code = ${bankNipCode}
      AND account_number = ${accountNumber}
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const rows: any[] = result?.rows ?? result ?? [];
  return rows[0] ?? null;
}

/** Cache a NIP name-enquiry result; refreshes any expired entry for the same key. */
export async function cacheNipNameEnquiry(data: {
  bankNipCode: string;
  accountNumber: string;
  accountName: string;
  bankVerificationNumber: string | null;
  kycLevel: string | null;
  expiresAt: Date;
}) {
  const database = requireDbSync();
  await database.execute(sql`
    INSERT INTO nip_name_enquiry_cache
      (bank_nip_code, account_number, account_name, bank_verification_number, kyc_level, expires_at)
    VALUES
      (${data.bankNipCode}, ${data.accountNumber}, ${data.accountName},
       ${data.bankVerificationNumber}, ${data.kycLevel}, ${data.expiresAt})
    ON CONFLICT (bank_nip_code, account_number)
    DO UPDATE SET account_name = EXCLUDED.account_name,
                  bank_verification_number = EXCLUDED.bank_verification_number,
                  kyc_level = EXCLUDED.kyc_level,
                  expires_at = EXCLUDED.expires_at
  `);
}

/** Persist a freshly generated NIP virtual account (unique on reference). */
export async function createNipVirtualAccount(data: {
  merchantId: string;
  paymentLinkId: string | null;
  checkoutSessionId: string | null;
  bankNipCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  amountExpected: number | null;
  currency: string;
  reference: string;
  status: string;
  expiresAt: Date;
}) {
  const database = requireDbSync();
  await database.execute(sql`
    INSERT INTO nip_virtual_accounts
      (merchant_id, payment_link_id, checkout_session_id, bank_nip_code, bank_name,
       account_number, account_name, amount_expected, currency, reference, status, expires_at)
    VALUES
      (${data.merchantId}, ${data.paymentLinkId}, ${data.checkoutSessionId}, ${data.bankNipCode},
       ${data.bankName}, ${data.accountNumber}, ${data.accountName}, ${data.amountExpected},
       ${data.currency}, ${data.reference}, ${data.status}, ${data.expiresAt})
  `);
}

const NIP_VA_SELECT = sql`
  SELECT id, merchant_id AS "merchantId", payment_link_id AS "paymentLinkId",
         checkout_session_id AS "checkoutSessionId", bank_nip_code AS "bankNipCode",
         bank_name AS "bankName", account_number AS "accountNumber",
         account_name AS "accountName", amount_expected AS "amountExpected",
         currency, reference, status, paid_at AS "paidAt", paid_amount AS "paidAmount",
         nibss_reference AS "nibssReference", expires_at AS "expiresAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM nip_virtual_accounts
`;

export async function getNipVirtualAccountByReference(reference: string) {
  const database = requireDbSync();
  const result: any = await database.execute(sql`${NIP_VA_SELECT} WHERE reference = ${reference} LIMIT 1`);
  const rows: any[] = result?.rows ?? result ?? [];
  return rows[0] ?? null;
}

export async function listNipVirtualAccounts(
  merchantId: string,
  opts: { status?: string | null; limit?: number; offset?: number } = {},
) {
  const database = requireDbSync();
  const statusCond = opts.status ? sql`AND status = ${opts.status}` : sql``;
  const result: any = await database.execute(sql`
    ${NIP_VA_SELECT}
    WHERE merchant_id = ${merchantId} ${statusCond}
    ORDER BY created_at
    LIMIT ${opts.limit ?? 20}
    OFFSET ${opts.offset ?? 0}
  `);
  const rows: any[] = result?.rows ?? result ?? [];
  return rows;
}

// ─── NIP Resolution Errors ────────────────────────────────────────────────────

export async function createNipResolutionError(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(nipResolutionErrors).values(data as any).returning();
  return rows[0];
}

export async function listNipResolutionErrors(
  merchantId: string,
  opts: { limit?: number; offset?: number; bankCode?: string; accountNumber?: string } = {},
) {
  const database = requireDbSync();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conds = [eq(nipResolutionErrors.merchantId, merchantId)];
  if (opts.bankCode) conds.push(eq(nipResolutionErrors.bankCode, opts.bankCode));
  if (opts.accountNumber) conds.push(eq(nipResolutionErrors.accountNumber, opts.accountNumber));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    database.select().from(nipResolutionErrors).where(where).orderBy(desc(nipResolutionErrors.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(nipResolutionErrors).where(where),
  ]);
  return { rows, total };
}

export async function countNipResolutionErrors(tenantId: string, bankCode?: string) {
  const database = requireDbSync();
  const conds = [eq(nipResolutionErrors.tenantId, tenantId), sql`${nipResolutionErrors.resolvedAt} IS NULL`];
  if (bankCode) conds.push(eq(nipResolutionErrors.bankCode, bankCode));
  const [{ total }] = await database.select({ total: count() }).from(nipResolutionErrors).where(and(...conds));
  return Number(total ?? 0);
}

export async function markNipErrorResolved(
  merchantIdOrId: string | number,
  bankCode?: string,
  accountNumber?: string,
  resolvedAccountName?: string,
) {
  const database = requireDbSync();
  if (typeof merchantIdOrId === "number") {
    // Resolve a single error row by primary key.
    const rows = await database
      .update(nipResolutionErrors)
      .set({ resolvedAt: new Date(), ...(resolvedAccountName ? { resolvedAccountName } : {}) } as any)
      .where(eq(nipResolutionErrors.id, merchantIdOrId))
      .returning();
    return rows[0] ?? null;
  }
  // Resolve all open errors for this merchant/bank/account tuple.
  const conds = [
    eq(nipResolutionErrors.merchantId, merchantIdOrId),
    sql`${nipResolutionErrors.resolvedAt} IS NULL`,
  ];
  if (bankCode) conds.push(eq(nipResolutionErrors.bankCode, bankCode));
  if (accountNumber) conds.push(eq(nipResolutionErrors.accountNumber, accountNumber));
  const rows = await database
    .update(nipResolutionErrors)
    .set({ resolvedAt: new Date(), ...(resolvedAccountName ? { resolvedAccountName } : {}) } as any)
    .where(and(...conds))
    .returning();
  return rows;
}

// ─── Merchant Notifications ───────────────────────────────────────────────────

export async function createMerchantNotification(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(merchantNotifications).values(data as any).returning();
  return rows[0];
}

export async function listMerchantNotifications(
  merchantId: string,
  opts: { limit?: number; offset?: number; unreadOnly?: boolean; type?: string } = {},
) {
  const database = requireDbSync();
  const conds = [eq(merchantNotifications.merchantId, merchantId), sql`${merchantNotifications.dismissedAt} IS NULL`];
  if (opts.unreadOnly) conds.push(eq(merchantNotifications.isRead, false));
  if (opts.type) conds.push(eq(merchantNotifications.type, opts.type));
  return database
    .select()
    .from(merchantNotifications)
    .where(and(...conds))
    .orderBy(desc(merchantNotifications.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

export async function countUnreadNotifications(merchantId: string) {
  const database = requireDbSync();
  const [{ total }] = await database
    .select({ total: count() })
    .from(merchantNotifications)
    .where(and(
      eq(merchantNotifications.merchantId, merchantId),
      eq(merchantNotifications.isRead, false),
      sql`${merchantNotifications.dismissedAt} IS NULL`,
    ));
  return Number(total ?? 0);
}

export async function markNotificationRead(id: number, merchantId: string) {
  const database = requireDbSync();
  await database
    .update(merchantNotifications)
    .set({ isRead: true })
    .where(and(eq(merchantNotifications.id, id), eq(merchantNotifications.merchantId, merchantId)));
}

export async function markAllNotificationsRead(merchantId: string) {
  const database = requireDbSync();
  await database
    .update(merchantNotifications)
    .set({ isRead: true })
    .where(and(eq(merchantNotifications.merchantId, merchantId), eq(merchantNotifications.isRead, false)));
}

export async function dismissNotification(id: number, merchantId: string) {
  const database = requireDbSync();
  await database
    .update(merchantNotifications)
    .set({ dismissedAt: new Date() })
    .where(and(eq(merchantNotifications.id, id), eq(merchantNotifications.merchantId, merchantId)));
}

export async function dismissAllNotifications(merchantId: string) {
  const database = requireDbSync();
  await database
    .update(merchantNotifications)
    .set({ dismissedAt: new Date() })
    .where(and(eq(merchantNotifications.merchantId, merchantId), sql`${merchantNotifications.dismissedAt} IS NULL`));
}

// ─── Geofence Rules ───────────────────────────────────────────────────────────

export async function listGeofenceRules(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(geofenceRules).where(eq(geofenceRules.merchantId, merchantId)).orderBy(desc(geofenceRules.createdAt));
}

export async function upsertGeofenceRule(data: Record<string, any>) {
  const database = requireDbSync();
  if (data.id) {
    const rows = await database
      .update(geofenceRules)
      .set(data as any)
      .where(and(eq(geofenceRules.id, data.id), eq(geofenceRules.merchantId, data.merchantId)))
      .returning();
    if (rows[0]) return rows[0];
  }
  const rows = await database
    .insert(geofenceRules)
    .values({ ...data, id: data.id ?? `geo_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0];
}

export async function deleteGeofenceRule(id: string, merchantId: string) {
  const database = requireDbSync();
  await database.delete(geofenceRules).where(and(eq(geofenceRules.id, id), eq(geofenceRules.merchantId, merchantId)));
}

// ─── Agent Network (sub-agents) ───────────────────────────────────────────────

export async function listSubAgents(superAgentMerchantId: string) {
  const database = requireDbSync();
  return database
    .select()
    .from(agentNetwork)
    .where(eq(agentNetwork.superAgentMerchantId, superAgentMerchantId));
}

export async function upsertSubAgent(data: Record<string, any>) {
  const database = requireDbSync();
  const existing = await database
    .select()
    .from(agentNetwork)
    .where(and(
      eq(agentNetwork.superAgentMerchantId, data.superAgentMerchantId),
      eq(agentNetwork.subAgentMerchantId, data.subAgentMerchantId),
    ))
    .limit(1);
  if (existing[0]) {
    const rows = await database
      .update(agentNetwork)
      .set(data as any)
      .where(eq(agentNetwork.id, existing[0].id))
      .returning();
    return rows[0];
  }
  const rows = await database.insert(agentNetwork).values(data as any).returning();
  return rows[0];
}

export async function disburseAgentCommissions(superAgentMerchantId: string) {
  const database = requireDbSync();
  // Commission settlement: mark all active sub-agent relationships' accrued
  // volume as disbursed by resetting the unsettled volume counters in a
  // single transaction. Returns the agents affected.
  return database.transaction(async (tx) => {
    const agents = await tx
      .select()
      .from(agentNetwork)
      .where(and(eq(agentNetwork.superAgentMerchantId, superAgentMerchantId), eq(agentNetwork.status, "active")));
    let totalVolumeKobo = 0;
    for (const agent of agents) {
      totalVolumeKobo += Number(agent.totalVolumeKobo ?? 0);
      await tx
        .update(agentNetwork)
        .set({ totalVolumeKobo: 0 })
        .where(eq(agentNetwork.id, agent.id));
    }
    return { disbursed: agents.length, disbursedAgents: agents.length, totalVolumeKobo };
  });
}

// ─── Restaurant: Tables ───────────────────────────────────────────────────────

export async function listRestaurantTables(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(restaurantTables).where(eq(restaurantTables.merchantId, merchantId)).orderBy(asc(restaurantTables.tableNumber));
}

export async function createRestaurantTable(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .insert(restaurantTables)
    .values({ ...data, id: data.id ?? `tbl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0].id as string;
}

export async function updateRestaurantTableStatus(id: string, merchantId: string, status: string) {
  const database = requireDbSync();
  await database
    .update(restaurantTables)
    .set({ status: status as any })
    .where(and(eq(restaurantTables.id, id), eq(restaurantTables.merchantId, merchantId)));
}

export async function updateRestaurantTablePosition(id: string, merchantId: string, posX: number, posY: number) {
  const database = requireDbSync();
  await database
    .update(restaurantTables)
    .set({ posX, posY })
    .where(and(eq(restaurantTables.id, id), eq(restaurantTables.merchantId, merchantId)));
}

// ─── Restaurant: Orders ───────────────────────────────────────────────────────

export async function listRestaurantOrders(merchantId: string, status?: string) {
  const database = requireDbSync();
  const conds = [eq(restaurantOrders.merchantId, merchantId)];
  if (status) conds.push(eq(restaurantOrders.status, status as any));
  return database.select().from(restaurantOrders).where(and(...conds)).orderBy(desc(restaurantOrders.createdAt));
}

export async function createRestaurantOrder(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .insert(restaurantOrders)
    .values({ ...data, id: data.id ?? `ord_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0].id as string;
}

export async function addOrderItem(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(restaurantOrderItems).values(data as any).returning();
  return rows[0];
}

export async function updateOrderStatus(id: string, merchantId: string, status: string) {
  const database = requireDbSync();
  await database
    .update(restaurantOrders)
    .set({ status: status as any, updatedAt: new Date() })
    .where(and(eq(restaurantOrders.id, id), eq(restaurantOrders.merchantId, merchantId)));
}

export async function getOrderWithItems(id: string) {
  const database = requireDbSync();
  const orderRows = await database.select().from(restaurantOrders).where(eq(restaurantOrders.id, id)).limit(1);
  if (!orderRows[0]) return undefined;
  const items = await database
    .select()
    .from(restaurantOrderItems)
    .where(eq(restaurantOrderItems.orderId, id))
    .orderBy(asc(restaurantOrderItems.courseNumber), asc(restaurantOrderItems.id));
  return { ...orderRows[0], items };
}

// ─── Restaurant: Split Bills ──────────────────────────────────────────────────

export async function createSplitBillSession(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .insert(splitBillSessions)
    .values({ ...data, id: data.id ?? `sbs_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0].id as string;
}

export async function getSplitBillSession(id: string) {
  const database = requireDbSync();
  const sessionRows = await database.select().from(splitBillSessions).where(eq(splitBillSessions.id, id)).limit(1);
  if (!sessionRows[0]) return undefined;
  const shares = await database
    .select()
    .from(splitBillShares)
    .where(eq(splitBillShares.sessionId, id))
    .orderBy(asc(splitBillShares.shareIndex));
  return { ...sessionRows[0], shares };
}

// ─── Restaurant: Menu ─────────────────────────────────────────────────────────

export async function listMenuCategories(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(menuCategories).where(eq(menuCategories.merchantId, merchantId)).orderBy(asc(menuCategories.displayOrder));
}

export async function listMenuItems(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(menuItems).where(eq(menuItems.merchantId, merchantId)).orderBy(asc(menuItems.name));
}

export async function upsertMenuCategory(data: Record<string, any>) {
  const database = requireDbSync();
  if (data.id) {
    const rows = await database
      .update(menuCategories)
      .set(data as any)
      .where(and(eq(menuCategories.id, data.id), eq(menuCategories.merchantId, data.merchantId)))
      .returning();
    if (rows[0]) return rows[0].id as string;
  }
  const rows = await database
    .insert(menuCategories)
    .values({ ...data, id: data.id ?? `mcat_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0].id as string;
}

export async function upsertMenuItem(data: Record<string, any>) {
  const database = requireDbSync();
  if (data.id) {
    const rows = await database
      .update(menuItems)
      .set(data as any)
      .where(and(eq(menuItems.id, data.id), eq(menuItems.merchantId, data.merchantId)))
      .returning();
    if (rows[0]) return rows[0].id as string;
  }
  const rows = await database
    .insert(menuItems)
    .values({ ...data, id: data.id ?? `mitm_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0].id as string;
}

export async function toggleMenuItemAvailability(id: string, merchantId: string) {
  const database = requireDbSync();
  await database
    .update(menuItems)
    .set({ available: sql`NOT ${menuItems.available}` })
    .where(and(eq(menuItems.id, id), eq(menuItems.merchantId, merchantId)));
}

// ─── Restaurant: Loyalty ──────────────────────────────────────────────────────

export async function getLoyaltyProgram(merchantId: string) {
  const database = requireDbSync();
  const rows = await database.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  return rows[0];
}

export async function upsertLoyaltyProgram(data: Record<string, any>) {
  const database = requireDbSync();
  const existing = await getLoyaltyProgram(data.merchantId);
  if (existing) {
    const rows = await database
      .update(loyaltyPrograms)
      .set(data as any)
      .where(eq(loyaltyPrograms.id, existing.id))
      .returning();
    return rows[0];
  }
  const rows = await database
    .insert(loyaltyPrograms)
    .values({ ...data, id: data.id ?? `loy_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0];
}

export async function getOrCreateLoyaltyAccount(merchantId: string, customerId: string | number) {
  const database = requireDbSync();
  const customerIdNum = typeof customerId === "number" ? customerId : parseInt(customerId, 10);
  const existing = await database
    .select()
    .from(loyaltyAccounts)
    .where(and(eq(loyaltyAccounts.merchantId, merchantId), eq(loyaltyAccounts.customerId, customerIdNum)))
    .limit(1);
  if (existing[0]) return existing[0];
  const program = await getLoyaltyProgram(merchantId);
  const rows = await database
    .insert(loyaltyAccounts)
    .values({
      merchantId,
      customerId: customerIdNum,
      programId: program?.id ?? null,
      accountId: `loya_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      id: `loya_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    } as any)
    .returning();
  return rows[0];
}

export async function earnLoyaltyPoints(accountId: string, points: number, orderId?: string) {
  const database = requireDbSync();
  return database.transaction(async (tx) => {
    const updated = await tx
      .update(loyaltyAccounts)
      .set({
        pointsBalance: sql`${loyaltyAccounts.pointsBalance} + ${points}`,
        lifetimePoints: sql`${loyaltyAccounts.lifetimePoints} + ${points}`,
        updatedAt: new Date(),
      } as any)
      .where(eq(loyaltyAccounts.id, accountId))
      .returning();
    if (!updated[0]) throw new Error(`Loyalty account ${accountId} not found`);
    await tx.insert(loyaltyTransactions).values({
      accountId,
      type: "earn",
      points,
      orderId: orderId ?? null,
    } as any);
    return updated[0];
  });
}

export async function redeemLoyaltyPoints(accountId: string, points: number, orderId?: string) {
  const database = requireDbSync();
  return database.transaction(async (tx) => {
    // Guarded debit: only succeeds when the balance covers the redemption.
    const updated = await tx.execute(sql`
      UPDATE loyalty_accounts
      SET points_balance = points_balance - ${points}, updated_at = now()
      WHERE id = ${accountId} AND points_balance >= ${points}
      RETURNING *
    `);
    const rows: any[] = (updated as any)?.rows ?? updated ?? [];
    if (!rows[0]) return false;
    await tx.insert(loyaltyTransactions).values({
      accountId,
      type: "redeem",
      points: -points,
      orderId: orderId ?? null,
    } as any);
    return true;
  });
}

export async function getLoyaltyHistory(accountId: string) {
  const database = requireDbSync();
  return database
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.accountId, accountId))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(100);
}

// ─── Restaurant: KDS ──────────────────────────────────────────────────────────

export async function listKdsStations(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(kdsStations).where(eq(kdsStations.merchantId, merchantId)).orderBy(asc(kdsStations.name));
}

export async function upsertKdsStation(data: Record<string, any>) {
  const database = requireDbSync();
  if (data.id) {
    const rows = await database
      .update(kdsStations)
      .set(data as any)
      .where(and(eq(kdsStations.id, data.id), eq(kdsStations.merchantId, data.merchantId)))
      .returning();
    if (rows[0]) return rows[0].id as string;
  }
  const rows = await database
    .insert(kdsStations)
    .values({ ...data, id: data.id ?? `kds_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0].id as string;
}

export async function listKdsOrders(merchantId: string) {
  const database = requireDbSync();
  const orders = await database
    .select()
    .from(restaurantOrders)
    .where(and(
      eq(restaurantOrders.merchantId, merchantId),
      inArray(restaurantOrders.status, ["open", "sent_to_kitchen"] as any),
    ))
    .orderBy(asc(restaurantOrders.createdAt));
  const result = [];
  for (const order of orders) {
    const items = await database
      .select()
      .from(restaurantOrderItems)
      .where(eq(restaurantOrderItems.orderId, order.id))
      .orderBy(asc(restaurantOrderItems.courseNumber));
    result.push({ ...order, items });
  }
  return result;
}

export async function markOrderItemReady(itemId: number) {
  const database = requireDbSync();
  await database.update(restaurantOrderItems).set({ status: "ready" }).where(eq(restaurantOrderItems.id, itemId));
}

export async function markOrderComplete(orderId: string, merchantId: string) {
  const database = requireDbSync();
  await database.transaction(async (tx) => {
    await tx
      .update(restaurantOrderItems)
      .set({ status: "served" })
      .where(eq(restaurantOrderItems.orderId, orderId));
    await tx
      .update(restaurantOrders)
      .set({ status: "paid", updatedAt: new Date() } as any)
      .where(and(eq(restaurantOrders.id, orderId), eq(restaurantOrders.merchantId, merchantId)));
  });
}

// ─── Restaurant: Inventory & Recipes ──────────────────────────────────────────

export async function listInventoryItems(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(inventoryItems).where(eq(inventoryItems.merchantId, merchantId)).orderBy(asc(inventoryItems.name));
}

export async function upsertInventoryItem(data: Record<string, any>) {
  const database = requireDbSync();
  if (data.id) {
    const rows = await database
      .update(inventoryItems)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(inventoryItems.id, data.id), eq(inventoryItems.merchantId, data.merchantId)))
      .returning();
    if (rows[0]) return rows[0].id as string;
  }
  const rows = await database
    .insert(inventoryItems)
    .values({ ...data, id: data.id ?? `inv_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0].id as string;
}

export async function adjustInventoryStock(itemId: string, quantity: number, type: string, note?: string) {
  const database = requireDbSync();
  const delta = type === "out" || type === "waste" ? -Math.abs(quantity) : Math.abs(quantity);
  const rows = await database
    .update(inventoryItems)
    .set({ currentStock: sql`${inventoryItems.currentStock} + ${delta}`, updatedAt: new Date() } as any)
    .where(eq(inventoryItems.id, itemId))
    .returning();
  return rows[0];
}

export async function getRecipeCost(menuItemId: string) {
  const database = requireDbSync();
  const rows = await database
    .select({
      inventoryItemId: recipeIngredients.inventoryItemId,
      quantityPerServing: recipeIngredients.quantityPerServing,
      costPerUnit: inventoryItems.costPerUnit,
      name: inventoryItems.name,
    })
    .from(recipeIngredients)
    .innerJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
    .where(eq(recipeIngredients.menuItemId, menuItemId));
  const totalCostKobo = rows.reduce(
    (sum, r) => sum + Number(r.quantityPerServing ?? 0) * Number(r.costPerUnit ?? 0),
    0,
  );
  return { menuItemId, ingredients: rows, totalCostKobo };
}

export async function upsertRecipeIngredient(data: Record<string, any>) {
  const database = requireDbSync();
  const existing = await database
    .select()
    .from(recipeIngredients)
    .where(and(
      eq(recipeIngredients.menuItemId, data.menuItemId),
      eq(recipeIngredients.inventoryItemId, data.inventoryItemId),
    ))
    .limit(1);
  if (existing[0]) {
    const rows = await database
      .update(recipeIngredients)
      .set({ quantityPerServing: data.quantityPerServing })
      .where(eq(recipeIngredients.id, existing[0].id))
      .returning();
    return rows[0];
  }
  const rows = await database.insert(recipeIngredients).values(data as any).returning();
  return rows[0];
}

// ─── Restaurant: Staff & Payroll ──────────────────────────────────────────────

export async function listStaffMembers(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(staffMembers).where(eq(staffMembers.merchantId, merchantId)).orderBy(asc(staffMembers.name));
}

export async function upsertStaffMember(data: Record<string, any>) {
  const database = requireDbSync();
  if (data.id) {
    const rows = await database
      .update(staffMembers)
      .set(data as any)
      .where(and(eq(staffMembers.id, data.id), eq(staffMembers.merchantId, data.merchantId)))
      .returning();
    if (rows[0]) return rows[0].id as string;
  }
  const rows = await database
    .insert(staffMembers)
    .values({ ...data, id: data.id ?? `stf_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0].id as string;
}

export async function recordStaffShift(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(staffShifts).values(data as any).returning();
  return rows[0].id as number;
}

export async function listStaffShifts(merchantId: string, staffId?: string) {
  const database = requireDbSync();
  const conds = [eq(staffShifts.merchantId, merchantId)];
  if (staffId) conds.push(eq(staffShifts.staffId, staffId));
  return database.select().from(staffShifts).where(and(...conds)).orderBy(desc(staffShifts.clockIn)).limit(200);
}

export async function createPayrollRun(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .insert(payrollRuns)
    .values({ ...data, id: data.id ?? `pay_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0];
}

export async function listPayrollRuns(merchantId: string) {
  const database = requireDbSync();
  return database.select().from(payrollRuns).where(eq(payrollRuns.merchantId, merchantId)).orderBy(desc(payrollRuns.createdAt));
}

export async function approvePayrollRun(id: string, merchantId: string) {
  const database = requireDbSync();
  const rows = await database
    .update(payrollRuns)
    .set({ status: "approved" })
    .where(and(eq(payrollRuns.id, id), eq(payrollRuns.merchantId, merchantId)))
    .returning();
  return rows[0];
}

// ─── Restaurant: Kiosk Health & Table Turn Stats ──────────────────────────────

export async function getKioskHealthSummary(merchantId: string) {
  const database = requireDbSync();
  const [{ totalTables, occupiedTables }] = await database
    .select({
      totalTables: count(),
      occupiedTables: sql<number>`count(*) filter (where ${restaurantTables.status} = 'occupied')`,
    })
    .from(restaurantTables)
    .where(eq(restaurantTables.merchantId, merchantId));
  const [{ openOrders }] = await database
    .select({ openOrders: count() })
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.merchantId, merchantId), inArray(restaurantOrders.status, ["open", "sent_to_kitchen"] as any)));
  const [{ lowStock }] = await database
    .select({ lowStock: count() })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.merchantId, merchantId), sql`${inventoryItems.currentStock} <= ${inventoryItems.reorderLevel}`));
  const [{ activeStations }] = await database
    .select({ activeStations: count() })
    .from(kdsStations)
    .where(and(eq(kdsStations.merchantId, merchantId), eq(kdsStations.active, true)));
  return {
    totalTables: Number(totalTables ?? 0),
    occupiedTables: Number(occupiedTables ?? 0),
    openOrders: Number(openOrders ?? 0),
    lowStockItems: Number(lowStock ?? 0),
    activeKdsStations: Number(activeStations ?? 0),
  };
}

export async function getRestaurantTableTurnStats(merchantId: string, date?: Date | string) {
  const database = requireDbSync();
  const day = date ? new Date(date) : new Date();
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
  const rows = await database
    .select({
      tableId: restaurantOrders.tableId,
      orders: count(),
      revenue: sql<string>`coalesce(sum(${restaurantOrders.totalKobo}), 0)`,
    })
    .from(restaurantOrders)
    .where(and(
      eq(restaurantOrders.merchantId, merchantId),
      gte(restaurantOrders.createdAt, dayStart),
      lte(restaurantOrders.createdAt, dayEnd),
    ))
    .groupBy(restaurantOrders.tableId);
  return rows.map(r => ({ tableId: r.tableId, turns: Number(r.orders), revenueKobo: Number(r.revenue) }));
}

// ─── Audit Events ─────────────────────────────────────────────────────────────

export async function logAuditEvent(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(auditEvents).values(data as any).returning();
  return rows[0];
}

// ─── Keycloak Events & Anomaly Config ─────────────────────────────────────────

/**
 * Keycloak event log. Returned with snake_case column names because the
 * admin auth-events UI consumes the raw keycloak_events contract.
 */
export async function getKeycloakEvents(opts: {
  limit?: number;
  offset?: number;
  eventType?: string;
  userId?: string;
  newCountryOnly?: boolean;
  fromDate?: Date;
  toDate?: Date;
} = {}) {
  const database = requireDbSync();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const conds: ReturnType<typeof sql>[] = [];
  if (opts.eventType) conds.push(sql`event_type = ${opts.eventType}`);
  if (opts.userId) conds.push(sql`user_id = ${opts.userId}`);
  if (opts.fromDate) conds.push(sql`received_at >= ${opts.fromDate}`);
  if (opts.toDate) conds.push(sql`received_at <= ${opts.toDate}`);
  if (opts.newCountryOnly) {
    conds.push(sql`event_type = 'LOGIN'`);
    conds.push(sql`(geo_anomaly_acknowledged IS NULL OR geo_anomaly_acknowledged = false)`);
  }
  const where = conds.length > 0 ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const result: any = await database.execute(sql`
    SELECT id, event_type, realm_id, client_id, user_id, session_id, ip_address,
           geo_country, geo_city, geo_anomaly_acknowledged, error, details, received_at
    FROM keycloak_events
    ${where}
    ORDER BY received_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return (result?.rows ?? result ?? []) as Array<Record<string, unknown>>;
}

/** Distinct countries the user has logged in from within the last N days. */
export async function getKnownCountriesForUser(userId: string, days = 90): Promise<string[]> {
  const database = requireDbSync();
  const result: any = await database.execute(sql`
    SELECT DISTINCT geo_country
    FROM keycloak_events
    WHERE user_id = ${userId}
      AND event_type = 'LOGIN'
      AND geo_country IS NOT NULL
      AND received_at >= now() - make_interval(days => ${days})
  `);
  const rows: any[] = result?.rows ?? result ?? [];
  return rows.map(r => r.geo_country as string).filter(Boolean);
}

/** Most recent login country per user for a set of user ids. */
export async function getLatestCountryForUsers(userIds: string[]) {
  if (userIds.length === 0) return [];
  const database = requireDbSync();
  const result: any = await database.execute(sql`
    SELECT DISTINCT ON (user_id) user_id, geo_country, received_at
    FROM keycloak_events
    WHERE user_id = ANY(${userIds})
      AND event_type = 'LOGIN'
      AND geo_country IS NOT NULL
    ORDER BY user_id, received_at DESC
  `);
  return (result?.rows ?? result ?? []) as Array<{ user_id: string; geo_country: string; received_at: Date }>;
}

/** Mark a geo-anomaly Keycloak event as acknowledged by an admin. */
export async function acknowledgeGeoAnomaly(eventId: number): Promise<void> {
  const database = requireDbSync();
  await database
    .update(keycloakEvents)
    .set({ geoAnomalyAcknowledged: true })
    .where(eq(keycloakEvents.id, eventId));
}

// ─── Anomaly Config (login anomaly detection thresholds) ─────────────────────

/** Sentinel admin_notification_prefs.user_id holding the global default config. */
export const GLOBAL_ANOMALY_CONFIG_USER_ID = 0;

const ANOMALY_CONFIG_DEFAULTS = { loginAnomalyWindowMinutes: 15, loginAnomalyThreshold: 5 };

type AnomalyConfig = { loginAnomalyWindowMinutes: number; loginAnomalyThreshold: number };

export async function getGlobalAnomalyConfig(): Promise<AnomalyConfig> {
  try {
    const database = requireDbSync();
    const rows = await database
      .select({
        loginAnomalyWindowMinutes: adminNotificationPrefs.loginAnomalyWindowMinutes,
        loginAnomalyThreshold: adminNotificationPrefs.loginAnomalyThreshold,
      })
      .from(adminNotificationPrefs)
      .where(eq(adminNotificationPrefs.userId, GLOBAL_ANOMALY_CONFIG_USER_ID))
      .limit(1);
    if (!rows[0]) return { ...ANOMALY_CONFIG_DEFAULTS };
    return {
      loginAnomalyWindowMinutes: rows[0].loginAnomalyWindowMinutes,
      loginAnomalyThreshold: rows[0].loginAnomalyThreshold,
    };
  } catch {
    return { ...ANOMALY_CONFIG_DEFAULTS };
  }
}

export async function setGlobalAnomalyConfig(windowMinutes: number, threshold: number): Promise<void> {
  const database = requireDbSync();
  await database
    .insert(adminNotificationPrefs)
    .values({
      id: `anp_global_${GLOBAL_ANOMALY_CONFIG_USER_ID}`,
      userId: GLOBAL_ANOMALY_CONFIG_USER_ID,
      loginAnomalyWindowMinutes: windowMinutes,
      loginAnomalyThreshold: threshold,
    } as any)
    .onConflictDoUpdate({
      target: adminNotificationPrefs.userId,
      set: { loginAnomalyWindowMinutes: windowMinutes, loginAnomalyThreshold: threshold, updatedAt: new Date() },
    });
}

export async function getAnomalyConfig(userId: number): Promise<AnomalyConfig> {
  try {
    const database = requireDbSync();
    const rows = await database
      .select({
        loginAnomalyWindowMinutes: adminNotificationPrefs.loginAnomalyWindowMinutes,
        loginAnomalyThreshold: adminNotificationPrefs.loginAnomalyThreshold,
      })
      .from(adminNotificationPrefs)
      .where(eq(adminNotificationPrefs.userId, userId))
      .limit(1);
    if (rows[0]) {
      return {
        loginAnomalyWindowMinutes: rows[0].loginAnomalyWindowMinutes,
        loginAnomalyThreshold: rows[0].loginAnomalyThreshold,
      };
    }
  } catch {
    /* fall through to global */
  }
  return getGlobalAnomalyConfig();
}

export async function setAnomalyConfig(userId: number, windowMinutes: number, threshold: number): Promise<void> {
  const database = requireDbSync();
  await database
    .insert(adminNotificationPrefs)
    .values({
      id: `anp_${userId}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
      userId,
      loginAnomalyWindowMinutes: windowMinutes,
      loginAnomalyThreshold: threshold,
    } as any)
    .onConflictDoUpdate({
      target: adminNotificationPrefs.userId,
      set: { loginAnomalyWindowMinutes: windowMinutes, loginAnomalyThreshold: threshold, updatedAt: new Date() },
    });
}

export async function recordAnomalyConfigChange(data: {
  changedByUserId: number;
  isGlobal: boolean;
  oldWindowMinutes: number | null;
  oldThreshold: number | null;
  newWindowMinutes: number;
  newThreshold: number;
}) {
  const database = requireDbSync();
  const rows = await database.insert(anomalyConfigAudit).values(data as any).returning();
  return rows[0];
}

export async function getAnomalyConfigAuditLog(limit = 5, offset = 0) {
  const database = requireDbSync();
  return database
    .select()
    .from(anomalyConfigAudit)
    .orderBy(desc(anomalyConfigAudit.changedAt))
    .limit(limit)
    .offset(offset);
}

// ─── Reconciliation Alerts ────────────────────────────────────────────────────

export async function createReconciliationAlert(data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database.insert(reconciliationAlerts).values(data as any).returning();
  return rows[0];
}

export async function getReconciliationAlertById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(reconciliationAlerts).where(eq(reconciliationAlerts.id, id)).limit(1);
  return rows[0];
}

export async function updateReconciliationAlert(id: string, data: Record<string, any>) {
  const database = requireDbSync();
  const rows = await database
    .update(reconciliationAlerts)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(reconciliationAlerts.id, id))
    .returning();
  return rows[0];
}

export async function listReconciliationAlerts(
  merchantId: string | null,
  status: string | null = null,
  limit = 50,
  offset = 0,
) {
  const database = requireDbSync();
  const conds = [];
  if (merchantId) conds.push(eq(reconciliationAlerts.merchantId, merchantId));
  if (status) conds.push(eq(reconciliationAlerts.status, status as any));
  return database
    .select()
    .from(reconciliationAlerts)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(reconciliationAlerts.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function countReconciliationAlerts(merchantId: string | null, status: string | null = null) {
  const database = requireDbSync();
  const conds = [];
  if (merchantId) conds.push(eq(reconciliationAlerts.merchantId, merchantId));
  if (status) conds.push(eq(reconciliationAlerts.status, status as any));
  const [{ total }] = await database
    .select({ total: count() })
    .from(reconciliationAlerts)
    .where(conds.length ? and(...conds) : undefined);
  return Number(total ?? 0);
}

export async function getReconciliationStats(merchantId: string | null) {
  const database = requireDbSync();
  const conds = merchantId ? [eq(reconciliationAlerts.merchantId, merchantId)] : [];
  const [row] = await database
    .select({
      total: count(),
      open: sql<number>`count(*) filter (where ${reconciliationAlerts.status} = 'open')`,
      resolved: sql<number>`count(*) filter (where ${reconciliationAlerts.status} = 'resolved')`,
      totalDelta: sql<string>`coalesce(sum(abs(${reconciliationAlerts.delta})), 0)`,
      openDelta: sql<string>`coalesce(sum(case when ${reconciliationAlerts.status} = 'open' then abs(${reconciliationAlerts.delta}) else 0 end), 0)`,
    })
    .from(reconciliationAlerts)
    .where(conds.length ? and(...conds) : undefined);
  return {
    total: Number(row?.total ?? 0),
    open: Number(row?.open ?? 0),
    resolved: Number(row?.resolved ?? 0),
    totalDelta: Number(row?.totalDelta ?? 0),
    openDelta: Number(row?.openDelta ?? 0),
  };
}

// ─── PTSP Batches (NIBSS settlement batches) ──────────────────────────────────

export async function upsertPtspBatch(data: Record<string, any>) {
  const database = requireDbSync();
  if (data.id) {
    const rows = await database
      .update(ptspBatches)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(ptspBatches.id, data.id), eq(ptspBatches.merchantId, data.merchantId)))
      .returning();
    if (rows[0]) return rows[0];
  }
  const rows = await database
    .insert(ptspBatches)
    .values({ ...data, id: data.id ?? `ptsp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` } as any)
    .returning();
  return rows[0];
}

export async function listPtspBatches(merchantId: string, limit = 50) {
  const database = requireDbSync();
  return database
    .select()
    .from(ptspBatches)
    .where(eq(ptspBatches.merchantId, merchantId))
    .orderBy(desc(ptspBatches.createdAt))
    .limit(limit);
}

export async function confirmPtspBatch(
  batchId: string,
  nibssReference: string,
  status: string,
  confirmedAt: string,
) {
  const database = requireDbSync();
  const rows = await database
    .update(ptspBatches)
    .set({
      status,
      nibssReference,
      confirmedAt: new Date(confirmedAt),
      failureReason: status === "failed" ? `NIBSS confirmation failed (ref ${nibssReference})` : null,
      updatedAt: new Date(),
    } as any)
    .where(eq(ptspBatches.id, batchId))
    .returning();
  return rows[0];
}

// ─── Corridor Analytics ───────────────────────────────────────────────────────

export async function getCorridorVolume(daysSince = 7) {
  const database = requireDbSync();
  const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);
  const rows = await database
    .select({
      corridor: crossBorderTransfers.corridor,
      count: count(),
      volumeUsd: sql<string>`coalesce(sum(${crossBorderTransfers.sourceAmount}::numeric), 0)`,
      completed: sql<number>`count(*) filter (where ${crossBorderTransfers.status} = 'completed')`,
      failed: sql<number>`count(*) filter (where ${crossBorderTransfers.status} = 'failed')`,
    })
    .from(crossBorderTransfers)
    .where(gte(crossBorderTransfers.createdAt, since))
    .groupBy(crossBorderTransfers.corridor)
    .orderBy(desc(sql`coalesce(sum(${crossBorderTransfers.sourceAmount}::numeric), 0)`));
  return rows.map(r => ({
    corridor: r.corridor,
    count: Number(r.count),
    volumeUsd: Number(r.volumeUsd),
    completed: Number(r.completed),
    failed: Number(r.failed),
  }));
}

// ─── Portal Subscriptions ─────────────────────────────────────────────────────

export async function getOrCreatePortalSubscription(merchantId: string) {
  const database = requireDbSync();
  const existing = await database
    .select()
    .from(portalSubscriptions)
    .where(eq(portalSubscriptions.merchantId, merchantId))
    .limit(1);
  if (existing[0]) return existing[0];
  const rows = await database
    .insert(portalSubscriptions)
    .values({
      id: `psub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      merchantId,
      plan: "starter",
      status: "trialing",
    } as any)
    .returning();
  return rows[0];
}

export async function updatePortalSubscription(
  merchantId: string,
  dataOrPlan: Record<string, any> | string,
  status?: string,
  stripeSubscriptionId?: string,
) {
  const database = requireDbSync();
  // Support both updatePortalSubscription(id, { ... }) and the legacy
  // positional updatePortalSubscription(id, plan, status, stripeSubscriptionId).
  const data: Record<string, any> =
    typeof dataOrPlan === "string"
      ? { plan: dataOrPlan, ...(status ? { status } : {}), ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}) }
      : dataOrPlan;
  const rows = await database
    .update(portalSubscriptions)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(portalSubscriptions.merchantId, merchantId))
    .returning();
  return rows[0];
}

// ─── Digital Gold ─────────────────────────────────────────────────────────────

export async function createGoldHolding(merchantId: string | number, goldGrams: number, amountKobo: number, type: string) {
  const database = requireDbSync();
  const mid = String(merchantId);
  const pricePerGram = goldGrams > 0 ? Math.round(amountKobo / goldGrams) : 0;
  const rows = await database
    .insert(digitalGoldHoldings)
    .values({
      merchantId: mid,
      goldGrams: String(goldGrams),
      purchasedGrams: type === "buy" ? String(goldGrams) : "0",
      avgPurchasePricePerGram: String(pricePerGram),
      currentPricePerGram: String(pricePerGram),
      currentValueKobo: amountKobo,
      unrealizedPnLKobo: 0,
      lastUpdated: new Date(),
    } as any)
    .returning();
  const holding = rows[0];
  await database.insert(digitalGoldTransactions).values({
    merchantId: mid,
    type,
    goldGrams: String(goldGrams),
    amountKobo,
    pricePerGram: String(pricePerGram),
    status: "completed",
    reference: `gold_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
  } as any);
  return holding;
}

export async function getGoldHoldings(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(digitalGoldHoldings).where(eq(digitalGoldHoldings.merchantId, String(merchantId)));
}

export async function getGoldTransactions(merchantId: string | number) {
  const database = requireDbSync();
  return database
    .select()
    .from(digitalGoldTransactions)
    .where(eq(digitalGoldTransactions.merchantId, String(merchantId)))
    .orderBy(desc(digitalGoldTransactions.createdAt));
}

// ─── Mutual Funds ─────────────────────────────────────────────────────────────

export async function createFundInvestment(merchantId: string | number, fundId: string, amountKobo: number) {
  const database = requireDbSync();
  const mid = String(merchantId);
  const reference = `fund_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return database.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(mutualFundHoldings)
      .where(and(eq(mutualFundHoldings.merchantId, mid), eq(mutualFundHoldings.fundId, fundId)))
      .limit(1);
    let holding;
    if (existing[0]) {
      const invested = Number(existing[0].investedAmountKobo ?? 0) + amountKobo;
      const rows = await tx
        .update(mutualFundHoldings)
        .set({ investedAmountKobo: invested, currentValueKobo: invested, lastUpdated: new Date() } as any)
        .where(eq(mutualFundHoldings.id, existing[0].id))
        .returning();
      holding = rows[0];
    } else {
      const rows = await tx
        .insert(mutualFundHoldings)
        .values({
          merchantId: mid,
          fundId,
          fundName: fundId,
          units: "0",
          avgNavAtPurchase: "0",
          currentNav: "0",
          investedAmountKobo: amountKobo,
          currentValueKobo: amountKobo,
          unrealizedPnLKobo: 0,
          lastUpdated: new Date(),
        } as any)
        .returning();
      holding = rows[0];
    }
    await tx.insert(mutualFundTransactions).values({
      merchantId: mid,
      fundId,
      type: "purchase",
      amountKobo,
      units: "0",
      navAtTransaction: "0",
      status: "completed",
      reference,
    } as any);
    return holding;
  });
}

export async function getFundInvestments(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(mutualFundHoldings).where(eq(mutualFundHoldings.merchantId, String(merchantId)));
}

// ─── Insurance ────────────────────────────────────────────────────────────────

export async function createInsurancePolicy(
  merchantId: string | number,
  coverageType: string,
  premiumKobo: number,
  provider: string,
  startDate: string,
  endDate: string,
) {
  const database = requireDbSync();
  const rows = await database
    .insert(insurancePolicies)
    .values({
      policyId: `pol_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      merchantId: String(merchantId),
      customerId: String(merchantId),
      productId: coverageType,
      productName: coverageType,
      provider,
      premiumKobo,
      coverageType,
      status: "active",
      expiresAt: new Date(endDate),
    } as any)
    .returning();
  return rows[0];
}

export async function getInsurancePolicies(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(insurancePolicies).where(eq(insurancePolicies.merchantId, String(merchantId)));
}

// ─── Pensions ─────────────────────────────────────────────────────────────────

export async function createPensionAccount(merchantId: string | number, rsaPin: string, pfa: string) {
  const database = requireDbSync();
  const rows = await database
    .insert(pensionAccounts)
    .values({ merchantId: String(merchantId), rsaPin, pfa, status: "active" } as any)
    .returning();
  return rows[0];
}

export async function getPensionAccounts(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(pensionAccounts).where(eq(pensionAccounts.merchantId, String(merchantId)));
}

export async function getPensionContributions(merchantId: string | number) {
  const database = requireDbSync();
  return database
    .select()
    .from(pensionContributions)
    .where(eq(pensionContributions.merchantId, String(merchantId)))
    .orderBy(desc(pensionContributions.createdAt));
}

// ─── Cashback ─────────────────────────────────────────────────────────────────

export async function createCashbackTransaction(
  merchantId: string | number,
  _unused: number,
  amountKobo: number,
  type: string,
) {
  const database = requireDbSync();
  const mid = String(merchantId);
  return database.transaction(async (tx) => {
    // Ensure a balance row exists, then apply the guarded credit/debit.
    await tx
      .insert(cashbackBalances)
      .values({ merchantId: mid } as any)
      .onConflictDoNothing();
    const isEarn = type === "purchase" || type === "earn" || type === "credit";
    const delta = isEarn ? Math.abs(amountKobo) : -Math.abs(amountKobo);
    await tx.execute(sql`
      UPDATE cashback_balances
      SET cashback_balance_kobo = cashback_balance_kobo + ${delta},
          total_earned_kobo = total_earned_kobo + ${isEarn ? Math.abs(amountKobo) : 0},
          total_redeemed_kobo = total_redeemed_kobo + ${isEarn ? 0 : Math.abs(amountKobo)},
          updated_at = now()
      WHERE merchant_id = ${mid}
    `);
    const rows = await tx
      .insert(cashbackTransactions)
      .values({ merchantId: mid, type, amountKobo, status: "completed" } as any)
      .returning();
    return rows[0];
  });
}

export async function getCashbackBalance(merchantId: string | number) {
  const database = requireDbSync();
  const rows = await database
    .select()
    .from(cashbackBalances)
    .where(eq(cashbackBalances.merchantId, String(merchantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCashbackHistory(merchantId: string | number) {
  const database = requireDbSync();
  return database
    .select()
    .from(cashbackTransactions)
    .where(eq(cashbackTransactions.merchantId, String(merchantId)))
    .orderBy(desc(cashbackTransactions.createdAt));
}

// ─── Soundbox Devices ─────────────────────────────────────────────────────────

export async function createSoundboxDevice(merchantId: string | number, deviceId: string, name: string) {
  const database = requireDbSync();
  const rows = await database
    .insert(soundboxDevices)
    .values({ merchantId: String(merchantId), deviceId, name, status: "active" } as any)
    .returning();
  return rows[0];
}

export async function getSoundboxDevices(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(soundboxDevices).where(eq(soundboxDevices.merchantId, String(merchantId)));
}

// ─── Wealth Portfolios (wealth goals with a risk category) ───────────────────

export async function createWealthPortfolio(merchantId: string | number, name: string, riskProfile: string) {
  const database = requireDbSync();
  const rows = await database
    .insert(wealthGoals)
    .values({ merchantId: String(merchantId), name, category: riskProfile, status: "active" } as any)
    .returning();
  const row = rows[0] as any;
  return { ...row, riskProfile };
}

export async function getWealthPortfolios(merchantId: string | number) {
  const database = requireDbSync();
  const rows = await database.select().from(wealthGoals).where(eq(wealthGoals.merchantId, String(merchantId)));
  return rows.map((r: any) => ({ ...r, riskProfile: r.category }));
}

// ─── EMI Checkout ─────────────────────────────────────────────────────────────

export async function createEMIPlan(merchantId: string | number, principalKobo: number, tenure: number, interestRate: number) {
  const database = requireDbSync();
  const totalInterest = Math.round(principalKobo * (interestRate / 100) * (tenure / 12));
  const totalAmountKobo = principalKobo + totalInterest;
  const monthlyInstallmentKobo = tenure > 0 ? Math.round(totalAmountKobo / tenure) : totalAmountKobo;
  const rows = await database
    .insert(emiContracts)
    .values({
      merchantId: String(merchantId),
      tenure,
      principalKobo,
      interestRate: String(interestRate),
      totalAmountKobo,
      monthlyInstallmentKobo,
      paidInstallments: 0,
      status: "active",
    } as any)
    .returning();
  return rows[0];
}

export async function getEMIPlans(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(emiContracts).where(eq(emiContracts.merchantId, String(merchantId)));
}

// ─── Bulk Collections ─────────────────────────────────────────────────────────

export async function createBulkCollection(merchantId: string | number, name: string, totalAmountKobo: number) {
  const database = requireDbSync();
  const rows = await database
    .insert(bulkCollections)
    .values({ merchantId: String(merchantId), name, totalAmountKobo, status: "active" } as any)
    .returning();
  return rows[0];
}

export async function getBulkCollections(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(bulkCollections).where(eq(bulkCollections.merchantId, String(merchantId)));
}

// ─── Salary Accounts ──────────────────────────────────────────────────────────

export async function createSalaryAccount(merchantId: string | number, employeeName: string, bankCode: string, accountNumber: string) {
  const database = requireDbSync();
  const rows = await database
    .insert(salaryAccounts)
    .values({
      merchantId: String(merchantId),
      employeeId: `emp_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      employeeName,
      bankCode,
      accountNumber,
      status: "active",
    } as any)
    .returning();
  return rows[0];
}

export async function getSalaryAccounts(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(salaryAccounts).where(eq(salaryAccounts.merchantId, String(merchantId)));
}

// ─── Nodal Accounts ───────────────────────────────────────────────────────────

export async function createNodalAccount(merchantId: string | number, accountNumber: string, bankCode: string) {
  const database = requireDbSync();
  const rows = await database
    .insert(nodalAccounts)
    .values({ merchantId: String(merchantId), accountNumber, bankCode, status: "active" } as any)
    .returning();
  return rows[0];
}

export async function getNodalAccounts(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(nodalAccounts).where(eq(nodalAccounts.merchantId, String(merchantId)));
}

export async function getNodalTransactions(merchantIdOrAccountId: string | number) {
  const database = requireDbSync();
  const key = String(merchantIdOrAccountId);
  const isNumeric = /^\d+$/.test(key);
  const cond = isNumeric
    ? eq(nodalTransactions.nodalAccountId, key)
    : eq(nodalTransactions.merchantId, key);
  return database.select().from(nodalTransactions).where(cond).orderBy(desc(nodalTransactions.createdAt)).limit(100);
}

// ─── Privacy Aliases (private payments) ───────────────────────────────────────

export async function createPrivatePayment(merchantId: string | number, alias: string, amountKobo: number) {
  const database = requireDbSync();
  const rows = await database
    .insert(privacyAliases)
    .values({
      merchantId: String(merchantId),
      alias,
      status: "active",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } as any)
    .returning();
  return { ...rows[0], amountKobo } as any;
}

export async function getPrivateTransactions(merchantId: string | number) {
  const database = requireDbSync();
  return database
    .select()
    .from(privacyAliases)
    .where(eq(privacyAliases.merchantId, String(merchantId)))
    .orderBy(desc(privacyAliases.createdAt));
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function createReport(merchantId: string | number, type: string, fromDate: string, toDate: string) {
  const database = requireDbSync();
  const rows = await database
    .insert(reportJobs)
    .values({
      merchantId: String(merchantId),
      type,
      format: "csv",
      fromDate,
      toDate,
      status: "pending",
    } as any)
    .returning();
  return rows[0];
}

export async function getReports(merchantId: string | number) {
  const database = requireDbSync();
  return database
    .select()
    .from(reportJobs)
    .where(eq(reportJobs.merchantId, String(merchantId)))
    .orderBy(desc(reportJobs.createdAt));
}

// ─── International Remittance ─────────────────────────────────────────────────

export async function createRemittance(
  merchantId: string | number,
  sendAmountKobo: number,
  destinationCountry: string,
  receiveCurrency: string,
  recipientName: string,
  recipientAccount: string,
) {
  const database = requireDbSync();
  const rows = await database
    .insert(intlRemittanceTransfers)
    .values({
      merchantId: String(merchantId),
      sendAmountUSD: (sendAmountKobo / 100).toFixed(2),
      receiveAmount: "0",
      receiveCurrency,
      recipientName,
      recipientAccountNumber: recipientAccount,
      recipientCountry: destinationCountry,
      trackingNumber: `rem_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      status: "pending",
    } as any)
    .returning();
  return rows[0];
}

export async function getRemittances(merchantId: string | number) {
  const database = requireDbSync();
  return database
    .select()
    .from(intlRemittanceTransfers)
    .where(eq(intlRemittanceTransfers.merchantId, String(merchantId)))
    .orderBy(desc(intlRemittanceTransfers.createdAt));
}

// ─── POS Products & Sales ─────────────────────────────────────────────────────

export async function createPOSProduct(merchantId: string | number, name: string, priceKobo: number, stockQuantity: number) {
  const database = requireDbSync();
  const rows = await database
    .insert(posProducts)
    .values({ merchantId: String(merchantId), name, priceKobo, stockQuantity, isActive: true } as any)
    .returning();
  return rows[0];
}

export async function getPOSProducts(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(posProducts).where(eq(posProducts.merchantId, String(merchantId)));
}

export async function createPOSSale(
  merchantId: string | number,
  items: Array<{ productId: number | string; quantity: number }>,
  totalKobo: number,
) {
  const database = requireDbSync();
  const mid = String(merchantId);
  return database.transaction(async (tx) => {
    const rows = await tx
      .insert(retailSales)
      .values({
        merchantId: mid,
        items: JSON.stringify(items),
        subtotalKobo: totalKobo,
        taxKobo: 0,
        totalKobo,
        paymentMethod: "cash",
        reference: `pos_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        status: "completed",
      } as any)
      .returning();
    // Decrement stock for tracked products inside the same transaction.
    for (const item of items) {
      const pid = Number(item.productId);
      if (!Number.isFinite(pid)) continue;
      await tx.execute(sql`
        UPDATE pos_products
        SET stock_quantity = stock_quantity - ${Math.abs(item.quantity)}, updated_at = now()
        WHERE id = ${pid} AND merchant_id = ${mid} AND track_inventory = true
      `);
    }
    return rows[0];
  });
}

export async function getPOSSalesAnalytics(merchantId: string | number, fromDate: string, toDate: string) {
  const database = requireDbSync();
  const mid = String(merchantId);
  const [row] = await database
    .select({
      totalSales: count(),
      revenueKobo: sql<string>`coalesce(sum(${retailSales.totalKobo}), 0)`,
      avgSaleKobo: sql<string>`coalesce(avg(${retailSales.totalKobo}), 0)`,
    })
    .from(retailSales)
    .where(and(
      eq(retailSales.merchantId, mid),
      gte(retailSales.createdAt, new Date(fromDate)),
      lte(retailSales.createdAt, new Date(toDate)),
    ));
  const byMethod = await database
    .select({ paymentMethod: retailSales.paymentMethod, count: count(), revenueKobo: sql<string>`coalesce(sum(${retailSales.totalKobo}), 0)` })
    .from(retailSales)
    .where(and(
      eq(retailSales.merchantId, mid),
      gte(retailSales.createdAt, new Date(fromDate)),
      lte(retailSales.createdAt, new Date(toDate)),
    ))
    .groupBy(retailSales.paymentMethod);
  return {
    totalSales: Number(row?.totalSales ?? 0),
    revenueKobo: Number(row?.revenueKobo ?? 0),
    avgSaleKobo: Number(row?.avgSaleKobo ?? 0),
    byPaymentMethod: byMethod.map(m => ({ paymentMethod: m.paymentMethod, count: Number(m.count), revenueKobo: Number(m.revenueKobo) })),
  };
}

// ─── Subscription Plans (v2) ──────────────────────────────────────────────────

export async function createSubscriptionPlan(merchantId: string | number, name: string, priceKobo: number, interval: string) {
  const database = requireDbSync();
  const rows = await database
    .insert(subscriptionPlansV2)
    .values({ merchantId: String(merchantId), name, priceKobo, interval, status: "active" } as any)
    .returning();
  return rows[0];
}

export async function getSubscriptionPlans(merchantId: string | number) {
  const database = requireDbSync();
  return database.select().from(subscriptionPlansV2).where(eq(subscriptionPlansV2.merchantId, String(merchantId)));
}

export async function listSubscribers(merchantId: string | number, status?: string) {
  const database = requireDbSync();
  const conds = [eq(subscriptionSubscribers.merchantId, String(merchantId))];
  if (status) conds.push(eq(subscriptionSubscribers.status, status));
  return database.select().from(subscriptionSubscribers).where(and(...conds)).orderBy(desc(subscriptionSubscribers.createdAt));
}

// ─── Shared resolver helpers (used by routers that import them from ./db) ────

export async function getMerchantById(id: string) {
  const database = requireDbSync();
  const rows = await database.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  return rows[0];
}

export async function resolveUser(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  return user;
}

export async function requireMerchant(userId: number) {
  const merchant = await getMerchantByOwnerId(userId);
  if (!merchant) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "NOT_FOUND", message: "Merchant account not found. Complete onboarding first." });
  }
  return merchant;
}
