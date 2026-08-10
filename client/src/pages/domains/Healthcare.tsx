// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DomainTableToolbar } from "@/components/DomainTableToolbar";
import { SortableTableHeader } from "@/components/SortableTableHeader";
import { useDomainTable } from "@/hooks/useDomainTable";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Heart, FileText, CheckCircle, Clock, XCircle, Plus, Activity } from "lucide-react";
import { DomainProtocolBanner } from "@/components/ProtocolBadge";
import { FHIRResourceViewer } from "@/components/FHIRResourceViewer";

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

  const { data: claims, refetch, isLoading } = trpc.healthcare.listClaims.useQuery({ page: 1, pageSize: 200 });
  const allClaims = claims?.claims ?? [];
  const {
    filters, setFilter, sortKey, sortDir, toggleSort,
    filtered, paginated, page: tPage, setPage: setTPage, totalPages, exportCSV,
  } = useDomainTable(allClaims, ["id", "claim_ref", "provider_id", "status"], "created_at");
  const CSV_COLS = [
    { key: "id", label: "ID" }, { key: "claim_ref", label: "Claim Ref" },
    { key: "provider_id", label: "Provider" }, { key: "claim_type", label: "Type" },
    { key: "claim_amount", label: "Amount" }, { key: "status", label: "Status" },
    { key: "created_at", label: "Date" },
  ];
  const { data: stats, isLoading } = trpc.healthcare.getClaimStats.useQuery();
  const submitMut = trpc.healthcare.submitClaim.useMutation({
    onSuccess: (d) => { toast.success(`Claim submitted: ${d.nhiaClaimRef}`); setShowClaimDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: eligResult, refetch: checkElig, isLoading } = trpc.healthcare.checkEligibility.useQuery(
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

  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return (
    <div className="p-6 space-y-6">
          <DomainProtocolBanner domain="healthcare" />
          {/* FHIR R4 Resource Explorer */}
          <FHIRResourceViewer />

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

      {/* Claims Table with filtering/sorting/export */}
      <Card>
        <CardHeader><CardTitle>Claims</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <DomainTableToolbar
            filters={filters}
            setFilter={setFilter}
            statusOptions={[
              { value: "SUBMITTED", label: "Submitted" },
              { value: "UNDER_REVIEW", label: "Under Review" },
              { value: "APPROVED", label: "Approved" },
              { value: "REJECTED", label: "Rejected" },
              { value: "PAID", label: "Paid" },
            ]}
            extraFilters={[
              { key: "claim_type", placeholder: "Claim Type", options: CLAIM_TYPES.map(t => ({ value: t, label: t })) },
            ]}
            onExportCSV={() => exportCSV(CSV_COLS)}
            totalFiltered={filtered.length}
            totalAll={allClaims.length}
          />
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHeader label="Claim ID" sortKey="id" currentSortKey={String(sortKey)} sortDir={sortDir} onSort={k => toggleSort(k as any)} />
                  <SortableTableHeader label="Beneficiary" sortKey="beneficiary_name" currentSortKey={String(sortKey)} sortDir={sortDir} onSort={k => toggleSort(k as any)} />
                  <SortableTableHeader label="Provider" sortKey="provider_name" currentSortKey={String(sortKey)} sortDir={sortDir} onSort={k => toggleSort(k as any)} />
                  <SortableTableHeader label="Type" sortKey="claim_type" currentSortKey={String(sortKey)} sortDir={sortDir} onSort={k => toggleSort(k as any)} />
                  <SortableTableHeader label="Amount" sortKey="claim_amount" currentSortKey={String(sortKey)} sortDir={sortDir} onSort={k => toggleSort(k as any)} />
                  <SortableTableHeader label="Status" sortKey="status" currentSortKey={String(sortKey)} sortDir={sortDir} onSort={k => toggleSort(k as any)} />
                  <SortableTableHeader label="Date" sortKey="submitted_at" currentSortKey={String(sortKey)} sortDir={sortDir} onSort={k => toggleSort(k as any)} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No claims found</TableCell></TableRow>
                ) : paginated.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{String(c.id).slice(0, 14)}…</TableCell>
                    <TableCell className="text-xs">{c.beneficiary_name}</TableCell>
                    <TableCell className="text-xs">{c.provider_name}</TableCell>
                    <TableCell><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{c.claim_type}</span></TableCell>
                    <TableCell className="text-xs font-medium">₦{Number(c.claim_amount).toLocaleString()}</TableCell>
                    <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || "bg-gray-100 text-gray-800"}`}>{c.status}</span></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(c.submitted_at ?? c.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">Page {tPage} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={tPage === 1} onClick={() => setTPage(tPage - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={tPage === totalPages} onClick={() => setTPage(tPage + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
