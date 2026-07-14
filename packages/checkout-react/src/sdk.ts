/**
 * Core PayGate checkout SDK — framework-agnostic, works in any browser.
 * This is the same logic as client/src/lib/paygate-checkout-sdk.ts,
 * extracted here for the npm package build.
 */

export interface PayGateCheckoutConfig {
  /** Your PayGate public key (pk_live_xxx or pk_test_xxx) */
  publicKey: string;
  /** Customer email address */
  email: string;
  /** Amount in the smallest currency unit (kobo for NGN, pesewas for GHS, etc.) */
  amount: number;
  /** ISO 4217 currency code. Defaults to NGN. */
  currency?: string;
  /** Order or invoice reference. Auto-generated if omitted. */
  reference?: string;
  /** Metadata object passed through to webhooks */
  metadata?: Record<string, unknown>;
  /** Override the hosted checkout base URL (useful for sandbox) */
  checkoutBaseUrl?: string;
  /** Called when the customer completes payment successfully */
  onSuccess?: (data: { reference: string; status: string }) => void;
  /** Called when the customer closes the modal without paying */
  onClose?: () => void;
  /** Called when an error occurs during payment */
  onError?: (error: { message: string; code?: string }) => void;
}

const DEFAULT_BASE = "https://checkout.paygate.africa";

let _modal: HTMLDivElement | null = null;
let _iframe: HTMLIFrameElement | null = null;

function buildCheckoutUrl(config: PayGateCheckoutConfig): string {
  const base = config.checkoutBaseUrl ?? DEFAULT_BASE;
  const params = new URLSearchParams({
    pk: config.publicKey,
    email: config.email,
    amount: String(config.amount),
    currency: config.currency ?? "NGN",
    ref: config.reference ?? `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    embed: "1",
  });
  if (config.metadata) {
    params.set("meta", btoa(JSON.stringify(config.metadata)));
  }
  return `${base}/pay/embed?${params.toString()}`;
}

function destroyModal() {
  if (_modal) {
    document.body.removeChild(_modal);
    _modal = null;
    _iframe = null;
  }
}

function handleMessage(config: PayGateCheckoutConfig, event: MessageEvent) {
  if (!event.data || typeof event.data !== "object") return;
  const { type, payload } = event.data as { type: string; payload?: any };

  switch (type) {
    case "PAYGATE_SUCCESS":
      config.onSuccess?.(payload);
      destroyModal();
      break;
    case "PAYGATE_CLOSE":
      config.onClose?.();
      destroyModal();
      break;
    case "PAYGATE_ERROR":
      config.onError?.(payload);
      destroyModal();
      break;
  }
}

/**
 * Opens the PayGate hosted checkout modal.
 * Injects an iframe overlay into the current page.
 */
export function openCheckout(config: PayGateCheckoutConfig): void {
  if (_modal) destroyModal();

  const url = buildCheckoutUrl(config);

  // Overlay backdrop
  _modal = document.createElement("div");
  _modal.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483647",
    "background:rgba(0,0,0,0.55)", "display:flex",
    "align-items:center", "justify-content:center",
    "font-family:system-ui,sans-serif",
  ].join(";");

  // Iframe container
  const container = document.createElement("div");
  container.style.cssText = [
    "width:min(480px,100vw)", "height:min(680px,100vh)",
    "border-radius:16px", "overflow:hidden",
    "box-shadow:0 24px 64px rgba(0,0,0,0.4)",
    "background:#fff", "position:relative",
  ].join(";");

  _iframe = document.createElement("iframe");
  _iframe.src = url;
  _iframe.style.cssText = "width:100%;height:100%;border:none;";
  _iframe.allow = "payment";
  _iframe.setAttribute("allowpaymentrequest", "true");

  container.appendChild(_iframe);
  _modal.appendChild(container);
  document.body.appendChild(_modal);

  // Close on backdrop click
  _modal.addEventListener("click", (e) => {
    if (e.target === _modal) {
      config.onClose?.();
      destroyModal();
    }
  });

  const listener = (e: MessageEvent) => handleMessage(config, e);
  window.addEventListener("message", listener);

  // Clean up listener when modal is destroyed
  const orig = destroyModal;
  (destroyModal as any) = () => {
    window.removeEventListener("message", listener);
    orig();
    (destroyModal as any) = orig;
  };
}
