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
import { Coins, Plus, ArrowRightLeft, Wallet, TrendingUp, Shield } from "lucide-react";
import { DomainProtocolBanner } from "@/components/ProtocolBadge";

const STATUS_COLORS: Record<string, string> = {
  INITIATED: "bg-blue-100 text-blue-800",
  VALIDATED: "bg-yellow-100 text-yellow-800",
  SETTLED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  REVERSED: "bg-gray-100 text-gray-800",
};

const RAILS = [
  { value: "ENAIRA", label: "eNaira (CBN)", currency: "eNGN" },
  { value: "ECB_TIPS", label: "ECB TIPS (Digital Euro)", currency: "DEUR" },
  { value: "DCEP", label: "Digital Yuan (PBOC)", currency: "DCEP" },
  { value: "FEDNOW", label: "FedNow (US Fed)", currency: "USD" },
  { value: "SAND", label: "Sandbox / Test", currency: "SAND" },
];

export default function CBDC() {
  const [page, setPage] = useState(1);
  const [railFilter, setRailFilter] = useState<string | undefined>();
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [form, setForm] = useState({
    rail: "ENAIRA", senderWallet: "", receiverWallet: "",
    amount: "", currency: "eNGN", narration: "",
  });
  const [accForm, setAccForm] = useState({
    rail: "ENAIRA", walletId: "", ownerId: "",
    ownerType: "INDIVIDUAL", currency: "eNGN",
  });

  const { data: transfers, refetch } = trpc.cbdc.listTransfers.useQuery({ page: 1, pageSize: 200 });
  const allTransfers = transfers?.transfers ?? [];
  const {
    filters, setFilter, sortKey, sortDir, toggleSort,
    filtered, paginated, page: tPage, setPage: setTPage, totalPages, exportCSV,
  } = useDomainTable(allTransfers, ["id", "from_account_id", "to_account_id", "rail", "status"], "created_at");
  const CSV_COLS = [
    { key: "id", label: "ID" }, { key: "from_account_id", label: "From" },
    { key: "to_account_id", label: "To" }, { key: "rail", label: "Rail" },
    { key: "amount", label: "Amount" }, { key: "currency", label: "Currency" },
    { key: "status", label: "Status" }, { key: "created_at", label: "Date" },
  ];
  const { data: accounts } = trpc.cbdc.listAccounts.useQuery({ rail: railFilter });
  const { data: stats } = trpc.cbdc.getCBDCStats.useQuery();
  const transferMut = trpc.cbdc.initiateTransfer.useMutation({
    onSuccess: (d) => { toast.success(`CBDC transfer initiated: ${d.id}`); setShowTransferDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const createAccMut = trpc.cbdc.createAccount.useMutation({
    onSuccess: (d) => { toast.success(`CBDC account created: ${d.walletId}`); setShowAccountDialog(false); },
    onError: (e) => toast.error(e.message),
  });

  const handleTransfer = () => {
    if (!form.senderWallet || !form.receiverWallet || !form.amount) {
      toast.error("Please fill all required fields"); return;
    }
    transferMut.mutate({ ...form, amount: parseFloat(form.amount) });
  };

  const totalTransfers = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.count), 0) ?? 0;
  const totalVolume = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.total_amount), 0) ?? 0;

  return (
    <div className="p-6 space-y-6">
          <DomainProtocolBanner domain="cbdc" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Coins className="w-6 h-6 text-amber-600" /> CBDC Rail Connector
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Wave 217 — eNaira, ECB TIPS, FedNow, Digital Yuan — TigerBeetle-backed CBDC ledger</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Wallet className="w-4 h-4" /> New Wallet</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create CBDC Wallet</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Rail *</Label>
                  <Select value={accForm.rail} onValueChange={v => {
                    const rail = RAILS.find(r => r.value === v);
                    setAccForm(p => ({ ...p, rail: v, currency: rail?.currency ?? "eNGN" }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RAILS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Wallet ID *</Label><Input value={accForm.walletId} onChange={e => setAccForm(p => ({ ...p, walletId: e.target.value }))} placeholder="wallet-..." /></div>
                <div><Label>Owner ID *</Label><Input value={accForm.ownerId} onChange={e => setAccForm(p => ({ ...p, ownerId: e.target.value }))} /></div>
                <div>
                  <Label>Owner Type *</Label>
                  <Select value={accForm.ownerType} onValueChange={v => setAccForm(p => ({ ...p, ownerType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                      <SelectItem value="BUSINESS">Business</SelectItem>
                      <SelectItem value="BANK">Bank</SelectItem>
                      <SelectItem value="GOVERNMENT">Government</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={() => createAccMut.mutate(accForm)} disabled={createAccMut.isPending}>
                  {createAccMut.isPending ? "Creating..." : "Create Wallet"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New Transfer</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Initiate CBDC Transfer</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Rail *</Label>
                  <Select value={form.rail} onValueChange={v => {
                    const rail = RAILS.find(r => r.value === v);
                    setForm(p => ({ ...p, rail: v, currency: rail?.currency ?? "eNGN" }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RAILS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Sender Wallet *</Label><Input value={form.senderWallet} onChange={e => setForm(p => ({ ...p, senderWallet: e.target.value }))} /></div>
                  <div><Label>Receiver Wallet *</Label><Input value={form.receiverWallet} onChange={e => setForm(p => ({ ...p, receiverWallet: e.target.value }))} /></div>
                  <div><Label>Amount *</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div><Label>Currency</Label><Input value={form.currency} disabled className="bg-muted" /></div>
                </div>
                <div><Label>Narration</Label><Input value={form.narration} onChange={e => setForm(p => ({ ...p, narration: e.target.value }))} /></div>
                <Button className="w-full" onClick={handleTransfer} disabled={transferMut.isPending}>
                  {transferMut.isPending ? "Initiating..." : "Initiate Transfer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Rail cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {RAILS.map(rail => (
          <Card key={rail.value} className={`cursor-pointer transition-all ${railFilter === rail.value ? "ring-2 ring-primary" : "hover:shadow-md"}`}
            onClick={() => setRailFilter(railFilter === rail.value ? undefined : rail.value)}>
            <CardContent className="pt-3 pb-3">
              <div className="text-xs font-medium text-muted-foreground">{rail.currency}</div>
              <div className="text-sm font-bold mt-0.5">{rail.label.split(" (")[0]}</div>
              <div className="text-xs text-muted-foreground mt-1">{accounts?.filter((a: Record<string, unknown>) => a.rail === rail.value).length ?? 0} wallets</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-blue-500" /><span className="text-sm text-muted-foreground">Total Transfers</span></div>
          <div className="text-2xl font-bold mt-1">{totalTransfers}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Wallet className="w-4 h-4 text-purple-500" /><span className="text-sm text-muted-foreground">Active Wallets</span></div>
          <div className="text-2xl font-bold mt-1">{accounts?.length ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" /><span className="text-sm text-muted-foreground">Total Volume</span></div>
          <div className="text-2xl font-bold mt-1">{totalVolume.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-amber-500" /><span className="text-sm text-muted-foreground">Active Rails</span></div>
          <div className="text-2xl font-bold mt-1">{RAILS.length}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>CBDC Transfers {railFilter ? `— ${RAILS.find(r => r.value === railFilter)?.label}` : ""}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">ID</th>
                  <th className="text-left py-2 pr-4">Rail</th>
                  <th className="text-left py-2 pr-4">Sender</th>
                  <th className="text-left py-2 pr-4">Receiver</th>
                  <th className="text-right py-2 pr-4">Amount</th>
                  <th className="text-left py-2 pr-4">Rail Ref</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {transfers?.transfers?.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No CBDC transfers yet</td></tr>
                )}
                {transfers?.transfers?.map((t: Record<string, unknown>) => (
                  <tr key={t.id as string} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4 font-mono text-xs">{(t.id as string).slice(0, 14)}...</td>
                    <td className="py-2 pr-4"><span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">{t.rail as string}</span></td>
                    <td className="py-2 pr-4 font-mono text-xs">{(t.sender_wallet as string)?.slice(0, 16)}...</td>
                    <td className="py-2 pr-4 font-mono text-xs">{(t.receiver_wallet as string)?.slice(0, 16)}...</td>
                    <td className="py-2 pr-4 text-right font-medium">{(t.amount as number)?.toLocaleString()} {t.currency as string}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{t.rail_ref ? (t.rail_ref as string).slice(0, 16) : "—"}</td>
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
