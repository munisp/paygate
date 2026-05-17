import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import {
  CreditCard, TrendingUp, Activity, AlertTriangle, CheckCircle,
  Download, RefreshCw, Zap, Star, Rocket, Building2,
} from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  scale: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

const PLAN_ICONS: Record<string, any> = {
  starter: Zap,
  growth: TrendingUp,
  scale: Rocket,
  enterprise: Building2,
};

export default function TenantBillingDashboard() {
  const tenantBillingInterval = useAdaptiveInterval(30000);
  const [selectedTenant, setSelectedTenant] = useState<string>("3");
  const now = new Date();

  const { data: quota, isLoading: quotaLoading } = trpc.wave29.tenantBilling.checkQuota.useQuery(
    { tenantId: selectedTenant },
    { refetchInterval: tenantBillingInterval }, staleTime: 30_000})

  const { data: plans } = trpc.wave29.tenantBilling.getAllPlans.useQuery();

  const { data: invoices } = trpc.wave29.tenantBilling.getInvoices.useQuery(
    { tenantId: selectedTenant, limit: 12 }, staleTime: 30_000})

  const { data: revenueAnalytics } = trpc.wave29.tenantBilling.getRevenueAnalytics.useQuery(
    { months: 6 }, staleTime: 30_000})

  const generateInvoice = trpc.wave29.tenantBilling.generateInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice generated: $${data.total.toFixed(2)}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const trackApiCall = trpc.wave29.tenantBilling.trackApiCall.useMutation();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Billing & Usage</h1>
          <p className="text-gray-500 mt-1">Monitor API usage, quotas, and invoices per tenant</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => trackApiCall.mutate({ tenantId: selectedTenant, calls: 100 })}
          >
            <Activity className="w-4 h-4 mr-2" />
            Simulate 100 Calls
          </Button>
          <Button
            size="sm"
            onClick={() => generateInvoice.mutate({
              tenantId: selectedTenant,
              year: now.getFullYear(),
              month: now.getMonth() + 1,
            })}
            disabled={generateInvoice.isPending}
          >
            <Download className="w-4 h-4 mr-2" />
            Generate Invoice
          </Button>
        </div>
      </div>

      {/* Quota Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">API Calls Usage</CardTitle>
          </CardHeader>
          <CardContent>
            {quotaLoading ? (
              <div className="h-12 bg-gray-100 animate-pulse rounded" />
            ) : (
              <>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-2xl font-bold">
                    {(quota?.apiCalls ?? 0).toLocaleString()}
                  </span>
                  <span className="text-sm text-gray-500">
                    / {(quota?.maxApiCalls ?? 0).toLocaleString()}
                  </span>
                </div>
                <Progress value={quota?.apiCallPct ?? 0} className="h-2" />
                <p className="text-xs text-gray-500 mt-1">{quota?.apiCallPct ?? 0}% used this month</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Transaction Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {quotaLoading ? (
              <div className="h-12 bg-gray-100 animate-pulse rounded" />
            ) : (
              <>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-2xl font-bold">
                    ₦{((quota?.txVolume ?? 0) / 100).toLocaleString()}
                  </span>
                  <span className="text-sm text-gray-500">
                    / ₦{((quota?.maxTxVolume ?? 0) / 100).toLocaleString()}
                  </span>
                </div>
                <Progress value={quota?.txVolumePct ?? 0} className="h-2" />
                <p className="text-xs text-gray-500 mt-1">{quota?.txVolumePct ?? 0}% used this month</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Quota Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mt-2">
              {quota?.withinQuota !== false ? (
                <>
                  <CheckCircle className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="font-semibold text-green-700">Within Quota</p>
                    <p className="text-xs text-gray-500">All limits OK</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                  <div>
                    <p className="font-semibold text-red-700">Quota Exceeded</p>
                    <p className="text-xs text-gray-500">Overage charges apply</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="plans">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            {(plans ?? []).map((plan: any) => {
              const Icon = PLAN_ICONS[plan.plan] ?? Star;
              return (
                <Card key={plan.plan} className="relative overflow-hidden">
                  {plan.plan === "scale" && (
                    <div className="absolute top-0 right-0 bg-purple-500 text-white text-xs px-2 py-1 rounded-bl">
                      Popular
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5" />
                      <Badge className={PLAN_COLORS[plan.plan] ?? ""}>
                        {plan.plan.charAt(0).toUpperCase() + plan.plan.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">API Calls/mo</span>
                      <span className="font-medium">{Number(plan.max_api_calls_per_month).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tx Volume/mo</span>
                      <span className="font-medium">₦{(Number(plan.max_tx_volume_per_month) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Max Users</span>
                      <span className="font-medium">{plan.max_users === -1 ? "Unlimited" : plan.max_users}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Corridors</span>
                      <span className="font-medium">{plan.max_corridors === -1 ? "Unlimited" : plan.max_corridors}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">SLA</span>
                      <span className="font-medium">{plan.sla_uptime_pct}%</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>Overage</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                        No invoices yet. Click "Generate Invoice" to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (invoices ?? []).map((inv: any) => (
                      <TableRow key={`${inv.period_year}-${inv.period_month}`}>
                        <TableCell>{inv.period_year}-{String(inv.period_month).padStart(2, "0")}</TableCell>
                        <TableCell>
                          <Badge className={PLAN_COLORS[inv.plan] ?? ""}>{inv.plan}</Badge>
                        </TableCell>
                        <TableCell>${Number(inv.base_amount).toFixed(2)}</TableCell>
                        <TableCell>${Number(inv.overage_amount).toFixed(2)}</TableCell>
                        <TableCell className="font-semibold">${Number(inv.total_amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "paid" ? "default" : "outline"}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Platform Revenue (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Tenants</TableHead>
                    <TableHead>Total Revenue</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Avg/Tenant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(revenueAnalytics ?? []).map((row: any) => (
                    <TableRow key={`${row.period_year}-${row.period_month}`}>
                      <TableCell>{row.period_year}-{String(row.period_month).padStart(2, "0")}</TableCell>
                      <TableCell>{row.tenant_count}</TableCell>
                      <TableCell>${Number(row.total_revenue ?? 0).toFixed(2)}</TableCell>
                      <TableCell>${Number(row.collected_revenue ?? 0).toFixed(2)}</TableCell>
                      <TableCell>${Number(row.avg_revenue_per_tenant ?? 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {(revenueAnalytics ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                        No revenue data yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
