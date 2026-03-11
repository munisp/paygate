import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ArrowLeftRight, Users, CreditCard, BarChart3,
  ShoppingCart, Wallet, AlertTriangle, Key, Webhook, Settings,
  ChevronLeft, ChevronRight, Bell, Search, LogOut, Menu, X,
  Zap, Globe, Shield, Link2, Brain
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: ArrowLeftRight, label: "Transactions", path: "/transactions", badge: "Live" },
  { icon: Users, label: "Customers", path: "/customers" },
  { icon: CreditCard, label: "Virtual Cards", path: "/virtual-cards" },
  { icon: Wallet, label: "Payouts", path: "/payouts" },
  { icon: AlertTriangle, label: "Disputes", path: "/disputes", badge: "3" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: ShoppingCart, label: "Checkout", path: "/checkout" },
  { icon: Link2, label: "Payment Links", path: "/payment-links" },
  { icon: Brain, label: "Fraud & Risk", path: "/fraud-risk", badge: "AI" },
];

const devItems = [
  { icon: Key, label: "API Keys", path: "/api-keys" },
  { icon: Webhook, label: "Webhooks", path: "/webhooks" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    toast.success("Logged out successfully");
    navigate("/");
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
            <Link key={item.path} href={item.path}>
              <a
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
                            : "bg-red-500/20 text-red-400 border-0"
                        }`}
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </a>
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
            <Link key={item.path} href={item.path}>
              <a
                className={`sidebar-item ${isActive ? "active" : "text-sidebar-foreground/70"}`}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Environment badge */}
      {!collapsed && (
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
              AC
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">Acme Corp</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">admin@acmecorp.com</p>
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
          className="absolute left-0 top-1/2 -translate-y-1/2 translate-x-full bg-sidebar border border-sidebar-border rounded-r-lg p-1 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors z-10"
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
            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-700">Live</span>
            </div>

            {/* Notifications */}
            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
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
    </div>
  );
}
