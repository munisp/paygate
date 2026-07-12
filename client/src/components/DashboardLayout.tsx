// Obsidian Operations — DashboardLayout v3
// Fixed left sidebar + live operational top bar with interval selector + scrollable main content
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Server,
  GitBranch,
  Database,
  LayoutDashboard,
  Menu,
  X,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Radio,
  ChevronDown,
} from "lucide-react";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { mockRoutes, mockWorkflows } from "@/lib/mockData";
import { useRefresh, type RefreshInterval } from "@/contexts/RefreshContext";
import { trpc } from "@/lib/trpc";
import { FlaskConical, Wifi } from "lucide-react";
import { toast } from "sonner";

const NAV_ITEMS = [
  { path: "/", label: "Overview", icon: LayoutDashboard },
  { path: "/gateway", label: "API Gateway", icon: Server },
  { path: "/workflows", label: "Workflows", icon: GitBranch },
  { path: "/pool", label: "Connection Pool", icon: Database },
  { path: "/infra", label: "Kafka / Redis", icon: Activity },
  { path: "/settings", label: "Settings", icon: Settings },
];

const INTERVAL_OPTIONS: { label: string; value: RefreshInterval }[] = [
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "Off", value: 0 },
];

function NavItem({
  path,
  label,
  icon: Icon,
  collapsed,
}: {
  path: string;
  label: string;
  icon: React.ElementType;
  collapsed: boolean;
}) {
  const [location] = useLocation();
  const active = location === path;
  return (
    <Link href={path}>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-150 group relative",
          active
            ? "bg-primary/10 text-primary border-l-2 border-primary pl-[10px]"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        )}
      >
        <Icon size={18} className={cn("shrink-0", active && "text-primary")} />
        {!collapsed && (
          <span className={cn("text-sm font-medium truncate", active && "text-primary")}>
            {label}
          </span>
        )}
        {collapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-card border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-150">
            {label}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showIntervalMenu, setShowIntervalMenu] = useState(false);
  const { interval, setInterval, secondsUntilRefresh, triggerRefresh, forceMock, setForceMock } = useRefresh();
  const pingQuery = trpc.paygate.ping.useQuery({ forceMock }, { refetchInterval: 30_000 });
  const connected = pingQuery.data?.connected ?? false;

  // Compute global health from mock data (will be replaced by live data in pages)
  const degradedRoutes = mockRoutes.filter(r => r.status === "degraded" || r.status === "critical").length;
  const failedWorkflows = mockWorkflows.filter(w => w.status === "failed" || w.status === "timed_out").length;
  const runningWorkflows = mockWorkflows.filter(w => w.status === "running").length;
  const totalAlerts = degradedRoutes + failedWorkflows;
  const globalStatus = totalAlerts > 0 ? "degraded" : "nominal";

  const sidebarWidth = collapsed ? "w-16" : "w-56";

  const intervalLabel =
    interval === 0 ? "Off" : interval < 60 ? `${interval}s` : `${interval / 60}m`;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:relative z-50 md:z-auto h-full flex flex-col border-r transition-all duration-200",
          "bg-sidebar border-sidebar-border",
          sidebarWidth,
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        style={{ boxShadow: "inset -1px 0 0 oklch(0.72 0.18 200 / 0.08)" }}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center gap-2.5 px-3 py-4 border-b border-sidebar-border",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="relative">
            <img
              src="/manus-storage/paygate-ops-logo_71c2030f.png"
              alt="PayGate Ops"
              className="w-8 h-8 shrink-0"
            />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-xs font-bold text-primary tracking-widest uppercase font-mono">
                PayGate
              </div>
              <div className="text-[10px] text-muted-foreground tracking-wider uppercase">
                Ops Monitor
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <NavItem key={item.path} {...item} collapsed={collapsed} />
          ))}
        </nav>

        {/* System status summary */}
        {!collapsed && (
          <div className="px-3 py-3 border-t border-sidebar-border space-y-1.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-2">
              System State
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono">Gateway</span>
              <span
                className={
                  degradedRoutes > 0 ? "text-amber-400 font-mono" : "text-emerald-400 font-mono"
                }
              >
                {degradedRoutes > 0 ? `${degradedRoutes} degraded` : "nominal"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono">Workflows</span>
              <span className="text-primary font-mono">{runningWorkflows} running</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono">Incidents</span>
              <span
                className={
                  failedWorkflows > 0 ? "text-red-400 font-mono" : "text-emerald-400 font-mono"
                }
              >
                {failedWorkflows > 0 ? `${failedWorkflows} open` : "none"}
              </span>
            </div>
            {/* Backend connectivity */}
            <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-sidebar-border">
              <span className="text-muted-foreground font-mono">Backend</span>
              <span
                className={cn(
                  "font-mono flex items-center gap-1",
                  connected ? "text-emerald-400" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"
                  )}
                />
                {connected ? "live" : "mock"}
              </span>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <div className="px-2 py-3 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-xs"
          >
            <Menu size={16} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Operational top bar */}
        <header
          className="flex items-center justify-between px-4 md:px-6 py-0 border-b border-border shrink-0"
          style={{
            background:
              "linear-gradient(90deg, oklch(0.15 0.009 265) 0%, oklch(0.17 0.010 265) 100%)",
            boxShadow:
              "0 1px 0 oklch(0.28 0.012 265), 0 0 0 1px oklch(0.72 0.18 200 / 0.04) inset",
          }}
        >
          {/* Left: mobile menu + page identity */}
          <div className="flex items-center gap-3 py-3">
            <button
              className="md:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2">
              <Radio size={14} className="text-primary" />
              <span className="text-sm font-bold text-foreground font-mono tracking-tight">
                PAYGATE OPS
              </span>
              <span className="text-muted-foreground/40 hidden sm:inline">·</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Gateway &amp; Workflow Monitor
              </span>
            </div>
          </div>

          {/* Center: live status pills */}
          <div className="hidden md:flex items-center gap-3">
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border",
                globalStatus === "nominal"
                  ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                  : "bg-amber-400/10 text-amber-400 border-amber-400/20"
              )}
            >
              {globalStatus === "nominal" ? (
                <>
                  <CheckCircle size={11} /> ALL SYSTEMS NOMINAL
                </>
              ) : (
                <>
                  <AlertTriangle size={11} /> {totalAlerts} ALERT
                  {totalAlerts !== 1 ? "S" : ""} ACTIVE
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-primary/10 text-primary border border-primary/20">
              <Activity size={11} className="animate-pulse" />
              {runningWorkflows} WORKFLOW{runningWorkflows !== 1 ? "S" : ""} LIVE
            </div>
          </div>

          {/* Right: backend status + interval selector + refresh */}
          <div className="flex items-center gap-2 py-3">
            {/* Backend connectivity indicator */}
            <div
              className={cn(
                "hidden lg:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border",
                connected
                  ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
                  : "text-muted-foreground border-border/50 bg-secondary/50"
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"
                )}
              />
              {connected ? "LIVE" : "MOCK"}
            </div>

            {/* Mock/Live toggle */}
            <button
              onClick={() => {
                const next = !forceMock;
                setForceMock(next);
                toast.success(next ? "Switched to MOCK mode" : "Switched to LIVE mode", {
                  description: next ? "All panels now use mock data" : "All panels now use live data (with mock fallback)",
                  duration: 2500,
                });
              }}
              title={forceMock ? "Currently forcing MOCK data — click to try LIVE" : "Currently using LIVE data (with mock fallback) — click to force MOCK"}
              className={cn(
                "hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-colors",
                forceMock
                  ? "text-amber-400 border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20"
                  : "text-primary border-primary/20 bg-primary/5 hover:bg-primary/10"
              )}
            >
              {forceMock ? <FlaskConical size={10} /> : <Wifi size={10} />}
              {forceMock ? "MOCK" : "LIVE"}
            </button>

            {/* Countdown */}
            {interval > 0 && (
              <span className="text-[11px] text-muted-foreground font-mono hidden md:block tabular-nums w-6 text-right">
                {secondsUntilRefresh}s
              </span>
            )}

            {/* Interval selector */}
            <div className="relative">
              <button
                onClick={() => setShowIntervalMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs text-muted-foreground transition-colors border border-border/50 font-mono"
              >
                <span>{intervalLabel}</span>
                <ChevronDown size={10} />
              </button>
              {showIntervalMenu && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg z-50 overflow-hidden min-w-[64px]">
                  {INTERVAL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setInterval(opt.value);
                        setShowIntervalMenu(false);
                      }}
                      className={cn(
                        "w-full px-4 py-2 text-xs font-mono text-left hover:bg-secondary transition-colors",
                        interval === opt.value
                          ? "text-primary bg-primary/10"
                          : "text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Manual refresh */}
            <button
              onClick={() => {
                triggerRefresh();
                toast.success("Data refreshed", {
                  description: "All panels updated",
                  duration: 2000,
                });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs text-foreground transition-colors border border-border/50 font-mono active:scale-95"
            >
              <RefreshCw size={12} />
              <span className="hidden sm:inline">REFRESH</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
