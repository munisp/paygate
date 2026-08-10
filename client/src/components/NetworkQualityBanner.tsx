/**
 * NetworkQualityBanner
 *
 * Displays a non-intrusive banner at the top of every page that reflects the
 * current network quality tier (excellent / good / degraded / poor / offline).
 * Also shows the number of queued offline requests and a manual flush button.
 *
 * Designed for African low-bandwidth environments where connectivity is
 * unreliable and merchants need clear feedback about what is happening.
 */
import { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, AlertTriangle, Clock, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { networkQuality, ConnectionTier, NetworkQuality } from "@/lib/networkQuality";
import { offlineQueueV2 } from "@/lib/offlineQueueV2";

interface BannerState {
  tier: ConnectionTier;
  rttMs: number;
  queuedCount: number;
  isFlushing: boolean;
  dismissed: boolean;
}

// Map the library's 4g/3g/2g/offline tiers to display tiers
type DisplayTier = "excellent" | "good" | "degraded" | "poor" | "offline";
function toDisplayTier(tier: ConnectionTier): DisplayTier {
  if (tier === "offline") return "offline";
  if (tier === "4g") return "good";
  if (tier === "3g") return "degraded";
  return "poor"; // 2g
}

const TIER_CONFIG: Record<DisplayTier, {
  label: string;
  description: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon: React.ReactNode;
  showBanner: boolean;
}> = {
  excellent: { // not used from library but kept for completeness
    label: "Excellent connection",
    description: "",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/30",
    textClass: "text-emerald-700 dark:text-emerald-300",
    borderClass: "border-emerald-200 dark:border-emerald-800",
    icon: <Wifi className="w-4 h-4" />,
    showBanner: false, // hide when everything is fine
  },
  good: {
    label: "Good connection",
    description: "",
    bgClass: "bg-blue-50 dark:bg-blue-950/30",
    textClass: "text-blue-700 dark:text-blue-300",
    borderClass: "border-blue-200 dark:border-blue-800",
    icon: <Wifi className="w-4 h-4" />,
    showBanner: false,
  },
  degraded: {
    label: "Slow connection",
    description: "Some features may be slower than usual. Data is being compressed automatically.",
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-200 dark:border-amber-800",
    icon: <AlertTriangle className="w-4 h-4" />,
    showBanner: true,
  },
  poor: {
    label: "Very slow connection",
    description: "Operating in low-bandwidth mode. Critical operations only. Data is heavily compressed.",
    bgClass: "bg-orange-50 dark:bg-orange-950/30",
    textClass: "text-orange-700 dark:text-orange-300",
    borderClass: "border-orange-200 dark:border-orange-800",
    icon: <AlertTriangle className="w-4 h-4" />,
    showBanner: true,
  },
  offline: {
    label: "No connection",
    description: "You are offline. Actions are being saved locally and will sync when you reconnect.",
    bgClass: "bg-red-50 dark:bg-red-950/30",
    textClass: "text-red-700 dark:text-red-300",
    borderClass: "border-red-200 dark:border-red-800",
    icon: <WifiOff className="w-4 h-4" />,
    showBanner: true,
  },
};

export function NetworkQualityBanner() {
  const [state, setState] = useState<BannerState>({
    tier: "4g" as ConnectionTier,
    rttMs: 0,
    queuedCount: 0,
    isFlushing: false,
    dismissed: false,
  });

  // Re-show banner when tier changes (don't persist dismissal across tier changes)
  const [lastTierShown, setLastTierShown] = useState<ConnectionTier>("4g");

  const refreshQueueCount = useCallback(async () => {
    try {
      const entries = await offlineQueueV2.getPending();
      const count = entries.filter(e => e.status === "pending" || e.status === "retrying").length;
      setState(prev => ({ ...prev, queuedCount: count }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Subscribe to network quality changes
    const unsubscribe = networkQuality.subscribe((quality: NetworkQuality) => {
      const newTier = quality.tier;
      setState(prev => {
        const dismissed = newTier === lastTierShown ? prev.dismissed : false;
        return {
          ...prev,
          tier: newTier,
          rttMs: quality.rttMs,
          dismissed,
        };
      });
      if (newTier !== lastTierShown) {
        setLastTierShown(newTier);
      }
    });

    // Poll queue count every 5 seconds
    refreshQueueCount();
    const interval = setInterval(refreshQueueCount, 5_000);

    // Listen for offline-queue flush events from the service worker
    const handleFlushed = () => refreshQueueCount();
    window.addEventListener("offline-queue:flushed", handleFlushed);

    return () => {
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener("offline-queue:flushed", handleFlushed);
    };
  }, [refreshQueueCount, lastTierShown]);

  const handleFlush = useCallback(async () => {
    setState(prev => ({ ...prev, isFlushing: true }));
    try {
      await offlineQueueV2.flush();
      await refreshQueueCount();
    } catch {
      // ignore
    } finally {
      setState(prev => ({ ...prev, isFlushing: false }));
    }
  }, [refreshQueueCount]);

  const displayTier = toDisplayTier(state.tier);
  const config = TIER_CONFIG[displayTier];

  // Don't render if: connection is fine, or user dismissed, or nothing to show
  const hasQueuedItems = state.queuedCount > 0;
  const shouldShow = (config.showBanner || hasQueuedItems) && !state.dismissed;

  if (!shouldShow) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "w-full border-b px-4 py-2 flex items-center gap-3 text-sm transition-all duration-300",
        config.bgClass,
        config.textClass,
        config.borderClass,
      )}
    >
      {/* Icon */}
      <span className="flex-shrink-0">{config.icon}</span>

      {/* Main message */}
      <div className="flex-1 min-w-0">
        <span className="font-semibold">{config.label}</span>
        {config.description && (
          <span className="ml-2 opacity-80 hidden sm:inline">{config.description}</span>
        )}
        {state.rttMs > 0 && state.tier !== "offline" && (
          <span className="ml-2 opacity-60 text-xs hidden md:inline">
            ({state.rttMs}ms RTT)
          </span>
        )}
      </div>

      {/* Queued requests indicator */}
      {hasQueuedItems && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-medium">
            {state.queuedCount} action{state.queuedCount !== 1 ? "s" : ""} queued
          </span>
          {state.tier !== "offline" && (
            <button
              onClick={handleFlush}
              disabled={state.isFlushing}
              className={cn(
                "ml-1 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                "border border-current opacity-70 hover:opacity-100 transition-opacity",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
              aria-label="Flush offline queue now"
            >
              <RefreshCw className={cn("w-3 h-3", state.isFlushing && "animate-spin")} />
              {state.isFlushing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      )}

      {/* Dismiss button */}
      <button
        onClick={() => setState(prev => ({ ...prev, dismissed: true }))}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1"
        aria-label="Dismiss network banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default NetworkQualityBanner;
