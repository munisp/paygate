/**
 * Consumer Portal Layout
 * Mobile-first bottom navigation layout for the consumer-facing PWA.
 */
import { useLocation } from "wouter";
import { Wallet, Send, QrCode, Phone, User, Clock, Zap, Bell, Gift } from "lucide-react";
import OfflineIndicator from "@/components/OfflineIndicator";
import { trpc } from "@/lib/trpc";

const NAV_ITEMS = [
  { path: "/consumer", label: "Wallet", icon: Wallet },
  { path: "/consumer/send", label: "Send", icon: Send },
  { path: "/consumer/quick-pay", label: "Pay", icon: Zap },
  { path: "/consumer/red-envelope", label: "Gifts", icon: Gift },
  { path: "/consumer/notifications", label: "Alerts", icon: Bell },
  { path: "/consumer/profile", label: "Profile", icon: User },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, { staleTime: 30_000, refetchInterval: 60_000 });
  const unreadCount = unreadData?.count ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto relative">
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-background/95 backdrop-blur border-t border-border z-40">
        <div className="flex items-center justify-around px-2 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path || (item.path !== "/consumer" && location.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative">
                  <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                  {item.label === "Alerts" && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
