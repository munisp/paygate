// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, DollarSign, Users, BarChart3, Download } from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  scale: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

export default function AdminRevenueAnalytics() {
  const [months, setMonths] = useState(6);

  const { data: revenueByTenant, isLoading, isError } = trpc.wave29.adminAnalytics.revenueByTenant.useQuery({ months }, { staleTime: 30_000 });
  const { data: platformSummary } = trpc.wave29.adminAnalytics.platformSummary.useQuery({ months }, { staleTime: 30_000 });
  const { data: planDistribution } = trpc.wave29.adminAnalytics.planDistribution.useQuery();
  const { data: topTenants } = trpc.wave29.adminAnalytics.topTenants.useQuery({ limit: 10 }, { staleTime: 30_000 });

  const totalRevenue = (platformSummary ?? []).reduce(
    (sum: number, r: any) => sum + Number(r.total_revenue ?? 0), 0
  );
  const totalTenants = new Set(
    (revenueByTenant ?? []).map((r: any) => r.tenant_id)
  ).size;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-72 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenue Analytics</h1>
          <p className="text-gray-500 mt-1">Platform-wide revenue breakdown by tenant, plan, and period</p>
        </div>
        <div className="flex gap-2">
          {[3, 6, 12].map(m => (
            <Button
              key={m}
              size="sm"
              variant={months === m ? "default" : "outline"}
              onClick={() => setMonths(m)}
            >
              {m}M
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
                <p className="text-sm text-gray-500">Total Revenue ({months}M)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalTenants}</p>
                <p className="text-sm text-gray-500">Active Tenants</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  ${totalTenants > 0 ? (totalRevenue / totalTenants).toFixed(2) : "0.00"}
                </p>
                <p className="text-sm text-gray-500">Avg Revenue/Tenant</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{(planDistribution ?? []).length}</p>
                <p className="text-sm text-gray-500">Plan Types Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="by-tenant">
        <TabsList>
          <TabsTrigger value="by-tenant">By Tenant</TabsTrigger>
          <TabsTrigger value="by-period">By Period</TabsTrigger>
          <TabsTrigger value="by-plan">By Plan</TabsTrigger>
          <TabsTrigger value="top">Top Tenants</TabsTrigger>
        </TabsList>

        <TabsContent value="by-tenant">
          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>Overage</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(revenueByTenant ?? []).slice(0, 20).map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.tenant_name}</TableCell>
                      <TableCell>
                        <Badge className={PLAN_COLORS[r.plan] ?? ""}>{r.plan}</Badge>
                      </TableCell>
                      <TableCell>{r.period_year}-{String(r.period_month).padStart(2, "0")}</TableCell>
                      <TableCell>${Number(r.base_amount ?? 0).toFixed(2)}</TableCell>
                      <TableCell>${Number(r.overage_amount ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">${Number(r.total_amount ?? 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "paid" ? "default" : "outline"}>{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(revenueByTenant ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                        No revenue data for selected period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-period">
          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Tenants</TableHead>
                    <TableHead>Total Revenue</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Avg/Tenant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(platformSummary ?? []).map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{r.period_year}-{String(r.period_month).padStart(2, "0")}</TableCell>
                      <TableCell>{r.tenant_count}</TableCell>
                      <TableCell className="font-semibold">${Number(r.total_revenue ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-green-600">${Number(r.collected_revenue ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-amber-600">
                        ${(Number(r.total_revenue ?? 0) - Number(r.collected_revenue ?? 0)).toFixed(2)}
                      </TableCell>
                      <TableCell>${Number(r.avg_revenue_per_tenant ?? 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {(platformSummary ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                        No data for selected period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-plan">
          <div className="grid grid-cols-2 gap-4 mt-4">
            {(planDistribution ?? []).map((p: any) => (
              <Card key={p.plan}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={PLAN_COLORS[p.plan] ?? ""}>{p.plan}</Badge>
                    <span className="text-2xl font-bold">{p.tenant_count}</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Revenue</span>
                      <span className="font-medium">${Number(p.total_revenue ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Avg/Tenant</span>
                      <span className="font-medium">${Number(p.avg_revenue ?? 0).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="top">
          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Total Revenue</TableHead>
                    <TableHead>Invoices</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topTenants ?? []).map((t: any, i: number) => (
                    <TableRow key={t.tenant_id}>
                      <TableCell className="font-bold text-gray-400">#{i + 1}</TableCell>
                      <TableCell className="font-medium">{t.tenant_name}</TableCell>
                      <TableCell>
                        <Badge className={PLAN_COLORS[t.plan] ?? ""}>{t.plan}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">${Number(t.total_revenue ?? 0).toFixed(2)}</TableCell>
                      <TableCell>{t.invoice_count}</TableCell>
                    </TableRow>
                  ))}
                  {(topTenants ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                        No data available.
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
