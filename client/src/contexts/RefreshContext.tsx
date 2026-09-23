/**
 * Global refresh context — provides a shared interval (seconds) and
 * a tick counter that increments on each auto-refresh cycle.
 * Components that need to re-fetch on refresh should include `tick` in
 * their query key or call `refetch()` inside a useEffect on tick change.
 *
 * Re-architected (perf): the state is split into three narrow contexts so
 * subscribers only re-render for the slice they actually consume:
 *   - RefreshConfigContext    → interval / setInterval / triggerRefresh
 *                               (changes only on user action — Layout/sidebar safe)
 *   - RefreshTickContext      → tick (changes once per refresh cycle)
 *   - RefreshCountdownContext → secondsUntilRefresh (changes every 1s —
 *                               only tiny countdown badges should subscribe)
 * The legacy `useRefresh()` hook is kept for backwards compatibility, but
 * prefer the narrow hooks to avoid per-second re-renders of large trees.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type RefreshInterval = 10 | 30 | 60 | 300 | 0; // 0 = manual only

interface RefreshConfigValue {
  interval: RefreshInterval;
  setInterval: (v: RefreshInterval) => void;
  triggerRefresh: () => void;
}

interface RefreshContextValue extends RefreshConfigValue {
  tick: number;
  secondsUntilRefresh: number;
}

const RefreshConfigContext = createContext<RefreshConfigValue>({
  interval: 30,
  setInterval: () => {},
  triggerRefresh: () => {},
});

const RefreshTickContext = createContext<number>(0);
const RefreshCountdownContext = createContext<number>(30);

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [interval, setIntervalValue] = useState<RefreshInterval>(30);
  const [tick, setTick] = useState(0);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(30);
  const countdownRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const intervalRef = useRef<RefreshInterval>(interval);
  intervalRef.current = interval;

  const triggerRefresh = useCallback(() => {
    setTick(t => t + 1);
    setSecondsUntilRefresh(intervalRef.current || 30);
  }, []);

  // Reset and restart timers whenever interval changes
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (tickRef.current) clearInterval(tickRef.current);

    if (interval === 0) {
      setSecondsUntilRefresh(0);
      return;
    }

    setSecondsUntilRefresh(interval);

    // Countdown ticker (every second)
    countdownRef.current = globalThis.setInterval(() => {
      setSecondsUntilRefresh(s => {
        if (s <= 1) return interval;
        return s - 1;
      });
    }, 1000);

    // Auto-refresh tick
    tickRef.current = globalThis.setInterval(() => {
      setTick(t => t + 1);
    }, interval * 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [interval]);

  // Memoized so consumers of config never re-render on tick/countdown updates.
  const configValue = useMemo<RefreshConfigValue>(
    () => ({ interval, setInterval: setIntervalValue, triggerRefresh }),
    [interval, triggerRefresh]
  );

  return (
    <RefreshConfigContext.Provider value={configValue}>
      <RefreshTickContext.Provider value={tick}>
        <RefreshCountdownContext.Provider value={secondsUntilRefresh}>
          {children}
        </RefreshCountdownContext.Provider>
      </RefreshTickContext.Provider>
    </RefreshConfigContext.Provider>
  );
}

/** Config-only subscription: never re-renders on tick or countdown. */
export function useRefreshConfig(): RefreshConfigValue {
  return useContext(RefreshConfigContext);
}

/** Tick-only subscription: re-renders once per refresh cycle (not per second). */
export function useRefreshTick(): number {
  return useContext(RefreshTickContext);
}

/** Countdown subscription: re-renders every second — use only in tiny badge components. */
export function useRefreshCountdown(): number {
  return useContext(RefreshCountdownContext);
}

/**
 * Legacy combined hook — subscribes to ALL slices (re-renders every second).
 * Prefer useRefreshConfig / useRefreshTick / useRefreshCountdown.
 */
export function useRefresh(): RefreshContextValue {
  const config = useContext(RefreshConfigContext);
  const tick = useContext(RefreshTickContext);
  const secondsUntilRefresh = useContext(RefreshCountdownContext);
  return { ...config, tick, secondsUntilRefresh };
}
