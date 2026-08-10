import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Database, Play, Save, Download, Brain, MapPin, CreditCard, Table, Clock, Layers, BarChart3, RefreshCw, Zap } from "lucide-react";

export default function LakehouseV2() {
  const [sql, setSql] = useState("SELECT merchant_id, SUM(amount_kobo)/100 AS total_ngn, COUNT(*) AS tx_count\nFROM transactions\nGROUP BY merchant_id\nORDER BY total_ngn DESC\nLIMIT 20");
  const [queryName, setQueryName] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [selectedDataset, setSelectedDataset] = useState("transactions");
  const [exportFormat, setExportFormat] = useState<"csv"|"parquet"|"json"|"xlsx">("csv");
  const [queryResult, setQueryResult] = useState<{columns:string[];rows:unknown[][];rowCount:number;executionTimeMs:number;engine:string;}|null>(null);
  const [creditParams, setCreditParams] = useState({ repaymentScore: 0.8, outstandingLoan: 0 });

  const { isLoading: datasetsLoading, data: datasetsData, refetch: refetchDatasets } = trpc.tier6to8.lakehouseV2.getDatasets.useQuery();
  const { data: savedQueriesData, refetch: refetchSaved } = trpc.tier6to8.lakehouseV2.getSavedQueries.useQuery();

  const geoInput = useMemo(() => ({ radiusKm: 100, resolution: 7 }), []);
  const { data: geoHeatmap, isLoading: geoLoading, refetch: refetchGeo } = trpc.tier6to8.lakehouseV2.getGeoFraudHeatmap.useQuery(geoInput, { staleTime: 30_000 });

  const creditInput = useMemo(() => ({
    repaymentHistoryScore: creditParams.repaymentScore,
    outstandingLoanKobo: creditParams.outstandingLoan,
    includeFeatures: true,
  }), [creditParams.repaymentScore, creditParams.outstandingLoan]);
  const { data: creditScore, isLoading: creditLoading, refetch: refetchCredit } = trpc.tier6to8.lakehouseV2.getMerchantCreditScore.useQuery(creditInput, { staleTime: 30_000 });

  const runMutation = trpc.tier6to8.lakehouseV2.runQuery.useMutation({
    onSuccess: (d) => { setQueryResult(d as any); toast.success(`${(d as any).rowCount} rows in ${(d as any).executionTimeMs}ms via ${(d as any).engine}`); },
    onError: (e) => toast.error(e.message),
  });
  const saveMutation = trpc.tier6to8.lakehouseV2.saveQuery.useMutation({
    onSuccess: () => { toast.success("Query saved"); refetchSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const exportMutation = trpc.tier6to8.lakehouseV2.exportDataset.useMutation({
    onSuccess: (d) => { window.open((d as any).downloadUrl, "_blank"); toast.success("Export ready"); },
    onError: (e) => toast.error(e.message),
  });
  const aiMutation = trpc.tier6to8.lakehouseV2.getAIAnalysis.useMutation({ onError: (e) => toast.error(e.message) });

  const datasets = (datasetsData as any)?.datasets ?? [];
  const savedQueries = (savedQueriesData as any)?.queries ?? [];
  const heatmapCells = geoHeatmap?.cells ?? [];

  const tierColor = (tier: string) => {
    if (["AAA","AA"].includes(tier)) return "bg-emerald-100 text-emerald-800";
    if (["A","BBB"].includes(tier)) return "bg-blue-100 text-blue-800";
    if (["BB","B"].includes(tier)) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="h-6 w-6 text-primary" />Platform Analytics Lakehouse</h1>
          <p className="text-muted-foreground text-sm mt-1">DuckDB · Delta Lake · Apache Sedona · DataFusion · Trino</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => { refetchDatasets(); refetchGeo(); refetchCredit(); }}><RefreshCw/>Refresh All
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{datasets.length}</div><div className="text-xs text-muted-foreground">Delta Lake Tables</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{savedQueries.length}</div><div className="text-xs text-muted-foreground">Saved Queries</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{heatmapCells.length}</div><div className="text-xs text-muted-foreground">Geo Risk Cells (H3)</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className={`text-2xl font-bold ${creditScore ? "" : "text-muted-foreground"}`}>{creditLoading ? "…" : (creditScore as any)?.score ?? "—"}</div><div className="text-xs text-muted-foreground">Credit Score (DataFusion)</div></CardContent></Card>
      </div>

      <Tabs defaultValue="query">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="query"><Play className="h-3 w-3 mr-1" />SQL Query</TabsTrigger>
          <TabsTrigger value="datasets"><Layers className="h-3 w-3 mr-1" />Datasets</TabsTrigger>
          <TabsTrigger value="geo"><MapPin className="h-3 w-3 mr-1" />Geo Heatmap</TabsTrigger>
          <TabsTrigger value="credit"><CreditCard className="h-3 w-3 mr-1" />Credit Score</TabsTrigger>
          <TabsTrigger value="ai"><Brain className="h-3 w-3 mr-1" />AI Analysis</TabsTrigger>
        </TabsList>

        {/* SQL Query */}
        <TabsContent value="query" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">DuckDB SQL Editor</CardTitle><CardDescription>Query Delta Lake tables via DuckDB engine</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <textarea className="w-full h-36 font-mono text-sm p-3 border rounded-md bg-muted/30 resize-y focus:outline-none focus:ring-2 focus:ring-primary" value={sql} onChange={(e) => setSql(e.target.value)} />
              <div className="flex gap-2">
                <Button onClick={() => runMutation.mutate({ sql, maxRows: 1000 })} disabled={runMutation.isPending || !sql.trim()}>
                  <Play className="h-4 w-4 mr-2" />{runMutation.isPending ? "Running…" : "Run Query"}
                </Button>
                <div className="flex gap-2 ml-auto">
                  <Input placeholder="Query name" value={queryName} onChange={(e) => setQueryName(e.target.value)} className="w-40" />
                  <Button variant="outline" onClick={() => saveMutation.mutate({ name: queryName, sql })} disabled={saveMutation.isPending || !queryName.trim()}>
                    <Save className="h-4 w-4 mr-2" />Save
                  </Button>
                </div>
              </div>
              {savedQueries.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Saved Queries</p>
                  <div className="flex flex-wrap gap-2">
                    {savedQueries.map((q: any) => (
                      <Badge key={q.id} variant="outline" className="cursor-pointer hover:bg-primary/10" onClick={() => setSql(q.sql)}>{q.name}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {queryResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />{queryResult.executionTimeMs}ms
                    <Zap className="h-3 w-3 ml-2" />{queryResult.engine}
                    <span className="ml-auto">{queryResult.rowCount} rows</span>
                  </div>
                  <div className="overflow-auto max-h-64 border rounded-md">
                    <div className="overflow-x-auto"><table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0"><tr>{queryResult.columns.map((col) => <th key={col} className="px-3 py-2 text-left font-medium">{col}</th>)}</tr></thead>
                      <tbody>{queryResult.rows.map((row, i) => (<tr key={i} className="border-t hover:bg-muted/30">{(row as any[]).map((cell, j) => <td key={j} className="px-3 py-1.5">{String(cell ?? "")}</td>)}</tr>))}</tbody>
                    </table></div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Datasets */}
        <TabsContent value="datasets" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Table className="h-4 w-4" />Delta Lake Tables</CardTitle></CardHeader>
            <CardContent>
              {datasets.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No datasets found. Run the lakehouse-audit consumer to populate tables.</p>
              ) : (
                <div className="space-y-3">
                  {datasets.map((ds: any) => (
                    <div key={ds.name} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-primary" />
                          <span className="font-medium">{ds.name}</span>
                          <Badge variant="outline">{ds.format}</Badge>
                          <Badge className={ds.status === "active" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>{ds.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{(ds.rowCount ?? 0).toLocaleString()} rows</span>
                          <span>·</span>
                          <span>{((ds.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(ds.schema ?? []).slice(0, 8).map((col: any) => (<Badge key={col.column} variant="secondary" className="text-xs">{col.column}: {col.type}</Badge>))}
                        {(ds.schema ?? []).length > 8 && <Badge variant="secondary" className="text-xs">+{ds.schema.length - 8} more</Badge>}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => setSql(`SELECT * FROM ${ds.name} LIMIT 100`)}><Play className="h-3 w-3 mr-1" />Query</Button>
                        <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as any)}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="csv">CSV</SelectItem>
                            <SelectItem value="parquet">Parquet</SelectItem>
                            <SelectItem value="json">JSON</SelectItem>
                            <SelectItem value="xlsx">Excel</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => exportMutation.mutate({ datasetName: ds.name, format: exportFormat })} disabled={exportMutation.isPending}>
                          <Download className="h-3 w-3 mr-1" />Export
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Geo Heatmap (Sedona) */}
        <TabsContent value="geo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Geospatial Fraud Heatmap<Badge variant="outline" className="text-xs">Apache Sedona + H3</Badge></CardTitle>
              <CardDescription>Spatial clustering of fraud events using H3 hexagonal indexing at resolution 7 (~5km cells)</CardDescription>
            </CardHeader>
            <CardContent>
              {geoLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
              ) : heatmapCells.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No geo data available. Ensure the fraud-heatmap Sedona service is running.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Total events: <strong>{geoHeatmap?.totalEvents?.toLocaleString()}</strong></span>
                    <span className="text-muted-foreground">Engine: <strong>{geoHeatmap?.engine}</strong></span>
                    <span className="text-muted-foreground">Sedona: <strong>{geoHeatmap?.sedonaVersion}</strong></span>
                  </div>
                  <div className="overflow-auto max-h-96 border rounded-md">
                    <div className="overflow-x-auto"><table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0"><tr><th className="px-3 py-2 text-left">H3 Index</th><th className="px-3 py-2 text-left">Lat</th><th className="px-3 py-2 text-left">Lng</th><th className="px-3 py-2 text-left">Events</th><th className="px-3 py-2 text-left">Risk Score</th><th className="px-3 py-2 text-left">Risk Level</th></tr></thead>
                      <tbody>
                        {heatmapCells.slice(0, 50).map((cell) => (
                          <tr key={cell.h3Index} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono">{cell.h3Index}</td>
                            <td className="px-3 py-1.5">{cell.lat.toFixed(4)}</td>
                            <td className="px-3 py-1.5">{cell.lng.toFixed(4)}</td>
                            <td className="px-3 py-1.5">{cell.count}</td>
                            <td className="px-3 py-1.5">{(cell.riskScore * 100).toFixed(1)}%</td>
                            <td className="px-3 py-1.5"><Badge className={cell.riskScore > 0.7 ? "bg-red-100 text-red-800" : cell.riskScore > 0.4 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}>{cell.riskScore > 0.7 ? "High" : cell.riskScore > 0.4 ? "Medium" : "Low"}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </div>
                  {heatmapCells.length > 50 && <p className="text-xs text-muted-foreground text-center">Showing top 50 of {heatmapCells.length} cells</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credit Score (DataFusion) */}
        <TabsContent value="credit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />Merchant Credit Score<Badge variant="outline" className="text-xs">Apache DataFusion</Badge></CardTitle>
              <CardDescription>In-process OLAP scoring using Rust DataFusion with Parquet feature extraction from S3</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-xs font-medium">Repayment History Score (0–1)</label><Input type="number" min={0} max={1} step={0.01} value={creditParams.repaymentScore} onChange={(e) => setCreditParams(p => ({ ...p, repaymentScore: parseFloat(e.target.value) || 0 }))} /></div>
                <div className="space-y-1"><label className="text-xs font-medium">Outstanding Loan (Kobo)</label><Input type="number" min={0} value={creditParams.outstandingLoan} onChange={(e) => setCreditParams(p => ({ ...p, outstandingLoan: parseInt(e.target.value) || 0 }))} /></div>
              </div>
              <Button onClick={() => refetchCredit()} disabled={creditLoading}><BarChart3 className="h-4 w-4 mr-2" />{creditLoading ? "Scoring…" : "Recalculate Score"}</Button>
              {creditScore && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="border rounded-lg p-4 text-center"><div className="text-3xl font-bold text-primary">{(creditScore as any).score}</div><div className="text-xs text-muted-foreground mt-1">Credit Score</div></div>
                  <div className="border rounded-lg p-4 text-center"><Badge className={tierColor((creditScore as any).tier)}>{(creditScore as any).tier}</Badge><div className="text-xs text-muted-foreground mt-2">Credit Tier</div></div>
                  <div className="border rounded-lg p-4 text-center"><div className="text-xl font-bold">₦{(((creditScore as any).maxLoanKobo ?? 0) / 100).toLocaleString()}</div><div className="text-xs text-muted-foreground mt-1">Max Loan</div></div>
                  <div className="border rounded-lg p-4 text-center"><div className="text-xl font-bold">{(((creditScore as any).interestRateBps ?? 0) / 100).toFixed(1)}%</div><div className="text-xs text-muted-foreground mt-1">Interest Rate</div></div>
                </div>
              )}
              {(creditScore as any)?.lakehouseFeatures && (
                <div className="border rounded-lg p-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">DataFusion Lakehouse Features</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries((creditScore as any).lakehouseFeatures).map(([k, v]) => (
                      <div key={k} className="bg-muted/30 rounded p-2"><div className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</div><div className="text-sm font-medium">{String(v)}</div></div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Analysis */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" />AI-Powered Data Analysis</CardTitle><CardDescription>Ask natural language questions about your lakehouse data</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium">Dataset</label>
                <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{datasets.length > 0 ? datasets.map((ds: any) => <SelectItem key={ds.name} value={ds.name}>{ds.name}</SelectItem>) : <SelectItem value="transactions">transactions</SelectItem>}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Question</label>
                <Input placeholder="e.g. What are the top 5 merchants by transaction volume this month?" value={aiQuestion} onChange={(e) => setAiQuestion(e.target.value)} />
              </div>
              <Button onClick={() => aiMutation.mutate({ question: aiQuestion, datasetName: selectedDataset })} disabled={aiMutation.isPending || !aiQuestion.trim()}>
                <Brain className="h-4 w-4 mr-2" />{aiMutation.isPending ? "Analysing…" : "Analyse"}
              </Button>
              {aiMutation.data && (
                <div className="border rounded-lg p-4 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">AI Analysis</p>
                  <p className="text-sm whitespace-pre-wrap">{(aiMutation.data as any).answer}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
