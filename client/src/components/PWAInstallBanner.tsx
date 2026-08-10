/**
 * PWAInstallBanner — shows an install-to-homescreen prompt when the browser
 * fires `beforeinstallprompt`.  Dismisses permanently (localStorage) when
 * the user clicks "Not now".
 */
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWA } from "@/hooks/usePWA";
import { useState } from "react";
import { toast } from "sonner";

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, promptInstall, dismissInstall } = usePWA();
  const [installing, setInstalling] = useState(false);

  if (!isInstallable || isInstalled) return null;

  const handleInstall = async () => {
    setInstalling(true);
    const outcome = await promptInstall();
    setInstalling(false);
    if (outcome === "accepted") {
      toast.success("PayGate installed!", {
        description: "You can now launch it from your home screen.",
        duration: 4000,
      });
    }
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-xl shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">Install PayGate</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Add to your home screen for faster access, offline support, and push notifications.
            </p>
          </div>
          <button
            onClick={dismissInstall}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss install prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={handleInstall}
            disabled={installing}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {installing ? "Installing…" : "Install App"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            onClick={dismissInstall}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
