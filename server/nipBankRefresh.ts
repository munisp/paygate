import { logger } from './logger';
/**
 * nipBankRefresh.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Periodic NIP bank directory refresh worker.
 *
 * Runs every 24 hours (configurable via NIP_BANK_REFRESH_INTERVAL_MS).
 * Fetches the latest bank list from the NIP API (or NIBSS directory) and
 * upserts into the nip_banks table so account-name lookups stay current.
 *
 * Fail-open: if the upstream fetch fails, the existing directory is preserved
 * and the error is logged — the worker retries on the next cycle.
 */

import { upsertNipBanks } from "./db";
import { isSuppressedWorkerError } from './workerErrorFilter';

const REFRESH_INTERVAL_MS =
  Number(process.env.NIP_BANK_REFRESH_INTERVAL_MS) || 24 * 60 * 60 * 1000; // 24 h

// NIP / NIBSS bank list endpoint — override via env for staging/prod
const NIP_BANK_LIST_URL =
  process.env.NIP_BANK_LIST_URL ??
  "https://nip-api.nibss-plc.com.ng/v1/banks"; // override via NIP_BANK_LIST_URL env var in production

interface NipBankRecord {
  bankCode: string;
  bankName: string;
  nipCode?: string;
  isActive?: boolean;
}

async function fetchBankDirectory(): Promise<NipBankRecord[]> {
  const res = await fetch(NIP_BANK_LIST_URL, {
    headers: {
      Accept: "application/json",
      ...(process.env.NIP_API_KEY ? { Authorization: `Bearer ${process.env.NIP_API_KEY}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NIP bank list fetch failed: ${res.status} ${res.statusText}`);
  const body = await res.json() as { data?: NipBankRecord[]; banks?: NipBankRecord[] } | NipBankRecord[];
  // Handle different response shapes
  if (Array.isArray(body)) return body;
  if (Array.isArray((body as any).data)) return (body as any).data;
  if (Array.isArray((body as any).banks)) return (body as any).banks;
  throw new Error("Unexpected NIP bank list response shape");
}

async function runRefresh(): Promise<void> {
  logger.info("[nipBankRefresh] Starting NIP bank directory refresh…");
  try {
    const banks = await fetchBankDirectory();
    if (!banks.length) {
      logger.warn("[nipBankRefresh] Empty bank list returned — skipping upsert");
      return;
    }
    const records = banks.map((b) => ({
      id: `nip_${b.bankCode}`,
      bankCode: b.bankCode,
      bankName: b.bankName,
      nipCode: b.nipCode ?? b.bankCode,
      isActive: b.isActive !== false ? 1 : 0,
      lastSyncedAt: new Date(),
    }));
    await upsertNipBanks(records);
    logger.info(`[nipBankRefresh] Upserted ${records.length} banks successfully`);
  } catch (err) {
    // Fail-open: log and continue — existing directory is preserved
    if (!isSuppressedWorkerError(err)) {
      logger.error("[nipBankRefresh] Refresh failed (existing directory preserved):", err instanceof Error ? err.message : err);
    }
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startNipBankRefreshWorker(): void {
  if (_timer) return; // already running
  // Run immediately on startup, then on interval
  runRefresh().catch(() => {}); // fire-and-forget
  _timer = setInterval(() => {
    runRefresh().catch(() => {});
  }, REFRESH_INTERVAL_MS);
  logger.info(`[nipBankRefresh] Worker started — interval: ${REFRESH_INTERVAL_MS / 3_600_000}h`);
}

export function stopNipBankRefreshWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
