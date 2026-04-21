import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, TrendingUp } from "lucide-react";

const DEMO_TENANT = "ten_paygate_default";

export default function TenantCorridorsPage() {
  const { toast } = useToast();
  const [tenantId, setTenantId] = useState(DEMO_TENANT);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    sourceCurrency: "NGN",
    destCurrency: "USD",
    fxMarkupPct: 1.5,
    dailyLimitUsd: 50000,
    minAmountUsd: 1,
    maxAmountUsd: 10000,
    flatFeeUsd: 0,
  });

  const { data: corridors, refetch } = trpc.wave32.corridors.list.useQuery({ tenantId });

  const createMutation = trpc.wave32.corridors.create.useMutation({
    onSuccess: () => { toast({ title: "Corridor created" }); setShowCreate(false); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = trpc.wave32.corridors.update.useMutation({
    onSuccess: () => { toast({ title: "Corridor updated" }); setEditId(null); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.wave32.corridors.delete.useMutation({
    onSuccess: () => { toast({ title: "Corridor deleted" }); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = trpc.wave32.corridors.update.useMutation({
    onSuccess: () => refetch(),
  });

  const editCorridor = corridors?.find(c => c.id === editId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">FX Corridors</h1>
          <p className="text-muted-foreground">Configure currency corridors, FX markups, and transaction limits per tenant.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />Add Corridor</Button>
      </div>

      {/* Tenant Selector */}
      <div className="flex gap-3 items-center">
        <Label className="shrink-0">Tenant ID:</Label>
        <Input className="max-w-xs" value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="ten_..." />
      </div>

      {/* Corridors Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {["Corridor", "FX Markup", "Daily Limit", "Min / Max", "Flat Fee", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!corridors?.length ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No corridors configured</td></tr>
              ) : corridors.map(c => (
                <tr key={c.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-semibold">{c.sourceCurrency} → {c.destCurrency}</td>
                  <td className="px-4 py-3">{c.fxMarkupPct}%</td>
                  <td className="px-4 py-3">${c.dailyLimitUsd?.toLocaleString()}</td>
                  <td className="px-4 py-3">${c.minAmountUsd} – ${c.maxAmountUsd}</td>
                  <td className="px-4 py-3">${c.flatFeeUsd}</td>
                  <td className="px-4 py-3">
                    <Switch checked={c.isEnabled ?? false}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, isEnabled: v })} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditId(c.id)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => deleteMutation.mutate({ id: c.id })}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add FX Corridor</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "sourceCurrency", label: "Source Currency", type: "text" },
              { key: "destCurrency", label: "Dest Currency", type: "text" },
              { key: "fxMarkupPct", label: "FX Markup %", type: "number" },
              { key: "dailyLimitUsd", label: "Daily Limit USD", type: "number" },
              { key: "minAmountUsd", label: "Min Amount USD", type: "number" },
              { key: "maxAmountUsd", label: "Max Amount USD", type: "number" },
              { key: "flatFeeUsd", label: "Flat Fee USD", type: "number" },
            ].map(f => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Input type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === "number" ? +e.target.value : e.target.value.toUpperCase() }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ tenantId, ...form })} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editId} onOpenChange={() => setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Corridor</DialogTitle></DialogHeader>
          {editCorridor && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "fxMarkupPct", label: "FX Markup %", type: "number" },
                { key: "dailyLimitUsd", label: "Daily Limit USD", type: "number" },
                { key: "minAmountUsd", label: "Min Amount USD", type: "number" },
                { key: "maxAmountUsd", label: "Max Amount USD", type: "number" },
                { key: "flatFeeUsd", label: "Flat Fee USD", type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input type={f.type} defaultValue={(editCorridor as any)[f.key]}
                    id={`edit-${f.key}`} />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!editId) return;
              const getVal = (k: string) => parseFloat((document.getElementById(`edit-${k}`) as HTMLInputElement)?.value ?? "0");
              updateMutation.mutate({
                id: editId,
                fxMarkupPct: getVal("fxMarkupPct"),
                dailyLimitUsd: getVal("dailyLimitUsd"),
                minAmountUsd: getVal("minAmountUsd"),
                maxAmountUsd: getVal("maxAmountUsd"),
                flatFeeUsd: getVal("flatFeeUsd"),
              });
            }} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
