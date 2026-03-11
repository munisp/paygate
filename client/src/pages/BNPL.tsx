import { useState } from "react";
import {
  CreditCard, TrendingUp, Users, DollarSign, Clock, CheckCircle2,
  XCircle, AlertTriangle, ChevronDown, ChevronRight, Plus, Settings2,
  Calendar, BarChart3, ArrowUpRight, Filter, Search, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

// --- Mock data ---
const PLANS = [
  { id: "plan_1", name: "Pay in 3", instalments: 3, frequency: "monthly", interestRate: 0, minAmount: 5000, maxAmount: 500000, currency: "NGN", active: true, merchants: 142, volume: 12400000 },
  { id: "plan_2", name: "Pay in 6", instalments: 6, frequency: "monthly", interestRate: 2.5, minAmount: 20000, maxAmount: 2000000, currency: "NGN", active: true, merchants: 89, volume: 8700000 },
  { id: "plan_3", name: "Pay in 12", instalments: 12, frequency: "monthly", interestRate: 5.0, minAmount: 50000, maxAmount: 5000000, currency: "NGN", active: true, merchants: 54, volume: 15200000 },
  { id: "plan_4", name: "Flex Pay", instalments: 4, frequency: "weekly", interestRate: 1.5, minAmount: 2000, maxAmount: 100000, currency: "NGN", active: false, merchants: 0, volume: 0 },
];

const LOANS = Array.from({ length: 15 }, (_, i) => {
  const plan = PLANS[i % 3];
  const total = Math.floor(Math.random() * 400000) + 50000;
  const paid = Math.floor(Math.random() * plan.instalments);
  const status = paid === plan.instalments ? "completed" : paid === 0 ? "active" : Math.random() > 0.85 ? "overdue" : "active";
  return {
    id: `loan_${Math.random().toString(36).slice(2, 8)}`,
    customer: `Customer ${i + 1}`,
    email: `customer${i + 1}@example.com`,
    plan: plan.name,
    instalments: plan.instalments,
    total,
    paid,
    remaining: plan.instalments - paid,
    nextDue: new Date(Date.now() + (Math.random() * 30 - 5) * 86400000).toLocaleDateString(),
    amountPerInstalment: Math.round(total / plan.instalments),
    status,
    startDate: new Date(Date.now() - paid * 30 * 86400000).toLocaleDateString(),
  };
});

const MONTHLY_DATA = [
  { month: "Oct", disbursed: 8200000, repaid: 5100000, defaults: 120000 },
  { month: "Nov", disbursed: 9800000, repaid: 6400000, defaults: 98000 },
  { month: "Dec", disbursed: 14200000, repaid: 9800000, defaults: 145000 },
  { month: "Jan", disbursed: 11600000, repaid: 8200000, defaults: 87000 },
  { month: "Feb", disbursed: 13400000, repaid: 10100000, defaults: 112000 },
  { month: "Mar", disbursed: 16800000, repaid: 12400000, defaults: 95000 },
];

const PLAN_SPLIT = [
  { name: "Pay in 3", value: 34, color: "#3b82f6" },
  { name: "Pay in 6", value: 24, color: "#8b5cf6" },
  { name: "Pay in 12", value: 42, color: "#f59e0b" },
];

const STATUS_STYLES = {
  active: { bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700", icon: <Clock className="w-3.5 h-3.5 text-blue-600" /> },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> },
  overdue: { bg: "bg-red-50", text: "text-red-700", badge: "bg-red-100 text-red-700", icon: <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> },
};

function fmt(n: number) { return (n / 1000000).toFixed(1) + "M"; }

export default function BNPL() {
  const [tab, setTab] = useState<"overview" | "loans" | "plans">("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "overdue" | "completed">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [plans, setPlans] = useState(PLANS);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: "", instalments: 3, interestRate: 0, minAmount: 5000, maxAmount: 500000 });

  const filteredLoans = LOANS.filter(l => {
    const matchSearch = l.customer.toLowerCase().includes(search.toLowerCase()) || l.email.toLowerCase().includes(search.toLowerCase()) || l.id.includes(search);
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalDisbursed = LOANS.reduce((s, l) => s + l.total, 0);
  const totalRepaid = LOANS.reduce((s, l) => s + l.paid * l.amountPerInstalment, 0);
  const overdueCount = LOANS.filter(l => l.status === "overdue").length;
  const defaultRate = ((overdueCount / LOANS.length) * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Buy Now, Pay Later</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage instalment plans, active loans, and repayment schedules</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
          <Button size="sm" onClick={() => { setTab("plans"); setShowNewPlan(true); }}>
            <Plus className="w-4 h-4 mr-2" />New Plan
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Disbursed", value: "₦" + fmt(totalDisbursed), sub: "All time", icon: DollarSign, cls: "text-primary" },
          { label: "Total Repaid", value: "₦" + fmt(totalRepaid), sub: `${((totalRepaid / totalDisbursed) * 100).toFixed(0)}% recovery rate`, icon: TrendingUp, cls: "text-emerald-600" },
          { label: "Active Loans", value: LOANS.filter(l => l.status === "active").length, sub: "Currently running", icon: Users, cls: "text-blue-600" },
          { label: "Default Rate", value: defaultRate + "%", sub: `${overdueCount} overdue loans`, icon: AlertTriangle, cls: overdueCount > 2 ? "text-red-600" : "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.cls}`} />
            </div>
            <p className={`text-2xl font-bold ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
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
              {(["all", "active", "overdue", "completed"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredLoans.map(loan => {
              const s = STATUS_STYLES[loan.status as keyof typeof STATUS_STYLES];
              const progress = (loan.paid / loan.instalments) * 100;
              const isExp = expanded === loan.id;
              return (
                <div key={loan.id} className={`rounded-xl border transition-all ${isExp ? `${s.bg} border-current` : "bg-card border-border"}`}>
                  <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setExpanded(isExp ? null : loan.id)}>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
                      <div>
                        <p className="text-sm font-semibold">{loan.customer}</p>
                        <p className="text-xs text-muted-foreground font-mono">{loan.id}</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground">Plan</p>
                        <p className="text-sm font-medium">{loan.plan}</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground">Progress</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs font-mono">{loan.paid}/{loan.instalments}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-sm font-semibold amount">₦{loan.total.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${s.badge}`}>
                          {s.icon}{loan.status}
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
                          { label: "Email", value: loan.email },
                          { label: "Start Date", value: loan.startDate },
                          { label: "Next Due", value: loan.nextDue },
                          { label: "Per Instalment", value: "₦" + loan.amountPerInstalment.toLocaleString() },
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
                          {Array.from({ length: loan.instalments }, (_, i) => (
                            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${i < loan.paid ? "bg-emerald-100 text-emerald-700" : i === loan.paid && loan.status === "overdue" ? "bg-red-100 text-red-700" : i === loan.paid ? "bg-blue-100 text-blue-700 ring-2 ring-blue-400" : "bg-muted text-muted-foreground"}`}>
                              {i + 1}
                            </div>
                          ))}
                        </div>
                      </div>
                      {loan.status === "overdue" && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => toast.success("Payment reminder sent!")}>Send Reminder</Button>
                          <Button size="sm" variant="outline" onClick={() => toast.success("Loan restructured")}>Restructure Loan</Button>
                          <Button size="sm" variant="destructive" onClick={() => toast.error("Loan flagged for collections")}>Flag for Collections</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
                  setPlans(p => [...p, { id: `plan_${p.length + 1}`, ...newPlan, frequency: "monthly", currency: "NGN", active: true, merchants: 0, volume: 0 }]);
                  setShowNewPlan(false);
                  toast.success("Plan created!");
                }}>Create Plan</Button>
                <Button size="sm" variant="outline" onClick={() => setShowNewPlan(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans.map(plan => (
              <div key={plan.id} className={`bg-card rounded-xl border p-5 space-y-4 transition-all ${plan.active ? "border-border" : "border-border/50 opacity-60"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-lg" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{plan.name}</p>
                      <Badge className={`text-xs border-0 ${plan.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {plan.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{plan.instalments} {plan.frequency} instalments · {plan.interestRate === 0 ? "0% interest" : plan.interestRate + "% interest"}</p>
                  </div>
                  <button onClick={() => { setPlans(p => p.map(pl => pl.id === plan.id ? { ...pl, active: !pl.active } : pl)); toast.success(plan.active ? "Plan deactivated" : "Plan activated"); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${plan.active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}>
                    {plan.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Min Amount", value: "₦" + plan.minAmount.toLocaleString() },
                    { label: "Max Amount", value: "₦" + plan.maxAmount.toLocaleString() },
                    { label: "Merchants Using", value: plan.merchants },
                  ].map(f => (
                    <div key={f.label} className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">{f.label}</p>
                      <p className="text-sm font-semibold mt-0.5 amount">{f.value}</p>
                    </div>
                  ))}
                </div>
                {plan.volume > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                    <span>₦{fmt(plan.volume)} total volume processed</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
