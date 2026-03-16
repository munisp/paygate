/**
 * Consumer App Layout
 * Mobile-first bottom navigation layout for the consumer-facing PWA.
 * Separate from the merchant portal sidebar layout.
 *
 * 5-tab bottom nav: Wallet | Pay | Discover | History | Profile
 */
import { useLocation } from "wouter";
import { Wallet, Zap, Compass, Clock, User } from "lucide-react";
import OfflineIndicator from "@/components/OfflineIndicator";
import { trpc } from "@/lib/trpc";

const NAV_ITEMS = [
  { path: "/consumer", label: "Wallet", icon: Wallet, exact: true },
  { path: "/consumer/quick-pay", label: "Pay", icon: Zap },
  { path: "/consumer/discover", label: "Discover", icon: Compass },
  { path: "/consumer/history", label: "History", icon: Clock },
  { path: "/consumer/profile", label: "Profile", icon: User },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadData?.count ?? 0;

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
        <button
          onClick={() => navigate("/consumer/notifications")}
          className="relative p-2 rounded-full hover:bg-muted transition-colors"
          aria-label="Notifications"
        >
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
          )}
          <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>
      </header>

      {/* Page Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-background/95 backdrop-blur border-t border-border z-40">
        <div className="flex items-center justify-around px-2 py-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? location === item.path
              : location.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
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
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
