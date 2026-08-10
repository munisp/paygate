/**
 * USDC Balance Monitor
 * ====================
 * Polls the platform USDC wallet balance every 15 minutes via the Go bridge
 * and fires an owner notification when the balance drops below the configured
 * threshold.  Runs as a background worker started at server startup.
 *
 * Configuration (environment variables):
 *   USDC_ALERT_THRESHOLD_USD   — alert when balance < this value (default: 500)
 *   USDC_MONITOR_INTERVAL_MS   — poll interval in ms (default: 900_000 = 15 min)
 */

import { logger } from "./logger";
import { isBridgeAvailable } from "./middlewareBridge";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";

const THRESHOLD_USD = parseFloat(process.env.USDC_ALERT_THRESHOLD_USD ?? "500");
const INTERVAL_MS   = parseInt(process.env.USDC_MONITOR_INTERVAL_MS ?? "900000", 10);

// Track last alert time to avoid notification spam (max 1 alert per hour)
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 3_600_000; // 1 hour

interface USDCBalanceResponse {
  balance_usdc: number;
  balance_lamports: number;
  wallet_address: string;
  network: string;
}

async function checkBalance(): Promise<void> {
  if (!isBridgeAvailable()) {
    logger.warn("[usdcBalanceMonitor] Bridge not configured — skipping balance check");
    return;
  }

  let result: USDCBalanceResponse | null = null;
  try {
    const resp = await fetch(`${ENV.middlewareBridgeUrl}/v1/usdc/balance/platform`, {
      headers: { "x-internal-key": ENV.middlewareInternalKey ?? "" },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) result = (await resp.json()) as USDCBalanceResponse;
  } catch (err) {
    logger.warn("[usdcBalanceMonitor] Fetch failed", { error: String(err) });
  }

  if (!result) {
    logger.warn("[usdcBalanceMonitor] Could not fetch platform USDC balance — bridge unavailable");
    return;
  }

  const balanceUsd = result.balance_usdc;
  logger.info("[usdcBalanceMonitor] Platform USDC balance", {
    balance_usdc: balanceUsd,
    threshold_usd: THRESHOLD_USD,
    wallet: result.wallet_address,
    network: result.network,
  });

  if (balanceUsd < THRESHOLD_USD) {
    const now = Date.now();
    if (now - lastAlertAt < ALERT_COOLDOWN_MS) {
      logger.info("[usdcBalanceMonitor] Alert suppressed (cooldown active)");
      return;
    }

    lastAlertAt = now;
    const sent = await notifyOwner({
      title: "⚠️ Low USDC Platform Balance",
      content: [
        `The PayGate platform USDC wallet balance has dropped below the alert threshold.`,
        ``,
        `**Current balance:** $${balanceUsd.toFixed(2)} USDC`,
        `**Alert threshold:** $${THRESHOLD_USD.toFixed(2)} USDC`,
        `**Wallet:** \`${result.wallet_address}\``,
        `**Network:** ${result.network}`,
        ``,
        `Please top up the platform wallet to ensure uninterrupted USDC payouts.`,
        `Merchants with pending USDC payouts may be affected if the balance reaches $0.`,
      ].join("\n"),
    });

    if (sent) {
      logger.warn("[usdcBalanceMonitor] Low balance alert sent to owner", {
        balance_usdc: balanceUsd,
        threshold_usd: THRESHOLD_USD,
      });
    } else {
      logger.error("[usdcBalanceMonitor] Failed to send low balance alert — notification service unavailable");
    }
  }
}

let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startUSDCBalanceMonitor(): void {
  if (monitorInterval) {
    logger.warn("[usdcBalanceMonitor] Already running — skipping duplicate start");
    return;
  }

  logger.info("[usdcBalanceMonitor] Starting", {
    interval_ms: INTERVAL_MS,
    threshold_usd: THRESHOLD_USD,
  });

  // Run immediately on startup, then on interval
  checkBalance().catch((err) =>
    logger.error("[usdcBalanceMonitor] Initial check failed", { error: String(err) })
  );

  monitorInterval = setInterval(() => {
    checkBalance().catch((err) =>
      logger.error("[usdcBalanceMonitor] Periodic check failed", { error: String(err) })
    );
  }, INTERVAL_MS);

  // Allow the process to exit cleanly
  if (monitorInterval.unref) monitorInterval.unref();
}

export function stopUSDCBalanceMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info("[usdcBalanceMonitor] Stopped");
  }
}
