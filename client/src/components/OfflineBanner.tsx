/**
 * OfflineBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Sticky banner shown when the user is offline or on a low-bandwidth connection.
 * Integrates with useOfflineBanner hook for real-time network status.
 */

import { WifiOff, Signal } from "lucide-react";
import { useOfflineBanner } from "@/hooks/useOfflineSync";

export function OfflineBanner() {
  const { isOnline, isLowBandwidth, showBanner } = useOfflineBanner();

  if (!showBanner) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white transition-all ${
        !isOnline
          ? "bg-destructive"
          : "bg-yellow-600"
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>You are offline. Changes will be saved and synced when you reconnect.</span>
        </>
      ) : (
        <>
          <Signal className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Slow connection detected. Some features may be limited.</span>
        </>
      )}
    </div>
  );
}
