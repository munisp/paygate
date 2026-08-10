import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Plus, RefreshCw, Search, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";

export default function FraudRules() {
  const [search, setSearch] = useState("");
  const [ruleType, setRuleType] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", ruleType: "velocity", condition: "", action: "flag", threshold: 0, isActive: true });

  const { data, isLoading, refetch } = trpc.fraudRules.listAlerts.useQuery({ page, limit: 20 }, { staleTime: 30_000 });
  const acknowledgeMutation = trpc.fraudRules.acknowledgeAlert.useMutation({
    onSuccess: () => { toast.success("Alert acknowledged"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const resolveMutation = trpc.fraudRules.resolveAlert.useMutation({
    onSuccess: () => { toast.success("Alert resolved"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const createRuleMutation = trpc.fraudRules.createRule.useMutation({
    onSuccess: (data) => {
      toast.success(`Rule ${data.ruleId} created successfully`);
      setCreateOpen(false);
      setForm({ name: "", ruleType: "velocity", condition: "", action: "flag", threshold: 0, isActive: true });
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rules = (data as any)?.alerts ?? [];
  const total = (data as any)?.total ?? 0;
  const ruleTypes = ["velocity", "amount_threshold", "geo_block", "device_fingerprint", "pattern_match", "ml_score"];
  const actions = ["flag", "block", "review", "notify"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fraud Rules</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure automated fraud detection rules and thresholds</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Rule</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Fraud Rule</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Rule Type</Label>
                  <Select value={form.ruleType} onValueChange={v => setForm(f => ({ ...f, ruleType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ruleTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Action</Label>
                  <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{actions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Condition (JSON expression)</Label><Input value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} placeholder='{"field":"amount","op":"gt","value":500000}' /></div>
              <div><Label>Threshold</Label><Input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))} /></div>
              <Button
                className="w-full"
                disabled={createRuleMutation.isPending || !form.name.trim()}
                onClick={() => {
                  if (!form.name.trim()) { toast.error("Rule name required"); return; }
                  createRuleMutation.mutate(form);
                }}
              >
                {createRuleMutation.isPending ? "Creating…" : "Create Rule"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="pt-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search rules…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={ruleType ?? "all"} onValueChange={v => { setRuleType(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Rule Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ruleTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle>Fraud Alerts ({total})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No fraud rules configured</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">Name</th>
                    <th className="text-left py-3 px-2">Type</th>
                    <th className="text-left py-3 px-2">Action</th>
                    <th className="text-right py-3 px-2">Threshold</th>
                    <th className="text-right py-3 px-2">Triggers</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-medium">{r.name}</td>
                      <td className="py-3 px-2"><Badge variant="outline">{r.ruleType?.replace(/_/g, " ")}</Badge></td>
                      <td className="py-3 px-2">
                        <Badge variant={r.action === "block" ? "destructive" : r.action === "flag" ? "outline" : "secondary"}>{r.action}</Badge>
                      </td>
                      <td className="py-3 px-2 text-right">{r.threshold ?? "—"}</td>
                      <td className="py-3 px-2 text-right">{r.triggerCount ?? 0}</td>
                      <td className="py-3 px-2"><Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? "Active" : "Inactive"}</Badge></td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => acknowledgeMutation.mutate({ id: r.id })}>
                            <ToggleRight className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" aria-label="Delete" onClick={() => { if (confirm("Resolve this alert?")) resolveMutation.mutate({ id: r.id, resolution: "manually resolved" }); }}><Trash2/>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
