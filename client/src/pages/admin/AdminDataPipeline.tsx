// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  GitBranch, Wind, Activity, Play, RefreshCw, CheckCircle,
  AlertTriangle, Layers, Workflow, Zap
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    success: { variant: "default", label: "Success" },
    running: { variant: "secondary", label: "Running" },
    failed: { variant: "destructive", label: "Failed" },
    stopped: { variant: "outline", label: "Stopped" },
  };
  const cfg = map[status] ?? { variant: "outline", label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function LoadingRows({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-center py-8 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…
      </TableCell>
    </TableRow>
  );
}

function EmptyRows({ cols, message }: { cols: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-center py-8 text-muted-foreground">{message}</TableCell>
    </TableRow>
  );
}

export default function AdminDataPipeline() {
  const [activeTab, setActiveTab] = useState("overview");
  const [triggeringDag, setTriggeringDag] = useState<string | null>(null);

  // Real tRPC data only — no static DAG/dbt/NiFi fallbacks.
  const { data: liveDags, isLoading: dagsLoading, isError: dagsError, error: dagsErrorObj, refetch: refetchDags } = trpc.adminDataPipeline.listDags.useQuery();
  const { data: liveDbtRuns, isLoading: dbtLoading, isError: dbtError, error: dbtErrorObj, refetch: refetchDbt } = trpc.adminDataPipeline.listDbtRuns.useQuery();
  const { data: liveNifiFlows, isLoading: nifiLoading, isError: nifiError, error: nifiErrorObj, refetch: refetchNifi } = trpc.adminDataPipeline.listNifiFlows.useQuery();

  const triggerDagMutation = trpc.adminDataPipeline.triggerDag.useMutation({
    onSuccess: (r) => {
      setTriggeringDag(null);
      if (r.fallback) toast.info(`DAG trigger queued (bridge unavailable). Run ID: ${r.runId ?? "N/A"}`);
      else toast.success(`DAG triggered successfully. Run ID: ${r.runId ?? "N/A"}`);
      refetchDags();
    },
    onError: (e) => { setTriggeringDag(null); toast.error(`Failed to trigger DAG: ${e.message}`); },
  });

  const handleTriggerDag = (dagId: string) => {
    setTriggeringDag(dagId);
    triggerDagMutation.mutate({ dagId });
  };

  const dags = (liveDags as any)?.dags ?? [];
  const dbtModels = (liveDbtRuns as any)?.runs ?? [];
  const nifi = (liveNifiFlows as any)?.flows ?? [];

  const activeDagRuns = dags.filter((d: any) => d.status === "running").length;
  const nifiRunning = nifi.filter((f: any) => f.status === "running").length;
  const totalThroughput = nifi.reduce((acc: number, f: any) => {
    const match = String(f.throughput ?? "").match(/([\d,]+)/);
    return acc + (match ? parseInt(match[1].replace(/,/g, "")) : 0);
  }, 0);
  const throughputStr = totalThroughput >= 1000 ? `${(totalThroughput / 1000).toFixed(1)}K msg/s` : `${totalThroughput} msg/s`;
  const dbtPassing = dbtModels.filter((m: any) => m.status === "success").length;
  const dagsPassing = dags.filter((d: any) => d.status === "success").length;

  const metrics = [
    { label: "Active DAG Runs", value: dagsLoading ? "…" : dagsError ? "—" : String(activeDagRuns), icon: Workflow, color: "text-emerald-500" },
    { label: "NiFi Flows Running", value: nifiLoading ? "…" : nifiError ? "—" : `${nifiRunning}/${nifi.length}`, icon: Zap, color: "text-amber-500" },
    { label: "NiFi Throughput", value: nifiLoading ? "…" : nifiError ? "—" : throughputStr, icon: Activity, color: "text-indigo-500" },
    { label: "dbt Models Passing", value: dbtLoading ? "…" : dbtError ? "—" : `${dbtPassing}/${dbtModels.length}`, icon: CheckCircle, color: "text-green-500" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Data Pipeline Control Centre</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Apache NiFi · dbt · Airflow · Trino — unified data orchestration for PayGate
          </p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => { refetchDags(); refetchDbt(); refetchNifi(); toast.success("Pipeline status refreshed"); }}><RefreshCw/> Refresh
        </Button>
      </div>

      {(dagsError || dbtError || nifiError) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Some pipeline data is unavailable</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {[dagsError && `Airflow: ${dagsErrorObj?.message}`, dbtError && `dbt: ${dbtErrorObj?.message}`, nifiError && `NiFi: ${nifiErrorObj?.message}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { refetchDags(); refetchDbt(); refetchNifi(); }}>Retry</Button>
        </div>
      )}

      {/* KPI Cards — computed from live data only */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <m.icon className={`w-8 h-8 ${m.color}`} />
                <div>
                  <p className="text-2xl font-bold">{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="overview"><Activity className="w-4 h-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="airflow"><Wind className="w-4 h-4 mr-1" />Airflow</TabsTrigger>
          <TabsTrigger value="dbt"><GitBranch className="w-4 h-4 mr-1" />dbt</TabsTrigger>
          <TabsTrigger value="nifi"><Layers className="w-4 h-4 mr-1" />NiFi</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pipeline Health (live)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Airflow DAGs (passing)", done: dagsPassing, total: dags.length, loading: dagsLoading, error: dagsError },
                  { label: "dbt Models (passing)", done: dbtPassing, total: dbtModels.length, loading: dbtLoading, error: dbtError },
                  { label: "NiFi Flows (running)", done: nifiRunning, total: nifi.length, loading: nifiLoading, error: nifiError },
                ].map(row => (
                  <div key={row.label}>
                    <div className="flex justify-between text-sm">
                      <span>{row.label}</span>
                      <span className="font-medium">{row.loading ? "…" : row.error ? "unavailable" : `${row.done}/${row.total}`}</span>
                    </div>
                    {!row.loading && !row.error && <Progress value={row.total > 0 ? (row.done / row.total) * 100 : 0} className="h-2 mt-1" />}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Data Freshness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {dbtLoading ? (
                  <p className="text-muted-foreground py-4 text-center"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading…</p>
                ) : dbtModels.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center">No dbt run data available — freshness cannot be assessed.</p>
                ) : (
                  dbtModels.map((m: any) => (
                    <div key={m.name} className="flex justify-between items-center py-1 border-b last:border-0">
                      <span className="font-mono text-xs">{m.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{m.lastRun ?? m.last_run ?? "—"}</span>
                        {m.status === "success" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Architecture Overview</CardTitle>
              <CardDescription>How NiFi, dbt, Airflow, and Trino connect to the PayGate Lakehouse</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                {[
                  { tool: "Apache NiFi", role: "Real-time ingestion", desc: "Kafka → Parquet streaming, NIBSS/Mojaloop event parsing, fraud feature enrichment", color: "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800" },
                  { tool: "Apache Airflow", role: "Batch orchestration", desc: "Daily ETL, settlement reconciliation, AML batch scoring, merchant digest emails", color: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" },
                  { tool: "dbt", role: "SQL transformations", desc: "Staging + marts models (finance, fraud, merchant, compliance). Runs nightly at 03:00 UTC", color: "bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800" },
                  { tool: "Trino", role: "Ad-hoc analytics", desc: "Federated SQL over Parquet (MinIO), PostgreSQL, and Kafka. Powers LakehouseAI dashboard queries", color: "bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800" },
                ].map((item) => (
                  <div key={item.tool} className={`rounded-lg border p-3 ${item.color}`}>
                    <p className="font-semibold">{item.tool}</p>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">{item.role}</p>
                    <p className="text-xs mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Airflow Tab */}
        <TabsContent value="airflow" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Airflow DAGs</CardTitle>
                  <CardDescription>Production DAGs reported by the data bridge</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.open("http://localhost:8090", "_blank")}>
                  Open Airflow UI
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DAG</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dagsLoading ? <LoadingRows cols={7} /> :
                    dags.length === 0 ? <EmptyRows cols={7} message={dagsError ? "Could not load DAGs — see banner above." : "No DAGs reported by the data bridge."} /> :
                    dags.map((dag: any) => (
                      <TableRow key={dag.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{dag.name ?? dag.id}</p>
                            <p className="text-xs text-muted-foreground font-mono">{dag.id}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{dag.schedule ?? "—"}</TableCell>
                        <TableCell className="text-xs">{dag.lastRun ?? dag.last_run ?? "—"}</TableCell>
                        <TableCell className="text-xs">{dag.duration ?? "—"}</TableCell>
                        <TableCell>{dag.tasks ?? "—"}</TableCell>
                        <TableCell><StatusBadge status={dag.status ?? "unknown"} /></TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={triggeringDag === dag.id}
                            onClick={() => handleTriggerDag(dag.id)}
                          >
                            {triggeringDag === dag.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* dbt Tab */}
        <TabsContent value="dbt" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">dbt Models</CardTitle>
              <CardDescription>Model run status reported by the data bridge</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Schema</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dbtLoading ? <LoadingRows cols={6} /> :
                    dbtModels.length === 0 ? <EmptyRows cols={6} message={dbtError ? "Could not load dbt runs — see banner above." : "No dbt run data reported yet."} /> :
                    dbtModels.map((model: any) => (
                      <TableRow key={model.name}>
                        <TableCell className="font-mono text-sm">{model.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{model.schema ?? "—"}</TableCell>
                        <TableCell>{model.rows ?? "—"}</TableCell>
                        <TableCell className="text-xs">{model.lastRun ?? model.last_run ?? "—"}</TableCell>
                        <TableCell className="text-xs">{model.duration ?? "—"}</TableCell>
                        <TableCell><StatusBadge status={model.status ?? "unknown"} /></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NiFi Tab */}
        <TabsContent value="nifi" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">NiFi Data Flows</CardTitle>
                  <CardDescription>Flow status reported by the data bridge</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.open("https://localhost:8443/nifi/", "_blank")}>
                  Open NiFi UI
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flow</TableHead>
                    <TableHead>Throughput</TableHead>
                    <TableHead>Processors</TableHead>
                    <TableHead>Backpressure</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nifiLoading ? <LoadingRows cols={5} /> :
                    nifi.length === 0 ? <EmptyRows cols={5} message={nifiError ? "Could not load NiFi flows — see banner above." : "No NiFi flows reported by the data bridge."} /> :
                    nifi.map((flow: any) => (
                      <TableRow key={flow.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{flow.name ?? flow.id}</p>
                            <p className="text-xs text-muted-foreground font-mono">{flow.id}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{flow.throughput ?? "—"}</TableCell>
                        <TableCell>{flow.processors ?? "—"}</TableCell>
                        <TableCell>
                          {flow.backpressure
                            ? <Badge variant="destructive" className="text-xs">Active</Badge>
                            : <Badge variant="outline" className="text-xs">None</Badge>}
                        </TableCell>
                        <TableCell><StatusBadge status={flow.status ?? "unknown"} /></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
