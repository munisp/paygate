import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Database, Play, Save } from "lucide-react";
export default function LakehouseV2() {
  const [sql, setSql] = useState("SELECT merchant_id, SUM(amount_kobo) as total FROM transactions GROUP BY merchant_id ORDER BY total DESC LIMIT 10");
  const [queryName, setQueryName] = useState("");
  const { isLoading, data: datasets } = trpc.tier6to8.lakehouseV2.getDatasets.useQuery();
  const { data: savedQueries } = trpc.tier6to8.lakehouseV2.getSavedQueries.useQuery();
  const aiAnalysisMutation = trpc.tier6to8.lakehouseV2.getAIAnalysis.useMutation();
  const runMutation = trpc.tier6to8.lakehouseV2.runQuery.useMutation({
    onSuccess: (d: any) => toast.success(`Query returned ${d.rowCount} rows in ${d.executionMs}ms`),
    onError: (e: any) => toast.error(e.message),
  });
  const saveMutation = trpc.tier6to8.lakehouseV2.saveQuery.useMutation({
    onSuccess: () => toast.success("Query saved"),
    onError: (e: any) => toast.error(e.message),
  });
  const exportMutation = trpc.tier6to8.lakehouseV2.exportDataset.useMutation({
    onSuccess: (d: any) => { window.open(d.downloadUrl, "_blank"); toast.success("Export ready"); },
    onError: (e: any) => toast.error(e.message),
  });
  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Database className="w-8 h-8 text-cyan-600" />
        <div><h1 className="text-2xl font-bold">Analytics Lakehouse v2</h1><p className="text-muted-foreground">Query your full transaction history with SQL and AI-powered insights</p></div>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Play className="w-4 h-4" />SQL Query Editor</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <textarea className="w-full border rounded-md px-3 py-2 text-sm font-mono h-28" value={sql} onChange={e => setSql(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={() => runMutation.mutate({ sql, parameters: {}, maxRows: 1000 })} disabled={runMutation.isPending}>
              <Play className="w-4 h-4 mr-1" />{runMutation.isPending ? "Running..." : "Run Query"}
            </Button>
            <input className="border rounded px-2 text-sm flex-1" placeholder="Query name" value={queryName} onChange={e => setQueryName(e.target.value)} />
            <Button variant="outline" onClick={() => saveMutation.mutate({ name: queryName, sql })} disabled={!queryName || saveMutation.isPending}>
              <Save className="w-4 h-4 mr-1" />Save
            </Button>
          </div>
          {runMutation.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr>{runMutation.data.columns?.map((c: string) => <th key={c} className="border px-2 py-1 bg-secondary text-left">{c}</th>)}</tr></thead>
                <tbody>{runMutation.data.rows?.slice(0, 10).map((row: any, i: number) => <tr key={i}>{runMutation.data.columns?.map((c: string) => <td key={c} className="border px-2 py-1">{String(row[c] ?? "")}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Datasets</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {datasets?.datasets.map((d: any) => (
              <div key={d.id} className="flex justify-between items-center p-2 border rounded">
                <div><p className="font-medium text-sm">{d.name}</p><p className="text-xs text-muted-foreground">{d.rowCount?.toLocaleString()} rows</p></div>
                <Button size="sm" variant="outline" onClick={() => exportMutation.mutate({ datasetName: d.name, format: "csv" })}>Export CSV</Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>AI Analysis</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" onClick={() => aiAnalysisMutation.mutate({ question: "What are the top revenue trends?", datasetName: "transactions" })} disabled={aiAnalysisMutation.isPending}>
              {aiAnalysisMutation.isPending ? "Analyzing..." : "Run AI Analysis"}
            </Button>
            {aiAnalysisMutation.data && <p className="text-sm">{aiAnalysisMutation.data.answer}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
