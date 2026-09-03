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
import { Shield, Plus, AlertTriangle, CheckCircle, DollarSign } from "lucide-react";
import { DomainProtocolBanner } from "@/components/ProtocolBadge";
import { ACORDSchemaExplorer } from "@/components/ACORDSchemaExplorer";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  lapsed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  expired: "bg-yellow-100 text-yellow-800",
  pending: "bg-blue-100 text-blue-800",
};

const POLICY_TYPES = ["LIFE", "HEALTH", "MOTOR", "PROPERTY", "MICRO", "AGRI"];
const FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"];

export default function Insurance() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [form, setForm] = useState({
    holderName: "", holderFsp: "", holderAccount: "",
    insurerId: "", policyType: "LIFE", premiumAmount: "",
    currency: "NGN", frequency: "MONTHLY", coverageAmount: "",
    startDate: "", endDate: "", gracePeriodDays: "30",
  });

  const { data: policies, refetch, isLoading } = trpc.insurancePolicies.list.useQuery({ limit: 200, offset: 0 });
  const allPolicies = policies?.rows ?? [];
  const {
    filters, setFilter, sortKey, sortDir, toggleSort,
    filtered, paginated, page: tPage, setPage: setTPage, totalPages, exportCSV,
  } = useDomainTable(allPolicies, ["policyId", "productName", "provider", "status"], "createdAt");
  const CSV_COLS = [
    { key: "policyId", label: "Policy #" }, { key: "productName", label: "Product" },
    { key: "customerId", label: "Holder" }, { key: "coverageType", label: "Type" },
    { key: "premiumKobo", label: "Premium (kobo)" }, { key: "status", label: "Status" },
    { key: "createdAt", label: "Date" },
  ];
  const { data: stats } = trpc.insurancePolicies.stats.useQuery();
  const createMut = trpc.insurancePolicies.create.useMutation({
    onSuccess: (d) => { toast.success(`Policy created: ${d.policyId}`); setShowCreateDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.holderName || !form.holderFsp || !form.premiumAmount || !form.coverageAmount || !form.startDate || !form.endDate) {
      toast.error("Please fill all required fields"); return;
    }
    createMut.mutate({
      customerId: form.holderAccount || form.holderName,
      productId: form.policyType,
      productName: `${form.policyType} policy for ${form.holderName}`,
      provider: form.insurerId || form.holderFsp,
      premiumKobo: Math.round(parseFloat(form.premiumAmount) * 100),
      coverageType: form.policyType,
      expiresAt: form.endDate,
    });
  };

  const totalPolicies = Number(stats?.total ?? 0);
  const activePolicies = Number(stats?.active ?? 0);
  const totalPremium = Number(stats?.totalPremiumKobo ?? 0) / 100;

  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
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
        {[undefined, "active", "lapsed", "cancelled", "expired"].map(s => (
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
                  <th className="text-left py-2 pr-4">Product</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-left py-2 pr-4">Provider</th>
                  <th className="text-right py-2 pr-4">Premium</th>
                  <th className="text-right py-2 pr-4">Holder</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {(policies?.rows?.length ?? 0) === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No policies yet</td></tr>
                )}
                {policies?.rows?.map((p: Record<string, unknown>) => (
                  <tr key={p.policyId as string} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4 font-mono text-xs font-medium">{p.policyId as string}</td>
                    <td className="py-2 pr-4">{p.productName as string}</td>
                    <td className="py-2 pr-4"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{p.coverageType as string}</span></td>
                    <td className="py-2 pr-4 text-xs">{p.provider as string}</td>
                    <td className="py-2 pr-4 text-right font-medium">₦{((p.premiumKobo as number) / 100)?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right">{p.customerId as string}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status as string] || "bg-gray-100 text-gray-800"}`}>
                        {p.status as string}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">{p.expiresAt ? new Date(p.expiresAt as string).toLocaleDateString() : "—"}</td>
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
