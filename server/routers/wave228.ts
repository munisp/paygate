/**
 * Wave 228 — Corridor Live Stats (enhanced) + Multi-Currency Ledger Drill-Down
 *
 * Procedures:
 * - corridorLiveV2.getRates        — live FX rates for all active corridors (30s TTL)
 * - corridorLiveV2.getRateHistory  — 24h sparkline history for a currency pair
 * - corridorLiveV2.getVolumeHeatmap — 7-day volume heatmap matrix (source × dest)
 * - corridorLiveV2.getCorridorDetail — single corridor KPIs + recent transactions
 * - ledgerDrillDown.getAccounts    — multi-currency account balances for the caller
 * - ledgerDrillDown.getEntries     — paginated ledger entries with optional currency filter
 * - ledgerDrillDown.getFxSnapshot  — latest FX rates from fxRates table
 * - ledgerDrillDown.getAccountSummary — per-currency P&L summary (credits vs debits)
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  fxRates,
  tenantCorridors,
  multiCurrencyLedgerAccounts,
  multiCurrencyLedgerEntries,
  transactions,
} from "../../drizzle/schema";
import { eq, desc, and, gte, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Major currency pairs tracked for live display */
const MAJOR_PAIRS = [
  { source: "NGN", target: "USD" },
  { source: "NGN", target: "GBP" },
  { source: "NGN", target: "EUR" },
  { source: "NGN", target: "KES" },
  { source: "NGN", target: "GHS" },
  { source: "NGN", target: "ZAR" },
  { source: "USD", target: "NGN" },
  { source: "GBP", target: "NGN" },
];

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

// ─── Corridor Live V2 Router ──────────────────────────────────────────────────

export const corridorLiveV2Router = router({
  /**
   * Get live FX rates for all active corridors.
   * Merges tenantCorridors config with latest fxRates snapshot.
   */
  getRates: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = input.tenantId ?? ctx.user.tenantId ?? "platform";

      // Fetch tenant corridors
      const corridors = await db
        .select()
        .from(tenantCorridors)
        .where(eq(tenantCorridors.tenantId, tenantId));

      // Fetch latest FX rates (most recent per pair)
      const latestRates = await db.execute(sql`
        SELECT DISTINCT ON (base_currency, target_currency)
          base_currency, target_currency, rate, fetched_at, source
        FROM fx_rates
        ORDER BY base_currency, target_currency, fetched_at DESC
      `);
      const rateRows = (latestRates as any).rows ?? latestRates;
      const rateMap: Record<string, { rate: number; fetchedAt: Date; source: string }> = {};
      for (const r of rateRows) {
        rateMap[`${r.base_currency}/${r.target_currency}`] = {
          rate: parseFloat(r.rate),
          fetchedAt: new Date(r.fetched_at),
          source: r.source,
        };
      }

      // Build enriched corridor list
      const enriched = corridors.map((c) => {
        const key = `${c.sourceCurrency}/${c.destCurrency}`;
        const reverseKey = `${c.destCurrency}/${c.sourceCurrency}`;
        const rateEntry = rateMap[key] ?? rateMap[reverseKey];
        const rate = rateEntry
          ? rateMap[key]
            ? rateEntry.rate
            : 1 / rateEntry.rate
          : null;
        const effectiveRate = rate ? rate * (1 + c.fxMarkupPct / 100) : null;
        return {
          id: c.id,
          sourceCurrency: c.sourceCurrency,
          destCurrency: c.destCurrency,
          isEnabled: c.isEnabled,
          fxMarkupPct: c.fxMarkupPct,
          dailyLimitUsd: c.dailyLimitUsd,
          minAmountUsd: c.minAmountUsd,
          maxAmountUsd: c.maxAmountUsd,
          midRate: rate,
          effectiveRate,
          rateSource: rateEntry?.source ?? null,
          rateAge: rateEntry ? Math.floor((Date.now() - rateEntry.fetchedAt.getTime()) / 1000) : null,
        };
      });

      // Also include major pairs not yet in corridors (for display)
      const existingPairs = new Set(corridors.map((c) => `${c.sourceCurrency}/${c.destCurrency}`));
      const majorRates = MAJOR_PAIRS
        .filter((p) => !existingPairs.has(`${p.source}/${p.target}`))
        .map((p) => {
          const key = `${p.source}/${p.target}`;
          const reverseKey = `${p.target}/${p.source}`;
          const rateEntry = rateMap[key] ?? rateMap[reverseKey];
          const rate = rateEntry
            ? rateMap[key]
              ? rateEntry.rate
              : 1 / rateEntry.rate
            : null;
          return {
            id: null,
            sourceCurrency: p.source,
            destCurrency: p.target,
            isEnabled: false,
            fxMarkupPct: 0,
            dailyLimitUsd: 0,
            minAmountUsd: 0,
            maxAmountUsd: 0,
            midRate: rate,
            effectiveRate: rate,
            rateSource: rateEntry?.source ?? null,
            rateAge: rateEntry ? Math.floor((Date.now() - rateEntry.fetchedAt.getTime()) / 1000) : null,
          };
        });

      return {
        corridors: enriched,
        majorRates,
        fetchedAt: new Date(),
      };
    }),

  /**
   * Get 24-hour sparkline history for a currency pair.
   * Returns up to 48 data points (one per 30 minutes).
   */
  getRateHistory: protectedProcedure
    .input(z.object({
      baseCurrency: z.string().length(3).toUpperCase(),
      targetCurrency: z.string().length(3).toUpperCase(),
      hours: z.number().min(1).max(168).default(24),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const since = new Date(Date.now() - input.hours * 3600 * 1000);

      const rows = await db
        .select({
          rate: fxRates.rate,
          fetchedAt: fxRates.fetchedAt,
          source: fxRates.source,
        })
        .from(fxRates)
        .where(
          and(
            eq(fxRates.baseCurrency, input.baseCurrency),
            eq(fxRates.targetCurrency, input.targetCurrency),
            gte(fxRates.fetchedAt, since),
          ),
        )
        .orderBy(fxRates.fetchedAt)
        .limit(200);

      if (rows.length === 0) {
        return { pair: `${input.baseCurrency}/${input.targetCurrency}`, points: [], stats: null };
      }

      const points = rows.map((r) => ({
        ts: r.fetchedAt.toISOString(),
        rate: parseFloat(r.rate),
        source: r.source,
      }));

      const rates = points.map((p) => p.rate);
      const min = Math.min(...rates);
      const max = Math.max(...rates);
      const first = rates[0];
      const last = rates[rates.length - 1];
      const changePct = first > 0 ? ((last - first) / first) * 100 : 0;

      return {
        pair: `${input.baseCurrency}/${input.targetCurrency}`,
        points,
        stats: {
          min,
          max,
          open: first,
          close: last,
          changePct: Math.round(changePct * 10000) / 10000,
          direction: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
        },
      };
    }),

  /**
   * Get a 7-day volume heatmap matrix (source × dest currency).
   * Returns aggregated transaction volume from the transactions table.
   */
  getVolumeHeatmap: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7),
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const since = new Date(Date.now() - input.days * 86400 * 1000);
      const tenantId = input.tenantId ?? ctx.user.tenantId ?? null;

      const result = await db.execute(sql`
        SELECT
          COALESCE(metadata->>'sourceCurrency', currency) AS source_currency,
          COALESCE(metadata->>'destinationCurrency', 'NGN') AS dest_currency,
          COUNT(*) AS tx_count,
          COALESCE(SUM(amount), 0) AS volume_kobo,
          COALESCE(AVG(CAST(metadata->>'fxRate' AS FLOAT)), 0) AS avg_fx_rate
        FROM transactions
        WHERE
          created_at >= ${since}
          AND status = 'completed'
          AND metadata->>'type' = 'cross_border'
          ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
        GROUP BY 1, 2
        ORDER BY volume_kobo DESC
        LIMIT 100
      `);
      const rows = (result as any).rows ?? result;

      // Collect unique currencies
      const sourceCurrencies: string[] = [...new Set<string>(rows.map((r: any) => r.source_currency as string))];
      const destCurrencies: string[] = [...new Set<string>(rows.map((r: any) => r.dest_currency as string))];

      // Build matrix
      const matrix: Record<string, Record<string, { txCount: number; volumeKobo: number; avgFxRate: number }>> = {};
      for (const src of sourceCurrencies) {
        matrix[src] = {};
        for (const dst of destCurrencies) {
          matrix[src][dst] = { txCount: 0, volumeKobo: 0, avgFxRate: 0 };
        }
      }
      for (const r of rows) {
        const src = r.source_currency as string;
        const dst = r.dest_currency as string;
        if (matrix[src]?.[dst] !== undefined) {
          matrix[src][dst] = {
            txCount: Number(r.tx_count),
            volumeKobo: Number(r.volume_kobo),
            avgFxRate: Number(r.avg_fx_rate ?? 0),
          };
        }
      }

      const totalVolumeKobo = rows.reduce((s: number, r: any) => s + Number(r.volume_kobo), 0);
      const totalTxCount = rows.reduce((s: number, r: any) => s + Number(r.tx_count), 0);

      return {
        sourceCurrencies,
        destCurrencies,
        matrix,
        totalVolumeKobo,
        totalTxCount,
        days: input.days,
        generatedAt: new Date(),
      };
    }),

  /**
   * Get detailed KPIs and recent transactions for a single corridor.
   */
  getCorridorDetail: protectedProcedure
    .input(z.object({
      corridorId: z.string(),
      days: z.number().min(1).max(90).default(30),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const [corridor] = await db
        .select()
        .from(tenantCorridors)
        .where(eq(tenantCorridors.id, input.corridorId))
        .limit(1);

      if (!corridor) throw new TRPCError({ code: "NOT_FOUND", message: "Corridor not found" });

      const since = new Date(Date.now() - input.days * 86400 * 1000);

      // Aggregate KPIs
      const kpiResult = await db.execute(sql`
        SELECT
          COUNT(*) AS tx_count,
          COALESCE(SUM(amount), 0) AS volume_kobo,
          COALESCE(AVG(amount), 0) AS avg_amount_kobo,
          COALESCE(AVG(CAST(metadata->>'fxRate' AS FLOAT)), 0) AS avg_fx_rate,
          COALESCE(MAX(amount), 0) AS max_amount_kobo,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
        FROM transactions
        WHERE
          created_at >= ${since}
          AND metadata->>'sourceCurrency' = ${corridor.sourceCurrency}
          AND metadata->>'destinationCurrency' = ${corridor.destCurrency}
      `);
      const kpiRows = (kpiResult as any).rows ?? kpiResult;
      const kpi = kpiRows[0] ?? {};

      // Daily volume trend (last 30 days)
      const trendResult = await db.execute(sql`
        SELECT
          DATE_TRUNC('day', created_at)::date AS day,
          COUNT(*) AS tx_count,
          COALESCE(SUM(amount), 0) AS volume_kobo
        FROM transactions
        WHERE
          created_at >= ${since}
          AND metadata->>'sourceCurrency' = ${corridor.sourceCurrency}
          AND metadata->>'destinationCurrency' = ${corridor.destCurrency}
        GROUP BY 1
        ORDER BY 1
      `);
      const trendRows = (trendResult as any).rows ?? trendResult;

      return {
        corridor,
        kpis: {
          txCount: Number(kpi.tx_count ?? 0),
          volumeKobo: Number(kpi.volume_kobo ?? 0),
          avgAmountKobo: Number(kpi.avg_amount_kobo ?? 0),
          avgFxRate: Number(kpi.avg_fx_rate ?? 0),
          maxAmountKobo: Number(kpi.max_amount_kobo ?? 0),
          failedCount: Number(kpi.failed_count ?? 0),
        },
        trend: trendRows.map((r: any) => ({
          day: String(r.day),
          txCount: Number(r.tx_count),
          volumeKobo: Number(r.volume_kobo),
        })),
        days: input.days,
      };
    }),
});

// ─── Ledger Drill-Down Router ─────────────────────────────────────────────────

export const ledgerDrillDownRouter = router({
  /**
   * Get multi-currency account balances for the authenticated user.
   * Auto-provisions accounts for major currencies if none exist.
   */
  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const merchantId = ctx.user.id.toString();

    let accounts = await db
      .select()
      .from(multiCurrencyLedgerAccounts)
      .where(eq(multiCurrencyLedgerAccounts.merchantId, merchantId))
      .orderBy(multiCurrencyLedgerAccounts.currency);

    if (accounts.length === 0) {
      const currencies = ["NGN", "USD", "GBP", "EUR", "KES", "GHS", "ZAR"];
      const inserted = await db
        .insert(multiCurrencyLedgerAccounts)
        .values(currencies.map((currency) => ({ merchantId, currency })))
        .returning();
      accounts = inserted;
    }

    // Fetch latest FX rates for USD-equivalent conversion
    const latestRates = await db.execute(sql`
      SELECT DISTINCT ON (base_currency, target_currency)
        base_currency, target_currency, rate
      FROM fx_rates
      WHERE base_currency = 'NGN'
      ORDER BY base_currency, target_currency, fetched_at DESC
    `);
    const rateRows = (latestRates as any).rows ?? latestRates;
    const ngnRates: Record<string, number> = { NGN: 1 };
    for (const r of rateRows) {
      ngnRates[r.target_currency] = parseFloat(r.rate);
    }

    return accounts.map((a) => {
      const rate = ngnRates[a.currency] ?? null;
      const balanceNgn = rate ? a.balance / rate : null;
      return {
        ...a,
        balanceNgn,
        fxRate: rate,
      };
    });
  }),

  /**
   * Get paginated ledger entries with optional currency filter.
   */
  getEntries: protectedProcedure
    .input(z.object({
      currency: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      type: z.enum(["credit", "debit"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = ctx.user.id.toString();
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [eq(multiCurrencyLedgerEntries.merchantId, merchantId)];
      if (input.currency) conditions.push(eq(multiCurrencyLedgerEntries.currency, input.currency));
      if (input.type) conditions.push(eq(multiCurrencyLedgerEntries.type, input.type));

      const [entries, countResult] = await Promise.all([
        db
          .select()
          .from(multiCurrencyLedgerEntries)
          .where(and(...conditions))
          .orderBy(desc(multiCurrencyLedgerEntries.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(multiCurrencyLedgerEntries)
          .where(and(...conditions)),
      ]);

      return {
        entries,
        total: Number(countResult[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Get latest FX rates snapshot from the fxRates table.
   */
  getFxSnapshot: protectedProcedure.query(async () => {
    const db = await requireDb();

    const result = await db.execute(sql`
      SELECT DISTINCT ON (base_currency, target_currency)
        base_currency, target_currency, rate, fetched_at, source
      FROM fx_rates
      ORDER BY base_currency, target_currency, fetched_at DESC
    `);
    const rows = (result as any).rows ?? result;

    return rows.map((r: any) => ({
      baseCurrency: r.base_currency as string,
      targetCurrency: r.target_currency as string,
      rate: parseFloat(r.rate),
      fetchedAt: new Date(r.fetched_at),
      source: r.source as string,
    }));
  }),

  /**
   * Per-currency P&L summary — total credits, debits, and net for the caller.
   */
  getAccountSummary: protectedProcedure
    .input(z.object({
      currency: z.string().optional(),
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const merchantId = ctx.user.id.toString();
      const since = new Date(Date.now() - input.days * 86400 * 1000);

      const conditions = [
        eq(multiCurrencyLedgerEntries.merchantId, merchantId),
        gte(multiCurrencyLedgerEntries.createdAt, since),
      ];
      if (input.currency) conditions.push(eq(multiCurrencyLedgerEntries.currency, input.currency));

      const result = await db
        .select({
          currency: multiCurrencyLedgerEntries.currency,
          totalCredits: sql<number>`COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0)`,
          totalDebits: sql<number>`COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)`,
          txCount: sql<number>`COUNT(*)`,
        })
        .from(multiCurrencyLedgerEntries)
        .where(and(...conditions))
        .groupBy(multiCurrencyLedgerEntries.currency)
        .orderBy(multiCurrencyLedgerEntries.currency);

      return result.map((r) => ({
        currency: r.currency,
        totalCredits: Number(r.totalCredits),
        totalDebits: Number(r.totalDebits),
        net: Number(r.totalCredits) - Number(r.totalDebits),
        txCount: Number(r.txCount),
      }));
    }),
});
