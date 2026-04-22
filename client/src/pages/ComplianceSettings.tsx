// @ts-nocheck
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, Eye, AlertTriangle, Download, FileText, CheckCircle2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function ComplianceSettings() {
  const { data: settings, isLoading, refetch } = trpc.complianceKyc.getComplianceSettings.useQuery();
  const updateMut = trpc.complianceKyc.updateComplianceSettings.useMutation({
    onSuccess: () => { toast.success("Compliance settings updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const exportMut = trpc.complianceKyc.exportAuditLog.useMutation({
    onSuccess: (data) => {
      if (data.format === "csv") {
        const blob = new Blob([data.csv!], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `kyc-audit-${Date.now()}.csv`; a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${data.count} records`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const [local, setLocal] = useState({
    minLivenessScore: 0.7,
    kybRequired: true,
    kycAutoApproveThreshold: 0.95,
    amlScreeningEnabled: true,
    sanctionsCheckEnabled: true,
    pepCheckEnabled: true,
  });

  useEffect(() => {
    if (settings) setLocal({ ...settings });
  }, [settings]);

  const save = () => updateMut.mutate(local);

  const scoreColor = (v: number) =>
    v >= 0.9 ? "text-green-600" : v >= 0.7 ? "text-amber-600" : "text-red-600";

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading compliance settings…</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Compliance Settings</h1>
            <p className="text-muted-foreground mt-1">Configure KYC/KYB thresholds, AML screening, and liveness requirements.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportMut.mutate({ format: "csv" })} disabled={exportMut.isPending}>
            <Download className="h-4 w-4 mr-2" />
            {exportMut.isPending ? "Exporting…" : "Export KYC Audit Log"}
          </Button>
        </div>

        {/* Liveness Detection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> Liveness Detection</CardTitle>
            <CardDescription>Set the minimum confidence score required to pass liveness checks during KYC onboarding.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Minimum Liveness Score</Label>
                <span className={`text-lg font-bold ${scoreColor(local.minLivenessScore)}`}>
                  {(local.minLivenessScore * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                min={0} max={1} step={0.05}
                value={[local.minLivenessScore]}
                onValueChange={([v]) => setLocal(s => ({ ...s, minLivenessScore: v }))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0% (disabled)</span>
                <span className="text-amber-600">70% (recommended)</span>
                <span className="text-green-600">100% (strict)</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Auto-Approve Threshold</Label>
                <span className={`text-lg font-bold ${scoreColor(local.kycAutoApproveThreshold)}`}>
                  {(local.kycAutoApproveThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                min={0.5} max={1} step={0.05}
                value={[local.kycAutoApproveThreshold]}
                onValueChange={([v]) => setLocal(s => ({ ...s, kycAutoApproveThreshold: v }))}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">KYC submissions with a liveness score above this threshold will be automatically approved without manual review.</p>
            </div>
          </CardContent>
        </Card>

        {/* KYB Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Know Your Business (KYB)</CardTitle>
            <CardDescription>Business verification requirements for merchant onboarding.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Require KYB Verification</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Merchants must complete business verification before going live.</p>
              </div>
              <Switch checked={local.kybRequired} onCheckedChange={v => setLocal(s => ({ ...s, kybRequired: v }))} />
            </div>
          </CardContent>
        </Card>

        {/* AML / Screening */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> AML &amp; Screening</CardTitle>
            <CardDescription>Anti-money laundering and sanctions screening controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "amlScreeningEnabled", label: "AML Transaction Screening", desc: "Screen all transactions against AML rules and flag suspicious patterns." },
              { key: "sanctionsCheckEnabled", label: "Sanctions List Check", desc: "Check customers and merchants against OFAC, UN, and EU sanctions lists." },
              { key: "pepCheckEnabled", label: "PEP (Politically Exposed Person) Check", desc: "Flag customers identified as politically exposed persons for enhanced due diligence." },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <Switch
                  checked={(local as any)[key]}
                  onCheckedChange={v => setLocal(s => ({ ...s, [key]: v }))}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Current Configuration Summary</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <Badge variant={local.kybRequired ? "default" : "secondary"} className="text-xs">{local.kybRequired ? "KYB Required" : "KYB Optional"}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={local.amlScreeningEnabled ? "default" : "secondary"} className="text-xs">{local.amlScreeningEnabled ? "AML Active" : "AML Off"}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={local.sanctionsCheckEnabled ? "default" : "secondary"} className="text-xs">{local.sanctionsCheckEnabled ? "Sanctions Active" : "Sanctions Off"}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={local.pepCheckEnabled ? "default" : "secondary"} className="text-xs">{local.pepCheckEnabled ? "PEP Check Active" : "PEP Check Off"}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => settings && setLocal({ ...settings })}>Reset</Button>
          <Button onClick={save} disabled={updateMut.isPending}>
            {updateMut.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
