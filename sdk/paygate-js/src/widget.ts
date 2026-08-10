/**
 * PayGate Widget Module
 * Wallet balance widget, transaction feed widget, and payment status badge.
 */

export interface WalletWidgetConfig {
  publicKey: string;
  userId?: string;
  containerId: string;
  showBalance?: boolean;
  showTransactions?: boolean;
  transactionLimit?: number;
  theme?: "light" | "dark";
  currency?: string;
  baseUrl?: string;
  onTopUp?: () => void;
  onSend?: () => void;
}

export interface TransactionFeedConfig {
  publicKey: string;
  containerId: string;
  limit?: number;
  filter?: "all" | "credit" | "debit";
  theme?: "light" | "dark";
  baseUrl?: string;
}

export interface PaymentStatusBadgeConfig {
  publicKey: string;
  reference: string;
  containerId: string;
  pollInterval?: number; // ms, default 5000
  baseUrl?: string;
}

/**
 * Mount a wallet balance + recent transactions widget.
 */
export function mountWalletWidget(config: WalletWidgetConfig): () => void {
  const container = document.getElementById(config.containerId);
  if (!container) {
    console.error(`[PaygateSDK] #${config.containerId} not found`);
    return () => {};
  }

  const baseUrl = config.baseUrl ?? "https://sandbox.paygate.ng";
  const params = new URLSearchParams({
    pk: config.publicKey,
    userId: config.userId ?? "",
    showBalance: String(config.showBalance ?? true),
    showTransactions: String(config.showTransactions ?? true),
    transactionLimit: String(config.transactionLimit ?? 5),
    theme: config.theme ?? "light",
    currency: config.currency ?? "NGN",
    origin: window.location.origin,
  });

  const iframe = document.createElement("iframe");
  iframe.src = `${baseUrl}/widget/wallet?${params.toString()}`;
  iframe.style.width = "100%";
  iframe.style.height = "360px";
  iframe.style.border = "none";
  iframe.style.borderRadius = "8px";
  iframe.allow = "payment *";
  container.appendChild(iframe);

  const handler = (e: MessageEvent) => {
    if (!e.origin.startsWith(baseUrl.replace(/\/+$/, ""))) return;
    const { type } = (e.data ?? {}) as { type: string };
    if (type === "PAYGATE_TOPUP" && config.onTopUp) config.onTopUp();
    if (type === "PAYGATE_SEND" && config.onSend) config.onSend();
  };
  window.addEventListener("message", handler);

  return () => {
    window.removeEventListener("message", handler);
    iframe.remove();
  };
}

/**
 * Mount a standalone transaction feed widget.
 */
export function mountTransactionFeed(config: TransactionFeedConfig): () => void {
  const container = document.getElementById(config.containerId);
  if (!container) {
    console.error(`[PaygateSDK] #${config.containerId} not found`);
    return () => {};
  }

  const baseUrl = config.baseUrl ?? "https://sandbox.paygate.ng";
  const params = new URLSearchParams({
    pk: config.publicKey,
    limit: String(config.limit ?? 10),
    filter: config.filter ?? "all",
    theme: config.theme ?? "light",
    origin: window.location.origin,
  });

  const iframe = document.createElement("iframe");
  iframe.src = `${baseUrl}/widget/transactions?${params.toString()}`;
  iframe.style.width = "100%";
  iframe.style.height = "400px";
  iframe.style.border = "none";
  iframe.style.borderRadius = "8px";
  container.appendChild(iframe);

  return () => iframe.remove();
}

/**
 * Mount a payment status badge that auto-polls until terminal state.
 */
export function mountPaymentStatusBadge(
  config: PaymentStatusBadgeConfig,
  onTerminal?: (status: "success" | "failed" | "abandoned") => void
): () => void {
  const container = document.getElementById(config.containerId);
  if (!container) return () => {};

  const baseUrl = config.baseUrl ?? "https://sandbox.paygate.ng";
  const pollInterval = config.pollInterval ?? 5000;

  const badge = document.createElement("div");
  badge.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:13px;font-family:sans-serif;background:#f1f5f9;color:#64748b;";
  badge.textContent = "⏳ Checking…";
  container.appendChild(badge);

  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    try {
      const res = await fetch(
        `${baseUrl}/api/v1/payment/status/${encodeURIComponent(config.reference)}`,
        { headers: { Authorization: `Bearer ${config.publicKey}` } }
      );
      if (!res.ok) return;
      const { status } = await res.json();
      if (status === "success") {
        badge.style.background = "#dcfce7";
        badge.style.color = "#16a34a";
        badge.textContent = "✅ Payment Successful";
        stopped = true;
        onTerminal?.("success");
      } else if (status === "failed") {
        badge.style.background = "#fee2e2";
        badge.style.color = "#dc2626";
        badge.textContent = "❌ Payment Failed";
        stopped = true;
        onTerminal?.("failed");
      } else if (status === "abandoned") {
        badge.style.background = "#fef3c7";
        badge.style.color = "#d97706";
        badge.textContent = "⚠️ Abandoned";
        stopped = true;
        onTerminal?.("abandoned");
      } else {
        badge.textContent = "⏳ Processing…";
        setTimeout(poll, pollInterval);
      }
    } catch {
      setTimeout(poll, pollInterval);
    }
  };

  poll();

  return () => {
    stopped = true;
    badge.remove();
  };
}
