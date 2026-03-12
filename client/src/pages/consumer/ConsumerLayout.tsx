/**
 * Consumer Portal Layout
 * Mobile-first bottom navigation layout for the consumer-facing PWA.
 */
import { useLocation } from "wouter";
import { Wallet, Send, QrCode, Phone, User, Clock } from "lucide-react";
import OfflineIndicator from "@/components/OfflineIndicator";

const NAV_ITEMS = [
  { path: "/consumer", label: "Wallet", icon: Wallet },
  { path: "/consumer/send", label: "Send", icon: Send },
  { path: "/consumer/history", label: "History", icon: Clock },
  { path: "/consumer/bills", label: "Bills", icon: Phone },
  { path: "/consumer/profile", label: "Profile", icon: User },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();

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
                <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
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
