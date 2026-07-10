import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Gauge, RefreshCw, Edit2, Save, X, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function APIRateLimitDashboard() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ requestsPerMinute: string; requestsPerHour: string; requestsPerDay: string }>({ requestsPerMinute: "", requestsPerHour: "", requestsPerDay: "" });

  const { data: rules, refetch, isLoading } = trpc.wave223.apiRateLimits.list.useQuery();
  const { data: usage } = trpc.wave223.apiRateLimits.getUsage.useQuery();

  const updateMutation = trpc.wave223.apiRateLimits.update.useMutation({
    onSuccess: () => { toast.success("Rate limit updated."); setEditingId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = (rule: any) => {
    setEditingId(rule.id);
    setEditValues({
      requestsPerMinute: String(rule.requestsPerMinute ?? ""),
      requestsPerHour: String(rule.requestsPerHour ?? ""),
      requestsPerDay: String(rule.requestsPerDay ?? ""),
    });
  };

  const utilizationBar = (used: number, limit: number) => {
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-green-500";
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gauge className="h-6 w-6 text-orange-500" /> API Rate Limit Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor and configure API rate limits per key and endpoint</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Current usage summary */}
      {usage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Requests (last min)", used: usage.lastMinute, limit: usage.limitPerMinute },
            { label: "Requests (last hour)", used: usage.lastHour, limit: usage.limitPerHour },
            { label: "Requests (today)", used: usage.today, limit: usage.limitPerDay },
            { label: "Rate-limited (today)", used: usage.rateLimitedToday, limit: null },
          ].map((s) => (
            <Card key={s.label} className="border-0 bg-muted/40">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{s.used?.toLocaleString() ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                {s.limit && <p className="text-xs text-muted-foreground">of {s.limit.toLocaleString()}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rate limit rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rate Limit Rules</CardTitle>
          <CardDescription>Per-key and per-endpoint rate limit configuration</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Identifier</TableHead>
                <TableHead>Req/min</TableHead>
                <TableHead>Req/hour</TableHead>
                <TableHead>Req/day</TableHead>
                <TableHead>Current Usage (min)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !rules?.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No rate limit rules configured.</TableCell></TableRow>}
              {rules?.map((rule) => {
                const isEditing = editingId === rule.id;
                const usedMin = rule.currentMinuteUsage ?? 0;
                const limitMin = rule.requestsPerMinute ?? 60;
                return (
                  <TableRow key={rule.id}>
                    <TableCell><Badge variant="outline" className="capitalize">{rule.scope}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{rule.identifier}</TableCell>
                    <TableCell>
                      {isEditing ? <Input className="w-20 h-8 text-sm" type="number" value={editValues.requestsPerMinute} onChange={(e) => setEditValues((p) => ({ ...p, requestsPerMinute: e.target.value }))} /> : <span className="font-mono text-sm">{rule.requestsPerMinute ?? "—"}</span>}
                    </TableCell>
                    <TableCell>
                      {isEditing ? <Input className="w-24 h-8 text-sm" type="number" value={editValues.requestsPerHour} onChange={(e) => setEditValues((p) => ({ ...p, requestsPerHour: e.target.value }))} /> : <span className="font-mono text-sm">{rule.requestsPerHour ?? "—"}</span>}
                    </TableCell>
                    <TableCell>
                      {isEditing ? <Input className="w-24 h-8 text-sm" type="number" value={editValues.requestsPerDay} onChange={(e) => setEditValues((p) => ({ ...p, requestsPerDay: e.target.value }))} /> : <span className="font-mono text-sm">{rule.requestsPerDay ?? "—"}</span>}
                    </TableCell>
                    <TableCell className="min-w-[120px]">{utilizationBar(usedMin, limitMin)}</TableCell>
                    <TableCell>
                      {(usedMin / limitMin) >= 0.9 ? (
                        <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Near limit</Badge>
                      ) : (
                        <Badge variant="default">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" onClick={() => updateMutation.mutate({ id: rule.id, requestsPerMinute: parseInt(editValues.requestsPerMinute), requestsPerHour: parseInt(editValues.requestsPerHour), requestsPerDay: parseInt(editValues.requestsPerDay) })} disabled={updateMutation.isPending}><Save className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(rule)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
