import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, Eye, CheckCircle, XCircle } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function AMLMonitor() {
  const { data: alerts, isLoading, refetch } = trpc.tier1to5.aml.getAlerts.useQuery({ status: "open", limit: 50 }, { staleTime: 30_000 });
  const { data: riskScore } = trpc.tier1to5.aml.getMerchantRiskScore.useQuery();

  const updateMutation = trpc.tier1to5.aml.updateAlert.useMutation({
    onSuccess: () => { toast.success("Alert updated."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const riskColor = (score: number) => {
    if (score < 30) return "text-green-600";
    if (score < 60) return "text-yellow-600";
    return "text-red-600";
  };

  const severityColor: Record<string, string> = {
    low: "bg-blue-100 text-blue-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  };

  if (!isLoading && !alerts) {
    return (
      <DashboardLayout>
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">AML Transaction Monitoring</h1>
            <p className="text-muted-foreground text-sm mt-1">Real-time AML rule engine with Kafka streams and Redis velocity checks</p>
          </div>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh</Button>
        </div>

        {/* Risk Score */}
        {riskScore && (
          <Card className="border-2 border-muted">
            <CardContent className="p-4 flex items-center gap-6">
              <div className="text-center">
                <p className={`text-4xl font-bold ${riskColor(riskScore.score)}`}>{riskScore.score}</p>
                <p className="text-xs text-muted-foreground mt-1">Risk Score</p>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Risk Level</p>
                  <Badge className={severityColor[riskScore.level] ?? "bg-gray-100 text-gray-800"}>{riskScore.level}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Open Alerts</p>
                  <p className="font-bold">{riskScore.openAlerts}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="text-sm">{riskScore.lastUpdated ? new Date(riskScore.lastUpdated).toLocaleString() : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alerts */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Open AML Alerts
            {alerts?.length ? <Badge variant="destructive">{alerts.length}</Badge> : null}
          </h2>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Card key={i} className="animate-pulse h-20" />)}</div>
          ) : !alerts?.length ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-500 opacity-50" />
                <p>No open AML alerts. Transaction patterns look normal.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert: any) => (
                <Card key={alert.id} className="border-orange-100">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className={severityColor[alert.severity] ?? "bg-gray-100 text-gray-800"}>{alert.severity}</Badge>
                          <span className="font-semibold text-sm">{alert.ruleCode}</span>
                          <span className="text-sm">{formatNGN(alert.amountKobo)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{alert.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Customer: {alert.customerId} · {new Date(alert.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ alertId: alert.id, status: "under_review", notes: "Under review" })}>
                          <Eye className="w-3 h-3 mr-1" />Review
                        </Button>
                        <Button size="sm" variant="outline" className="text-green-600" onClick={() => updateMutation.mutate({ alertId: alert.id, status: "cleared", notes: "False positive — cleared" })}>
                          <CheckCircle className="w-3 h-3 mr-1" />Clear
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => updateMutation.mutate({ alertId: alert.id, status: "escalated", notes: "Escalated to compliance team" })}>
                          <XCircle className="w-3 h-3 mr-1" />Escalate
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
