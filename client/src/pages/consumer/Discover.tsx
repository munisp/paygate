/**
 * Discover — Consumer Feature Hub
 * WeChat-style feature grid linking to every consumer capability.
 * Accessible from the "Discover" tab in the bottom nav.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  QrCode, ArrowDownToLine, Users, Gift, Receipt, CreditCard,
  RefreshCw, Scissors, Shield, BadgeCheck, Phone, Star, Tag,
  Send, Bell, Clock, Wallet, ChevronRight, Search,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

interface FeatureSection {
  title: string;
  items: {
    icon: React.ElementType;
    label: string;
    path: string;
    color: string;
    badge?: string;
  }[];
}

const SECTIONS: FeatureSection[] = [
  {
    title: "Payments",
    items: [
      { icon: Send,           label: "Send Money",       path: "/consumer/send",           color: "bg-blue-500/15 text-blue-600" },
      { icon: QrCode,         label: "Scan QR",          path: "/consumer/qr-scan",        color: "bg-violet-500/15 text-violet-600" },
      { icon: ArrowDownToLine,label: "Request Money",    path: "/consumer/request-money",  color: "bg-emerald-500/15 text-emerald-600" },
      { icon: Scissors,       label: "Split Bill",       path: "/consumer/split-bill",     color: "bg-orange-500/15 text-orange-600" },
    ],
  },
  {
    title: "Bills & Top-Up",
    items: [
      { icon: Phone,          label: "Pay Bills",        path: "/consumer/bills",          color: "bg-green-500/15 text-green-600" },
      { icon: Wallet,         label: "Top Up Wallet",    path: "/consumer",                color: "bg-indigo-500/15 text-indigo-600" },
      { icon: RefreshCw,      label: "Recurring",        path: "/consumer/recurring",      color: "bg-cyan-500/15 text-cyan-600" },
      { icon: Tag,            label: "Coupons",          path: "/consumer/coupons",        color: "bg-pink-500/15 text-pink-600" },
    ],
  },
  {
    title: "Social & Rewards",
    items: [
      { icon: Gift,           label: "Red Envelopes",    path: "/consumer/red-envelope",   color: "bg-red-500/15 text-red-600", badge: "🧧" },
      { icon: Star,           label: "Loyalty Points",   path: "/consumer/loyalty",        color: "bg-amber-500/15 text-amber-600" },
      { icon: Users,          label: "Contacts",         path: "/consumer/contacts",       color: "bg-teal-500/15 text-teal-600" },
      { icon: Bell,           label: "Notifications",    path: "/consumer/notifications",  color: "bg-slate-500/15 text-slate-600" },
    ],
  },
  {
    title: "Account & Security",
    items: [
      { icon: CreditCard,     label: "Virtual Card",     path: "/consumer/card",           color: "bg-purple-500/15 text-purple-600" },
      { icon: Shield,         label: "Set PIN",           path: "/consumer/pin",            color: "bg-rose-500/15 text-rose-600" },
      { icon: BadgeCheck,     label: "Verify Identity",  path: "/consumer/kyc",            color: "bg-lime-500/15 text-lime-600" },
      { icon: Clock,          label: "History",          path: "/consumer/history",        color: "bg-gray-500/15 text-gray-600" },
      { icon: Receipt,        label: "Bill History",     path: "/consumer/bills",          color: "bg-yellow-500/15 text-yellow-600" },
    ],
  },
];

export default function Discover() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch wallet balance for the quick stats banner
  const {isLoading, data: walletData} = trpc.consumerWallet.getBalance.useQuery(
    { currency: "NGN" },
    { staleTime: 60_000 }
  );
  const balanceKobo = walletData?.balanceKobo ?? 0;
  const balanceNGN = (balanceKobo / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });

  // Filter sections by search query
  const filteredSections = SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item =>
      !searchQuery || item.label.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(section => section.items.length > 0);

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-4 space-y-6 pb-8">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-foreground">Discover</h1>
        <p className="text-sm text-muted-foreground mt-0.5">All your financial tools in one place</p>
      </div>

      {/* Wallet Balance Banner */}
      {walletData && (
        <div className="bg-primary/10 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">NGN Wallet Balance</p>
            <p className="text-xl font-bold text-primary mt-0.5">{balanceNGN}</p>
          </div>
          <button
            onClick={() => navigate("/consumer")}
            className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-xl hover:bg-primary/90 transition-colors"
          >
            Top Up
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search features..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-4 text-sm rounded-xl border border-input bg-card focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Feature Sections */}
      {filteredSections.map((section) => (
        <div key={section.title}>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {section.title}
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {section.items.map((item) => (
              <button
                key={item.path + item.label}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-95"
              >
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${item.color}`}>
                  {item.badge ? (
                    <span className="text-xl">{item.badge}</span>
                  ) : (
                    <item.icon className="w-5 h-5" />
                  )}
                </div>
                <span className="text-[10px] font-medium text-center leading-tight text-foreground">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Quick Access List */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Quick Access
        </h2>
        <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {[
            { icon: QrCode,    label: "Scan & Pay",         sub: "Pay any merchant QR code",    path: "/consumer/qr-scan" },
            { icon: Gift,      label: "Send Red Envelope",  sub: "Send money as a gift",        path: "/consumer/red-envelope" },
            { icon: Users,     label: "Split with Friends", sub: "Divide bills equally",        path: "/consumer/split-bill" },
            { icon: CreditCard,label: "My Virtual Card",    sub: "Online payments & e-commerce",path: "/consumer/card" },
            { icon: Star,      label: "Loyalty Points",     sub: "Earn & redeem rewards",       path: "/consumer/loyalty" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-muted/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
