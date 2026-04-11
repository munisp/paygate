import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Building, FileText, CheckCircle, Clock, Download } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

export default function KYBWorkflow() {
  const [showSubmit, setShowSubmit] = useState(false);
  const [form, setForm] = useState({
    businessName: "", rcNumber: "", taxId: "", businessType: "private_limited" as const,
    directorName: "", directorBvn: "", businessAddress: "", state: "", industry: ""
  });

  const { data: status, isLoading, refetch } = trpc.tier1to5.kyb.getKYBStatus.useQuery();
  const { data: reports } = trpc.tier1to5.kyb.getComplianceReports.useQuery({ reportType: undefined });

  const submitMutation = trpc.tier1to5.kyb.submitKYB.useMutation({
    onSuccess: () => { toast.success("KYB submitted. Temporal workflow started — verification takes 1-3 business days."); setShowSubmit(false); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const generateReportMutation = trpc.tier1to5.kyb.generateCBNReport.useMutation({
    onSuccess: (data: any) => { toast.success(`CBN report generated: ${data.reportId}`); },
    onError: (err: any) => toast.error(err.message),
  });

  const kybStatusColor: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-800",
    pending: "bg-yellow-100 text-yellow-800",
    under_review: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    requires_update: "bg-orange-100 text-orange-800",
  };

  if (!isLoading && !status) {
    return (
      <DashboardLayout>
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">KYB & Compliance</h1>
            <p className="text-muted-foreground text-sm mt-1">Know Your Business verification via Temporal workflow + Youverify + CBN reporting</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        {/* KYB Status */}
        {isLoading ? (
          <Card className="animate-pulse h-32" />
        ) : (
          <Card className="border-2 border-muted">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Building className="w-10 h-10 text-primary opacity-70" />
                <div>
                  <p className="text-lg font-semibold">KYB Status</p>
                  <Badge className={kybStatusColor[status?.status ?? "not_started"] ?? "bg-gray-100 text-gray-800"}>
                    {status?.status ?? "not_started"}
                  </Badge>
                  {status?.verifiedAt && (
                    <p className="text-xs text-muted-foreground mt-1">Verified: {new Date(status.verifiedAt).toLocaleDateString()}</p>
                  )}
                  {status?.rejectionReason && (
                    <p className="text-xs text-red-500 mt-1">{status.rejectionReason}</p>
                  )}
                </div>
              </div>
              {(!status?.status || status.status === "not_started" || status.status === "requires_update") && (
                <Button onClick={() => setShowSubmit(v => !v)}>
                  {showSubmit ? "Cancel" : "Submit KYB"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* KYB Form */}
        {showSubmit && (
          <Card className="border-primary/30">
            <CardHeader><CardTitle>Business Verification</CardTitle><CardDescription>All information is verified against CAC and FIRS databases</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Business Name</Label><Input placeholder="Acme Technologies Ltd" value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} className="mt-1" /></div>
                <div><Label>RC Number</Label><Input placeholder="RC-1234567" value={form.rcNumber} onChange={e => setForm(f => ({ ...f, rcNumber: e.target.value }))} className="mt-1" /></div>
                <div><Label>Tax ID (TIN)</Label><Input placeholder="12345678-0001" value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} className="mt-1" /></div>
                <div>
                  <Label>Business Type</Label>
                  <Select value={form.businessType} onValueChange={v => setForm(f => ({ ...f, businessType: v as any }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sole_proprietor">Sole Proprietor</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="private_limited">Private Limited (Ltd)</SelectItem>
                      <SelectItem value="public_limited">Public Limited (PLC)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Director Name</Label><Input placeholder="John Doe" value={form.directorName} onChange={e => setForm(f => ({ ...f, directorName: e.target.value }))} className="mt-1" /></div>
                <div><Label>Director BVN</Label><Input placeholder="22345678901" value={form.directorBvn} onChange={e => setForm(f => ({ ...f, directorBvn: e.target.value }))} className="mt-1" /></div>
                <div><Label>Business Address</Label><Input placeholder="123 Victoria Island, Lagos" value={form.businessAddress} onChange={e => setForm(f => ({ ...f, businessAddress: e.target.value }))} className="mt-1" /></div>
                <div><Label>State</Label><Input placeholder="Lagos" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="mt-1" /></div>
                <div><Label>Industry</Label><Input placeholder="Fintech" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} className="mt-1" /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => submitMutation.mutate({ businessName: form.businessName, rcNumber: form.rcNumber, taxId: form.taxId, businessType: form.businessType === 'private_limited' ? 'limited_company' : (form.businessType as any), industryCode: form.industry || 'fintech', businessAddress: form.businessAddress, directorIds: [form.directorBvn].filter(Boolean) })} disabled={submitMutation.isPending || !form.businessName || !form.rcNumber}>
                  {submitMutation.isPending ? "Submitting..." : "Submit for Verification"}
                </Button>
                <Button variant="outline" onClick={() => setShowSubmit(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Compliance Reports */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">CBN Compliance Reports</h2>
            <Button size="sm" variant="outline" onClick={() => generateReportMutation.mutate({ reportType: "monthly_transaction", periodStart: new Date(Date.now() - 30*86400000).toISOString().split('T')[0], periodEnd: new Date().toISOString().split('T')[0] })} disabled={generateReportMutation.isPending}>
              <FileText className="w-4 h-4 mr-2" />{generateReportMutation.isPending ? "Generating..." : "Generate CBN Report"}
            </Button>
          </div>
          {!reports?.length ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No compliance reports generated yet.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {reports.map((r: any) => (
                <Card key={r.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{r.reportType}</p>
                      <p className="text-xs text-muted-foreground">{r.periodStart} → {r.periodEnd}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.submittedToCBN ? "default" : "secondary"}>{r.submittedToCBN ? "Submitted" : "Draft"}</Badge>
                      {r.reportUrl && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={r.reportUrl} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4" /></a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
