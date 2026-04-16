/**
 * Consumer Notifications
 * Mobile-first notification center for the consumer PWA.
 * Features: filter tabs, mark-all-read, dismiss, real-time polling,
 *           and Web Push subscription management (VAPID).
 */
import { useState } from "react";
import {
  Bell, BellOff, BellRing, Check, CheckCheck, Trash2,
  AlertTriangle, Info, CreditCard, ShieldAlert, Smartphone,
  Zap, X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type NotifType = "all" | "unread" | "payment" | "alert";

const TYPE_ICONS: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  fraud:   { icon: ShieldAlert,   color: "text-red-400",    bg: "bg-red-500/15" },
  payment: { icon: CreditCard,    color: "text-green-400",  bg: "bg-green-500/15" },
  dispute: { icon: AlertTriangle, color: "text-amber-400",  bg: "bg-amber-500/15" },
  system:  { icon: Info,          color: "text-blue-400",   bg: "bg-blue-500/15" },
  info:    { icon: Info,          color: "text-blue-400",   bg: "bg-blue-500/15" },
};

function timeAgo(date: Date | string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Push Subscription Banner ──────────────────────────────────────────────────
function PushSubscriptionBanner() {
  const { permission, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if already subscribed and no action needed
  if (dismissed) return null;

  // Already subscribed — show a compact status chip
  if (isSubscribed) {
    return (
      <div className="mx-5 mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-green-500/10 border border-green-500/20">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
          <BellRing className="w-4 h-4 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-400">Push alerts active</p>
          <p className="text-xs text-muted-foreground">
            You'll get notified instantly when payments arrive.
          </p>
        </div>
        <button
          onClick={() => unsubscribe()}
          disabled={isLoading}
          className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1 flex-shrink-0"
        >
          <BellOff className="w-3.5 h-3.5" />
          {isLoading ? "…" : "Turn off"}
        </button>
      </div>
    );
  }

  // Permission denied — show info
  if (permission === "denied") {
    return (
      <div className="mx-5 mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
        <BellOff className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <p className="text-xs text-amber-300 flex-1">
          Notifications blocked. Enable them in browser settings to receive payment alerts.
        </p>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Not yet subscribed — show CTA
  return (
    <div className="mx-5 mt-4 rounded-2xl bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/20 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Smartphone className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Enable push alerts</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get instant notifications when you receive money, a payment is due, or
            suspicious activity is detected.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => subscribe()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              {isLoading ? "Enabling…" : "Enable alerts"}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-2"
            >
              Not now
            </button>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ConsumerNotifications() {
  const [filter, setFilter] = useState<NotifType>("all");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.notifications.list.useQuery(
    { limit: 50 },
    { refetchInterval: 30_000, staleTime: 15_000 }
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      toast.success("All notifications marked as read");
    },
  });
  // dismiss = mark as read (no separate dismiss procedure)
  const dismiss = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  });

  const notifications: any[] = Array.isArray(data) ? data : [];
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  const filtered = notifications.filter((n: any) => {
    if (filter === "unread") return !n.isRead;
    if (filter === "payment") return n.type === "payment";
    if (filter === "alert") return n.type === "fraud" || n.type === "dispute";
    return true;
  });

  const TABS: { key: NotifType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` },
    { key: "payment", label: "Payments" },
    { key: "alert", label: "Alerts" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-700 to-slate-900 px-5 pt-12 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">Notifications</p>
            <h1 className="text-2xl font-bold text-white mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </h1>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Web Push Subscription Banner */}
      <PushSubscriptionBanner />

      {/* Filter Tabs */}
      <div className="px-5 mt-4">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((t: any) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === t.key
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification List */}
      <div className="px-5 mt-4 space-y-2">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-10 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No notifications</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {filter === "unread" ? "You're all caught up!" : "Nothing here yet"}
            </p>
          </div>
        ) : (
          filtered.map((notif) => {
            const meta = TYPE_ICONS[notif.type] ?? TYPE_ICONS.info;
            const IconComp = meta.icon;
            return (
              <div
                key={notif.id}
                className={`bg-card rounded-2xl border transition-all ${
                  notif.isRead ? "border-border opacity-70" : "border-primary/30 shadow-sm"
                }`}
              >
                <div className="flex gap-3 p-4">
                  <div
                    className={`w-10 h-10 rounded-full ${meta.bg} flex items-center justify-center flex-shrink-0`}
                  >
                    <IconComp className={`w-5 h-5 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm font-semibold ${
                          notif.isRead ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {notif.title}
                      </p>
                      {!notif.isRead && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notif.body}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                      {timeAgo(notif.createdAt)}
                    </p>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex border-t border-border">
                  {!notif.isRead && (
                    <button
                      onClick={() => markRead.mutate({ id: notif.id })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-primary font-medium hover:bg-primary/5 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => dismiss.mutate({ id: notif.id })}
                    className={`flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-red-400 transition-colors px-4 ${
                      notif.isRead ? "flex-1" : "border-l border-border"
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
