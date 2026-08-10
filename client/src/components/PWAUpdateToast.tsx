/**
 * PWAUpdateToast — listens for the custom `pwa:update-available` event
 * dispatched by the service worker registration in main.tsx and shows a
 * persistent Sonner toast that lets the user reload to get the new version.
 */
import { useEffect } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PWAUpdateToast() {
  useEffect(() => {
    const handleUpdate = () => {
      toast.info("New version available", {
        description: "A new version of PayGate is ready. Reload to update.",
        duration: Infinity,
        id: "pwa-update",
        action: (
          <Button
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={() => {
              // Tell the waiting service worker to take control immediately
              navigator.serviceWorker.getRegistration().then((reg) => {
                if (reg?.waiting) {
                  reg.waiting.postMessage({ type: "SKIP_WAITING" });
                }
              });
              window.location.reload();
            }}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Reload
          </Button>
        ),
      });
    };

    window.addEventListener("pwa:update-available", handleUpdate);
    return () => window.removeEventListener("pwa:update-available", handleUpdate);
  }, []);

  return null;
}
