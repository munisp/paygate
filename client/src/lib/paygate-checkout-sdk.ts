/**
 * PayGate Checkout SDK v1.0
 * Drop-in modal checkout for merchant websites.
 *
 * Vanilla JS:
 *   <script src="https://js.paygate.ng/v1/checkout.js"></script>
 *   PayGate.checkout({ publicKey, amount, currency, email, onSuccess, onClose });
 *
 * React:
 *   import { PayGateCheckout } from "@paygate/checkout-react";
 */
export interface PayGateCheckoutConfig {
  publicKey: string;
  amount: number;
  currency?: string;
  email?: string;
  name?: string;
  phone?: string;
  reference?: string;
  description?: string;
  metadata?: Record<string, string>;
  channels?: Array<"card" | "bank_transfer" | "ussd" | "bnpl" | "usdc">;
  onSuccess?: (reference: string, sessionId: string) => void;
  onClose?: () => void;
  onError?: (error: { message: string; code?: string }) => void;
  baseUrl?: string;
}

const DEFAULT_BASE = typeof window !== "undefined" ? window.location.origin : "https://app.paygate.ng";

function genRef() { return "PG_" + Date.now() + "_" + Math.random().toString(36).slice(2,8).toUpperCase(); }

export function openCheckout(config: PayGateCheckoutConfig): () => void {
  const base = config.baseUrl ?? DEFAULT_BASE;
  const ref  = config.reference ?? genRef();
  const qs   = new URLSearchParams({
    pk: config.publicKey, amount: String(config.amount),
    currency: config.currency ?? "NGN", ref,
    ...(config.email ? { email: config.email } : {}),
    ...(config.name  ? { name: config.name }   : {}),
    ...(config.phone ? { phone: config.phone } : {}),
    ...(config.description ? { desc: config.description } : {}),
    ...(config.channels    ? { channels: config.channels.join(",") } : {}),
    ...(config.metadata    ? { meta: JSON.stringify(config.metadata) } : {}),
    embed: "1",
  });

  if (!document.getElementById("pg-sdk-styles")) {
    const s = document.createElement("style"); s.id = "pg-sdk-styles";
    s.textContent = `@keyframes pgFadeIn{from{opacity:0}to{opacity:1}}@keyframes pgSlideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`;
    document.head.appendChild(s);
  }

  const overlay = Object.assign(document.createElement("div"), { id: "pg-checkout-overlay" });
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);animation:pgFadeIn 0.2s ease";

  const modal = document.createElement("div");
  modal.style.cssText = "background:#fff;border-radius:16px;width:min(480px,calc(100vw - 32px));height:min(680px,calc(100vh - 32px));overflow:hidden;position:relative;box-shadow:0 25px 60px rgba(0,0,0,0.3);animation:pgSlideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)";

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "✕";
  closeBtn.style.cssText = "position:absolute;top:12px;right:12px;z-index:10;background:rgba(0,0,0,0.08);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:14px;color:#374151";

  const iframe = document.createElement("iframe");
  iframe.src = `${base}/pay/embed?${qs}`;
  iframe.style.cssText = "width:100%;height:100%;border:none;display:block";
  iframe.allow = "payment"; iframe.title = "PayGate Checkout";

  modal.appendChild(closeBtn); modal.appendChild(iframe);
  overlay.appendChild(modal); document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  function close() { overlay.remove(); document.body.style.overflow = ""; config.onClose?.(); }
  closeBtn.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  function onMsg(e: MessageEvent) {
    if (new URL(base).origin !== e.origin) return;
    const d = e.data as { type: string; reference?: string; sessionId?: string; error?: { message: string } };
    if (d?.type === "PAYGATE_SUCCESS")  { window.removeEventListener("message", onMsg); overlay.remove(); document.body.style.overflow = ""; config.onSuccess?.(d.reference ?? ref, d.sessionId ?? ""); }
    if (d?.type === "PAYGATE_CLOSE")    { window.removeEventListener("message", onMsg); close(); }
    if (d?.type === "PAYGATE_ERROR")    { window.removeEventListener("message", onMsg); overlay.remove(); document.body.style.overflow = ""; config.onError?.(d.error ?? { message: "Payment failed" }); }
  }
  window.addEventListener("message", onMsg);
  return close;
}

export const PayGate = { checkout: openCheckout, version: "1.0.0" };
if (typeof window !== "undefined") (window as any).PayGate = PayGate;
