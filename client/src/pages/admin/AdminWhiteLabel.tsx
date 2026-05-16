// @ts-nocheck
import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Palette, Globe, Eye, Save, RefreshCw, Building2,
  Monitor, Smartphone, Layout, Type, Link2,
} from "lucide-react";

const FONT_OPTIONS = ["Inter", "Roboto", "Poppins", "Nunito", "Lato", "Open Sans"];

interface BrandingForm {
  name: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  footerText: string;
  supportEmail: string;
  customDomain: string;
}

const DEFAULT_FORM: BrandingForm = {
  name: "",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#6366f1",
  secondaryColor: "#8b5cf6",
  fontFamily: "Inter",
  footerText: "© 2026 PayGate. All rights reserved.",
  supportEmail: "support@paygate.ng",
  customDomain: "",
};

export default function AdminWhiteLabel() {
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [form, setForm] = useState<BrandingForm>(DEFAULT_FORM);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const { data: brandings, isLoading, refetch } = trpc.wave26.whiteLabel.listBrandings.useQuery();

  const updateMutation = trpc.wave26.tenantManagement.update.useMutation({
    onSuccess: () => { toast.success("Branding updated successfully"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Load selected tenant branding into form
  useEffect(() => {
    if (!selectedTenantId || !brandings) return;
    const tenant = (brandings as Array<Record<string, unknown>>).find(t => t.id === selectedTenantId);
    if (tenant) {
      setForm({
        name: String(tenant.name ?? ""),
        logoUrl: String(tenant.logo_url ?? ""),
        faviconUrl: String(tenant.favicon_url ?? ""),
        primaryColor: String(tenant.primary_color ?? "#6366f1"),
        secondaryColor: String(tenant.secondary_color ?? "#8b5cf6"),
        fontFamily: String(tenant.font_family ?? "Inter"),
        footerText: String(tenant.footer_text ?? ""),
        supportEmail: String(tenant.support_email ?? ""),
        customDomain: String(tenant.custom_domain ?? ""),
      });
    }
  }, [selectedTenantId, brandings]);

  const handleSave = () => {
    if (!selectedTenantId) { toast.error("Select a tenant first"); return; }
    updateMutation.mutate({
      id: selectedTenantId,
      name: form.name || undefined,
      logoUrl: form.logoUrl || undefined,
      faviconUrl: form.faviconUrl || undefined,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      fontFamily: form.fontFamily as "Inter" | "Roboto" | "Poppins" | "Nunito" | "Lato" | "Open Sans",
      footerText: form.footerText || undefined,
      supportEmail: form.supportEmail || undefined,
      customDomain: form.customDomain || undefined,
    });
  };

  const tenantList = (brandings ?? []) as Array<Record<string, unknown>>;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Palette className="w-6 h-6 text-indigo-600" />
              White-Label Branding
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Customize per-tenant branding: logos, colors, fonts, domains, and footer
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
            </Button>
            <Button onClick={handleSave} disabled={!selectedTenantId || updateMutation.isPending} className="gap-2">
              <Save className="w-4 h-4" />
              {updateMutation.isPending ? "Saving..." : "Save Branding"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Tenant Selector + Form */}
          <div className="lg:col-span-2 space-y-4">
            {/* Tenant Selector */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Select Tenant
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-sm text-gray-400">Loading tenants...</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {tenantList.map(t => (
                      <button
                        key={String(t.id)}
                        onClick={() => setSelectedTenantId(String(t.id))}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all text-sm ${
                          selectedTenantId === String(t.id)
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded flex-shrink-0"
                          style={{ backgroundColor: String(t.primary_color ?? "#6366f1") }}
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{String(t.name)}</div>
                          <div className="text-xs text-gray-400 truncate">/{String(t.slug)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Branding Form */}
            {selectedTenantId && (
              <Tabs defaultValue="identity">
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="identity" className="text-xs">Identity</TabsTrigger>
                  <TabsTrigger value="colors" className="text-xs">Colors</TabsTrigger>
                  <TabsTrigger value="typography" className="text-xs">Typography</TabsTrigger>
                  <TabsTrigger value="domain" className="text-xs">Domain</TabsTrigger>
                </TabsList>

                {/* Identity Tab */}
                <TabsContent value="identity" className="space-y-4 mt-4">
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="space-y-1">
                        <Label>Display Name</Label>
                        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Payments" />
                      </div>
                      <div className="space-y-1">
                        <Label>Logo URL</Label>
                        <Input value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://cdn.example.com/logo.png" />
                        {form.logoUrl && (
                          <img src={form.logoUrl} alt="Logo preview" className="h-12 mt-2 rounded border p-1 object-contain" onError={e => (e.currentTarget.style.display = "none")} />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label>Favicon URL</Label>
                        <Input value={form.faviconUrl} onChange={e => setForm(f => ({ ...f, faviconUrl: e.target.value }))} placeholder="https://cdn.example.com/favicon.ico" />
                      </div>
                      <div className="space-y-1">
                        <Label>Footer Text</Label>
                        <Input value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} placeholder="© 2026 Acme Payments. All rights reserved." />
                      </div>
                      <div className="space-y-1">
                        <Label>Support Email</Label>
                        <Input type="email" value={form.supportEmail} onChange={e => setForm(f => ({ ...f, supportEmail: e.target.value }))} placeholder="support@acme.com" />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Colors Tab */}
                <TabsContent value="colors" className="space-y-4 mt-4">
                  <Card>
                    <CardContent className="pt-4 space-y-6">
                      {[
                        { key: "primaryColor", label: "Primary Color", desc: "Buttons, links, active states" },
                        { key: "secondaryColor", label: "Secondary Color", desc: "Accents, badges, highlights" },
                      ].map(c => (
                        <div key={c.key} className="space-y-2">
                          <div>
                            <Label>{c.label}</Label>
                            <p className="text-xs text-gray-400">{c.desc}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={(form as Record<string, string>)[c.key]}
                              onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))}
                              className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200 p-0.5"
                            />
                            <Input
                              value={(form as Record<string, string>)[c.key]}
                              onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))}
                              className="font-mono w-36"
                              maxLength={7}
                            />
                            <div
                              className="flex-1 h-12 rounded-lg border"
                              style={{ backgroundColor: (form as Record<string, string>)[c.key] }}
                            />
                          </div>
                          {/* Preset swatches */}
                          <div className="flex gap-2 flex-wrap">
                            {["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"].map(color => (
                              <button
                                key={color}
                                onClick={() => setForm(f => ({ ...f, [c.key]: color }))}
                                className="w-7 h-7 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Typography Tab */}
                <TabsContent value="typography" className="space-y-4 mt-4">
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="space-y-1">
                        <Label>Font Family</Label>
                        <Select value={form.fontFamily} onValueChange={v => setForm(f => ({ ...f, fontFamily: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FONT_OPTIONS.map(font => (
                              <SelectItem key={font} value={font}>
                                <span style={{ fontFamily: font }}>{font}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <p style={{ fontFamily: form.fontFamily }} className="text-lg font-semibold">
                          The quick brown fox jumps over the lazy dog
                        </p>
                        <p style={{ fontFamily: form.fontFamily }} className="text-sm text-gray-500 mt-1">
                          0123456789 — ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Domain Tab */}
                <TabsContent value="domain" className="space-y-4 mt-4">
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1">
                          <Globe className="w-4 h-4" /> Custom Domain
                        </Label>
                        <Input
                          value={form.customDomain}
                          onChange={e => setForm(f => ({ ...f, customDomain: e.target.value }))}
                          placeholder="portal.acmepayments.com"
                        />
                        <p className="text-xs text-gray-400">
                          Point your DNS CNAME to <code className="bg-gray-100 px-1 rounded">portal.paygate.ng</code> and enter your domain above.
                        </p>
                      </div>
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        <strong>DNS Setup:</strong> Add a CNAME record pointing your subdomain to{" "}
                        <code>portal.paygate.ng</code>. SSL certificates are provisioned automatically via Let's Encrypt within 24 hours.
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>

          {/* Right: Live Preview */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Live Preview
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      size="sm" variant={previewDevice === "desktop" ? "default" : "ghost"}
                      className="h-7 w-7 p-0"
                      onClick={() => setPreviewDevice("desktop")}
                    >
                      <Monitor className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm" variant={previewDevice === "mobile" ? "default" : "ghost"}
                      className="h-7 w-7 p-0"
                      onClick={() => setPreviewDevice("mobile")}
                    >
                      <Smartphone className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`border rounded-lg overflow-hidden ${previewDevice === "mobile" ? "max-w-[320px] mx-auto" : "w-full"}`}>
                  {/* Preview Header */}
                  <div className="p-3 flex items-center gap-2" style={{ backgroundColor: form.primaryColor }}>
                    {form.logoUrl
                      ? <img src={form.logoUrl} alt="logo" className="h-6 object-contain" onError={e => (e.currentTarget.style.display = "none")} />
                      : <div className="w-6 h-6 bg-white/30 rounded text-white text-xs flex items-center justify-center font-bold">
                          {form.name.slice(0, 1) || "P"}
                        </div>
                    }
                    <span className="text-white font-semibold text-sm" style={{ fontFamily: form.fontFamily }}>
                      {form.name || "Your Brand"}
                    </span>
                  </div>

                  {/* Preview Body */}
                  <div className="p-4 bg-gray-50 space-y-3" style={{ fontFamily: form.fontFamily }}>
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <div className="text-xs text-gray-400 mb-1">Total Balance</div>
                      <div className="text-xl font-bold" style={{ color: form.primaryColor }}>₦1,234,567.89</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="py-2 rounded-lg text-white text-xs font-medium"
                        style={{ backgroundColor: form.primaryColor }}
                      >
                        Send Money
                      </button>
                      <button
                        className="py-2 rounded-lg text-white text-xs font-medium"
                        style={{ backgroundColor: form.secondaryColor }}
                      >
                        Request
                      </button>
                    </div>
                    <div className="space-y-1">
                      {["Transaction 1", "Transaction 2"].map((t, i) => (
                        <div key={i} className="flex items-center justify-between bg-white rounded p-2 text-xs">
                          <span className="text-gray-600">{t}</span>
                          <span className="font-medium" style={{ color: i === 0 ? form.primaryColor : "#ef4444" }}>
                            {i === 0 ? "+₦5,000" : "-₦2,500"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview Footer */}
                  <div className="p-2 bg-gray-100 text-center text-xs text-gray-400" style={{ fontFamily: form.fontFamily }}>
                    {form.footerText || "© 2026 PayGate"}
                  </div>
                </div>

                {/* Branding Summary */}
                {selectedTenantId && (
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Primary</span>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: form.primaryColor }} />
                        <code className="bg-gray-100 px-1 rounded">{form.primaryColor}</code>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Secondary</span>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: form.secondaryColor }} />
                        <code className="bg-gray-100 px-1 rounded">{form.secondaryColor}</code>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Font</span>
                      <span className="font-medium">{form.fontFamily}</span>
                    </div>
                    {form.customDomain && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Domain</span>
                        <span className="font-medium text-blue-600 flex items-center gap-1">
                          <Link2 className="w-3 h-3" /> {form.customDomain}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
