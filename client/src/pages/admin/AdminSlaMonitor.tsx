import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAdaptiveInterval } from "@/lib/networkQuality";

export default function AdminSlaMonitor() {
  const adminSlaInterval = useAdaptiveInterval(30000);
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, isLoading, refetch } = trpc.adminSlaMonitor.getBreachMetrics.useQuery(undefined, {
    refetchInterval: adminSlaInterval,
  });

  const metrics = data?.metrics;
  const breached = data?.breachedSettlements ?? [];

  const slaHealthScore = metrics
    ? Math.max(0, 100 - Math.round((metrics.breachedCount / Math.max(1, metrics.completedCount + metrics.pendingCount + metrics.processingCount)) * 100))
    : null;

  const healthColor = slaHealthScore == null ? "gray"
    : slaHealthScore >= 95 ? "green"
    : slaHealthScore >= 80 ? "yellow"
    : "red";

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SLA Monitor</h1>
            <p className="text-sm text-gray-500 mt-1">Real-time settlement SLA breach tracking</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Health Score */}
        <div className={`rounded-xl p-6 border-2 ${
          healthColor === "green" ? "bg-green-50 border-green-200" :
          healthColor === "yellow" ? "bg-yellow-50 border-yellow-200" :
          "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center gap-4">
            {healthColor === "green" ? <CheckCircle className="w-10 h-10 text-green-600" /> :
             healthColor === "yellow" ? <AlertTriangle className="w-10 h-10 text-yellow-600" /> :
             <AlertTriangle className="w-10 h-10 text-red-600" />}
            <div>
              <p className="text-sm font-medium text-gray-600">SLA Health Score</p>
              <p className={`text-4xl font-bold ${
                healthColor === "green" ? "text-green-700" :
                healthColor === "yellow" ? "text-yellow-700" :
                "text-red-700"
              }`}>
                {slaHealthScore != null ? `${slaHealthScore}%` : "—"}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm text-gray-500">Auto-refreshes every 30s</p>
              <p className="text-xs text-gray-400 mt-1">Target: ≥ 95%</p>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Pending", value: metrics?.pendingCount, icon: Clock, color: "blue" },
            { label: "Processing", value: metrics?.processingCount, icon: Zap, color: "purple" },
            { label: "Completed", value: metrics?.completedCount, icon: CheckCircle, color: "green" },
            { label: "SLA Breached", value: metrics?.breachedCount, icon: AlertTriangle, color: "red" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{label}</p>
                  <Icon className={`w-4 h-4 text-${color}-500`} />
                </div>
                <p className={`text-2xl font-bold mt-1 text-${color}-700`}>
                  {isLoading ? "—" : (value ?? 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Settlement Time</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900">
                {isLoading ? "—" : `${metrics?.avgSettlementHours?.toFixed(1) ?? "0.0"}h`}
              </p>
              <p className="text-xs text-gray-400 mt-1">Target: ≤ 24h</p>
              {metrics && metrics.avgSettlementHours > 24 ? (
                <div className="flex items-center gap-1 mt-2 text-red-600 text-xs">
                  <TrendingUp className="w-3 h-3" /> Above SLA target
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-2 text-green-600 text-xs">
                  <TrendingDown className="w-3 h-3" /> Within SLA target
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Oldest Pending Settlement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${(metrics?.oldestPendingHours ?? 0) > 48 ? "text-red-700" : "text-gray-900"}`}>
                {isLoading ? "—" : `${metrics?.oldestPendingHours?.toFixed(1) ?? "0.0"}h`}
              </p>
              <p className="text-xs text-gray-400 mt-1">Alert threshold: 48h</p>
              {metrics && metrics.unalertedCount > 0 && (
                <Badge variant="destructive" className="mt-2 text-xs">
                  {metrics.unalertedCount} unalerted breach{metrics.unalertedCount !== 1 ? "es" : ""}
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Breached Settlements Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              SLA Breached Settlements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-400">Loading...</div>
            ) : breached.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-gray-500">No SLA breaches. All settlements are on time.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4">Settlement ID</th>
                      <th className="pb-2 pr-4">Merchant</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Created</th>
                      <th className="pb-2">SLA Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breached.map((s: any) => (
                      <tr key={s.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 pr-4 font-mono text-xs text-gray-600">{s.id?.slice(0, 12)}...</td>
                        <td className="py-2 pr-4 text-gray-700">{s.merchant_id?.slice(0, 10)}...</td>
                        <td className="py-2 pr-4 font-medium">₦{((s.amount ?? 0) / 100).toLocaleString()}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={s.status === "completed" ? "default" : "secondary"}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-gray-500 text-xs">
                          {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-2 text-red-600 text-xs">
                          {s.sla_deadline ? new Date(s.sla_deadline).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
