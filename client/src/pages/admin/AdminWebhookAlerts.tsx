/**
 * AdminWebhookAlerts.tsx
 *
 * Real-time webhook failure alert dashboard for administrators.
 * - Auto-refreshes every 30 seconds
 * - Shows severity breakdown (critical / warning / info)
 * - Allows per-alert and bulk acknowledgement
 * - Links to full WebhookDeliveries page for retry
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Bell, BellOff, CheckCheck, ExternalLink, RefreshCw, ShieldAlert, Wifi } from "lucide-react";
import { toast } from "sonner";

const SEVERITY_COLORS = {
  critical: "destructive" as const,
  warning: "secondary" as const,
  info: "outline" as const,
};

const SEVERITY_ICONS = {
  critical: <ShieldAlert className="w-4 h-4 text-red-500" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
  info: <Bell className="w-4 h-4 text-blue-500" />,
};

export default function AdminWebhookAlerts() {
  const [, navigate] = useLocation();
  const [windowMinutes, setWindowMinutes] = useState(60);

  const { data: summary, isLoading, refetch, isFetching } = trpc.admin.webhookAlerts.summary.useQuery(
    { windowMinutes },
    { refetchInterval: 30_000 }
  );

  const acknowledgeMutation = trpc.admin.webhookAlerts.acknowledge.useMutation({
    onSuccess: () => {
      toast.success("Alert acknowledged");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const acknowledgeAllMutation = trpc.admin.webhookAlerts.acknowledgeAll.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.acknowledged} alert${data.acknowledged !== 1 ? "s" : ""} acknowledged`);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const failures = summary?.recentFailures ?? [];
  const hasAlerts = failures.length > 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Webhook Failure Alerts</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Real-time monitoring of failed webhook deliveries across all merchants
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(windowMinutes)} onValueChange={(v) => setWindowMinutes(Number(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">Last 15 min</SelectItem>
                <SelectItem value="60">Last 1 hour</SelectItem>
                <SelectItem value="360">Last 6 hours</SelectItem>
                <SelectItem value="1440">Last 24 hours</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {hasAlerts && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => acknowledgeAllMutation.mutate({ windowMinutes })}
                disabled={acknowledgeAllMutation.isPending}
              >
                <CheckCheck className="w-4 h-4 mr-2" />
                Acknowledge All
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-foreground">{summary?.totalFailed ?? 0}</div>
              <div className="text-sm text-muted-foreground mt-1">Total Failures</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-red-600">{summary?.criticalCount ?? 0}</div>
              <div className="text-sm text-muted-foreground mt-1">Critical</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 dark:border-yellow-900">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-yellow-600">{summary?.warningCount ?? 0}</div>
              <div className="text-sm text-muted-foreground mt-1">Warnings</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-foreground">{summary?.affectedMerchants ?? 0}</div>
              <div className="text-sm text-muted-foreground mt-1">Affected Merchants</div>
            </CardContent>
          </Card>
        </div>

        {/* Alert List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wifi className="w-5 h-5" />
              Recent Failures
              {hasAlerts && (
                <Badge variant="destructive" className="ml-2">
                  {failures.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Auto-refreshing every 30s
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !hasAlerts ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <BellOff className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">No webhook failures</p>
                <p className="text-sm mt-1">All deliveries are healthy in the selected window</p>
              </div>
            ) : (
              <div className="space-y-3">
                {failures.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start justify-between p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-0.5">{SEVERITY_ICONS[alert.severity]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{alert.merchantName}</span>
                          <Badge variant={SEVERITY_COLORS[alert.severity]} className="text-xs">
                            {alert.severity}
                          </Badge>
                          <Badge variant="outline" className="text-xs font-mono">
                            {alert.eventType}
                          </Badge>
                          {alert.responseStatus && (
                            <Badge variant="outline" className="text-xs">
                              HTTP {alert.responseStatus}
                            </Badge>
                          )}
                          {alert.attemptCount > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              Attempt {alert.attemptCount}
                            </Badge>
                          )}
                        </div>
                        {alert.errorMessage && (
                          <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                            {alert.errorMessage}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(alert.failedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/webhooks/deliveries")}
                        title="View in delivery log"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => acknowledgeMutation.mutate({ deliveryId: alert.id })}
                        disabled={acknowledgeMutation.isPending}
                        title="Acknowledge alert"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
