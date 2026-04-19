import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Banknote,
  FileText,
  Activity,
  ScrollText,
  Bell,
  Settings2,
  LogOut,
  ChevronRight,
  Shield,
  Users,
  Webhook,
  CreditCard,
  BarChart2,
  Flag,
  BookOpen,
  Key,
  Gauge,
  Terminal,
  RotateCcw,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";

const adminNavItems = [
  {
    group: "Overview",
    items: [
      { label: "Platform Overview", href: "/admin/overview", icon: LayoutDashboard },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "Merchant Management", href: "/admin/merchants", icon: Building2 },
      { label: "KYC Review Queue", href: "/admin/kyc", icon: ShieldCheck },
      { label: "Dispute Management", href: "/admin/disputes", icon: AlertTriangle },
      { label: "Settlement Management", href: "/admin/settlements", icon: Banknote },
    ],
  },
  {
    group: "Risk & Compliance",
    items: [
      { label: "Fraud Oversight", href: "/admin/fraud", icon: Shield },
      { label: "Compliance Reporting", href: "/admin/compliance", icon: FileText },
    ],
  },
  {
    group: "Analytics",
    items: [
      { label: "Revenue & Fees", href: "/admin/revenue", icon: TrendingUp },
    ],
  },
  {
    group: "Platform",
    items: [
      { label: "System Health", href: "/admin/health", icon: Activity },
      { label: "Audit Trail", href: "/admin/audit", icon: ScrollText },
      { label: "Notifications", href: "/admin/notifications", icon: Bell },
      { label: "Webhook Alerts", href: "/admin/webhook-alerts", icon: Webhook },
      { label: "Feature Flags", href: "/admin/feature-flags", icon: Flag },
      { label: "Merchant Risk", href: "/admin/merchant-risk", icon: Shield },
      { label: "Chargebacks", href: "/admin/chargebacks", icon: CreditCard },
      { label: "Help Analytics", href: "/admin/help-analytics", icon: BarChart2 },
      { label: "Audit Log", href: "/admin/audit-log", icon: BookOpen },
      { label: "API Playground", href: "/admin/api-playground", icon: Terminal },
      { label: "Rate Limits", href: "/admin/rate-limits", icon: Gauge },
      { label: "SDK Tokens", href: "/admin/sdk-tokens", icon: Key },
      { label: "Configuration", href: "/admin/config", icon: Settings2 },
    ],
  },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const kpiQuery = trpc.admin.overview.getKPIs.useQuery(undefined, { enabled: isAuthenticated });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-slate-400 text-sm animate-pulse">Loading admin portal...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl("/admin/overview");
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-800">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">PayGate Admin</p>
            <p className="text-xs text-slate-400">Platform Control</p>
          </div>
        </div>

        {/* KPI Quick Stats */}
        {kpiQuery.data && (
          <div className="px-4 py-3 border-b border-slate-800 grid grid-cols-2 gap-2">
            <div className="bg-slate-800 rounded-lg p-2 text-center">
              <p className="text-xs text-slate-400">Merchants</p>
              <p className="text-sm font-bold text-white">{kpiQuery.data.activeMerchants}</p>
            </div>
            <div className="bg-slate-800 rounded-lg p-2 text-center">
              <p className="text-xs text-slate-400">Disputes</p>
              <p className={cn("text-sm font-bold", kpiQuery.data.openDisputes > 0 ? "text-amber-400" : "text-white")}>
                {kpiQuery.data.openDisputes}
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {adminNavItems.map((group) => (
            <div key={group.group}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1">
                {group.group}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || location.startsWith(item.href + "/");
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors",
                        isActive
                          ? "bg-red-600/20 text-red-400 font-medium"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {isActive && <ChevronRight className="w-3 h-3" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-red-600 text-white text-xs">
                {user?.name?.charAt(0)?.toUpperCase() ?? "A"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.name ?? "Admin"}</p>
              <Badge variant="outline" className="text-xs border-red-600/50 text-red-400 px-1 py-0">
                Admin
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-slate-400 hover:text-white"
              onClick={() => logout()}
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Separator className="bg-slate-800 mt-2 mb-2" />
          <Link href="/dashboard">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer transition-colors">
              <Users className="w-3.5 h-3.5" />
              <span>Switch to Merchant Portal</span>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
