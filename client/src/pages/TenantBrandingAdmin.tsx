// @ts-nocheck
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Eye, Save, RefreshCw, Globe, Type, Image, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const FONT_OPTIONS = ["Inter", "Roboto", "Poppins", "Montserrat", "Nunito", "DM Sans", "Plus Jakarta Sans"];

const PRESET_THEMES = [
  { name: "PayGate Default", primary: "#6366f1", secondary: "#8b5cf6", bg: "#ffffff", text: "#0f172a" },
  { name: "Ocean Blue", primary: "#0ea5e9", secondary: "#38bdf8", bg: "#f0f9ff", text: "#0c4a6e" },
  { name: "Forest Green", primary: "#16a34a", secondary: "#22c55e", bg: "#f0fdf4", text: "#14532d" },
  { name: "Sunset Orange", primary: "#ea580c", secondary: "#f97316", bg: "#fff7ed", text: "#7c2d12" },
  { name: "Royal Purple", primary: "#7c3aed", secondary: "#a855f7", bg: "#faf5ff", text: "#3b0764" },
  { name: "Midnight Dark", primary: "#f59e0b", secondary: "#fbbf24", bg: "#0f172a", text: "#f8fafc" },
];

export default function TenantBrandingAdmin() {
  const [slug, setSlug] = useState("my-tenant");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#8b5cf6");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [textColor, setTextColor] = useState("#0f172a");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [logoUrl, setLogoUrl] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [footerText, setFooterText] = useState("");
  const [previewActive, setPreviewActive] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: branding, refetch, isLoading } = trpc.tenantBrandingApi.getBySlug.useQuery(
    { slug },
    { enabled: slug.length >= 2 }
  , { staleTime: 30_000 });

  useEffect(() => {
    if (branding) {
      setPrimaryColor(branding.primaryColor ?? "#6366f1");
      setSecondaryColor(branding.secondaryColor ?? "#8b5cf6");
      setFontFamily(branding.fontFamily ?? "Inter");
      setSupportEmail(branding.supportEmail ?? "");
      setFooterText(branding.footerText ?? "");
    }
  }, [branding]);

  const applyPreset = (preset: typeof PRESET_THEMES[0]) => {
    setPrimaryColor(preset.primary);
    setSecondaryColor(preset.secondary);
    setBgColor(preset.bg);
    setTextColor(preset.text);
    toast.success(`Applied "${preset.name}" theme`);
  };

  const handlePreview = () => {
    if (previewActive) {
      // Remove injected styles
      const el = document.getElementById("tenant-branding-preview-style");
      if (el) el.remove();
      setPreviewActive(false);
      toast.info("Preview disabled");
    } else {
      // Inject CSS variables
      const style = document.createElement("style");
      style.id = "tenant-branding-preview-style";
      style.textContent = `
        :root {
          --preview-primary: ${primaryColor};
          --preview-secondary: ${secondaryColor};
          --preview-bg: ${bgColor};
          --preview-text: ${textColor};
          --preview-font: ${fontFamily}, sans-serif;
        }
      `;
      document.head.appendChild(style);
      setPreviewActive(true);
      toast.success("Preview activated — CSS variables injected");
    }
  };

  const saveMutation = trpc.tenantBrandingApi.upsert.useMutation({
    onSuccess: () => {
      setSaved(true);
      toast.success(`Branding for "${slug}" saved successfully`);
      refetch();
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  });

  const handleSave = () => {
    saveMutation.mutate({
      slug,
      primaryColor,
      secondaryColor,
      bgColor,
      textColor,
      fontFamily,
      logoUrl: logoUrl || null,
      supportEmail: supportEmail || undefined,
      footerText: footerText || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Palette className="w-6 h-6 text-pink-600" />
            Tenant Branding Admin
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Customise white-label branding for each tenant</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Eye className={`w-4 h-4 mr-1 ${previewActive ? "text-pink-600" : ""}`} />
            {previewActive ? "Disable Preview" : "Live Preview"}
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-pink-600 hover:bg-pink-700 text-white">
            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {saveMutation.isPending ? "Saving…" : saved ? "Saved!" : "Save Branding"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="colors">
            <TabsList>
              <TabsTrigger value="colors"><Palette className="w-3 h-3 mr-1" />Colors</TabsTrigger>
              <TabsTrigger value="typography"><Type className="w-3 h-3 mr-1" />Typography</TabsTrigger>
              <TabsTrigger value="identity"><Globe className="w-3 h-3 mr-1" />Identity</TabsTrigger>
              <TabsTrigger value="assets"><Image className="w-3 h-3 mr-1" />Assets</TabsTrigger>
            </TabsList>

            <TabsContent value="colors" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Theme Presets</CardTitle>
                  <CardDescription>Click a preset to apply instantly</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {PRESET_THEMES.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className="p-3 rounded-lg border hover:shadow-md transition-all text-left"
                        style={{ background: preset.bg, borderColor: preset.primary }}
                      >
                        <div className="flex gap-1 mb-2">
                          <div className="w-4 h-4 rounded-full" style={{ background: preset.primary }} />
                          <div className="w-4 h-4 rounded-full" style={{ background: preset.secondary }} />
                        </div>
                        <p className="text-xs font-medium" style={{ color: preset.text }}>{preset.name}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Custom Colors</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Primary Color", value: primaryColor, onChange: setPrimaryColor },
                    { label: "Secondary Color", value: secondaryColor, onChange: setSecondaryColor },
                    { label: "Background Color", value: bgColor, onChange: setBgColor },
                    { label: "Text Color", value: textColor, onChange: setTextColor },
                  ].map((c) => (
                    <div key={c.label} className="space-y-2">
                      <Label className="text-xs">{c.label}</Label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={c.value}
                          onChange={(e) => c.onChange(e.target.value)}
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={c.value}
                          onChange={(e) => c.onChange(e.target.value)}
                          className="font-mono text-xs"
                          maxLength={7}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="typography">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Font Family</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {FONT_OPTIONS.map((font) => (
                      <button
                        key={font}
                        onClick={() => setFontFamily(font)}
                        className={`p-3 rounded-lg border text-left transition-all ${fontFamily === font ? "border-pink-500 bg-pink-50" : "hover:border-pink-300"}`}
                      >
                        <p className="text-xs text-muted-foreground mb-1">{font}</p>
                        <p className="text-sm font-medium" style={{ fontFamily: `${font}, sans-serif` }}>
                          The quick brown fox
                        </p>
                        {fontFamily === font && <Badge className="text-xs mt-1 bg-pink-100 text-pink-700">Selected</Badge>}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="identity">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Tenant Identity</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tenant Slug (URL-safe identifier)</Label>
                    <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="my-tenant" />
                    <p className="text-xs text-muted-foreground">Used in: <code className="bg-muted px-1 rounded">https://app.paygate.ng/{slug}</code></p>
                  </div>
                  <div className="space-y-2">
                    <Label>Support Email</Label>
                    <Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder={`support@${slug}.paygate.ng`} />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer Text</Label>
                    <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder={`© 2026 ${slug} — Powered by PayGate`} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assets">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Logo & Favicon</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Logo URL</Label>
                    <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://cdn.example.com/logo.png" />
                    {logoUrl && (
                      <div className="mt-2 p-3 border rounded-lg bg-muted/30 flex items-center gap-3">
                        <img src={logoUrl} alt="Logo preview" className="h-10 object-contain" onError={(e: any) => { e.target.style.display = "none"; }} />
                        <p className="text-xs text-muted-foreground">Logo preview</p>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
                    <p className="font-semibold mb-1">Upload via CLI</p>
                    <code className="block bg-blue-100 p-2 rounded">manus-upload-file --webdev logo.png</code>
                    <p className="mt-1">Then paste the returned CDN URL above.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Live Preview Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="w-4 h-4" /> Brand Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-lg overflow-hidden border"
                style={{ background: bgColor, color: textColor, fontFamily: `${fontFamily}, sans-serif` }}
              >
                {/* Mock nav */}
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: primaryColor }}>
                  {logoUrl
                    ? <img src={logoUrl} alt="logo" className="h-6 object-contain" />
                    : <div className="w-6 h-6 rounded bg-white/30" />
                  }
                  <span className="text-white font-semibold text-sm">{slug || "tenant"}</span>
                </div>
                {/* Mock content */}
                <div className="p-4 space-y-3">
                  <div className="h-3 rounded" style={{ background: primaryColor, width: "60%", opacity: 0.2 }} />
                  <div className="h-2 rounded bg-current opacity-10 w-full" />
                  <div className="h-2 rounded bg-current opacity-10 w-4/5" />
                  <button
                    className="mt-2 px-4 py-2 rounded text-white text-xs font-semibold"
                    style={{ background: primaryColor }}
                  >
                    Primary Action
                  </button>
                  <button
                    className="ml-2 mt-2 px-4 py-2 rounded text-white text-xs font-semibold"
                    style={{ background: secondaryColor }}
                  >
                    Secondary
                  </button>
                </div>
                {/* Mock footer */}
                <div className="px-4 py-2 text-xs opacity-50 border-t" style={{ borderColor: primaryColor + "30" }}>
                  {footerText || `© 2026 ${slug} — Powered by PayGate`}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CSS Variables output */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Generated CSS Variables</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48 font-mono">
{`:root {
  --primary: ${primaryColor};
  --secondary: ${secondaryColor};
  --background: ${bgColor};
  --foreground: ${textColor};
  --font-sans: ${fontFamily};
}`}
              </pre>
              <Button size="sm" variant="outline" className="mt-2 w-full text-xs" onClick={() => {
                navigator.clipboard.writeText(`:root {\n  --primary: ${primaryColor};\n  --secondary: ${secondaryColor};\n  --background: ${bgColor};\n  --foreground: ${textColor};\n  --font-sans: ${fontFamily};\n}`);
                toast.success("CSS copied to clipboard");
              }}>
                Copy CSS
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
