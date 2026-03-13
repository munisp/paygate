import { useState, useEffect } from "react";
import { Save, Building2, Globe, Bell, Shield, CalendarClock, Banknote, Volume2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const FREQUENCY_OPTIONS = [
  { value: "daily",   label: "Daily",   desc: "Settled every business day" },
  { value: "weekly",  label: "Weekly",  desc: "Settled every Monday" },
  { value: "monthly", label: "Monthly", desc: "Settled on the 1st of each month" },
] as const;

export default function Settings() {
  const [form, setForm] = useState({ businessName: "", email: "", phone: "", webhookUrl: "" });
  const [notifPrefs, setNotifPrefs] = useState({
    notifyOnFraudAlert: true,
    notifyOnPayout: true,
    notifyOnDispute: true,
  });
  const [soundboxLang, setSoundboxLang] = useState<"en" | "yo" | "ha" | "ig">("en");

  const [settlementForm, setSettlementForm] = useState({
    settlementFrequency: "daily" as "daily" | "weekly" | "monthly",
    settlementMinAmount: 10000,
    settlementBankCode: "",
    settlementAccountNumber: "",
    settlementAccountName: "",
  });
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.settings.get.useQuery(undefined, { staleTime: 60_000 });
  const { data: settlementData, isLoading: settlementLoading } = trpc.settings.getSettlementSchedule.useQuery(undefined, { staleTime: 60_000 });

  const updateMerchant = trpc.settings.updateMerchant.useMutation({
    onSuccess: () => { toast.success("Settings saved"); utils.settings.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateNotifPrefs = trpc.settings.updateNotificationPrefs.useMutation({
    onSuccess: () => { toast.success("Notification preferences saved"); utils.settings.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateSoundboxLang = trpc.settings.updateSoundboxLanguage.useMutation({
    onSuccess: () => { toast.success("Soundbox language saved"); utils.settings.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const updateSettlement = trpc.settings.updateSettlementSchedule.useMutation({
    onSuccess: () => { toast.success("Settlement schedule saved"); utils.settings.getSettlementSchedule.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (data?.merchant) {
      setForm({
        businessName: data.merchant.businessName ?? "",
        email: data.merchant.email ?? "",
        phone: data.merchant.phone ?? "",
        webhookUrl: data.merchant.webhookUrl ?? "",
      });
      setNotifPrefs({
        notifyOnFraudAlert: (data.merchant as any).notifyOnFraudAlert ?? true,
        notifyOnPayout: (data.merchant as any).notifyOnPayout ?? true,
        notifyOnDispute: (data.merchant as any).notifyOnDispute ?? true,
      });
      setSoundboxLang(((data.merchant as any).soundboxLanguage as "en" | "yo" | "ha" | "ig") ?? "en");
    }
  }, [data]);

  useEffect(() => {
    if (settlementData) {
      setSettlementForm({
        settlementFrequency: (settlementData.settlementFrequency as any) ?? "daily",
        settlementMinAmount: settlementData.settlementMinAmount ?? 10000,
        settlementBankCode: settlementData.settlementBankCode ?? "",
        settlementAccountNumber: settlementData.settlementAccountNumber ?? "",
        settlementAccountName: settlementData.settlementAccountName ?? "",
      });
    }
  }, [settlementData]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMerchant.mutate({
      businessName: form.businessName || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      webhookUrl: form.webhookUrl || null,
    });
  };

  const handleSaveSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettlement.mutate({
      settlementFrequency: settlementForm.settlementFrequency,
      settlementMinAmount: settlementForm.settlementMinAmount,
      settlementBankCode: settlementForm.settlementBankCode || null,
      settlementAccountNumber: settlementForm.settlementAccountNumber || null,
      settlementAccountName: settlementForm.settlementAccountName || null,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your merchant account settings</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Business Information</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Business Name</label>
                <input value={form.businessName} onChange={(e) => setForm(f => ({ ...f, businessName: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Business Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number</label>
                <input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Country</label>
                <input value={data?.merchant?.country ?? "NG"} disabled
                  className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 text-muted-foreground cursor-not-allowed" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Webhook URL</h3>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Webhook URL</label>
              <input value={form.webhookUrl} onChange={(e) => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
                placeholder="https://your-server.com/webhooks" className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
              <p className="text-xs text-muted-foreground mt-1">Events will be sent to this URL unless overridden per webhook endpoint</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Notification Preferences</h3>
            </div>
            <p className="text-xs text-muted-foreground">Choose which events trigger in-app notifications for your account.</p>
            {([
              { key: "notifyOnFraudAlert" as const, label: "Fraud Alerts", desc: "Notify when a high-severity fraud alert is detected" },
              { key: "notifyOnPayout" as const, label: "Payout Events", desc: "Notify when a payout is initiated or completed" },
              { key: "notifyOnDispute" as const, label: "Dispute Updates", desc: "Notify when a dispute is opened or resolved" },
            ]).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
                    setNotifPrefs(updated);
                    updateNotifPrefs.mutate(updated);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    notifPrefs[key] ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    notifPrefs[key] ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Account Status</h3>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
              <div>
                <p className="text-sm font-medium">Merchant Status</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your account verification state</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${data?.merchant?.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {data?.merchant?.status ?? "pending"}
              </span>
            </div>
          </div>

          <Button type="submit" disabled={updateMerchant.isPending}>
            <Save className="w-4 h-4 mr-1.5" />
            {updateMerchant.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      )}

      {/* Settlement Schedule — separate form */}
      <form onSubmit={handleSaveSettlement} className="space-y-0">
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Settlement Schedule</h3>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">Configure how and when your collected funds are settled to your bank account.</p>

          {settlementLoading ? (
            <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : (
            <>
              {/* Frequency selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Settlement Frequency</label>
                <div className="grid grid-cols-3 gap-2">
                  {FREQUENCY_OPTIONS.map(({ value, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSettlementForm(f => ({ ...f, settlementFrequency: value }))}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        settlementForm.settlementFrequency === value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Minimum settlement amount */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Minimum Settlement Amount (NGN)</label>
                <input
                  type="number"
                  value={settlementForm.settlementMinAmount}
                  onChange={(e) => setSettlementForm(f => ({ ...f, settlementMinAmount: parseFloat(e.target.value) || 0 }))}
                  min={100}
                  className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none"
                  placeholder="10000"
                />
                <p className="text-xs text-muted-foreground mt-1">Settlements below this amount will roll over to the next cycle</p>
              </div>

              {/* Bank account details */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Banknote className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Settlement Bank Account</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Code</label>
                    <input
                      value={settlementForm.settlementBankCode}
                      onChange={(e) => setSettlementForm(f => ({ ...f, settlementBankCode: e.target.value }))}
                      placeholder="e.g. 044 (Access Bank)"
                      className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Number</label>
                    <input
                      value={settlementForm.settlementAccountNumber}
                      onChange={(e) => setSettlementForm(f => ({ ...f, settlementAccountNumber: e.target.value }))}
                      placeholder="10-digit account number"
                      className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Name</label>
                    <input
                      value={settlementForm.settlementAccountName}
                      onChange={(e) => setSettlementForm(f => ({ ...f, settlementAccountName: e.target.value }))}
                      placeholder="Beneficiary account name"
                      className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={updateSettlement.isPending}>
                <Save className="w-4 h-4 mr-1.5" />
                {updateSettlement.isPending ? "Saving..." : "Save Settlement Settings"}
              </Button>
            </>
          )}
        </div>
      </form>

      {/* Soundbox Language Preference */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Volume2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Soundbox Language</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Default language for audio payment confirmations across all your soundbox terminals.
          Individual terminals can override this setting.
        </p>
        <div className="flex items-center gap-4">
          <Select value={soundboxLang} onValueChange={(v) => setSoundboxLang(v as typeof soundboxLang)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English (EN)</SelectItem>
              <SelectItem value="yo">Yoruba (YO)</SelectItem>
              <SelectItem value="ha">Hausa (HA)</SelectItem>
              <SelectItem value="ig">Igbo (IG)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => updateSoundboxLang.mutate({ soundboxLanguage: soundboxLang })}
            disabled={updateSoundboxLang.isPending}
          >
            <Save className="w-4 h-4 mr-1.5" />
            {updateSoundboxLang.isPending ? "Saving..." : "Save Language"}
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { code: "en", label: "English",  sample: "Payment received" },
            { code: "yo", label: "Yoruba",   sample: "Owo ti gba" },
            { code: "ha", label: "Hausa",    sample: "An karɓi kuɗi" },
            { code: "ig", label: "Igbo",     sample: "Ego enwetara" },
          ] as const).map(({ code, label, sample }) => (
            <div
              key={code}
              className={`rounded-lg border p-3 cursor-pointer transition-all ${
                soundboxLang === code ? "border-primary bg-primary/5" : "border-border"
              }`}
              onClick={() => setSoundboxLang(code)}
            >
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">"{sample}"</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
