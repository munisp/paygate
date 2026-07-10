import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRightLeft, Globe, Shield, TrendingUp, Plus, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  INITIATED: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-yellow-100 text-yellow-800",
  SETTLED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  REVERSED: "bg-gray-100 text-gray-800",
};

export default function Remittance() {
  const [page, setPage] = useState(1);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showTravelRuleDialog, setShowTravelRuleDialog] = useState(false);
  const [form, setForm] = useState({
    corridorId: "", senderFsp: "", senderAccount: "",
    receiverFsp: "", receiverAccount: "", sendAmount: "",
    sendCurrency: "NGN", receiverName: "", narration: "",
  });
  const [trForm, setTrForm] = useState({
    transferId: "", originatorName: "", originatorAccount: "",
    originatorCountry: "NG", beneficiaryName: "", beneficiaryAccount: "",
    beneficiaryCountry: "GB", amount: "", currency: "NGN",
  });

  const { data: corridors } = trpc.remittance.listCorridors.useQuery();
  const { data: transfers, refetch } = trpc.remittance.listTransfers.useQuery({ page, pageSize: 20 });
  const initiateMut = trpc.remittance.initiateTransfer.useMutation({
    onSuccess: () => { toast.success("Remittance transfer initiated"); setShowTransferDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const travelRuleMut = trpc.remittance.screenTravelRule.useMutation({
    onSuccess: (data) => {
      if (data.isCompliant) toast.success(`Travel Rule: Compliant (risk score: ${data.riskScore})`);
      else toast.error(`Travel Rule: Non-compliant — ${data.flags.join(", ")}`);
      setShowTravelRuleDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleInitiate = () => {
    if (!form.corridorId || !form.senderFsp || !form.receiverFsp || !form.sendAmount || !form.receiverName) {
      toast.error("Please fill all required fields");
      return;
    }
    initiateMut.mutate({ ...form, sendAmount: parseFloat(form.sendAmount) });
  };

  const handleTravelRule = () => {
    travelRuleMut.mutate({ ...trForm, amount: parseFloat(trForm.amount) });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-600" /> Remittance Corridor Engine
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Wave 211 — Cross-border transfer management with Travel Rule compliance</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showTravelRuleDialog} onOpenChange={setShowTravelRuleDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Shield className="w-4 h-4" /> Travel Rule Screen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Travel Rule Screening</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Transfer ID</Label><Input value={trForm.transferId} onChange={e => setTrForm(p => ({ ...p, transferId: e.target.value }))} placeholder="REM-..." /></div>
                  <div><Label>Amount</Label><Input type="number" value={trForm.amount} onChange={e => setTrForm(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div><Label>Originator Name</Label><Input value={trForm.originatorName} onChange={e => setTrForm(p => ({ ...p, originatorName: e.target.value }))} /></div>
                  <div><Label>Originator Account</Label><Input value={trForm.originatorAccount} onChange={e => setTrForm(p => ({ ...p, originatorAccount: e.target.value }))} /></div>
                  <div><Label>Originator Country</Label><Input value={trForm.originatorCountry} onChange={e => setTrForm(p => ({ ...p, originatorCountry: e.target.value }))} /></div>
                  <div><Label>Beneficiary Name</Label><Input value={trForm.beneficiaryName} onChange={e => setTrForm(p => ({ ...p, beneficiaryName: e.target.value }))} /></div>
                  <div><Label>Beneficiary Account</Label><Input value={trForm.beneficiaryAccount} onChange={e => setTrForm(p => ({ ...p, beneficiaryAccount: e.target.value }))} /></div>
                  <div><Label>Beneficiary Country</Label><Input value={trForm.beneficiaryCountry} onChange={e => setTrForm(p => ({ ...p, beneficiaryCountry: e.target.value }))} /></div>
                </div>
                <Button className="w-full" onClick={handleTravelRule} disabled={travelRuleMut.isPending}>
                  {travelRuleMut.isPending ? "Screening..." : "Run Travel Rule Check"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New Transfer</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Initiate Remittance Transfer</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Corridor</Label>
                  <Select value={form.corridorId} onValueChange={v => setForm(p => ({ ...p, corridorId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select corridor" /></SelectTrigger>
                    <SelectContent>
                      {corridors?.map((c: Record<string, unknown>) => (
                        <SelectItem key={c.id as string} value={c.id as string}>
                          {c.from_currency as string} → {c.to_currency as string} ({c.provider as string})
                        </SelectItem>
                      ))}
                      <SelectItem value="NGN-GBP-001">NGN → GBP (TransferWise)</SelectItem>
                      <SelectItem value="NGN-USD-001">NGN → USD (Remitly)</SelectItem>
                      <SelectItem value="NGN-EUR-001">NGN → EUR (WorldRemit)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Sender FSP</Label><Input value={form.senderFsp} onChange={e => setForm(p => ({ ...p, senderFsp: e.target.value }))} placeholder="ACCESS" /></div>
                  <div><Label>Sender Account</Label><Input value={form.senderAccount} onChange={e => setForm(p => ({ ...p, senderAccount: e.target.value }))} /></div>
                  <div><Label>Receiver FSP</Label><Input value={form.receiverFsp} onChange={e => setForm(p => ({ ...p, receiverFsp: e.target.value }))} placeholder="BARCLAYS" /></div>
                  <div><Label>Receiver Account</Label><Input value={form.receiverAccount} onChange={e => setForm(p => ({ ...p, receiverAccount: e.target.value }))} /></div>
                  <div><Label>Amount</Label><Input type="number" value={form.sendAmount} onChange={e => setForm(p => ({ ...p, sendAmount: e.target.value }))} /></div>
                  <div><Label>Currency</Label>
                    <Select value={form.sendCurrency} onValueChange={v => setForm(p => ({ ...p, sendCurrency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NGN">NGN</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Receiver Name</Label><Input value={form.receiverName} onChange={e => setForm(p => ({ ...p, receiverName: e.target.value }))} /></div>
                <div><Label>Narration</Label><Input value={form.narration} onChange={e => setForm(p => ({ ...p, narration: e.target.value }))} placeholder="Family support" /></div>
                <Button className="w-full" onClick={handleInitiate} disabled={initiateMut.isPending}>
                  {initiateMut.isPending ? "Initiating..." : "Initiate Transfer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-blue-500" /><span className="text-sm text-muted-foreground">Total Transfers</span></div>
          <div className="text-2xl font-bold mt-1">{transfers?.total ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-green-500" /><span className="text-sm text-muted-foreground">Active Corridors</span></div>
          <div className="text-2xl font-bold mt-1">{corridors?.length ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-500" /><span className="text-sm text-muted-foreground">Settled Today</span></div>
          <div className="text-2xl font-bold mt-1">0</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /><span className="text-sm text-muted-foreground">Travel Rule Flags</span></div>
          <div className="text-2xl font-bold mt-1">0</div>
        </CardContent></Card>
      </div>

      {/* Transfers Table */}
      <Card>
        <CardHeader><CardTitle>Transfer History</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">ID</th>
                  <th className="text-left py-2 pr-4">Sender FSP</th>
                  <th className="text-left py-2 pr-4">Receiver</th>
                  <th className="text-right py-2 pr-4">Amount</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {transfers?.transfers?.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No transfers yet</td></tr>
                )}
                {transfers?.transfers?.map((t: Record<string, unknown>) => (
                  <tr key={t.id as string} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4 font-mono text-xs">{(t.id as string).slice(0, 16)}...</td>
                    <td className="py-2 pr-4">{t.sender_fsp as string}</td>
                    <td className="py-2 pr-4">{t.receiver_name as string}</td>
                    <td className="py-2 pr-4 text-right font-medium">{(t.send_amount as number)?.toLocaleString()} {t.send_currency as string}</td>
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
