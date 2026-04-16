import { trpc } from "@/lib/trpc";
import { useEffect } from "react";
import {
  AlertTriangle, Bell, CheckCheck, ChevronRight,
  DollarSign, RefreshCw, Shield, Webhook, X, Zap, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  fraud: { icon: Shield, color: "text-red-600", bg: "bg-red-50" },
  fraud_alert: { icon: Shield, color: "text-red-600", bg: "bg-red-50" },
  high_risk_tx: { icon: Shield, color: "text-red-600", bg: "bg-red-50" },
  webhook: { icon: Webhook, color: "text-orange-600", bg: "bg-orange-50" },
  settlement: { icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  dispute: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  dispute_opened: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  dispute_escalated: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  dispute_resolved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  system: { icon: Zap, color: "text-blue-600", bg: "bg-blue-50" },
  payment: { icon: CheckCircle2, color: "text-violet-600", bg: "bg-violet-50" },
  kyc_submitted: { icon: Shield, color: "text-blue-600", bg: "bg-blue-50" },
  kyc_approved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  payout_initiated: { icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
  payout_approved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  consumer_transfer: { icon: DollarSign, color: "text-violet-600", bg: "bg-violet-50" },
};

const ENTITY_PATHS: Record<string, string> = {
  dispute: "/disputes",
  payout: "/payouts",
  transaction: "/transactions",
  kyc: "/compliance",
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { icon: Zap, color: "text-blue-600", bg: "bg-blue-50" };
}

function formatTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
}

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const { data: listData, isLoading, refetch } = trpc.notifications.list.useQuery(
    { limit: 50, unreadOnly: false },
    { enabled: open, refetchInterval: open ? 15000 : false }
  );
  const notifs = listData?.notifications ?? [];

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("All notifications marked as read");
    },
  });

  const unreadCount = listData?.unreadCount ?? notifs.filter((n: any) => !n.isRead).length;

  useEffect(() => {
    if (open) refetch();
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[400px] max-w-[100vw] z-50 bg-background border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Notifications</h2>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Mark all read */}
        {unreadCount > 0 && (
          <div className="flex items-center justify-end px-5 py-2 border-b border-border flex-shrink-0">
            <button
              onClick={() => markAllReadMutation.mutate()}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all as read
            </button>
          </div>
        )}
        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-3 p-5">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Bell className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No notifications</p>
              <p className="text-xs text-muted-foreground/60 mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifs.map((n: any) => {
                const cfg = getTypeConfig(n.type);
                return (
                  <div
                    key={n.id}
                    className={`relative px-5 py-4 border-l-4 ${
                      n.isRead
                        ? "border-l-transparent bg-background"
                        : "border-l-primary bg-primary/[0.03]"
                    } hover:bg-muted/30 transition-colors cursor-pointer`}
                    onClick={() => {
                      if (!n.isRead) markReadMutation.mutate({ id: n.id });
                      const path = n.entityType ? ENTITY_PATHS[n.entityType] : null;
                      if (path) { navigate(path); onClose(); }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}
                      >
                        <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-semibold leading-tight ${
                            n.isRead ? "text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                          {n.body}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground/60">
                            {formatTime(n.createdAt)}
                          </span>
                          {n.entityType && ENTITY_PATHS[n.entityType] && (
                            <button
                              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              onClick={e => {
                                e.stopPropagation();
                                const path = ENTITY_PATHS[n.entityType!];
                                if (path) { navigate(path); onClose(); }
                              }}
                            >
                              View <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {!n.isRead && (
                      <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex-shrink-0 text-center">
          <p className="text-xs text-muted-foreground">
            Notifications are stored for 30 days
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * Hook to get the live unread notification count for the sidebar badge.
 * Polls every 30 seconds when the user is authenticated.
 */
export function useNotificationCount(): number {
  const { data } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
    retry: false,
  });
  return data?.count ?? 0;
}
