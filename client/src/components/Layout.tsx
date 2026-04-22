import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ArrowLeftRight, Users, CreditCard, BarChart3,
  ShoppingCart, Wallet, AlertTriangle, Key, Webhook, Settings,
  ChevronLeft, ChevronRight, Bell, Search, LogOut, Menu,
  Zap, Globe, Shield, Link2, Brain, Bot, ScrollText, CreditCard as BNPLIcon,
  QrCode, Smartphone, Code2, FileCheck, CheckCircle2, X, AlertOctagon,
  GitBranch, Building2, RefreshCw, Monitor, Map,
  ShieldAlert, Users2, Activity, UtensilsCrossed, ChefHat, Package, DollarSign, Star, Layers, Tag,
  Rocket, Crown, Server, FileText, Banknote, Scale, Coins,
  TrendingUp, Repeat, ArrowUpDown, FileSpreadsheet, FilePlus2,
  ShieldCheck, Fingerprint, BookOpen, Gift, Cpu, LineChart, Flame,
  Umbrella, Leaf, Gem, Bitcoin, Lock, CalendarClock, Clock, Receipt, FlaskConical,
  Landmark, Radio, MessageSquareCode, Network, Layers3, Tablet, Satellite,
  Database, ShieldPlus, Briefcase, PercentSquare, Volume2, PiggyBank,
  SplitSquareHorizontal, ListChecks, BookMarked, UserCheck, EyeOff,
  BarChart2, Building, ShoppingBag, Send, ChevronDown,
  Calendar, CheckSquare, Mic, Split, TrendingDown, Wifi, MessageSquare} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLocation as useWouterLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import NotificationPanel, { useNotificationCount } from "./NotificationPanel";
import LiveChatWidget from "./LiveChatWidget";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePWA } from "@/hooks/usePWA";
import { Download, WifiOff, Moon, Sun, BellRing, BellOff } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// ─── Grouped Navigation ──────────────────────────────────────────────────────
type NavItem = { icon: React.ElementType; label: string; path: string; badge?: string };
type NavGroup = { title: string; icon: React.ElementType; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Overview",
    icon: LayoutDashboard,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: BarChart3, label: "Analytics", path: "/analytics" },
      { icon: BarChart2, label: "Merchant Analytics", path: "/merchant-analytics", badge: "New" },
      { icon: FileText, label: "Reports Center", path: "/reports" },
      { icon: Brain, label: "AI Insights", path: "/ai-insights", badge: "AI" },
      { icon: Bell, label: "Notifications", path: "/notifications" },
      { icon: CheckSquare, label: "Go-Live Checklist", path: "/go-live-checklist" },
    ],
  },
  {
    title: "Payments",
    icon: ArrowLeftRight,
    items: [
      { icon: ArrowLeftRight, label: "Transactions", path: "/transactions" },
      { icon: Users, label: "Customers", path: "/customers" },
      { icon: ShoppingCart, label: "Checkout", path: "/checkout" },
      { icon: Link2, label: "Payment Links", path: "/payment-links" },
      { icon: QrCode, label: "QR Payments", path: "/qr-payments" },
      { icon: BarChart3, label: "QR Analytics", path: "/qr-analytics" },
      { icon: Zap, label: "Quick Pay", path: "/quick-pay" },
      { icon: Wifi, label: "NFC Tap-to-Pay", path: "/nfc-pay", badge: "New" },
      { icon: ShoppingBag, label: "Marketplace Pay", path: "/marketplace-pay", badge: "New" },
      { icon: CreditCard, label: "EMI Checkout", path: "/emi-checkout" },
      { icon: Split, label: "Split Payments", path: "/split-payments" },
      { icon: Layers, label: "Bulk Collections", path: "/bulk-collections" },
      { icon: Lock, label: "Privacy Payments", path: "/privacy-payments" },
      { icon: Mic, label: "Voice Payments", path: "/voice-payments" },
    ],
  },
  {
    title: "Cards & Wallets",
    icon: CreditCard,
    items: [
      { icon: CreditCard, label: "Virtual Cards", path: "/virtual-cards" },
      { icon: Wallet, label: "Multi-Currency Wallet", path: "/multi-currency-wallet" },
      { icon: Banknote, label: "BNPL", path: "/bnpl" },
      { icon: Banknote, label: "BNPL v2", path: "/bnpl-v2" },
      { icon: DollarSign, label: "USDC Payouts", path: "/usdc-payouts" },
      { icon: DollarSign, label: "USDC V2", path: "/usdc-v2", badge: "New" },
      { icon: TrendingDown, label: "Crypto Off-Ramp", path: "/crypto-offramp", badge: "New" },
      { icon: TrendingUp, label: "Crypto Ramp", path: "/crypto-ramp" },
      { icon: Gem, label: "Digital Gold", path: "/digital-gold" },
    ],
  },
  {
    title: "Subscriptions & Billing",
    icon: RefreshCw,
    items: [
      { icon: RefreshCw, label: "Subscriptions", path: "/subscriptions" },
      { icon: Calendar, label: "Recurring Billing", path: "/recurring-billing" },
      { icon: Receipt, label: "Subscription Billing v2", path: "/subscription-billing-v2" },
      { icon: Globe, label: "DCC Checkout", path: "/dcc-checkout" },
      { icon: CreditCard, label: "Portal Billing", path: "/billing" },
      { icon: Rocket, label: "Payment Config", path: "/settings/payments", badge: "Go-Live" },
    ],
  },
  {
    title: "FX & Cross-Border",
    icon: Globe,
    items: [
      { icon: TrendingUp, label: "FX & Rates", path: "/fx" },
      { icon: Globe, label: "Cross-Border", path: "/cross-border" },
      { icon: Send, label: "Remittance", path: "/remittance" },
      { icon: Send, label: "Remittance v2", path: "/remittance-v2" },
      { icon: Landmark, label: "Multi-Currency Ledger", path: "/multi-currency-ledger", badge: "New" },
      { icon: Building, label: "Nodal Accounts", path: "/nodal-accounts" },
      { icon: Radio, label: "RTGS", path: "/rtgs" },
      { icon: MessageSquareCode, label: "ISO 20022", path: "/iso20022" },
      { icon: Network, label: "MojaLoop", path: "/mojaloop" },
    ],
  },
  {
    title: "Payouts & Settlements",
    icon: Wallet,
    items: [
      { icon: Wallet, label: "Payouts", path: "/payouts" },
      { icon: Layers, label: "Payout Batching", path: "/payout-batching" },
      { icon: RefreshCw, label: "Refunds", path: "/refunds" },
      { icon: Banknote, label: "Settlements", path: "/settlements" },
      { icon: TrendingUp, label: "Settlement Forecast", path: "/settlement-forecast" },
      { icon: Wallet, label: "PTSP Settlement", path: "/ptsp-settlement" },
      { icon: Layers, label: "PTSP Batches", path: "/ptsp-batches" },
      { icon: ArrowLeftRight, label: "MoMo Recon", path: "/mobile-money" },
      { icon: FileSpreadsheet, label: "Recon Engine", path: "/reconciliation" },
      { icon: Scale, label: "Recon Alerts", path: "/reconciliation-alerts" },
    ],
  },
  {
    title: "Fraud & Risk",
    icon: Shield,
    items: [
      { icon: Brain, label: "Fraud & Risk", path: "/fraud-risk", badge: "AI" },
      { icon: Flame, label: "Fraud Heatmap", path: "/fraud-heatmap" },
      { icon: Shield, label: "AML Monitor", path: "/aml-monitor" },
      { icon: Fingerprint, label: "Session Risk", path: "/session-risk" },
      { icon: ShieldAlert, label: "Geofence Alerts", path: "/geofence-alerts" },
      { icon: AlertTriangle, label: "Disputes", path: "/disputes" },
      { icon: AlertOctagon, label: "Dispute Automation", path: "/dispute-automation" },
      { icon: ShieldCheck, label: "Chargeback Auto", path: "/chargeback-automation" },
    ],
  },
  {
    title: "Compliance & KYC",
    icon: FileCheck,
    items: [
      { icon: FileCheck, label: "Compliance & KYC", path: "/compliance" },
      { icon: FileCheck, label: "KYB Workflow", path: "/kyb-workflow" },
      { icon: Building2, label: "KYB Verification", path: "/kyb-verification", badge: "New" },
      { icon: FileCheck, label: "Compliance Reports", path: "/compliance-reports", badge: "New" },
      { icon: Receipt, label: "Tax Filing", path: "/tax-filing", badge: "New" },
      { icon: Receipt, label: "Tax Withholding", path: "/tax-withholding" },
      { icon: Receipt, label: "Tax Engine", path: "/tax-engine" },
      { icon: Scale, label: "Regulatory Reporting", path: "/regulatory-reporting", badge: "New" },
      { icon: FlaskConical, label: "Reg Sandbox", path: "/regulatory-sandbox" },
      { icon: ScrollText, label: "Audit Log", path: "/audit-log" },
    ],
  },
  {
    title: "Lending & Credit",
    icon: TrendingUp,
    items: [
      { icon: TrendingUp, label: "Merchant Lending", path: "/lending" },
      { icon: Landmark, label: "Merchant Lending v2", path: "/merchant-lending" },
      { icon: FilePlus2, label: "Invoice Builder", path: "/invoice-builder" },
      { icon: FilePlus2, label: "Invoice Financing V2", path: "/invoice-financing-v2", badge: "New" },
      { icon: Shield, label: "Escrow", path: "/escrow" },
      { icon: Shield, label: "Escrow V2", path: "/escrow-v2", badge: "New" },
      { icon: Cpu, label: "Embedded Finance", path: "/embedded-finance" },
    ],
  },
  {
    title: "Wealth & Insurance",
    icon: PiggyBank,
    items: [
      { icon: TrendingUp, label: "Mutual Funds", path: "/mutual-funds" },
      { icon: ShieldPlus, label: "Consumer Insurance", path: "/consumer-insurance" },
      { icon: Umbrella, label: "Insurance", path: "/insurance" },
      { icon: CreditCard, label: "EMI Loans", path: "/emi-loans" },
      { icon: Webhook, label: "Webhook Events", path: "/webhook-events" },
      { icon: Tag, label: "Pricing", path: "/pricing" },
      { icon: PiggyBank, label: "Pension & NPS", path: "/pension-nps" },
      { icon: Briefcase, label: "Wealth Management", path: "/wealth-management" },
      { icon: Leaf, label: "Carbon Credits", path: "/carbon-credit" },
      { icon: Leaf, label: "Carbon Credits V2", path: "/carbon-credits-v2", badge: "New" },
    ],
  },
  {
    title: "Loyalty & Rewards",
    icon: Star,
    items: [
      { icon: Gift, label: "Loyalty Engine", path: "/loyalty-engine" },
      { icon: Star, label: "Loyalty V3", path: "/loyalty-v3", badge: "New" },
      { icon: PercentSquare, label: "Cashback & Rewards", path: "/cashback-rewards" },
      { icon: Gem, label: "NFT Badges", path: "/nft-badges" },
      { icon: BookOpen, label: "Open Banking", path: "/open-banking" },
      { icon: BookOpen, label: "Open Banking V2", path: "/open-banking-v2", badge: "New" },
      { icon: Network, label: "Open Finance", path: "/open-finance" },
      { icon: BookOpen, label: "Open Banking Portal", path: "/open-banking-portal" },
    ],
  },
  {
    title: "POS & Terminals",
    icon: Monitor,
    items: [
      { icon: Monitor, label: "POS Terminals", path: "/pos-terminals" },
      { icon: Map, label: "Terminal Map", path: "/terminal-map" },
      { icon: FileCheck, label: "POS Reconciliation", path: "/pos-reconciliation" },
      { icon: ShoppingBag, label: "Smart Retail POS", path: "/smart-pos" },
      { icon: Tablet, label: "POS v2", path: "/pos-v2" },
      { icon: Tablet, label: "Mobile POS", path: "/mobile-pos" },
      { icon: Activity, label: "Kiosk Health", path: "/kiosk-health" },
    ],
  },
  {
    title: "Agent & USSD",
    icon: Network,
    items: [
      { icon: Users, label: "Agent Banking", path: "/agent-banking" },
      { icon: Users, label: "Agent Banking V4", path: "/agent-banking-v4", badge: "New" },
      { icon: Network, label: "Agent Network v2", path: "/agent-network" },
      { icon: Network, label: "Super-Agent V2", path: "/super-agent-v2", badge: "New" },
      { icon: Radio, label: "USSD Session V2", path: "/ussd-v2", badge: "New" },
      { icon: Radio, label: "USSD Sessions", path: "/ussd-sessions", badge: "New" },
    ],
  },
  {
    title: "Retail & Restaurant",
    icon: UtensilsCrossed,
    items: [
      { icon: UtensilsCrossed, label: "Floor Plan", path: "/restaurant/floor-plan" },
      { icon: UtensilsCrossed, label: "Orders", path: "/restaurant/orders" },
      { icon: UtensilsCrossed, label: "Menu", path: "/restaurant/menu" },
      { icon: Star, label: "Loyalty", path: "/restaurant/loyalty" },
      { icon: Globe, label: "Online Ordering", path: "/restaurant/online-ordering" },
      { icon: ChefHat, label: "Kitchen Display", path: "/kitchen-display" },
      { icon: Package, label: "Inventory", path: "/inventory" },
      { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders" },
      { icon: Building2, label: "Vendor Directory", path: "/vendors" },
      { icon: Tablet, label: "Super App", path: "/super-app" },
    ],
  },
  {
    title: "HR & Payroll",
    icon: DollarSign,
    items: [
      { icon: DollarSign, label: "Payroll", path: "/payroll" },
      { icon: DollarSign, label: "Payroll v2", path: "/payroll-v2" },
      { icon: DollarSign, label: "Payroll V3", path: "/payroll-v3", badge: "New" },
      { icon: UserCheck, label: "Salary Accounts", path: "/salary-accounts" },
      { icon: Users, label: "Team & Roles", path: "/team" },
    ],
  },
  {
    title: "Operations",
    icon: Server,
    items: [
      { icon: Server, label: "Service Health", path: "/microservice-health" },
      { icon: Activity, label: "Temporal Workflows", path: "/temporal-workflows", badge: "New" },
      { icon: Server, label: "gRPC Health Check", path: "/grpc-health", badge: "New" },
      { icon: GitBranch, label: "Workflows", path: "/workflows" },
      { icon: Database, label: "Lakehouse v2", path: "/lakehouse-v2" },
      { icon: Satellite, label: "White-Label SDK", path: "/white-label-sdk" },
      { icon: Code2, label: "SDK Portal", path: "/sdk-portal" },
      { icon: LineChart, label: "Cohort Analytics", path: "/cohort-analytics" },
      { icon: CalendarClock, label: "Bulk Scheduler", path: "/bulk-scheduler" },
      { icon: Bot, label: "Ollama AI Chat", path: "/ollama-chat", badge: "AI" },
      { icon: Bell, label: "Realtime Notifications", path: "/realtime-notifications", badge: "New" },
    ],
  },
  {
    title: "Platform Admin",
    icon: Crown,
    items: [
      { icon: LayoutDashboard, label: "Admin Overview", path: "/admin", badge: "Admin" },
      { icon: Users, label: "Merchants", path: "/admin/merchants", badge: "Admin" },
      { icon: ShieldCheck, label: "KYC Review", path: "/admin/kyc", badge: "Admin" },
      { icon: AlertTriangle, label: "Disputes", path: "/admin/disputes", badge: "Admin" },
      { icon: Brain, label: "Fraud", path: "/admin/fraud", badge: "Admin" },
      { icon: BarChart3, label: "Revenue", path: "/admin/revenue", badge: "Admin" },
      { icon: ArrowLeftRight, label: "Settlements", path: "/admin/settlements", badge: "Admin" },
      { icon: Shield, label: "Compliance", path: "/admin/compliance", badge: "Admin" },
      { icon: Zap, label: "System Health", path: "/admin/health", badge: "Admin" },
      { icon: ScrollText, label: "Audit Trail", path: "/admin/audit", badge: "Admin" },
      { icon: Settings, label: "Config", path: "/admin/config", badge: "Admin" },
      { icon: Crown, label: "Admin Setup", path: "/admin-setup" },
      { icon: MessageSquare, label: "Support Inbox", path: "/admin/support", badge: "Admin" },
            { icon: Brain, label: "GNN Training", path: "/admin/gnn-training", badge: "Admin" },
      { icon: Shield, label: "Keycloak SSO", path: "/admin/keycloak", badge: "Admin" },
      { icon: Clock, label: "Settlement SLA", path: "/admin/settlement-sla", badge: "Admin" },
      { icon: AlertTriangle, label: "Dispute Lifecycle", path: "/admin/dispute-lifecycle", badge: "Admin" },
{ icon: Layers3, label: "Data Pipeline", path: "/admin/data-pipeline", badge: "Admin" },
      { icon: Building2, label: "Partner Onboarding", path: "/admin/partner-onboarding", badge: "Admin" },
      { icon: Globe, label: "FX Corridors", path: "/admin/corridors", badge: "Admin" },
      { icon: DollarSign, label: "Plan Limits", path: "/admin/plan-limits", badge: "Admin" },
      { icon: FileText, label: "Billing Invoices", path: "/admin/billing-invoices", badge: "Admin" },
      { icon: ShieldCheck, label: "SSO Config", path: "/admin/sso-config", badge: "Admin" },
      { icon: Users2, label: "Invite Codes", path: "/admin/invite-codes-v2", badge: "Admin" },
      { icon: ShieldAlert, label: "Fraud Rings", path: "/admin/fraud-rings", badge: "Admin" },
      { icon: Brain, label: "GNN Thresholds", path: "/admin/gnn-threshold", badge: "Admin" },
    ],
  },
];

const devItems: NavItem[] = [
  { icon: Key, label: "API Keys", path: "/api-keys" },
  { icon: Key, label: "SDK Tokens", path: "/sdk-tokens", badge: "New" },
  { icon: Webhook, label: "Webhooks", path: "/webhooks" },
  { icon: Code2, label: "Developer", path: "/developer" },
  { icon: Code2, label: "Dev Sandbox", path: "/developer-sandbox", badge: "New" },
  { icon: QrCode, label: "QR Generator", path: "/qr-generator", badge: "New" },
  { icon: BookMarked, label: "API Docs Portal", path: "/api-docs" },
  { icon: Shield, label: "Role Sync", path: "/role-sync" },
  { icon: Building2, label: "NIP Banks", path: "/nip-banks", badge: "CBN" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: BookOpen, label: "Help Guide", path: "/docs/merchant-guide" },
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

  // Track which groups are expanded; default: expand the group containing the active route
  const activeGroup = navGroups.find(g => g.items.some(i => i.path === location || (location === "/" && i.path === "/dashboard")));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(activeGroup ? [activeGroup.title] : ["Overview"])
  );

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  // Auto-expand the group of the active route when navigating
  useEffect(() => {
    const group = navGroups.find(g => g.items.some(i => i.path === location));
    if (group) setExpandedGroups(prev => new Set(Array.from(prev).concat(group.title)));
  }, [location]);

  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isSubscribed, isLoading: pushLoading, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications();

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
    refetchInterval: 300_000,
    staleTime: 240_000,
  });
  const stripeItem = checklistData?.items.find((i: any) => i.id === "stripe_live_keys");
  const isTestMode = stripeItem?.status !== "ok";
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

  // ─── Reconciliation Alert Badge ──────────────────────────────────────────
  const { data: reconStats } = trpc.reconciliation.getStats.useQuery(
    { merchantId: undefined },
    { refetchInterval: 60_000, staleTime: 50_000 }
  );
  const { data: reconAlertSettings } = trpc.settings.getReconAlertSettings.useQuery(
    undefined,
    { staleTime: 5 * 60_000 }
  );
  const openReconCount = reconStats?.open ?? 0;
  const reconBadgeEnabled = reconAlertSettings?.reconAlertBadgeEnabled ?? true;
  const reconBadgeThreshold = reconAlertSettings?.reconAlertThreshold ?? 1;
  const showReconBadge = reconBadgeEnabled && openReconCount >= reconBadgeThreshold;

  const [reconDrawerOpen, setReconDrawerOpen] = useState(false);
  const { data: reconAlerts, refetch: refetchReconAlerts } = trpc.reconciliation.listAlerts.useQuery(
    { status: "open", limit: 20, offset: 0 },
    { enabled: reconDrawerOpen, staleTime: 30_000 }
  );
  const dismissReconAlert = trpc.reconciliation.dismissAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert dismissed");
      refetchReconAlerts();
      trpc.useUtils().reconciliation.getStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const resolveReconAlert = trpc.reconciliation.updateAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert marked as resolved");
      refetchReconAlerts();
      trpc.useUtils().reconciliation.getStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
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

  const renderNavItem = (item: NavItem) => {
    const isActive = location === item.path || (location === "/" && item.path === "/dashboard");
    const isReconItem = item.path === "/reconciliation-alerts";
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
            <span className="flex-1 text-sm">{item.label}</span>
            {isReconItem && showReconBadge && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReconDrawerOpen(true); }}
                className="focus:outline-none"
                title={`${openReconCount} open reconciliation alert${openReconCount !== 1 ? "s" : ""}`}
              >
                <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-red-500/20 text-red-400 border-0 min-w-[1.25rem] text-center hover:bg-red-500/30 transition-colors">
                  {openReconCount > 99 ? "99+" : openReconCount}
                </Badge>
              </button>
            )}
            {!isReconItem && item.badge && (
              <Badge variant="secondary" className={`text-xs px-1.5 py-0 ${
                item.badge === "Live" ? "bg-emerald-500/20 text-emerald-400 border-0"
                : item.badge === "AI" ? "bg-violet-500/20 text-violet-400 border-0"
                : item.badge === "Admin" ? "bg-amber-500/20 text-amber-400 border-0"
                : "bg-blue-500/20 text-blue-400 border-0"
              }`}>
                {item.badge}
              </Badge>
            )}
          </>
        )}
        {collapsed && isReconItem && showReconBadge && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
        )}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-sidebar-foreground text-lg" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              PayGate
            </span>
            <div className="text-xs text-sidebar-foreground/50">Merchant Portal</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {navGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.title);
          const hasActive = group.items.some(i => i.path === location || (location === "/" && i.path === "/dashboard"));

          if (collapsed) {
            // Collapsed: show only icons, no group headers
            return (
              <div key={group.title} className="mb-1">
                {group.items.map(renderNavItem)}
              </div>
            );
          }

          return (
            <div key={group.title} className="mb-1">
              {/* Group header — clickable to expand/collapse */}
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                  hasActive
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
                }`}
              >
                <group.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 text-left">{group.title}</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {/* Group items */}
              {isExpanded && (
                <div className="ml-2 pl-2 border-l border-sidebar-border/50 space-y-0.5 mb-2">
                  {group.items.map(renderNavItem)}
                </div>
              )}
            </div>
          );
        })}

        {/* Developer section */}
        {!collapsed && (
          <button
            type="button"
            onClick={() => toggleGroup("__dev__")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors mt-1"
          >
            <Code2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Developer</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expandedGroups.has("__dev__") ? "rotate-180" : ""}`} />
          </button>
        )}
        {(collapsed || expandedGroups.has("__dev__")) && (
          <div className={!collapsed ? "ml-2 pl-2 border-l border-sidebar-border/50 space-y-0.5 mb-2" : ""}>
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
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-sm">{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-blue-500/20 text-blue-400 border-0">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Onboarding Progress Tracker */}
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
            <div className="flex items-center gap-1">
              {/* Dark mode toggle */}
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors p-1 rounded"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              {/* Push notifications toggle */}
              <button
                onClick={isSubscribed ? unsubscribePush : subscribePush}
                disabled={pushLoading}
                title={isSubscribed ? 'Disable push notifications' : 'Enable push notifications'}
                className={`transition-colors p-1 rounded ${
                  isSubscribed
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-sidebar-foreground/40 hover:text-sidebar-foreground'
                }`}
              >
                {isSubscribed ? <BellRing className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </button>
              {/* Logout */}
              <button onClick={handleLogout} className="text-sidebar-foreground/40 hover:text-red-400 transition-colors p-1 rounded">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
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
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 translate-x-full bg-sidebar border border-sidebar-border rounded-r-lg p-1 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors z-10"
          style={{ left: collapsed ? "3.5rem" : "15.5rem" }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 bg-sidebar flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Fraud Alert Banner */}
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

        {/* SLA Breach Banner */}
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
            <button onClick={() => { promptInstall(); }} className="px-3 py-1 rounded bg-white text-indigo-700 font-semibold text-xs hover:bg-indigo-50 transition-colors">
              Install
            </button>
            <button onClick={() => { dismissInstall(); }} className="p-1 rounded hover:bg-indigo-500 transition-colors" aria-label="Dismiss">
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
          <button className="lg:hidden text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>

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
            {checklistData && !dismissedStripeBanner && (
              isTestMode ? (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="text-xs font-medium text-orange-700">Test Mode</span>
                  <button onClick={() => setDismissedStripeBanner(true)} className="ml-1 text-orange-400 hover:text-orange-600" title="Dismiss">
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
            {!checklistData && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-emerald-700">Live</span>
              </div>
            )}

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
      <LiveChatWidget />

      {/* Reconciliation Alert Drawer */}
      <Sheet open={reconDrawerOpen} onOpenChange={setReconDrawerOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Open Reconciliation Alerts
              {openReconCount > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">{openReconCount} open</span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {!reconAlerts || reconAlerts.alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                No open reconciliation alerts
              </div>
            ) : (
              reconAlerts.alerts.map((alert: any) => (
                <div key={alert.id} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{alert.alertType?.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{alert.merchantId} · {new Date(alert.createdAt).toLocaleDateString()}</p>
                    </div>
                    <Badge variant="secondary" className={`text-xs ${alert.severity === "critical" ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"} border-0`}>
                      {alert.severity}
                    </Badge>
                  </div>
                  {alert.description && <p className="text-xs text-muted-foreground">{alert.description}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resolveReconAlert.mutate({ id: alert.id, status: "resolved" })}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => dismissReconAlert.mutate({ id: alert.id })}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
