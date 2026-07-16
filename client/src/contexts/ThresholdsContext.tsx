import React, { createContext, useContext } from "react";
import { trpc } from "@/lib/trpc";

export interface Thresholds {
  lagWarn: number;
  lagCritical: number;
  memWarnPct: number;
  memCriticalPct: number;
}

export type Severity = "ok" | "warn" | "critical";

const DEFAULTS: Thresholds = {
  lagWarn: 5,
  lagCritical: 20,
  memWarnPct: 70,
  memCriticalPct: 85,
};

interface ThresholdsContextValue {
  thresholds: Thresholds;
  isLoading: boolean;
  lagSeverity: (lag: number) => Severity;
  memSeverity: (pct: number) => Severity;
}

const ThresholdsContext = createContext<ThresholdsContextValue>({
  thresholds: DEFAULTS,
  isLoading: false,
  lagSeverity: (lag) => (lag === 0 ? "ok" : lag <= DEFAULTS.lagWarn ? "warn" : "critical"),
  memSeverity: (pct) => (pct < DEFAULTS.memWarnPct ? "ok" : pct < DEFAULTS.memCriticalPct ? "warn" : "critical"),
});

export function ThresholdsProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = trpc.paygate.getThresholds.useQuery(undefined, {
    staleTime: 60_000,
  });

  const thresholds: Thresholds = data ?? DEFAULTS;

  const lagSeverity = (lag: number): Severity => {
    if (lag === 0) return "ok";
    if (lag <= thresholds.lagWarn) return "warn";
    return "critical";
  };

  const memSeverity = (pct: number): Severity => {
    if (pct < thresholds.memWarnPct) return "ok";
    if (pct < thresholds.memCriticalPct) return "warn";
    return "critical";
  };

  return (
    <ThresholdsContext.Provider value={{ thresholds, isLoading, lagSeverity, memSeverity }}>
      {children}
    </ThresholdsContext.Provider>
  );
}

export function useThresholds() {
  return useContext(ThresholdsContext);
}
