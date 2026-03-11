import { useState, useEffect } from "react";
import {
  Bell, X, AlertTriangle, XCircle, CheckCircle2, Webhook,
  Shield, DollarSign, Clock, ArrowRight, Trash2, CheckCheck,
  Zap, RefreshCw, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export type NotifType = "fraud" | "webhook" | "settlement" | "dispute" | "system" | "payment";

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  time: string;
  read: boolean;
  severity: "critical" | "warning" | "info" | "success";
  action?: string;
}

const INITIAL_NOTIFS: Notification[] = [
  { id: "n1", type: "fraud", title: "Critical Fraud Alert", message: "GraphSAGE detected a coordinated BIN attack — 47 card testing attempts from IP 185.220.101.x in the last 5 minutes. Auto-blocked.", time: "2 min ago", read: false, severity: "critical", action: "View in Fraud & Risk" },
  { id: "n2", type: "webhook", title: "Webhook Delivery Failed", message: "Endpoint https://api.acmecorp.com/webhooks failed 3 consecutive delivery attempts for event payment.success. Retrying in 30 min.", time: "8 min ago", read: false, severity: "warning", action: "View Webhooks" },
  { id: "n3", type: "settlement", title: "Settlement Processed", message: "₦4,287,500 has been settled to your GTBank account ending in 4521. Expected arrival: 1–2 business days.", time: "1 hr ago", read: false, severity: "success", action: "View Payouts" },
  { id: "n4", type: "dispute", title: "New Chargeback Filed", message: "Customer john.doe@example.com has filed a chargeback for transaction txn_8f2a9b (₦45,000). Respond within 7 days.", time: "2 hr ago", read: false, severity: "warning", action: "View Disputes" },
  { id: "n5", type: "fraud", title: "Account Takeover Attempt", message: "Unusual login pattern detected for merchant account. New device + new country (VPN). Session terminated.", time: "3 hr ago", read: true, severity: "critical" },
  { id: "n6", type: "webhook", title: "Webhook Endpoint Recovered", message: "Endpoint https://api.acmecorp.com/payments is now responding normally after 12 failed attempts.", time: "4 hr ago", read: true, severity: "info" },
  { id: "n7", type: "settlement", title: "Settlement Delayed", message: "Your NGN settlement scheduled for today has been delayed due to NIBSS maintenance. Expected: Tomorrow 9AM.", time: "5 hr ago", read: true, severity: "warning" },
  { id: "n8", type: "system", title: "API Rate Limit Warning", message: "You have used 87% of your hourly API rate limit (8,700 / 10,000 requests). Consider upgrading your plan.", time: "6 hr ago", read: true, severity: "warning", action: "Upgrade Plan" },
  { id: "n9", type: "payment", title: "Large Transaction Alert", message: "A single transaction of ₦2,500,000 was processed from a new customer. Flagged for review per your risk rules.", time: "8 hr ago", read: true, severity: "info", action: "Review Transaction" },
  { id: "n10", type: "system", title: "New API Version Available", message: "PayGate API v2.4 is now available with improved webhook reliability and sub-50ms latency. Migration guide available.", time: "1 day ago", read: true, severity: "info" },
];

const TYPE_CONFIG = {
  fraud: { icon: Shield, color: "text-red-600", bg: "bg-red-50" },
  webhook: { icon: Webhook, color: "text-orange-600", bg: "bg-orange-50" },
  settlement: { icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  dispute: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  system: { icon: Zap, color: "text-blue-600", bg: "bg-blue-50" },
  payment: { icon: CheckCircle2, color: "text-violet-600", bg: "bg-violet-50" },
};

const SEVERITY_STYLES = {
  critical: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-blue-500",
  success: "border-l-emerald-500",
};

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFS);
  const [filter, setFilter] = useState<"all" | NotifType>("all");
  const [liveMode, setLiveMode] = useState(true);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Simulate incoming notifications
  useEffect(() => {
    if (!liveMode || !open) return;
    const interval = setInterval(() => {
      const types: NotifType[] = ["fraud", "webhook", "settlement", "payment"];
      const type = types[Math.floor(Math.random() * types.length)];
      const newNotif: Notification = {
        id: `n_${Date.now()}`,
        type,
        title: type === "fraud" ? "New Fraud Signal Detected" : type === "webhook" ? "Webhook Event Queued" : type === "settlement" ? "Settlement Initiated" : "Payment Received",
        message: type === "fraud" ? "ML model flagged a suspicious transaction with 94% confidence score." : type === "webhook" ? "payment.success event queued for delivery to your endpoint." : type === "settlement" ? "₦" + (Math.floor(Math.random() * 5000000) + 100000).toLocaleString() + " settlement batch initiated." : "New payment of ₦" + (Math.floor(Math.random() * 200000) + 1000).toLocaleString() + " received.",
        time: "Just now",
        read: false,
        severity: type === "fraud" ? "critical" : type === "webhook" ? "warning" : "success",
      };
      setNotifications(prev => [newNotif, ...prev.slice(0, 19)]);
    }, 12000);
    return () => clearInterval(interval);
  }, [liveMode, open]);

  const filtered = filter === "all" ? notifications : notifications.filter(n => n.type === filter);

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success("All notifications marked as read");
  };

  const markRead = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const deleteNotif = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));
  const clearAll = () => { setNotifications([]); toast.success("All notifications cleared"); };

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />}

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-background border-l border-border shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-foreground" />
            <span className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Notifications</span>
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs border-0 px-1.5 py-0">{unreadCount}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLiveMode(p => !p)} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${liveMode ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${liveMode ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
              Live
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border flex-shrink-0">
          <div className="flex gap-1">
            {(["all", "fraud", "webhook", "settlement", "dispute"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Mark all read">
                <CheckCheck className="w-4 h-4" />
              </button>
            )}
            <button onClick={clearAll} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors" title="Clear all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Bell className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No notifications</p>
              <p className="text-xs text-muted-foreground/60 mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(n => {
                const cfg = TYPE_CONFIG[n.type];
                return (
                  <div
                    key={n.id}
                    className={`relative px-5 py-4 border-l-4 ${SEVERITY_STYLES[n.severity]} ${!n.read ? "bg-primary/[0.03]" : "bg-background"} hover:bg-muted/30 transition-colors group`}
                    onClick={() => markRead(n.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-semibold leading-tight ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                          <button
                            onClick={e => { e.stopPropagation(); deleteNotif(n.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-all flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground/60">{n.time}</span>
                          {n.action && (
                            <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={e => { e.stopPropagation(); toast.info(`Navigating to ${n.action}`); }}>
                              {n.action} <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {!n.read && <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex-shrink-0">
          <button className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />View notification history
          </button>
        </div>
      </div>
    </>
  );
}

// Export the unread count hook for use in Layout
export function useNotificationCount() {
  return INITIAL_NOTIFS.filter(n => !n.read).length;
}
