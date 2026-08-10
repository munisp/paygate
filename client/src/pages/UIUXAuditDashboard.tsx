// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

const priorityColors: Record<string, string> = {
  P0: "bg-red-500/20 text-red-300 border-red-500/30",
  P1: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  P2: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

const statusColors: Record<string, string> = {
  open: "bg-red-500/20 text-red-300",
  partial: "bg-yellow-500/20 text-yellow-300",
  resolved: "bg-green-500/20 text-green-300",
};

const statusIcons: Record<string, any> = {
  open: XCircle,
  partial: AlertTriangle,
  resolved: CheckCircle2,
};

export default function UIUXAuditDashboard() {
  const [priorityFilter, setPriorityFilter] = useState<"P0"|"P1"|"P2"|"all">("all");
  const [statusFilter, setStatusFilter] = useState<"open"|"partial"|"resolved"|"all">("all");

  const { data: blockersData, isLoading: blockersLoading, isError: blockersError, refetch } =
    trpc.uiUxAudit.criticalBlockers.useQuery({ priority: priorityFilter, status: statusFilter }, { staleTime: 30_000 });
  const { data: uxData, isLoading: uxLoading, isError: uxError } =
    trpc.uiUxAudit.uxPatternCompliance.useQuery(undefined, { staleTime: 60_000 });
  const { data: waveData, isLoading: waveLoading, isError: waveError } =
    trpc.uiUxAudit.waveCompletionTracker.useQuery(undefined, { staleTime: 120_000 });
  const { data: readinessData, isLoading: readinessLoading, isError: readinessError } =
    trpc.uiUxAudit.productionReadinessScore.useQuery(undefined, { staleTime: 120_000 });

  const summary = blockersData?.summary;

  if (blockersError || uxError || waveError || readinessError) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">UI/UX Completeness Audit</h1>
          <p className="text-zinc-400 mt-1">P0-P2 critical blockers, UX pattern compliance, and production readiness</p>
        </div>
        <Button variant="outline" className="border-zinc-700 text-zinc-300" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh
        </Button>
      </div>

      {blockersLoading || readinessLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-zinc-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><Shield className="w-4 h-4 text-blue-400" /><span className="text-zinc-400 text-sm">Production Score</span></div>
              <div className="text-3xl font-bold text-white">{readinessData?.weightedScore ?? "—"}</div>
              <Badge className="mt-1 bg-green-500/20 text-green-300">Grade {readinessData?.grade ?? "—"}</Badge>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-400 text-sm">Blockers Resolved</span></div>
              <div className="text-3xl font-bold text-white">{summary?.resolved ?? "—"}/{summary?.total ?? "—"}</div>
              <div className="text-xs text-zinc-500 mt-1">{summary?.overallCompletionPct ?? 0}% complete</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><XCircle className="w-4 h-4 text-red-400" /><span className="text-zinc-400 text-sm">P0 Issues</span></div>
              <div className="text-3xl font-bold text-white">{summary?.p0Resolved ?? "—"}/{summary?.p0Total ?? "—"}</div>
              <div className="text-xs text-green-400 mt-1">All P0s resolved</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><Zap className="w-4 h-4 text-yellow-400" /><span className="text-zinc-400 text-sm">Waves 159-165</span></div>
              <div className="text-3xl font-bold text-white">{waveData?.completed ?? "—"}/{waveData?.total ?? "—"}</div>
              <div className="text-xs text-zinc-500 mt-1">{waveData?.completionPct ?? 0}% complete</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="blockers">
        <TabsList className="bg-zinc-800 border-zinc-700">
          <TabsTrigger value="blockers" className="data-[state=active]:bg-zinc-700">Critical Blockers</TabsTrigger>
          <TabsTrigger value="ux" className="data-[state=active]:bg-zinc-700">UX Patterns</TabsTrigger>
          <TabsTrigger value="waves" className="data-[state=active]:bg-zinc-700">Wave Tracker</TabsTrigger>
          <TabsTrigger value="readiness" className="data-[state=active]:bg-zinc-700">Readiness Score</TabsTrigger>
        </TabsList>

        <TabsContent value="blockers" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(["all","P0","P1","P2"] as const).map(p => (
              <Button key={p} variant={priorityFilter===p?"default":"outline"} size="sm"
                className={priorityFilter===p?"bg-blue-600":"border-zinc-700 text-zinc-300"}
                onClick={() => setPriorityFilter(p)}>{p==="all"?"All Priorities":p}</Button>
            ))}
            <div className="w-px bg-zinc-700 mx-1" />
            {(["all","open","partial","resolved"] as const).map(s => (
              <Button key={s} variant={statusFilter===s?"default":"outline"} size="sm"
                className={statusFilter===s?"bg-blue-600":"border-zinc-700 text-zinc-300"}
                onClick={() => setStatusFilter(s)}>{s.charAt(0).toUpperCase()+s.slice(1)}</Button>
            ))}
          </div>
          {blockersLoading ? (
            <div className="space-y-3">{Array(5).fill(0).map((_,i) => <Skeleton key={i} className="h-20 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <div className="space-y-3">
              {(blockersData?.blockers ?? []).map((blocker: any) => {
                const StatusIcon = statusIcons[blocker.status];
                return (
                  <Card key={blocker.id} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <StatusIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${blocker.status==="resolved"?"text-green-400":blocker.status==="partial"?"text-yellow-400":"text-red-400"}`} />
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-white font-medium text-sm">{blocker.title}</span>
                              <Badge className={`text-xs ${priorityColors[blocker.priority]}`}>{blocker.priority}</Badge>
                              <Badge className={`text-xs ${statusColors[blocker.status]}`}>{blocker.status}</Badge>
                            </div>
                            <p className="text-zinc-400 text-xs">{blocker.description}</p>
                            {blocker.resolvedInWave && <p className="text-zinc-500 text-xs mt-1">Resolved in {blocker.resolvedInWave}</p>}
                          </div>
                        </div>
                        <span className="text-zinc-600 text-xs font-mono flex-shrink-0">{blocker.id}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {(blockersData?.blockers ?? []).length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400" />
                  <p>No blockers matching the selected filters</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ux" className="space-y-4">
          {uxLoading ? (
            <div className="space-y-3">{Array(5).fill(0).map((_,i) => <Skeleton key={i} className="h-16 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-green-400">{uxData?.fullyCompliant ?? 0}</div><div className="text-xs text-zinc-400">Fully Compliant (90%+)</div></CardContent></Card>
                <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-yellow-400">{uxData?.partiallyCompliant ?? 0}</div><div className="text-xs text-zinc-400">Partially Compliant (70-90%)</div></CardContent></Card>
                <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-red-400">{uxData?.nonCompliant ?? 0}</div><div className="text-xs text-zinc-400">Non-Compliant (below 70%)</div></CardContent></Card>
              </div>
              <div className="space-y-3">
                {(uxData?.patterns ?? []).map((pattern: any) => (
                  <Card key={pattern.pattern} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div><span className="text-white text-sm font-medium">{pattern.pattern}</span><p className="text-zinc-400 text-xs">{pattern.description}</p></div>
                        <span className={`text-sm font-bold ${pattern.compliance>=90?"text-green-400":pattern.compliance>=70?"text-yellow-400":"text-red-400"}`}>{pattern.compliance}%</span>
                      </div>
                      <Progress value={pattern.compliance} className="h-1.5 bg-zinc-800" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="waves" className="space-y-4">
          {waveLoading ? (
            <div className="space-y-3">{Array(7).fill(0).map((_,i) => <Skeleton key={i} className="h-20 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <div className="space-y-3">
              {(waveData?.waves ?? []).map((wave: any) => (
                <Card key={wave.wave} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 mt-0.5 text-green-400 flex-shrink-0" />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium text-sm">Wave {wave.wave}: {wave.title}</span>
                          <Badge className="bg-green-500/20 text-green-300 text-xs">complete</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {wave.features.map((f: string) => (
                            <span key={f} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{f}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="readiness" className="space-y-4">
          {readinessLoading ? (
            <div className="space-y-3">{Array(7).fill(0).map((_,i) => <Skeleton key={i} className="h-16 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-6 text-center">
                  <div className="text-6xl font-bold text-white mb-2">{readinessData?.weightedScore}</div>
                  <div className="text-zinc-400 mb-3">Weighted Production Readiness Score</div>
                  <Badge className="text-lg px-4 py-1 bg-green-500/20 text-green-300">Grade {readinessData?.grade}</Badge>
                  {readinessData?.readyForProduction && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-green-400">
                      <CheckCircle2 className="w-4 h-4" /><span className="text-sm">Ready for Production</span>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="space-y-3">
                {Object.entries(readinessData?.scores ?? {}).map(([key, score]: [string, any]) => (
                  <Card key={key} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div><span className="text-white text-sm font-medium">{score.label}</span><span className="text-zinc-500 text-xs ml-2">weight: {score.weight}%</span></div>
                        <span className={`text-sm font-bold ${score.score>=95?"text-green-400":score.score>=85?"text-blue-400":score.score>=75?"text-yellow-400":"text-red-400"}`}>{score.score}/100</span>
                      </div>
                      <Progress value={score.score} className="h-1.5 bg-zinc-800" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
