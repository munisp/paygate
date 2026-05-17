import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi, WifiOff, AlertTriangle, Monitor } from "lucide-react";
import { useAdaptiveInterval } from "@/lib/networkQuality";

export default function KioskHealth() {
  const kioskInterval = useAdaptiveInterval(15000);
  const { isAuthenticated } = useAuth();

  const { data, isLoading, refetch, error } = trpc.agentBanking.kioskHealth.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: kioskInterval , staleTime: 30_000 })

  const health: any = data ?? { total: 0, online: 0, warning: 0, offline: 0, terminals: [] };
  const terminals: any[] = health.terminals ?? [];

  const healthIcon = (status: string) => {
    if (status === "online") return <Wifi className="w-4 h-4 text-green-500" />;
    if (status === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    return <WifiOff className="w-4 h-4 text-red-500" />;
  };

  const healthBadge = (status: string) => {
    const map: Record<string, string> = {
      online: "bg-green-100 text-green-800",
      warning: "bg-yellow-100 text-yellow-800",
      offline: "bg-red-100 text-red-800",
    };
    return map[status] ?? "bg-gray-100 text-gray-800";
  };

  // Show error toast when queries fail
  if (error) {
    toast.error(error.message ?? "An error occurred");
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kiosk & Terminal Health</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time heartbeat monitoring — auto-refreshes every 15 seconds
          </p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Monitor className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <div className="text-3xl font-bold">{health.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Online</span>
            </div>
            <div className="text-3xl font-bold text-green-600">{health.online}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Warning</span>
            </div>
            <div className="text-3xl font-bold text-yellow-600">{health.warning}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <WifiOff className="w-4 h-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Offline</span>
            </div>
            <div className="text-3xl font-bold text-red-600">{health.offline}</div>
          </CardContent>
        </Card>
      </div>

      {/* Terminal list */}
      <Card>
        <CardHeader>
          <CardTitle>Terminal Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading terminals…</div>
          ) : terminals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No terminals registered yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {terminals.map((t: any) => (
                <div key={t.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {healthIcon(t.health)}
                      <span className="font-medium">{t.terminalLabel}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${healthBadge(t.health)}`}>
                      {t.health}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Type: <span className="text-foreground">{t.terminalType ?? "—"}</span></div>
                    <div>
                      Last heartbeat:{" "}
                      <span className="text-foreground">
                        {t.lastHeartbeatAt
                          ? new Date(t.lastHeartbeatAt).toLocaleString()
                          : "Never"}
                      </span>
                    </div>
                    {t.minutesSinceHeartbeat != null && (
                      <div>
                        Silence:{" "}
                        <span className={t.minutesSinceHeartbeat > 30 ? "text-red-600 font-medium" : "text-foreground"}>
                          {t.minutesSinceHeartbeat.toFixed(0)} min
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
