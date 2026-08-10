/**
 * tigerbeetleClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TigerBeetle double-entry accounting client for PayGate.
 * TigerBeetle provides ACID-compliant, high-throughput financial ledger.
 * Used for: merchant settlement accounts, escrow, float management,
 * USDC/stablecoin accounts, insurance reserves, and staff expense accounts.
 *
 * Account types (ledger IDs):
 *   1 = NGN merchant settlement
 *   2 = USD merchant settlement
 *   3 = EUR merchant settlement
 *   4 = USDC accounts
 *   5 = Insurance reserve
 *   6 = Staff expense
 *   7 = Escrow/float
 */

import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TBAccount {
  id: bigint;
  user_data: bigint;
  ledger: number;
  code: number;
  flags: number;
}

export interface TBTransfer {
  id: bigint;
  debit_account_id: bigint;
  credit_account_id: bigint;
  amount: bigint;
  ledger: number;
  code: number;
  flags: number;
  timeout?: number;
}

export const TB_LEDGER = {
  NGN: 1,
  USD: 2,
  EUR: 3,
  USDC: 4,
  INSURANCE: 5,
  STAFF: 6,
  ESCROW: 7,
} as const;

export const TB_ACCOUNT_CODE = {
  MERCHANT_SETTLEMENT: 1,
  MERCHANT_FLOAT: 2,
  ESCROW: 3,
  FEE_COLLECTION: 4,
  INSURANCE_RESERVE: 5,
  STAFF_EXPENSE: 6,
} as const;

// ─── Lazy client ─────────────────────────────────────────────────────────────
let _client: any = null;

async function getClient() {
  if (!ENV.tigerbeetleAddress) return null;
  if (_client) return _client;
  try {
    const { createClient } = await import("tigerbeetle-node" as any);
    _client = createClient({
      cluster_id: 0n,
      replica_addresses: [ENV.tigerbeetleAddress],
    });
    return _client;
  } catch {
    console.warn("[tigerbeetle] tigerbeetle-node not available — ledger operations disabled");
    return null;
  }
}

// ─── ID generation ────────────────────────────────────────────────────────────
let _idCounter = BigInt(Date.now()) * 1_000_000n;

export function nextTBId(): bigint {
  return ++_idCounter;
}

export function merchantAccountId(merchantId: string, ledger: number): bigint {
  // Deterministic ID from merchantId + ledger
  let hash = 0n;
  for (let i = 0; i < merchantId.length; i++) {
    hash = (hash * 31n + BigInt(merchantId.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
  }
  return (hash & 0xFFFFFFFFFFFFn) | (BigInt(ledger) << 48n);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a merchant settlement account in TigerBeetle.
 */
export async function createMerchantAccount(
  merchantId: string,
  currency: "NGN" | "USD" | "EUR" | "USDC"
): Promise<{ success: boolean; accountId: string }> {
  const client = await getClient();
  const ledger = TB_LEDGER[currency];
  const accountId = merchantAccountId(merchantId, ledger);

  if (!client) {
    return { success: false, accountId: accountId.toString() };
  }

  try {
    const errors = await client.createAccounts([{
      id: accountId,
      user_data: BigInt(merchantId.replace(/\D/g, "").slice(0, 18) || "0"),
      ledger,
      code: TB_ACCOUNT_CODE.MERCHANT_SETTLEMENT,
      flags: 0,
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      timestamp: 0n,
    }]);

    return {
      success: errors.length === 0 || errors[0]?.result === 1, // 1 = exists
      accountId: accountId.toString(),
    };
  } catch (err) {
    console.error("[tigerbeetle] createMerchantAccount error:", err);
    return { success: false, accountId: accountId.toString() };
  }
}

/**
 * Record a financial transfer between two accounts.
 */
export async function recordTransfer(params: {
  debitMerchantId: string;
  creditMerchantId: string;
  amount: number;
  currency: "NGN" | "USD" | "EUR" | "USDC";
  reference?: string;
}): Promise<{ success: boolean; transferId: string }> {
  const client = await getClient();
  const ledger = TB_LEDGER[params.currency];
  const transferId = nextTBId();

  if (!client) {
    return { success: false, transferId: transferId.toString() };
  }

  try {
    const errors = await client.createTransfers([{
      id: transferId,
      debit_account_id: merchantAccountId(params.debitMerchantId, ledger),
      credit_account_id: merchantAccountId(params.creditMerchantId, ledger),
      amount: BigInt(Math.round(params.amount * 100)), // store in minor units
      ledger,
      code: 1,
      flags: 0,
      timeout: 0n,
      timestamp: 0n,
    }]);

    return {
      success: errors.length === 0,
      transferId: transferId.toString(),
    };
  } catch (err) {
    console.error("[tigerbeetle] recordTransfer error:", err);
    return { success: false, transferId: transferId.toString() };
  }
}

/**
 * Get account balance.
 */
export async function getAccountBalance(
  merchantId: string,
  currency: "NGN" | "USD" | "EUR" | "USDC"
): Promise<{ balance: number; pending: number } | null> {
  const client = await getClient();
  if (!client) return null;

  const ledger = TB_LEDGER[currency];
  const accountId = merchantAccountId(merchantId, ledger);

  try {
    const accounts = await client.lookupAccounts([accountId]);
    if (!accounts.length) return null;
    const acc = accounts[0];
    const balance = Number(acc.credits_posted - acc.debits_posted) / 100;
    const pending = Number(acc.credits_pending - acc.debits_pending) / 100;
    return { balance, pending };
  } catch (err) {
    console.error("[tigerbeetle] getAccountBalance error:", err);
    return null;
  }
}
