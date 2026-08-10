/**
 * Admin Notification Preferences - /admin/notifications/preferences
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail, Smartphone, UserPlus, Fingerprint, CheckCircle2,
  Shield, AlertTriangle, Gavel, Wallet, Server, Zap,
  BarChart2, FileText, Loader2, ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";

function ChannelCard({ icon: Icon, label, description, enabled, onToggle }: any) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${enabled ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><Icon className="w-4 h-4" /></div>
        <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
  );
}

const SEV: Record<string, string> = {
  critical: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-blue-600 bg-blue-50 border-blue-200",
};

function AlertRow({ icon: Icon, label, description, enabled, onToggle, severity }: any) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{label}</span>
            {severity && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${SEV[severity]}`}>{severity.toUpperCase()}</span>}
          </div>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} className="ml-3 shrink-0" />
    </div>
  );
}

export default function AdminNotificationPreferences() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: prefs, isLoading } = trpc.adminNotifPrefs.get.useQuery();
  const [riskThreshold, setRiskThreshold] = useState(75);
  const [payoutThresholdM, setPayoutThresholdM] = useState(10);

  useEffect(() => {
    if (prefs) {
      setRiskThreshold(prefs.highRiskScoreThreshold);
      setPayoutThresholdM(Math.round(prefs.largePayoutThresholdKobo / 1_000_000));
    }
  }, [prefs]);

  const updateMutation = trpc.adminNotifPrefs.update.useMutation({
    onSuccess: () => { utils.adminNotifPrefs.get.invalidate(); toast.success("Preferences saved"); },
    onError: () => toast.error("Failed to save preferences"),
  });
  const update = updateMutation;

  const toggle = (field: string) => { if (!prefs) return; update.mutate({ [field]: !(prefs as any)[field] }); };
  const saveThresholds = () => update.mutate({ highRiskScoreThreshold: riskThreshold, largePayoutThresholdKobo: payoutThresholdM * 1_000_000 });

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!prefs) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/admin/notifications")} className="p-2 rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Admin Alert Preferences</h1>
          <p className="text-sm text-muted-foreground">Configure system-level alert channels and thresholds</p>
        </div>
        {update.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Alert Channels</h2>
        <div className="space-y-2">
          <ChannelCard icon={Smartphone} label="Push Notifications" description="Browser push for real-time critical alerts" enabled={prefs.pushEnabled} onToggle={() => toggle("pushEnabled")} />
          <ChannelCard icon={Mail} label="Email Alerts" description="Detailed alert emails to your admin inbox" enabled={prefs.emailEnabled} onToggle={() => toggle("emailEnabled")} />
        </div>
      </section>
      <Separator />
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Merchant and KYC Events</h2>
        <div className="bg-card rounded-xl border border-border px-3 py-1">
          <AlertRow icon={UserPlus} label="New Merchant Registration" description="A new merchant completed onboarding" enabled={prefs.alertNewMerchant} onToggle={() => toggle("alertNewMerchant")} severity="low" />
          <AlertRow icon={Fingerprint} label="KYC Document Submitted" description="Merchant or consumer submitted KYC documents" enabled={prefs.alertKycSubmission} onToggle={() => toggle("alertKycSubmission")} severity="medium" />
          <AlertRow icon={CheckCircle2} label="KYC Approved or Rejected" description="KYC review completed" enabled={prefs.alertKycApproval} onToggle={() => toggle("alertKycApproval")} severity="medium" />
        </div>
      </section>
      <Separator />
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fraud and Risk Events</h2>
        <div className="bg-card rounded-xl border border-border px-3 py-1">
          <AlertRow icon={Shield} label="High-Risk Transaction Detected" description="Fraud score above threshold triggers this alert" enabled={prefs.alertHighRiskTxn} onToggle={() => toggle("alertHighRiskTxn")} severity="critical" />
          <AlertRow icon={AlertTriangle} label="Fraud Alert Escalated" description="Fraud case escalated to compliance team" enabled={prefs.alertFraudEscalation} onToggle={() => toggle("alertFraudEscalation")} severity="critical" />
        </div>
      </section>
      <Separator />
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Disputes and Payouts</h2>
        <div className="bg-card rounded-xl border border-border px-3 py-1">
          <AlertRow icon={Gavel} label="Dispute Opened" description="A new dispute was opened" enabled={prefs.alertDisputeOpened} onToggle={() => toggle("alertDisputeOpened")} severity="high" />
          <AlertRow icon={Gavel} label="Dispute Escalated" description="Dispute escalated past SLA threshold" enabled={prefs.alertDisputeEscalated} onToggle={() => toggle("alertDisputeEscalated")} severity="critical" />
          <AlertRow icon={Wallet} label="Large Payout Approval Required" description="Large payouts require admin approval" enabled={prefs.alertPayoutApproval} onToggle={() => toggle("alertPayoutApproval")} severity="high" />
        </div>
      </section>
      <Separator />
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">System Health</h2>
        <div className="bg-card rounded-xl border border-border px-3 py-1">
          <AlertRow icon={Server} label="System or API Error" description="5xx errors or unhandled exceptions" enabled={prefs.alertSystemError} onToggle={() => toggle("alertSystemError")} severity="critical" />
          <AlertRow icon={Zap} label="Middleware Bridge Down" description="Go bridge or payment middleware unreachable" enabled={prefs.alertBridgeDown} onToggle={() => toggle("alertBridgeDown")} severity="critical" />
          <AlertRow icon={AlertTriangle} label="Rate Limit Breached" description="API rate limit exceeded" enabled={prefs.alertRateLimit} onToggle={() => toggle("alertRateLimit")} severity="medium" />
        </div>
      </section>
      <Separator />
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Reports and Digests</h2>
        <div className="bg-card rounded-xl border border-border px-3 py-1">
          <AlertRow icon={BarChart2} label="Daily Activity Digest" description="Summary of transactions, disputes, and fraud" enabled={prefs.alertDailyDigest} onToggle={() => toggle("alertDailyDigest")} severity="low" />
          <AlertRow icon={FileText} label="Weekly Platform Report" description="Revenue, volume, and compliance summary every Monday" enabled={prefs.alertWeeklyReport} onToggle={() => toggle("alertWeeklyReport")} severity="low" />
        </div>
      </section>
      <Separator />
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Alert Thresholds</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">High-Risk Score Threshold (0-100)</Label>
            <p className="text-xs text-muted-foreground">Fraud score at or above this value triggers a high-risk alert.</p>
            <Input type="number" min={0} max={100} value={riskThreshold} onChange={(e) => setRiskThreshold(Number(e.target.value))} onBlur={saveThresholds} className="w-32" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Large Payout Threshold (NGN millions)</Label>
            <p className="text-xs text-muted-foreground">Payouts at or above this amount require admin approval.</p>
            <Input type="number" min={0} value={payoutThresholdM} onChange={(e) => setPayoutThresholdM(Number(e.target.value))} onBlur={saveThresholds} className="w-32" />
          </div>
        </div>
      </section>
      {/* Digest Frequency */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Alert Digest Frequency</h2>
        <div className="bg-card border rounded-xl p-5">
          <p className="text-sm text-muted-foreground mb-4">Choose how often you receive email digest summaries of platform activity and system alerts.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["realtime", "daily", "weekly", "never"] as const).map(freq => (
              <button
                key={freq}
                onClick={() => updateMutation.mutate({ digestFrequency: freq })}
                className={`py-3 px-4 rounded-lg border text-sm font-medium capitalize transition-all ${
                  (prefs as any).digestFrequency === freq
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-foreground hover:border-primary/50"
                }`}
              >
                {freq === "realtime" ? "Real-time" : freq.charAt(0).toUpperCase() + freq.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {(prefs as any).digestFrequency === "realtime" && "Immediate email for every system event."}
            {(prefs as any).digestFrequency === "daily" && "Daily platform summary each morning."}
            {(prefs as any).digestFrequency === "weekly" && "Weekly system report every Monday."}
            {(prefs as any).digestFrequency === "never" && "Alert digest emails are disabled."}
          </p>
        </div>
      </section>

      <div className="flex items-center justify-center">
        <Badge variant="outline" className="text-xs text-muted-foreground">Changes saved automatically</Badge>
      </div>
    </div>
  );
}
