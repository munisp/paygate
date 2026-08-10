/**
 * Market Data Router — Live price tickers for Consumer Financial Hub.
 *
 * Provides:
 *   - Gold spot price (XAU/NGN) via public API with 5-minute cache
 *   - Mutual Fund NAV snapshots (simulated from real fund categories)
 *   - FX rates (NGN-based: USD, GBP, EUR, CAD, AUD, GHS, KES, ZAR)
 *   - Market summary (market cap, sentiment, trending assets)
 *
 * All prices are in Kobo (1 NGN = 100 Kobo) for consistency with the rest of the platform.
 */
import { router, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger } from "./logger";

/** Fail loudly — fabricated market data must never be served to consumers. */
function marketDataUnavailable(what: string): never {
  logger.error(`[marketData] FAIL-LOUD: ${what} — no real data source available`);
  throw new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: `${what} is temporarily unavailable.`,
  });
}

// ─── In-memory cache (5-minute TTL) ──────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): T {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

// ─── Gold Spot Price ──────────────────────────────────────────────────────────
// Requires a real metals data provider (METALS_API_KEY for metals-api.com).
// There is NO fallback: when no live quote can be obtained, the query fails
// loudly — a sine-wave "price" must never be shown to consumers.

async function fetchGoldPriceNGN(): Promise<number> {
  const cached = getCached<number>("gold_ngn_per_gram");
  if (cached) return cached;

  const metalsKey = process.env.METALS_API_KEY;
  if (!metalsKey) {
    marketDataUnavailable("Gold spot price feed is not configured (METALS_API_KEY missing)");
  }

  try {
    // Real XAU/USD spot from metals-api.com
    const spotRes = await fetch(
      `https://metals-api.com/api/latest?access_key=${encodeURIComponent(metalsKey!)}&base=USD&symbols=XAU`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!spotRes.ok) marketDataUnavailable(`Gold spot price feed error (HTTP ${spotRes.status})`);
    const spotData = await spotRes.json() as any;
    const xauPerUsd = spotData?.rates?.XAU; // troy oz of gold per 1 USD
    if (!xauPerUsd || typeof xauPerUsd !== "number") {
      marketDataUnavailable("Gold spot price feed returned no XAU rate");
    }
    const goldUsdPerGram = 1 / (xauPerUsd * 31.1035);

    // Real USD/NGN rate
    const fxRes = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(4000) });
    if (!fxRes.ok) marketDataUnavailable(`FX feed error (HTTP ${fxRes.status})`);
    const fxData = await fxRes.json() as any;
    const usdToNgn = fxData?.rates?.NGN;
    if (!usdToNgn || typeof usdToNgn !== "number") {
      marketDataUnavailable("FX feed returned no USD/NGN rate");
    }

    return setCached("gold_ngn_per_gram", Math.round(goldUsdPerGram * usdToNgn));
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    marketDataUnavailable(`Gold spot price feed unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── FX Rates ─────────────────────────────────────────────────────────────────
// Real source: open.er-api.com. NO hardcoded fallback rates — when the feed is
// unavailable the query fails loudly.
const SUPPORTED_FX: string[] = ["USD", "GBP", "EUR", "CAD", "AUD", "GHS", "KES", "ZAR", "CNY", "JPY"];

async function fetchFxRates(): Promise<Record<string, number>> {
  const cached = getCached<Record<string, number>>("fx_ngn");
  if (cached) return cached;

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/NGN", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) marketDataUnavailable(`FX rates feed error (HTTP ${res.status})`);
    const data = await res.json() as any;
    if (!data?.rates) marketDataUnavailable("FX rates feed returned no rates");
    // Convert from NGN-based rates to NGN per foreign currency.
    // Currencies missing from the feed are omitted — never back-filled with
    // a hardcoded "fallback" rate.
    const rates: Record<string, number> = {};
    for (const ccy of SUPPORTED_FX) {
      if (data.rates[ccy]) rates[ccy] = Math.round(1 / (data.rates[ccy] as number));
    }
    if (Object.keys(rates).length === 0) marketDataUnavailable("FX rates feed returned no usable rates");
    return setCached("fx_ngn", rates);
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    marketDataUnavailable(`FX rates feed unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Mutual Fund NAV Snapshots ────────────────────────────────────────────────
// There is no real fund NAV data source integrated in this repo. Invented
// "PayGate fund" NAVs with sine-wave variance must NEVER be served as market
// data — fundNavs fails loudly until a real NAV feed is wired.

function getFundNavs(): never {
  marketDataUnavailable("Mutual fund NAV data — no NAV feed integrated");
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const marketDataRouter = router({
  /**
   * Get gold spot price in NGN per gram and per troy oz.
   */
  goldPrice: publicProcedure.query(async () => {
    const ngnPerGram = await fetchGoldPriceNGN();
    const ngnPerTroyOz = Math.round(ngnPerGram * 31.1035);
    const koboPerGram = ngnPerGram * 100;
    return {
      ngnPerGram,
      ngnPerTroyOz,
      koboPerGram,
      currency: "NGN",
      unit: "gram",
      updatedAt: new Date().toISOString(),
      // 24h change is not computed without a historical feed — null, never sine-wave.
      change24hPct: null,
    };
  }),

  /**
   * Get FX rates (NGN per foreign currency).
   */
  fxRates: publicProcedure
    .input(z.object({
      currencies: z.array(z.string()).optional(),
    }).optional())
    .query(async ({ input }) => {
      const rates = await fetchFxRates();
      const currencies = input?.currencies ?? SUPPORTED_FX;
      const filtered: Record<string, number> = {};
      for (const ccy of currencies) {
        if (rates[ccy]) filtered[ccy] = rates[ccy];
      }
      return {
        base: "NGN",
        rates: filtered,
        updatedAt: new Date().toISOString(),
      };
    }),

  /**
   * Get mutual fund NAV snapshots.
   * Fails loudly — no real NAV feed is integrated; fabricated NAVs removed.
   */
  fundNavs: publicProcedure.query(() => {
    getFundNavs();
  }),

  /**
   * Get a consolidated market summary for the Financial Hub hero section.
   * Only includes sections backed by a real feed; fails loudly when the FX
   * feed is down and omits gold/funds when those feeds are not configured.
   */
  summary: publicProcedure.query(async () => {
    const fxRates = await fetchFxRates(); // throws loudly when unavailable

    // Gold: include only when the real metals feed is configured.
    let gold: { ngnPerGram: number; change24hPct: null } | null = null;
    if (process.env.METALS_API_KEY) {
      try {
        gold = { ngnPerGram: await fetchGoldPriceNGN(), change24hPct: null };
      } catch {
        gold = null; // omit section rather than fabricate
      }
    }

    return {
      gold,
      fx: {
        usdNgn: fxRates["USD"] ?? null,
        gbpNgn: fxRates["GBP"] ?? null,
        eurNgn: fxRates["EUR"] ?? null,
      },
      // Fund NAVs and market sentiment require real data sources that are not
      // integrated — omitted entirely instead of fabricated.
      topFund: null,
      marketSentiment: null,
      updatedAt: new Date().toISOString(),
    };
  }),
});
