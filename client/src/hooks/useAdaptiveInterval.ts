/**
 * useAdaptiveInterval
 *
 * Returns a polling interval (ms) that adapts to the user's network conditions.
 * Uses the Network Information API (navigator.connection) when available and
 * falls back to a sensible default for browsers that don't support it.
 *
 * Network tier → interval mapping:
 *   slow-2g  → 60 000 ms  (1 min)   — very low bandwidth, poll rarely
 *   2g       → 30 000 ms  (30 s)
 *   3g       → 15 000 ms  (15 s)
 *   4g / wifi → 5 000 ms  (5 s)     — fast connection, poll frequently
 *   unknown  → 10 000 ms  (10 s)    — safe default
 *
 * The hook also listens for `change` events on the connection object so the
 * interval updates automatically when the user switches networks (e.g. from
 * WiFi to mobile data).
 */

import { useEffect, useState } from "react";

type NetworkEffectiveType = "slow-2g" | "2g" | "3g" | "4g";

const INTERVAL_MAP: Record<NetworkEffectiveType, number> = {
  "slow-2g": 60_000,
  "2g": 30_000,
  "3g": 15_000,
  "4g": 5_000,
};

const DEFAULT_INTERVAL = 10_000;

function getNetworkInterval(): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
  if (!conn) return DEFAULT_INTERVAL;
  const effectiveType = conn.effectiveType as NetworkEffectiveType | undefined;
  if (!effectiveType || !(effectiveType in INTERVAL_MAP)) return DEFAULT_INTERVAL;
  return INTERVAL_MAP[effectiveType];
}

/**
 * Returns the current adaptive polling interval in milliseconds.
 *
 * @param overrideMs  Optional fixed override — useful for pages that need a
 *                    specific minimum/maximum regardless of network tier.
 *                    Pass `{ min, max }` to clamp the adaptive value.
 */
export function useAdaptiveInterval(options?: { min?: number; max?: number }): number {
  const [interval, setInterval] = useState<number>(() => {
    const base = getNetworkInterval();
    return clamp(base, options?.min, options?.max);
  });

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;

    const update = () => {
      const base = getNetworkInterval();
      setInterval(clamp(base, options?.min, options?.max));
    };

    if (conn) {
      conn.addEventListener("change", update);
    }

    return () => {
      if (conn) {
        conn.removeEventListener("change", update);
      }
    };
  }, [options?.min, options?.max]);

  return interval;
}

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
}

export default useAdaptiveInterval;
