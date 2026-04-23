import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Plus, Pause, Play, Trash2, Target, Coins, Calendar, BarChart3 } from "lucide-react";

const GOLD_PRICE_NGN = 98_500; // per gram
const GOLD_PRICE_USD = 62.5;

interface SIPPlan {
  id: string;
  name: string;
  amountNGN: number;
  frequency: "daily" | "weekly" | "monthly";
  startDate: string;
  status: "active" | "paused" | "completed";
  gramsAccumulated: number;
  totalInvested: number;
  currentValue: number;
  nextDebitDate: string;
}

const mockPlans: SIPPlan[] = [
  {
    id: "sip-001",
    name: "Monthly Gold SIP",
    amountNGN: 50_000,
    frequency: "monthly",
    startDate: "2025-01-01",
    status: "active",
    gramsAccumulated: 4.82,
    totalInvested: 450_000,
    currentValue: 474_870,
    nextDebitDate: "2026-05-01",
  },
  {
    id: "sip-002",
    name: "Weekly Micro-Gold",
    amountNGN: 10_000,
    frequency: "weekly",
    startDate: "2025-06-01",
    status: "active",
    gramsAccumulated: 1.93,
    totalInvested: 190_000,
    currentValue: 190_105,
    nextDebitDate: "2026-04-28",
  },
];

const portfolioHistory = [
  { month: "Nov", value: 380_000 },
  { month: "Dec", value: 412_000 },
  { month: "Jan", value: 445_000 },
  { month: "Feb", value: 458_000 },
  { month: "Mar", value: 471_000 },
  { month: "Apr", value: 664_975 },
];

export default function GoldSIP() {
  const [plans, setPlans] = useState<SIPPlan[]>(mockPlans);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", amountNGN: "", frequency: "monthly" as const });

  const totalInvested = useMemo(() => plans.reduce((s, p) => s + p.totalInvested, 0), [plans]);
  const totalCurrentValue = useMemo(() => plans.reduce((s, p) => s + p.currentValue, 0), [plans]);
  const totalGrams = useMemo(() => plans.reduce((s, p) => s + p.gramsAccumulated, 0), [plans]);
  const totalPnL = totalCurrentValue - totalInvested;
  const pnlPct = totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(2) : "0.00";

  const maxBarValue = Math.max(...portfolioHistory.map((h) => h.value));

  const handleCreate = () => {
    if (!form.name || !form.amountNGN) { toast.error("Fill all fields"); return; }
    const amount = parseInt(form.amountNGN);
    if (amount < 5_000) { toast.error("Minimum SIP amount is ₦5,000"); return; }
    const grams = amount / GOLD_PRICE_NGN;
    const newPlan: SIPPlan = {
      id: `sip-${Date.now()}`,
      name: form.name,
      amountNGN: amount,
      frequency: form.frequency,
      startDate: new Date().toISOString().split("T")[0],
      status: "active",
      gramsAccumulated: grams,
      totalInvested: amount,
      currentValue: amount * 1.01,
      nextDebitDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    };
    setPlans((prev) => [...prev, newPlan]);
    setShowCreate(false);
    setForm({ name: "", amountNGN: "", frequency: "monthly" });
    toast.success(`SIP "${form.name}" created successfully`);
  };

  const toggleStatus = (id: string) => {
    setPlans((prev) => prev.map((p) =>
      p.id === id ? { ...p, status: p.status === "active" ? "paused" : "active" } : p
    ));
    toast.success("SIP status updated");
  };

  const deletePlan = (id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    toast.success("SIP plan deleted");
  };

  const fmtNGN = (v: number) => `₦${v.toLocaleString("en-NG")}`;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Coins className="w-6 h-6 text-yellow-500" /> Gold SIP
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Systematic Investment Plan — accumulate gold automatically
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New SIP Plan
        </Button>
      </div>

      {/* Live Gold Price Banner */}
      <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Coins className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Live Gold Price</p>
            <p className="font-bold text-lg">{fmtNGN(GOLD_PRICE_NGN)}<span className="text-sm font-normal text-muted-foreground"> /gram</span></p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">USD equivalent</p>
          <p className="font-semibold">${GOLD_PRICE_USD}/gram</p>
        </div>
        <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
          <TrendingUp className="w-4 h-4" /> +2.3% today
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Invested</p>
            <p className="text-xl font-bold mt-1">{fmtNGN(totalInvested)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Current Value</p>
            <p className="text-xl font-bold mt-1 text-green-600">{fmtNGN(totalCurrentValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total P&L</p>
            <div className="flex items-center gap-1 mt-1">
              {totalPnL >= 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
              <p className={`text-xl font-bold ${totalPnL >= 0 ? "text-green-600" : "text-red-500"}`}>
                {totalPnL >= 0 ? "+" : ""}{fmtNGN(totalPnL)}
              </p>
            </div>
            <p className={`text-xs ${totalPnL >= 0 ? "text-green-600" : "text-red-500"}`}>{pnlPct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gold Accumulated</p>
            <p className="text-xl font-bold mt-1">{totalGrams.toFixed(3)}g</p>
            <p className="text-xs text-muted-foreground">{(totalGrams / 31.1035).toFixed(4)} troy oz</p>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Growth Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Portfolio Growth (6 months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 h-32">
            {portfolioHistory.map((h) => (
              <div key={h.month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-yellow-500/80 rounded-t-sm transition-all"
                  style={{ height: `${(h.value / maxBarValue) * 100}%` }}
                />
                <span className="text-xs text-muted-foreground">{h.month}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SIP Plans */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Active SIP Plans ({plans.length})</h2>
        <div className="space-y-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={plan.status === "paused" ? "opacity-70" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{plan.name}</h3>
                      <Badge variant={plan.status === "active" ? "default" : "secondary"} className="text-xs capitalize">
                        {plan.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs capitalize">{plan.frequency}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Amount/cycle</p>
                        <p className="font-medium">{fmtNGN(plan.amountNGN)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Accumulated</p>
                        <p className="font-medium">{plan.gramsAccumulated.toFixed(3)}g</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Current Value</p>
                        <p className="font-medium text-green-600">{fmtNGN(plan.currentValue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Next Debit</p>
                        <p className="font-medium flex items-center gap-1">
                          <Calendar className="w-3 h-3" />{plan.nextDebitDate}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(plan.id)}>
                      {plan.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deletePlan(plan.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {plans.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
              <Coins className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No SIP plans yet. Create your first gold investment plan.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create SIP Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Gold SIP Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Plan Name</Label>
              <Input placeholder="e.g. Monthly Gold Savings" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Amount per cycle (₦)</Label>
              <Input type="number" placeholder="Minimum ₦5,000" value={form.amountNGN} onChange={(e) => setForm((f) => ({ ...f, amountNGN: e.target.value }))} />
              {form.amountNGN && parseInt(form.amountNGN) >= 5000 && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {(parseInt(form.amountNGN) / GOLD_PRICE_NGN).toFixed(4)}g gold per cycle
                </p>
              )}
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v: any) => setForm((f) => ({ ...f, frequency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleCreate}>Create SIP</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
