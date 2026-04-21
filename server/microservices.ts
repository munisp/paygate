/**
 * Microservice HTTP client helpers
 *
 * Provides typed fetch wrappers for all polyglot backend services:
 *  - Rust inventory-engine  (port 8091)
 *  - Rust loyalty-ledger    (port 8092)
 *  - Python payroll-service (port 8093)
 *  - Python kiosk-health    (port 8094)
 *  - Python fraud-scoring   (port 8083)
 *  - Python USSD-gateway    (port 8095)
 *
 * Each function falls back gracefully when the service is unavailable,
 * returning null so callers can degrade to direct-DB mode.
 */
import { ENV } from "./_core/env";

// ─── Generic fetch helper ────────────────────────────────────────────────────
async function svcFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
    if (!res.ok) {
      console.warn(`[microservice] ${url} returned ${res.status}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (e) {
    console.warn(`[microservice] ${url} unreachable:`, (e as Error).message);
    return null;
  }
}

// ─── Rust: Inventory Engine ──────────────────────────────────────────────────
export interface RustInventoryItem {
  id: string;
  merchant_id: string;
  name: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
  cost_per_unit_kobo: number;
  needs_reorder: boolean;
}

export interface RustRecipeCost {
  menu_item_id: string;
  total_cost_kobo: number;
  ingredients: Array<{ item_id: string; name: string; quantity: number; cost_kobo: number }>;
}

export interface RustCOGS {
  merchant_id: string;
  from_date: string;
  to_date: string;
  total_cogs_kobo: number;
  transaction_count: number;
}

export async function rustListInventoryItems(merchantId: string): Promise<RustInventoryItem[] | null> {
  return svcFetch<RustInventoryItem[]>(`${ENV.inventoryEngineUrl}/inventory/items/${merchantId}`);
}

export async function rustGetRecipeCost(menuItemId: string): Promise<RustRecipeCost | null> {
  return svcFetch<RustRecipeCost>(`${ENV.inventoryEngineUrl}/inventory/recipe-cost/${menuItemId}`);
}

export async function rustGetCOGS(merchantId: string, from: string, to: string): Promise<RustCOGS | null> {
  return svcFetch<RustCOGS>(`${ENV.inventoryEngineUrl}/inventory/cogs/${merchantId}?from=${from}&to=${to}`);
}

export async function rustAdjustStock(payload: {
  item_id: string; merchant_id: string; quantity: number;
  adjustment_type: "restock" | "consume" | "waste" | "adjust"; note?: string;
}): Promise<{ ok: boolean; new_stock: number } | null> {
  return svcFetch(`${ENV.inventoryEngineUrl}/inventory/adjust`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Rust: Loyalty Ledger ────────────────────────────────────────────────────
export interface RustLoyaltyBalance {
  merchant_id: string;
  customer_id: string;
  points_balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
}

export interface RustLoyaltyTransaction {
  id: string;
  account_id: string;
  points: number;
  transaction_type: "earn" | "redeem" | "expire" | "adjust";
  order_id?: string;
  created_at: string;
}

export async function rustGetLoyaltyBalance(merchantId: string, customerId: string): Promise<RustLoyaltyBalance | null> {
  return svcFetch<RustLoyaltyBalance>(`${ENV.loyaltyLedgerUrl}/loyalty/balance/${merchantId}/${customerId}`);
}

export async function rustEarnPoints(payload: {
  merchant_id: string; customer_id: string; points: number;
  order_id?: string; earn_rate?: number;
}): Promise<{ ok: boolean; new_balance: number } | null> {
  return svcFetch(`${ENV.loyaltyLedgerUrl}/loyalty/earn`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rustRedeemPoints(payload: {
  merchant_id: string; customer_id: string; points: number; order_id?: string;
}): Promise<{ ok: boolean; new_balance: number; kobo_value: number } | null> {
  return svcFetch(`${ENV.loyaltyLedgerUrl}/loyalty/redeem`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rustGetLoyaltyHistory(merchantId: string, customerId: string): Promise<RustLoyaltyTransaction[] | null> {
  return svcFetch<RustLoyaltyTransaction[]>(`${ENV.loyaltyLedgerUrl}/loyalty/history/${merchantId}/${customerId}`);
}

// ─── Python: Payroll Service ─────────────────────────────────────────────────
export interface PayrollRunResult {
  run_id: string;
  merchant_id: string;
  period_start: string;
  period_end: string;
  total_gross_kobo: number;
  total_tax_kobo: number;
  total_net_kobo: number;
  staff_count: number;
  stubs: Array<{
    staff_id: string; name: string; gross_kobo: number;
    tax_kobo: number; net_kobo: number; tips_kobo: number;
  }>;
}

export async function pythonRunPayroll(payload: {
  merchant_id: string; period_start: string; period_end: string;
  staff_ids?: string[];
}): Promise<PayrollRunResult | null> {
  return svcFetch(`${ENV.payrollServiceUrl}/payroll/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pythonGetPayrollHistory(merchantId: string): Promise<PayrollRunResult[] | null> {
  return svcFetch<PayrollRunResult[]>(`${ENV.payrollServiceUrl}/payroll/history/${merchantId}`);
}

export async function pythonGetPayrollStub(runId: string, staffId: string): Promise<PayrollRunResult | null> {
  return svcFetch<PayrollRunResult>(`${ENV.payrollServiceUrl}/payroll/stub/${runId}/${staffId}`);
}

// ─── Python: Kiosk Health ────────────────────────────────────────────────────
export interface KioskHealthReport {
  terminal_id: string;
  merchant_id: string;
  health_score: number; // 0-100
  anomalies: Array<{ type: string; severity: "low" | "medium" | "high"; description: string }>;
  last_seen: string;
  is_online: boolean;
}

export async function pythonGetKioskHealth(merchantId: string): Promise<KioskHealthReport[] | null> {
  return svcFetch<KioskHealthReport[]>(`${ENV.kioskHealthUrl}/kiosk/health/${merchantId}`);
}

export async function pythonGetKioskAnomaly(terminalId: string): Promise<KioskHealthReport | null> {
  return svcFetch<KioskHealthReport>(`${ENV.kioskHealthUrl}/kiosk/anomaly/${terminalId}`);
}

// ─── Python: Fraud Scoring ───────────────────────────────────────────────────
export interface FraudScoreResult {
  transaction_id: string;
  risk_score: number; // 0-100
  risk_level: "low" | "medium" | "high" | "critical";
  signals: string[];
  recommendation: "approve" | "review" | "decline";
}

export async function pythonScoreTransaction(payload: {
  transaction_id: string; merchant_id: string; amount_kobo: number;
  customer_id?: string; terminal_id?: string; ip_address?: string;
  card_last4?: string; channel?: string;
}): Promise<FraudScoreResult | null> {
  return svcFetch(`${ENV.fraudScoringUrl}/fraud/score`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── GNN Fraud Scoring (high-value transactions ≥ ₦500,000) ─────────────────
/**
 * GNN-based fraud scoring using GraphSAGE model.
 * Called for high-value transactions (amount_kobo >= 50_000_000 = ₦500,000).
 * Fail-open: returns null if the GNN service is unavailable.
 */
export interface GNNFraudScoreResult {
  transaction_id: string;
  gnn_risk_score: number;        // 0–100
  gnn_risk_level: "low" | "medium" | "high" | "critical";
  fraud_ring_detected: boolean;
  fraud_ring_id: string | null;
  graph_features: {
    degree_centrality: number;
    clustering_coefficient: number;
    pagerank: number;
    suspicious_neighbors: number;
  };
  recommendation: "approve" | "review" | "decline";
  model_version: string;
  inference_ms: number;
}

export async function gnnScoreTransaction(payload: {
  transaction_id: string;
  merchant_id: string;
  amount_kobo: number;
  customer_id?: string;
  channel?: string;
  ip_address?: string;
  card_last4?: string;
  historical_tx_count?: number;
  historical_fraud_count?: number;
}): Promise<GNNFraudScoreResult | null> {
  return svcFetch<GNNFraudScoreResult>(`${ENV.gnnFraudUrl}/v1/score`, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
    }),
  });
}

/**
 * Merge rule-based and GNN fraud scores for high-value transactions.
 * Weighting: 40% rule-based + 60% GNN for high-value (≥ ₦500,000).
 * For normal transactions, only rule-based score is used.
 */
export function mergeFraudScores(
  ruleScore: FraudScoreResult | null,
  gnnScore: GNNFraudScoreResult | null,
  amountKobo: number,
): FraudScoreResult | null {
  const HIGH_VALUE_THRESHOLD = 50_000_000; // ₦500,000 in kobo
  const isHighValue = amountKobo >= HIGH_VALUE_THRESHOLD;

  if (!ruleScore && !gnnScore) return null;
  if (!gnnScore || !isHighValue) return ruleScore;
  if (!ruleScore) {
    // Only GNN available — map GNN result to FraudScoreResult shape
    return {
      transaction_id: gnnScore.transaction_id,
      risk_score: gnnScore.gnn_risk_score,
      risk_level: gnnScore.gnn_risk_level,
      recommendation: gnnScore.recommendation,
      signals: [
        `gnn_risk_level:${gnnScore.gnn_risk_level}`,
        ...(gnnScore.fraud_ring_detected ? [`fraud_ring:${gnnScore.fraud_ring_id ?? "unknown"}`] : []),
        `pagerank:${gnnScore.graph_features.pagerank.toFixed(3)}`,
        `suspicious_neighbors:${gnnScore.graph_features.suspicious_neighbors}`,
      ],
    };
  }

  // Weighted merge: 40% rule-based + 60% GNN for high-value transactions
  const mergedScore = Math.round(ruleScore.risk_score * 0.4 + gnnScore.gnn_risk_score * 0.6);
  const mergedLevel: FraudScoreResult["risk_level"] =
    mergedScore >= 80 ? "critical" :
    mergedScore >= 60 ? "high" :
    mergedScore >= 40 ? "medium" : "low";
  const mergedRecommendation: FraudScoreResult["recommendation"] =
    mergedScore >= 80 ? "decline" :
    mergedScore >= 40 ? "review" : "approve";

  return {
    ...ruleScore,
    risk_score: mergedScore,
    risk_level: mergedLevel,
    recommendation: mergedRecommendation,
    signals: [
      ...ruleScore.signals,
      `gnn_score:${gnnScore.gnn_risk_score}`,
      ...(gnnScore.fraud_ring_detected ? [`fraud_ring:${gnnScore.fraud_ring_id ?? "unknown"}`] : []),
      ...(gnnScore.graph_features.suspicious_neighbors > 0
        ? [`suspicious_neighbors:${gnnScore.graph_features.suspicious_neighbors}`] : []),
    ],
  };
}

// ─── Python: USSD Gateway ────────────────────────────────────────────────────
export interface USSDSession {
  session_id: string;
  msisdn: string;
  merchant_id: string;
  state: string;
  response_text: string;
  is_terminal: boolean;
}

export async function pythonHandleUSSD(payload: {
  session_id: string; msisdn: string; merchant_id: string;
  input: string; state?: string;
}): Promise<USSDSession | null> {
  return svcFetch(`${ENV.ussdGatewayUrl}/ussd/session`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pythonGetUSSDBalance(msisdn: string, merchantId: string): Promise<{ balance_kobo: number; account_name: string } | null> {
  return svcFetch(`${ENV.ussdGatewayUrl}/ussd/balance/${merchantId}/${msisdn}`);
}

// ─── Inventory Reservation ──────────────────────────────────────────────────
export interface RustReservationResult {
  reservation_id: string;
  merchant_id: string;
  transaction_ref: string;
  items: Array<{ item_id: string; quantity: number; reserved: boolean }>;
  all_reserved: boolean;
}

export async function rustReserveInventory(payload: {
  merchant_id: string;
  transaction_ref: string;
  items: Array<{ item_id: string; quantity: number }>;
}): Promise<RustReservationResult | null> {
  return svcFetch<RustReservationResult>(`${ENV.inventoryEngineUrl}/inventory/reserve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rustReleaseInventory(reservationId: string): Promise<{ ok: boolean } | null> {
  return svcFetch<{ ok: boolean }>(`${ENV.inventoryEngineUrl}/inventory/release`, {
    method: "POST",
    body: JSON.stringify({ reservation_id: reservationId }),
  });
}

// ─── Health check for all microservices ─────────────────────────────────────
export async function checkAllMicroservices(): Promise<Record<string, "ok" | "down">> {
  const checks = await Promise.allSettled([
    svcFetch(`${ENV.inventoryEngineUrl}/inventory/health`),
    svcFetch(`${ENV.loyaltyLedgerUrl}/loyalty/health`),
    svcFetch(`${ENV.payrollServiceUrl}/health`),
    svcFetch(`${ENV.kioskHealthUrl}/health`),
    svcFetch(`${ENV.fraudScoringUrl}/health`),
    svcFetch(`${ENV.ussdGatewayUrl}/health`),
  ]);
  const names = ["inventory-engine", "loyalty-ledger", "payroll-service", "kiosk-health", "fraud-scoring", "ussd-gateway"];
  return Object.fromEntries(names.map((n, i) => [n, checks[i].status === "fulfilled" && checks[i].value !== null ? "ok" : "down"]));
}
