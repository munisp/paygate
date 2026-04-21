import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Plus, Pause, Play, Trash2, Clock, TrendingUp, Coins, Leaf } from "lucide-react";

const ASSET_ICONS: Record<string, any> = {
  gold: Coins,
  mutual_fund: TrendingUp,
  pension: Leaf,
};

const ASSET_LABELS: Record<string, string> = {
  gold: "Digital Gold",
  mutual_fund: "Mutual Fund",
  pension: "Pension / NPS",
};

const FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export default function ConsumerSIPScheduler() {
  const { data, refetch, isLoading } = trpc.sip.list.useQuery();
  const { data: summary } = trpc.sip.summary.useQuery();
  const [open, setOpen] = useState(false);
  const [historyPlanId, setHistoryPlanId] = useState<string | null>(null);
  const [form, setForm] = useState({
    assetType: "gold" as "gold" | "mutual_fund" | "pension",
    amountKobo: "",
    frequency: "monthly" as "daily" | "weekly" | "monthly",
    notes: "",
  });

  const createMutation = trpc.sip.create.useMutation({
    onSuccess: (d) => {
      toast.success(`SIP plan created! Next execution: ${new Date(d.nextExecutionAt).toLocaleDateString()}`);
      setOpen(false);
      setForm({ assetType: "gold", amountKobo: "", frequency: "monthly", notes: "" });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.sip.update.useMutation({
    onSuccess: () => { toast.success("SIP plan updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const cancelMutation = trpc.sip.cancel.useMutation({
    onSuccess: () => { toast.success("SIP plan cancelled"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const { data: historyData } = trpc.sip.getHistory.useQuery(
    { planId: historyPlanId!, limit: 10 },
    { enabled: !!historyPlanId }
  );

  const plans = (data as any)?.plans ?? [];

  const handleCreate = () => {
    const amount = parseFloat(form.amountKobo);
    if (isNaN(amount) || amount < 1000) {
      toast.error("Minimum investment is ₦1,000");
      return;
    }
    createMutation.mutate({
      assetType: form.assetType,
      amountKobo: Math.round(amount * 100),
      frequency: form.frequency,
      notes: form.notes || undefined,
    });
  };

  const toggleStatus = (plan: any) => {
    updateMutation.mutate({
      planId: plan.id,
      status: plan.status === "active" ? "paused" : "active",
    });
  };

  return (
    <div className="p-4 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-green-500" /> SIP Scheduler
        </h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> New SIP Plan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Recurring Investment Plan</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Asset Type</Label>
                <Select value={form.assetType} onValueChange={(v: any) => setForm(f => ({ ...f, assetType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gold">Digital Gold</SelectItem>
                    <SelectItem value="mutual_fund">Mutual Fund</SelectItem>
                    <SelectItem value="pension">Pension / NPS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (₦)</Label>
                <Input
                  type="number"
                  min="1000"
                  placeholder="e.g. 5000"
                  value={form.amountKobo}
                  onChange={e => setForm(f => ({ ...f, amountKobo: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Minimum ₦1,000 per investment</p>
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v: any) => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input
                  placeholder="e.g. Retirement fund"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create SIP Plan"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{(summary as any).activePlans}</div>
              <div className="text-xs text-muted-foreground">Active Plans</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{(summary as any).totalPlans}</div>
              <div className="text-xs text-muted-foreground">Total Plans</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-blue-600">{formatNaira((summary as any).totalInvestedKobo ?? 0)}</div>
              <div className="text-xs text-muted-foreground">Total Invested</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Plans List */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading plans...</div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No SIP plans yet</p>
            <p className="text-sm mt-1">Create your first recurring investment plan to start building wealth automatically.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan: any) => {
            const Icon = ASSET_ICONS[plan.asset_type] ?? TrendingUp;
            return (
              <Card key={plan.id} className={plan.status === "cancelled" ? "opacity-50" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <div className="font-medium">{ASSET_LABELS[plan.asset_type] ?? plan.asset_type}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatNaira(plan.amount_kobo)} · {FREQ_LABELS[plan.frequency] ?? plan.frequency}
                        </div>
                        {plan.notes && <div className="text-xs text-muted-foreground mt-0.5">{plan.notes}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={plan.status === "active" ? "default" : plan.status === "paused" ? "secondary" : "outline"}>
                        {plan.status}
                      </Badge>
                      {plan.status !== "cancelled" && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => toggleStatus(plan)}
                            title={plan.status === "active" ? "Pause" : "Resume"}
                          >
                            {plan.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => {
                              if (confirm("Cancel this SIP plan?")) cancelMutation.mutate({ planId: plan.id });
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Next: {plan.next_execution_at ? new Date(plan.next_execution_at).toLocaleDateString() : "—"}
                    </span>
                    <span>{plan.execution_count} executions · {formatNaira(plan.total_invested_kobo ?? 0)} total</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setHistoryPlanId(historyPlanId === plan.id ? null : plan.id)}
                    >
                      {historyPlanId === plan.id ? "Hide history" : "View history"}
                    </Button>
                  </div>

                  {/* Execution History */}
                  {historyPlanId === plan.id && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-medium mb-2">Execution History</p>
                      {(historyData as any)?.executions?.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No executions yet</p>
                      ) : (
                        <div className="space-y-1">
                          {((historyData as any)?.executions ?? []).map((exec: any) => (
                            <div key={exec.id} className="flex items-center justify-between text-xs">
                              <span className={exec.status === "completed" ? "text-green-600" : "text-red-500"}>
                                {exec.status === "completed" ? "✓" : "✗"} {formatNaira(exec.amount_kobo)}
                              </span>
                              <span className="text-muted-foreground">
                                {new Date(exec.executed_at).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
