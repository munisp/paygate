import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ArrowLeftRight, Users, CreditCard, BarChart3,
  ShoppingCart, Wallet, AlertTriangle, Key, Webhook, Settings,
  ChevronLeft, ChevronRight, Bell, Search, LogOut, Menu,
  Zap, Globe, Shield, Link2, Brain, CreditCard as BNPLIcon,
  QrCode, Smartphone, Code2, FileCheck, CheckCircle2, X, AlertOctagon,
  GitBranch, Building2, RefreshCw, Monitor, Map,
  ShieldAlert, Users2, Activity, UtensilsCrossed, ChefHat, Package, DollarSign, Star, Layers,
  Rocket, Crown, Server, FileText, Banknote} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import NotificationPanel, { useNotificationCount } from "./NotificationPanel";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePWA } from "@/hooks/usePWA";
import { Download, WifiOff } from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: ArrowLeftRight, label: "Transactions", path: "/transactions", badge: "Live" },
  { icon: Users, label: "Customers", path: "/customers" },
  { icon: CreditCard, label: "Virtual Cards", path: "/virtual-cards" },
  { icon: Wallet, label: "Payouts", path: "/payouts" },
  { icon: AlertTriangle, label: "Disputes", path: "/disputes" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: ShoppingCart, label: "Checkout", path: "/checkout" },
  { icon: Link2, label: "Payment Links", path: "/payment-links" },
  { icon: Brain, label: "Fraud & Risk", path: "/fraud-risk", badge: "AI" },
  { icon: BNPLIcon, label: "BNPL", path: "/bnpl" },
  { icon: Globe, label: "FX & Rates", path: "/fx" },
  { icon: Users, label: "Team & Roles", path: "/team" },
  { icon: ArrowLeftRight, label: "MoMo Recon", path: "/mobile-money" },
  { icon: QrCode, label: "QR Payments", path: "/qr-payments" },
  { icon: Globe, label: "Cross-Border", path: "/cross-border", badge: "New" },
  { icon: FileCheck, label: "Compliance & KYC", path: "/compliance" },
  { icon: RefreshCw, label: "Subscriptions", path: "/subscriptions", badge: "New" },
  { icon: Monitor, label: "POS Terminals", path: "/pos-terminals", badge: "New" },
  { icon: Map, label: "Terminal Map", path: "/terminal-map" },
  { icon: FileCheck, label: "POS Reconciliation", path: "/pos-reconciliation" },
  { icon: Wallet, label: "PTSP Settlement", path: "/ptsp-settlement", badge: "New" },
  { icon: Layers, label: "PTSP Batches", path: "/ptsp-batches" },
  { icon: ShieldAlert, label: "Geofence Alerts", path: "/geofence-alerts" },
  { icon: Server, label: "Service Health", path: "/microservice-health" },
  { icon: Crown, label: "Admin Setup", path: "/admin-setup" },
  { icon: Rocket, label: "Go-Live Checklist", path: "/go-live" },
  { icon: Users2, label: "Agent Banking", path: "/agent-banking" },
  { icon: Activity, label: "Kiosk Health", path: "/kiosk-health" },
  { icon: UtensilsCrossed, label: "Floor Plan", path: "/restaurant/floor-plan" },
  { icon: UtensilsCrossed, label: "Orders", path: "/restaurant/orders" },
  { icon: UtensilsCrossed, label: "Menu", path: "/restaurant/menu" },
  { icon: Star, label: "Loyalty", path: "/restaurant/loyalty" },
  { icon: Globe, label: "Online Ordering", path: "/restaurant/online-ordering", badge: "New" },
  { icon: ChefHat, label: "Kitchen Display", path: "/kitchen-display" },
  { icon: Package, label: "Inventory", path: "/inventory" },
  { icon: DollarSign, label: "Payroll", path: "/payroll" },
  { icon: Zap, label: "Quick Pay", path: "/quick-pay", badge: "New" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: FileText, label: "Audit Log", path: "/audit-log", badge: "Admin" },
  { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders", badge: "New" },
  { icon: Building2, label: "Vendor Directory", path: "/vendors" },
  { icon: Banknote, label: "Settlements", path: "/settlements" },
];

const devItems = [
  { icon: Key, label: "API Keys", path: "/api-keys" },
  { icon: Webhook, label: "Webhooks", path: "/webhooks" },
  { icon: Code2, label: "Developer", path: "/developer" },
  { icon: GitBranch, label: "Workflows", path: "/workflows", badge: "Ops" },
  { icon: Shield, label: "Role Sync", path: "/role-sync" },
  { icon: Building2, label: "NIP Banks", path: "/nip-banks", badge: "CBN" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const ONBOARDING_STEPS = [
  "Create merchant account",
  "Verify business details",
  "Add bank account",
  "Complete KYC",
  "Go live",
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const { user, logout } = useAuth();

  // ─── Fraud Alert Banner ──────────────────────────────────────────────────
  const { data: fraudData, refetch: refetchAlerts } = trpc.fraudRisk.getAlerts.useQuery(
    undefined,
    { refetchInterval: 30_000, staleTime: 20_000 }
  );
  const acknowledgeMutation = trpc.fraudRisk.acknowledge.useMutation({
    onSuccess: (_, vars) => {
      setDismissedAlerts(prev => new Set(Array.from(prev).concat(vars.id)));
      refetchAlerts();
      toast.success("Alert acknowledged — moved to investigating");
    },
  });

  const visibleAlerts = (fraudData?.alerts ?? []).filter(
    (a: any) => !dismissedAlerts.has(a.id)
  );

  // ─── Stripe Mode Banner ─────────────────────────────────────────────────
  const { data: checklistData } = trpc.system.goLiveChecklist.useQuery(undefined, {
    refetchInterval: 300_000, // 5 min
    staleTime: 240_000,
  });
  const stripeItem = checklistData?.items.find((i: any) => i.id === "stripe_live_keys");
  const isTestMode = stripeItem?.status !== "ok"; // show banner if not on live keys
  const [dismissedStripeBanner, setDismissedStripeBanner] = useState(false);

  // ─── SLA Breach Banner ───────────────────────────────────────────────────
  const [dismissedSlaIds, setDismissedSlaIds] = useState<Set<string>>(new Set());
  const { data: slaData } = trpc.settlements.listBreached.useQuery(
    undefined,
    { refetchInterval: 60_000, staleTime: 30_000 }
  );
  const visibleSlaBreaches = (slaData?.breached ?? []).filter(
    (s: any) => !dismissedSlaIds.has(s.id)
  );

  const inAppUnread = useNotificationCount();
  const { isInstallable, promptInstall, isOnline, dismissInstall } = usePWA();
  const showPwaBanner = isInstallable;

  // ─── Onboarding Status ───────────────────────────────────────────────────
  const { data: onboardingData } = trpc.onboarding.getStatus.useQuery(undefined, {
    staleTime: 60_000,
  });
  const onboardingStep = onboardingData?.merchant?.onboardingStep ?? 0;
  const onboardingComplete = onboardingData?.isComplete ?? false;
  const onboardingPct = Math.round((onboardingStep / ONBOARDING_STEPS.length) * 100);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const merchantName = onboardingData?.merchant?.businessName ?? user?.name ?? "Merchant";
  const merchantEmail = user?.email ?? "";
  const initials = merchantName.slice(0, 2).toUpperCase();

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-sidebar-foreground text-lg" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              PayGate
            </span>
            <div className="text-xs text-sidebar-foreground/50">Merchant Portal</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {!collapsed && (
          <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-3 mb-2">
            Overview
          </p>
        )}
        {navItems.map((item) => {
          const isActive = location === item.path || (location === "/" && item.path === "/dashboard");
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`sidebar-item ${isActive ? "active" : "text-sidebar-foreground/70"}`}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <Badge
                      variant="secondary"
                      className={`text-xs px-1.5 py-0 ${
                        item.badge === "Live"
                          ? "bg-emerald-500/20 text-emerald-400 border-0"
                          : item.badge === "AI"
                          ? "bg-violet-500/20 text-violet-400 border-0"
                          : "bg-blue-500/20 text-blue-400 border-0"
                      }`}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </Link>
          );
        })}

        {!collapsed && (
          <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-3 mt-5 mb-2">
            Developer
          </p>
        )}
        {devItems.map((item) => {
          const isActive = location === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`sidebar-item ${isActive ? "active" : "text-sidebar-foreground/70"}`}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Onboarding Progress Tracker — visible until complete */}
      {!collapsed && !onboardingComplete && (
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-blue-400">Getting Started</span>
              <span className="text-xs text-blue-400/70">{onboardingStep}/{ONBOARDING_STEPS.length}</span>
            </div>
            <Progress value={onboardingPct} className="h-1.5 mb-2" />
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {onboardingStep < ONBOARDING_STEPS.length
                ? `Next: ${ONBOARDING_STEPS[onboardingStep]}`
                : "All steps complete!"}
            </p>
            <Link href="/onboarding" className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
              Continue setup →
            </Link>
          </div>
        </div>
      )}
      {!collapsed && onboardingComplete && (
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-medium text-amber-400">Test Mode</span>
          </div>
        </div>
      )}

      {/* User profile */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors ${collapsed ? "justify-center" : ""}`}>
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-white text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{merchantName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{merchantEmail}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={handleLogout} className="text-sidebar-foreground/40 hover:text-red-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-sidebar transition-all duration-300 flex-shrink-0 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 translate-x-full bg-sidebar border border-sidebar-border rounded-r-lg p-1 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors z-10"
          style={{ left: collapsed ? "3.5rem" : "14.5rem" }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-sidebar flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Fraud Alert Banner — sticky, high-severity only */}
        {visibleAlerts.length > 0 && (
          <div className="bg-red-600 text-white px-4 py-2 flex items-center gap-3 flex-shrink-0 z-20">
            <AlertOctagon className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">
                {visibleAlerts.length} High-Severity Fraud Alert{visibleAlerts.length > 1 ? "s" : ""}
              </span>
              <span className="text-sm text-red-100 ml-2 truncate hidden sm:inline">
                {visibleAlerts[0].alertType?.replace(/_/g, " ")} — Risk score: {visibleAlerts[0].riskScore}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/fraud-risk">
                <a className="text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors">
                  View Alerts
                </a>
              </Link>
              <button
                onClick={() => acknowledgeMutation.mutate({ id: visibleAlerts[0].id })}
                disabled={acknowledgeMutation.isPending}
                className="text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors disabled:opacity-50"
              >
                Acknowledge
              </button>
              <button
                onClick={() => setDismissedAlerts(prev => new Set(Array.from(prev).concat(visibleAlerts[0].id)))}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* SLA Breach Banner — dismissible, orange */}
        {visibleSlaBreaches.length > 0 && (
          <div className="bg-orange-600 text-white px-4 py-2 flex items-center gap-3 flex-shrink-0 z-20">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">
                {visibleSlaBreaches.length} Settlement SLA Breach{visibleSlaBreaches.length > 1 ? "es" : ""}
              </span>
              <span className="text-sm text-orange-100 ml-2 truncate hidden sm:inline">
                {visibleSlaBreaches[0].reference} — {visibleSlaBreaches[0].severity === "critical" ? "CRITICAL" : "overdue"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/settlements">
                <a className="text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors">
                  View Settlements
                </a>
              </Link>
              <button
                onClick={() => setDismissedSlaIds(prev => new Set(Array.from(prev).concat(visibleSlaBreaches[0].id)))}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        {/* PWA Install Banner */}
        {showPwaBanner && (
          <div className="flex items-center gap-3 px-6 py-2 bg-indigo-600 text-white text-sm">
            <Download className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Install PayGate as an app for faster access — works offline too.</span>
            <button
              onClick={() => { promptInstall(); }}
              className="px-3 py-1 rounded bg-white text-indigo-700 font-semibold text-xs hover:bg-indigo-50 transition-colors"
            >
              Install
            </button>
            <button
              onClick={() => { dismissInstall(); }}
              className="p-1 rounded hover:bg-indigo-500 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Offline Banner */}
        {!isOnline && (
          <div className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-white text-sm">
            <WifiOff className="w-4 h-4" />
            <span>You are offline. Some features may be unavailable.</span>
          </div>
        )}

        {/* Top Bar */}
        <header className="flex items-center gap-4 px-6 py-4 bg-card border-b border-border flex-shrink-0">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search transactions, customers..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Stripe mode indicator */}
            {checklistData && !dismissedStripeBanner && (
              isTestMode ? (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="text-xs font-medium text-orange-700">Test Mode</span>
                  <button
                    onClick={() => setDismissedStripeBanner(true)}
                    className="ml-1 text-orange-400 hover:text-orange-600"
                    title="Dismiss"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-700">Live Mode</span>
                </div>
              )
            )}
            {/* Live indicator (fallback when checklist not loaded) */}
            {!checklistData && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-emerald-700">Live</span>
              </div>
            )}

            {/* Fraud alert count badge on bell */}
            <button
              onClick={() => setNotifOpen(true)}
              className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Bell className="w-5 h-5" />
              {(inAppUnread + visibleAlerts.length) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {inAppUnread + visibleAlerts.length}
                </span>
              )}
            </button>

            {/* Globe / Region */}
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Globe className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Notification Panel */}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
