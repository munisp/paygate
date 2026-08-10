/**
 * Merchant Notification Preferences
 * /notifications/preferences
 *
 * Allows merchants to control which channels (push, in-app, email, SMS, webhook)
 * and event categories (payment, dispute, payout, fraud, KYC, system) trigger alerts.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bell, Smartphone, Mail, MessageSquare, Webhook, Monitor,
  CreditCard, Gavel, Wallet, Shield, Fingerprint, Settings,
  Loader2, ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChannelRow({
  icon: Icon, label, description, enabled, onToggle, badge,
}: {
  icon: React.ElementType; label: string; description: string;
  enabled: boolean; onToggle: () => void; badge?: string;
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
      enabled ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 rounded-lg shrink-0 ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{label}</p>
            {badge && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{badge}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} className="shrink-0 ml-3" />
    </div>
  );
}

function EventRow({
  icon: Icon, label, enabled, onToggle,
}: {
  icon: React.ElementType; label: string; enabled: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MerchantNotificationPreferences() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: prefs, isLoading } = trpc.notificationPreferences.get.useQuery();

  const updateMutation = trpc.notificationPreferences.update.useMutation({
    onSuccess: () => {
      utils.notificationPreferences.get.invalidate();
      toast.success("Preferences saved");
    },
    onError: () => toast.error("Failed to save preferences"),
  });
  // keep legacy alias for toggle helper
  const update = updateMutation;

  const toggle = (field: string) => {
    if (!prefs) return;
    update.mutate({ [field]: !(prefs as any)[field] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!prefs) return null;

  const isSaving = update.isPending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/notifications")}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Notification Preferences</h1>
          <p className="text-sm text-muted-foreground">Choose how and when you receive merchant alerts</p>
        </div>
        {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Channels */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Delivery Channels
        </h2>
        <div className="space-y-2">
          <ChannelRow
            icon={Smartphone} label="Push Notifications" description="Real-time browser/device alerts"
            enabled={prefs.pushEnabled} onToggle={() => toggle("pushEnabled")}
          />
          <ChannelRow
            icon={Monitor} label="In-App Notifications" description="Bell icon alerts inside the portal"
            enabled={prefs.inAppEnabled} onToggle={() => toggle("inAppEnabled")}
          />
          <ChannelRow
            icon={Mail} label="Email Notifications" description="Summaries and receipts to your inbox"
            enabled={prefs.emailEnabled} onToggle={() => toggle("emailEnabled")}
          />
          <ChannelRow
            icon={MessageSquare} label="SMS Notifications" description="Text alerts for critical events"
            enabled={prefs.smsEnabled} onToggle={() => toggle("smsEnabled")}
            badge="Premium"
          />
          <ChannelRow
            icon={Webhook} label="Webhook Delivery" description="POST events to your registered webhook URL"
            enabled={prefs.webhookEnabled} onToggle={() => toggle("webhookEnabled")}
          />
        </div>
      </section>

      <Separator />

      {/* Event categories */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Event Categories
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Choose which event types trigger notifications across all enabled channels.
        </p>
        <div className="bg-card rounded-xl border border-border px-3 py-1">
          <EventRow
            icon={CreditCard} label="Payments & Transactions"
            enabled={prefs.eventPayment} onToggle={() => toggle("eventPayment")}
          />
          <EventRow
            icon={Gavel} label="Disputes & Chargebacks"
            enabled={prefs.eventDispute} onToggle={() => toggle("eventDispute")}
          />
          <EventRow
            icon={Wallet} label="Payouts & Settlements"
            enabled={prefs.eventPayout} onToggle={() => toggle("eventPayout")}
          />
          <EventRow
            icon={Shield} label="Fraud & Risk Alerts"
            enabled={prefs.eventFraud} onToggle={() => toggle("eventFraud")}
          />
          <EventRow
            icon={Fingerprint} label="KYC / Compliance Events"
            enabled={prefs.eventKyc} onToggle={() => toggle("eventKyc")}
          />
          <EventRow
            icon={Settings} label="System & Platform Updates"
            enabled={prefs.eventSystem} onToggle={() => toggle("eventSystem")}
          />
        </div>
      </section>

      <Separator />

      {/* Digest Frequency */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Email Digest Frequency
        </h2>
        <div className="bg-card border rounded-xl p-5">
          <p className="text-sm text-muted-foreground mb-4">
            Choose how often you receive email digest summaries of your account activity.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["realtime", "daily", "weekly", "never"] as const).map(freq => (
              <button
                key={freq}
                onClick={() => update.mutate({ digestFrequency: freq })}
                className={`py-3 px-4 rounded-lg border text-sm font-medium capitalize transition-all ${
                  prefs.digestFrequency === freq
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-foreground hover:border-primary/50"
                }`}
              >
                {freq === "realtime" ? "Real-time" : freq.charAt(0).toUpperCase() + freq.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {prefs.digestFrequency === "realtime" && "You will receive an email for every event immediately."}
            {prefs.digestFrequency === "daily" && "You will receive a daily summary email each morning."}
            {prefs.digestFrequency === "weekly" && "You will receive a weekly summary email every Monday."}
            {prefs.digestFrequency === "never" && "Digest emails are disabled. You will only receive real-time alerts."}
          </p>
        </div>
      </section>

      {/* Status */}
      <div className="flex items-center justify-center">
        <Badge variant="outline" className="text-xs text-muted-foreground">
          Changes saved automatically
        </Badge>
      </div>
    </div>
  );
}
