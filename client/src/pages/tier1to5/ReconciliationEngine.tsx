import { useState } from "react";
import { trpc2 } from "@/lib/trpc2";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, CheckCircle, AlertCircle, Play, FileText } from "lucide-react";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function ReconciliationEngine() {
  const [dateRange, setDateRange] = useState("today");
  const [source, setSource] = useState("all");

  const [reportId, setReportId] = useState("latest");
  const { data: report, isLoading, refetch } = trpc2.reconciliation.getReconciliationReport.useQuery({ reportId });
  const { data: discrepancies } = trpc2.reconciliation.getDiscrepancies.useQuery({ status: "open" });

  const runMutation = trpc2.reconciliation.runReconciliation.useMutation({
    onSuccess: () => { toast.success("Reconciliation job started. Results will be ready in ~2 minutes."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const resolveMutation = trpc2.reconciliation.resolveDiscrepancy.useMutation({
    onSuccess: () => { toast.success("Discrepancy resolved."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColor: Record<string, string> = {
    matched: "bg-green-100 text-green-800",
    unmatched: "bg-red-100 text-red-800",
    partial: "bg-yellow-100 text-yellow-800",
    pending: "bg-blue-100 text-blue-800",
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reconciliation Engine</h1>
            <p className="text-muted-foreground text-sm mt-1">Automated multi-source transaction matching with lakehouse integration</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
            <Button size="sm" onClick={() => runMutation.mutate({ periodStart: new Date(Date.now() - 86400000).toISOString(), periodEnd: new Date().toISOString(), sources: source === 'all' ? undefined : [source] })} disabled={runMutation.isPending}>
              <Play className="w-4 h-4 mr-2" />{runMutation.isPending ? "Running..." : "Run Reconciliation"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last_7_days">Last 7 Days</SelectItem>
              <SelectItem value="last_30_days">Last 30 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="paystack">Paystack</SelectItem>
              <SelectItem value="flutterwave">Flutterwave</SelectItem>
              <SelectItem value="mojaloop">Mojaloop</SelectItem>
              <SelectItem value="nibss">NIBSS</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <Card key={i} className="animate-pulse h-24" />)}</div>
        ) : report ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Transactions</p>
                <p className="text-2xl font-bold">{report.totalCount?.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Matched</p>
                <p className="text-2xl font-bold text-green-600">{report.matchedCount?.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{report.matchRate?.toFixed(1)}% match rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Unmatched</p>
                <p className="text-2xl font-bold text-red-600">{report.unmatchedCount?.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{formatNGN(report.unmatchedAmountKobo ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Volume</p>
                <p className="text-2xl font-bold">{formatNGN(report.totalVolumeKobo ?? 0)}</p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Discrepancies */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Unresolved Discrepancies
            {discrepancies?.length ? <Badge variant="destructive">{discrepancies.length}</Badge> : null}
          </h2>
          {!discrepancies?.length ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-500 opacity-50" />
                <p>No unresolved discrepancies. All transactions matched.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {discrepancies.map((d: any) => (
                <Card key={d.id} className="border-red-100">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className={statusColor[d.type] ?? "bg-gray-100 text-gray-800"}>{d.type}</Badge>
                          <span className="font-mono text-sm">{d.reference}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Expected: {formatNGN(d.expectedKobo)} · Found: {formatNGN(d.foundKobo)} · Diff: {formatNGN(Math.abs(d.expectedKobo - d.foundKobo))}
                        </p>
                        <p className="text-xs text-muted-foreground">Source: {d.source} · {new Date(d.createdAt).toLocaleString()}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ discrepancyId: d.id, resolution: "manual_match", notes: "Resolved via dashboard" })} disabled={resolveMutation.isPending}>
                        Resolve
                      </Button>
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
