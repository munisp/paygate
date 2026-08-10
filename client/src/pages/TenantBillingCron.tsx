import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Play, CheckCircle, XCircle, Clock, DollarSign, FileText, TrendingUp } from "lucide-react";

export default function TenantBillingCron() {
  const [running, setRunning] = useState(false);

  const { data: runsData, refetch: refetchRuns, isLoading } = trpc.wave31.tenantBillingCron.listRuns.useQuery();
  const { data: statsData } = trpc.wave31.tenantBillingCron.getStats.useQuery();

  const triggerRun = trpc.wave31.tenantBillingCron.triggerManualRun.useMutation({
    onSuccess: (data) => {
      toast.success(`Billing cron completed: ${data.invoicesGenerated} invoices generated, $${data.totalAmount.toFixed(2)} total`);
      refetchRuns();
      setRunning(false);
    },
    onError: () => {
      toast.error("Failed to trigger billing cron");
      setRunning(false);
    },
  });

  const handleTrigger = () => {
    setRunning(true);
    triggerRun.mutate({});
  };

  const stats = statsData as any;
  const runs = (runsData as any)?.runs ?? [];

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      completed: "bg-green-100 text-green-800",
      running: "bg-blue-100 text-blue-800",
      failed: "bg-red-100 text-red-800",
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${variants[status] ?? "bg-gray-100 text-gray-800"}`}>{status}</span>;
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing Auto-Renewal Cron</h1>
          <p className="text-muted-foreground">Manage monthly invoice generation for all partner tenants</p>
        </div>
        <Button onClick={handleTrigger} disabled={running} className="gap-2">
          {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? "Running..." : "Trigger Manual Run"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Runs", value: stats?.total_runs ?? 0, icon: RefreshCw, color: "text-blue-600" },
          { label: "Total Invoices", value: stats?.total_invoices ?? 0, icon: FileText, color: "text-purple-600" },
          { label: "Total Revenue", value: `$${Number(stats?.total_revenue ?? 0).toFixed(2)}`, icon: DollarSign, color: "text-green-600" },
          { label: "Success Rate", value: `${stats?.total_runs ? Math.round((Number(stats.successful_runs) / Number(stats.total_runs)) * 100) : 0}%`, icon: TrendingUp, color: "text-emerald-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cron Schedule Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cron Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">Schedule</p>
              <p className="text-muted-foreground font-mono">0 0 1 * * (1st of month)</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">Next Run</p>
              <p className="text-muted-foreground">{new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString()}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">Status</p>
              <p className="text-green-600 font-medium flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Active</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run Type</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoices</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Completed At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No runs yet. Trigger a manual run to get started.</TableCell></TableRow>
              ) : runs.map((run: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{run.run_type}</TableCell>
                  <TableCell>{run.tenant_name ?? (run.tenant_id ? `Tenant #${run.tenant_id}` : "All Tenants")}</TableCell>
                  <TableCell>{statusBadge(run.status)}</TableCell>
                  <TableCell>{run.invoices_generated}</TableCell>
                  <TableCell>${Number(run.total_amount ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {run.completed_at ? new Date(run.completed_at).toLocaleString() : <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> In progress</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
