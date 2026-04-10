import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Database, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminSystemHealth() {
  const healthQuery = trpc.admin.health.getOverview.useQuery(undefined, { refetchInterval: 30000 });
  const dbQuery = trpc.admin.health.getDatabaseStats.useQuery(undefined, { refetchInterval: 30000 });

  const services = (healthQuery.data as any)?.services ?? [];
  const dbStats = (dbQuery.data as any)?.tables ?? [];
  const lastUpdated = (healthQuery.data as any)?.checkedAt;

  const statusIcon = (status: string) => {
    if (status === "healthy") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === "degraded") return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    return <XCircle className="w-4 h-4 text-red-400" />;
  };

  const statusColor = (status: string) => {
    if (status === "healthy") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (status === "degraded") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">System Health</h1>
            <p className="text-slate-400 text-sm mt-1">Real-time service status — auto-refreshes every 30 seconds</p>
          </div>
          {lastUpdated && <p className="text-slate-500 text-xs">Last updated: {new Date(lastUpdated).toLocaleTimeString("en-NG")}</p>}
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Activity className="w-4 h-4 text-green-400" /> Service Status</CardTitle></CardHeader>
          <CardContent>
            {healthQuery.isLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 w-full bg-slate-800" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {services.map((svc: any) => (
                  <div key={svc.name} className={cn("p-3 rounded-lg border", svc.status === "healthy" ? "bg-green-950/30 border-green-900" : svc.status === "degraded" ? "bg-amber-950/30 border-amber-900" : "bg-red-950/30 border-red-900")}>
                    <div className="flex items-center gap-2 mb-1">
                      {statusIcon(svc.status)}
                      <p className="text-xs font-medium text-white truncate">{svc.name}</p>
                    </div>
                    <Badge className={`text-xs border ${statusColor(svc.status)}`}>{svc.status}</Badge>
                    {svc.latencyMs != null && <p className="text-xs text-slate-400 mt-1">{svc.latencyMs}ms</p>}
                    {svc.critical && <p className="text-xs text-red-400 mt-1">Critical</p>}
                  </div>
                ))}
                {services.length === 0 && <p className="text-slate-500 text-sm col-span-4 py-4 text-center">No service data available</p>}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Database className="w-4 h-4 text-blue-400" /> Database Table Stats</CardTitle></CardHeader>
          <CardContent className="p-0">
            {dbQuery.isLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full bg-slate-800" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Table</TableHead>
                    <TableHead className="text-slate-400 text-right">Row Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dbStats.map((t: any) => (
                    <TableRow key={t.table} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-200 font-mono text-sm">{t.table}</TableCell>
                      <TableCell className="text-right text-slate-300">{(t.rowCount ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {dbStats.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-slate-500 py-8">No database stats available</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
