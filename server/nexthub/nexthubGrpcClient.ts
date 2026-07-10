/**
 * nexthubGrpcClient.ts — Paygate → NextHub gRPC Client
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed gRPC client stubs for all NextHub services defined in
 * proto/nexthub.proto. Used by Paygate for critical-path operations:
 *
 *   TransferService    — InitiateTransfer, GetTransferStatus, Abort, Fulfil
 *   QuoteService       — RequestQuote
 *   FxRateService      — GetLiveRate, GetRateHistory, ListRates
 *   NdcLimitService    — CheckNdcLimit, GetNdcPosition
 *   ParticipantService — LookupParticipant, ListParticipants
 *
 * All clients are lazy-initialised singletons. When NEXTHUB_GRPC_URL is not
 * configured, every call returns a graceful null / fallback so Paygate
 * continues to work in local dev without NextHub running.
 *
 * Usage:
 *   import { nexthubGrpc } from "./nexthubGrpcClient";
 *   const result = await nexthubGrpc.transfer.initiate({ ... });
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "../../proto/nexthub.proto");
const NEXTHUB_GRPC_URL = process.env.NEXTHUB_GRPC_URL ?? "";

// ─── Proto loader ─────────────────────────────────────────────────────────────
let _packageDef: protoLoader.PackageDefinition | null = null;
function getPackageDef() {
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
function getProto(): any {
  return grpc.loadPackageDefinition(getPackageDef());
}

// ─── Credential helper ────────────────────────────────────────────────────────
function makeCredentials(url: string): grpc.ChannelCredentials {
  if (url.startsWith("https://") || url.includes(":443") || process.env.NEXTHUB_GRPC_TLS === "true") {
    return grpc.credentials.createSsl();
  }
  return grpc.credentials.createInsecure();
}

// ─── Promisify helper ─────────────────────────────────────────────────────────
function promisify<Req, Res>(client: any, method: string, req: Req): Promise<Res> {
  return new Promise((resolve, reject) => {
    client[method](req, (err: grpc.ServiceError | null, res: Res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

// ─── Client singletons ────────────────────────────────────────────────────────
let _transferClient: any = null;
let _quoteClient: any = null;
let _fxClient: any = null;
let _ndcClient: any = null;
let _participantClient: any = null;

function getClient(serviceName: string, singleton: { value: any }): any | null {
  if (!NEXTHUB_GRPC_URL) return null;
  if (singleton.value) return singleton.value;
  const proto = getProto();
  const svc = proto?.nexthub?.v1?.[serviceName] ?? proto?.[serviceName];
  if (!svc) {
    console.warn(`[nexthub-grpc] Service ${serviceName} not found in proto`);
    return null;
  }
  singleton.value = new svc(NEXTHUB_GRPC_URL, makeCredentials(NEXTHUB_GRPC_URL), {
    "grpc.keepalive_time_ms": 30_000,
    "grpc.keepalive_timeout_ms": 10_000,
    "grpc.max_receive_message_length": 10 * 1024 * 1024,
  });
  return singleton.value;
}

// ─── Typed request/response interfaces ───────────────────────────────────────
export interface TransferRequest {
  transferId: string;
  payerFspId: string;
  payeeFspId: string;
  payerPartyId: string;
  payeePartyId: string;
  amountKobo: number;
  currency: string;
  ilpPacket?: string;
  condition?: string;
  expirationMs?: number;
  metadata?: Record<string, string>;
}

export interface TransferResponse {
  transferId: string;
  state: string;
  schemeFeeKobo: string;
  interchangeFeeKobo: string;
  fxRate: number;
  errorCode: string;
  errorDescription: string;
  createdAtMs: string;
}

export interface QuoteRequest {
  quoteId: string;
  payerFspId: string;
  payeeFspId: string;
  payerPartyId: string;
  payeePartyId: string;
  amountKobo: number;
  currency: string;
  amountType: "SEND" | "RECEIVE";
}

export interface QuoteResponse {
  quoteId: string;
  state: string;
  transferAmountKobo: string;
  payeeReceiveKobo: string;
  schemeFeeKobo: string;
  interchangeFeeKobo: string;
  fxMarkupKobo: string;
  fxRate: number;
  ilpPacket: string;
  condition: string;
  expiryMs: string;
  errorCode: string;
  errorDescription: string;
}

export interface FxRateResponse {
  sourceCurrency: string;
  targetCurrency: string;
  midRate: number;
  buyRate: number;
  sellRate: number;
  markupBps: number;
  validFromMs: string;
  validToMs: string;
  provider: string;
  isStale: boolean;
}

export interface NdcLimitResponse {
  allowed: boolean;
  currentPositionKobo: string;
  ndcLimitKobo: string;
  availableKobo: string;
  dfspId: string;
  currency: string;
}

export interface ParticipantResponse {
  found: boolean;
  dfspId: string;
  dfspName: string;
  dfspType: string;
  country: string;
  currency: string;
  status: string;
  callbackUrl: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const nexthubGrpc = {
  /** Transfer lifecycle — critical path */
  transfer: {
    async initiate(req: TransferRequest): Promise<TransferResponse | null> {
      const s = { value: _transferClient };
      const c = getClient("TransferService", s);
      _transferClient = s.value;
      if (!c) return null;
      try {
        return await promisify<TransferRequest, TransferResponse>(c, "initiateTransfer", req);
      } catch (err) {
        console.error("[nexthub-grpc] initiateTransfer error:", err);
        return null;
      }
    },

    async getStatus(transferId: string): Promise<any | null> {
      const s = { value: _transferClient };
      const c = getClient("TransferService", s);
      _transferClient = s.value;
      if (!c) return null;
      try {
        return await promisify(c, "getTransferStatus", { transferId });
      } catch (err) {
        console.error("[nexthub-grpc] getTransferStatus error:", err);
        return null;
      }
    },

    async abort(transferId: string, errorCode: string, errorDescription: string): Promise<any | null> {
      const s = { value: _transferClient };
      const c = getClient("TransferService", s);
      _transferClient = s.value;
      if (!c) return null;
      try {
        return await promisify(c, "abortTransfer", { transferId, errorCode, errorDescription });
      } catch (err) {
        console.error("[nexthub-grpc] abortTransfer error:", err);
        return null;
      }
    },

    async fulfil(transferId: string, fulfilment: string): Promise<any | null> {
      const s = { value: _transferClient };
      const c = getClient("TransferService", s);
      _transferClient = s.value;
      if (!c) return null;
      try {
        return await promisify(c, "fulfilTransfer", { transferId, fulfilment });
      } catch (err) {
        console.error("[nexthub-grpc] fulfilTransfer error:", err);
        return null;
      }
    },
  },

  /** Pre-transfer quote */
  quote: {
    async request(req: QuoteRequest): Promise<QuoteResponse | null> {
      const s = { value: _quoteClient };
      const c = getClient("QuoteService", s);
      _quoteClient = s.value;
      if (!c) return null;
      try {
        return await promisify<QuoteRequest, QuoteResponse>(c, "requestQuote", req);
      } catch (err) {
        console.error("[nexthub-grpc] requestQuote error:", err);
        return null;
      }
    },
  },

  /** FX rates — called on cache miss; normal path is Kafka/Redis cache */
  fx: {
    async getLiveRate(sourceCurrency: string, targetCurrency: string): Promise<FxRateResponse | null> {
      const s = { value: _fxClient };
      const c = getClient("FxRateService", s);
      _fxClient = s.value;
      if (!c) return null;
      try {
        return await promisify<any, FxRateResponse>(c, "getLiveRate", { sourceCurrency, targetCurrency });
      } catch (err) {
        console.error("[nexthub-grpc] getLiveRate error:", err);
        return null;
      }
    },

    async getRateHistory(sourceCurrency: string, targetCurrency: string, fromMs?: number, toMs?: number, maxPoints = 100): Promise<any | null> {
      const s = { value: _fxClient };
      const c = getClient("FxRateService", s);
      _fxClient = s.value;
      if (!c) return null;
      try {
        return await promisify(c, "getRateHistory", {
          sourceCurrency,
          targetCurrency,
          fromMs: String(fromMs ?? Date.now() - 24 * 3600 * 1000),
          toMs: String(toMs ?? Date.now()),
          maxPoints,
        });
      } catch (err) {
        console.error("[nexthub-grpc] getRateHistory error:", err);
        return null;
      }
    },

    async listRates(baseCurrency?: string): Promise<{ rates: FxRateResponse[]; fetchedAtMs: string } | null> {
      const s = { value: _fxClient };
      const c = getClient("FxRateService", s);
      _fxClient = s.value;
      if (!c) return null;
      try {
        return await promisify(c, "listRates", { baseCurrency: baseCurrency ?? "" });
      } catch (err) {
        console.error("[nexthub-grpc] listRates error:", err);
        return null;
      }
    },
  },

  /** NDC limit check — called before every transfer */
  ndc: {
    async check(dfspId: string, amountKobo: number, currency = "NGN"): Promise<NdcLimitResponse | null> {
      const s = { value: _ndcClient };
      const c = getClient("NdcLimitService", s);
      _ndcClient = s.value;
      if (!c) return null;
      try {
        return await promisify<any, NdcLimitResponse>(c, "checkNdcLimit", { dfspId, amountKobo: String(amountKobo), currency });
      } catch (err) {
        console.error("[nexthub-grpc] checkNdcLimit error:", err);
        return null;
      }
    },

    async getPosition(dfspId: string, currency = "NGN"): Promise<any | null> {
      const s = { value: _ndcClient };
      const c = getClient("NdcLimitService", s);
      _ndcClient = s.value;
      if (!c) return null;
      try {
        return await promisify(c, "getNdcPosition", { dfspId, currency });
      } catch (err) {
        console.error("[nexthub-grpc] getNdcPosition error:", err);
        return null;
      }
    },
  },

  /** Participant directory */
  participant: {
    async lookup(dfspId: string): Promise<ParticipantResponse | null> {
      const s = { value: _participantClient };
      const c = getClient("ParticipantService", s);
      _participantClient = s.value;
      if (!c) return null;
      try {
        return await promisify<any, ParticipantResponse>(c, "lookupParticipant", { dfspId });
      } catch (err) {
        console.error("[nexthub-grpc] lookupParticipant error:", err);
        return null;
      }
    },

    async list(statusFilter = "ACTIVE"): Promise<{ participants: ParticipantResponse[]; total: number } | null> {
      const s = { value: _participantClient };
      const c = getClient("ParticipantService", s);
      _participantClient = s.value;
      if (!c) return null;
      try {
        return await promisify(c, "listParticipants", { statusFilter });
      } catch (err) {
        console.error("[nexthub-grpc] listParticipants error:", err);
        return null;
      }
    },
  },

  /** Health check — verifies gRPC connectivity */
  isAvailable(): boolean {
    return Boolean(NEXTHUB_GRPC_URL);
  },
};
