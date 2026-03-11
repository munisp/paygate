import { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowLeftRight, Users,
  CreditCard, ArrowUpRight, ArrowDownRight, RefreshCw, Download,
  CheckCircle2, Clock, XCircle, Zap, Globe, Shield
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// --- Mock Data ---
const revenueData = [
  { month: "Aug", revenue: 4200000, transactions: 8400 },
  { month: "Sep", revenue: 5800000, transactions: 11200 },
  { month: "Oct", revenue: 5100000, transactions: 9800 },
  { month: "Nov", revenue: 7200000, transactions: 14100 },
  { month: "Dec", revenue: 8900000, transactions: 17300 },
  { month: "Jan", revenue: 7600000, transactions: 14800 },
  { month: "Feb", revenue: 9400000, transactions: 18200 },
  { month: "Mar", revenue: 11200000, transactions: 21600 },
];

const channelData = [
  { name: "Card", value: 42, color: "#4F46E5" },
  { name: "Mobile Money", value: 31, color: "#10B981" },
  { name: "Bank Transfer", value: 18, color: "#F59E0B" },
  { name: "USSD", value: 9, color: "#6366F1" },
];

const recentTransactions = [
  { id: "TXN-001", customer: "Adaeze Okonkwo", amount: 125000, currency: "NGN", status: "success", method: "Card", time: "2 min ago", country: "🇳🇬" },
  { id: "TXN-002", customer: "Kwame Asante", amount: 450, currency: "GHS", status: "success", method: "Mobile Money", time: "5 min ago", country: "🇬🇭" },
  { id: "TXN-003", customer: "Fatima Al-Rashid", amount: 8500, currency: "KES", status: "pending", method: "M-Pesa", time: "8 min ago", country: "🇰🇪" },
  { id: "TXN-004", customer: "Sipho Dlamini", amount: 1200, currency: "ZAR", status: "success", method: "Card", time: "12 min ago", country: "🇿🇦" },
  { id: "TXN-005", customer: "Amara Diallo", amount: 75000, currency: "XOF", status: "failed", method: "Bank Transfer", time: "18 min ago", country: "🇸🇳" },
  { id: "TXN-006", customer: "Chidi Eze", amount: 250000, currency: "NGN", status: "success", method: "USSD", time: "22 min ago", country: "🇳🇬" },
  { id: "TXN-007", customer: "Naledi Mokoena", amount: 3400, currency: "ZAR", status: "success", method: "Card", time: "31 min ago", country: "🇿🇦" },
];

const formatCurrency = (val: number) => {
  if (val >= 1000000) return `₦${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `₦${(val / 1000).toFixed(0)}K`;
  return `₦${val}`;
};

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = {
    success: { icon: CheckCircle2, cls: "status-success", label: "Success" },
    pending: { icon: Clock, cls: "status-pending", label: "Pending" },
    failed: { icon: XCircle, cls: "status-failed", label: "Failed" },
  }[status] || { icon: Clock, cls: "status-pending", label: status };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <cfg.icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

// Animated counter hook
function useCounter(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

const KPICard = ({ title, value, change, icon: Icon, prefix = "", suffix = "", color = "primary" }: any) => {
  const animated = useCounter(typeof value === "number" ? value : 0);
  const isPositive = change >= 0;

  const colorMap: Record<string, string> = {
    primary: "bg-indigo-50 text-indigo-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
  };

  return (
    <div className="stat-card group">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-bold mt-1 amount" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            {prefix}{typeof value === "number" ? animated.toLocaleString() : value}{suffix}
          </p>
        </div>
        <div className={`p-2.5 rounded-xl ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {isPositive ? (
          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
        ) : (
          <ArrowDownRight className="w-4 h-4 text-red-500" />
        )}
        <span className={`text-sm font-semibold ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
          {isPositive ? "+" : ""}{change}%
        </span>
        <span className="text-sm text-muted-foreground">vs last month</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "1y">("30d");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
    toast.success("Dashboard refreshed");
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Welcome back, Acme Corp — here's what's happening today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            {(["7d", "30d", "90d", "1y"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  period === p
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue"
          value={11200000}
          change={18.7}
          icon={DollarSign}
          prefix="₦"
          color="primary"
        />
        <KPICard
          title="Transactions"
          value={21600}
          change={12.4}
          icon={ArrowLeftRight}
          color="green"
        />
        <KPICard
          title="Active Customers"
          value={8420}
          change={9.2}
          icon={Users}
          color="blue"
        />
        <KPICard
          title="Success Rate"
          value={97.3}
          change={0.8}
          icon={CreditCard}
          suffix="%"
          color="amber"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="xl:col-span-2 bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Revenue Overview
              </h3>
              <p className="text-sm text-muted-foreground">Monthly revenue and transaction volume</p>
            </div>
            <Badge variant="secondary" className="text-xs">
              <TrendingUp className="w-3 h-3 mr-1 text-emerald-500" />
              +18.7% MoM
            </Badge>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), "Revenue"]}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#4F46E5" strokeWidth={2} fill="url(#revenueGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Channels */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Payment Channels
            </h3>
            <p className="text-sm text-muted-foreground">Distribution by method</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={channelData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                {channelData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`${v}%`, "Share"]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {channelData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
                <span className="text-sm font-semibold text-foreground amount">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Volume Bar Chart + Recent Transactions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Transaction Volume */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Transaction Volume
            </h3>
            <p className="text-sm text-muted-foreground">Monthly count</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
              <Bar dataKey="transactions" fill="#4F46E5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Transactions */}
        <div className="xl:col-span-2 bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Recent Transactions
              </h3>
              <p className="text-sm text-muted-foreground">Live feed — updates every 30s</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-emerald-600 font-medium">Live</span>
            </div>
          </div>

          <div className="space-y-1">
            {recentTransactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center gap-4 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
              >
                <span className="text-lg">{txn.country}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{txn.customer}</p>
                  <p className="text-xs text-muted-foreground">{txn.id} · {txn.method}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold amount text-foreground">
                    {txn.currency} {txn.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{txn.time}</p>
                </div>
                <StatusBadge status={txn.status} />
              </div>
            ))}
          </div>

          <button className="w-full mt-4 py-2 text-sm text-primary font-medium hover:bg-primary/5 rounded-lg transition-colors">
            View all transactions →
          </button>
        </div>
      </div>

      {/* Infrastructure Status */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Platform Health
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "API Gateway", status: "Operational", uptime: "99.99%", icon: Zap, color: "emerald" },
            { label: "Payment Engine", status: "Operational", uptime: "99.97%", icon: CreditCard, color: "emerald" },
            { label: "Fraud Detection", status: "Operational", uptime: "100%", icon: Shield, color: "emerald" },
            { label: "Settlement", status: "Operational", uptime: "99.98%", icon: Globe, color: "emerald" },
          ].map((svc) => (
            <div key={svc.label} className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
              <div className={`p-2 rounded-lg bg-${svc.color}-50`}>
                <svc.icon className={`w-4 h-4 text-${svc.color}-600`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{svc.label}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-muted-foreground">{svc.uptime} uptime</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
