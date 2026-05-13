/**
 * mojaloopClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mojaloop interoperability client for PayGate cross-border / interbank payments.
 * Implements the Mojaloop API v1.1 spec for FSPIOP (Financial Services Provider
 * Interoperability Protocol).
 *
 * Endpoints:
 *   /parties     — party lookup (MSISDN, ACCOUNT_ID, etc.)
 *   /quotes      — quote request / response
 *   /transfers   — transfer request / fulfillment
 */

import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────
export type PartyIdType = "MSISDN" | "ACCOUNT_ID" | "EMAIL" | "PERSONAL_ID" | "BUSINESS" | "DEVICE" | "IBAN" | "ALIAS";

export interface MojaloopParty {
  partyIdInfo: {
    partyIdType: PartyIdType;
    partyIdentifier: string;
    fspId?: string;
  };
  name?: string;
  personalInfo?: {
    complexName?: { firstName?: string; lastName?: string };
    dateOfBirth?: string;
  };
}

export interface MojaloopQuoteRequest {
  quoteId: string;
  transactionId: string;
  payee: MojaloopParty;
  payer: MojaloopParty;
  amountType: "SEND" | "RECEIVE";
  amount: { currency: string; amount: string };
  transactionType: {
    scenario: "TRANSFER" | "PAYMENT" | "DEPOSIT" | "WITHDRAWAL" | "REFUND";
    initiator: "PAYER" | "PAYEE";
    initiatorType: "CONSUMER" | "AGENT" | "BUSINESS" | "DEVICE";
  };
  note?: string;
}

export interface MojaloopTransferRequest {
  transferId: string;
  payeeFsp: string;
  payerFsp: string;
  amount: { currency: string; amount: string };
  ilpPacket: string;
  condition: string;
  expiration: string;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
async function mojaloopRequest(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; data: unknown }> {
  const baseUrl = ENV.mojaloopUrl;
  const apiKey = ENV.mojaloopApiKey;

  if (!baseUrl) {
    return { status: 503, data: { error: "Mojaloop not configured" } };
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/vnd.interoperability.parties+json;version=1.1",
        Accept: "application/vnd.interoperability.parties+json;version=1.1",
        "FSPIOP-Source": "paygate",
        Date: new Date().toUTCString(),
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...(headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    let data: unknown;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch (err) {
    console.error(`[mojaloop] Request ${method} ${path} failed:`, err);
    return { status: 503, data: { error: String(err) } };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Lookup a party by identifier (e.g., phone number).
 */
export async function lookupParty(
  idType: PartyIdType,
  idValue: string
): Promise<{ found: boolean; party?: MojaloopParty; error?: string }> {
  const { status, data } = await mojaloopRequest("GET", `/parties/${idType}/${idValue}`);
  if (status === 200) {
    return { found: true, party: data as MojaloopParty };
  }
  return { found: false, error: `HTTP ${status}` };
}

/**
 * Request a quote for a transfer.
 */
export async function requestQuote(
  quoteReq: MojaloopQuoteRequest
): Promise<{ success: boolean; quoteId: string; error?: string }> {
  const { status } = await mojaloopRequest("POST", "/quotes", quoteReq, {
    "Content-Type": "application/vnd.interoperability.quotes+json;version=1.1",
    Accept: "application/vnd.interoperability.quotes+json;version=1.1",
  });
  return {
    success: status === 202,
    quoteId: quoteReq.quoteId,
    error: status !== 202 ? `HTTP ${status}` : undefined,
  };
}

/**
 * Initiate a transfer.
 */
export async function initiateTransfer(
  transferReq: MojaloopTransferRequest
): Promise<{ success: boolean; transferId: string; error?: string }> {
  const { status } = await mojaloopRequest("POST", "/transfers", transferReq, {
    "Content-Type": "application/vnd.interoperability.transfers+json;version=1.1",
    Accept: "application/vnd.interoperability.transfers+json;version=1.1",
  });
  return {
    success: status === 202,
    transferId: transferReq.transferId,
    error: status !== 202 ? `HTTP ${status}` : undefined,
  };
}

/**
 * Get transfer status.
 */
export async function getTransferStatus(
  transferId: string
): Promise<{ status: string; data: unknown }> {
  const result = await mojaloopRequest("GET", `/transfers/${transferId}`, undefined, {
    "Content-Type": "application/vnd.interoperability.transfers+json;version=1.1",
    Accept: "application/vnd.interoperability.transfers+json;version=1.1",
  });
  return { status: String(result.status), data: result.data };
}

/**
 * Generate a Mojaloop-compatible transfer ID (UUID v4).
 */
export function generateTransferId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
