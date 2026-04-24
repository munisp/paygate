// @ts-nocheck
/**
 * PayGate Hot/Warm/Cold Tiering Archival Service
 *
 * Implements the 3-tier storage strategy described in the 1B payments/day research:
 *   - HOT  (0–90 days):   TigerBeetle cluster — single-digit ms latency
 *   - WARM (90d–1 year):  PostgreSQL + compressed Parquet on NVMe — seconds latency
 *   - COLD (1–10 years):  S3/GCS Parquet, partitioned by day — minutes latency
 *
 * Key lessons applied from https://backend.how/posts/1b-payments-per-day/:
 *   1. Account balances ARE the checkpoint — snapshot balances at cutoff, archive transfers
 *   2. zstd(3) with dictionary encoding achieves ~4.7× compression on 128-byte transfer records
 *   3. Partition cold storage by day (128 GB/day raw → ~27 GB/day compressed)
 *   4. Never re-import archived transfers into the hot ledger — immutability guarantee
 *   5. Warm tier uses ClickHouse-style columnar layout for analytics queries
 *
 * Capacity planning (1B payments/day baseline):
 *   - Average TPS:  12,000 (1B / 86,400s)
 *   - Daily peak:   30,000 TPS (2.5× average — 11AM + 8-10PM bursts)
 *   - Seasonal:     60,000 TPS (5× average — Diwali, month-end, tax deadlines)
 *   - Raw data:     128 GB/day (1B × 128 bytes)
 *   - Hot storage:  ~1 TB/day on disk (8.2× TigerBeetle LSM amplification)
 *   - Cold storage: ~27 GB/day compressed (zstd 4.7× ratio)
 *   - 90-day hot:   ~90 TB per cluster (2 sharded clusters for 60K seasonal peak)
 *   - 10-year cold: ~94 TB on S3 (~$2,150/month at $0.023/GB)
 */

import { getDb } from "./db";
import { transactions } from "../drizzle/schema";
import { lt, and, eq, gte } from "drizzle-orm";
import { storagePut } from "./storage";
import { logger } from "./logger";

// ─── Tier boundaries ──────────────────────────────────────────────────────────

export const TIER_BOUNDARIES = {
  /** Hot tier: last 90 days in TigerBeetle + PostgreSQL */
  HOT_DAYS: 90,
  /** Warm tier: 90 days to 1 year in compressed PostgreSQL partitions */
  WARM_DAYS: 365,
  /** Cold tier: 1–10 years in S3 Parquet (10-year regulatory requirement) */
  COLD_YEARS: 10,
} as const;

/** Batch size aligned with TigerBeetle's 8,190-transfer batch (1 MB message) */
export const ARCHIVE_BATCH_SIZE = 8_190;

/** Target compression ratio for cold-tier Parquet (zstd level 3 + dictionary) */
export const COLD_COMPRESSION_RATIO = 4.7;

// ─── Capacity planning helpers ────────────────────────────────────────────────

export interface CapacityEstimate {
  /** Transactions per second */
  avgTps: number;
  dailyPeakTps: number;
  seasonalPeakTps: number;
  /** Storage in GB */
  rawDataPerDayGb: number;
  hotStoragePerDayGb: number;
  coldStoragePerDayGb: number;
  /** 90-day hot tier total */
  hotTierTotalTb: number;
  /** 10-year cold tier total */
  coldTierTotalTb: number;
  /** Recommended cluster count for seasonal peak */
  recommendedClusters: number;
  /** Monthly S3 cost estimate (USD) at $0.023/GB */
  coldTierMonthlyCostUsd: number;
}

/**
 * Estimates storage and throughput requirements based on daily transaction volume.
 * Based on first-principles math from the 1B payments/day analysis.
 *
 * @param dailyTransactions - Expected daily transaction count
 * @param transferSizeBytes - Fixed transfer record size (default: 128 bytes)
 */
export function estimateCapacity(
  dailyTransactions: number,
  transferSizeBytes = 128,
): CapacityEstimate {
  const secondsPerDay = 86_400;
  const avgTps = dailyTransactions / secondsPerDay;
  const dailyPeakTps = avgTps * 2.5; // Normal diurnal swing (11AM + 8-10PM)
  const seasonalPeakTps = avgTps * 5; // Diwali/month-end/tax deadline 2× on top of peak

  const rawDataPerDayGb = (dailyTransactions * transferSizeBytes) / 1e9;
  const lsmAmplification = 8.2; // TigerBeetle LSM + 3 secondary indexes + WAL
  const hotStoragePerDayGb = rawDataPerDayGb * lsmAmplification;
  const coldStoragePerDayGb = rawDataPerDayGb / COLD_COMPRESSION_RATIO;

  const hotTierTotalTb = (hotStoragePerDayGb * TIER_BOUNDARIES.HOT_DAYS * 6) / 1_000; // 6 replicas
  const coldTierTotalTb =
    (coldStoragePerDayGb * 365 * TIER_BOUNDARIES.COLD_YEARS) / 1_000;

  // TigerBeetle sustains ~48K TPS per cluster; recommend 2× headroom for seasonal peak
  const tpsPerCluster = 48_000;
  const recommendedClusters = Math.ceil((seasonalPeakTps / tpsPerCluster) * 2);

  // S3 Standard at $0.023/GB/month
  const coldTierMonthlyCostUsd = coldTierTotalTb * 1_000 * 0.023;

  return {
    avgTps: Math.round(avgTps),
    dailyPeakTps: Math.round(dailyPeakTps),
    seasonalPeakTps: Math.round(seasonalPeakTps),
    rawDataPerDayGb: parseFloat(rawDataPerDayGb.toFixed(2)),
    hotStoragePerDayGb: parseFloat(hotStoragePerDayGb.toFixed(2)),
    coldStoragePerDayGb: parseFloat(coldStoragePerDayGb.toFixed(2)),
    hotTierTotalTb: parseFloat(hotTierTotalTb.toFixed(2)),
    coldTierTotalTb: parseFloat(coldTierTotalTb.toFixed(2)),
    recommendedClusters: Math.max(1, recommendedClusters),
    coldTierMonthlyCostUsd: parseFloat(coldTierMonthlyCostUsd.toFixed(2)),
  };
}

// ─── Archival pipeline ────────────────────────────────────────────────────────

export interface ArchivalResult {
  cutoffDate: Date;
  rowsArchived: number;
  batches: number;
  s3Keys: string[];
  durationMs: number;
  estimatedCompressedSizeKb: number;
}

/**
 * Archives transactions older than the hot-tier cutoff to cold storage (S3).
 *
 * Strategy (from the 1B payments/day research):
 *   1. Query transfers with timestamp < NOW() - 90 days
 *   2. Stream to Parquet-like JSON partitions by day
 *   3. The account balances at cutoff ARE the checkpoint — no need to re-import
 *   4. Compact in batches of 8,190 (aligned with TigerBeetle batch size)
 *
 * Note: In production, replace JSON serialisation with actual Parquet encoding
 * using Apache Arrow or DuckDB for the ~4.7× compression ratio.
 */
export async function archiveHotTierTransactions(
  merchantId?: string,
): Promise<ArchivalResult> {
  const startMs = Date.now();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - TIER_BOUNDARIES.HOT_DAYS);

  const db = await getDb();
  const s3Keys: string[] = [];
  let rowsArchived = 0;
  let batches = 0;

  try {
    // Build query for archivable transactions
    const whereClause = merchantId
      ? and(
          lt(transactions.createdAt, cutoffDate),
          eq(transactions.merchantId, merchantId),
        )
      : lt(transactions.createdAt, cutoffDate);

    // Fetch in batches aligned with TigerBeetle's 8,190-record batch size
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await db
        .select()
        .from(transactions)
        .where(whereClause)
        .limit(ARCHIVE_BATCH_SIZE)
        .offset(offset);

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Partition by day (matches the archival pipeline from the article)
      const dayPartitions = new Map<string, typeof batch>();
      for (const tx of batch) {
        const day = tx.createdAt
          ? new Date(tx.createdAt).toISOString().slice(0, 10)
          : "unknown";
        if (!dayPartitions.has(day)) dayPartitions.set(day, []);
        dayPartitions.get(day)!.push(tx);
      }

      // Upload each day partition to S3
      for (const [day, dayBatch] of dayPartitions) {
        const key = merchantId
          ? `archive/transactions/merchant=${merchantId}/date=${day}/batch-${batches}.json`
          : `archive/transactions/date=${day}/batch-${batches}.json`;

        const payload = JSON.stringify({
          metadata: {
            archivedAt: new Date().toISOString(),
            cutoffDate: cutoffDate.toISOString(),
            recordCount: dayBatch.length,
            tierBoundaryDays: TIER_BOUNDARIES.HOT_DAYS,
            compressionHint: "zstd-3-dictionary", // Hint for downstream Parquet conversion
          },
          records: dayBatch,
        });

        await storagePut(key, Buffer.from(payload), "application/json");
        s3Keys.push(key);
        batches++;
      }

      rowsArchived += batch.length;
      offset += ARCHIVE_BATCH_SIZE;

      if (batch.length < ARCHIVE_BATCH_SIZE) hasMore = false;
    }

    const durationMs = Date.now() - startMs;
    // Estimate compressed size: raw JSON / compression ratio
    const estimatedCompressedSizeKb = Math.round(
      (rowsArchived * 128) / COLD_COMPRESSION_RATIO / 1_024,
    );

    logger.info("tieringArchival: hot-tier archive complete", {
      cutoffDate: cutoffDate.toISOString(),
      rowsArchived,
      batches,
      s3KeyCount: s3Keys.length,
      durationMs,
      estimatedCompressedSizeKb,
    });

    return {
      cutoffDate,
      rowsArchived,
      batches,
      s3Keys,
      durationMs,
      estimatedCompressedSizeKb,
    };
  } catch (err) {
    logger.error("tieringArchival: archive failed", { err });
    throw err;
  }
}

// ─── TPS capacity check ───────────────────────────────────────────────────────

/**
 * Returns a real-time capacity health check based on recent transaction rate.
 * Compares current TPS against the 3 thresholds from the 1B/day analysis.
 */
export async function checkTpsCapacity(windowSeconds = 60): Promise<{
  currentTps: number;
  status: "normal" | "daily_peak" | "seasonal_peak" | "over_capacity";
  avgTpsThreshold: number;
  dailyPeakThreshold: number;
  seasonalPeakThreshold: number;
  utilizationPct: number;
}> {
  const db = await getDb();
  const windowStart = new Date(Date.now() - windowSeconds * 1_000);

  const [result] = await db
    .select({ count: transactions.id })
    .from(transactions)
    .where(gte(transactions.createdAt, windowStart));

  // Approximate count from the query result
  const recentCount = Array.isArray(result) ? result.length : 0;
  const currentTps = recentCount / windowSeconds;

  // Thresholds based on 1B payments/day napkin math
  const avgTpsThreshold = 12_000;
  const dailyPeakThreshold = 30_000;
  const seasonalPeakThreshold = 60_000;

  let status: "normal" | "daily_peak" | "seasonal_peak" | "over_capacity";
  if (currentTps <= avgTpsThreshold) {
    status = "normal";
  } else if (currentTps <= dailyPeakThreshold) {
    status = "daily_peak";
  } else if (currentTps <= seasonalPeakThreshold) {
    status = "seasonal_peak";
  } else {
    status = "over_capacity";
  }

  return {
    currentTps: parseFloat(currentTps.toFixed(2)),
    status,
    avgTpsThreshold,
    dailyPeakThreshold,
    seasonalPeakThreshold,
    utilizationPct: parseFloat(
      ((currentTps / seasonalPeakThreshold) * 100).toFixed(1),
    ),
  };
}
