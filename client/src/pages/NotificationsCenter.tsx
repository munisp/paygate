import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useResilientSSE } from "@/lib/resilientSSE";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Filter,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Type config ────────────────────────────────────────────────────────────

// ─── SSE Hook for real-time notifications ───────────────────────────────────
function useNotificationSSE(onEvent: (event: any) => void) {
  useResilientSSE<unknown>({
    url: "/api/notifications/stream",
    pollUrl: "/api/trpc/notifications.list",
    pollIntervalMs: 20_000,
    onMessage: (data) => {
      try {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        onEvent(parsed);
      } catch {}
    },
    heartbeatTimeoutSec: 60,
    pauseOnHidden: false,
  });
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  fraud: { icon: Shield, color: "text-red-600", bg: "bg-red-50 border-red-100", label: "Fraud" },
  fraud_alert: { icon: Shield, color: "text-red-600", bg: "bg-red-50 border-red-100", label: "Fraud" },
  high_risk_tx: { icon: Shield, color: "text-red-600", bg: "bg-red-50 border-red-100", label: "Risk" },
  webhook: { icon: Webhook, color: "text-orange-600", bg: "bg-orange-50 border-orange-100", label: "Webhook" },
  settlement: { icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", label: "Settlement" },
  dispute: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-100", label: "Dispute" },
  dispute_opened: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-100", label: "Dispute" },
  dispute_escalated: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-100", label: "Dispute" },
  dispute_resolved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", label: "Dispute" },
  system: { icon: Zap, color: "text-blue-600", bg: "bg-blue-50 border-blue-100", label: "System" },
  payment: { icon: CheckCircle2, color: "text-violet-600", bg: "bg-violet-50 border-violet-100", label: "Payment" },
  kyc_submitted: { icon: Shield, color: "text-blue-600", bg: "bg-blue-50 border-blue-100", label: "KYC" },
  kyc_approved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", label: "KYC" },
  payout_initiated: { icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50 border-blue-100", label: "Payout" },
  payout_approved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", label: "Payout" },
  consumer_transfer: { icon: DollarSign, color: "text-violet-600", bg: "bg-violet-50 border-violet-100", label: "Transfer" },
};

const ENTITY_PATHS: Record<string, string> = {
  dispute: "/disputes",
  payout: "/payouts",
  transaction: "/transactions",
  kyc: "/compliance",
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { icon: Zap, color: "text-blue-600", bg: "bg-blue-50 border-blue-100", label: "System" };
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

type FilterTab = "all" | "unread" | "fraud" | "payment" | "dispute" | "system";

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "All",
  unread: "Unread",
  fraud: "Fraud & Risk",
  payment: "Payments",
  dispute: "Disputes",
  system: "System",
};

const FRAUD_TYPES = new Set(["fraud", "fraud_alert", "high_risk_tx"]);
const PAYMENT_TYPES = new Set(["payment", "settlement", "payout_initiated", "payout_approved", "consumer_transfer"]);
const DISPUTE_TYPES = new Set(["dispute", "dispute_opened", "dispute_escalated", "dispute_resolved"]);
const SYSTEM_TYPES = new Set(["system", "webhook", "kyc_submitted", "kyc_approved"]);

function matchesFilter(notif: any, filter: FilterTab, search: string): boolean {
  const q = search.toLowerCase().trim();
  if (q && !notif.title?.toLowerCase().includes(q) && !notif.body?.toLowerCase().includes(q)) return false;
  if (filter === "unread") return !notif.isRead;
  if (filter === "fraud") return FRAUD_TYPES.has(notif.type);
  if (filter === "payment") return PAYMENT_TYPES.has(notif.type);
  if (filter === "dispute") return DISPUTE_TYPES.has(notif.type);
  if (filter === "system") return SYSTEM_TYPES.has(notif.type);
  return true;
}

export default function NotificationsCenter() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  // ─── Push notification opt-in state ───────────────────────────────────────
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [pushRegistering, setPushRegistering] = useState(false);

  const registerDeviceMutation = trpc.pushTokens.register.useMutation({
    onSuccess: () => {
      toast.success('Push alerts enabled', { description: 'You will receive real-time fraud, payout, and dispute alerts.' });
    },
    onError: (err) => toast.error('Failed to enable alerts', { description: err.message }),
  });

  const handleEnablePush = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('Push notifications are not supported in this browser.');
      return;
    }
    setPushRegistering(true);
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission === 'granted') {
        const deviceId = `web_${Date.now()}`;
        const pseudoToken = `web_push_${btoa(window.location.origin)}_${Date.now()}`;
        await registerDeviceMutation.mutateAsync({
          token: pseudoToken,
          platform: 'fcm',
          deviceId,
          appVersion: '1.0.0',
        });
      } else {
        toast.error('Permission denied', { description: 'Enable notifications in your browser settings to receive alerts.' });
      }
    } catch (err: any) {
      toast.error('Failed to request permission', { description: err?.message });
    } finally {
      setPushRegistering(false);
    }
  };

  const { data: listData, isLoading, refetch } = trpc.notifications.list.useQuery(
    { limit: 100, unreadOnly: false },
    { refetchInterval: 15_000 }
  );
  const notifications = listData?.notifications;
  const { data: countData } = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 15_000 });

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      toast.success("All notifications marked as read");
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
    onError: (err) => toast.error("Failed to mark all read", { description: err.message }),
  });

  const filtered = useMemo(() => {
    if (!notifications) return [];
    return (notifications as any[]).filter((n: any) => matchesFilter(n, filter, search));
  }, [notifications, filter, search]);

  const unreadCount = countData?.count ?? 0;
  const unreadInView = filtered.filter((n: any) => !n.isRead).length;

  const handleClick = (notif: any) => {
    if (!notif.isRead) {
      markReadMutation.mutate({ id: notif.id });
    }
    // Navigate to entity if applicable
    if (notif.entityType && ENTITY_PATHS[notif.entityType]) {
      const path = notif.entityId
        ? `${ENTITY_PATHS[notif.entityType]}/${notif.entityId}`
        : ENTITY_PATHS[notif.entityType];
      navigate(path);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs px-2 py-0.5">{unreadCount} new</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Real-time alerts for payments, disputes, fraud, and system events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/notifications/preferences")}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Preferences
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Push notification opt-in banner */}
      {pushPermission === 'default' && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-indigo-900">Enable push alerts</p>
            <p className="text-xs text-indigo-600">Get real-time alerts for fraud, payouts, and disputes — even when the tab is closed.</p>
          </div>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex-shrink-0"
            onClick={handleEnablePush}
            disabled={pushRegistering}
          >
            {pushRegistering ? 'Enabling…' : 'Enable Alerts'}
          </Button>
        </div>
      )}
      {pushPermission === 'granted' && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          Push alerts are enabled. You'll receive real-time notifications for fraud, payouts, and disputes.
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Tabs value={filter} onValueChange={(v: any) => setFilter(v as FilterTab)} className="flex-1">
          <TabsList className="h-8 gap-0.5 flex-wrap">
            {(Object.keys(FILTER_LABELS) as FilterTab[]).map((tab) => (
              <TabsTrigger key={tab} value={tab} className="h-7 text-xs px-2.5">
                {FILTER_LABELS[tab]}
                {tab === "unread" && unreadCount > 0 && (
                  <span className="ml-1 bg-red-500 text-white rounded-full text-[10px] px-1.5 py-0">{unreadCount}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search notifications…"
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: (notifications as any[])?.length ?? 0, icon: Bell, color: "text-blue-600" },
          { label: "Unread", value: unreadCount, icon: BellOff, color: "text-red-500" },
          { label: "In view", value: filtered.length, icon: Filter, color: "text-muted-foreground" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <div>
                  <p className="text-lg font-bold leading-none">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Notification list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Bell className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold text-muted-foreground">
            {search ? "No notifications match your search" : "No notifications yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Try a different search term or clear the filter." : "Alerts for payments, disputes, and fraud will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Unread batch header */}
          {unreadInView > 0 && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Unread ({unreadInView})
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
          {filtered.map((notif) => {
            const cfg = getTypeConfig(notif.type);
            const Icon = cfg.icon;
                  const isUnread = !notif.isRead;
            const hasLink = notif.entityType && ENTITY_PATHS[notif.entityType];
            return (
              <div
                key={notif.id}
                className={`
                  group relative flex gap-3 p-4 rounded-xl border transition-all cursor-pointer
                  ${isUnread ? `${cfg.bg} shadow-sm` : "bg-background border-border hover:bg-muted/40"}
                  ${hasLink ? "hover:shadow-md" : ""}
                `}
                onClick={() => handleClick(notif)}
              >
                {/* Unread dot */}
                {isUnread && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-500" />
                )}

                {/* Icon */}
                <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isUnread ? "bg-white/80" : "bg-muted"}`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className={`text-sm font-semibold leading-tight ${isUnread ? "" : "text-muted-foreground"}`}>
                        {notif.title}
                      </p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {formatTime(notif.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                  {hasLink && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      View details <ChevronRight className="h-3 w-3" />
                    </div>
                  )}
                </div>

                {/* Mark read button */}
                {isUnread && (
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/60"
                    onClick={(e: any) => {
                      e.stopPropagation();
                      markReadMutation.mutate({ id: notif.id });
                    }}
                    title="Mark as read"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Read divider */}
          {unreadInView > 0 && filtered.some((n: any) => n.isRead) && (
            <div className="flex items-center gap-2 px-1 pt-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Earlier</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
        </div>
      )}

      {/* Footer hint */}
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pb-4">
          Showing {filtered.length} notification{filtered.length !== 1 ? "s" : ""} — auto-refreshes every 15 seconds
        </p>
      )}
    </div>
  );
}
