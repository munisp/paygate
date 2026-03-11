/**
 * OfflineIndicator Component
 * Adapted from PayGate PWA archive.
 * Shows offline/syncing/pending states using navigator.onLine.
 */
import { useState, useEffect } from "react";
import { WifiOff, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowBack(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline && !showBack) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      {!isOnline && (
        <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <WifiOff className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">You're offline</p>
            <p className="text-xs opacity-80">Changes will sync when you reconnect</p>
          </div>
        </div>
      )}
      {isOnline && showBack && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <p className="font-semibold text-sm">Back online</p>
        </div>
      )}
    </div>
  );
}
