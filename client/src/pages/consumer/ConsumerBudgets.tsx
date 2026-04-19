import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Plus, Trash2, Edit, TrendingUp, AlertTriangle } from "lucide-react";

const CATEGORY_EMOJIS: Record<string, string> = {
  food: "🍔", transport: "🚗", shopping: "🛍️",
  bills: "💡", entertainment: "🎬", other: "📦",
};

const CATEGORY_COLORS: Record<string, string> = {
  food: "bg-orange-500", transport: "bg-blue-500", shopping: "bg-pink-500",
  bills: "bg-yellow-500", entertainment: "bg-purple-500", other: "bg-gray-500",
};

export default function ConsumerBudgets() {
  const [showCreate, setShowCreate] = useState(false);
  const [editBudget, setEditBudget] = useState<{ id: string; limitKobo: number; alertAt: number } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: "food" as const,
    limitKobo: 50000,
    period: "monthly" as const,
    alertAt: 80,
  });

  const utils = trpc.useUtils();
  const { data: budgets, isLoading } = trpc.wave24.budgets.list.useQuery();

  const createMutation = trpc.wave24.budgets.create.useMutation({
    onSuccess: () => {
      toast.success("Budget created");
      utils.wave24.budgets.list.invalidate();
      setShowCreate(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.wave24.budgets.update.useMutation({
    onSuccess: () => {
      toast.success("Budget updated");
      utils.wave24.budgets.list.invalidate();
      setEditBudget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.wave24.budgets.delete.useMutation({
    onSuccess: () => {
      toast.success("Budget removed");
      utils.wave24.budgets.list.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const totalBudgetKobo = (budgets ?? []).reduce((s, b) => s + b.limitKobo, 0);
  const totalSpentKobo = (budgets ?? []).reduce((s, b) => s + b.spentKobo, 0);
  const overBudgetCount = (budgets ?? []).filter(b => b.spentKobo >= b.limitKobo).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Spending Budgets</h2>
          <p className="text-muted-foreground text-sm">Track and control your spending by category</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />Add Budget
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xl font-bold">₦{(totalBudgetKobo / 100).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Budget</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xl font-bold">₦{(totalSpentKobo / 100).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Spent</div>
          </CardContent>
        </Card>
        <Card className={overBudgetCount > 0 ? "border-red-200" : ""}>
          <CardContent className="pt-4">
            <div className={`text-xl font-bold ${overBudgetCount > 0 ? "text-red-600" : "text-green-600"}`}>
              {overBudgetCount}
            </div>
            <div className="text-xs text-muted-foreground">Over Budget</div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Cards */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading budgets...</div>
      ) : !budgets || budgets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No budgets set</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first budget to start tracking spending</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />Create Budget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {budgets.map(budget => {
            const pct = Math.min(100, Math.round((budget.spentKobo / budget.limitKobo) * 100));
            const isOver = budget.spentKobo >= budget.limitKobo;
            const isAlert = pct >= budget.alertAt;
            return (
              <Card key={budget.id} className={isOver ? "border-red-200" : isAlert ? "border-yellow-200" : ""}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{CATEGORY_EMOJIS[budget.category] ?? "📦"}</span>
                      <div>
                        <div className="font-medium capitalize">{budget.category}</div>
                        <div className="text-xs text-muted-foreground">{budget.period}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isAlert && !isOver && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                      {isOver && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setEditBudget({ id: budget.id, limitKobo: budget.limitKobo, alertAt: budget.alertAt })}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteId(budget.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className={isOver ? "text-red-600 font-medium" : ""}>
                        ₦{(budget.spentKobo / 100).toLocaleString()} spent
                      </span>
                      <span className="text-muted-foreground">
                        of ₦{(budget.limitKobo / 100).toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOver ? "bg-red-500" : isAlert ? "bg-yellow-500" : CATEGORY_COLORS[budget.category] ?? "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{pct}% used</span>
                      <span>Alert at {budget.alertAt}%</span>
                    </div>
                  </div>

                  {budget.resetAt && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Resets {new Date(budget.resetAt).toLocaleDateString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Budget</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v: typeof form.category) => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_EMOJIS).map(([k, e]) => (
                    <SelectItem key={k} value={k}>{e} {k.charAt(0).toUpperCase() + k.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Budget Limit (₦)</Label>
              <Input
                type="number"
                min={100}
                value={form.limitKobo / 100}
                onChange={e => setForm(f => ({ ...f, limitKobo: Math.round(parseFloat(e.target.value) * 100) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={form.period} onValueChange={(v: typeof form.period) => setForm(f => ({ ...f, period: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Alert at {form.alertAt}% of budget</Label>
              <Slider min={50} max={100} step={5} value={[form.alertAt]}
                onValueChange={([v]) => setForm(f => ({ ...f, alertAt: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editBudget} onOpenChange={() => setEditBudget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Budget</DialogTitle></DialogHeader>
          {editBudget && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Budget Limit (₦)</Label>
                <Input
                  type="number"
                  min={100}
                  value={editBudget.limitKobo / 100}
                  onChange={e => setEditBudget(b => b ? { ...b, limitKobo: Math.round(parseFloat(e.target.value) * 100) } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Alert at {editBudget.alertAt}%</Label>
                <Slider min={50} max={100} step={5} value={[editBudget.alertAt]}
                  onValueChange={([v]) => setEditBudget(b => b ? { ...b, alertAt: v } : null)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBudget(null)}>Cancel</Button>
            <Button onClick={() => editBudget && updateMutation.mutate(editBudget)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Budget</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This budget will be deactivated. Your spending history is preserved.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing..." : "Remove Budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
