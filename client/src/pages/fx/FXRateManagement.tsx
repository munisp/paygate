import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, Plus, RefreshCw, Edit2, Save, X, ArrowRightLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function FXRateManagement() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: rates, refetch, isLoading } = trpc.wave223.fxRates.list.useQuery();
  const createMutation = trpc.wave223.fxRates.create.useMutation({
    onSuccess: () => { toast.success("FX rate created."); setOpen(false); setForm({}); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.wave223.fxRates.update.useMutation({
    onSuccess: () => { toast.success("Rate updated."); setEditingId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowRightLeft className="h-6 w-6 text-teal-500" /> FX Rate Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage multi-currency exchange rates for cross-border transfers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Rate</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Active Exchange Rates</CardTitle>
          <CardDescription>Rates are applied to cross-border FSPIOP transfers through NextHub</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency Pair</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Spread (%)</TableHead>
                <TableHead>Effective Rate</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !rates?.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No FX rates configured.</TableCell></TableRow>}
              {rates?.map((r) => {
                const isEditing = editingId === r.id;
                const spread = r.spreadPct ?? 0;
                const effectiveRate = r.rate ? r.rate * (1 + spread / 100) : 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">{r.sourceCurrency}</span>
                        <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono font-bold text-sm">{r.targetCurrency}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input className="w-28 h-8 text-sm" type="number" step="0.0001" value={editRate} onChange={(e) => setEditRate(e.target.value)} />
                      ) : (
                        <span className="font-mono text-sm">{r.rate?.toFixed(4)}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{spread.toFixed(2)}%</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{effectiveRate.toFixed(4)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.rateSource ?? "manual"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell><Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" onClick={() => updateMutation.mutate({ id: r.id, rate: parseFloat(editRate) })} disabled={updateMutation.isPending}><Save className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(r.id); setEditRate(String(r.rate ?? "")); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add FX Rate</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2"><Label>Source Currency <span className="text-destructive">*</span></Label><Input placeholder="e.g. NGN" value={form.sourceCurrency ?? ""} onChange={(e) => set("sourceCurrency", e.target.value.toUpperCase())} /></div>
            <div className="space-y-2"><Label>Target Currency <span className="text-destructive">*</span></Label><Input placeholder="e.g. USD" value={form.targetCurrency ?? ""} onChange={(e) => set("targetCurrency", e.target.value.toUpperCase())} /></div>
            <div className="space-y-2"><Label>Rate <span className="text-destructive">*</span></Label><Input type="number" step="0.0001" placeholder="e.g. 0.00065" value={form.rate ?? ""} onChange={(e) => set("rate", e.target.value)} /></div>
            <div className="space-y-2"><Label>Spread (%)</Label><Input type="number" step="0.01" placeholder="e.g. 1.5" value={form.spreadPct ?? ""} onChange={(e) => set("spreadPct", e.target.value)} /></div>
            <div className="space-y-2 col-span-2"><Label>Rate Source</Label><Input placeholder="e.g. CBN, manual, oracle" value={form.rateSource ?? ""} onChange={(e) => set("rateSource", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ sourceCurrency: form.sourceCurrency, targetCurrency: form.targetCurrency, rate: parseFloat(form.rate), spreadPct: form.spreadPct ? parseFloat(form.spreadPct) : undefined, rateSource: form.rateSource })} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
