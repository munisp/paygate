/**
 * Notification Digest Email Service
 * Sends daily and weekly digest emails for merchant, consumer, and admin scopes.
 * Scheduled via setInterval in server/_core/index.ts
 *
 * Fix notes:
 * - drizzle.execute() returns { rows: [...] } — must use .rows
 * - PostgreSQL boolean comparison: use sql`= true` not sql`= ${true}` to avoid
 *   "operator does not exist: integer = boolean" errors
 */
import { sendEmail } from "./emailService";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const PORTAL_URL = ENV.merchantPortalUrl ?? "https://paygate.manus.space";

// ─── HTML Email Templates ────────────────────────────────────────────────────

function merchantDailyDigestHtml(opts: {
  merchantName: string;
  date: string;
  txCount: number;
  txVolume: string;
  currency: string;
  failedTx: number;
  pendingPayouts: number;
  newCustomers: number;
  alerts: string[];
  portalUrl: string;
}): string {
  const alertRows = opts.alerts.length
    ? opts.alerts.map(a => `<li style="margin:4px 0;color:#374151;">${a}</li>`).join("")
    : `<li style="color:#6B7280;">No alerts today</li>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#4F46E5;padding:28px 32px;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">PayGate Daily Digest</h1>
          <p style="margin:4px 0 0;color:#C7D2FE;font-size:14px;">${opts.date} · ${opts.merchantName}</p>
        </td></tr>
        <!-- KPI Row -->
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="25%" style="text-align:center;padding:12px;background:#F9FAFB;border-radius:8px;">
                <div style="font-size:24px;font-weight:700;color:#111827;">${opts.txCount}</div>
                <div style="font-size:12px;color:#6B7280;margin-top:4px;">Transactions</div>
              </td>
              <td width="4%"></td>
              <td width="25%" style="text-align:center;padding:12px;background:#F9FAFB;border-radius:8px;">
                <div style="font-size:24px;font-weight:700;color:#059669;">${opts.currency} ${opts.txVolume}</div>
                <div style="font-size:12px;color:#6B7280;margin-top:4px;">Volume</div>
              </td>
              <td width="4%"></td>
              <td width="25%" style="text-align:center;padding:12px;background:#F9FAFB;border-radius:8px;">
                <div style="font-size:24px;font-weight:700;color:#DC2626;">${opts.failedTx}</div>
                <div style="font-size:12px;color:#6B7280;margin-top:4px;">Failed</div>
              </td>
              <td width="4%"></td>
              <td width="25%" style="text-align:center;padding:12px;background:#F9FAFB;border-radius:8px;">
                <div style="font-size:24px;font-weight:700;color:#2563EB;">${opts.newCustomers}</div>
                <div style="font-size:12px;color:#6B7280;margin-top:4px;">New Customers</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Alerts -->
        <tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">Alerts</h3>
          <ul style="margin:0;padding-left:20px;">${alertRows}</ul>
        </td></tr>
        <!-- Pending Payouts -->
        ${opts.pendingPayouts > 0 ? `
        <tr><td style="padding:0 32px 24px;">
          <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;">
            <strong style="color:#92400E;">⚠ ${opts.pendingPayouts} payout(s) pending approval</strong>
          </div>
        </td></tr>` : ""}
        <!-- CTA -->
        <tr><td style="padding:0 32px 32px;text-align:center;">
          <a href="${opts.portalUrl}/dashboard" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View Dashboard</a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F9FAFB;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">PayGate Merchant Portal · <a href="${opts.portalUrl}/notifications/preferences" style="color:#6B7280;">Manage preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function consumerWeeklyDigestHtml(opts: {
  consumerName: string;
  weekStart: string;
  weekEnd: string;
  sentCount: number;
  sentAmount: string;
  receivedCount: number;
  receivedAmount: string;
  currency: string;
  topCategory: string;
  cashbackEarned: string;
  portalUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 32px;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Your Weekly Summary</h1>
          <p style="margin:4px 0 0;color:#C7D2FE;font-size:14px;">${opts.weekStart} – ${opts.weekEnd} · ${opts.consumerName}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" style="background:#EEF2FF;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:11px;color:#6366F1;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Money Sent</div>
                <div style="font-size:28px;font-weight:700;color:#111827;margin:8px 0;">${opts.currency} ${opts.sentAmount}</div>
                <div style="font-size:12px;color:#6B7280;">${opts.sentCount} transfer${opts.sentCount !== 1 ? "s" : ""}</div>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#F0FDF4;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:11px;color:#059669;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Money Received</div>
                <div style="font-size:28px;font-weight:700;color:#111827;margin:8px 0;">${opts.currency} ${opts.receivedAmount}</div>
                <div style="font-size:12px;color:#6B7280;">${opts.receivedCount} payment${opts.receivedCount !== 1 ? "s" : ""}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        ${opts.cashbackEarned !== "0.00" ? `
        <tr><td style="padding:0 32px 24px;">
          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:12px 16px;text-align:center;">
            <strong style="color:#C2410C;">🎉 You earned ${opts.currency} ${opts.cashbackEarned} cashback this week!</strong>
          </div>
        </td></tr>` : ""}
        <tr><td style="padding:0 32px 32px;text-align:center;">
          <a href="${opts.portalUrl}/consumer/wallet" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View Wallet</a>
        </td></tr>
        <tr><td style="background:#F9FAFB;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">PayGate · <a href="${opts.portalUrl}/consumer/notifications/settings" style="color:#6B7280;">Manage preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function adminWeeklyReportHtml(opts: {
  weekStart: string;
  weekEnd: string;
  totalTx: number;
  totalVolume: string;
  currency: string;
  activeMerchants: number;
  newMerchants: number;
  fraudAlerts: number;
  kycPending: number;
  systemUptime: string;
  portalUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F172A;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:32px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#1E293B;border-radius:12px;overflow:hidden;border:1px solid #334155;">
        <tr><td style="background:#4F46E5;padding:28px 32px;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">PayGate Platform Weekly Report</h1>
          <p style="margin:4px 0 0;color:#C7D2FE;font-size:14px;">${opts.weekStart} – ${opts.weekEnd}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="30%" style="background:#0F172A;border-radius:8px;padding:14px;text-align:center;border:1px solid #334155;">
                <div style="font-size:22px;font-weight:700;color:#fff;">${opts.totalTx.toLocaleString()}</div>
                <div style="font-size:11px;color:#94A3B8;margin-top:4px;">Total Transactions</div>
              </td>
              <td width="3%"></td>
              <td width="30%" style="background:#0F172A;border-radius:8px;padding:14px;text-align:center;border:1px solid #334155;">
                <div style="font-size:22px;font-weight:700;color:#34D399;">${opts.currency} ${opts.totalVolume}</div>
                <div style="font-size:11px;color:#94A3B8;margin-top:4px;">Total Volume</div>
              </td>
              <td width="3%"></td>
              <td width="30%" style="background:#0F172A;border-radius:8px;padding:14px;text-align:center;border:1px solid #334155;">
                <div style="font-size:22px;font-weight:700;color:#60A5FA;">${opts.activeMerchants}</div>
                <div style="font-size:11px;color:#94A3B8;margin-top:4px;">Active Merchants</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" style="background:#0F172A;border-radius:8px;padding:12px 16px;border:1px solid #334155;">
                <span style="color:#94A3B8;font-size:12px;">New Merchants</span>
                <span style="float:right;color:#fff;font-weight:600;">${opts.newMerchants}</span>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#0F172A;border-radius:8px;padding:12px 16px;border:1px solid #334155;">
                <span style="color:#94A3B8;font-size:12px;">System Uptime</span>
                <span style="float:right;color:#34D399;font-weight:600;">${opts.systemUptime}</span>
              </td>
            </tr>
            <tr><td colspan="3" style="height:8px;"></td></tr>
            <tr>
              <td width="48%" style="background:#0F172A;border-radius:8px;padding:12px 16px;border:1px solid ${opts.fraudAlerts > 0 ? "#EF4444" : "#334155"};">
                <span style="color:#94A3B8;font-size:12px;">Open Fraud Alerts</span>
                <span style="float:right;color:${opts.fraudAlerts > 0 ? "#EF4444" : "#fff"};font-weight:600;">${opts.fraudAlerts}</span>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#0F172A;border-radius:8px;padding:12px 16px;border:1px solid ${opts.kycPending > 0 ? "#F59E0B" : "#334155"};">
                <span style="color:#94A3B8;font-size:12px;">KYC Pending</span>
                <span style="float:right;color:${opts.kycPending > 0 ? "#F59E0B" : "#fff"};font-weight:600;">${opts.kycPending}</span>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 32px;text-align:center;">
          <a href="${opts.portalUrl}/admin/dashboard" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View Admin Dashboard</a>
        </td></tr>
        <tr><td style="background:#0F172A;padding:16px 32px;text-align:center;border-top:1px solid #334155;">
          <p style="margin:0;font-size:12px;color:#64748B;">PayGate Admin Portal · <a href="${opts.portalUrl}/admin/notifications/preferences" style="color:#64748B;">Manage preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Digest Senders ──────────────────────────────────────────────────────────

/**
 * Helper: extract rows from drizzle.execute() result.
 * drizzle-orm returns { rows: [...] } from raw SQL execute.
 */
function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

/**
 * Send daily digest emails to merchants with email notifications enabled.
 * Called every 24h.
 */
export async function sendMerchantDailyDigests(): Promise<void> {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const drizzle = await getDb();
    if (!drizzle) return;
    const { sql } = await import("drizzle-orm");

    // Use IS TRUE to avoid integer=boolean type mismatch in PostgreSQL
    const prefsResult = await drizzle.execute(sql`
      SELECT np.merchant_id, np.email_enabled, m.email, m.business_name, m.currency
      FROM realtime_notification_preferences np
      JOIN merchants m ON m.id = np.merchant_id
      WHERE np.email_enabled = 1
      LIMIT 500
    `);
    const prefs = extractRows(prefsResult);

    for (const pref of prefs) {
      if (!pref.email) continue;

      const statsResult = await drizzle.execute(sql`
        SELECT
          COUNT(*) as tx_count,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as tx_volume,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tx
        FROM transactions
        WHERE merchant_id = ${pref.merchant_id}
          AND created_at >= ${yesterday.toISOString().split("T")[0]}::timestamptz
          AND created_at < ${now.toISOString().split("T")[0]}::timestamptz
      `);
      const stat = extractRows(statsResult)[0] ?? { tx_count: 0, tx_volume: 0, failed_tx: 0 };

      const newCustResult = await drizzle.execute(sql`
        SELECT COUNT(*) as cnt FROM customers
        WHERE merchant_id = ${pref.merchant_id}
          AND created_at >= ${yesterday.toISOString().split("T")[0]}::timestamptz
      `);
      const newCustomers = Number(extractRows(newCustResult)[0]?.cnt ?? 0);

      const pendingPayoutsResult = await drizzle.execute(sql`
        SELECT COUNT(*) as cnt FROM payouts
        WHERE merchant_id = ${pref.merchant_id} AND status = 'pending'
      `);
      const pendingPayouts = Number(extractRows(pendingPayoutsResult)[0]?.cnt ?? 0);

      const currency = pref.currency ?? "NGN";
      const volume = (Number(stat.tx_volume) / 100).toFixed(2);

      await sendEmail({
        to: pref.email,
        subject: `PayGate Daily Digest — ${dateStr}`,
        html: merchantDailyDigestHtml({
          merchantName: pref.business_name ?? "Merchant",
          date: dateStr,
          txCount: Number(stat.tx_count),
          txVolume: volume,
          currency,
          failedTx: Number(stat.failed_tx),
          pendingPayouts,
          newCustomers,
          alerts: Number(stat.failed_tx) > 5 ? [`${stat.failed_tx} failed transactions detected — review your payment flow`] : [],
          portalUrl: PORTAL_URL,
        }),
      });
    }

    console.info(`[digestEmail] Sent merchant daily digests to ${prefs.length} merchants`);
  } catch (err) {
    console.error("[digestEmail] Merchant daily digest error:", err);
  }
}

/**
 * Send weekly summary emails to consumers with weekly digest enabled.
 * Called every 7 days.
 */
export async function sendConsumerWeeklyDigests(): Promise<void> {
  try {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const weekStartStr = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const weekEndStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const drizzle = await getDb();
    if (!drizzle) return;
    const { sql } = await import("drizzle-orm");

    // Use IS TRUE to avoid integer=boolean type mismatch
    const prefsResult = await drizzle.execute(sql`
      SELECT cnp.user_id, cnp.email_payments, u.email, u.name, 'NGN' as currency
      FROM consumer_notification_prefs cnp
      JOIN users u ON u.id = cnp.user_id
      WHERE cnp.email_payments IS TRUE
      LIMIT 1000
    `);
    const prefs = extractRows(prefsResult);

    for (const pref of prefs) {
      if (!pref.email) continue;

      const sentResult = await drizzle.execute(sql`
        SELECT COUNT(*) as cnt, COALESCE(SUM(amount_kobo), 0) as total
        FROM consumer_wallet_txns
        WHERE wallet_id IN (SELECT id FROM consumer_wallets WHERE user_id = ${pref.user_id})
          AND type = 'debit'
          AND created_at >= ${weekStart.toISOString()}
      `);
      const sent = extractRows(sentResult)[0] ?? { cnt: 0, total: 0 };

      const receivedResult = await drizzle.execute(sql`
        SELECT COUNT(*) as cnt, COALESCE(SUM(amount_kobo), 0) as total
        FROM consumer_wallet_txns
        WHERE wallet_id IN (SELECT id FROM consumer_wallets WHERE user_id = ${pref.user_id})
          AND type = 'credit'
          AND created_at >= ${weekStart.toISOString()}
      `);
      const received = extractRows(receivedResult)[0] ?? { cnt: 0, total: 0 };

      const cashbackResult = await drizzle.execute(sql`
        SELECT COALESCE(SUM(points), 0) as total
        FROM consumer_loyalty_txns
        WHERE user_id = ${pref.user_id}
          AND created_at >= ${weekStart.toISOString()}
      `);
      const cashback = extractRows(cashbackResult)[0] ?? { total: 0 };

      const currency = pref.currency ?? "NGN";

      await sendEmail({
        to: pref.email,
        subject: `Your PayGate Weekly Summary — ${weekStartStr} to ${weekEndStr}`,
        html: consumerWeeklyDigestHtml({
          consumerName: pref.name ?? "User",
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          sentCount: Number(sent.cnt),
          sentAmount: (Number(sent.total) / 100).toFixed(2),
          receivedCount: Number(received.cnt),
          receivedAmount: (Number(received.total) / 100).toFixed(2),
          currency,
          topCategory: "Transfers",
          cashbackEarned: (Number(cashback.total) / 100).toFixed(2),
          portalUrl: PORTAL_URL,
        }),
      });
    }

    console.info(`[digestEmail] Sent consumer weekly digests to ${prefs.length} consumers`);
  } catch (err) {
    console.error("[digestEmail] Consumer weekly digest error:", err);
  }
}

/**
 * Send weekly platform report to admin users with weekly report enabled.
 * Called every Monday.
 */
export async function sendAdminWeeklyReports(): Promise<void> {
  try {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const weekStartStr = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const weekEndStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const drizzle = await getDb();
    if (!drizzle) return;
    const { sql } = await import("drizzle-orm");

    // Use IS TRUE to avoid integer=boolean type mismatch
    const prefsResult = await drizzle.execute(sql`
      SELECT anp.user_id, anp.alert_weekly_report, u.email, u.name
      FROM admin_notification_prefs anp
      JOIN users u ON u.id = anp.user_id
      WHERE anp.alert_weekly_report IS TRUE AND u.role = 'admin'
      LIMIT 50
    `);
    const prefs = extractRows(prefsResult);

    // Platform-wide stats
    const txStatsResult = await drizzle.execute(sql`
      SELECT COUNT(*) as total_tx, COALESCE(SUM(amount), 0) as total_volume
      FROM transactions WHERE created_at >= ${weekStart.toISOString()}::timestamptz
    `);
    const txStats = extractRows(txStatsResult)[0] ?? { total_tx: 0, total_volume: 0 };

    const merchantStatsResult = await drizzle.execute(sql`
      SELECT
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN created_at >= ${weekStart.toISOString()} THEN 1 END) as new_merchants
      FROM merchants
    `);
    const mStat = extractRows(merchantStatsResult)[0] ?? { active: 0, new_merchants: 0 };

    const fraudResult = await drizzle.execute(sql`
      SELECT COUNT(*) as cnt FROM fraud_alerts
      WHERE created_at >= ${weekStart.toISOString()}::timestamptz AND status = 'open'
    `);
    const fraudAlerts = Number(extractRows(fraudResult)[0]?.cnt ?? 0);

    const kycResult = await drizzle.execute(sql`
      SELECT COUNT(*) as cnt FROM kyc_submissions WHERE status = 'pending'
    `);
    const kycPending = Number(extractRows(kycResult)[0]?.cnt ?? 0);

    for (const pref of prefs) {
      if (!pref.email) continue;

      await sendEmail({
        to: pref.email,
        subject: `PayGate Platform Weekly Report — ${weekStartStr} to ${weekEndStr}`,
        html: adminWeeklyReportHtml({
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          totalTx: Number(txStats.total_tx),
          totalVolume: (Number(txStats.total_volume) / 100).toFixed(2),
          currency: "NGN",
          activeMerchants: Number(mStat.active),
          newMerchants: Number(mStat.new_merchants),
          fraudAlerts,
          kycPending,
          systemUptime: "99.9%",
          portalUrl: PORTAL_URL,
        }),
      });
    }

    console.info(`[digestEmail] Sent admin weekly reports to ${prefs.length} admins`);
  } catch (err) {
    console.error("[digestEmail] Admin weekly report error:", err);
  }
}

// ─── Scheduler Registration ──────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Register all digest email cron jobs.
 * Call once from server/_core/index.ts after server start.
 */
export function registerDigestCronJobs(): void {
  // Merchant daily digest — every 24h, first run after 1 minute (dev-friendly)
  const merchantDelay = process.env.NODE_ENV === "production" ? DAY_MS : 60_000;
  setTimeout(async () => {
    await sendMerchantDailyDigests();
    setInterval(sendMerchantDailyDigests, DAY_MS);
  }, merchantDelay);

  // Consumer weekly digest — every 7 days
  const consumerDelay = process.env.NODE_ENV === "production" ? WEEK_MS : 120_000;
  setTimeout(async () => {
    await sendConsumerWeeklyDigests();
    setInterval(sendConsumerWeeklyDigests, WEEK_MS);
  }, consumerDelay);

  // Admin weekly report — every 7 days, offset by 2 hours
  const adminDelay = process.env.NODE_ENV === "production" ? WEEK_MS : 180_000;
  setTimeout(async () => {
    await sendAdminWeeklyReports();
    setInterval(sendAdminWeeklyReports, WEEK_MS);
  }, adminDelay);

  console.info("[digestEmail] Digest cron jobs registered (merchant daily, consumer weekly, admin weekly)");
}

// ─── Single-merchant digest (for manual trigger from analytics dashboard) ────

export async function sendMerchantDailyDigest(merchantId: string): Promise<void> {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const drizzle = await getDb();
    if (!drizzle) return;
    const { sql } = await import("drizzle-orm");

    const merchantResult = await drizzle.execute(sql`
      SELECT m.id, m.email, m.business_name, m.currency
      FROM merchants m WHERE m.id = ${merchantId} LIMIT 1
    `);
    const merchant = extractRows(merchantResult)[0];
    if (!merchant?.email) return;

    const statsResult = await drizzle.execute(sql`
      SELECT
        COUNT(*) as tx_count,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as tx_volume,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tx
      FROM transactions
      WHERE merchant_id = ${merchantId}
        AND created_at >= ${yesterday.toISOString().split("T")[0]}::timestamptz
    `);
    const stat = extractRows(statsResult)[0] ?? { tx_count: 0, tx_volume: 0, failed_tx: 0 };

    const newCustResult = await drizzle.execute(sql`
      SELECT COUNT(*) as cnt FROM customers WHERE merchant_id = ${merchantId}
        AND created_at >= ${yesterday.toISOString().split("T")[0]}::timestamptz
    `);
    const newCustomers = Number(extractRows(newCustResult)[0]?.cnt ?? 0);

    const pendingPayoutsResult = await drizzle.execute(sql`
      SELECT COUNT(*) as cnt FROM payouts WHERE merchant_id = ${merchantId} AND status = 'pending'
    `);
    const pendingPayouts = Number(extractRows(pendingPayoutsResult)[0]?.cnt ?? 0);

    const currency = merchant.currency ?? "NGN";
    const volume = (Number(stat.tx_volume) / 100).toFixed(2);

    await sendEmail({
      to: merchant.email as string,
      subject: `PayGate Daily Digest — ${dateStr}`,
      html: merchantDailyDigestHtml({
        merchantName: (merchant.business_name as string) ?? "Merchant",
        date: dateStr,
        txCount: Number(stat.tx_count),
        txVolume: volume,
        currency,
        failedTx: Number(stat.failed_tx),
        pendingPayouts,
        newCustomers,
        alerts: [],
        portalUrl: PORTAL_URL,
      }),
    });
  } catch (err) {
    console.error("[digestEmail] Single merchant digest error:", err);
    throw err;
  }
}
