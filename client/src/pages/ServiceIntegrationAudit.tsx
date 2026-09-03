import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle, AlertTriangle, XCircle, RefreshCw, Loader2,
  Database, Shield, Activity, BarChart3, Network, GitBranch,
  Cpu, Search, ArrowRight, Info
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Status helpers ───────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: string }) {
  if (status === "healthy") return <CheckCircle className="w-4 h-4 text-emerald-400" />;
  if (status === "partial") return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
}

function CriticalityBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    p0: "bg-red-500/10 text-red-400 border-red-500/20",
    p1: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    p2: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    p3: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <Badge className={`border text-xs uppercase ${map[level] ?? map.p3}`}>{level}</Badge>
  );
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  payments:       <Database className="w-4 h-4" />,
  compliance:     <Shield className="w-4 h-4" />,
  infrastructure: <Network className="w-4 h-4" />,
  security:       <Shield className="w-4 h-4" />,
  analytics:      <BarChart3 className="w-4 h-4" />,
  identity:       <Cpu className="w-4 h-4" />,
};

export default function ServiceIntegrationAudit() {
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: auditData, isLoading: auditLoading, isError: auditError, refetch } =
    trpc.serviceIntegrationAudit.fullAudit.useQuery(undefined, { staleTime: 60_000 });
  const { data: gapData } =
    trpc.serviceIntegrationAudit.crudGapAnalysis.useQuery({}, { staleTime: 60_000 });
  const { data: depGraph } =
    trpc.serviceIntegrationAudit.dependencyGraph.useQuery(undefined, { staleTime: 120_000 });
  const { data: mockReport } =
    trpc.serviceIntegrationAudit.mockDataReport.useQuery(undefined, { staleTime: 60_000 });
  const { data: orphanData } =
    trpc.serviceIntegrationAudit.orphanedRouters.useQuery(undefined, { staleTime: 120_000 });
  const { data: grpcHealth } =
    trpc.serviceIntegrationAudit.grpcHealthCheck.useQuery(undefined, { staleTime: 30_000 });

  const audit = auditData as any;
  const gaps = gapData as any;
  const graph = depGraph as any;
  const mocks = mockReport as any;
  const orphans = orphanData as any;
  const grpc = grpcHealth as any;

  const services = audit?.services ?? [];
  const filteredServices = categoryFilter === "all"
    ? services
    : services.filter((s: any) => s.category === categoryFilter);

  const categories = Array.from(new Set(services.map((s: any) => s.category)));

  const avgScore = audit?.summary?.avgScore ?? 0;

  if (auditError) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-center">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-zinc-300">Failed to load audit data</p>
          <Button variant="outline" className="mt-4 border-zinc-700 text-zinc-300" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Service Integration Audit</h1>
          <p className="text-zinc-400 mt-1">
            CRUD completeness, orphaned routers, mock data usage, and dependency graph
          </p>
        </div>
        <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Avg Score", value: auditLoading ? "—" : `${avgScore}%`, color: avgScore >= 80 ? "text-emerald-400" : avgScore >= 60 ? "text-amber-400" : "text-red-400" },
          { label: "Healthy", value: audit?.summary?.healthy ?? "—", color: "text-emerald-400" },
          { label: "Partial", value: audit?.summary?.partial ?? "—", color: "text-amber-400" },
          { label: "Incomplete", value: audit?.summary?.incomplete ?? "—", color: "text-red-400" },
        ].map(item => (
          <Card key={item.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">{item.label}</p>
              <p className={`text-3xl font-bold font-mono mt-1 ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList className="bg-zinc-900 border border-zinc-800 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="services" className="data-[state=active]:bg-zinc-800">Services</TabsTrigger>
          <TabsTrigger value="crud-gaps" className="data-[state=active]:bg-zinc-800">CRUD Gaps</TabsTrigger>
          <TabsTrigger value="dependency" className="data-[state=active]:bg-zinc-800">Dependencies</TabsTrigger>
          <TabsTrigger value="mock-data" className="data-[state=active]:bg-zinc-800">Mock Data</TabsTrigger>
          <TabsTrigger value="orphaned" className="data-[state=active]:bg-zinc-800">Orphaned Routers</TabsTrigger>
          <TabsTrigger value="grpc" className="data-[state=active]:bg-zinc-800">gRPC Health</TabsTrigger>
        </TabsList>

        {/* Services Tab */}
        <TabsContent value="services">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-white">Service Registry ({filteredServices.length})</CardTitle>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-zinc-300 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">All Categories</SelectItem>
                  {(categories as string[]).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              {auditLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                </div>
              ) : (
                filteredServices.map((svc: any) => (
                  <div key={svc.namespace} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <StatusIcon status={svc.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-zinc-300">{svc.namespace}</span>
                        <CriticalityBadge level={svc.criticalityLevel} />
                        <Badge className="bg-zinc-700/50 text-zinc-400 border-zinc-600/50 text-xs">{svc.category}</Badge>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{svc.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-sm font-bold font-mono ${svc.score >= 80 ? "text-emerald-400" : svc.score >= 60 ? "text-amber-400" : "text-red-400"}`}>{svc.score}%</p>
                        <p className="text-xs text-zinc-600">score</p>
                      </div>
                      <div className="w-20">
                        <Progress value={svc.score} className="h-1.5 bg-zinc-800" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CRUD Gaps Tab */}
        <TabsContent value="crud-gaps">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white">
                CRUD Gap Analysis
                {gaps && (
                  <span className="ml-2 text-zinc-500 font-normal">
                    {gaps.totalGaps} gaps across {gaps.gaps?.length} services
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(gaps?.gaps ?? []).map((g: any) => (
                <div key={g.namespace} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-zinc-300">{g.namespace}</span>
                      <CriticalityBadge level={g.criticalityLevel} />
                      <Badge className={`border text-xs ${g.severity === "high" ? "bg-red-500/10 text-red-400 border-red-500/20" : g.severity === "medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
                        {g.severity}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {g.missingOperations.map((op: string) => (
                        <Badge key={op} className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">
                          missing: {op}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <span className="text-sm font-mono text-zinc-400">{g.crudScore}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dependency Graph Tab */}
        <TabsContent value="dependency">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Service Nodes ({graph?.nodes?.length ?? 0})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(graph?.nodes ?? []).map((n: any) => (
                  <div key={n.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/50">
                    <div className="text-zinc-400">{CATEGORY_ICONS[n.category] ?? <Database className="w-4 h-4" />}</div>
                    <div>
                      <p className="text-sm text-zinc-300">{n.label}</p>
                      <p className="text-xs text-zinc-600">{n.category}</p>
                    </div>
                    <CriticalityBadge level={n.criticalityLevel} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Dependencies ({graph?.edges?.length ?? 0})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(graph?.edges ?? []).map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/50">
                    <span className="text-xs font-mono text-zinc-400">{e.from}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                    <span className="text-xs font-mono text-zinc-400">{e.to}</span>
                    <Badge className="ml-auto bg-zinc-700/50 text-zinc-400 border-zinc-600/50 text-xs">{e.label}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Mock Data Tab */}
        <TabsContent value="mock-data">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white">
                Mock Data Usage
                {mocks && (
                  <span className="ml-2 text-zinc-500 font-normal">
                    {mocks.withMockFallback} with fallback · {mocks.withRealData} real data
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(mocks?.services ?? []).map((s: any) => (
                <div key={s.namespace} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <div className={`w-2 h-2 rounded-full ${s.hasMockFallback ? "bg-amber-400" : "bg-emerald-400"}`} />
                  <div className="flex-1">
                    <p className="text-sm font-mono text-zinc-300">{s.namespace}</p>
                    <p className="text-xs text-zinc-500">{s.reason}</p>
                  </div>
                  <Badge className={`border text-xs ${s.hasMockFallback ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                    {s.hasMockFallback ? "mock fallback" : "real data"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orphaned Routers Tab */}
        <TabsContent value="orphaned">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white">
                Orphaned Routers
                {orphans && (
                  <span className="ml-2 text-zinc-500 font-normal">
                    {orphans.total} total · {orphans.toDeprecate} to deprecate · {orphans.toWireFrontend} to wire
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(orphans?.orphaned ?? []).map((r: any) => (
                <div key={r.namespace} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <div className="flex-1">
                    <p className="text-sm font-mono text-zinc-300">{r.namespace}</p>
                    <p className="text-xs text-zinc-500">{r.reason}</p>
                  </div>
                  <Badge className={`border text-xs ${r.action === "deprecate" ? "bg-red-500/10 text-red-400 border-red-500/20" : r.action === "wire-frontend" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
                    {r.action}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* gRPC Health Tab */}
        <TabsContent value="grpc">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                gRPC Service Health
                {grpc?.allHealthy && (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-xs">All Healthy</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(grpc?.services ?? []).map((s: any) => (
                <div key={s.name} className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${s.status === "ok" ? "bg-emerald-400" : "bg-red-400"}`} />
                    <span className="text-sm font-mono text-zinc-300">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.latencyMs != null && (
                      <span className={`text-sm font-mono ${s.latencyMs < 50 ? "text-emerald-400" : s.latencyMs < 200 ? "text-amber-400" : "text-red-400"}`}>{s.latencyMs}ms</span>
                    )}
                    <Badge className={`border text-xs ${s.status === "ok" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                      {s.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
