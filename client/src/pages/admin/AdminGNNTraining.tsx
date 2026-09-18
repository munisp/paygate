// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Brain, Play, RefreshCw, Clock, Database, BarChart2, Cpu, TrendingUp, AlertTriangle, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    production: "default", active: "default", staging: "secondary", training: "secondary", archived: "outline", completed: "default", failed: "destructive", running: "secondary",
  };
  return <Badge variant={map[status] ?? "outline"}>{status}</Badge>;
}

export default function AdminGNNTraining() {
  const [activeTab, setActiveTab] = useState("registry");
  const [modelType, setModelType] = useState<"gnn_fraud" | "anomaly_detection" | "credit_scoring" | "churn_prediction" | "aml_detection">("gnn_fraud");
  const [epochs, setEpochs] = useState("50");
  const [hiddenDims, setHiddenDims] = useState("256");
  const [learningRate, setLearningRate] = useState("0.001");
  const [batchSize, setBatchSize] = useState("256");

  // Real tRPC data — registry + training jobs from the database only.
  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = trpc.ai.getTrainingJobs.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const liveJobs = (jobsData as any[]) ?? [];
  const { data: registryData, isLoading: registryLoading, isError: registryError, refetch: refetchRegistry } = trpc.ai.getModelRegistry.useQuery(undefined, { staleTime: 60_000 });
  const registry = (registryData as any[]) ?? [];

  const triggerMutation = trpc.ai.triggerGNNTraining.useMutation({
    onSuccess: (data) => {
      toast.success(`Training job queued — Job ID: ${data.jobId}`);
      refetchJobs();
    },
    onError: (e) => { toast.error(`Failed to queue training: ${e.message}`); },
  });

  const handleStartTraining = () => {
    triggerMutation.mutate({
      modelType,
      epochs: parseInt(epochs) || 50,
      hiddenDims: parseInt(hiddenDims) || 256,
      learningRate: parseFloat(learningRate) || 0.001,
      batchSize: parseInt(batchSize) || 256,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GNN Fraud Model Training</h1>
          <p className="text-muted-foreground text-sm mt-1">PyTorch Geometric · GraphSAGE · Lakehouse Parquet Feature Store</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={triggerMutation.isPending} onClick={handleStartTraining}>
            {triggerMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Queueing…</> : <><Play className="w-4 h-4 mr-2" />Train New Model</>}
          </Button>
        </div>
      </div>

      {/* KPI Cards — computed from the real model registry ("—" when unavailable) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          const prodModel = registry.find((m: any) => m.status === "active" || m.status === "production");
          const anyModel = prodModel ?? registry[0];
          const pct = (v: any) => (typeof v === "number" && v > 0 ? (v <= 1 ? v * 100 : v).toFixed(1) + "%" : null);
          const auc = typeof anyModel?.aucRoc === "number" && anyModel.aucRoc > 0 ? anyModel.aucRoc.toFixed(3) : null;
          const samples = typeof anyModel?.trainingRecords === "number" && anyModel.trainingRecords > 0 ? anyModel.trainingRecords.toLocaleString() : null;
          const unavailable = registryLoading ? "…" : "—";
          return [
            { label: "Production Model", value: anyModel ? `${anyModel.name} v${anyModel.version}` : unavailable, icon: Brain, color: "text-indigo-500" },
            { label: "AUC-ROC", value: auc ?? unavailable, icon: TrendingUp, color: "text-green-500" },
            { label: "Training Samples", value: samples ?? unavailable, icon: Database, color: "text-blue-500" },
            { label: "Registered Models", value: registryLoading ? "…" : String(registry.length), icon: Cpu, color: "text-amber-500" },
          ];
        })().map(m => (
          <Card key={m.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <m.icon className={`w-8 h-8 ${m.color}`} />
                <div><p className="text-2xl font-bold">{m.value}</p><p className="text-xs text-muted-foreground">{m.label}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="registry"><Layers className="w-4 h-4 mr-1" />Model Registry</TabsTrigger>
          <TabsTrigger value="livejobs"><Database className="w-4 h-4 mr-1" />Live Jobs ({liveJobs.length})</TabsTrigger>
          <TabsTrigger value="runs"><Clock className="w-4 h-4 mr-1" />Training Runs</TabsTrigger>
          <TabsTrigger value="features"><BarChart2 className="w-4 h-4 mr-1" />Feature Importance</TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Model Registry
                <Button variant="outline" size="sm" onClick={() => refetchRegistry()}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
              </CardTitle>
              <CardDescription>Trained models from the ai_model_registry table — real metrics only</CardDescription>
            </CardHeader>
            <CardContent>
              {registryLoading ? (
                <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : registryError ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-red-400 opacity-60" />
                  <p>Model registry unavailable. <Button variant="link" size="sm" onClick={() => refetchRegistry()}>Retry</Button></p>
                </div>
              ) : registry.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No models registered yet. Completed training jobs register models here.</p>
                </div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Trained</TableHead>
                    <TableHead>Accuracy</TableHead>
                    <TableHead>Precision</TableHead>
                    <TableHead>Recall</TableHead>
                    <TableHead>F1</TableHead>
                    <TableHead>AUC</TableHead>
                    <TableHead>Samples</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registry.map((m: any) => {
                    const pct = (v: any) => (typeof v === "number" && v > 0 ? `${(v <= 1 ? v * 100 : v).toFixed(1)}%` : "—");
                    return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="font-mono font-semibold">{m.version}</TableCell>
                      <TableCell className="text-xs capitalize">{(m.modelType ?? "").replace(/_/g, " ") || "—"}</TableCell>
                      <TableCell className="text-xs">{m.trainedAt ?? "—"}</TableCell>
                      <TableCell>{pct(m.accuracy)}</TableCell>
                      <TableCell>{pct(m.precision)}</TableCell>
                      <TableCell>{pct(m.recall)}</TableCell>
                      <TableCell>{pct(m.f1Score)}</TableCell>
                      <TableCell className="font-semibold text-green-600">{typeof m.aucRoc === "number" && m.aucRoc > 0 ? m.aucRoc.toFixed(3) : "—"}</TableCell>
                      <TableCell>{m.trainingRecords > 0 ? Number(m.trainingRecords).toLocaleString() : "—"}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="livejobs" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Live Training Jobs (DB)
                <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetchJobs()}><RefreshCw/>Refresh</Button>
              </CardTitle>
              <CardDescription>Real-time training jobs from the database</CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : liveJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No training jobs yet. Use the &quot;Train New Model&quot; button to queue one.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Model Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Epochs</TableHead>
                      <TableHead>Hidden Dims</TableHead>
                      <TableHead>LR</TableHead>
                      <TableHead>Triggered By</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveJobs.map((job: any) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-xs">{String(job.id).slice(0, 12)}…</TableCell>
                        <TableCell>{job.modelType}</TableCell>
                        <TableCell><StatusBadge status={job.status} /></TableCell>
                        <TableCell>{job.epochs}</TableCell>
                        <TableCell>{job.hiddenDims}</TableCell>
                        <TableCell className="font-mono text-xs">{job.learningRate}</TableCell>
                        <TableCell>{job.triggeredBy ?? "system"}</TableCell>
                        <TableCell className="text-xs">{job.createdAt ? new Date(job.createdAt).toLocaleString() : "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Training Run History (DB)</CardTitle>
              <CardDescription>Real completed/failed runs from the training jobs table</CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : liveJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No training runs recorded yet.</p>
                </div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job ID</TableHead>
                    <TableHead>Model Type</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Finished</TableHead>
                    <TableHead>Epochs</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveJobs.map((job: any) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">{String(job.id).slice(0, 12)}…</TableCell>
                      <TableCell className="text-sm capitalize">{(job.modelType ?? "").replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs">{job.createdAt ? new Date(job.createdAt).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs">{job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}</TableCell>
                      <TableCell>{job.epochs ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Feature Importance</CardTitle>
              <CardDescription>SHAP/feature-importance values recorded on training jobs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                // Real feature importance only — parsed from a completed job's metrics JSON when present.
                const withFI = liveJobs
                  .map((job: any) => {
                    let fi: Record<string, number> | null = null;
                    try { fi = job.metrics ? JSON.parse(job.metrics)?.feature_importance ?? null : null; } catch { fi = null; }
                    return fi ? { job, fi } : null;
                  })
                  .find(Boolean);
                if (!withFI) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>No feature-importance metrics recorded yet. Completed training runs with SHAP metrics will appear here.</p>
                    </div>
                  );
                }
                const entries = Object.entries(withFI.fi as Record<string, number>).sort((a, b) => b[1] - a[1]);
                const max = Math.max(0.0001, ...entries.map(([, v]) => v));
                return entries.map(([feature, importance]) => (
                  <div key={feature} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-mono text-xs">{feature}</span>
                      <span className="font-semibold">{(importance * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={(importance / max) * 100} className="h-2" />
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Architecture Note */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Training Architecture</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Data source:</strong> Parquet files written by the Lakehouse AI orchestrator to MinIO/S3 on every transaction inference. Features include 47 graph-level, velocity, device, and amount signals.</p>
          <p><strong className="text-foreground">Model:</strong> 3-layer GraphSAGE with mean aggregation, 256 hidden dimensions, batch normalization, dropout 0.3. Trained with Adam (lr=1e-3, weight_decay=1e-5) for 50 epochs on a single A100 GPU.</p>
          <p><strong className="text-foreground">Deployment:</strong> ONNX export → Triton Inference Server → Go bridge calls <code className="bg-muted px-1 rounded">POST /v1/infer</code> at p99 latency of 12ms. Model version tracked in the <code className="bg-muted px-1 rounded">model_registry</code> table.</p>
          <p><strong className="text-foreground">Retraining trigger:</strong> Airflow DAG <code className="bg-muted px-1 rounded">paygate_gnn_retrain</code> runs weekly or when fraud catch rate drops below 95%.</p>
        </CardContent>
      </Card>
    </div>
  );
}
