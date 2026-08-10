import { useState, useEffect, useCallback } from "react";
import { Save, Building2, Globe, Bell, Shield, CalendarClock, Banknote, Volume2, CreditCard, ExternalLink, AlertTriangle, CheckCircle2, Clock, Key, Zap, Eye, EyeOff, Smartphone, Share2, MessageCircle, Copy, QrCode, Link, Scale } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import USDCWalletSection from "@/components/USDCWalletSection";

// ── Stripe Payment Section ──────────────────────────────────────────────────
function StripeSection() {
  const { data: stripeData, isLoading: stripeLoading, refetch } = trpc.stripe.getKeyMode.useQuery(undefined, { staleTime: 30_000 });
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyForm, setKeyForm] = useState({ secretKey: '', publishableKey: '' });
  const [showSk, setShowSk] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; mode: string; accountId: string; displayName?: string } | null>(null);

  const mode = stripeData?.mode ?? 'unconfigured';
  const sandboxClaimUrl = (stripeData as any)?.sandboxClaimUrl ?? 'https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVEFBTkRSaTdHR0FyY3hXLDE3NzM5MzcwNjcv100Ox49WXeJ';
  const sandboxExpiry = (stripeData as any)?.sandboxExpiry ?? '2026-05-11T16:17:47.000Z';
  const daysLeft = Math.max(0, Math.ceil((new Date(sandboxExpiry).getTime() - Date.now()) / 86_400_000));

  const modeConfig = {
    live:          { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', label: 'Live Mode', desc: 'Real card processing is active.' },
    test:          { icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',   badge: 'bg-amber-100 text-amber-700',   label: 'Test Mode', desc: `Sandbox active — ${daysLeft} days until expiry.` },
    unconfigured:  { icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50 border-red-200',       badge: 'bg-red-100 text-red-700',       label: 'Not Configured', desc: 'No Stripe keys found.' },
  }[mode] ?? { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted border-border', badge: 'bg-muted text-muted-foreground', label: 'Unknown', desc: '' };

  const ModeIcon = modeConfig.icon;

  const validateMutation = trpc.stripe.validateKeys.useMutation({
    onSuccess: (res) => {
      setValidationResult(res as any);
      toast.success(`Keys valid — ${res.mode} mode (${res.accountId})`);
    },
    onError: (e: any) => toast.error(`Validation failed: ${e.message}`),
  });

  const testChargeMutation = trpc.stripe.testCharge.useMutation({
    onSuccess: (res) => toast.success(`Test charge created: ${res.intentId} (status: ${res.status})`),
    onError: (e: any) => toast.error(`Test charge failed: ${e.message}`),
  });

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Payment Configuration</h3>
        </div>
        <div className="flex items-center gap-2">
          {mode !== 'unconfigured' && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              disabled={testChargeMutation.isPending}
              onClick={() => testChargeMutation.mutate()}
            >
              <Zap className="w-3 h-3 mr-1" />
              {testChargeMutation.isPending ? 'Testing…' : 'Test Charge'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs h-7">
            Refresh
          </Button>
        </div>
      </div>

      {stripeLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : (
        <div className={`rounded-xl border p-4 ${modeConfig.bg}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <ModeIcon className={`w-5 h-5 mt-0.5 ${modeConfig.color}`} />
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{modeConfig.label}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${modeConfig.badge}`}>{mode.toUpperCase()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{modeConfig.desc}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 shrink-0"
              onClick={() => setShowKeyForm((v: any) => !v)}
            >
              <Key className="w-3 h-3 mr-1" />
              {mode === 'live' ? 'Rotate Keys' : 'Swap to Live Keys'}
            </Button>
          </div>
        </div>
      )}

      {/* Key swap form */}
      {showKeyForm && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-semibold">Validate & Swap Stripe Keys</p>
          <p className="text-xs text-muted-foreground">
            Enter your new keys below to validate them against the Stripe API before updating them in Settings → Secrets.
          </p>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Secret Key (sk_live_… or sk_test_…)</label>
              <div className="relative">
                <input
                  type={showSk ? 'text' : 'password'}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono pr-9"
                  placeholder="sk_live_…"
                  value={keyForm.secretKey}
                  onChange={(e: any) => setKeyForm((f: any) => ({ ...f, secretKey: e.target.value }))}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSk((v: any) => !v)}
                >
                  {showSk ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Publishable Key (pk_live_… or pk_test_…)</label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                placeholder="pk_live_…"
                value={keyForm.publishableKey}
                onChange={(e: any) => setKeyForm((f: any) => ({ ...f, publishableKey: e.target.value }))}
              />
            </div>
          </div>

          {validationResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-green-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Keys validated successfully
              </div>
              <p className="text-green-600">Mode: <strong>{validationResult.mode}</strong> · Account: <code>{validationResult.accountId}</code>{validationResult.displayName ? ` · ${validationResult.displayName}` : ''}</p>
              <p className="text-green-600">Now go to <strong>Settings → Secrets</strong> and update <code>STRIPE_SECRET_KEY</code> and <code>VITE_STRIPE_PUBLISHABLE_KEY</code> with these values.</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!keyForm.secretKey || !keyForm.publishableKey || validateMutation.isPending}
              onClick={() => validateMutation.mutate(keyForm)}
            >
              {validateMutation.isPending ? 'Validating…' : 'Validate Keys'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowKeyForm(false); setValidationResult(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'test' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Claim your Stripe sandbox before {new Date(sandboxExpiry).toLocaleDateString()}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                You have <strong>{daysLeft} days</strong> to claim the sandbox. After that, test payments will stop working.
                Once claimed, go live by replacing keys in Settings → Secrets.
              </p>
            </div>
          </div>
          <a href={sandboxClaimUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Claim Stripe Sandbox
            </Button>
          </a>
        </div>
      )}

      {mode === 'unconfigured' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            No Stripe keys detected. Go to <strong>Settings → Secrets</strong> and add
            <code className="mx-1 px-1 bg-red-100 rounded text-xs font-mono">STRIPE_SECRET_KEY</code> and
            <code className="mx-1 px-1 bg-red-100 rounded text-xs font-mono">VITE_STRIPE_PUBLISHABLE_KEY</code>.
          </p>
        </div>
      )}

      <div className="rounded-xl bg-muted/50 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Test Card Numbers</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { card: '4242 4242 4242 4242', label: 'Visa — Success' },
            { card: '4000 0000 0000 9995', label: 'Visa — Decline (insufficient funds)' },
            { card: '4000 0025 0000 3155', label: 'Visa — 3D Secure required' },
            { card: '5555 5555 5555 4444', label: 'Mastercard — Success' },
          ].map(({ card, label }) => (
            <div key={card} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
              <code className="text-xs font-mono text-primary">{card}</code>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Use any future expiry date and any 3-digit CVV.</p>
      </div>
    </div>
  );
}

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
  const [reconAlertForm, setReconAlertForm] = useState({ reconAlertBadgeEnabled: true, reconAlertThreshold: 1 });
  const [soundboxLang, setSoundboxLang] = useState<"en" | "yo" | "ha" | "ig">("en");
  const [ussdLangPickerEnabled, setUssdLangPickerEnabled] = useState(true);

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

  const invalidateDashboard = trpc.dashboard.invalidateOverview.useMutation();
  const updateMerchant = trpc.settings.updateMerchant.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      utils.settings.get.invalidate();
      // Flush dashboard cache so KPIs reflect the updated merchant profile immediately
      invalidateDashboard.mutate(undefined, {
        onSuccess: () => toast.success("Dashboard cache refreshed", { duration: 2000 }),
      });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateNotifPrefs = trpc.settings.updateNotificationPrefs.useMutation({
    onSuccess: () => { toast.success("Notification preferences saved"); utils.settings.get.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateSoundboxLang = trpc.settings.updateSoundboxLanguage.useMutation({
    onSuccess: () => { toast.success("Soundbox language saved"); utils.settings.get.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSettlement = trpc.settings.updateSettlementSchedule.useMutation({
    onSuccess: () => { toast.success("Settlement schedule saved"); utils.settings.getSettlementSchedule.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const { data: ussdLangPickerData } = trpc.settings.getUssdLangPickerEnabled.useQuery(undefined, { staleTime: 60_000 });
  const updateUssdLangPicker = trpc.settings.updateUssdLangPickerEnabled.useMutation({
    onSuccess: () => { toast.success("USSD language picker setting saved"); utils.settings.getUssdLangPickerEnabled.invalidate(); },
    onError: (e: any) => toast.error("Failed to save: " + e.message),
  });
  const { data: reconAlertSettingsData } = trpc.settings.getReconAlertSettings.useQuery(undefined, { staleTime: 60_000 });
  const updateReconAlertSettings = trpc.settings.updateReconAlertSettings.useMutation({
    onSuccess: () => { toast.success("Reconciliation alert settings saved"); utils.settings.getReconAlertSettings.invalidate(); },
    onError: (e: any) => toast.error(e.message),
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
    if (ussdLangPickerData) {
      setUssdLangPickerEnabled(ussdLangPickerData.ussdLangPickerEnabled ?? true);
    }
    if (reconAlertSettingsData) {
      setReconAlertForm({
        reconAlertBadgeEnabled: reconAlertSettingsData.reconAlertBadgeEnabled ?? true,
        reconAlertThreshold: reconAlertSettingsData.reconAlertThreshold ?? 1,
      });
    }
  }, [reconAlertSettingsData]);
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
    <div className="p-6 space-y-6 max-w-2xl" role="main" aria-label="Account settings">
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
                <input value={form.businessName} onChange={(e: any) => setForm(f => ({ ...f, businessName: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Business Email</label>
                <input type="email" value={form.email} onChange={(e: any) => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number</label>
                <input value={form.phone} onChange={(e: any) => setForm(f => ({ ...f, phone: e.target.value }))}
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
              <input value={form.webhookUrl} onChange={(e: any) => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
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
          {/* Reconciliation Alert Badge Settings */}
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Reconciliation Alert Badge</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Control when the sidebar badge appears on the Recon Alerts nav item. The badge shows when the number of open (unresolved) reconciliation alerts meets or exceeds the threshold you set.
            </p>
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
              <div>
                <p className="text-sm font-medium">Enable Badge</p>
                <p className="text-xs text-muted-foreground mt-0.5">Show a count badge on the Recon Alerts nav item</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = { ...reconAlertForm, reconAlertBadgeEnabled: !reconAlertForm.reconAlertBadgeEnabled };
                  setReconAlertForm(updated);
                  updateReconAlertSettings.mutate(updated);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  reconAlertForm.reconAlertBadgeEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  reconAlertForm.reconAlertBadgeEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {reconAlertForm.reconAlertBadgeEnabled && (
              <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
                <div className="flex-1">
                  <p className="text-sm font-medium">Alert Threshold</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Badge appears when open alerts ≥ this number (1–100)</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={reconAlertForm.reconAlertThreshold}
                    onChange={(e: any) => setReconAlertForm(f => ({ ...f, reconAlertThreshold: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))}
                    className="w-20 px-3 py-1.5 text-sm bg-background rounded-lg border border-border focus:ring-2 focus:ring-primary outline-none text-center"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => updateReconAlertSettings.mutate(reconAlertForm)}
                    disabled={updateReconAlertSettings.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
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
                  onChange={(e: any) => setSettlementForm(f => ({ ...f, settlementMinAmount: parseFloat(e.target.value) || 0 }))}
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
                      onChange={(e: any) => setSettlementForm(f => ({ ...f, settlementBankCode: e.target.value }))}
                      placeholder="e.g. 044 (Access Bank)"
                      className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Number</label>
                    <input
                      value={settlementForm.settlementAccountNumber}
                      onChange={(e: any) => setSettlementForm(f => ({ ...f, settlementAccountNumber: e.target.value }))}
                      placeholder="10-digit account number"
                      className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Name</label>
                    <input
                      value={settlementForm.settlementAccountName}
                      onChange={(e: any) => setSettlementForm(f => ({ ...f, settlementAccountName: e.target.value }))}
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

      {/* Stripe Payment Configuration */}
      <StripeSection />
      {/* USDC Payout Wallet */}
      <USDCWalletSection />

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
          <Select value={soundboxLang} onValueChange={(v: any) => setSoundboxLang(v as typeof soundboxLang)}>
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

      {/* USSD Language Picker Toggle */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Smartphone className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">USSD Language Picker</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          When enabled, customers dialling your USSD shortcode see a step-0 language selection menu
          (English / Hausa / Yoruba / Igbo / Français) before the main menu.
          Operators who pre-select a language via the <code className="text-xs bg-muted px-1 py-0.5 rounded">?lang=</code> query
          parameter skip the picker entirely regardless of this setting.
        </p>
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
          <div>
            <p className="text-sm font-medium">Show Language Picker</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ussdLangPickerEnabled ? "Customers can choose their language on first dial" : "Picker hidden — operator-set language or default (English) is used"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !ussdLangPickerEnabled;
              setUssdLangPickerEnabled(next);
              updateUssdLangPicker.mutate({ ussdLangPickerEnabled: next });
            }}
            disabled={updateUssdLangPicker.isPending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${
              ussdLangPickerEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              ussdLangPickerEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {ussdLangPickerEnabled && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
            <span className="text-xs mt-0.5">✓</span>
            <p className="text-xs">
              Language preference is persisted per phone number for 90 days — returning customers skip the picker automatically.
            </p>
          </div>
        )}
      </div>
      {/* White-Label Branding */}
      <BrandingSection merchantSlug={
        form.businessName
          ? form.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
          : ((data?.merchant as any)?.id ?? '').slice(0, 12)
      } />
      {/* Consumer Portal Launch Card */}
      <ConsumerPortalSection merchantName={form.businessName} merchantId={(data?.merchant as any)?.id ?? ''} />
    </div>
  );
}

// ─── Branding Section ─────────────────────────────────────────────────────────
const FONT_OPTIONS = ["Inter", "Roboto", "Poppins", "Montserrat", "Nunito", "DM Sans", "Plus Jakarta Sans"];
const PRESET_THEMES = [
  { name: "PayGate Default", primary: "#6366f1", accent: "#8b5cf6" },
  { name: "Ocean Blue",      primary: "#0ea5e9", accent: "#38bdf8" },
  { name: "Forest Green",   primary: "#16a34a", accent: "#22c55e" },
  { name: "Sunset Orange",  primary: "#ea580c", accent: "#f97316" },
  { name: "Royal Purple",   primary: "#7c3aed", accent: "#a855f7" },
  { name: "Midnight Gold",  primary: "#f59e0b", accent: "#fbbf24" },
];
function BrandingSection({ merchantSlug }: { merchantSlug: string }) {
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [accentColor, setAccentColor] = useState("#8b5cf6");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [logoUrl, setLogoUrl] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const { data: branding, isLoading: brandingLoading } = trpc.tenants.getBranding.useQuery(
    { slug: merchantSlug },
    { enabled: merchantSlug.length >= 2, staleTime: 30_000 }
  );
  useEffect(() => {
    if (branding) {
      setPrimaryColor(branding.primaryColor ?? "#6366f1");
      setAccentColor(branding.accentColor ?? "#8b5cf6");
      setFontFamily(branding.fontFamily ?? "Inter");
      setLogoUrl(branding.logoUrl ?? "");
      setCustomDomain(branding.customDomain ?? "");
    }
  }, [branding]);
  const updateBrandingMutation = trpc.tenants.updateBranding.useMutation({
    onSuccess: () => toast.success("Branding saved successfully"),
    onError: (e: any) => toast.error(`Failed to save branding: ${e.message}`),
  });
  const handleSave = () => {
    updateBrandingMutation.mutate({
      slug: merchantSlug,
      primaryColor,
      accentColor,
      fontFamily,
      logoUrl: logoUrl || null,
      customDomain: customDomain || null,
    });
  };
  if (brandingLoading) return <div className="bg-card rounded-xl border border-border p-6"><Skeleton className="h-40 w-full" /></div>;
  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">White-Label Branding</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Customise your portal's colours, typography, and domain for a fully white-labelled experience.
      </p>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Quick Presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_THEMES.map(p => (
            <button
              key={p.name}
              type="button"
              onClick={() => { setPrimaryColor(p.primary); setAccentColor(p.accent); toast.success(`Applied "${p.name}" theme`); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:border-primary transition-colors"
            >
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: p.primary }} />
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: p.accent }} />
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Primary Colour</label>
          <div className="flex items-center gap-2">
            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-border" />
            <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Accent Colour</label>
          <div className="flex items-center gap-2">
            <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-border" />
            <input type="text" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Font Family</label>
        <Select value={fontFamily} onValueChange={setFontFamily}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select font" />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Logo URL</label>
        <input
          type="url"
          value={logoUrl}
          onChange={e => setLogoUrl(e.target.value)}
          placeholder="https://cdn.example.com/logo.png"
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
        />
        {logoUrl && <img src={logoUrl} alt="Logo preview" className="h-10 mt-1 rounded" onError={() => setLogoUrl('')} />}
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Custom Domain</label>
        <input
          type="text"
          value={customDomain}
          onChange={e => setCustomDomain(e.target.value)}
          placeholder="pay.yourbrand.com"
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
        />
        <p className="text-xs text-muted-foreground">Point a CNAME record to <code>portal.paygate.ng</code> then enter your domain here.</p>
      </div>
      <div className="rounded-lg p-4 border border-border" style={{ fontFamily: `${fontFamily}, sans-serif` }}>
        <div className="flex items-center gap-3">
          {logoUrl
            ? <img src={logoUrl} alt="Logo" className="h-8 rounded" onError={() => {}} />
            : <div className="w-8 h-8 rounded" style={{ background: primaryColor }} />}
          <span className="font-semibold text-sm" style={{ color: primaryColor }}>Your Brand</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full text-white" style={{ background: accentColor }}>Live Preview</span>
        </div>
      </div>
      <Button onClick={handleSave} disabled={updateBrandingMutation.isPending}>
        <Save className="w-4 h-4 mr-1.5" />
        {updateBrandingMutation.isPending ? "Saving..." : "Save Branding"}
      </Button>
    </div>
  );
}

// ─── Consumer Portal Section ────────────────────────────────────────────────
function ConsumerPortalSection({ merchantName, merchantId }: { merchantName: string; merchantId: string }) {
  const [showQR, setShowQR] = useState(false);

  // Generate a merchant-specific deep link slug from business name
  const slug = merchantName
    ? merchantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
    : merchantId.slice(0, 12);
  const consumerUrl = `${window.location.origin}/consumer`;
  const deepLink = slug ? `${window.location.origin}/consumer?merchant=${encodeURIComponent(slug)}` : consumerUrl;
  const shareText = `Pay with PayGate — ${merchantName || 'our store'}. Open the app to manage your wallet, send money, and pay at checkout.`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(deepLink);
    toast.success('Deep link copied to clipboard');
  }, [deepLink]);

  const handleWhatsApp = useCallback(() => {
    const msg = encodeURIComponent(`${shareText}\n\n${deepLink}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
  }, [shareText, deepLink]);

  const handleSMS = useCallback(() => {
    const msg = encodeURIComponent(`${shareText} ${deepLink}`);
    window.open(`sms:?body=${msg}`, '_blank');
  }, [shareText, deepLink]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${merchantName || 'PayGate'} Consumer App`, text: shareText, url: deepLink });
      } catch { /* user cancelled */ }
    } else {
      handleCopy();
    }
  }, [merchantName, shareText, deepLink, handleCopy]);

  return (
    <div className="bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-xl border border-violet-500/20 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Consumer App Portal</h3>
          <p className="text-xs text-muted-foreground">Separate app for your end-customers — wallets, QR pay, bill payments</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        The <strong>PayGate Consumer App</strong> is a standalone mobile-first portal your customers use to manage their wallet, send money, pay bills, and scan QR codes at your checkout.
      </p>

      {/* Deep link display */}
      <div className="rounded-lg bg-background border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
          <Link className="w-3 h-3" />
          Your merchant deep link
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-violet-600 bg-violet-50 px-2 py-1.5 rounded truncate">
            {deepLink}
          </code>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
            title="Copy link"
          >
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <a
          href={consumerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open App
        </a>
        <button
          onClick={handleWhatsApp}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp
        </button>
        <button
          onClick={handleSMS}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-500/30 text-violet-600 text-sm font-medium hover:bg-violet-500/10 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          SMS
        </button>
        <button
          onClick={handleNativeShare}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground text-sm font-medium hover:bg-muted transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share
        </button>
      </div>

      {/* Features grid */}
      <div className="rounded-lg bg-muted/50 border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">Consumer App Features</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {["Wallet & Balance", "Send Money", "QR Payments", "Bill Pay", "Quick Pay", "Notifications", "Transaction History", "KYC Onboarding"].map(f => (
            <div key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3 h-3 text-violet-400 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
