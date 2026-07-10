/**
 * nexthubRestClient.ts — Paygate → NextHub REST Client
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP client for NextHub's REST Integration API at /api/v1/*.
 * Used for non-critical-path, administrative, or low-frequency queries:
 *
 *   GET /api/v1/participants          — DFSP directory listing
 *   GET /api/v1/participants/:id      — Single DFSP lookup
 *   GET /api/v1/settlement/windows    — Recent settlement windows
 *   GET /api/v1/scheme/fees           — Scheme fee tiers
 *   GET /api/v1/corridor-volume       — 7-day corridor volume heatmap
 *   GET /api/v1/health                — Service health check
 *
 * Falls back gracefully when NEXTHUB_API_URL is not configured.
 */

const NEXTHUB_API_URL = (process.env.NEXTHUB_API_URL ?? "").replace(/\/$/, "");
const NEXTHUB_API_KEY = process.env.NEXTHUB_API_KEY ?? "";

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function nexthubFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  if (!NEXTHUB_API_URL) return null;
  const url = `${NEXTHUB_API_URL}/api/v1${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": NEXTHUB_API_KEY,
        "X-Client-Id": "paygate-dfsp",
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[nexthub-rest] ${options.method ?? "GET"} ${path} → ${res.status}: ${body}`);
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    console.error(`[nexthub-rest] Request failed for ${path}:`, err);
    return null;
  }
}

// ─── Typed response interfaces ────────────────────────────────────────────────
export interface NhParticipant {
  dfspId: string;
  dfspName: string;
  dfspType: string;
  country: string;
  currency: string;
  status: string;
  callbackUrl: string;
}

export interface NhSettlementWindow {
  windowId: string;
  state: string;
  currency: string;
  openedAt: string;
  closedAt: string | null;
  totalTransfers: number;
  totalAmountKobo: number;
}

export interface NhSchemeFee {
  tierId: string;
  tierName: string;
  minAmountKobo: number;
  maxAmountKobo: number | null;
  feeKobo: number;
  feePct: number;
  currency: string;
}

export interface NhCorridorVolume {
  payerFspId: string;
  payeeFspId: string;
  currency: string;
  totalTransfers: number;
  totalAmountKobo: number;
  windowDays: number;
}

export interface NhHealth {
  status: "ok" | "degraded" | "down";
  version: string;
  uptime: number;
  db: "ok" | "error";
  grpc: "ok" | "error";
  kafka: "ok" | "error";
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const nexthubRest = {
  /** DFSP directory */
  async listParticipants(statusFilter?: string): Promise<NhParticipant[]> {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    const res = await nexthubFetch<{ participants: NhParticipant[] }>(`/participants${qs}`);
    return res?.participants ?? [];
  },

  async getParticipant(dfspId: string): Promise<NhParticipant | null> {
    return nexthubFetch<NhParticipant>(`/participants/${encodeURIComponent(dfspId)}`);
  },

  /** Settlement windows */
  async listSettlementWindows(limit = 20, currency?: string): Promise<NhSettlementWindow[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (currency) params.set("currency", currency);
    const res = await nexthubFetch<{ windows: NhSettlementWindow[] }>(`/settlement/windows?${params}`);
    return res?.windows ?? [];
  },

  /** Scheme fee schedule */
  async getSchemeFees(currency = "NGN"): Promise<NhSchemeFee[]> {
    const res = await nexthubFetch<{ fees: NhSchemeFee[] }>(`/scheme/fees?currency=${currency}`);
    return res?.fees ?? [];
  },

  /** Corridor volume heatmap */
  async getCorridorVolume(windowDays = 7): Promise<NhCorridorVolume[]> {
    const res = await nexthubFetch<{ corridors: NhCorridorVolume[] }>(`/corridor-volume?days=${windowDays}`);
    return res?.corridors ?? [];
  },

  /** Health check */
  async health(): Promise<NhHealth | null> {
    return nexthubFetch<NhHealth>("/health");
  },

  isAvailable(): boolean {
    return Boolean(NEXTHUB_API_URL);
  },
};
