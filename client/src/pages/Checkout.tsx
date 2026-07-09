// @ts-nocheck
/**
 * Checkout.tsx — Merchant checkout management dashboard
 * Tabs:
 *  1. Payment Links — create/manage shareable payment links
 *  2. Checkout Theme — brand the hosted payment page (wired to DB via hostedCheckout.saveTheme)
 *  3. Embed Code — JS snippet for inline checkout on merchant websites
 *  4. Sessions — recent hosted payment sessions
 */

import { useState, useEffect } from "react";
import {
  Copy, ExternalLink, Plus, Palette, Eye, Link2, QrCode, Loader2,
  AlertCircle, Shield, Upload, RefreshCw, CheckCircle2, XCircle,
  Clock, CreditCard, Building2, Phone, Smartphone, DollarSign,
  ToggleLeft, ToggleRight, Zap, Code2, BarChart3, Settings, TrendingUp,
  Users, Activity,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLORS: Record<string, string> = {
  completed:  "bg-emerald-100 text-emerald-700",
  processing: "bg-blue-100 text-blue-700",
  pending:    "bg-amber-100 text-amber-700",
  failed:     "bg-rose-100 text-rose-700",
  expired:    "bg-gray-100 text-gray-500",
  abandoned:  "bg-gray-100 text-gray-500",
};

const METHOD_ICONS: Record<string, any> = {
  card: CreditCard, bank_transfer: Building2, ussd: Phone, bnpl: Smartphone, usdc: DollarSign,
};

const GOOGLE_FONTS = ["Inter", "Space Grotesk", "Poppins", "DM Sans", "Plus Jakarta Sans", "Nunito", "Lato", "Roboto"];

// ─── Live Checkout Preview ────────────────────────────────────────────────────

function CheckoutPreview({ theme }: {
  theme: {
    primaryColor: string; backgroundColor: string; textColor: string;
    accentColor: string; fontFamily: string; borderRadius: string;
    businessName?: string; logoUrl?: string; tagline?: string;
    showPaymentMethods?: string[];
  };
}) {
  const [step, setStep] = useState<"method" | "card" | "success">("method");
  const [cardNum, setCardNum] = useState("");
  const br = `${theme.borderRadius}px`;
  const methods = theme.showPaymentMethods ?? ["card", "bank_transfer", "ussd", "bnpl"];

  const methodLabels: Record<string, { label: string; sub: string; icon: any }> = {
    card:          { label: "Card Payment",   sub: "Visa · Mastercard · Verve", icon: CreditCard },
    bank_transfer: { label: "Bank Transfer",  sub: "Instant NIP virtual account", icon: Building2 },
    ussd:          { label: "USSD",           sub: "*737# and more", icon: Phone },
    bnpl:          { label: "Pay Later",      sub: "Split into 3 payments", icon: Smartphone },
    usdc:          { label: "USDC",           sub: "Pay with stablecoin", icon: DollarSign },
  };

  return (
    <div className="rounded-3xl overflow-hidden shadow-2xl border border-border max-w-xs mx-auto"
      style={{ background: theme.backgroundColor, fontFamily: theme.fontFamily }}>
      {/* Header */}
      <div className="px-6 py-5 text-center" style={{ background: theme.primaryColor }}>
        {theme.logoUrl ? (
          <img src={theme.logoUrl} alt={theme.businessName} className="w-10 h-10 rounded-xl mx-auto mb-2 object-contain bg-white p-1" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-2">
            <span className="text-white font-bold text-sm">{(theme.businessName ?? "AC").slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        <p className="text-white/70 text-xs">{theme.businessName ?? "Acme Corp"}</p>
        <p className="text-white text-2xl font-black mt-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>₦50,000</p>
        {theme.tagline && <p className="text-white/50 text-xs mt-0.5">{theme.tagline}</p>}
      </div>

      {/* Body */}
      <div className="p-5">
        {step === "method" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: `${theme.textColor}80` }}>
              Choose payment method
            </p>
            {methods.slice(0, 3).map(m => {
              const cfg = methodLabels[m];
              if (!cfg) return null;
              return (
                <button key={m} onClick={() => setStep("card")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-gray-100 hover:border-opacity-60 transition-all text-left"
                  onMouseEnter={e => (e.currentTarget.style.borderColor = theme.primaryColor)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#f3f4f6")}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${theme.primaryColor}15` }}>
                    <cfg.icon className="w-4 h-4" style={{ color: theme.primaryColor }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: theme.textColor }}>{cfg.label}</p>
                    <p className="text-xs text-gray-400">{cfg.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {step === "card" && (
          <div className="space-y-3">
            <button onClick={() => setStep("method")} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              ← Back
            </button>
            <div>
              <label className="text-xs font-medium text-gray-500">Card Number</label>
              <input
                value={cardNum}
                onChange={e => setCardNum(e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim())}
                placeholder="0000 0000 0000 0000"
                className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-none font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-500">Expiry</label>
                <input placeholder="MM/YY" className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-none font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">CVV</label>
                <input placeholder="•••" type="password" maxLength={3} className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-none font-mono" />
              </div>
            </div>
            <button
              onClick={() => setStep("success")}
              className="w-full py-2.5 rounded-xl text-white text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ background: theme.primaryColor }}
            >
              Pay ₦50,000
            </button>
          </div>
        )}

        {step === "success" && (
          <div className="text-center py-4 space-y-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
              style={{ background: `${theme.accentColor}20` }}>
              <CheckCircle2 className="w-7 h-7" style={{ color: theme.accentColor }} />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: theme.textColor }}>Payment Successful!</p>
              <p className="text-xs text-gray-400 mt-0.5">₦50,000 paid to {theme.businessName ?? "Acme Corp"}</p>
            </div>
            <button onClick={() => setStep("method")} className="text-xs hover:underline" style={{ color: theme.primaryColor }}>
              Make another payment
            </button>
          </div>
        )}
      </div>

      <div className="px-5 pb-4 text-center">
        <p className="text-xs text-gray-300">Secured by <strong style={{ color: theme.primaryColor }}>PayGate</strong></p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Checkout() {
  const { user } = useAuth();
  const merchantId = (user as any)?.merchantId ?? "default";
  const tenantId = (user as any)?.tenantId ?? "default";

  const [activeTab, setActiveTab] = useState<"links" | "theme" | "embed" | "sessions" | "analytics">("links");

  // ── Theme state ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState({
    primaryColor: "#4F46E5",
    backgroundColor: "#f9fafb",
    textColor: "#111827",
    accentColor: "#10B981",
    fontFamily: "Inter",
    borderRadius: "16",
    businessName: "",
    tagline: "",
    supportEmail: "",
    supportPhone: "",
    logoUrl: "",
    showPaymentMethods: ["card", "bank_transfer", "ussd", "bnpl"],
    showOrderSummary: true,
    showSecurityBadge: true,
    requireBillingAddress: false,
    customCss: "",
  });
  const [themeDirty, setThemeDirty] = useState(false);

  const utils = trpc.useUtils();

  // ── Payment Links ────────────────────────────────────────────────────────
  const { data: linksData, isLoading: linksLoading, error: linksError } = trpc.paymentLinks.list.useQuery();

  const createLinkMutation = trpc.paymentLinks.create.useMutation({
    onSuccess: () => {
      toast.success("Payment link created!");
      utils.paymentLinks.list.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const toggleLinkMutation = trpc.paymentLinks.toggle.useMutation({
    onSuccess: () => utils.paymentLinks.list.invalidate(),
    onError: err => toast.error(err.message),
  });

  // ── Checkout Theme ───────────────────────────────────────────────────────
  const { data: savedTheme, isLoading: themeLoading } = trpc.hostedCheckout.getTheme.useQuery(
    { merchantId },
    { enabled: activeTab === "theme" },
  );

  useEffect(() => {
    if (savedTheme) {
      setTheme({
        primaryColor: savedTheme.primaryColor ?? "#4F46E5",
        backgroundColor: savedTheme.backgroundColor ?? "#f9fafb",
        textColor: savedTheme.textColor ?? "#111827",
        accentColor: savedTheme.accentColor ?? "#10B981",
        fontFamily: savedTheme.fontFamily ?? "Inter",
        borderRadius: savedTheme.borderRadius ?? "16",
        businessName: savedTheme.businessName ?? "",
        tagline: savedTheme.tagline ?? "",
        supportEmail: savedTheme.supportEmail ?? "",
        supportPhone: savedTheme.supportPhone ?? "",
        logoUrl: savedTheme.logoUrl ?? "",
        showPaymentMethods: (savedTheme.showPaymentMethods as string[]) ?? ["card", "bank_transfer", "ussd", "bnpl"],
        showOrderSummary: savedTheme.showOrderSummary ?? true,
        showSecurityBadge: savedTheme.showSecurityBadge ?? true,
        requireBillingAddress: savedTheme.requireBillingAddress ?? false,
        customCss: savedTheme.customCss ?? "",
      });
      setThemeDirty(false);
    }
  }, [savedTheme]);

  const saveThemeMutation = trpc.hostedCheckout.saveTheme.useMutation({
    onSuccess: () => {
      toast.success("Checkout theme saved!");
      setThemeDirty(false);
      utils.hostedCheckout.getTheme.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const updateTheme = (key: string, value: any) => {
    setTheme(t => ({ ...t, [key]: value }));
    setThemeDirty(true);
  };

  const handleSaveTheme = () => {
    saveThemeMutation.mutate({
      merchantId,
      tenantId,
      primaryColor: theme.primaryColor,
      backgroundColor: theme.backgroundColor,
      textColor: theme.textColor,
      accentColor: theme.accentColor,
      fontFamily: theme.fontFamily,
      borderRadius: theme.borderRadius,
      businessName: theme.businessName || undefined,
      tagline: theme.tagline || undefined,
      supportEmail: theme.supportEmail || undefined,
      supportPhone: theme.supportPhone || undefined,
      logoUrl: theme.logoUrl || undefined,
      showPaymentMethods: theme.showPaymentMethods,
      showOrderSummary: theme.showOrderSummary,
      showSecurityBadge: theme.showSecurityBadge,
      requireBillingAddress: theme.requireBillingAddress,
      customCss: theme.customCss || undefined,
    });
  };

  // ── Sessions ─────────────────────────────────────────────────────────────
  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = trpc.hostedCheckout.listSessions.useQuery(
    { merchantId, limit: 20 },
    { enabled: activeTab === "sessions", staleTime: 15_000 },
  );

  // ── Analytics ────────────────────────────────────────────────────────────
  const { data: dailyStats, isLoading: dailyLoading } = trpc.hostedCheckout.getDailyStats.useQuery(
    { merchantId, days: 30 },
    { enabled: activeTab === "analytics", staleTime: 60_000 },
  );
  const { data: funnelData, isLoading: funnelLoading } = trpc.hostedCheckout.getLinkAnalytics.useQuery(
    { merchantId },
    { enabled: activeTab === "analytics", staleTime: 60_000 },
  );

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Payment link copied!");
  };

  const TABS = [
    { id: "links",     label: "Payment Links",  icon: Link2 },
    { id: "theme",     label: "Checkout Theme", icon: Palette },
    { id: "embed",     label: "Embed Code",     icon: Code2 },
    { id: "sessions", label: "Sessions",        icon: BarChart3 },
    { id: "analytics", label: "Analytics",      icon: TrendingUp },
  ] as const;

  const EMBED_CODE = `<!-- PayGate Inline Checkout -->
<script src="https://js.paygate.africa/v1/checkout.js"></script>
<script>
  const handler = PayGate.setup({
    key: 'pk_live_xxxxxxxxxxxx',
    email: 'customer@example.com',
    amount: 5000000, // Amount in kobo (₦50,000)
    currency: 'NGN',
    ref: 'pg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
    metadata: {
      custom_fields: [
        { display_name: 'Order ID', variable_name: 'order_id', value: '12345' }
      ]
    },
    onSuccess: function(response) {
      // Verify on your server: POST /verify-payment
      console.log('Payment successful:', response.reference);
    },
    onClose: function() {
      console.log('Customer closed checkout');
    }
  });
  document.getElementById('pay-btn').addEventListener('click', () => handler.openIframe());
</script>
<button id="pay-btn">Pay ₦50,000</button>`;

  const REACT_CODE = `import { useEffect } from 'react';

export function PayGateButton({ amount, email, onSuccess }) {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://js.paygate.africa/v1/checkout.js';
    document.head.appendChild(script);
  }, []);

  const handlePay = () => {
    const handler = window.PayGate.setup({
      key: 'pk_live_xxxxxxxxxxxx',
      email,
      amount, // in kobo
      currency: 'NGN',
      ref: \`pg_\${Date.now()}\`,
      onSuccess,
    });
    handler.openIframe();
  };

  return <button onClick={handlePay}>Pay Now</button>;
}`;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Checkout & Payment Links
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Create payment links, brand your checkout page, and embed PayGate on your website
          </p>
        </div>
        {activeTab === "links" && (
          <Button size="sm" onClick={() => createLinkMutation.mutate({
            title: "New Payment Link",
            amount: 10000,
            currency: "NGN",
            description: "Created from dashboard",
          })} disabled={createLinkMutation.isPending}>
            {createLinkMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Payment Link
          </Button>
        )}
        {activeTab === "theme" && (
          <Button size="sm" onClick={handleSaveTheme} disabled={!themeDirty || saveThemeMutation.isPending}>
            {saveThemeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            {themeDirty ? "Save Theme" : "Saved"}
          </Button>
        )}
        {activeTab === "sessions" && (
          <Button variant="outline" size="sm" onClick={() => refetchSessions()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Payment Links ──────────────────────────────────────────────────── */}
      {activeTab === "links" && (
        <div className="space-y-4">
          {linksLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          )}
          {linksError && (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg p-4">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">Failed to load payment links: {linksError.message}</span>
            </div>
          )}
          {!linksLoading && !linksError && (!linksData || linksData.length === 0) && (
            <div className="text-center py-16 text-muted-foreground">
              <Link2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium mb-1">No payment links yet</p>
              <p className="text-sm">Create your first payment link to start accepting payments</p>
            </div>
          )}
          {linksData?.map(link => (
            <div key={link.id} className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{link.title}</p>
                  <Badge variant="secondary" className={`text-xs ${link.isActive ? "bg-emerald-100 text-emerald-700 border-0" : "bg-muted text-muted-foreground border-0"}`}>
                    {link.isActive ? "active" : "inactive"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 font-mono truncate">
                  pay.paygate.africa/pl/{link.slug ?? link.id}
                </p>
                {link.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-semibold font-mono">{link.currency} {Number(link.amount).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{link.usageCount ?? 0} uses</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => copyLink(`https://pay.paygate.africa/pl/${link.slug ?? link.id}`)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Copy link"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => window.open(`https://pay.paygate.africa/pl/${link.slug ?? link.id}`, "_blank")}
                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Open link"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toast.info("QR code generated for " + link.title)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Show QR code"
                >
                  <QrCode className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleLinkMutation.mutate({ id: link.id })}
                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title={link.isActive ? "Deactivate" : "Activate"}
                >
                  {link.isActive
                    ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                    : <ToggleLeft className="w-4 h-4" />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Checkout Theme ─────────────────────────────────────────────────── */}
      {activeTab === "theme" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-5">
            {themeLoading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
            ) : (
              <>
                {/* Brand */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" /> Brand Identity
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Business Name</Label>
                      <Input value={theme.businessName} onChange={e => updateTheme("businessName", e.target.value)} placeholder="Acme Corp" className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Tagline</Label>
                      <Input value={theme.tagline} onChange={e => updateTheme("tagline", e.target.value)} placeholder="Premium Plan" className="mt-1 h-9 text-sm" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Logo URL</Label>
                    <Input value={theme.logoUrl} onChange={e => updateTheme("logoUrl", e.target.value)} placeholder="https://cdn.example.com/logo.png" className="mt-1 h-9 text-sm" />
                  </div>
                </div>

                {/* Colors */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" /> Colours
                  </h3>
                  {[
                    { key: "primaryColor", label: "Primary (header & buttons)" },
                    { key: "backgroundColor", label: "Page Background" },
                    { key: "textColor", label: "Text Colour" },
                    { key: "accentColor", label: "Accent (success states)" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <div className="flex items-center gap-3 mt-1.5">
                        <input
                          type="color"
                          value={(theme as any)[key]}
                          onChange={e => updateTheme(key, e.target.value)}
                          className="w-9 h-9 rounded-lg border border-border cursor-pointer flex-shrink-0"
                        />
                        <Input
                          value={(theme as any)[key]}
                          onChange={e => updateTheme(key, e.target.value)}
                          className="flex-1 h-9 text-sm font-mono"
                          maxLength={7}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Typography & Shape */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" /> Typography & Shape
                  </h3>
                  <div>
                    <Label className="text-xs">Font Family</Label>
                    <select
                      value={theme.fontFamily}
                      onChange={e => updateTheme("fontFamily", e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Border Radius: {theme.borderRadius}px</Label>
                    <input
                      type="range" min="0" max="32" value={theme.borderRadius}
                      onChange={e => updateTheme("borderRadius", e.target.value)}
                      className="w-full mt-1.5"
                    />
                  </div>
                </div>

                {/* Payment methods */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" /> Enabled Payment Methods
                  </h3>
                  {["card", "bank_transfer", "ussd", "bnpl", "usdc"].map(m => {
                    const enabled = theme.showPaymentMethods.includes(m);
                    const labels: Record<string, string> = {
                      card: "Card (Visa/Mastercard/Verve)",
                      bank_transfer: "Bank Transfer (NIP)",
                      ussd: "USSD",
                      bnpl: "Buy Now Pay Later",
                      usdc: "USDC Stablecoin",
                    };
                    return (
                      <div key={m} className="flex items-center justify-between">
                        <span className="text-sm">{labels[m]}</span>
                        <button
                          onClick={() => updateTheme("showPaymentMethods",
                            enabled
                              ? theme.showPaymentMethods.filter(x => x !== m)
                              : [...theme.showPaymentMethods, m]
                          )}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {enabled
                            ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                            : <ToggleLeft className="w-6 h-6" />
                          }
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Feature flags */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" /> Options
                  </h3>
                  {[
                    { key: "showSecurityBadge", label: "Show security badge" },
                    { key: "showOrderSummary", label: "Show order summary" },
                    { key: "requireBillingAddress", label: "Require billing address" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm">{label}</span>
                      <button onClick={() => updateTheme(key, !(theme as any)[key])}>
                        {(theme as any)[key]
                          ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                          : <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                        }
                      </button>
                    </div>
                  ))}
                </div>

                {/* Custom CSS */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-primary" /> Custom CSS
                  </h3>
                  <textarea
                    value={theme.customCss}
                    onChange={e => updateTheme("customCss", e.target.value)}
                    placeholder="/* Override checkout styles */"
                    rows={4}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
              </>
            )}
          </div>

          {/* Live Preview */}
          <div className="lg:sticky lg:top-6 self-start">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
              {themeDirty && <Badge variant="outline" className="text-xs">Unsaved changes</Badge>}
            </div>
            <CheckoutPreview theme={theme} />
            <p className="text-xs text-muted-foreground text-center mt-3">
              Preview at{" "}
              <a href={`/pay/${merchantId}`} target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline font-mono">
                /pay/{merchantId}
              </a>
            </p>
          </div>
        </div>
      )}

      {/* ── Embed Code ─────────────────────────────────────────────────────── */}
      {activeTab === "embed" && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              HTML / Vanilla JS
            </h3>
            <p className="text-sm text-muted-foreground">
              Add this snippet to any webpage to open the PayGate checkout modal.
            </p>
            <div className="bg-muted rounded-xl p-4 font-mono text-xs overflow-x-auto">
              <pre className="text-foreground whitespace-pre-wrap">{EMBED_CODE}</pre>
            </div>
            <Button size="sm" onClick={() => { navigator.clipboard.writeText(EMBED_CODE); toast.success("Code copied!"); }}>
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Code
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              React / Next.js Component
            </h3>
            <div className="bg-muted rounded-xl p-4 font-mono text-xs overflow-x-auto">
              <pre className="text-foreground whitespace-pre-wrap">{REACT_CODE}</pre>
            </div>
            <Button size="sm" onClick={() => { navigator.clipboard.writeText(REACT_CODE); toast.success("Code copied!"); }}>
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Code
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-3">
            <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Webhook Events</h3>
            <p className="text-sm text-muted-foreground">
              PayGate sends POST webhooks to your server for every payment event.
            </p>
            <div className="bg-muted rounded-xl p-4 font-mono text-xs overflow-x-auto">
              <pre className="text-foreground whitespace-pre-wrap">{`// Payload example — payment.completed
{
  "event": "payment.completed",
  "data": {
    "reference": "PG_1720000000_ABCD1234",
    "amount": 5000000,
    "currency": "NGN",
    "customer": { "email": "john@example.com", "name": "John Doe" },
    "payment_method": "card",
    "paid_at": "2024-07-04T12:00:00Z",
    "metadata": { "order_id": "12345" }
  }
}`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Sessions ───────────────────────────────────────────────────────── */}
      {activeTab === "sessions" && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="p-3 text-left font-medium text-muted-foreground text-xs">Reference</th>
                <th className="p-3 text-left font-medium text-muted-foreground text-xs">Customer</th>
                <th className="p-3 text-left font-medium text-muted-foreground text-xs">Method</th>
                <th className="p-3 text-left font-medium text-muted-foreground text-xs">Status</th>
                <th className="p-3 text-right font-medium text-muted-foreground text-xs">Amount</th>
                <th className="p-3 text-left font-medium text-muted-foreground text-xs">Date</th>
              </tr>
            </thead>
            <tbody>
              {sessionsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : !sessions?.length ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    <Zap className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No payment sessions yet</p>
                    <p className="text-xs mt-1">Sessions appear when customers open your payment links</p>
                  </td>
                </tr>
              ) : (
                sessions.map((s: any) => {
                  const MethodIcon = METHOD_ICONS[s.paymentMethod] ?? CreditCard;
                  return (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <p className="font-mono text-xs font-semibold text-indigo-600">{s.reference}</p>
                      </td>
                      <td className="p-3">
                        <p className="text-xs font-medium">{s.customerName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{s.customerEmail ?? ""}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <MethodIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs capitalize">{s.paymentMethod?.replace(/_/g, " ") ?? "—"}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-xs font-semibold">
                        {fmt(Number(s.amountKobo) / 100, s.currency)}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(s.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Analytics Tab ─────────────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* KPI summary row */}
          {funnelData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Views", value: funnelData.funnel?.views ?? 0, icon: Users, color: "text-blue-500" },
                { label: "Initiated", value: funnelData.funnel?.initiated ?? 0, icon: Activity, color: "text-yellow-500" },
                { label: "Completed", value: funnelData.funnel?.completed ?? 0, icon: CheckCircle2, color: "text-green-500" },
                { label: "Conversion", value: `${funnelData.conversionRate ?? 0}%`, icon: TrendingUp, color: "text-indigo-500" },
              ].map(kpi => (
                <div key={kpi.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}>
                    <kpi.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-lg font-bold">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Daily volume line chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              Daily Payment Volume (Last 30 Days)
            </h3>
            {dailyLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : dailyStats?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyStats} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, name: string) => [v, name.charAt(0).toUpperCase() + name.slice(1)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2} dot={false} name="Completed" />
                  <Line type="monotone" dataKey="initiated" stroke="#F59E0B" strokeWidth={2} dot={false} name="Initiated" />
                  <Line type="monotone" dataKey="views" stroke="#6366F1" strokeWidth={2} dot={false} name="Views" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                <TrendingUp className="w-6 h-6 mr-2 opacity-30" /> No data yet
              </div>
            )}
          </div>

          {/* Conversion funnel bar chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Conversion Funnel by Payment Method
            </h3>
            {funnelLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : funnelData?.byMethod && Object.keys(funnelData.byMethod).length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={Object.entries(funnelData.byMethod).map(([method, counts]: any) => ({ method, ...counts }))}
                  margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="method" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="initiated" fill="#F59E0B" name="Initiated" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" fill="#10B981" name="Completed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                <BarChart3 className="w-6 h-6 mr-2 opacity-30" /> No funnel data yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
