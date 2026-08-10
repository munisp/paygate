/**
 * PayGate Web — OfflineIndicator (Wave 19: enhanced with queue status)
 *
 * Shows:
 *  - Offline banner with pending mutation count
 *  - "Back online" confirmation with auto-flush result
 *  - Manual "Retry now" button for weak-connectivity scenarios
 *
 * Nigeria-specific UX:
 *  - Persistent banner while offline so merchants know data is queued
 *  - Shows exactly how many operations are waiting to sync
 *  - "Retry now" lets merchants manually trigger a flush on brief connectivity
 */
import { useState, useEffect } from "react";
import { WifiOff, RefreshCw, CheckCircle, Clock } from "lucide-react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { Button } from "@/components/ui/button";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);
  const [syncResult, setSyncResult] = useState<{ succeeded: number; failed: number } | null>(null);
  const { pendingCount, isFlushing, flush } = useOfflineQueue();

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setShowBack(true);
      if (pendingCount > 0) {
        const result = await flush();
        setSyncResult(result);
      }
      setTimeout(() => { setShowBack(false); setSyncResult(null); }, 5_000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowBack(false);
      setSyncResult(null);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush, pendingCount]);

  const handleManualRetry = async () => {
    const result = await flush();
    setSyncResult(result);
    setTimeout(() => setSyncResult(null), 4_000);
  };

  if (isOnline && !showBack && pendingCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300 max-w-sm">
      {!isOnline && (
        <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg">
          <div className="flex items-start gap-3">
            <WifiOff className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">You're offline</p>
              {pendingCount > 0 ? (
                <p className="text-xs opacity-90 mt-0.5">
                  {pendingCount} operation{pendingCount !== 1 ? "s" : ""} queued — will sync when you reconnect
                </p>
              ) : (
                <p className="text-xs opacity-80 mt-0.5">Read-only mode. New operations will be queued.</p>
              )}
            </div>
          </div>
          {pendingCount > 0 && isOnline && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full text-xs h-7"
              onClick={handleManualRetry}
              disabled={isFlushing}
            >
              {isFlushing ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Syncing…</> : <><RefreshCw className="w-3 h-3 mr-1.5" />Retry now</>}
            </Button>
          )}
        </div>
      )}

      {isOnline && !showBack && pendingCount > 0 && (
        <div className="bg-amber-600 text-white px-4 py-3 rounded-lg shadow-lg">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm">{pendingCount} operation{pendingCount !== 1 ? "s" : ""} pending sync</p>
              <p className="text-xs opacity-80">From when you were offline</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 bg-white/10 border-white/30 text-white hover:bg-white/20 shrink-0"
              onClick={handleManualRetry}
              disabled={isFlushing}
            >
              {isFlushing ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Sync"}
            </Button>
          </div>
        </div>
      )}

      {isOnline && showBack && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Back online</p>
            {syncResult && syncResult.succeeded > 0 && (
              <p className="text-xs opacity-90">
                {syncResult.succeeded} queued operation{syncResult.succeeded !== 1 ? "s" : ""} synced
                {syncResult.failed > 0 ? ` (${syncResult.failed} failed)` : ""}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
