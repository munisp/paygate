/**
 * Consumer App Layout
 * Mobile-first layout for the consumer-facing PWA.
 * 5 primary bottom tabs + "More" drawer exposing all 20+ pages.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Wallet, Zap, Compass, Clock, User, Globe, Bell,
  CreditCard, FileText, Users, Gift, Tag, QrCode,
  ArrowDownLeft, RefreshCw, Shield, BarChart2,
  AlertTriangle, Umbrella, MoreHorizontal, X,
  ChevronRight, Repeat, Lock, Fingerprint, Send, Settings, BookOpen,
  Coins, PieChart, TrendingUp, BarChart3
} from "lucide-react";
import OfflineIndicator from "@/components/OfflineIndicator";
import { trpc } from "@/lib/trpc";

// Primary bottom nav (always visible)
const PRIMARY_TABS = [
  { path: "/consumer", label: "Wallet", icon: Wallet, exact: true },
  { path: "/consumer/quick-pay", label: "Pay", icon: Zap },
  { path: "/consumer/discover", label: "Discover", icon: Compass },
  { path: "/consumer/history", label: "History", icon: Clock },
  { path: "/consumer/profile", label: "Profile", icon: User },
];

// All additional pages grouped for the "More" drawer
const MORE_SECTIONS = [
  {
    title: "Payments",
    items: [
      { path: "/consumer/send", label: "Send Money", icon: Send },
      { path: "/consumer/qr-scan", label: "QR Scan & Pay", icon: QrCode },
      { path: "/consumer/request-money", label: "Request Money", icon: ArrowDownLeft },
      { path: "/consumer/split-bill", label: "Split Bill", icon: Users },
      { path: "/consumer/recurring", label: "Recurring Payments", icon: Repeat },
      { path: "/consumer/bills", label: "Bill Pay", icon: FileText },
    ],
  },
  {
    title: "Cards & Finance",
    items: [
      { path: "/consumer/card", label: "My Card", icon: CreditCard },
      { path: "/consumer/cross-border", label: "International Transfer", icon: Globe },
      { path: "/consumer/analytics", label: "Spending Analytics", icon: BarChart2 },
    ],
  },
  {
    title: "Rewards & Offers",
    items: [
      { path: "/consumer/loyalty", label: "Loyalty Points", icon: Gift },
      { path: "/consumer/loyalty-dashboard", label: "Rewards Dashboard", icon: Gift },
      { path: "/consumer/coupons", label: "Coupons & Offers", icon: Tag },
    ],
  },
  {
    title: "People",
    items: [
      { path: "/consumer/contacts", label: "Contacts", icon: Users },
    ],
  },
  {
    title: "Security & Compliance",
    items: [
      { path: "/consumer/kyc", label: "Identity Verification", icon: Fingerprint },
      { path: "/consumer/pin", label: "PIN Setup", icon: Lock },
      { path: "/consumer/disputes", label: "Disputes", icon: AlertTriangle },
    ],
  },
  {
    title: "Financial Services",
    items: [
      { path: "/consumer/portfolio", label: "Portfolio Summary", icon: BarChart3 },
      { path: "/consumer/portfolio/rebalance", label: "Rebalance", icon: TrendingUp },
      { path: "/consumer/gold", label: "Digital Gold", icon: Coins },
      { path: "/consumer/mutual-funds", label: "Mutual Funds", icon: PieChart },
      { path: "/consumer/pension", label: "Pension", icon: Shield },
      { path: "/consumer/emi", label: "EMI Loans", icon: CreditCard },
      { path: "/consumer/remittance", label: "Send Abroad", icon: Globe },
      { path: "/consumer/insurance", label: "Insurance", icon: Umbrella },
      { path: "/consumer/claims", label: "Claims Tracker", icon: FileText },
      { path: "/consumer/bnpl-repayments", label: "BNPL Repayments", icon: CreditCard },
      { path: "/consumer/subscriptions", label: "Subscriptions", icon: RefreshCw },
      { path: "/consumer/sip", label: "SIP Scheduler", icon: RefreshCw },
    ],
  },
  {
    title: "Notifications & Statements",
    items: [
      { path: "/consumer/notification-centre", label: "Notification Centre", icon: Bell },
      { path: "/consumer/notifications/settings", label: "Notification Settings", icon: Settings },
      { path: "/consumer/statement", label: "Wallet Statement", icon: FileText },
      { path: "/consumer/help", label: "Help Guide", icon: BookOpen },
    ],
  },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  // Check if current page is in "More" section
  const isMoreActive = MORE_SECTIONS.some(section =>
    section.items.some(item => location.startsWith(item.path))
  );

  const handleNavTo = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto relative shadow-xl">
      {/* App Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold">P</span>
          </div>
          <span className="font-semibold text-sm">PayGate</span>
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Consumer</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/consumer/cross-border")}
            className="relative p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="International Transfer"
            title="International Transfer"
          >
            <Globe className="w-5 h-5 text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate("/consumer/notifications")}
            className="relative p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Notifications"
          >
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
            )}
            <Bell className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-background/95 backdrop-blur border-t border-border z-40">
        <div className="flex items-center justify-around px-2 py-1.5">
          {PRIMARY_TABS.map((item) => {
            const isActive = item.exact
              ? location === item.path
              : location.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => { setMoreOpen(false); navigate(item.path); }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`relative p-1.5 rounded-xl transition-all ${isActive ? "bg-primary/10" : ""}`}>
                  <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? "font-semibold" : ""}`}>{item.label}</span>
              </button>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
              moreOpen || isMoreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className={`relative p-1.5 rounded-xl transition-all ${moreOpen || isMoreActive ? "bg-primary/10" : ""}`}>
              <MoreHorizontal className={`w-5 h-5 ${moreOpen || isMoreActive ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
            </div>
            <span className={`text-[10px] font-medium ${moreOpen || isMoreActive ? "font-semibold" : ""}`}>More</span>
          </button>
        </div>
      </nav>

      {/* "More" Drawer — slides up from bottom */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 bg-background rounded-t-2xl shadow-2xl border-t border-border max-h-[75vh] overflow-y-auto">
            {/* Handle */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold">More Features</h2>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1.5 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-3" />

            {/* Sections */}
            <div className="pb-6">
              {MORE_SECTIONS.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="px-5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </p>
                  <div className="grid grid-cols-3 gap-2 px-4">
                    {section.items.map((item) => {
                      const isActive = location.startsWith(item.path);
                      return (
                        <button
                          key={item.path}
                          onClick={() => handleNavTo(item.path)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all border ${
                            isActive
                              ? "bg-primary/10 border-primary/30 text-primary"
                              : "bg-muted/40 border-transparent text-foreground hover:bg-muted"
                          }`}
                        >
                          <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                          <span className="text-[10px] font-medium text-center leading-tight">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <OfflineIndicator />
    </div>
  );
}
