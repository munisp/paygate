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
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { SortableTableHeader } from "@/components/SortableTableHeader";
import { useDomainTable } from "@/hooks/useDomainTable";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Zap, Plus, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { DomainProtocolBanner } from "@/components/ProtocolBadge";

const STATUS_COLORS: Record<string, string> = {
  INITIATED: "bg-blue-100 text-blue-800",
  PAID: "bg-yellow-100 text-yellow-800",
  TOKENIZING: "bg-purple-100 text-purple-800",
  VENDED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  REFUNDED: "bg-gray-100 text-gray-800",
};

const DISCOS = ["AEDC", "EKEDC", "IKEDC", "PHEDC", "EEDC", "BEDC", "KAEDCO", "KEDCO", "JEDC", "YEDC", "AEDC_ABUJA"];

export default function EnergyVend() {
  const [page, setPage] = useState(1);
  const [discoFilter, setDiscoFilter] = useState<string | undefined>();
  const [showVendDialog, setShowVendDialog] = useState(false);
  const [showMeterDialog, setShowMeterDialog] = useState(false);
  const [meterInput, setMeterInput] = useState("");
  const [meterDisco, setMeterDisco] = useState("AEDC");
  const [form, setForm] = useState({
    meterNumber: "", disco: "AEDC", amount: "", currency: "NGN",
    customerPhone: "", customerFsp: "", customerAccount: "",
  });

  const { data: transactions, refetch, isLoading } = trpc.energy.listVendTransactions.useQuery({ page: 1, pageSize: 200 });
  const allTransactions = transactions?.transactions ?? [];
  const {
    filters, setFilter, sortKey, sortDir, toggleSort,
    filtered, paginated, page: tPage, setPage: setTPage, totalPages, exportCSV,
  } = useDomainTable(allTransactions, ["id", "meter_number", "customer_name", "disco", "status"], "created_at");
  const CSV_COLS = [
    { key: "id", label: "ID" }, { key: "meter_number", label: "Meter #" },
    { key: "customer_name", label: "Customer" }, { key: "disco", label: "DISCO" },
    { key: "amount", label: "Amount" }, { key: "units_kwh", label: "kWh" },
    { key: "status", label: "Status" }, { key: "created_at", label: "Date" },
  ];
  const { data: stats } = trpc.energy.getVendStats.useQuery();
  const vendKey = useIdempotencyKey();
  const vendMut = trpc.energy.initiateVend.useMutation({
    onSuccess: (d) => {
      vendKey.reset();
      if (d.token) {
        toast.success(`Vend successful! Token: ${d.token} (${d.units} kWh)`);
      } else {
        toast.info(`Vend initiated: ${d.id} — awaiting token`);
      }
      setShowVendDialog(false);
      refetch();
    },
    onError: (e) => { vendKey.reset(); toast.error(e.message); },
  });
  const { data: meterInfo, refetch: lookupMeter } = trpc.energy.lookupMeter.useQuery(
    { meterNumber: meterInput, disco: meterDisco },
    { enabled: false }
  );

  const handleVend = () => {
    if (!form.meterNumber || !form.amount || !form.customerPhone || !form.customerFsp) {
      toast.error("Please fill all required fields"); return;
    }
    vendMut.mutate({ ...form, amount: parseFloat(form.amount), idempotencyKey: vendKey.getKey() });
  };

  const totalVended = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.total_amount), 0) ?? 0;
  const successCount = stats?.find((s: Record<string, unknown>) => s.status === "VENDED")?.count ?? 0;

  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return (
    <div className="p-6 space-y-6">
          <DomainProtocolBanner domain="energy" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" /> Energy VEND Platform
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Wave 216 — DISCO vending with NEPA STS token engine (Rust-powered)</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showMeterDialog} onOpenChange={setShowMeterDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><CheckCircle className="w-4 h-4" /> Meter Lookup</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Meter Number Lookup</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>DISCO</Label>
                  <Select value={meterDisco} onValueChange={setMeterDisco}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DISCOS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Meter Number</Label>
                  <Input value={meterInput} onChange={e => setMeterInput(e.target.value)} placeholder="45012345678" />
                </div>
                <Button className="w-full" onClick={() => lookupMeter()}>Lookup Meter</Button>
                {meterInfo && (
                  <div className={`p-3 rounded-lg border space-y-1 ${meterInfo.isValid ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                    <div className={`font-medium ${meterInfo.isValid ? "text-green-800" : "text-amber-800"}`}>
                      {meterInfo.isValid ? "Meter Found" : "Meter Not Validated"}
                    </div>
                    {meterInfo.message && <div className="text-sm">{meterInfo.message}</div>}
                    {meterInfo.customerName && <div className="text-sm">Customer: {meterInfo.customerName}</div>}
                    {meterInfo.address && <div className="text-sm">Address: {meterInfo.address}</div>}
                    {meterInfo.tariffClass && <div className="text-sm">Tariff: {meterInfo.tariffClass}</div>}
                    {meterInfo.minimumVend != null && (
                      <div className="text-sm">Min Vend: ₦{Number(meterInfo.minimumVend).toLocaleString()}</div>
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showVendDialog} onOpenChange={setShowVendDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Vend Electricity</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Initiate Electricity Vend</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>DISCO *</Label>
                    <Select value={form.disco} onValueChange={v => setForm(p => ({ ...p, disco: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DISCOS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Meter Number *</Label><Input value={form.meterNumber} onChange={e => setForm(p => ({ ...p, meterNumber: e.target.value }))} placeholder="45012345678" /></div>
                  <div><Label>Amount (₦) *</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div><Label>Customer Phone *</Label><Input value={form.customerPhone} onChange={e => setForm(p => ({ ...p, customerPhone: e.target.value }))} placeholder="08012345678" /></div>
                  <div><Label>Customer FSP *</Label><Input value={form.customerFsp} onChange={e => setForm(p => ({ ...p, customerFsp: e.target.value }))} placeholder="ACCESS" /></div>
                  <div><Label>Customer Account *</Label><Input value={form.customerAccount} onChange={e => setForm(p => ({ ...p, customerAccount: e.target.value }))} /></div>
                </div>
                <Button className="w-full" onClick={handleVend} disabled={vendMut.isPending}>
                  {vendMut.isPending ? "Processing..." : "Vend Electricity"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /><span className="text-sm text-muted-foreground">Total Vends</span></div>
          <div className="text-2xl font-bold mt-1">{transactions?.total ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-sm text-muted-foreground">Successful</span></div>
          <div className="text-2xl font-bold mt-1">{successCount as number}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /><span className="text-sm text-muted-foreground">Total Value</span></div>
          <div className="text-2xl font-bold mt-1">₦{totalVended.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" /><span className="text-sm text-muted-foreground">Failed</span></div>
          <div className="text-2xl font-bold mt-1">0</div>
        </CardContent></Card>
      </div>

      {/* DISCO filter */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={!discoFilter ? "default" : "outline"} size="sm" onClick={() => { setDiscoFilter(undefined); setPage(1); }}>All DISCOs</Button>
        {DISCOS.slice(0, 6).map(d => (
          <Button key={d} variant={discoFilter === d ? "default" : "outline"} size="sm" onClick={() => { setDiscoFilter(d); setPage(1); }}>{d}</Button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Vend Transactions</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">ID</th>
                  <th className="text-left py-2 pr-4">Meter</th>
                  <th className="text-left py-2 pr-4">DISCO</th>
                  <th className="text-right py-2 pr-4">Amount</th>
                  <th className="text-right py-2 pr-4">Units</th>
                  <th className="text-left py-2 pr-4">Token</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions?.transactions?.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No vend transactions yet</td></tr>
                )}
                {transactions?.transactions?.map((t: Record<string, unknown>) => (
                  <tr key={t.id as string} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4 font-mono text-xs">{(t.id as string).slice(0, 14)}...</td>
                    <td className="py-2 pr-4 font-medium">{t.meter_number as string}</td>
                    <td className="py-2 pr-4"><span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded">{t.disco as string}</span></td>
                    <td className="py-2 pr-4 text-right font-medium">₦{(t.amount as number)?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right">{t.units ? `${t.units} kWh` : "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-green-700">{t.token ? (t.token as string) : "—"}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status as string] || "bg-gray-100 text-gray-800"}`}>
                        {t.status as string}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">{new Date(t.created_at as string).toLocaleDateString()}</td>
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
