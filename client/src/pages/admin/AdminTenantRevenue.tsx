import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, DollarSign, RefreshCw, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import AdminLayout from "./AdminLayout";

export default function AdminTenantRevenue() {
  const [days, setDays] = useState(30);
  const { data = [], isLoading, refetch } = trpc.adminTenantRevenue.getRevenueBreakdown.useQuery({ days });

  const totalFees = data.reduce((s: number, r: any) => s + (r.totalFeesKobo ?? 0), 0);
  const totalVolume = data.reduce((s: number, r: any) => s + (r.grossVolumeKobo ?? 0), 0);
  const totalTx = data.reduce((s: number, r: any) => s + (r.txCount ?? 0), 0);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenant Revenue</h1>
            <p className="text-sm text-gray-500 mt-1">Per-tenant transaction volume and fee analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 365 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Total Platform Fees</p>
                <DollarSign className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-700 mt-1">
                ₦{(totalFees / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Gross Volume</p>
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-700 mt-1">
                ₦{(totalVolume / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Total Transactions</p>
                <BarChart3 className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-purple-700 mt-1">
                {totalTx.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tenant Revenue Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Revenue by Tenant
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-400">Loading revenue data...</div>
            ) : data.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No transaction data for the selected period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-3 pr-4">Tenant</th>
                      <th className="pb-3 pr-4 text-right">Transactions</th>
                      <th className="pb-3 pr-4 text-right">Gross Volume</th>
                      <th className="pb-3 pr-4 text-right">Fees Earned</th>
                      <th className="pb-3 pr-4 text-right">Avg Tx Size</th>
                      <th className="pb-3 text-right">Active Merchants</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row: any, i: number) => (
                      <tr key={row.tenantId} className="border-b hover:bg-gray-50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${i === 0 ? "bg-green-500" : i === 1 ? "bg-blue-500" : "bg-gray-400"}`} />
                            <span className="font-medium text-gray-900">{row.tenantName}</span>
                            {i === 0 && <Badge className="text-xs bg-green-100 text-green-700 border-0">Top</Badge>}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right text-gray-700">
                          {row.txCount.toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 text-right font-medium text-gray-900">
                          ₦{(row.grossVolumeKobo / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-3 pr-4 text-right text-green-700 font-medium">
                          ₦{(row.totalFeesKobo / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-3 pr-4 text-right text-gray-500">
                          ₦{(row.avgTxKobo / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-3 text-right text-gray-700">
                          {row.activeMerchants}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold bg-gray-50">
                      <td className="py-3 pr-4 text-gray-900">Total</td>
                      <td className="py-3 pr-4 text-right text-gray-900">{totalTx.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-gray-900">
                        ₦{(totalVolume / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3 pr-4 text-right text-green-700">
                        ₦{(totalFees / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3 pr-4" />
                      <td className="py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
