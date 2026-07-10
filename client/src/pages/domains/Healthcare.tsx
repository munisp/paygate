import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Heart, FileText, CheckCircle, Clock, XCircle, Plus, Activity } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  PAID: "bg-purple-100 text-purple-800",
};

const CLAIM_TYPES = ["INPATIENT", "OUTPATIENT", "DENTAL", "VISION", "PHARMACY", "MATERNITY"];

export default function Healthcare() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [showEligDialog, setShowEligDialog] = useState(false);
  const [form, setForm] = useState({
    policyNumber: "", beneficiaryId: "", beneficiaryName: "",
    providerId: "", providerName: "", claimType: "OUTPATIENT",
    diagnosisCodes: "", procedureCodes: "", claimAmount: "",
    currency: "NGN", serviceDate: "",
  });
  const [eligForm, setEligForm] = useState({ policyNumber: "", beneficiaryId: "" });

  const { data: claims, refetch } = trpc.healthcare.listClaims.useQuery({
    status: statusFilter, page, pageSize: 20,
  });
  const { data: stats } = trpc.healthcare.getClaimStats.useQuery();
  const submitMut = trpc.healthcare.submitClaim.useMutation({
    onSuccess: (d) => { toast.success(`Claim submitted: ${d.nhiaClaimRef}`); setShowClaimDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: eligResult, refetch: checkElig } = trpc.healthcare.checkEligibility.useQuery(
    { policyNumber: eligForm.policyNumber, beneficiaryId: eligForm.beneficiaryId },
    { enabled: false }
  );

  const handleSubmit = () => {
    if (!form.policyNumber || !form.beneficiaryName || !form.providerId || !form.claimAmount) {
      toast.error("Please fill all required fields"); return;
    }
    submitMut.mutate({
      ...form,
      claimAmount: parseFloat(form.claimAmount),
      diagnosisCodes: form.diagnosisCodes.split(",").map(s => s.trim()).filter(Boolean),
      procedureCodes: form.procedureCodes.split(",").map(s => s.trim()).filter(Boolean),
    });
  };

  const totalClaims = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.count), 0) ?? 0;
  const approvedClaims = stats?.find((s: Record<string, unknown>) => s.status === "APPROVED");
  const pendingClaims = stats?.find((s: Record<string, unknown>) => s.status === "SUBMITTED");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500" /> Healthcare Claims Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Wave 212 — NHIA-integrated claims adjudication and payment</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showEligDialog} onOpenChange={setShowEligDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><CheckCircle className="w-4 h-4" /> Check Eligibility</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Beneficiary Eligibility Check</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Policy Number</Label><Input value={eligForm.policyNumber} onChange={e => setEligForm(p => ({ ...p, policyNumber: e.target.value }))} /></div>
                <div><Label>Beneficiary ID</Label><Input value={eligForm.beneficiaryId} onChange={e => setEligForm(p => ({ ...p, beneficiaryId: e.target.value }))} /></div>
                <Button className="w-full" onClick={() => checkElig()}>Check Eligibility</Button>
                {eligResult && (
                  <div className={`p-3 rounded-lg ${eligResult.isEligible ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                    <div className="font-medium">{eligResult.isEligible ? "✓ Eligible" : "✗ Not Eligible"}</div>
                    <div className="text-sm mt-1">Status: {eligResult.policyStatus}</div>
                    <div className="text-sm">Coverage Limit: ₦{eligResult.coverageLimit?.toLocaleString()}</div>
                    <div className="text-sm">Co-pay: {eligResult.copayPercent}%</div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showClaimDialog} onOpenChange={setShowClaimDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Submit Claim</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Submit Healthcare Claim</DialogTitle></DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Policy Number *</Label><Input value={form.policyNumber} onChange={e => setForm(p => ({ ...p, policyNumber: e.target.value }))} /></div>
                  <div><Label>Beneficiary ID *</Label><Input value={form.beneficiaryId} onChange={e => setForm(p => ({ ...p, beneficiaryId: e.target.value }))} /></div>
                  <div><Label>Beneficiary Name *</Label><Input value={form.beneficiaryName} onChange={e => setForm(p => ({ ...p, beneficiaryName: e.target.value }))} /></div>
                  <div><Label>Provider ID *</Label><Input value={form.providerId} onChange={e => setForm(p => ({ ...p, providerId: e.target.value }))} /></div>
                  <div><Label>Provider Name *</Label><Input value={form.providerName} onChange={e => setForm(p => ({ ...p, providerName: e.target.value }))} /></div>
                  <div>
                    <Label>Claim Type *</Label>
                    <Select value={form.claimType} onValueChange={v => setForm(p => ({ ...p, claimType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CLAIM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Claim Amount (₦) *</Label><Input type="number" value={form.claimAmount} onChange={e => setForm(p => ({ ...p, claimAmount: e.target.value }))} /></div>
                  <div><Label>Service Date *</Label><Input type="date" value={form.serviceDate} onChange={e => setForm(p => ({ ...p, serviceDate: e.target.value }))} /></div>
                </div>
                <div><Label>Diagnosis Codes (ICD-10, comma-separated)</Label><Input value={form.diagnosisCodes} onChange={e => setForm(p => ({ ...p, diagnosisCodes: e.target.value }))} placeholder="J18.9, Z87.891" /></div>
                <div><Label>Procedure Codes (CPT, comma-separated)</Label><Input value={form.procedureCodes} onChange={e => setForm(p => ({ ...p, procedureCodes: e.target.value }))} placeholder="99213, 71046" /></div>
                <Button className="w-full" onClick={handleSubmit} disabled={submitMut.isPending}>
                  {submitMut.isPending ? "Submitting..." : "Submit Claim"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500" /><span className="text-sm text-muted-foreground">Total Claims</span></div>
          <div className="text-2xl font-bold mt-1">{totalClaims}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-500" /><span className="text-sm text-muted-foreground">Pending Review</span></div>
          <div className="text-2xl font-bold mt-1">{pendingClaims?.count ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-sm text-muted-foreground">Approved</span></div>
          <div className="text-2xl font-bold mt-1">{approvedClaims?.count ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-purple-500" /><span className="text-sm text-muted-foreground">Total Value</span></div>
          <div className="text-2xl font-bold mt-1">₦{((approvedClaims?.total_amount as number) ?? 0).toLocaleString()}</div>
        </CardContent></Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[undefined, "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PAID"].map(s => (
          <Button key={s ?? "all"} variant={statusFilter === s ? "default" : "outline"} size="sm"
            onClick={() => { setStatusFilter(s); setPage(1); }}>
            {s ?? "All"}
          </Button>
        ))}
      </div>

      {/* Claims Table */}
      <Card>
        <CardHeader><CardTitle>Claims</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Claim ID</th>
                  <th className="text-left py-2 pr-4">Beneficiary</th>
                  <th className="text-left py-2 pr-4">Provider</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-right py-2 pr-4">Amount</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {claims?.claims?.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No claims yet</td></tr>
                )}
                {claims?.claims?.map((c: Record<string, unknown>) => (
                  <tr key={c.id as string} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4 font-mono text-xs">{(c.id as string).slice(0, 14)}...</td>
                    <td className="py-2 pr-4">{c.beneficiary_name as string}</td>
                    <td className="py-2 pr-4">{c.provider_name as string}</td>
                    <td className="py-2 pr-4"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{c.claim_type as string}</span></td>
                    <td className="py-2 pr-4 text-right font-medium">₦{(c.claim_amount as number)?.toLocaleString()}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status as string] || "bg-gray-100 text-gray-800"}`}>
                        {c.status as string}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">{new Date(c.submitted_at as string).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil((claims?.total ?? 0) / 20)}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
