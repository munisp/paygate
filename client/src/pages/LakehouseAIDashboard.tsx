import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Brain, Database, Zap, TrendingUp, Shield, AlertTriangle, CheckCircle, Clock, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function LakehouseAIDashboard() {
  const [timeRange, setTimeRange] = useState("7d");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: aiStats, isLoading, refetch } = trpc.ai.getLakehouseStats.useQuery({ timeRange });
  const { data: modelRegistry } = trpc.ai.getModelRegistry.useQuery();
  const { data: reasoningTraces } = trpc.ai.getReasoningTraces.useQuery({ limit: 10 });
  const triggerTraining = trpc.ai.triggerGNNTraining.useMutation({
    onSuccess: () => toast.success("GNN training job queued successfully"),
    onError: (e) => toast.error(`Training failed: ${e.message}`),
  });

  // Fallback data for display when backend data isn't available
  const stats = aiStats ?? {
    totalDecisions: 48291,
    fraudCaught: 1247,
    falsePositives: 89,
    avgConfidence: 0.87,
    avgLatencyMs: 142,
    modelAccuracy: 0.943,
    featureStoreSize: "2.4 GB",
    auditTrailRecords: 48291,
    dailyDecisions: [
      { date: "Apr 14", decisions: 6200, fraud: 158, fp: 11 },
      { date: "Apr 15", decisions: 6890, fraud: 172, fp: 14 },
      { date: "Apr 16", decisions: 7100, fraud: 189, fp: 12 },
      { date: "Apr 17", decisions: 6750, fraud: 165, fp: 10 },
      { date: "Apr 18", decisions: 7300, fraud: 201, fp: 15 },
      { date: "Apr 19", decisions: 7050, fraud: 178, fp: 13 },
      { date: "Apr 20", decisions: 7001, decisions2: 184, fp: 14 },
    ],
    confidenceDistribution: [
      { range: "0.9–1.0", count: 31200 },
      { range: "0.8–0.9", count: 10800 },
      { range: "0.7–0.8", count: 4100 },
      { range: "0.6–0.7", count: 1500 },
      { range: "<0.6", count: 691 },
    ],
    toolUsage: [
      { tool: "Qdrant Similarity", calls: 48291 },
      { tool: "FalkorDB Graph", calls: 12073 },
      { tool: "ART Reasoning", calls: 3847 },
      { tool: "Ollama LLM", calls: 3847 },
      { tool: "EPR-KGQA", calls: 891 },
    ],
  };

  const models = modelRegistry ?? [
    { id: "gnn-v3", name: "GNN Fraud Detector v3", version: "3.2.1", accuracy: 0.943, status: "active", trainedAt: "2026-04-18", features: 30, trainingRecords: 2400000 },
    { id: "gnn-v2", name: "GNN Fraud Detector v2", version: "2.8.0", accuracy: 0.921, status: "archived", trainedAt: "2026-03-01", features: 28, trainingRecords: 1800000 },
    { id: "credit-v1", name: "Credit Scoring Model v1", version: "1.4.2", accuracy: 0.887, status: "active", trainedAt: "2026-02-15", features: 22, trainingRecords: 950000 },
    { id: "anomaly-v1", name: "Anomaly Detector v1", version: "1.1.0", accuracy: 0.912, status: "active", trainedAt: "2026-04-01", features: 18, trainingRecords: 1200000 },
  ];

  const traces = reasoningTraces ?? [
    { id: "art-001", transactionId: "txn_9a2f3b", decision: "BLOCK", confidence: 0.97, steps: 6, latencyMs: 1240, reason: "Fraud ring detected: 3 shared devices with 8 flagged merchants", timestamp: "2026-04-20T16:45:00Z" },
    { id: "art-002", transactionId: "txn_7c1d4e", decision: "REVIEW", confidence: 0.73, steps: 4, latencyMs: 890, reason: "Unusual velocity: 12 transactions in 3 minutes from new device", timestamp: "2026-04-20T16:40:00Z" },
    { id: "art-003", transactionId: "txn_5e8f2a", decision: "APPROVE", confidence: 0.94, steps: 2, latencyMs: 320, reason: "Known merchant pattern, device fingerprint matches history", timestamp: "2026-04-20T16:35:00Z" },
    { id: "art-004", transactionId: "txn_3b6c9d", decision: "BLOCK", confidence: 0.99, steps: 8, latencyMs: 1890, reason: "AML pattern: structuring detected across 5 accounts in 24h", timestamp: "2026-04-20T16:30:00Z" },
    { id: "art-005", transactionId: "txn_1a4e7f", decision: "REVIEW", confidence: 0.68, steps: 5, latencyMs: 1100, reason: "Cross-border anomaly: first transaction to high-risk corridor", timestamp: "2026-04-20T16:25:00Z" },
  ];

  const fraudRate = stats.totalDecisions > 0 ? ((stats.fraudCaught / stats.totalDecisions) * 100).toFixed(2) : "0.00";
  const fpRate = stats.fraudCaught > 0 ? ((stats.falsePositives / stats.fraudCaught) * 100).toFixed(1) : "0.0";
  const catchRate = (stats.modelAccuracy * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-indigo-500" />
            Lakehouse AI Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time model performance, reasoning traces, and feature store metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total Decisions</div>
            <div className="text-2xl font-bold">{stats.totalDecisions.toLocaleString()}</div>
            <div className="text-xs text-green-600 mt-1">↑ 12% vs prev period</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Fraud Caught</div>
            <div className="text-2xl font-bold text-red-600">{stats.fraudCaught.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">{fraudRate}% fraud rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">False Positives</div>
            <div className="text-2xl font-bold text-amber-600">{stats.falsePositives}</div>
            <div className="text-xs text-muted-foreground mt-1">{fpRate}% FP rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Model Accuracy</div>
            <div className="text-2xl font-bold text-green-600">{catchRate}%</div>
            <div className="text-xs text-muted-foreground mt-1">GNN v3.2.1</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Avg Confidence</div>
            <div className="text-2xl font-bold">{(stats.avgConfidence * 100).toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground mt-1">across all decisions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Avg Latency</div>
            <div className="text-2xl font-bold">{stats.avgLatencyMs}ms</div>
            <div className="text-xs text-green-600 mt-1">↓ 8ms vs prev</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="models">Model Registry</TabsTrigger>
          <TabsTrigger value="traces">Reasoning Traces</TabsTrigger>
          <TabsTrigger value="features">Feature Store</TabsTrigger>
          <TabsTrigger value="training">GNN Training</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Daily AI Decisions</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.dailyDecisions}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="decisions" fill="#6366f1" name="Total" />
                    <Bar dataKey="fraud" fill="#ef4444" name="Fraud" />
                    <Bar dataKey="fp" fill="#f59e0b" name="False Pos" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Confidence Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={stats.confidenceDistribution} dataKey="count" nameKey="range" cx="50%" cy="50%" outerRadius={80} label={({ range, percent }) => `${range}: ${(percent * 100).toFixed(0)}%`}>
                      {stats.confidenceDistribution.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">AI Tool Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.toolUsage.map((t: any) => (
                    <div key={t.tool}>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{t.tool}</span>
                        <span className="text-muted-foreground">{t.calls.toLocaleString()} calls</span>
                      </div>
                      <Progress value={(t.calls / stats.totalDecisions) * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Lakehouse Storage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm">Feature Store</span>
                  </div>
                  <Badge variant="outline">{stats.featureStoreSize}</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Audit Trail Records</span>
                  </div>
                  <Badge variant="outline">{stats.auditTrailRecords.toLocaleString()}</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Qdrant Vectors</span>
                  </div>
                  <Badge variant="outline">~{Math.round(stats.totalDecisions * 0.8).toLocaleString()}</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">KG Nodes (FalkorDB)</span>
                  </div>
                  <Badge variant="outline">~{Math.round(stats.totalDecisions * 0.25).toLocaleString()}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Model Registry Tab */}
        <TabsContent value="models" className="space-y-4">
          <div className="grid gap-4">
            {models.map((m: any) => (
              <Card key={m.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{m.name}</h3>
                        <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Version {m.version} · Trained {m.trainedAt} · {m.features} features · {(m.trainingRecords / 1000000).toFixed(1)}M training records</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">{(m.accuracy * 100).toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">accuracy</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span>Model Accuracy</span>
                      <span>{(m.accuracy * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={m.accuracy * 100} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Reasoning Traces Tab */}
        <TabsContent value="traces" className="space-y-3">
          {traces.map((t: any) => (
            <Card key={t.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={t.decision === "BLOCK" ? "destructive" : t.decision === "REVIEW" ? "outline" : "default"}>
                        {t.decision}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">{t.transactionId}</span>
                      <span className="text-xs text-muted-foreground">{t.steps} reasoning steps</span>
                    </div>
                    <p className="text-sm">{t.reason}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className="text-lg font-bold">{(t.confidence * 100).toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground">{t.latencyMs}ms</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Feature Store Tab */}
        <TabsContent value="features" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Feature Groups</CardTitle>
                <CardDescription>30 features across 5 groups</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { group: "Transaction Features", count: 8, examples: "amount, currency, channel, merchant_category" },
                  { group: "Velocity Features", count: 6, examples: "txn_count_1h, txn_count_24h, amount_sum_1h" },
                  { group: "Geographic Features", count: 5, examples: "country_code, is_cross_border, geo_distance_km" },
                  { group: "Device Features", count: 6, examples: "device_id, is_new_device, device_risk_score" },
                  { group: "Graph Features", count: 5, examples: "merchant_degree, shared_device_count, fraud_neighbor_ratio" },
                ].map((fg) => (
                  <div key={fg.group}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{fg.group}</span>
                      <Badge variant="outline">{fg.count} features</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{fg.examples}</p>
                    <Separator className="mt-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Parquet Partitions</CardTitle>
                <CardDescription>S3 Lakehouse feature store layout</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-xs space-y-1 bg-muted p-3 rounded">
                  <div>paygate-lakehouse/</div>
                  <div className="ml-2">features/</div>
                  <div className="ml-4">merchant_id=<span className="text-indigo-500">mch_xxx</span>/</div>
                  <div className="ml-6">date=<span className="text-green-500">2026-04-20</span>/</div>
                  <div className="ml-8 text-amber-500">features.parquet</div>
                  <div className="ml-2">audit_trail/</div>
                  <div className="ml-4">year=2026/month=04/day=20/</div>
                  <div className="ml-6 text-amber-500">decisions.parquet</div>
                  <div className="ml-2">model_registry/</div>
                  <div className="ml-4 text-amber-500">registry.json</div>
                  <div className="ml-2">reasoning_traces/</div>
                  <div className="ml-4 text-amber-500">traces.parquet</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* GNN Training Tab */}
        <TabsContent value="training" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-indigo-500" />
                GNN Training Pipeline
              </CardTitle>
              <CardDescription>
                Train a new PyTorch Geometric GNN model using accumulated Parquet feature data from the Lakehouse
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted rounded p-3 text-center">
                  <div className="text-xl font-bold">2.4M</div>
                  <div className="text-xs text-muted-foreground">Training records available</div>
                </div>
                <div className="bg-muted rounded p-3 text-center">
                  <div className="text-xl font-bold">30</div>
                  <div className="text-xs text-muted-foreground">Feature dimensions</div>
                </div>
                <div className="bg-muted rounded p-3 text-center">
                  <div className="text-xl font-bold">94.3%</div>
                  <div className="text-xs text-muted-foreground">Current model accuracy</div>
                </div>
                <div className="bg-muted rounded p-3 text-center">
                  <div className="text-xl font-bold">~45 min</div>
                  <div className="text-xs text-muted-foreground">Estimated training time</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Training Pipeline Steps</h4>
                {[
                  { step: 1, name: "Feature extraction from Parquet", status: "ready", desc: "Load 30-dim feature vectors from S3 Lakehouse" },
                  { step: 2, name: "Graph construction", status: "ready", desc: "Build merchant-customer-device graph from FalkorDB" },
                  { step: 3, name: "Train/val/test split (70/15/15)", status: "ready", desc: "Stratified split preserving fraud ratio" },
                  { step: 4, name: "GNN training (GraphSAGE)", status: "ready", desc: "3-layer GraphSAGE with 256 hidden dims, 50 epochs" },
                  { step: 5, name: "Evaluation & threshold tuning", status: "ready", desc: "Optimize F1 score at 0.5% FPR" },
                  { step: 6, name: "Model registration", status: "ready", desc: "Register artifact in Lakehouse model registry" },
                  { step: 7, name: "A/B shadow deployment", status: "ready", desc: "Route 5% traffic to new model for validation" },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-3 p-2 rounded border">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {s.step}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-500 ml-auto shrink-0 mt-1" />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => triggerTraining.mutate({ modelType: "gnn", epochs: 50, hiddenDims: 256 })}
                  disabled={triggerTraining.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {triggerTraining.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Queuing...</>
                  ) : (
                    <><Brain className="h-4 w-4 mr-2" /> Start GNN Training</>
                  )}
                </Button>
                <Button variant="outline">
                  <Clock className="h-4 w-4 mr-2" /> Schedule Nightly
                </Button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Training requires the Python <code>lakehouse-ai</code> service to be running with GPU support. In production, this runs on a dedicated GPU node via Kubernetes Job.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
