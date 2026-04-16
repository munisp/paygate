import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, Database, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, TrendingUp, Zap, AlertCircle, BarChart3, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

const bloatColor = (pct: number) => {
  if (pct < 10) return "text-green-400";
  if (pct < 20) return "text-amber-400";
  return "text-red-400";
};

const fmtNum = (n: any) => Number(n ?? 0).toLocaleString();
const fmtDate = (d: any) => d ? new Date(d).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" }) : "—";

// ─── DB Health Card ───────────────────────────────────────────────────────────
function DbHealthCard() {
  const { data, isLoading, refetch, isFetching } = trpc.admin.health.getIndexHealth.useQuery(
    undefined,
    { staleTime: 60_000, refetchInterval: 120_000 }
  );

  const summary = (data as any)?.summary ?? {};
  const indexes: any[] = (data as any)?.indexes ?? [];
  const tables: any[] = (data as any)?.tables ?? [];
  const unusedIndexes: any[] = (data as any)?.unusedIndexes ?? [];
  const cacheHitPct = Number((data as any)?.cacheHitPct ?? summary?.cacheHitPct ?? 0);

  const cacheColor = cacheHitPct >= 95 ? "text-green-400" : cacheHitPct >= 80 ? "text-amber-400" : "text-red-400";

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            DB Health &amp; Index Monitor
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white h-7 w-7 p-0"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full bg-slate-800" />)}</div>
        ) : (
          <>
            {/* Summary KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Total Indexes</p>
                <p className="text-2xl font-bold text-white font-mono">{summary.totalIndexes ?? indexes.length}</p>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-400" /> Unused Indexes</p>
                <p className={cn("text-2xl font-bold font-mono", (summary.unusedIndexes ?? 0) > 0 ? "text-amber-400" : "text-green-400")}>
                  {summary.unusedIndexes ?? unusedIndexes.length}
                </p>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-400" /> Bloated Tables</p>
                <p className={cn("text-2xl font-bold font-mono", (summary.bloatedTables ?? 0) > 0 ? "text-red-400" : "text-green-400")}>
                  {summary.bloatedTables ?? 0}
                </p>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Zap className="w-3 h-3 text-blue-400" /> Cache Hit Rate</p>
                <p className={cn("text-2xl font-bold font-mono", cacheColor)}>{cacheHitPct}%</p>
                <Progress value={cacheHitPct} className="h-1 mt-1.5 bg-slate-700" />
              </div>
            </div>

            {summary.error && (
              <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                pg_stat views unavailable on this DB engine: {summary.error}
              </div>
            )}

            {/* Tabs: Indexes / Tables / Unused */}
            <Tabs defaultValue="tables">
              <TabsList className="bg-slate-800 border border-slate-700">
                <TabsTrigger value="tables" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
                  Table Stats ({tables.length})
                </TabsTrigger>
                <TabsTrigger value="indexes" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
                  Index Usage ({indexes.length})
                </TabsTrigger>
                <TabsTrigger value="unused" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
                  Unused
                  {unusedIndexes.length > 0 && (
                    <span className="ml-1.5 bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded-full">
                      {unusedIndexes.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Table Stats */}
              <TabsContent value="tables" className="mt-3">
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-700 hover:bg-transparent">
                          <TableHead className="text-slate-400 text-xs">Table</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Size</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Live Rows</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Dead Rows</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Bloat %</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Seq Scans</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Idx Scans</TableHead>
                          <TableHead className="text-slate-400 text-xs">Last Vacuum</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tables.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8 text-sm">No table stats available</TableCell></TableRow>
                        ) : tables.map((t: any) => (
                          <TableRow key={t.tablename} className="border-slate-700 hover:bg-slate-800/40">
                            <TableCell className="text-slate-200 font-mono text-xs">{t.tablename}</TableCell>
                            <TableCell className="text-right text-slate-300 text-xs">{t.total_size ?? "—"}</TableCell>
                            <TableCell className="text-right text-slate-300 text-xs">{fmtNum(t.live_tuples)}</TableCell>
                            <TableCell className="text-right text-xs">
                              <span className={Number(t.dead_tuples) > 1000 ? "text-amber-400" : "text-slate-400"}>
                                {fmtNum(t.dead_tuples)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              <span className={bloatColor(Number(t.bloat_pct))}>
                                {Number(t.bloat_pct ?? 0).toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-slate-400 text-xs">{fmtNum(t.seq_scan)}</TableCell>
                            <TableCell className="text-right text-slate-400 text-xs">{fmtNum(t.idx_scan)}</TableCell>
                            <TableCell className="text-slate-400 text-xs">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {fmtDate(t.last_autovacuum ?? t.last_vacuum)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              {/* Index Usage */}
              <TabsContent value="indexes" className="mt-3">
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-700 hover:bg-transparent">
                          <TableHead className="text-slate-400 text-xs">Index</TableHead>
                          <TableHead className="text-slate-400 text-xs">Table</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Scans</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Tuples Read</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right">Size</TableHead>
                          <TableHead className="text-slate-400 text-xs text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {indexes.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8 text-sm">No index data available</TableCell></TableRow>
                        ) : indexes.map((idx: any) => (
                          <TableRow key={idx.indexname} className="border-slate-700 hover:bg-slate-800/40">
                            <TableCell className="text-slate-200 font-mono text-xs max-w-[200px] truncate">{idx.indexname}</TableCell>
                            <TableCell className="text-slate-400 text-xs">{idx.tablename}</TableCell>
                            <TableCell className="text-right text-xs">
                              <span className={Number(idx.scans) === 0 ? "text-amber-400" : "text-slate-300"}>
                                {fmtNum(idx.scans)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-slate-400 text-xs">{fmtNum(idx.tuples_read)}</TableCell>
                            <TableCell className="text-right text-slate-300 text-xs">{idx.index_size ?? "—"}</TableCell>
                            <TableCell className="text-center">
                              {idx.is_unused ? (
                                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">Unused</Badge>
                              ) : (
                                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">Active</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              {/* Unused Indexes */}
              <TabsContent value="unused" className="mt-3">
                {unusedIndexes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                    <p className="text-green-400 font-medium">No unused indexes detected</p>
                    <p className="text-slate-500 text-sm">All indexes are actively being used</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-sm">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      {unusedIndexes.length} unused index{unusedIndexes.length > 1 ? "es" : ""} detected — consider dropping to reduce write overhead
                    </div>
                    <div className="rounded-lg border border-slate-700 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-700 hover:bg-transparent">
                            <TableHead className="text-slate-400 text-xs">Index Name</TableHead>
                            <TableHead className="text-slate-400 text-xs">Table</TableHead>
                            <TableHead className="text-slate-400 text-xs text-right">Size</TableHead>
                            <TableHead className="text-slate-400 text-xs">Drop Command</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unusedIndexes.map((idx: any) => (
                            <TableRow key={idx.indexname} className="border-slate-700 hover:bg-slate-800/40">
                              <TableCell className="text-amber-300 font-mono text-xs">{idx.indexname}</TableCell>
                              <TableCell className="text-slate-400 text-xs">{idx.tablename}</TableCell>
                              <TableCell className="text-right text-slate-300 text-xs">{idx.index_size ?? "—"}</TableCell>
                              <TableCell>
                                <code className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
                                  DROP INDEX CONCURRENTLY {idx.indexname};
                                </code>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminSystemHealth() {
  const healthQuery = trpc.admin.health.getOverview.useQuery(undefined, { refetchInterval: 30_000 });
  const dbQuery = trpc.admin.health.getDatabaseStats.useQuery(undefined, { refetchInterval: 30_000 });

  const services: any[] = Array.isArray(healthQuery.data) ? healthQuery.data : [];
  const dbStats: any[] = Array.isArray(dbQuery.data) ? dbQuery.data : [];

  const healthyCount = services.filter((s) => s.status === "healthy").length;
  const degradedCount = services.filter((s) => s.status === "degraded").length;
  const downCount = services.filter((s) => s.status === "down").length;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">System Health</h1>
            <p className="text-slate-400 text-sm mt-1">Real-time service status &amp; database performance — auto-refreshes every 30 s</p>
          </div>
          <div className="flex items-center gap-3">
            {healthyCount > 0 && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{healthyCount} Healthy</Badge>}
            {degradedCount > 0 && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{degradedCount} Degraded</Badge>}
            {downCount > 0 && <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{downCount} Down</Badge>}
          </div>
        </div>

        {/* Service Status */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400" />
              Microservice Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthQuery.isLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 w-full bg-slate-800" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {services.map((svc: any) => (
                  <div key={svc.name} className={cn(
                    "p-3 rounded-lg border",
                    svc.status === "healthy" ? "bg-green-950/30 border-green-900" :
                    svc.status === "degraded" ? "bg-amber-950/30 border-amber-900" :
                    "bg-red-950/30 border-red-900"
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      {statusIcon(svc.status)}
                      <p className="text-xs font-medium text-white truncate">{svc.name}</p>
                    </div>
                    <Badge className={`text-xs border ${statusColor(svc.status)}`}>{svc.status}</Badge>
                    {svc.latencyMs != null && svc.latencyMs > 0 && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />{svc.latencyMs} ms
                      </p>
                    )}
                    {svc.critical && <p className="text-xs text-red-400 mt-1">Critical</p>}
                  </div>
                ))}
                {services.length === 0 && (
                  <p className="text-slate-500 text-sm col-span-4 py-4 text-center">No service data available</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* DB Row Count Card */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              Table Row Counts
            </CardTitle>
          </CardHeader>
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
                      <TableCell className="text-right text-slate-300">
                        {t.count === -1 ? <span className="text-red-400">error</span> : fmtNum(t.count)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {dbStats.length === 0 && (
                    <TableRow><TableCell colSpan={2} className="text-center text-slate-500 py-8">No database stats available</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* DB Health & Index Monitor */}
        <DbHealthCard />
      </div>
    </AdminLayout>
  );
}
