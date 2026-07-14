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
import { Shield, Plus, TrendingDown, AlertTriangle, CheckCircle, DollarSign } from "lucide-react";
import { DomainProtocolBanner } from "@/components/ProtocolBadge";
import { ACORDSchemaExplorer } from "@/components/ACORDSchemaExplorer";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  LAPSED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  EXPIRED: "bg-yellow-100 text-yellow-800",
  PENDING: "bg-blue-100 text-blue-800",
};

const POLICY_TYPES = ["LIFE", "HEALTH", "MOTOR", "PROPERTY", "MICRO", "AGRI"];
const FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"];

export default function Insurance() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [lapseCheckId, setLapseCheckId] = useState("");
  const [form, setForm] = useState({
    holderName: "", holderFsp: "", holderAccount: "",
    insurerId: "", policyType: "LIFE", premiumAmount: "",
    currency: "NGN", frequency: "MONTHLY", coverageAmount: "",
    startDate: "", endDate: "", gracePeriodDays: "30",
  });

  const { data: policies, refetch } = trpc.insurance.listPolicies.useQuery({ page: 1, pageSize: 200 });
  const allPolicies = policies?.policies ?? [];
  const {
    filters, setFilter, sortKey, sortDir, toggleSort,
    filtered, paginated, page: tPage, setPage: setTPage, totalPages, exportCSV,
  } = useDomainTable(allPolicies, ["id", "policy_number", "holder_name", "status"], "created_at");
  const CSV_COLS = [
    { key: "id", label: "ID" }, { key: "policy_number", label: "Policy #" },
    { key: "holder_name", label: "Holder" }, { key: "policy_type", label: "Type" },
    { key: "premium_amount", label: "Premium" }, { key: "status", label: "Status" },
    { key: "created_at", label: "Date" },
  ];
  const { data: stats } = trpc.insurance.getPolicyStats.useQuery();
  const createMut = trpc.insurance.createPolicy.useMutation({
    onSuccess: (d) => { toast.success(`Policy created: ${d.policyNumber}`); setShowCreateDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: lapseRisk, refetch: checkLapse } = trpc.insurance.scoreLapseRisk.useQuery(
    { policyId: lapseCheckId },
    { enabled: false }
  );

  const handleCreate = () => {
    if (!form.holderName || !form.holderFsp || !form.premiumAmount || !form.coverageAmount || !form.startDate || !form.endDate) {
      toast.error("Please fill all required fields"); return;
    }
    createMut.mutate({
      ...form,
      premiumAmount: parseFloat(form.premiumAmount),
      coverageAmount: parseFloat(form.coverageAmount),
      gracePeriodDays: parseInt(form.gracePeriodDays),
    });
  };

  const totalPolicies = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.count), 0) ?? 0;
  const activePolicies = stats?.filter((s: Record<string, unknown>) => s.status === "ACTIVE").reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.count), 0) ?? 0;
  const totalPremium = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.total_premium), 0) ?? 0;

  return (
    <div className="p-6 space-y-6">
          <DomainProtocolBanner domain="insurance" />
          {/* ACORD Schema Explorer */}
          <ACORDSchemaExplorer />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" /> Insurance Premium & Claims
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Wave 213 — Policy lifecycle management with AI lapse prediction</p>
        </div>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><TrendingDown className="w-4 h-4" /> Lapse Risk</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Lapse Risk Scoring</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Policy ID</Label>
                  <Input value={lapseCheckId} onChange={e => setLapseCheckId(e.target.value)} placeholder="POL-..." />
                </div>
                <Button className="w-full" onClick={() => checkLapse()}>Score Lapse Risk</Button>
                {lapseRisk && (
                  <div className={`p-3 rounded-lg border ${lapseRisk.riskLevel === "CRITICAL" ? "bg-red-50 border-red-200" : lapseRisk.riskLevel === "HIGH" ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"}`}>
                    <div className="font-medium">Risk Level: {lapseRisk.riskLevel}</div>
                    <div className="text-sm mt-1">Lapse Probability: {((lapseRisk.lapseProbability ?? 0) * 100).toFixed(1)}%</div>
                    <div className="text-sm">Missed Payments: {lapseRisk.missedPayments}</div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New Policy</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Insurance Policy</DialogTitle></DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Holder Name *</Label><Input value={form.holderName} onChange={e => setForm(p => ({ ...p, holderName: e.target.value }))} /></div>
                  <div><Label>Holder FSP *</Label><Input value={form.holderFsp} onChange={e => setForm(p => ({ ...p, holderFsp: e.target.value }))} placeholder="ACCESS" /></div>
                  <div><Label>Holder Account *</Label><Input value={form.holderAccount} onChange={e => setForm(p => ({ ...p, holderAccount: e.target.value }))} /></div>
                  <div><Label>Insurer ID *</Label><Input value={form.insurerId} onChange={e => setForm(p => ({ ...p, insurerId: e.target.value }))} placeholder="AXA-001" /></div>
                  <div>
                    <Label>Policy Type *</Label>
                    <Select value={form.policyType} onValueChange={v => setForm(p => ({ ...p, policyType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{POLICY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Frequency *</Label>
                    <Select value={form.frequency} onValueChange={v => setForm(p => ({ ...p, frequency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Premium Amount (₦) *</Label><Input type="number" value={form.premiumAmount} onChange={e => setForm(p => ({ ...p, premiumAmount: e.target.value }))} /></div>
                  <div><Label>Coverage Amount (₦) *</Label><Input type="number" value={form.coverageAmount} onChange={e => setForm(p => ({ ...p, coverageAmount: e.target.value }))} /></div>
                  <div><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} /></div>
                  <div><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} /></div>
                  <div><Label>Grace Period (days)</Label><Input type="number" value={form.gracePeriodDays} onChange={e => setForm(p => ({ ...p, gracePeriodDays: e.target.value }))} /></div>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={createMut.isPending}>
                  {createMut.isPending ? "Creating..." : "Create Policy"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" /><span className="text-sm text-muted-foreground">Total Policies</span></div>
          <div className="text-2xl font-bold mt-1">{totalPolicies}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-sm text-muted-foreground">Active</span></div>
          <div className="text-2xl font-bold mt-1">{activePolicies}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-purple-500" /><span className="text-sm text-muted-foreground">Total Premium</span></div>
          <div className="text-2xl font-bold mt-1">₦{totalPremium.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /><span className="text-sm text-muted-foreground">At Risk</span></div>
          <div className="text-2xl font-bold mt-1">0</div>
        </CardContent></Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[undefined, "ACTIVE", "LAPSED", "CANCELLED", "EXPIRED"].map(s => (
          <Button key={s ?? "all"} variant={statusFilter === s ? "default" : "outline"} size="sm"
            onClick={() => { setStatusFilter(s); setPage(1); }}>
            {s ?? "All"}
          </Button>
        ))}
      </div>

      {/* Policies Table */}
      <Card>
        <CardHeader><CardTitle>Policies</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Policy #</th>
                  <th className="text-left py-2 pr-4">Holder</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-left py-2 pr-4">Frequency</th>
                  <th className="text-right py-2 pr-4">Premium</th>
                  <th className="text-right py-2 pr-4">Coverage</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {policies?.policies?.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No policies yet</td></tr>
                )}
                {policies?.policies?.map((p: Record<string, unknown>) => (
                  <tr key={p.id as string} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4 font-mono text-xs font-medium">{p.policy_number as string}</td>
                    <td className="py-2 pr-4">{p.holder_name as string}</td>
                    <td className="py-2 pr-4"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{p.policy_type as string}</span></td>
                    <td className="py-2 pr-4 text-xs">{p.frequency as string}</td>
                    <td className="py-2 pr-4 text-right font-medium">₦{(p.premium_amount as number)?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right">₦{(p.coverage_amount as number)?.toLocaleString()}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status as string] || "bg-gray-100 text-gray-800"}`}>
                        {p.status as string}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">{p.end_date as string}</td>
                  </tr>
                ))}
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
