/**
 * Global refresh context — provides a shared interval (seconds) and
 * a tick counter that increments on each auto-refresh cycle.
 * Components that need to re-fetch on refresh should include `tick` in
 * their query key or call `refetch()` inside a useEffect on tick change.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";

export type RefreshInterval = 10 | 30 | 60 | 300 | 0; // 0 = manual only

interface RefreshContextValue {
  interval: RefreshInterval;
  setInterval: (v: RefreshInterval) => void;
  tick: number;
  secondsUntilRefresh: number;
  triggerRefresh: () => void;
}

const RefreshContext = createContext<RefreshContextValue>({
  interval: 30,
  setInterval: () => {},
  tick: 0,
  secondsUntilRefresh: 30,
  triggerRefresh: () => {},
});

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [interval, setIntervalValue] = useState<RefreshInterval>(30);
  const [tick, setTick] = useState(0);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(30);
  const countdownRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);

  const triggerRefresh = () => {
    setTick(t => t + 1);
    setSecondsUntilRefresh(interval || 30);
  };

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

  return (
    <RefreshContext.Provider
      value={{
        interval,
        setInterval: setIntervalValue,
        tick,
        secondsUntilRefresh,
        triggerRefresh,
      }}
    >
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  return useContext(RefreshContext);
}

