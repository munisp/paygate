import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { DomainTableToolbar } from "@/components/DomainTableToolbar";
import { SortableTableHeader } from "@/components/SortableTableHeader";
import { useDomainTable } from "@/hooks/useDomainTable";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Plus, CheckCircle, AlertTriangle, Clock, Upload } from "lucide-react";
import { DomainProtocolBanner } from "@/components/ProtocolBadge";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  PARTIAL: "bg-orange-100 text-orange-800",
};

const PROGRAM_TYPES = ["N_POWER", "CCT", "TRADER_MONI", "MARKET_MONI", "GOVERNMENT_STAFF", "PENSION", "SCHOLARSHIP"];

export default function G2PDisbursements() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showNinDialog, setShowNinDialog] = useState(false);
  const [ninInput, setNinInput] = useState("");
  const [form, setForm] = useState({
    programType: "N_POWER", programId: "", payerFsp: "", payerAccount: "",
    amount: "", currency: "NGN", totalAmount: "", beneficiaryCount: "",
    scheduledAt: "",
  });

  const { data: batches, refetch, isLoading } = trpc.g2p.listBatches.useQuery({ page: 1, pageSize: 200 });
  const allBatches = batches?.batches ?? [];
  const {
    filters, setFilter, sortKey, sortDir, toggleSort,
    filtered, paginated, page: tPage, setPage: setTPage, totalPages, exportCSV,
  } = useDomainTable(allBatches, ["id", "batch_ref", "program_type", "status"], "created_at");
  const CSV_COLS = [
    { key: "id", label: "ID" }, { key: "batch_ref", label: "Batch Ref" },
    { key: "program_type", label: "Program" }, { key: "total_beneficiaries", label: "Beneficiaries" },
    { key: "total_amount", label: "Amount" }, { key: "currency", label: "Currency" },
    { key: "status", label: "Status" }, { key: "created_at", label: "Date" },
  ];
  const { data: stats } = trpc.g2p.getBatchStats.useQuery();
  const createMut = trpc.g2p.createBatch.useMutation({
    onSuccess: (d) => { toast.success(`Batch created: ${d.id}`); setShowBatchDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: ninResult, refetch: lookupNin } = trpc.g2p.resolveNIN.useQuery(
    { nin: ninInput },
    { enabled: false }
  );

  const handleCreate = () => {
    if (!form.programId || !form.payerFsp || !form.amount || !form.beneficiaryCount) {
      toast.error("Please fill all required fields"); return;
    }
    createMut.mutate({
      ...form,
      amount: parseFloat(form.amount),
      totalAmount: parseFloat(form.totalAmount || "0") || parseFloat(form.amount) * parseInt(form.beneficiaryCount),
      beneficiaryCount: parseInt(form.beneficiaryCount),
    });
  };

  const totalBeneficiaries = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.total_beneficiaries), 0) ?? 0;
  const totalDisbursed = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.total_amount), 0) ?? 0;

  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return (
    <div className="p-6 space-y-6">
          <DomainProtocolBanner domain="g2p" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-green-600" /> G2P Disbursement Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Wave 215 — Government-to-person bulk disbursements with NIN/BVN resolution</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showNinDialog} onOpenChange={setShowNinDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><CheckCircle className="w-4 h-4" /> NIN Lookup</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>NIN / BVN Resolution</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>NIN or BVN</Label>
                  <Input value={ninInput} onChange={e => setNinInput(e.target.value)} placeholder="12345678901" maxLength={11} />
                </div>
                <Button className="w-full" onClick={() => lookupNin()}>Resolve Identity</Button>
                {ninResult && (
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 space-y-1">
                    <div className="font-medium text-green-800">Identity Resolved</div>
                    <div className="text-sm">Name: {ninResult.fullName}</div>
                    <div className="text-sm">Phone: {ninResult.phone}</div>
                    <div className="text-sm">FSP: {ninResult.fsp}</div>
                    <div className="text-sm">Account: {ninResult.accountNumber}</div>
                    <div className="text-sm">Status: {ninResult.status}</div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New Batch</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Disbursement Batch</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Program Type *</Label>
                    <Select value={form.programType} onValueChange={v => setForm(p => ({ ...p, programType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PROGRAM_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Program ID *</Label><Input value={form.programId} onChange={e => setForm(p => ({ ...p, programId: e.target.value }))} placeholder="NASIMS-2026-Q1" /></div>
                  <div><Label>Payer FSP *</Label><Input value={form.payerFsp} onChange={e => setForm(p => ({ ...p, payerFsp: e.target.value }))} placeholder="CBN" /></div>
                  <div><Label>Payer Account *</Label><Input value={form.payerAccount} onChange={e => setForm(p => ({ ...p, payerAccount: e.target.value }))} /></div>
                  <div><Label>Amount Per Beneficiary (₦) *</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div><Label>Beneficiary Count *</Label><Input type="number" value={form.beneficiaryCount} onChange={e => setForm(p => ({ ...p, beneficiaryCount: e.target.value }))} /></div>
                  <div><Label>Schedule Date</Label><Input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))} /></div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  <span>Beneficiary list upload via CSV will be available in Wave 215b</span>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={createMut.isPending}>
                  {createMut.isPending ? "Creating..." : "Create Batch"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Users className="w-4 h-4 text-green-500" /><span className="text-sm text-muted-foreground">Total Beneficiaries</span></div>
          <div className="text-2xl font-bold mt-1">{totalBeneficiaries.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500" /><span className="text-sm text-muted-foreground">Total Batches</span></div>
          <div className="text-2xl font-bold mt-1">{batches?.total ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-500" /><span className="text-sm text-muted-foreground">Total Disbursed</span></div>
          <div className="text-2xl font-bold mt-1">₦{totalDisbursed.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /><span className="text-sm text-muted-foreground">Failed Batches</span></div>
          <div className="text-2xl font-bold mt-1">0</div>
        </CardContent></Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[undefined, "PENDING", "PROCESSING", "COMPLETED", "FAILED", "PARTIAL"].map(s => (
          <Button key={s ?? "all"} variant={statusFilter === s ? "default" : "outline"} size="sm"
            onClick={() => { setStatusFilter(s); setPage(1); }}>
            {s ?? "All"}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Disbursement Batches</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Batch ID</th>
                  <th className="text-left py-2 pr-4">Program</th>
                  <th className="text-right py-2 pr-4">Beneficiaries</th>
                  <th className="text-right py-2 pr-4">Amount/Beneficiary</th>
                  <th className="text-right py-2 pr-4">Total</th>
                  <th className="text-left py-2 pr-4">Progress</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {batches?.batches?.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No batches yet</td></tr>
                )}
                {batches?.batches?.map((b: Record<string, unknown>) => {
                  const pct = b.beneficiary_count ? Math.round(((b.disbursed_count as number) / (b.beneficiary_count as number)) * 100) : 0;
                  return (
                    <tr key={b.id as string} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-4 font-mono text-xs">{(b.id as string).slice(0, 16)}...</td>
                      <td className="py-2 pr-4"><span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">{(b.program_type as string).replace(/_/g, " ")}</span></td>
                      <td className="py-2 pr-4 text-right">{(b.beneficiary_count as number)?.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">₦{(b.amount as number)?.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right font-medium">₦{(b.total_amount as number)?.toLocaleString()}</td>
                      <td className="py-2 pr-4 w-32">
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status as string] || "bg-gray-100 text-gray-800"}`}>
                          {b.status as string}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
