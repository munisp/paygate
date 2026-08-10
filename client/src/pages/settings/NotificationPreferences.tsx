// @ts-nocheck
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, Smartphone, Save } from "lucide-react";

const NOTIFICATION_GROUPS = [
  {
    group: "Transactions",
    icon: "💳",
    items: [
      { key: "txn_success", label: "Successful transactions" },
      { key: "txn_failed", label: "Failed transactions" },
      { key: "txn_high_value", label: "High-value transactions (>₦1M)" },
      { key: "txn_chargeback", label: "Chargebacks initiated" },
    ],
  },
  {
    group: "Settlements",
    icon: "🏦",
    items: [
      { key: "settlement_initiated", label: "Settlement initiated" },
      { key: "settlement_completed", label: "Settlement completed" },
      { key: "settlement_failed", label: "Settlement failed" },
      { key: "payout_approved", label: "Payout approved" },
    ],
  },
  {
    group: "Compliance & Security",
    icon: "🔒",
    items: [
      { key: "kyc_status_change", label: "KYC document status changed" },
      { key: "compliance_alert", label: "Compliance score drops below threshold" },
      { key: "fraud_alert", label: "Fraud alert triggered" },
      { key: "api_key_used", label: "API key used from new IP" },
    ],
  },
  {
    group: "System",
    icon: "⚙️",
    items: [
      { key: "webhook_failure", label: "Webhook delivery failures" },
      { key: "rate_limit_hit", label: "API rate limit reached" },
      { key: "saga_failed", label: "Transaction saga failed" },
      { key: "ndc_breach", label: "NDC cap approaching limit" },
    ],
  },
];

type Prefs = Record<string, { email: boolean; sms: boolean; push: boolean }>;

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [emailAddress, setEmailAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const { data: savedPrefs, refetch, isLoading } = trpc.wave223.notificationPreferences.get.useQuery();
  const saveMutation = trpc.wave223.notificationPreferences.save.useMutation({
    onSuccess: () => { toast.success("Preferences saved."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (savedPrefs) {
      setPrefs(savedPrefs.preferences ?? {});
      setEmailAddress(savedPrefs.emailAddress ?? "");
      setPhoneNumber(savedPrefs.phoneNumber ?? "");
    }
  }, [savedPrefs]);

  const toggle = (key: string, channel: "email" | "sms" | "push") => {
    setPrefs((prev) => ({
      ...prev,
      [key]: { email: false, sms: false, push: false, ...prev[key], [channel]: !(prev[key]?.[channel] ?? false) },
    }));
  };

  const handleSave = () => {
    saveMutation.mutate({ preferences: prefs, emailAddress, phoneNumber });
  };

  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-6 w-6 text-amber-500" /> Notification Preferences</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure how and when you receive platform alerts</p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving…" : "Save Preferences"}
        </Button>
      </div>

      {/* Contact channels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Channels</CardTitle>
          <CardDescription>Configure your contact details for each notification channel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email Address</Label>
              <Input type="email" placeholder="alerts@yourcompany.com" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Phone Number (SMS)</Label>
              <Input type="tel" placeholder="+234 800 000 0000" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification groups */}
      {NOTIFICATION_GROUPS.map((group) => (
        <Card key={group.group}>
          <CardHeader>
            <CardTitle className="text-base">{group.icon} {group.group}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Channel headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 mb-3 px-1">
              <div />
              <div className="flex items-center gap-1 text-xs text-muted-foreground w-16 justify-center"><Mail className="h-3.5 w-3.5" /> Email</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground w-16 justify-center"><MessageSquare className="h-3.5 w-3.5" /> SMS</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground w-16 justify-center"><Bell className="h-3.5 w-3.5" /> Push</div>
            </div>
            <div className="space-y-3">
              {group.items.map((item) => (
                <div key={item.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-1 py-1 rounded hover:bg-muted/30">
                  <Label className="text-sm font-normal cursor-default">{item.label}</Label>
                  {(["email", "sms", "push"] as const).map((ch) => (
                    <div key={ch} className="w-16 flex justify-center">
                      <Switch
                        checked={prefs[item.key]?.[ch] ?? false}
                        onCheckedChange={() => toggle(item.key, ch)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
