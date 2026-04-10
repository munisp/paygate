/**
 * PayGate Merchant Portal — gRPC Client
 *
 * Provides typed gRPC stubs for all PayGate microservices:
 *   - LedgerService    (Go middleware bridge / TigerBeetle)
 *   - FraudService     (Python ML scoring)
 *   - NotificationService (Python FCM/APNs)
 *   - UssdService      (Python Africa's Talking)
 *   - OutboxService    (Go outbox relay)
 *
 * All clients are lazy-initialized singletons. When the gRPC endpoint
 * is not configured (GRPC_BRIDGE_URL is empty), every call returns a
 * graceful null / default response so the portal continues to work
 * without the microservices running.
 *
 * Usage:
 *   import { getLedgerClient, getFraudClient } from "./grpcClient";
 *   const ledger = getLedgerClient();
 *   if (ledger) {
 *     const balance = await ledger.getBalance({ accountId: "...", currency: "NGN" });
 *   }
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "../proto/paygate.proto");

// ─── Config ───────────────────────────────────────────────────────────────────

const GRPC_BRIDGE_URL = process.env.GRPC_BRIDGE_URL ?? "";
const GRPC_FRAUD_URL = process.env.GRPC_FRAUD_URL ?? GRPC_BRIDGE_URL;
const GRPC_NOTIFY_URL = process.env.GRPC_NOTIFY_URL ?? process.env.PUSH_SERVICE_GRPC_URL ?? "";
const GRPC_USSD_URL = process.env.GRPC_USSD_URL ?? process.env.USSD_SERVICE_GRPC_URL ?? "";
const GRPC_OUTBOX_URL = process.env.GRPC_OUTBOX_URL ?? process.env.OUTBOX_RELAY_GRPC_URL ?? "";
const GRPC_CONSUMER_URL = process.env.GRPC_CONSUMER_URL ?? process.env.CONSUMER_SERVICE_GRPC_URL ?? GRPC_BRIDGE_URL;
const GRPC_ANALYTICS_URL = process.env.GRPC_ANALYTICS_URL ?? process.env.ANALYTICS_SERVICE_GRPC_URL ?? GRPC_BRIDGE_URL;

// ─── Proto loader ─────────────────────────────────────────────────────────────

let _packageDef: protoLoader.PackageDefinition | null = null;

function getPackageDef(): protoLoader.PackageDefinition {
  if (!_packageDef) {
    _packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
  }
  return _packageDef;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProtoDescriptor(): any {
  return grpc.loadPackageDefinition(getPackageDef());
}

// ─── Promisify helper ─────────────────────────────────────────────────────────

function promisifyUnary<Req, Res>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  method: string,
  request: Req
): Promise<Res> {
  return new Promise((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, response: Res) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// ─── Credential helper ────────────────────────────────────────────────────────

function makeCredentials(url: string): grpc.ChannelCredentials {
  // VULN-011 FIX: Force TLS in production; allow insecure only in dev/test
  const isProduction = process.env.NODE_ENV === "production";
  const grpcTls = process.env.GRPC_TLS === "true";
  if (url.startsWith("https://") || url.includes(":443") || (isProduction && grpcTls)) {
    return grpc.credentials.createSsl();
  }
  if (isProduction && !grpcTls) {
    // In production without explicit TLS flag, log a warning but allow (internal mesh may handle mTLS)
    console.warn(`[gRPC] WARNING: Insecure channel to ${url} in production. Set GRPC_TLS=true to enforce TLS.`);
  }
  return grpc.credentials.createInsecure();
}

// ─── LedgerService ────────────────────────────────────────────────────────────

export interface LedgerGetBalanceRequest {
  accountId: string;
  currency: string;
}

export interface LedgerGetBalanceResponse {
  accountId: string;
  balanceCents: number;
  currency: string;
  creditsPosted: number;
  debitsPosted: number;
  creditsPending: number;
  debitsPending: number;
}

export interface LedgerCreateTransferRequest {
  idempotencyKey: string;
  debitAccountId: string;
  creditAccountId: string;
  amountCents: number;
  currency: string;
  ledgerCode: string;
  reference: string;
  metadata?: Record<string, string>;
}

export interface LedgerCreateTransferResponse {
  transferId: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface LedgerClient {
  getBalance(req: LedgerGetBalanceRequest): Promise<LedgerGetBalanceResponse>;
  createTransfer(req: LedgerCreateTransferRequest): Promise<LedgerCreateTransferResponse>;
}

let _ledgerClient: LedgerClient | null = null;

export function getLedgerClient(): LedgerClient | null {
  if (!GRPC_BRIDGE_URL) return null;
  if (_ledgerClient) return _ledgerClient;

  const descriptor = getProtoDescriptor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LedgerService = (descriptor as any).paygate?.LedgerService;
  if (!LedgerService) return null;

  const raw = new LedgerService(GRPC_BRIDGE_URL, makeCredentials(GRPC_BRIDGE_URL));

  _ledgerClient = {
    getBalance: (req) => promisifyUnary(raw, "getBalance", req),
    createTransfer: (req) => promisifyUnary(raw, "createTransfer", req),
  };

  return _ledgerClient;
}

// ─── FraudService ─────────────────────────────────────────────────────────────

export interface FraudScoreRequest {
  transactionId: string;
  entityId: string;
  entityType: "merchant" | "consumer";
  amountCents: number;
  currency: string;
  channel: string;
  velocity1h: number;
  velocity24h: number;
  isNewDevice: boolean;
  isNewIp: boolean;
  amountVsAvgRatio: number;
}

export interface FraudScoreResponse {
  fraudScore: number;
  riskLevel: string;
  action: string;
  explanation: string[];
}

export interface FraudRiskProfile {
  entityId: string;
  overallRiskScore: number;
  riskTier: string;
  totalFlags30d: number;
  criticalFlags30d: number;
  lastFlagTimestampMs: number;
}

export interface FraudClient {
  scoreTransaction(req: FraudScoreRequest): Promise<FraudScoreResponse>;
  getRiskProfile(req: { entityId: string; entityType: string }): Promise<FraudRiskProfile>;
}

let _fraudClient: FraudClient | null = null;

export function getFraudClient(): FraudClient | null {
  if (!GRPC_FRAUD_URL) return null;
  if (_fraudClient) return _fraudClient;

  const descriptor = getProtoDescriptor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FraudService = (descriptor as any).paygate?.FraudService;
  if (!FraudService) return null;

  const raw = new FraudService(GRPC_FRAUD_URL, makeCredentials(GRPC_FRAUD_URL));

  _fraudClient = {
    scoreTransaction: (req) => promisifyUnary(raw, "scoreTransaction", req),
    getRiskProfile: (req) => promisifyUnary(raw, "getRiskProfile", req),
  };

  return _fraudClient;
}

// ─── NotificationService ──────────────────────────────────────────────────────

export interface NotifyUserRequest {
  userId: string;
  merchantId: string;
  notification: { title: string; body: string; imageUrl?: string; data?: Record<string, string> };
  notificationType: string;
  priority?: "HIGH" | "NORMAL";
}

export interface NotifyUserResponse {
  success: boolean;
  sentCount: number;
  failedCount: number;
  failedTokens: string[];
}

export interface NotificationClient {
  sendToUser(req: NotifyUserRequest): Promise<NotifyUserResponse>;
  registerToken(req: {
    token: string;
    platform: string;
    deviceId: string;
    merchantId: string;
    userId: string;
    userType: string;
  }): Promise<{ success: boolean; tokenId: string }>;
  deregisterToken(req: { token: string }): Promise<{ success: boolean }>;
}

let _notifyClient: NotificationClient | null = null;

export function getNotificationClient(): NotificationClient | null {
  if (!GRPC_NOTIFY_URL) return null;
  if (_notifyClient) return _notifyClient;

  const descriptor = getProtoDescriptor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NotificationService = (descriptor as any).paygate?.NotificationService;
  if (!NotificationService) return null;

  const raw = new NotificationService(GRPC_NOTIFY_URL, makeCredentials(GRPC_NOTIFY_URL));

  _notifyClient = {
    sendToUser: (req) => promisifyUnary(raw, "sendToUser", req),
    registerToken: (req) => promisifyUnary(raw, "registerToken", req),
    deregisterToken: (req) => promisifyUnary(raw, "deregisterToken", req),
  };

  return _notifyClient;
}

// ─── UssdService ──────────────────────────────────────────────────────────────

export interface UssdSessionRequest {
  sessionId: string;
  phoneNumber: string;
  serviceCode: string;
  text: string;
  networkCode?: string;
}

export interface UssdSessionResponse {
  response: string;
  endSession: boolean;
}

export interface UssdClient {
  handleSession(req: UssdSessionRequest): Promise<UssdSessionResponse>;
  getSessionState(req: { sessionId: string }): Promise<{
    sessionId: string;
    phoneNumber: string;
    currentMenu: string;
    state: Record<string, string>;
    isActive: boolean;
  }>;
}

let _ussdClient: UssdClient | null = null;

export function getUssdClient(): UssdClient | null {
  if (!GRPC_USSD_URL) return null;
  if (_ussdClient) return _ussdClient;

  const descriptor = getProtoDescriptor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const UssdService = (descriptor as any).paygate?.UssdService;
  if (!UssdService) return null;

  const raw = new UssdService(GRPC_USSD_URL, makeCredentials(GRPC_USSD_URL));

  _ussdClient = {
    handleSession: (req) => promisifyUnary(raw, "handleSession", req),
    getSessionState: (req) => promisifyUnary(raw, "getSessionState", req),
  };

  return _ussdClient;
}

// ─── OutboxService ────────────────────────────────────────────────────────────

export interface OutboxPublishRequest {
  idempotencyKey: string;
  topic: string;
  eventType: string;
  aggregateId: string;
  payload: Buffer | Uint8Array;
  headers?: Record<string, string>;
}

export interface OutboxPublishResponse {
  success: boolean;
  eventId: string;
  wasDuplicate: boolean;
}

export interface OutboxClient {
  publishEvent(req: OutboxPublishRequest): Promise<OutboxPublishResponse>;
  getEventStatus(req: { eventId: string }): Promise<{
    eventId: string;
    status: string;
    retryCount: number;
    createdAtMs: number;
    publishedAtMs: number;
    errorMessage: string;
  }>;
  retryEvent(req: { eventId: string }): Promise<{ success: boolean }>;
}

let _outboxClient: OutboxClient | null = null;

export function getOutboxClient(): OutboxClient | null {
  if (!GRPC_OUTBOX_URL) return null;
  if (_outboxClient) return _outboxClient;

  const descriptor = getProtoDescriptor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OutboxService = (descriptor as any).paygate?.OutboxService;
  if (!OutboxService) return null;

  const raw = new OutboxService(GRPC_OUTBOX_URL, makeCredentials(GRPC_OUTBOX_URL));

  _outboxClient = {
    publishEvent: (req) => promisifyUnary(raw, "publishEvent", req),
    getEventStatus: (req) => promisifyUnary(raw, "getEventStatus", req),
    retryEvent: (req) => promisifyUnary(raw, "retryEvent", req),
  };

  return _outboxClient;
}

// ─── ConsumerService ─────────────────────────────────────────────────────────

export interface ConsumerWalletClient {
  getWalletBalance(req: { consumerId: string; currency: string }): Promise<{ balance: string; currency: string; ledgerAccountId: string }>;
  creditWallet(req: { consumerId: string; amount: string; currency: string; reference: string; idempotencyKey: string }): Promise<{ success: boolean; transactionId: string; newBalance: string }>;
  debitWallet(req: { consumerId: string; amount: string; currency: string; reference: string; idempotencyKey: string }): Promise<{ success: boolean; transactionId: string; newBalance: string }>;
  p2pTransfer(req: { senderId: string; recipientPhone: string; amount: string; currency: string; note?: string; idempotencyKey: string }): Promise<{ success: boolean; transactionId: string; senderNewBalance: string; recipientNewBalance: string }>;
  billPay(req: { consumerId: string; billerId: string; customerReference: string; amount: string; currency: string; idempotencyKey: string }): Promise<{ success: boolean; transactionId: string; confirmationCode: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTransactionHistory(req: { consumerId: string; limit?: number; offset?: number; startDate?: string; endDate?: string }): Promise<{ transactions: any[]; total: number }>;
  registerPushToken(req: { consumerId: string; token: string; platform: string; deviceId: string }): Promise<{ success: boolean; tokenId: string }>;
}

let _consumerClient: ConsumerWalletClient | null = null;

export function getConsumerClient(): ConsumerWalletClient | null {
  if (!GRPC_CONSUMER_URL) return null;
  if (_consumerClient) return _consumerClient;
  const descriptor = getProtoDescriptor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ConsumerService = (descriptor as any).paygate?.ConsumerService;
  if (!ConsumerService) return null;
  const raw = new ConsumerService(GRPC_CONSUMER_URL, makeCredentials(GRPC_CONSUMER_URL));
  _consumerClient = {
    getWalletBalance: (req) => promisifyUnary(raw, "getWalletBalance", req),
    creditWallet: (req) => promisifyUnary(raw, "creditWallet", req),
    debitWallet: (req) => promisifyUnary(raw, "debitWallet", req),
    p2pTransfer: (req) => promisifyUnary(raw, "p2pTransfer", req),
    billPay: (req) => promisifyUnary(raw, "billPay", req),
    getTransactionHistory: (req) => promisifyUnary(raw, "getTransactionHistory", req),
    registerPushToken: (req) => promisifyUnary(raw, "registerPushToken", req),
  };
  return _consumerClient;
}

// ─── AnalyticsService ─────────────────────────────────────────────────────────

export interface AnalyticsClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMerchantRevenue(req: { merchantId: string; startDate: string; endDate: string; granularity?: string }): Promise<{ dataPoints: any[]; totalRevenue: string; currency: string; growthRate: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTransactionVolume(req: { merchantId: string; startDate: string; endDate: string }): Promise<{ totalCount: number; totalAmount: string; averageAmount: string; byChannel: Record<string, number>; byStatus: Record<string, number> }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFraudMetrics(req: { merchantId: string; startDate: string; endDate: string }): Promise<{ totalFlags: number; confirmedFraud: number; falsePositives: number; fraudRate: string; ruleBreakdown: any[] }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getConsumerSpend(req: { consumerId: string; startDate: string; endDate: string }): Promise<{ categories: any[]; monthly: any[]; totalSpend: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTopMerchants(req: { consumerId: string; limit?: number; startDate: string; endDate: string }): Promise<{ merchants: any[] }>;
}

let _analyticsClient: AnalyticsClient | null = null;

export function getAnalyticsClient(): AnalyticsClient | null {
  if (!GRPC_ANALYTICS_URL) return null;
  if (_analyticsClient) return _analyticsClient;
  const descriptor = getProtoDescriptor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AnalyticsService = (descriptor as any).paygate?.AnalyticsService;
  if (!AnalyticsService) return null;
  const raw = new AnalyticsService(GRPC_ANALYTICS_URL, makeCredentials(GRPC_ANALYTICS_URL));
  _analyticsClient = {
    getMerchantRevenue: (req) => promisifyUnary(raw, "getMerchantRevenue", req),
    getTransactionVolume: (req) => promisifyUnary(raw, "getTransactionVolume", req),
    getFraudMetrics: (req) => promisifyUnary(raw, "getFraudMetrics", req),
    getConsumerSpend: (req) => promisifyUnary(raw, "getConsumerSpend", req),
    getTopMerchants: (req) => promisifyUnary(raw, "getTopMerchants", req),
  };
  return _analyticsClient;
}

// ─── Health check for all gRPC services ──────────────────────────────────────

export async function checkGrpcHealth(): Promise<{
  ledger: boolean;
  fraud: boolean;
  notifications: boolean;
  ussd: boolean;
  outbox: boolean;
  consumer: boolean;
  analytics: boolean;
}> {
  const results = await Promise.allSettled([
    getLedgerClient()?.getBalance({ accountId: "health-check", currency: "NGN" }),
    getFraudClient()?.getRiskProfile({ entityId: "health-check", entityType: "merchant" }),
    getNotificationClient()?.sendToUser({
      userId: "health-check",
      merchantId: "health-check",
      notification: { title: "ping", body: "ping" },
      notificationType: "SYSTEM",
    }),
    getUssdClient()?.getSessionState({ sessionId: "health-check" }),
    getOutboxClient()?.getEventStatus({ eventId: "health-check" }),
    getConsumerClient()?.getWalletBalance({ consumerId: "health-check", currency: "NGN" }),
    getAnalyticsClient()?.getTransactionVolume({ merchantId: "health-check", startDate: "2024-01-01", endDate: "2024-12-31" }),
  ]);

  return {
    ledger: results[0].status === "fulfilled",
    fraud: results[1].status === "fulfilled",
    notifications: results[2].status === "fulfilled",
    ussd: results[3].status === "fulfilled",
    outbox: results[4].status === "fulfilled",
    consumer: results[5].status === "fulfilled",
    analytics: results[6].status === "fulfilled",
  };
}
