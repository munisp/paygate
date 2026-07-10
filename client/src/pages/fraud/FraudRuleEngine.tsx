import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldAlert, Plus, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function FraudRuleEngine() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({ status: "active", priority: 100 });

  const { data: rules, refetch, isLoading } = trpc.fraudRuleEngine.list.useQuery({ merchantId: "all" });
  const createMutation = trpc.fraudRuleEngine.create.useMutation({
    onSuccess: () => { toast.success("Fraud rule created."); setOpen(false); setForm({ status: "active", priority: 100 }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const toggleMutation = trpc.fraudRuleEngine.toggleStatus.useMutation({
    onSuccess: () => { toast.success("Rule status updated."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.fraudRuleEngine.delete.useMutation({
    onSuccess: () => { toast.success("Rule deleted."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-red-500" /> Fraud Rule Engine</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure real-time fraud detection rules for transaction screening</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Rule</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule Name</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Condition Tree</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>Hits</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !rules?.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No fraud rules configured. Add your first rule.</TableCell></TableRow>}
              {rules?.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{rule.name}</p>
                      {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{rule.priority}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                    {typeof rule.conditionTree === "string" ? rule.conditionTree : JSON.stringify(rule.conditionTree).slice(0, 60)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[150px] truncate">
                    {Array.isArray(rule.actions) ? rule.actions.map((a: any) => a.type ?? a).join(", ") : String(rule.actions)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      {(rule.hitCount ?? 0) > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      {rule.hitCount ?? 0}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.status === "active"}
                      onCheckedChange={() => toggleMutation.mutate({ id: rule.id, status: rule.status === "active" ? "inactive" : "active" })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: rule.id })} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Fraud Rule</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Rule Name <span className="text-destructive">*</span></Label><Input placeholder="e.g. High-value velocity block" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-2"><Label>Description</Label><Input placeholder="Optional description" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
            <div className="space-y-2"><Label>Merchant ID <span className="text-destructive">*</span></Label><Input placeholder="Merchant ID (or 'all' for global)" value={form.merchantId ?? ""} onChange={(e) => set("merchantId", e.target.value)} /></div>
            <div className="space-y-2"><Label>Condition Tree (JSON) <span className="text-destructive">*</span></Label><Input placeholder='{"operator":"AND","conditions":[{"field":"amount","op":"gt","value":1000000}]}' value={form.conditionTree ?? ""} onChange={(e) => set("conditionTree", e.target.value)} /></div>
            <div className="space-y-2"><Label>Actions (JSON array) <span className="text-destructive">*</span></Label><Input placeholder='[{"type":"block"},{"type":"notify","channel":"email"}]' value={form.actions ?? ""} onChange={(e) => set("actions", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Priority</Label><Input type="number" min={1} max={999} placeholder="100" value={form.priority ?? ""} onChange={(e) => set("priority", parseInt(e.target.value))} /></div>
              <div className="space-y-2"><Label>Created By <span className="text-destructive">*</span></Label><Input placeholder="Your user ID" value={form.createdBy ?? ""} onChange={(e) => set("createdBy", e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                let condTree: any, acts: any;
                try { condTree = JSON.parse(form.conditionTree || "{}"); } catch { toast.error("Invalid condition tree JSON"); return; }
                try { acts = JSON.parse(form.actions || "[]"); } catch { toast.error("Invalid actions JSON"); return; }
                createMutation.mutate({ name: form.name, description: form.description, merchantId: form.merchantId, conditionTree: condTree, actions: acts, priority: form.priority ?? 100, createdBy: form.createdBy });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
