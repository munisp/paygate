/**
 * nexthubClient.ts — Paygate Unified NextHub Client
 * ─────────────────────────────────────────────────────────────────────────────
 * Single import point for all Paygate → NextHub integration.
 * Exposes a clean, protocol-agnostic API that automatically routes each
 * operation to the correct transport:
 *
 *   nexthub.transfer.*     → gRPC (critical path, low latency)
 *   nexthub.quote.*        → gRPC (critical path, low latency)
 *   nexthub.fx.*           → Redis cache (populated by Kafka consumer)
 *                            → gRPC fallback on cache miss
 *   nexthub.ndc.*          → gRPC (must be checked before every transfer)
 *   nexthub.participant.*  → REST (administrative, cacheable)
 *   nexthub.settlement.*   → REST (administrative, cacheable)
 *   nexthub.scheme.*       → REST (administrative, cacheable)
 *   nexthub.publish.*      → Kafka (async, fire-and-forget)
 *
 * Usage:
 *   import { nexthub } from "./nexthub/nexthubClient";
 *
 *   // Initiate a cross-border transfer via gRPC
 *   const result = await nexthub.transfer.initiate({ ... });
 *
 *   // Get live FX rate (cache → gRPC fallback)
 *   const rate = await nexthub.fx.getRate("NGN", "USD");
 *
 *   // Publish audit event to Regulator Portal via Kafka
 *   await nexthub.publish.auditEvent({ ... });
 */

import { nexthubGrpc } from "./nexthubGrpcClient";
import { nexthubRest } from "./nexthubRestClient";
import { fxRateCache, settlementWindowCache, dfspStatusCache } from "./nexthubKafkaConsumer";
import { paygatePublish } from "./nexthubKafkaProducer";
import type { TransferRequest, QuoteRequest } from "./nexthubGrpcClient";
import type { PaygateAuditEvent, PaygateCorridorVolumeEvent } from "./nexthubKafkaProducer";

// ─── FX Rate with cache-first strategy ───────────────────────────────────────
const FX_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getFxRate(sourceCurrency: string, targetCurrency: string) {
  const key = `${sourceCurrency}/${targetCurrency}`;
  const cached = fxRateCache.get(key);

  // Return cache if fresh
  if (cached && (Date.now() - cached.updatedAt) < FX_CACHE_TTL_MS) {
    return { ...cached, fromCache: true };
  }

  // Cache miss or stale — fall back to gRPC
  const live = await nexthubGrpc.fx.getLiveRate(sourceCurrency, targetCurrency);
  if (live) {
    fxRateCache.set(key, {
      midRate: live.midRate,
      buyRate: live.buyRate,
      sellRate: live.sellRate,
      markupBps: live.markupBps,
      validFrom: live.validFromMs,
      validTo: live.validToMs,
      provider: live.provider,
      updatedAt: Date.now(),
    });
    return { ...live, fromCache: false };
  }

  // Return stale cache if gRPC also fails
  if (cached) {
    console.warn(`[nexthub] Returning stale FX rate for ${key} (gRPC unavailable)`);
    return { ...cached, fromCache: true, isStale: true };
  }

  return null;
}

// ─── Settlement with cache-first strategy ────────────────────────────────────
async function listSettlementWindows(limit = 20, currency?: string) {
  // Try REST first
  const windows = await nexthubRest.listSettlementWindows(limit, currency);
  if (windows.length > 0) return windows;

  // Fall back to Kafka-populated cache
  const cached = [...settlementWindowCache.values()]
    .filter(w => !currency || w.currency === currency)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);

  return cached.map(w => ({
    windowId: w.windowId,
    state: w.state,
    currency: w.currency,
    totalTransfers: w.totalTransfers,
    totalAmountKobo: w.totalAmountKobo,
    openedAt: "",
    closedAt: w.closedAt,
  }));
}

// ─── Unified nexthub client ───────────────────────────────────────────────────
export const nexthub = {
  /**
   * Transfer lifecycle — gRPC (critical path)
   */
  transfer: {
    initiate: (req: TransferRequest) => nexthubGrpc.transfer.initiate(req),
    getStatus: (transferId: string) => nexthubGrpc.transfer.getStatus(transferId),
    abort: (transferId: string, errorCode: string, description: string) =>
      nexthubGrpc.transfer.abort(transferId, errorCode, description),
    fulfil: (transferId: string, fulfilment: string) =>
      nexthubGrpc.transfer.fulfil(transferId, fulfilment),
  },

  /**
   * Pre-transfer quote — gRPC (critical path)
   */
  quote: {
    request: (req: QuoteRequest) => nexthubGrpc.quote.request(req),
  },

  /**
   * FX rates — Redis cache (Kafka-populated) → gRPC fallback
   */
  fx: {
    getRate: getFxRate,
    getRateHistory: (src: string, tgt: string, fromMs?: number, toMs?: number) =>
      nexthubGrpc.fx.getRateHistory(src, tgt, fromMs, toMs),
    listRates: (baseCurrency?: string) => nexthubGrpc.fx.listRates(baseCurrency),
    /** Direct cache access — for tRPC routers that want to serve all cached rates */
    getCachedRates: () => Object.fromEntries(fxRateCache),
  },

  /**
   * NDC limit checks — gRPC (must be called before every transfer)
   */
  ndc: {
    check: (dfspId: string, amountKobo: number, currency?: string) =>
      nexthubGrpc.ndc.check(dfspId, amountKobo, currency),
    getPosition: (dfspId: string, currency?: string) =>
      nexthubGrpc.ndc.getPosition(dfspId, currency),
  },

  /**
   * Participant directory — REST (administrative, cacheable)
   */
  participant: {
    list: (statusFilter?: string) => nexthubRest.listParticipants(statusFilter),
    get: (dfspId: string) => nexthubRest.getParticipant(dfspId),
    /** gRPC lookup for real-time routing resolution */
    lookup: (dfspId: string) => nexthubGrpc.participant.lookup(dfspId),
    /** Kafka-populated status cache */
    getCachedStatus: (dfspId: string) => dfspStatusCache.get(dfspId) ?? null,
  },

  /**
   * Settlement windows — REST (administrative)
   */
  settlement: {
    listWindows: listSettlementWindows,
  },

  /**
   * Scheme fees — REST (administrative, rarely changes)
   */
  scheme: {
    getFees: (currency?: string) => nexthubRest.getSchemeFees(currency),
    getCorridorVolume: (windowDays?: number) => nexthubRest.getCorridorVolume(windowDays),
  },

  /**
   * Publish events to NextHub — Kafka (async, fire-and-forget)
   */
  publish: {
    auditEvent: (e: PaygateAuditEvent) => paygatePublish.auditEvent(e),
    corridorVolume: (e: PaygateCorridorVolumeEvent) => paygatePublish.corridorVolume(e),
  },

  /**
   * Connectivity status
   */
  status: {
    grpc: () => nexthubGrpc.isAvailable(),
    rest: () => nexthubRest.isAvailable(),
    health: () => nexthubRest.health(),
  },
};

export type NexthubClient = typeof nexthub;
