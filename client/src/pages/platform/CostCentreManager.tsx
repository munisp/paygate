// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DollarSign, Plus, Trash2, TrendingUp, BarChart3 } from "lucide-react";
import { format } from "date-fns";

function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Spent: {spent.toLocaleString()}</span>
        <span>Budget: {budget.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-yellow-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-right mt-0.5 text-muted-foreground">{pct.toFixed(1)}% utilised</p>
    </div>
  );
}

export default function CostCentreManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", currency: "NGN", monthlyBudget: "" });

  const { data: centres, refetch } = trpc.wave221.costCentres.list.useQuery();
  const { data: summary } = trpc.wave221.costCentres.getSummary.useQuery();
  const create = trpc.wave221.costCentres.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); setForm({ name: "", code: "", currency: "NGN", monthlyBudget: "" }); toast.success("Cost centre created"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.wave221.costCentres.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Cost centre deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const totalBudget = (centres ?? []).reduce((a, c) => a + parseFloat(c.monthlyBudget ?? "0"), 0);
  const totalSpent = (centres ?? []).reduce((a, c) => a + parseFloat(c.currentSpend ?? "0"), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cost Centre Manager</h1>
          <p className="text-muted-foreground text-sm">Track and allocate operational costs across business units and domains</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Cost Centre
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-blue-500" />
            <div><p className="text-xs text-muted-foreground">Total Budget</p><p className="text-2xl font-bold text-blue-600">{totalBudget.toLocaleString()}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-orange-500" />
            <div><p className="text-xs text-muted-foreground">Total Spent</p><p className="text-2xl font-bold text-orange-600">{totalSpent.toLocaleString()}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-purple-500" />
            <div><p className="text-xs text-muted-foreground">Utilisation</p><p className="text-2xl font-bold text-purple-600">{totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0}%</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(centres ?? []).length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No cost centres configured</p>
          </div>
        )}
        {(centres ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <p className="text-xs text-muted-foreground font-mono">{c.code}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">{c.currency}</Badge>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => remove.mutate({ id: c.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <BudgetBar spent={parseFloat(c.currentSpend ?? "0")} budget={parseFloat(c.monthlyBudget ?? "0")} />
              {c.updatedAt && (
                <p className="text-xs text-muted-foreground mt-2">Updated {format(new Date(c.updatedAt), "MMM d, yyyy")}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Cost Centre</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="e.g. Engineering" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input placeholder="e.g. ENG-001" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Budget</Label>
              <Input type="number" placeholder="e.g. 500000" value={form.monthlyBudget} onChange={(e) => setForm((p) => ({ ...p, monthlyBudget: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => create.mutate({ ...form, monthlyBudget: parseFloat(form.monthlyBudget) })} disabled={!form.name || !form.code || !form.monthlyBudget || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
