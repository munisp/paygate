import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Target, Trash2, Edit, PiggyBank, CheckCircle } from "lucide-react";
import { format } from "date-fns";

const GOAL_EMOJIS = ["🎯", "🏠", "✈️", "🚗", "📱", "💍", "🎓", "💰", "🏖️", "🎮"];

export default function ConsumerSavingsGoals() {
  const [showCreate, setShowCreate] = useState(false);
  const [depositGoalId, setDepositGoalId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", description: "", targetKobo: 100000,
    emoji: "🎯", autoSaveEnabled: false,
    autoSaveAmountKobo: 0, autoSaveFrequency: "monthly" as const,
    targetDate: "",
  });

  const utils = trpc.useUtils();
  const { data: goals, isLoading } = trpc.wave24.savingsGoals.list.useQuery();

  const createMutation = trpc.wave24.savingsGoals.create.useMutation({
    onSuccess: () => {
      toast.success("Savings goal created!");
      utils.wave24.savingsGoals.list.invalidate();
      setShowCreate(false);
      setForm({ name: "", description: "", targetKobo: 100000, emoji: "🎯", autoSaveEnabled: false, autoSaveAmountKobo: 0, autoSaveFrequency: "monthly", targetDate: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const depositMutation = trpc.wave24.savingsGoals.deposit.useMutation({
    onSuccess: (result) => {
      if (result.status === "completed") {
        toast.success("🎉 Goal completed! Congratulations!");
      } else {
        toast.success("Deposit added to savings goal");
      }
      utils.wave24.savingsGoals.list.invalidate();
      setDepositGoalId(null);
      setDepositAmount("");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.wave24.savingsGoals.update.useMutation({
    onSuccess: () => { toast.success("Goal updated"); utils.wave24.savingsGoals.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.wave24.savingsGoals.delete.useMutation({
    onSuccess: () => {
      toast.success("Goal deleted");
      utils.wave24.savingsGoals.list.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const activeGoals = (goals ?? []).filter(g => g.status === "active");
  const completedGoals = (goals ?? []).filter(g => g.status === "completed");
  const totalSaved = (goals ?? []).reduce((s, g) => s + g.savedKobo, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Savings Goals</h2>
          <p className="text-muted-foreground text-sm">Save towards your dreams, one deposit at a time</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />New Goal
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xl font-bold">₦{(totalSaved / 100).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Saved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xl font-bold text-blue-600">{activeGoals.length}</div>
            <div className="text-xs text-muted-foreground">Active Goals</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xl font-bold text-green-600">{completedGoals.length}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
      </div>

      {/* Goals */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading goals...</div>
      ) : !goals || goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No savings goals yet</p>
            <p className="text-sm text-muted-foreground mt-1">Start saving towards something meaningful</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />Create First Goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {goals.map(goal => {
            const pct = Math.min(100, Math.round((goal.savedKobo / goal.targetKobo) * 100));
            const remaining = Math.max(0, goal.targetKobo - goal.savedKobo);
            return (
              <Card key={goal.id} className={goal.status === "completed" ? "border-green-200 bg-green-50/30" : ""}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{goal.emoji ?? "🎯"}</span>
                      <div>
                        <div className="font-medium">{goal.name}</div>
                        {goal.description && <div className="text-xs text-muted-foreground">{goal.description}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {goal.status === "completed" && <CheckCircle className="w-4 h-4 text-green-600" />}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        aria-label="Delete" onClick={() => setDeleteId(goal.id)}><Trash2/>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">₦{(goal.savedKobo / 100).toLocaleString()}</span>
                      <span className="text-muted-foreground">₦{(goal.targetKobo / 100).toLocaleString()}</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{pct}% complete</span>
                      {goal.status !== "completed" && <span>₦{(remaining / 100).toLocaleString()} to go</span>}
                    </div>
                  </div>

                  {goal.targetDate && (
                    <div className="text-xs text-muted-foreground mb-3">
                      Target: {format(new Date(goal.targetDate), "MMM d, yyyy")}
                    </div>
                  )}

                  {goal.status === "active" && (
                    <Button size="sm" className="w-full" variant="outline"
                      onClick={() => setDepositGoalId(goal.id)}>
                      <PiggyBank className="w-3.5 h-3.5 mr-2" />Add Deposit
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Savings Goal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Goal Name *</Label>
              <Input placeholder="e.g. New iPhone, Holiday Trip" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="What are you saving for?" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Target Amount (₦)</Label>
                <Input type="number" min={100} value={form.targetKobo / 100}
                  onChange={e => setForm(f => ({ ...f, targetKobo: Math.round(parseFloat(e.target.value) * 100) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Target Date</Label>
                <Input type="date" value={form.targetDate}
                  onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Emoji</Label>
              <div className="flex flex-wrap gap-2">
                {GOAL_EMOJIS.map(e => (
                  <button
                    key={e}
                    className={`text-xl p-1.5 rounded-lg border-2 transition-colors ${form.emoji === e ? "border-primary bg-primary/10" : "border-transparent hover:border-muted"}`}
                    onClick={() => setForm(f => ({ ...f, emoji: e }))}
                  >{e}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.autoSaveEnabled} onCheckedChange={v => setForm(f => ({ ...f, autoSaveEnabled: v }))} />
              <Label>Enable auto-save</Label>
            </div>
            {form.autoSaveEnabled && (
              <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                <div className="space-y-1.5">
                  <Label>Auto-save Amount (₦)</Label>
                  <Input type="number" min={0} value={form.autoSaveAmountKobo / 100}
                    onChange={e => setForm(f => ({ ...f, autoSaveAmountKobo: Math.round(parseFloat(e.target.value) * 100) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Frequency</Label>
                  <Select value={form.autoSaveFrequency} onValueChange={(v: typeof form.autoSaveFrequency) => setForm(f => ({ ...f, autoSaveFrequency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({
              ...form,
              targetDate: form.targetDate ? new Date(form.targetDate).toISOString() : undefined,
            })} disabled={!form.name || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deposit Dialog */}
      <Dialog open={!!depositGoalId} onOpenChange={() => setDepositGoalId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Deposit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Amount (₦)</Label>
            <Input type="number" min={1} placeholder="0.00" value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositGoalId(null)}>Cancel</Button>
            <Button
              onClick={() => depositGoalId && depositMutation.mutate({
                id: depositGoalId,
                amountKobo: Math.round(parseFloat(depositAmount) * 100),
              })}
              disabled={!depositAmount || parseFloat(depositAmount) <= 0 || depositMutation.isPending}
            >
              {depositMutation.isPending ? "Saving..." : "Add ₦" + (parseFloat(depositAmount || "0")).toLocaleString()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Goal</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This savings goal will be permanently deleted. Any saved amount will be returned to your wallet.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
