import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle, Zap } from "lucide-react";
import { useAdaptiveInterval } from "@/lib/networkQuality";

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  scale: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

export default function RateLimitDashboard() {
  const rateLimitInterval = useAdaptiveInterval(60000);
  const { data: stats, refetch, isLoading } = trpc.wave29.rateLimitDashboard.getStats.useQuery(
    {},
    { refetchInterval: rateLimitInterval , staleTime: 30_000 })

  const setOverride = trpc.wave29.rateLimitDashboard.setOverride.useMutation({
    onSuccess: () => { toast.success("Rate limit override applied"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const critical = (stats ?? []).filter((s: any) => Number(s.usage_pct) >= 90);
  const warning = (stats ?? []).filter((s: any) => Number(s.usage_pct) >= 70 && Number(s.usage_pct) < 90);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rate Limit Dashboard</h1>
        <p className="text-gray-500 mt-1">Monitor API usage vs plan quotas across all tenants</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(stats ?? []).filter((s: any) => Number(s.usage_pct) < 70).length}
                </p>
                <p className="text-sm text-gray-500">Healthy Tenants</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{warning.length}</p>
                <p className="text-sm text-gray-500">Warning (70–90%)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Zap className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{critical.length}</p>
                <p className="text-sm text-gray-500">Critical (≥90%)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alerts */}
      {critical.length > 0 && (
        <div className="space-y-2">
          {critical.map((s: any) => (
            <div key={s.tenant_id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <div>
                  <p className="font-medium text-red-800">{s.tenant_name} — {Number(s.usage_pct).toFixed(1)}% quota used</p>
                  <p className="text-xs text-red-600">
                    {Number(s.api_calls).toLocaleString()} / {Number(s.max_api_calls_per_month).toLocaleString()} calls
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700"
                onClick={() => setOverride.mutate({
                  tenantId: s.tenant_id,
                  overrideMultiplier: 2,
                  reason: "Emergency override — quota exceeded",
                })}
              >
                Apply 2x Override
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Full Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            All Tenants — Current Month Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>API Calls</TableHead>
                <TableHead>Quota</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(stats ?? []).map((s: any) => {
                const pct = Number(s.usage_pct ?? 0);
                const color = pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-green-600";
                return (
                  <TableRow key={s.tenant_id}>
                    <TableCell className="font-medium">{s.tenant_name}</TableCell>
                    <TableCell>
                      <Badge className={PLAN_COLORS[s.plan] ?? ""}>{s.plan}</Badge>
                    </TableCell>
                    <TableCell>{Number(s.api_calls ?? 0).toLocaleString()}</TableCell>
                    <TableCell>{Number(s.max_api_calls_per_month ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="w-48">
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(pct, 100)} className="h-2 flex-1" />
                        <span className={`text-xs font-medium ${color}`}>{pct.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOverride.mutate({
                          tenantId: s.tenant_id,
                          overrideMultiplier: 2,
                          reason: "Admin override",
                        })}
                      >
                        Override
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(stats ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                    No usage data for current month.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
