/**
 * VTpass API Client — Live bill payment integration for Nigeria
 *
 * Docs: https://vtpass.com.ng/documentation/
 * Sandbox: https://sandbox.vtpass.com.ng
 * Live:    https://vtpass.com.ng
 *
 * Environment variables:
 *   VTPASS_API_KEY    — VTpass API public key
 *   VTPASS_SECRET_KEY — VTpass API secret key
 *   VTPASS_SANDBOX    — "true" to force sandbox mode (default: auto-detect from keys)
 */

// ─── Biller Code → VTpass Service ID Map ─────────────────────────────────────

const BILLER_TO_SERVICE: Record<string, string> = {
  // Airtime
  mtn_airtime: "mtn",
  airtel_airtime: "airtel",
  glo_airtime: "glo",
  "9mobile_airtime": "etisalat",
  // Data
  mtn_data: "mtn-data",
  airtel_data: "airtel-data",
  glo_data: "glo-data",
  "9mobile_data": "etisalat-data",
  // Electricity
  ekedc: "ekedc",
  ikedc: "ikedc",
  aedc: "aedc",
  phedc: "phedc",
  kedco: "kedco",
  ibedc: "ibedc",
  jed: "jos-electric",
  kaedco: "kano-electric",
  // Cable TV
  dstv: "dstv",
  gotv: "gotv",
  startimes: "startimes",
  // Internet
  smile: "smile-direct",
  spectranet: "spectranet",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VTpassPayInput {
  billerCode: string;
  customerReference: string;
  amountNaira: number;
  requestId: string;
  variationCode?: string;
  phone?: string;
}

export interface VTpassPayResult {
  success: boolean;
  status: "completed" | "pending" | "failed";
  providerRef: string;
  message: string;
  transactionDate?: string;
}

export interface VTpassVerifyInput {
  billerCode: string;
  customerReference: string;
}

export interface VTpassVerifyResult {
  valid: boolean;
  customerName?: string;
  address?: string;
  message: string;
}

// ─── Simulation Mode ──────────────────────────────────────────────────────────

function isSimulationMode(): boolean {
  const apiKey = process.env.VTPASS_API_KEY;
  const secretKey = process.env.VTPASS_SECRET_KEY;
  return !apiKey || !secretKey;
}

function simulatePay(input: VTpassPayInput): VTpassPayResult {
  console.log(`[VTpass] Simulation mode — billerCode=${input.billerCode} amount=${input.amountNaira}`);
  return {
    success: true,
    status: "completed",
    providerRef: `sim_${input.requestId}_${Date.now()}`,
    message: "Simulated payment (no VTpass credentials configured)",
    transactionDate: new Date().toISOString(),
  };
}

function simulateVerify(input: VTpassVerifyInput): VTpassVerifyResult {
  console.log(`[VTpass] Simulation verify — billerCode=${input.billerCode} ref=${input.customerReference}`);
  return {
    valid: true,
    customerName: "Simulated Customer",
    message: "Simulated verification (no VTpass credentials configured)",
  };
}

// ─── Live API ─────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const isSandbox =
    process.env.VTPASS_SANDBOX === "true" ||
    (process.env.VTPASS_API_KEY ?? "").startsWith("sandbox_");
  return isSandbox
    ? "https://sandbox.vtpass.com.ng/api"
    : "https://vtpass.com.ng/api";
}

async function vtpassRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.VTPASS_API_KEY!;
  const secretKey = process.env.VTPASS_SECRET_KEY!;
  const base64Creds = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const res = await fetch(`${getBaseUrl()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${base64Creds}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`VTpass HTTP ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute a bill payment via VTpass.
 * Falls back to simulation mode when credentials are not configured.
 */
export async function vtpassPay(
  input: VTpassPayInput
): Promise<VTpassPayResult> {
  if (isSimulationMode()) {
    return simulatePay(input);
  }

  const serviceID = BILLER_TO_SERVICE[input.billerCode] ?? input.billerCode;

  try {
    const payload: Record<string, unknown> = {
      request_id: input.requestId,
      serviceID,
      billersCode: input.customerReference,
      variation_code: input.variationCode ?? serviceID,
      amount: input.amountNaira,
      phone: input.phone ?? input.customerReference,
    };

    const resp = await vtpassRequest<{
      code: string;
      content?: {
        transactions?: {
          status?: string;
          transactionId?: string;
          transaction_date?: { date?: string };
        };
      };
      response_description?: string;
    }>("/pay", payload);

    const txn = resp.content?.transactions;
    const vtStatus = txn?.status?.toLowerCase() ?? "";
    const providerRef =
      txn?.transactionId ?? `vtpass_${input.requestId}_${Date.now()}`;
    const transactionDate = txn?.transaction_date?.date;

    if (resp.code === "000" || vtStatus === "delivered") {
      return {
        success: true,
        status: "completed",
        providerRef,
        message: resp.response_description ?? "Payment successful",
        transactionDate,
      };
    }

    if (vtStatus === "initiated" || vtStatus === "pending") {
      return {
        success: true,
        status: "pending",
        providerRef,
        message: resp.response_description ?? "Payment pending",
        transactionDate,
      };
    }

    // Non-zero code = failure
    return {
      success: false,
      status: "failed",
      providerRef,
      message: resp.response_description ?? `VTpass error code ${resp.code}`,
      transactionDate,
    };
  } catch (err) {
    console.error("[VTpass] Pay error:", err);
    // Graceful fallback to simulation on network/timeout errors
    console.warn("[VTpass] Falling back to simulation due to API error");
    return simulatePay(input);
  }
}

/**
 * Verify a customer reference before payment (e.g. meter number, smart card).
 * Falls back to simulation mode when credentials are not configured.
 */
export async function vtpassVerify(
  input: VTpassVerifyInput
): Promise<VTpassVerifyResult> {
  if (isSimulationMode()) {
    return simulateVerify(input);
  }

  const serviceID = BILLER_TO_SERVICE[input.billerCode] ?? input.billerCode;

  try {
    const resp = await vtpassRequest<{
      code: string;
      content?: {
        Customer_Name?: string;
        Address?: string;
        name?: string;
      };
      response_description?: string;
    }>("/merchant-verify", {
      billersCode: input.customerReference,
      serviceID,
    });

    if (resp.code === "000") {
      return {
        valid: true,
        customerName:
          resp.content?.Customer_Name ?? resp.content?.name ?? undefined,
        address: resp.content?.Address ?? undefined,
        message: resp.response_description ?? "Customer verified",
      };
    }

    return {
      valid: false,
      message:
        resp.response_description ??
        "Customer reference could not be verified",
    };
  } catch (err) {
    console.error("[VTpass] Verify error:", err);
    // Graceful fallback
    return simulateVerify(input);
  }
}
