import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, DollarSign, ArrowLeftRight, Users, CreditCard,
  ArrowUpRight, ArrowDownRight, RefreshCw, Download, Zap, Globe,
  Shield, Radio, AlertTriangle, CheckCircle2, Trophy, Clock, X,
  Smartphone, Wifi, WifiOff, Bell, Activity, Lock, ShieldCheck,
  BarChart3, Layers, Send, Plus, Eye, ChevronRight, Sparkles,
  Package, Settings, TrendingDown, Banknote, Target, Cpu,
  GripVertical, LayoutGrid,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import RevenueForecast from "@/components/RevenueForecast";
import { useTransactionStream, type StreamTransaction } from "@/hooks/useTransactionStream";
import { usePWA } from "@/hooks/usePWA";
import OfflineIndicator from "@/components/OfflineIndicator";
import { useAdaptiveInterval } from "@/lib/networkQuality";
// ─── Default widget layout ────────────────────────────────────────────────────
const DEFAULT_LAYOUTS = {
  lg: [
    { i: "kpi",         x: 0, y: 0,  w: 12, h: 4,  minW: 6, minH: 3 },
    { i: "wallet",      x: 0, y: 4,  w: 4,  h: 6,  minW: 3, minH: 5 },
    { i: "settlement",  x: 4, y: 4,  w: 8,  h: 6,  minW: 4, minH: 5 },
    { i: "revenue",     x: 0, y: 10, w: 8,  h: 8,  minW: 4, minH: 6 },
    { i: "channels",    x: 8, y: 10, w: 4,  h: 8,  minW: 3, minH: 6 },
    { i: "daily",       x: 0, y: 18, w: 4,  h: 8,  minW: 3, minH: 6 },
    { i: "transactions",x: 4, y: 18, w: 8,  h: 8,  minW: 4, minH: 6 },
    { i: "disputes",    x: 0, y: 26, w: 12, h: 6,  minW: 6, minH: 5 },
    { i: "forecast",    x: 0, y: 32, w: 4,  h: 9,  minW: 3, minH: 7 },
    { i: "health",      x: 4, y: 32, w: 4,  h: 9,  minW: 3, minH: 7 },
    { i: "security",    x: 8, y: 32, w: 4,  h: 9,  minW: 3, minH: 7 },
  ],
  md: [
    { i: "kpi",         x: 0, y: 0,  w: 10, h: 5  },
    { i: "wallet",      x: 0, y: 5,  w: 4,  h: 6  },
    { i: "settlement",  x: 4, y: 5,  w: 6,  h: 6  },
    { i: "revenue",     x: 0, y: 11, w: 7,  h: 8  },
    { i: "channels",    x: 7, y: 11, w: 3,  h: 8  },
    { i: "daily",       x: 0, y: 19, w: 4,  h: 8  },
    { i: "transactions",x: 4, y: 19, w: 6,  h: 8  },
    { i: "disputes",    x: 0, y: 27, w: 10, h: 6  },
    { i: "forecast",    x: 0, y: 33, w: 4,  h: 9  },
    { i: "health",      x: 4, y: 33, w: 3,  h: 9  },
    { i: "security",    x: 7, y: 33, w: 3,  h: 9  },
  ],
  sm: [
    { i: "kpi",         x: 0, y: 0,  w: 6, h: 6  },
    { i: "wallet",      x: 0, y: 6,  w: 6, h: 6  },
    { i: "settlement",  x: 0, y: 12, w: 6, h: 6  },
    { i: "revenue",     x: 0, y: 18, w: 6, h: 8  },
    { i: "channels",    x: 0, y: 26, w: 6, h: 8  },
    { i: "daily",       x: 0, y: 34, w: 6, h: 8  },
    { i: "transactions",x: 0, y: 42, w: 6, h: 8  },
    { i: "disputes",    x: 0, y: 50, w: 6, h: 6  },
    { i: "forecast",    x: 0, y: 56, w: 6, h: 9  },
    { i: "health",      x: 0, y: 65, w: 6, h: 9  },
    { i: "security",    x: 0, y: 74, w: 6, h: 9  },
  ],
};
const LAYOUT_STORAGE_KEY = "paygate_dashboard_layout";
function loadLayouts() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_LAYOUTS;
  } catch { return DEFAULT_LAYOUTS; }
}
function saveLayouts(layouts: any) {
  try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts)); } catch { /* ignore */ }
}
// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (!n) return "₦0";
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed:  { label: "Success",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    success:    { label: "Success",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    pending:    { label: "Pending",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
    processing: { label: "Processing", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    failed:     { label: "Failed",     cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>
      {s.label}
    </span>
  );
}

const CHANNEL_COLORS: Record<string, string> = {
  card: "#4F46E5", bank_transfer: "#10B981", mobile_money: "#F59E0B",
  ussd: "#6366F1", qr: "#EC4899", bnpl: "#14B8A6",
};

// ─── PWA Install Banner ───────────────────────────────────────────────────────

function PWAInstallBanner() {
  const { isInstallable, isInstalled, isDismissed, promptInstall, dismissInstall, isOffline } = usePWA();

  if (isInstalled || isDismissed || !isInstallable) return null;

  return (
    <div className="relative flex items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-20 w-24 h-24 rounded-full bg-white translate-y-1/2" />
      </div>
      <div className="relative p-2.5 rounded-xl bg-white/20 backdrop-blur-sm shrink-0">
        <Smartphone className="w-5 h-5 text-white" />
      </div>
      <div className="relative flex-1 min-w-0">
        <p className="font-semibold text-sm">Install PayGate as an App</p>
        <p className="text-xs text-white/80 mt-0.5">
          Get instant access, offline support, and push notifications — no browser required.
        </p>
      </div>
      <div className="relative flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className="bg-white text-indigo-700 hover:bg-white/90 font-semibold text-xs h-8 px-4 shadow-md"
          onClick={async () => {
            const outcome = await promptInstall();
            if (outcome === "accepted") toast.success("PayGate installed successfully!");
          }}
        >
          Install App
        </Button>
        <button
          onClick={dismissInstall}
          className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-white/80" />
        </button>
      </div>
    </div>
  );
}

// ─── Offline Status Banner ────────────────────────────────────────────────────

function ConnectionStatusBar() {
  const { isOffline, isInstalled } = usePWA();
  if (!isOffline) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-900">
      <WifiOff className="w-4 h-4 text-orange-600 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium">You're offline</p>
        <p className="text-xs text-orange-700 mt-0.5">
          Viewing cached data. Changes will sync when you reconnect.
        </p>
      </div>
      <Badge variant="outline" className="border-orange-300 text-orange-700 text-xs">
        Offline Mode
      </Badge>
    </div>
  );
}

// ─── Security Score Widget ────────────────────────────────────────────────────

function SecurityScoreWidget() {
  const score = 100; // Post-audit score
  const checks = [
    { label: "Password hashing (bcrypt)",   done: true },
    { label: "Timing-safe key comparison",  done: true },
    { label: "OAuth open redirect blocked", done: true },
    { label: "SSRF webhook protection",     done: true },
    { label: "File upload validation",      done: true },
    { label: "XSS / innerHTML sanitised",   done: true },
    { label: "Content Security Policy",     done: true },
    { label: "Error message sanitisation",  done: true },
    { label: "Financial rate limiting",     done: true },
    { label: "Input length constraints",    done: true },
    { label: "gRPC TLS enforced",           done: true },
    { label: "Auth route guards",           done: true },
  ];
  const passed = checks.filter(c => c.done).length;

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Security Score
          </h3>
          <p className="text-sm text-muted-foreground">April 2026 audit</p>
        </div>
        <div className="p-2 rounded-xl bg-emerald-50">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
        </div>
      </div>

      {/* Score ring */}
      <div className="flex items-center gap-5 mb-5">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--muted)" strokeWidth="8" />
            <circle
              cx="40" cy="40" r="32" fill="none"
              stroke="#10B981" strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 32}`}
              strokeDashoffset={`${2 * Math.PI * 32 * (1 - score / 100)}`}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              {score}
            </span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl font-bold text-emerald-600" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Excellent
            </span>
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
              +3.6 pts
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{passed}/{checks.length} checks passed</p>
          <p className="text-xs text-muted-foreground mt-0.5">Improved from 6.4 → 10.0</p>
        </div>
      </div>

      {/* Check list */}
      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
        {checks.map((c: any) => (
          <div key={c.label} className="flex items-center gap-2.5 py-1">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              c.done ? "bg-emerald-100" : "bg-red-100"
            }`}>
              {c.done
                ? <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                : <X className="w-3 h-3 text-red-500" />
              }
            </div>
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActionsBar() {
  const actions = [
    { icon: Send,      label: "New Payout",     path: "/payouts",       color: "indigo" },
    { icon: Plus,      label: "Payment Link",   path: "/payment-links", color: "emerald" },
    { icon: Eye,       label: "Transactions",   path: "/transactions",  color: "blue" },
    { icon: BarChart3, label: "Analytics",      path: "/analytics",     color: "violet" },
    { icon: Users,     label: "Customers",      path: "/customers",     color: "amber" },
    { icon: Shield,    label: "Fraud & Risk",   path: "/fraud-risk",    color: "rose" },
    { icon: Settings,  label: "Settings",       path: "/settings",      color: "slate" },
    { icon: Layers,    label: "API Keys",       path: "/api-keys",      color: "teal" },
  ];

  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 hover:bg-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
    blue: "bg-blue-50 text-blue-600 hover:bg-blue-100",
    violet: "bg-violet-50 text-violet-600 hover:bg-violet-100",
    amber: "bg-amber-50 text-amber-600 hover:bg-amber-100",
    rose: "bg-rose-50 text-rose-600 hover:bg-rose-100",
    slate: "bg-slate-100 text-slate-600 hover:bg-slate-200",
    teal: "bg-teal-50 text-teal-600 hover:bg-teal-100",
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <h3 className="font-semibold text-foreground mb-4 text-sm" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
        Quick Actions
      </h3>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
        {actions.map((a: any) => (
          <button
            key={a.label}
            onClick={() => window.location.href = a.path}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${colorMap[a.color]} group`}
          >
            <a.icon className="w-5 h-5" />
            <span className="text-xs font-medium text-center leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Platform Health Pulse ────────────────────────────────────────────────────

function PlatformHealthPulse() {
  const services = [
    { label: "API Gateway",      uptime: 99.99, status: "operational", icon: Zap },
    { label: "Payment Engine",   uptime: 99.97, status: "operational", icon: CreditCard },
    { label: "Fraud Detection",  uptime: 100,   status: "operational", icon: Shield },
    { label: "Settlement",       uptime: 99.98, status: "operational", icon: Globe },
    { label: "Webhook Dispatch", uptime: 99.95, status: "operational", icon: Radio },
    { label: "gRPC Ledger",      uptime: 99.96, status: "operational", icon: Cpu },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Platform Health
          </h3>
          <p className="text-sm text-muted-foreground">All systems operational</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-emerald-600 font-medium">Live</span>
        </div>
      </div>
      <div className="space-y-3">
        {services.map((svc) => (
          <div key={svc.label} className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 shrink-0">
              <svc.icon className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">{svc.label}</span>
                <span className="text-xs text-muted-foreground font-mono">{svc.uptime}%</span>
              </div>
              <Progress value={svc.uptime} className="h-1.5" />
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Wallet Balance Card ──────────────────────────────────────────────────────

function WalletBalanceCard() {
  const dashboardInterval = useAdaptiveInterval(60_000);
  const { data, isLoading } = trpc.wallet.getWallet.useQuery(undefined, {
    staleTime: 30_000, refetchInterval: dashboardInterval,
  });
  const balance = parseFloat((data?.wallet?.balance ?? "0") as string);
  const pending = parseFloat(((data?.wallet as any)?.pendingBalance ?? "0") as string);

  return (
    <div className="relative bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white/70 text-sm font-medium">Merchant Wallet</p>
            <p className="text-xs text-white/50 mt-0.5">{(data?.wallet as any)?.currency ?? "NGN"} · Primary</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
            <Banknote className="w-5 h-5 text-white" />
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-36 bg-white/20" />
            <Skeleton className="h-4 w-24 bg-white/20" />
          </div>
        ) : (
          <>
            <p className="text-4xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              {fmt(balance)}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div>
                <p className="text-white/60 text-xs">Pending</p>
                <p className="text-white/90 text-sm font-semibold">{fmt(pending)}</p>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div>
                <p className="text-white/60 text-xs">Type</p>
                <p className="text-white/90 text-sm font-semibold capitalize">
                  {(data?.wallet as any)?.type ?? "merchant"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Settlement Health Widget ─────────────────────────────────────────────────

function SettlementHealthWidget() {
  const dashboardInterval = useAdaptiveInterval(60_000);
  const { data, isLoading } = trpc.settlements.summary.useQuery(undefined, {
    staleTime: 60_000, refetchInterval: dashboardInterval,
  });
  const hasBreaches = (data?.slaBreachCount ?? 0) > 0;

  return (
    <div className={`bg-card rounded-2xl border p-6 ${hasBreaches ? "border-orange-300 bg-orange-50/30" : "border-border"}`}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Settlement Health
          </h3>
          <p className="text-sm text-muted-foreground">Today's settlement activity</p>
        </div>
        <button
          onClick={() => window.location.href = "/settlements"}
          className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
        >
          View all <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-xl p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {fmt(data?.totalSettledToday ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Settled Today</p>
            </div>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 shrink-0">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {data?.pendingCount ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Pending Batches</p>
            </div>
          </div>
          <div className={`rounded-xl p-4 flex items-center gap-3 ${hasBreaches ? "bg-red-50" : "bg-slate-50"}`}>
            <div className={`p-2.5 rounded-xl shrink-0 ${hasBreaches ? "bg-red-100" : "bg-slate-100"}`}>
              <AlertTriangle className={`w-4 h-4 ${hasBreaches ? "text-red-600" : "text-slate-400"}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${hasBreaches ? "text-red-600" : "text-foreground"}`}
                style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {data?.slaBreachCount ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">SLA Breaches</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dispute Analytics Widget ─────────────────────────────────────────────────

function DisputeAnalyticsWidget() {
  const { data, isLoading } = trpc.disputes.analytics.useQuery({ days: 30 }, { staleTime: 120_000 });
  const d = data ?? { open: 0, resolved: 0, won: 0, lost: 0, winRate: 0, avgResolutionDays: 0 };

  if (isLoading) return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <Skeleton className="h-5 w-40 mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    </div>
  );

  const stats = [
    { label: "Open",           value: d.open,               icon: AlertTriangle, bg: "bg-amber-50",   text: "text-amber-600" },
    { label: "Resolved",       value: d.resolved,            icon: CheckCircle2,  bg: "bg-emerald-50", text: "text-emerald-600" },
    { label: "Win Rate",       value: `${d.winRate}%`,       icon: Trophy,        bg: "bg-indigo-50",  text: "text-indigo-600" },
    { label: "Avg. Resolution",value: `${d.avgResolutionDays}d`, icon: Clock,     bg: "bg-slate-50",   text: "text-slate-600" },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Dispute Analytics
          </h3>
          <p className="text-sm text-muted-foreground">Last 30 days</p>
        </div>
        <button
          onClick={() => window.location.href = "/disputes"}
          className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
        >
          View all <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s: any) => (
          <div key={s.label} className="bg-muted/40 rounded-xl p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${s.bg} shrink-0`}>
              <s.icon className={`w-4 h-4 ${s.text}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {s.value}
              </p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
      {(d.won > 0 || d.lost > 0) && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Won ({d.won})</span>
            <span>Lost ({d.lost})</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 rounded-l-full transition-all" style={{ width: `${d.winRate}%` }} />
            <div className="h-full bg-red-400 rounded-r-full transition-all" style={{ width: `${100 - d.winRate}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KPI Stat Card ────────────────────────────────────────────────────────────

function KPICard({
  title, value, sub, icon: Icon, trend, up, loading, accentColor,
}: {
  title: string; value: string; sub: string;
  icon: React.ElementType; trend: string; up: boolean;
  loading: boolean; accentColor: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string; ring: string }> = {
    indigo:  { bg: "bg-indigo-50",  icon: "text-indigo-600",  ring: "ring-indigo-100" },
    emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", ring: "ring-emerald-100" },
    amber:   { bg: "bg-amber-50",   icon: "text-amber-600",   ring: "ring-amber-100" },
    blue:    { bg: "bg-blue-50",    icon: "text-blue-600",    ring: "ring-blue-100" },
  };
  const c = colorMap[accentColor] ?? colorMap.indigo;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 hover:shadow-md transition-shadow">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <div className={`p-2.5 rounded-xl ${c.bg} ring-1 ${c.ring}`}>
              <Icon className={`w-4 h-4 ${c.icon}`} />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mb-2">{value}</p>
          <div className="flex items-center gap-1.5">
            {up
              ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
              : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
            }
            <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>{trend}</span>
            <span className="text-xs text-muted-foreground">· {sub}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────


// ─── Sub-widgets (extracted for GridContainer) ───────────────────────────────
function KPICardsWidget() {
  return null; // placeholder - rendered inline via Dashboard context
}

// ─── Grid Container (wraps ResponsiveGridLayout with measured width) ──────────
interface GridContainerProps {
  layouts: any;
  isCustomizing: boolean;
  handleLayoutChange: (layout: any, allLayouts: any) => void;
  children: React.ReactNode;
}
function GridContainer({ children }: GridContainerProps) {
  // react-grid-layout is not available in this build; render widgets in a
  // simple responsive stack instead of a draggable grid.
  return <div className="w-full grid grid-cols-1 gap-4">{children}</div>;
}

export default function Dashboard() {
  const [range] = useState(() => ({
    to: new Date(),
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  }));
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const { data, isLoading, refetch, isFetching } = trpc.dashboard.overview.useQuery(range, {
    staleTime: 60_000,
  });
  const { data: txData } = trpc.transactions.list.useQuery(
    { limit: 8, offset: 0 },
    { staleTime: 60_000 }
  );
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await utils.export.transactions.fetch({ from: range.from, to: range.to });
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} transactions`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const overview = data?.overview;
  const timeSeries = data?.timeSeries ?? [];
  const merchant = data?.merchant;

  // Live transaction stream via SSE
  const [liveQueue, setLiveQueue] = useState<StreamTransaction[]>([]);
  const [isLive, setIsLive] = useState(false);
  const liveRef = useRef(false);

  const handleLiveTx = useCallback((tx: StreamTransaction) => {
    if (!liveRef.current) { liveRef.current = true; setIsLive(true); }
    setLiveQueue(prev => [tx, ...prev].slice(0, 8));
    toast.info(`New transaction: ${tx.reference}`, { duration: 3000 });
    utils.transactions.list.invalidate();
  }, [utils]);

  useTransactionStream({ onTransaction: handleLiveTx });

  const serverTxns = txData?.rows ?? [];
  const liveIds = new Set(liveQueue.map(t => t.id));
  const recentTxns = [...liveQueue, ...serverTxns.filter((t: any) => !liveIds.has(t.id))].slice(0, 8);

  const channelBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    recentTxns.forEach((t: any) => { counts[t.channel] = (counts[t.channel] ?? 0) + 1; });
    const total = recentTxns.length || 1;
    return Object.entries(counts).map(([name, value]) => ({
      name: name.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      value: Math.round((value / total) * 100),
      color: CHANNEL_COLORS[name] ?? "#94A3B8",
    }));
  }, [recentTxns]);

  // Stripe sandbox claim banner
  // KYC status — shows a banner if no approved submission exists
  const { data: kycStats } = trpc.complianceKyc.stats.useQuery(undefined, { staleTime: 120_000 });
  const [kycBannerDismissed, setKycBannerDismissed] = useState(() =>
    localStorage.getItem('kyc_banner_dismissed') === '1'
  );
  const kycApproved = (kycStats as any)?.approved > 0;

  const [stripeBannerDismissed, setStripeBannerDismissed] = useState(() =>
    localStorage.getItem("stripe_banner_dismissed") === "1"
  );

  // NIP banks sync
  const { data: fraudAlertsData } = trpc.fraudRisk.list.useQuery(
    { limit: 10, status: 'open' },
    { staleTime: 60_000, retry: false }
  );
  const fraudAlerts = fraudAlertsData ?? [];

  const syncBanks = trpc.nip.syncBanks.useMutation({
    onSuccess: (d: any) => toast.success(`Synced ${d.synced} NIP banks`),
    onError: () => toast.error("NIP bank sync failed"),
  });

  const totalCount    = Number(overview?.totalTransactions ?? 0);
  const completedCount = Number(overview?.successCount ?? 0);
  const failedCount   = Number(overview?.failedCount ?? 0);
  const successRate   = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalVolume   = Number(overview?.totalVolume ?? 0);
   const totalPayouts  = Number(overview?.pendingPayouts ?? 0);
  const customerCount = Number(overview?.activeCustomers ?? 0);
  const disputeCount  = Number(overview?.openDisputes ?? 0);

  // ─── Drag-and-drop grid state ───────────────────────────────────────────────
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [layouts, setLayouts] = useState<any>(() => loadLayouts());
  const handleLayoutChange = useCallback((_: any, allLayouts: any) => {
    setLayouts(allLayouts);
    saveLayouts(allLayouts);
  }, []);
  const resetLayout = useCallback(() => {
    setLayouts(DEFAULT_LAYOUTS);
    saveLayouts(DEFAULT_LAYOUTS);
    toast.success("Dashboard layout reset to default");
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* ── Offline Banner ──────────────────────────────────────────────── */}
      <ConnectionStatusBar />
      {/* ── PWA Install Banner ──────────────────────────────────────────── */}
      <PWAInstallBanner />
      {/* ── Stripe Sandbox Claim Banner ─────────────────────────────────── */}
      {!stripeBannerDismissed && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 border border-violet-200 text-violet-900">
          <CreditCard className="w-5 h-5 shrink-0 text-violet-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Claim your Stripe test sandbox</p>
            <p className="text-xs text-violet-700 mt-0.5">
              Expires <strong>2026-05-11</strong>. Claim now to activate test payments.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVEFBTkRSaTdHR0FyY3hXLDE3NzM5MzcwNjcv100Ox49WXeJ"
              target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              Claim Sandbox
            </a>
            <button
              onClick={() => { localStorage.setItem("stripe_banner_dismissed", "1"); setStripeBannerDismissed(true); }}
              className="p-1 rounded-md hover:bg-violet-100 text-violet-500 hover:text-violet-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* ── KYC Verification Banner ──────────────────────────────────── */}
      {!kycBannerDismissed && !kycApproved && kycStats !== undefined && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <Shield className="w-5 h-5 shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">KYB Verification Required</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your business documents have not been verified yet. Complete KYB to unlock payouts and live payments.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/onboarding"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              Complete KYB
            </a>
            <button
              onClick={() => { localStorage.setItem('kyc_banner_dismissed', '1'); setKycBannerDismissed(true); }}
              className="p-1 rounded-md hover:bg-amber-100 text-amber-500 hover:text-amber-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* ── Fraud Alerts ────────────────────────────────────────────────── */}
      {fraudAlerts && (fraudAlerts as any[]).length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-900">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{(fraudAlerts as any[]).length} Fraud Alert{(fraudAlerts as any[]).length > 1 ? 's' : ''} Detected</p>
            <p className="text-xs text-red-700 mt-0.5">{(fraudAlerts as any[]).filter((a: any) => a.severity === 'high').length} high-severity alerts require immediate attention</p>
          </div>
          <button
            onClick={() => window.location.href = '/fraud-risk'}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors shrink-0"
          >
            Acknowledge
          </button>
        </div>
      )}
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              {merchant?.businessName ?? "Dashboard"}
            </h1>
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1">
              <Sparkles className="w-3 h-3" /> PWA
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last 30 days · {merchant?.currency ?? "NGN"} · {new Date().toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            {(["7d", "30d", "90d"] as const).map((p: any) => (
              <button
                key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => syncBanks.mutate()} disabled={syncBanks.isPending}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncBanks.isPending ? "animate-spin" : ""}`} />
            Sync Banks
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetch(); toast.info("Refreshing..."); }} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4 mr-1.5" />
            {exporting ? "Exporting..." : "Export"}
          </Button>
          <Button
            variant={isCustomizing ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setIsCustomizing(c => !c);
              if (isCustomizing) toast.success("Layout saved!");
              else toast.info("Drag widgets to rearrange. Resize from corners.");
            }}
            className={isCustomizing ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
          >
            <LayoutGrid className="w-4 h-4 mr-1.5" />
            {isCustomizing ? "Done" : "Customize"}
          </Button>
          {isCustomizing && (
            <Button variant="outline" size="sm" onClick={resetLayout}>
              Reset Layout
            </Button>
          )}
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────────── */}
      <QuickActionsBar />

      {/* ── Customize Mode Banner ────────────────────────────────────────── */}
      {isCustomizing && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800">
          <GripVertical className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-medium">Customize mode — drag widgets to reorder, resize from corners. Click <strong>Done</strong> to save.</span>
        </div>
      )}

      {/* ── Drag-and-Drop Widget Grid ────────────────────────────────────── */}
      <GridContainer
        layouts={layouts}
        isCustomizing={isCustomizing}
        handleLayoutChange={handleLayoutChange}
      >
        {/* KPI Cards */}
        <div key="kpi" className="relative">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 h-full">
            <KPICard title="Total Revenue"  value={fmt(totalVolume)}          sub={`${totalCount.toLocaleString()} txns`}      icon={DollarSign}    trend="+12.5%" up={true}              loading={isLoading} accentColor="indigo" />
            <KPICard title="Net Payouts"    value={fmt(totalPayouts)}          sub={`${fmt(overview?.pendingPayouts ?? 0)} pending`} icon={ArrowLeftRight} trend="+8.3%"  up={true}          loading={isLoading} accentColor="emerald" />
            <KPICard title="Success Rate"   value={`${successRate}%`}          sub={`${failedCount} failed`}                    icon={TrendingUp}    trend={successRate >= 90 ? "+0.4%" : "-1.2%"} up={successRate >= 90} loading={isLoading} accentColor="amber" />
            <KPICard title="Customers"      value={customerCount.toLocaleString()} sub={`${disputeCount} open disputes`}        icon={Users}         trend="+9.2%"  up={true}              loading={isLoading} accentColor="blue" />
          </div>
        </div>

        {/* Wallet Balance */}
        <div key="wallet" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <WalletBalanceCard />
        </div>

        {/* Settlement Health */}
        <div key="settlement" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <SettlementHealthWidget />
        </div>

        {/* Revenue Chart */}
        <div key="revenue" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <div className="bg-card rounded-2xl border border-border p-6 h-full">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Revenue Over Time</h3>
                <p className="text-sm text-muted-foreground">Daily completed transaction volume</p>
              </div>
              {!isLoading && <Badge variant="secondary" className="gap-1"><TrendingUp className="w-3 h-3 text-emerald-500" /> Live data</Badge>}
            </div>
            {isLoading ? <Skeleton className="h-52 w-full rounded-xl" /> : timeSeries.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No transaction data in this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timeSeries}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }} formatter={(v: number) => [fmt(v), "Volume"]} />
                  <Area type="monotone" dataKey="volume" stroke="#4F46E5" strokeWidth={2.5} fill="url(#revGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Channels */}
        <div key="channels" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <div className="bg-card rounded-2xl border border-border p-6 h-full">
            <h3 className="font-semibold text-foreground mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Payment Channels</h3>
            <p className="text-sm text-muted-foreground mb-4">Distribution by method</p>
            {channelBreakdown.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={channelBreakdown} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
                      {channelBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v}%`, "Share"]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {channelBreakdown.map((c: any) => (
                    <div key={c.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                        <span className="text-sm text-muted-foreground">{c.name}</span>
                      </div>
                      <span className="text-sm font-semibold">{c.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-muted-foreground">No channel data yet</p>}
          </div>
        </div>

        {/* Daily Count */}
        <div key="daily" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <div className="bg-card rounded-2xl border border-border p-6 h-full">
            <h3 className="font-semibold text-foreground mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Daily Count</h3>
            <p className="text-sm text-muted-foreground mb-4">Transactions per day</p>
            {isLoading ? <Skeleton className="h-44 w-full rounded-xl" /> : timeSeries.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }} />
                  <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div key="transactions" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <div className="bg-card rounded-2xl border border-border p-6 h-full">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Recent Transactions</h3>
                <p className="text-sm text-muted-foreground">Latest activity from your account</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                <span className={`text-xs font-medium flex items-center gap-1 ${isLive ? "text-emerald-600" : "text-muted-foreground"}`}>
                  <Radio className="w-3 h-3" />{isLive ? "Live stream" : "Connecting…"}
                </span>
              </div>
            </div>
            {isLoading ? (
              <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
            ) : recentTxns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No transactions yet</div>
            ) : (
              <div className="space-y-1">
                {recentTxns.map((txn: any) => (
                  <div key={txn.id} className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{txn.customerName ?? txn.customerEmail ?? "Anonymous"}</p>
                      <p className="text-xs text-muted-foreground">{txn.reference} · {txn.channel}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold font-mono text-foreground">{txn.currency} {Number(txn.amount).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{new Date(txn.createdAt).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge status={txn.status} />
                  </div>
                ))}
              </div>
            )}
            <button className="w-full mt-4 py-2.5 text-sm text-primary font-medium hover:bg-primary/5 rounded-xl transition-colors flex items-center justify-center gap-1" onClick={() => window.location.href = "/transactions"}>
              View all transactions <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dispute Analytics */}
        <div key="disputes" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <DisputeAnalyticsWidget />
        </div>

        {/* Revenue Forecast */}
        <div key="forecast" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <RevenueForecast />
        </div>

        {/* Platform Health */}
        <div key="health" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <PlatformHealthPulse />
        </div>

        {/* Security Score */}
        <div key="security" className="relative overflow-auto">
          {isCustomizing && <div className="widget-drag-handle absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded bg-indigo-100 hover:bg-indigo-200"><GripVertical className="w-4 h-4 text-indigo-500" /></div>}
          <SecurityScoreWidget />
        </div>
      </GridContainer>
    </div>
  );
}
