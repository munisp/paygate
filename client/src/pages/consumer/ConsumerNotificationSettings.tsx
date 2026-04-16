import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bell, BellOff, Smartphone, Mail, MessageSquare, Shield,
  CreditCard, AlertTriangle, Tag, Settings, Clock, ChevronLeft,
  Loader2, Landmark, Gavel,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// ─── Types ────────────────────────────────────────────────────────────────────

type Prefs = {
  pushEnabled: boolean; inAppEnabled: boolean; emailEnabled: boolean; smsEnabled: boolean;
  pushPayments: boolean; pushFraud: boolean; pushPromotions: boolean;
  pushSystem: boolean; pushDisputes: boolean; pushLoans: boolean;
  inAppPayments: boolean; inAppFraud: boolean; inAppPromotions: boolean;
  inAppSystem: boolean; inAppDisputes: boolean; inAppLoans: boolean;
  emailPayments: boolean; emailFraud: boolean; emailPromotions: boolean;
  emailSystem: boolean; emailDisputes: boolean; emailLoans: boolean;
  quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChannelCard({
  icon: Icon, label, description, enabled, onToggle, disabled,
}: {
  icon: React.ElementType; label: string; description: string;
  enabled: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
      enabled ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
    </div>
  );
}

function CategoryRow({
  icon: Icon, label, push, inApp, email,
  onPush, onInApp, onEmail,
  pushDisabled, inAppDisabled, emailDisabled,
}: {
  icon: React.ElementType; label: string;
  push: boolean; inApp: boolean; email: boolean;
  onPush: () => void; onInApp: () => void; onEmail: () => void;
  pushDisabled?: boolean; inAppDisabled?: boolean; emailDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm truncate">{label}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground">Push</span>
          <Switch checked={push} onCheckedChange={onPush} disabled={pushDisabled} className="scale-75" />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground">In-App</span>
          <Switch checked={inApp} onCheckedChange={onInApp} disabled={inAppDisabled} className="scale-75" />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground">Email</span>
          <Switch checked={email} onCheckedChange={onEmail} disabled={emailDisabled} className="scale-75" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConsumerNotificationSettings() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: prefs, isLoading } = trpc.consumerNotifPrefs.get.useQuery();
  const { isSubscribed, isSupported, subscribe, unsubscribe, isLoading: pushLoading } = usePushNotifications();

  const update = trpc.consumerNotifPrefs.update.useMutation({
    onSuccess: () => {
      utils.consumerNotifPrefs.get.invalidate();
      toast.success("Preferences saved");
    },
    onError: () => toast.error("Failed to save preferences"),
  });

  const toggle = (field: keyof Prefs) => {
    if (!prefs) return;
    update.mutate({ [field]: !prefs[field] });
  };

  const setTime = (field: "quietHoursStart" | "quietHoursEnd", value: string) => {
    update.mutate({ [field]: value });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!prefs) return null;

  const isSaving = update.isPending;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/consumer/notifications")} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold">Notification Preferences</h1>
          <p className="text-xs text-muted-foreground">Control how and when you're notified</p>
        </div>
        {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="px-4 py-4 space-y-6 max-w-lg mx-auto">

        {/* Web Push subscription banner */}
        {isSupported && (
          <div className={`rounded-xl p-4 border ${
            isSubscribed
              ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
              : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${isSubscribed ? "bg-green-100 dark:bg-green-900" : "bg-amber-100 dark:bg-amber-900"}`}>
                {isSubscribed ? <Bell className="w-4 h-4 text-green-600 dark:text-green-400" /> : <BellOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {isSubscribed ? "Push notifications active" : "Enable push notifications"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isSubscribed
                    ? "You'll receive real-time alerts for payments and fraud."
                    : "Get instant alerts for payments, fraud, and disputes — even when the app is closed."}
                </p>
              </div>
              <Button
                size="sm"
                variant={isSubscribed ? "outline" : "default"}
                onClick={isSubscribed ? unsubscribe : subscribe}
                disabled={pushLoading}
                className="shrink-0"
              >
                {pushLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : isSubscribed ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
        )}

        {/* Channel toggles */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Channels</h2>
          <div className="space-y-2">
            <ChannelCard
              icon={Smartphone} label="Push Notifications" description="Real-time alerts on this device"
              enabled={prefs.pushEnabled} onToggle={() => toggle("pushEnabled")}
              disabled={!isSubscribed && isSupported}
            />
            <ChannelCard
              icon={Bell} label="In-App Notifications" description="Alerts inside the app"
              enabled={prefs.inAppEnabled} onToggle={() => toggle("inAppEnabled")}
            />
            <ChannelCard
              icon={Mail} label="Email Notifications" description="Summaries and receipts via email"
              enabled={prefs.emailEnabled} onToggle={() => toggle("emailEnabled")}
            />
            <ChannelCard
              icon={MessageSquare} label="SMS Notifications" description="Text alerts for critical events"
              enabled={prefs.smsEnabled} onToggle={() => toggle("smsEnabled")}
            />
          </div>
        </section>

        <Separator />

        {/* Per-category toggles */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Categories</h2>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-medium pr-1">
              <span className="w-8 text-center">Push</span>
              <span className="w-8 text-center">In-App</span>
              <span className="w-8 text-center">Email</span>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border px-3 py-1">
            <CategoryRow
              icon={CreditCard} label="Payments & Transfers"
              push={prefs.pushPayments} inApp={prefs.inAppPayments} email={prefs.emailPayments}
              onPush={() => toggle("pushPayments")} onInApp={() => toggle("inAppPayments")} onEmail={() => toggle("emailPayments")}
              pushDisabled={!prefs.pushEnabled} inAppDisabled={!prefs.inAppEnabled} emailDisabled={!prefs.emailEnabled}
            />
            <CategoryRow
              icon={Shield} label="Fraud & Security"
              push={prefs.pushFraud} inApp={prefs.inAppFraud} email={prefs.emailFraud}
              onPush={() => toggle("pushFraud")} onInApp={() => toggle("inAppFraud")} onEmail={() => toggle("emailFraud")}
              pushDisabled={!prefs.pushEnabled} inAppDisabled={!prefs.inAppEnabled} emailDisabled={!prefs.emailEnabled}
            />
            <CategoryRow
              icon={Gavel} label="Disputes"
              push={prefs.pushDisputes} inApp={prefs.inAppDisputes} email={prefs.emailDisputes}
              onPush={() => toggle("pushDisputes")} onInApp={() => toggle("inAppDisputes")} onEmail={() => toggle("emailDisputes")}
              pushDisabled={!prefs.pushEnabled} inAppDisabled={!prefs.inAppEnabled} emailDisabled={!prefs.emailEnabled}
            />
            <CategoryRow
              icon={Landmark} label="Loans & BNPL"
              push={prefs.pushLoans} inApp={prefs.inAppLoans} email={prefs.emailLoans}
              onPush={() => toggle("pushLoans")} onInApp={() => toggle("inAppLoans")} onEmail={() => toggle("emailLoans")}
              pushDisabled={!prefs.pushEnabled} inAppDisabled={!prefs.inAppEnabled} emailDisabled={!prefs.emailEnabled}
            />
            <CategoryRow
              icon={Settings} label="System Updates"
              push={prefs.pushSystem} inApp={prefs.inAppSystem} email={prefs.emailSystem}
              onPush={() => toggle("pushSystem")} onInApp={() => toggle("inAppSystem")} onEmail={() => toggle("emailSystem")}
              pushDisabled={!prefs.pushEnabled} inAppDisabled={!prefs.inAppEnabled} emailDisabled={!prefs.emailEnabled}
            />
            <CategoryRow
              icon={Tag} label="Promotions & Offers"
              push={prefs.pushPromotions} inApp={prefs.inAppPromotions} email={prefs.emailPromotions}
              onPush={() => toggle("pushPromotions")} onInApp={() => toggle("inAppPromotions")} onEmail={() => toggle("emailPromotions")}
              pushDisabled={!prefs.pushEnabled} inAppDisabled={!prefs.inAppEnabled} emailDisabled={!prefs.emailEnabled}
            />
          </div>
        </section>

        <Separator />

        {/* Quiet hours */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold">Quiet Hours</h2>
              <p className="text-xs text-muted-foreground">Silence push notifications during these hours</p>
            </div>
            <Switch checked={prefs.quietHoursEnabled} onCheckedChange={() => toggle("quietHoursEnabled")} />
          </div>
          {prefs.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Start
                </Label>
                <Input
                  type="time"
                  value={prefs.quietHoursStart}
                  onChange={(e) => setTime("quietHoursStart", e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> End
                </Label>
                <Input
                  type="time"
                  value={prefs.quietHoursEnd}
                  onChange={(e) => setTime("quietHoursEnd", e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          )}
        </section>

        <Separator />

        {/* Digest Frequency */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Email Digest Frequency</h2>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-4">Choose how often you receive email summaries of your wallet activity.</p>
            <div className="grid grid-cols-2 gap-2">
              {(["realtime", "daily", "weekly", "never"] as const).map(freq => (
                <button
                  key={freq}
                  onClick={() => update.mutate({ digestFrequency: freq })}
                  className={`py-2.5 px-3 rounded-lg border text-sm font-medium capitalize transition-all ${
                    (prefs as any).digestFrequency === freq
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary/50"
                  }`}
                >
                  {freq === "realtime" ? "Real-time" : freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {(prefs as any).digestFrequency === "realtime" && "Immediate email for every transaction."}
              {(prefs as any).digestFrequency === "daily" && "Daily wallet summary each morning."}
              {(prefs as any).digestFrequency === "weekly" && "Weekly spending summary every Monday."}
              {(prefs as any).digestFrequency === "never" && "Email digests are disabled."}
            </p>
          </div>
        </section>

        {/* Status badge */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Changes saved automatically
          </Badge>
        </div>
      </div>
    </div>
  );
}
