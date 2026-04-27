/**
 * PayGate — Network Quality Detector (Wave 109)
 *
 * Classifies the current connection into one of four tiers used to
 * drive adaptive behaviour across the entire platform:
 *
 *   TIER_4G   — Fast broadband / LTE  (≥ 5 Mbps, RTT < 100 ms)
 *   TIER_3G   — Moderate mobile data  (≥ 1 Mbps, RTT < 300 ms)
 *   TIER_2G   — Slow / EDGE / GPRS    (≥ 100 kbps, RTT < 1000 ms)
 *   TIER_OFFLINE — No connectivity
 *
 * Decisions driven by tier:
 *   - WebSocket vs SSE vs long-poll vs short-poll
 *   - Payload compression (Brotli / gzip / none)
 *   - Image quality hints sent to the server
 *   - Offline queue flush aggressiveness
 *   - Refetch intervals (adaptive polling)
 *
 * The detector combines three signals:
 *   1. navigator.onLine (instant, unreliable on mobile)
 *   2. Network Information API (effectiveType, downlink, rtt)
 *   3. Active RTT probe to /api/health (truth-source for quality)
 */

export type ConnectionTier = "4g" | "3g" | "2g" | "offline";

export interface NetworkQuality {
  tier: ConnectionTier;
  /** Measured round-trip time in ms (0 when offline) */
  rttMs: number;
  /** Estimated downlink in Mbps from Network Information API (may be undefined) */
  downlinkMbps?: number;
  /** Raw effectiveType from Network Information API */
  effectiveType?: string;
  /** Whether the browser reports navigator.onLine */
  navigatorOnline: boolean;
  /** Timestamp of last measurement */
  measuredAt: number;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────
const RTT_4G_MAX = 150;   // ms
const RTT_3G_MAX = 500;   // ms
const RTT_2G_MAX = 2000;  // ms — anything above this is effectively offline

// ─── Probe ───────────────────────────────────────────────────────────────────
async function probeRtt(): Promise<number> {
  const start = performance.now();
  try {
    const res = await fetch("/api/health?probe=1", {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      credentials: "omit",
    });
    if (!res.ok) return 9999;
    return Math.round(performance.now() - start);
  } catch {
    return 9999;
  }
}

function tierFromRtt(rtt: number, effectiveType?: string): ConnectionTier {
  if (!navigator.onLine || rtt >= 9999) return "offline";
  // Honour Network Information API if available and trustworthy
  if (effectiveType === "slow-2g" || effectiveType === "2g") return "2g";
  if (rtt <= RTT_4G_MAX) return "4g";
  if (rtt <= RTT_3G_MAX) return "3g";
  if (rtt <= RTT_2G_MAX) return "2g";
  return "offline";
}

// ─── Singleton state ─────────────────────────────────────────────────────────
type Listener = (q: NetworkQuality) => void;

class NetworkQualityMonitor {
  private current: NetworkQuality = {
    tier: navigator.onLine ? "3g" : "offline",
    rttMs: 0,
    navigatorOnline: navigator.onLine,
    measuredAt: Date.now(),
  };
  private listeners: Set<Listener> = new Set();
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private probing = false;

  constructor() {
    window.addEventListener("online", () => this.probe());
    window.addEventListener("offline", () => {
      this.update({ ...this.current, tier: "offline", navigatorOnline: false, measuredAt: Date.now() });
    });

    // Network Information API (Chrome/Android)
    const conn = (navigator as any).connection;
    if (conn) {
      conn.addEventListener("change", () => this.probe());
    }
  }

  /** Start periodic probing. Call once from App.tsx. */
  start(intervalMs = 30_000) {
    this.probe(); // immediate first probe
    this.probeTimer = setInterval(() => this.probe(), intervalMs);
  }

  stop() {
    if (this.probeTimer) clearInterval(this.probeTimer);
  }

  get(): NetworkQuality {
    return this.current;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async probe(): Promise<NetworkQuality> {
    if (this.probing) return this.current;
    this.probing = true;
    try {
      const conn = (navigator as any).connection;
      const effectiveType: string | undefined = conn?.effectiveType;
      const downlinkMbps: number | undefined = conn?.downlink;

      const rttMs = navigator.onLine ? await probeRtt() : 9999;
      const tier = tierFromRtt(rttMs, effectiveType);

      const q: NetworkQuality = {
        tier,
        rttMs,
        downlinkMbps,
        effectiveType,
        navigatorOnline: navigator.onLine,
        measuredAt: Date.now(),
      };
      this.update(q);
      return q;
    } finally {
      this.probing = false;
    }
  }

  private update(q: NetworkQuality) {
    const changed = q.tier !== this.current.tier;
    this.current = q;
    if (changed) {
      console.info(`[NetworkQuality] Tier changed → ${q.tier} (RTT ${q.rttMs}ms)`);
    }
    this.listeners.forEach((fn) => fn(q));
  }
}

export const networkQuality = new NetworkQualityMonitor();

// ─── React hook ──────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";

export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState<NetworkQuality>(() => networkQuality.get());

  useEffect(() => {
    setQuality(networkQuality.get());
    const unsub = networkQuality.subscribe(setQuality);
    return unsub;
  }, []);

  return quality;
}

/**
 * Returns a refetch interval (ms) appropriate for the current connection tier.
 * Pass the "ideal" interval for a fast connection; the function scales it up
 * for slower tiers or returns false (disable polling) when offline.
 */
export function adaptiveInterval(
  idealMs: number,
  tier: ConnectionTier
): number | false {
  switch (tier) {
    case "4g":   return idealMs;
    case "3g":   return idealMs * 2;
    case "2g":   return idealMs * 5;
    case "offline": return false;
  }
}
