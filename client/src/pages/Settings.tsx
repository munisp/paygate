import { useState, useEffect } from "react";
import { Save, Building2, Globe, Bell, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Settings() {
  const [form, setForm] = useState({ businessName: "", email: "", phone: "", webhookUrl: "" });
  const [notifPrefs, setNotifPrefs] = useState({
    notifyOnFraudAlert: true,
    notifyOnPayout: true,
    notifyOnDispute: true,
  });
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.settings.get.useQuery(undefined, { staleTime: 60_000 });
  const updateMerchant = trpc.settings.updateMerchant.useMutation({
    onSuccess: () => { toast.success("Settings saved"); utils.settings.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateNotifPrefs = trpc.settings.updateNotificationPrefs.useMutation({
    onSuccess: () => { toast.success("Notification preferences saved"); utils.settings.get.invalidate(); },
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
    }
  }, [data]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMerchant.mutate({
      businessName: form.businessName || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      webhookUrl: form.webhookUrl || null,
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
    </div>
  );
}
