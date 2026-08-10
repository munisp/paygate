/**
 * PayGate Checkout Module
 * Embeddable checkout iframe with postMessage API.
 */

export interface CheckoutConfig {
  publicKey: string;
  amount: number;
  currency?: string;
  email?: string;
  phone?: string;
  name?: string;
  reference?: string;
  description?: string;
  channels?: string[];
  metadata?: Record<string, string>;
  primaryColor?: string;
  logo?: string;
  baseUrl?: string;
}

export type CheckoutEventType =
  | "PAYGATE_SUCCESS"
  | "PAYGATE_ERROR"
  | "PAYGATE_CLOSE"
  | "PAYGATE_READY"
  | "PAYGATE_PROCESSING";

export interface CheckoutEvent {
  type: CheckoutEventType;
  data?: Record<string, unknown>;
}

/**
 * Render an inline checkout form into a container div.
 * Returns a cleanup function.
 */
export function renderInlineCheckout(
  containerId: string,
  config: CheckoutConfig,
  onEvent: (event: CheckoutEvent) => void
): () => void {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Container #${containerId} not found`);

  const baseUrl = config.baseUrl ?? "https://sandbox.paygate.ng";
  const reference =
    config.reference ?? `PG-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

  const params = new URLSearchParams({
    pk: config.publicKey,
    amount: String(config.amount),
    currency: config.currency ?? "NGN",
    email: config.email ?? "",
    phone: config.phone ?? "",
    name: config.name ?? "",
    reference,
    description: config.description ?? "",
    channels: (config.channels ?? ["card", "bank_transfer"]).join(","),
    primaryColor: config.primaryColor ?? "#2563eb",
    logo: config.logo ?? "",
    inline: "true",
    origin: window.location.origin,
  });

  if (config.metadata) {
    params.set("metadata", JSON.stringify(config.metadata));
  }

  const iframe = document.createElement("iframe");
  iframe.src = `${baseUrl}/checkout/embed?${params.toString()}`;
  iframe.style.width = "100%";
  iframe.style.height = "520px";
  iframe.style.border = "none";
  iframe.style.borderRadius = "8px";
  iframe.allow = "payment *";
  container.appendChild(iframe);

  const handler = (e: MessageEvent) => {
    if (!e.origin.startsWith(baseUrl.replace(/\/+$/, ""))) return;
    const { type, data } = (e.data ?? {}) as CheckoutEvent;
    if (type) onEvent({ type, data });
  };
  window.addEventListener("message", handler);

  return () => {
    window.removeEventListener("message", handler);
    iframe.remove();
  };
}

/**
 * Programmatic checkout — opens a popup window (fallback for environments that block iframes).
 */
export function openCheckoutPopup(
  config: CheckoutConfig,
  onEvent: (event: CheckoutEvent) => void
): Window | null {
  const baseUrl = config.baseUrl ?? "https://sandbox.paygate.ng";
  const reference =
    config.reference ?? `PG-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

  const params = new URLSearchParams({
    pk: config.publicKey,
    amount: String(config.amount),
    currency: config.currency ?? "NGN",
    email: config.email ?? "",
    reference,
    origin: window.location.origin,
    popup: "true",
  });

  const popup = window.open(
    `${baseUrl}/checkout?${params.toString()}`,
    "paygate_checkout",
    "width=480,height=620,scrollbars=yes,resizable=no"
  );

  if (!popup) {
    onEvent({ type: "PAYGATE_ERROR", data: { code: "POPUP_BLOCKED", message: "Popup was blocked" } });
    return null;
  }

  const handler = (e: MessageEvent) => {
    if (!e.origin.startsWith(baseUrl.replace(/\/+$/, ""))) return;
    const { type, data } = (e.data ?? {}) as CheckoutEvent;
    if (type) {
      onEvent({ type, data });
      if (type === "PAYGATE_SUCCESS" || type === "PAYGATE_CLOSE") {
        window.removeEventListener("message", handler);
        popup.close();
      }
    }
  };
  window.addEventListener("message", handler);

  return popup;
}
