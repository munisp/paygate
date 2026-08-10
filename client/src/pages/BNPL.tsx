// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  CreditCard, TrendingUp, Users, DollarSign, Clock, CheckCircle2,
  XCircle, AlertTriangle, ChevronDown, ChevronRight, Plus, Settings2,
  Calendar, BarChart3, ArrowUpRight, Filter, Search, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

// --- Static reference data (not from DB) ---
// MONTHLY_DATA is now fetched from bnpl.monthlyStats

// PLAN_SPLIT is now fetched from bnpl.monthlyStats

const STATUS_STYLES: Record<string, { bg: string; text: string; badge: string; icon: React.ReactNode }> = {
  active: { bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700", icon: <Clock className="w-3.5 h-3.5 text-blue-600" /> },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> },
  overdue: { bg: "bg-red-50", text: "text-red-700", badge: "bg-red-100 text-red-700", icon: <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> },
  defaulted: { bg: "bg-red-50", text: "text-red-700", badge: "bg-red-100 text-red-700", icon: <XCircle className="w-3.5 h-3.5 text-red-600" /> },
};

function fmt(n: number) { return (n / 1000000).toFixed(1) + "M"; }

export default function BNPL() {
  const [tab, setTab] = useState<"overview" | "loans" | "plans">("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "overdue" | "completed" | "defaulted">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [restructureOpen, setRestructureOpen] = useState<string | null>(null);
  const [restructureMonths, setRestructureMonths] = useState(6);
  const [restructureReason, setRestructureReason] = useState("");
  const restructureMutation = trpc.bnpl.restructureLoan.useMutation({
    onSuccess: (data) => {
      toast.success(`Loan restructured — new instalment: ₦${(data.newMonthlyInstalment / 100).toLocaleString()}/month for ${restructureMonths} months`);
      setRestructureOpen(null);
      setRestructureReason("");
      refetchLoans();
    },
    onError: (err) => toast.error(`Restructure failed: ${err.message}`),
  });
  const [newPlan, setNewPlan] = useState({ name: "", instalments: 3, interestRate: 0, minAmount: 5000, maxAmount: 500000 });

  // Real tRPC data
  const { data: loansData, isLoading: loansLoading, refetch: refetchLoans } = trpc.bnpl.list.useQuery(
    { limit: 50, status: statusFilter === "all" ? undefined : statusFilter },
    { staleTime: 30_000 }
  );
  const { data: monthlyStats } = (trpc.bnpl.monthlyStats.useQuery({ months: 6 }, { staleTime: 30_000 }) as any);
  const monthlyData = monthlyStats?.monthlyData ?? [];
  const planSplit = monthlyStats?.planSplit ?? [];
  const { data: stats, refetch: refetchStats } = trpc.bnpl.stats.useQuery(undefined, { staleTime: 60_000 });
  const { data: plansData, isLoading: plansLoading, refetch: refetchPlans } = trpc.bnpl.listPlans.useQuery(undefined, { staleTime: 60_000 });

  const createPlanMutation = trpc.bnpl.createPlan.useMutation({
    onSuccess: () => { toast.success("Plan created!"); setShowNewPlan(false); refetchPlans(); },
    onError: (e: any) => toast.error(e.message),
  });
  const togglePlanMutation = trpc.bnpl.togglePlan.useMutation({
    onSuccess: (_, vars) => { toast.success(vars.active ? "Plan activated" : "Plan deactivated"); refetchPlans(); },
    onError: (e: any) => toast.error(e.message),
  });
  const sendReminderMutation = trpc.bnpl.sendReminder.useMutation({
    onSuccess: () => toast.success("Payment reminder sent!"),
    onError: (e: any) => toast.error(e.message),
  });

  const loans = loansData?.rows ?? [];
  const plans = plansData ?? [];

  const totalDisbursed = stats?.totalVolume ? Number(stats.totalVolume) : 0;
  const overdueCount = stats?.defaulted ?? 0;
  const defaultRate = stats?.total ? ((overdueCount / Number(stats.total)) * 100).toFixed(1) : "0.0";

  const handleRefresh = () => { refetchLoans(); refetchStats(); refetchPlans(); toast.success("Data refreshed"); };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Buy Now, Pay Later</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage instalment plans, active loans, and repayment schedules</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={handleRefresh}><RefreshCw/>Refresh</Button>
          <Button size="sm" onClick={() => { setTab("plans"); setShowNewPlan(true); }}>
            <Plus className="w-4 h-4 mr-2" />New Plan
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Disbursed", value: totalDisbursed ? "₦" + fmt(totalDisbursed) : "₦0", sub: "All time", icon: DollarSign, cls: "text-primary" },
          { label: "Active Loans", value: stats?.active ?? "—", sub: "Currently running", icon: Users, cls: "text-blue-600" },
          { label: "Total Loans", value: stats?.total ?? "—", sub: "All time", icon: CreditCard, cls: "text-emerald-600" },
          { label: "Overdue / Default", value: overdueCount + " / " + (stats?.defaulted ?? 0), sub: defaultRate + "% default rate", icon: AlertTriangle, cls: overdueCount > 2 ? "text-red-600" : "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.cls}`} />
            </div>
            <p className={`text-2xl font-bold ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{String(s.value)}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {(["overview", "loans", "plans"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "overview" ? "Overview" : t === "loans" ? "Active Loans" : "Instalment Plans"}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Disbursement vs Repayment (NGN)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={MONTHLY_DATA}>
                <defs>
                  <linearGradient id="disbGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="repaidGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => "₦" + (v / 1000000).toFixed(0) + "M"} />
                <Tooltip formatter={(v: number) => ["₦" + v.toLocaleString()]} />
                <Area type="monotone" dataKey="disbursed" name="Disbursed" stroke="#3b82f6" fill="url(#disbGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="repaid" name="Repaid" stroke="#10b981" fill="url(#repaidGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Volume by Plan</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={PLAN_SPLIT} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {PLAN_SPLIT.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [v + "%"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {PLAN_SPLIT.map(p => (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                    <span className="text-muted-foreground">{p.name}</span>
                  </div>
                  <span className="font-semibold">{p.value}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-3 bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Monthly Defaults (NGN)</h3>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={MONTHLY_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => "₦" + (v / 1000).toFixed(0) + "K"} />
                <Tooltip formatter={(v: number) => ["₦" + v.toLocaleString()]} />
                <Bar dataKey="defaults" name="Defaults" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Loans Tab */}
      {tab === "loans" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search loans..." className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-2">
              {(["all", "active", "overdue", "completed", "defaulted"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loansLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : loans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No loans found</p>
              <p className="text-sm mt-1">Loans will appear here once customers apply for BNPL</p>
            </div>
          ) : (
            <div className="space-y-2">
              {loans.map(loan => {
                const status = loan.status as string;
                const s = STATUS_STYLES[status] ?? STATUS_STYLES.active;
                const paid = 0; // paidInstallments not tracked in schema
                const total = Number(loan.installments ?? 1);
                const progress = (paid / total) * 100;
                const isExp = expanded === loan.id;
                return (
                  <div key={loan.id} className={`rounded-xl border transition-all ${isExp ? `${s.bg} border-current` : "bg-card border-border"}`}>
                    <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setExpanded(isExp ? null : loan.id)}>
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
                        <div>
                          <p className="text-sm font-semibold">{loan.customerName ?? loan.customerEmail ?? "—"}</p>
                          <p className="text-xs text-muted-foreground font-mono">{loan.id.slice(0, 12)}</p>
                        </div>
                        <div className="hidden md:block">
                          <p className="text-xs text-muted-foreground">Plan</p>
                          <p className="text-sm font-medium">{loan.installments}x instalments</p>
                        </div>
                        <div className="hidden md:block">
                          <p className="text-xs text-muted-foreground">Progress</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                            </div>
                            <span className="text-xs font-mono">{paid}/{total}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Principal</p>
                          <p className="text-sm font-semibold amount">₦{Number(loan.principalAmount).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${s.badge}`}>
                            {s.icon}{status}
                          </span>
                        </div>
                      </div>
                      {isExp ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    </div>

                    {isExp && (
                      <div className="px-4 pb-4 space-y-4">
                        <div className="h-px bg-border" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { label: "Email", value: loan.customerEmail ?? "—" },
                            { label: "Start Date", value: new Date(loan.createdAt).toLocaleDateString() },
                            { label: "Currency", value: loan.currency },
                            { label: "Per Instalment", value: "₦" + Math.round(Number(loan.principalAmount) / total).toLocaleString() },
                          ].map(f => (
                            <div key={f.label}>
                              <p className="text-xs text-muted-foreground">{f.label}</p>
                              <p className="text-sm font-medium">{f.value}</p>
                            </div>
                          ))}
                        </div>
                        {/* Instalment timeline */}
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Instalment Timeline</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {Array.from({ length: total }, (_, i) => (
                              <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${i < paid ? "bg-emerald-100 text-emerald-700" : i === paid && status === "overdue" ? "bg-red-100 text-red-700" : i === paid ? "bg-blue-100 text-blue-700 ring-2 ring-blue-400" : "bg-muted text-muted-foreground"}`}>
                                {i + 1}
                              </div>
                            ))}
                          </div>
                        </div>
                        {(status === "overdue" || status === "defaulted") && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => sendReminderMutation.mutate({ loanId: loan.id })} disabled={sendReminderMutation.isPending}>
                              Send Reminder
                            </Button>
                            <Dialog open={restructureOpen === loan.id} onOpenChange={(o) => { setRestructureOpen(o ? loan.id : null); }}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline">Restructure Loan</Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Restructure Loan {loan.id}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-2">
                                  <div>
                                    <Label className="text-sm">New Tenure (months)</Label>
                                    <Input type="number" min={1} max={60} value={restructureMonths} onChange={(e) => setRestructureMonths(Number(e.target.value))} className="mt-1" />
                                  </div>
                                  <div>
                                    <Label className="text-sm">Reason for Restructuring</Label>
                                    <Input value={restructureReason} onChange={(e) => setRestructureReason(e.target.value)} placeholder="e.g. Customer financial hardship" className="mt-1" />
                                  </div>
                                  <Button className="w-full" onClick={() => restructureMutation.mutate({ loanId: loan.id, newTenureMonths: restructureMonths, reason: restructureReason })} disabled={restructureMutation.isPending || restructureReason.length < 5}>
                                    {restructureMutation.isPending ? "Restructuring…" : "Confirm Restructure"}
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button size="sm" variant="destructive" onClick={() => toast.warning("Loan flagged for collections")}>Flag for Collections</Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Plans Tab */}
      {tab === "plans" && (
        <div className="space-y-4">
          {showNewPlan && (
            <div className="bg-card rounded-xl border border-border p-5 space-y-4">
              <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Create New Instalment Plan</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Plan Name", key: "name", type: "text", placeholder: "e.g. Pay in 4" },
                  { label: "Number of Instalments", key: "instalments", type: "number", placeholder: "4" },
                  { label: "Interest Rate (%)", key: "interestRate", type: "number", placeholder: "0" },
                  { label: "Min Amount (NGN)", key: "minAmount", type: "number", placeholder: "5000" },
                  { label: "Max Amount (NGN)", key: "maxAmount", type: "number", placeholder: "500000" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-sm font-medium">{f.label}</label>
                    <input type={f.type} placeholder={f.placeholder} value={(newPlan as any)[f.key]} onChange={e => setNewPlan(p => ({ ...p, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value }))} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button size="sm" onClick={() => {
                  if (!newPlan.name) { toast.error("Enter a plan name"); return; }
                  createPlanMutation.mutate({ ...newPlan, currency: "NGN" });
                }} disabled={createPlanMutation.isPending}>
                  {createPlanMutation.isPending ? "Creating…" : "Create Plan"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowNewPlan(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2].map(i => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No instalment plans yet</p>
              <Button size="sm" className="mt-3" onClick={() => setShowNewPlan(true)}>Create First Plan</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((plan: any) => (
                <div key={plan.id} className={`bg-card rounded-xl border p-5 space-y-4 transition-all ${plan.active ? "border-border" : "border-border/50 opacity-60"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-lg" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{plan.name}</p>
                        <Badge className={`text-xs border-0 ${plan.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                          {plan.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{plan.installments} monthly instalments · {plan.interestRate === 0 ? "0% interest" : plan.interestRate + "% interest"}</p>
                    </div>
                    <button
                      onClick={() => togglePlanMutation.mutate({ planId: plan.id, active: !plan.active })}
                      disabled={togglePlanMutation.isPending}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${plan.active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
                    >
                      {plan.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Min Amount", value: "₦" + Number(plan.minAmount).toLocaleString() },
                      { label: "Max Amount", value: "₦" + Number(plan.maxAmount).toLocaleString() },
                      { label: "Currency", value: plan.currency },
                    ].map(f => (
                      <div key={f.label} className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">{f.label}</p>
                        <p className="text-sm font-semibold mt-0.5 amount">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
