/**
 * PayGate JS SDK
 * Embeddable checkout, wallet widget, and payment status for web apps.
 * Version: 1.0.0
 */

export interface PaygateSDKConfig {
  publicKey: string;
  environment?: "sandbox" | "production";
  baseUrl?: string;
  onSuccess?: (data: PaymentSuccessData) => void;
  onError?: (error: PaymentError) => void;
  onClose?: () => void;
}

export interface PaymentSuccessData {
  reference: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: "success";
  timestamp: string;
}

export interface PaymentError {
  code: string;
  message: string;
  reference?: string;
}

export interface CheckoutOptions {
  amount: number;
  currency?: string;
  email?: string;
  phone?: string;
  name?: string;
  reference?: string;
  description?: string;
  metadata?: Record<string, string>;
  channels?: Array<"card" | "bank_transfer" | "ussd" | "qr" | "wallet">;
  logo?: string;
  primaryColor?: string;
}

export interface WalletWidgetOptions {
  containerId: string;
  userId?: string;
  showBalance?: boolean;
  showTransactions?: boolean;
  theme?: "light" | "dark";
  currency?: string;
}

const DEFAULT_SANDBOX_URL = "https://sandbox.paygate.ng";
const DEFAULT_PROD_URL = "https://api.paygate.ng";
const SDK_VERSION = "1.0.0";

export class PaygateSDK {
  private config: Required<PaygateSDKConfig>;
  private baseUrl: string;
  private checkoutFrame: HTMLIFrameElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private messageHandler: ((e: MessageEvent) => void) | null = null;

  constructor(config: PaygateSDKConfig) {
    this.config = {
      publicKey: config.publicKey,
      environment: config.environment ?? "sandbox",
      baseUrl:
        config.baseUrl ??
        (config.environment === "production" ? DEFAULT_PROD_URL : DEFAULT_SANDBOX_URL),
      onSuccess: config.onSuccess ?? (() => {}),
      onError: config.onError ?? (() => {}),
      onClose: config.onClose ?? (() => {}),
    };
    this.baseUrl = this.config.baseUrl;
  }

  /**
   * Open the PayGate inline checkout modal.
   */
  openCheckout(options: CheckoutOptions): void {
    this.closeCheckout();

    const params = new URLSearchParams({
      pk: this.config.publicKey,
      amount: String(options.amount),
      currency: options.currency ?? "NGN",
      email: options.email ?? "",
      phone: options.phone ?? "",
      name: options.name ?? "",
      reference: options.reference ?? this._generateRef(),
      description: options.description ?? "",
      channels: (options.channels ?? ["card", "bank_transfer"]).join(","),
      logo: options.logo ?? "",
      primaryColor: options.primaryColor ?? "#2563eb",
      sdk_version: SDK_VERSION,
      origin: window.location.origin,
    });

    if (options.metadata) {
      params.set("metadata", JSON.stringify(options.metadata));
    }

    const checkoutUrl = `${this.baseUrl}/checkout/embed?${params.toString()}`;

    // Overlay
    this.overlay = document.createElement("div");
    Object.assign(this.overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.6)",
      zIndex: "999998",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });

    // iFrame
    this.checkoutFrame = document.createElement("iframe");
    Object.assign(this.checkoutFrame.style, {
      width: "480px",
      maxWidth: "95vw",
      height: "600px",
      maxHeight: "95vh",
      border: "none",
      borderRadius: "12px",
      background: "#fff",
      boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
    });
    this.checkoutFrame.src = checkoutUrl;
    this.checkoutFrame.allow = "payment *";

    this.overlay.appendChild(this.checkoutFrame);
    document.body.appendChild(this.overlay);

    // Listen for postMessage events from the iframe
    this.messageHandler = (e: MessageEvent) => {
      if (!e.origin.startsWith(this.baseUrl.replace(/\/+$/, ""))) return;
      const { type, data } = e.data ?? {};
      if (type === "PAYGATE_SUCCESS") {
        this.config.onSuccess(data as PaymentSuccessData);
        this.closeCheckout();
      } else if (type === "PAYGATE_ERROR") {
        this.config.onError(data as PaymentError);
        this.closeCheckout();
      } else if (type === "PAYGATE_CLOSE") {
        this.config.onClose();
        this.closeCheckout();
      }
    };
    window.addEventListener("message", this.messageHandler);

    // Close on overlay click
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.config.onClose();
        this.closeCheckout();
      }
    });
  }

  /**
   * Close and clean up the checkout modal.
   */
  closeCheckout(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.checkoutFrame = null;
    }
  }

  /**
   * Mount a wallet balance widget into a container element.
   */
  mountWalletWidget(options: WalletWidgetOptions): () => void {
    const container = document.getElementById(options.containerId);
    if (!container) {
      console.error(`[PaygateSDK] Container #${options.containerId} not found`);
      return () => {};
    }

    const params = new URLSearchParams({
      pk: this.config.publicKey,
      userId: options.userId ?? "",
      showBalance: String(options.showBalance ?? true),
      showTransactions: String(options.showTransactions ?? true),
      theme: options.theme ?? "light",
      currency: options.currency ?? "NGN",
      sdk_version: SDK_VERSION,
      origin: window.location.origin,
    });

    const iframe = document.createElement("iframe");
    iframe.src = `${this.baseUrl}/widget/wallet?${params.toString()}`;
    iframe.style.width = "100%";
    iframe.style.height = "320px";
    iframe.style.border = "none";
    iframe.style.borderRadius = "8px";
    iframe.allow = "payment *";
    container.appendChild(iframe);

    return () => {
      iframe.remove();
    };
  }

  /**
   * Query the status of a payment by reference.
   */
  async getPaymentStatus(reference: string): Promise<{
    status: "pending" | "success" | "failed" | "abandoned";
    amount?: number;
    currency?: string;
    paidAt?: string;
  }> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/payment/status/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.publicKey}`,
          "X-SDK-Version": SDK_VERSION,
        },
      }
    );
    if (!res.ok) {
      throw new Error(`[PaygateSDK] Status check failed: ${res.status}`);
    }
    return res.json();
  }

  /**
   * Verify a payment server-side (call from your backend, not frontend).
   * @deprecated Use your backend secret key for verification instead.
   */
  async verifyPayment(reference: string): Promise<PaymentSuccessData> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/payment/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.publicKey}`,
          "X-SDK-Version": SDK_VERSION,
        },
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `Verification failed: ${res.status}`);
    }
    return res.json();
  }

  private _generateRef(): string {
    return `PG-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  }
}

// UMD/browser global
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).PaygateSDK = PaygateSDK;
}

export default PaygateSDK;
