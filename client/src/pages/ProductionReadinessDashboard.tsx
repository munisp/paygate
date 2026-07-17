// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, RefreshCw, Database, Code2, TestTube, Rocket, FileText } from "lucide-react";
import { toast } from "sonner";

export default function ProductionReadinessDashboard() {
  const { data: schemaData, isLoading: schemaLoading, isError: schemaError, refetch } =
    trpc.productionReadiness.schemaCompleteness.useQuery(undefined, { staleTime: 120_000 });
  const { data: apiData, isLoading: apiLoading, isError: apiError } =
    trpc.productionReadiness.apiSurfaceAudit.useQuery(undefined, { staleTime: 120_000 });
  const { data: testData, isLoading: testLoading, isError: testError } =
    trpc.productionReadiness.testCoverageSummary.useQuery(undefined, { staleTime: 120_000 });
  const { data: checklistData, isLoading: checklistLoading, isError: checklistError } =
    trpc.productionReadiness.deploymentChecklist.useQuery(undefined, { staleTime: 120_000 });
  const { data: seedData, isLoading: seedLoading, isError: seedError } =
    trpc.productionReadiness.seedDataValidation.useQuery(undefined, { staleTime: 120_000 });

  const hasError = schemaError || apiError || testError || checklistError || seedError;

  if (hasError) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-center">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-zinc-300">Failed to load readiness data</p>
          <Button variant="outline" className="mt-4 border-zinc-700 text-zinc-300" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Production Readiness Dashboard</h1>
          <p className="text-zinc-400 mt-1">Final audit: schema, API surface, test coverage, and deployment checklist</p>
        </div>
        <Button variant="outline" className="border-zinc-700 text-zinc-300" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {checklistLoading || testLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-zinc-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><Rocket className="w-4 h-4 text-green-400" /><span className="text-zinc-400 text-sm">Deployment Ready</span></div>
              <div className="text-3xl font-bold text-white">{checklistData?.completionPct ?? 0}%</div>
              <div className="text-xs text-zinc-500 mt-1">{checklistData?.passed ?? 0}/{checklistData?.total ?? 0} checks passed</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><Database className="w-4 h-4 text-blue-400" /><span className="text-zinc-400 text-sm">Schema Tables</span></div>
              <div className="text-3xl font-bold text-white">{schemaData?.tableCount ?? "—"}</div>
              <div className="text-xs text-zinc-500 mt-1">{schemaData?.indexCount ?? 0} indexes</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><TestTube className="w-4 h-4 text-purple-400" /><span className="text-zinc-400 text-sm">Test Files</span></div>
              <div className="text-3xl font-bold text-white">{testData?.totalTestFiles ?? "—"}</div>
              <div className="text-xs text-zinc-500 mt-1">Wave {testData?.latestWave ?? 0} latest</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><Code2 className="w-4 h-4 text-yellow-400" /><span className="text-zinc-400 text-sm">API Procedures</span></div>
              <div className="text-3xl font-bold text-white">{apiData?.procedureCount ?? "—"}</div>
              <div className="text-xs text-zinc-500 mt-1">{apiData?.queryCount ?? 0} queries, {apiData?.mutationCount ?? 0} mutations</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="checklist">
        <TabsList className="bg-zinc-800 border-zinc-700">
          <TabsTrigger value="checklist" className="data-[state=active]:bg-zinc-700">Deployment Checklist</TabsTrigger>
          <TabsTrigger value="schema" className="data-[state=active]:bg-zinc-700">Schema</TabsTrigger>
          <TabsTrigger value="api" className="data-[state=active]:bg-zinc-700">API Surface</TabsTrigger>
          <TabsTrigger value="tests" className="data-[state=active]:bg-zinc-700">Test Coverage</TabsTrigger>
          <TabsTrigger value="seed" className="data-[state=active]:bg-zinc-700">Seed Data</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-3">
          {checklistLoading ? (
            <div className="space-y-3">{Array(8).fill(0).map((_,i) => <Skeleton key={i} className="h-14 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <>
              {checklistData?.readyForDeployment && (
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                  <div>
                    <div className="text-green-300 font-medium">Ready for Production Deployment</div>
                    <div className="text-green-400/70 text-sm">All {checklistData.total} deployment checks passed</div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {(checklistData?.checks ?? []).map((check: any) => (
                  <Card key={check.id} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        {check.status === "pass"
                          ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                          : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                        <span className="text-white text-sm">{check.label}</span>
                        <Badge className={`ml-auto text-xs ${check.status === "pass" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>{check.status}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="schema" className="space-y-4">
          {schemaLoading ? (
            <div className="space-y-3">{Array(4).fill(0).map((_,i) => <Skeleton key={i} className="h-16 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Total Tables", value: schemaData?.tableCount, threshold: 200, unit: "tables" },
                { label: "Total Indexes", value: schemaData?.indexCount, threshold: 400, unit: "indexes" },
                { label: "Enum Types", value: schemaData?.enumCount, threshold: 10, unit: "enums" },
                { label: "Index Coverage", value: schemaData?.indexCoverage, threshold: 100, unit: "%" },
              ].map(item => (
                <Card key={item.label} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-zinc-400 text-sm">{item.label}</span>
                      <Badge className={(item.value ?? 0) >= item.threshold ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}>
                        {(item.value ?? 0) >= item.threshold ? "pass" : "below threshold"}
                      </Badge>
                    </div>
                    <div className="text-3xl font-bold text-white">{item.value ?? "—"}<span className="text-sm text-zinc-500 ml-1">{item.unit}</span></div>
                    <div className="text-xs text-zinc-500 mt-1">threshold: {item.threshold} {item.unit}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          {apiLoading ? (
            <div className="space-y-3">{Array(4).fill(0).map((_,i) => <Skeleton key={i} className="h-16 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Router Files", value: apiData?.routerFiles, icon: FileText },
                  { label: "Total Procedures", value: apiData?.procedureCount, icon: Code2 },
                  { label: "Query Procedures", value: apiData?.queryCount, icon: Database },
                  { label: "Mutation Procedures", value: apiData?.mutationCount, icon: RefreshCw },
                  { label: "Query/Mutation Ratio", value: apiData?.queryToMutationRatio, icon: Code2 },
                ].map(item => (
                  <Card key={item.label} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1"><item.icon className="w-4 h-4 text-blue-400" /><span className="text-zinc-400 text-sm">{item.label}</span></div>
                      <div className="text-2xl font-bold text-white">{item.value ?? "—"}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { label: "Stripe webhook configured", value: apiData?.hasStripeWebhook },
                  { label: "Audit log on mutations", value: apiData?.hasAuditLog },
                  { label: "Rate limiting middleware", value: apiData?.hasRateLimiting },
                ].map(item => (
                  <Card key={item.label} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        {item.value ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                        <span className="text-white text-sm">{item.label}</span>
                        <Badge className={`ml-auto text-xs ${item.value ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>{item.value ? "yes" : "no"}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tests" className="space-y-4">
          {testLoading ? (
            <div className="space-y-3">{Array(4).fill(0).map((_,i) => <Skeleton key={i} className="h-16 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-white">{testData?.totalTestFiles ?? 0}</div><div className="text-xs text-zinc-400">Total Test Files</div></CardContent></Card>
                <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-blue-400">{testData?.waveTests ?? 0}</div><div className="text-xs text-zinc-400">Wave Tests</div></CardContent></Card>
                <Card className="bg-zinc-900 border-zinc-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-purple-400">{testData?.coreTests ?? 0}</div><div className="text-xs text-zinc-400">Core Tests</div></CardContent></Card>
              </div>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader><CardTitle className="text-white text-sm">Recent Test Files</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {(testData?.testFiles ?? []).map((f: string) => (
                      <div key={f} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                        <span className="text-zinc-400 font-mono">{f}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="seed" className="space-y-4">
          {seedLoading ? (
            <div className="space-y-3">{Array(5).fill(0).map((_,i) => <Skeleton key={i} className="h-14 rounded-xl bg-zinc-800" />)}</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">{seedData?.present ?? 0}/{seedData?.total ?? 0} seed entities present</span>
                <span className="text-zinc-500 text-xs">{seedData?.seedFileLines ?? 0} lines</span>
              </div>
              <Progress value={seedData?.completionPct ?? 0} className="h-2 bg-zinc-800 mb-4" />
              <div className="space-y-2">
                {(seedData?.entities ?? []).map((entity: any) => (
                  <Card key={entity.name} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        {entity.present ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                        <span className="text-white text-sm font-mono">{entity.name}</span>
                        <Badge className={`ml-auto text-xs ${entity.present ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>{entity.present ? "present" : "missing"}</Badge>
                      </div>
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
