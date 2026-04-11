import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Zap, Clock } from "lucide-react";

export default function RTGSDashboard() {
  const [form, setForm] = useState({ beneficiaryBank: "", beneficiaryAccount: "", beneficiaryName: "", amountKobo: "", narration: "" });
  const { data: history } = trpc.tier6to8.rtgs.getRTGSHistory.useQuery({ limit: 20 });
  const { data: limits } = trpc.tier6to8.rtgs.getRTGSLimits.useQuery();
  const initiateMutation = trpc.tier6to8.rtgs.initiateRTGS.useMutation({
    onSuccess: (d: any) => toast.success(`RTGS initiated — Ref: ${d.rtgsRef}`),
    onError: (e: any) => toast.error(e.message),
  });

  const statusColor = (s: string): "default" | "destructive" | "secondary" =>
    s === "settled" ? "default" : s === "failed" ? "destructive" : "secondary";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Zap className="w-8 h-8 text-yellow-500" />
        <div><h1 className="text-2xl font-bold">Real-Time Gross Settlement</h1><p className="text-muted-foreground">Instant high-value interbank transfers via CBN RTGS</p></div>
      </div>
      {limits && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Single Tx Limit</p><p className="text-lg font-bold">₦{(limits.singleTransactionLimitKobo / 100).toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Daily Limit</p><p className="text-lg font-bold">₦{(limits.dailyLimitKobo / 100).toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Remaining Today</p><p className="text-lg font-bold">₦{(limits.remainingKobo / 100).toLocaleString()}</p></CardContent></Card>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Initiate RTGS Transfer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Beneficiary Bank Code (e.g. 058)" value={form.beneficiaryBank} onChange={e => setForm(f => ({ ...f, beneficiaryBank: e.target.value }))} />
            <Input placeholder="Account Number" value={form.beneficiaryAccount} onChange={e => setForm(f => ({ ...f, beneficiaryAccount: e.target.value }))} />
            <Input placeholder="Beneficiary Name" value={form.beneficiaryName} onChange={e => setForm(f => ({ ...f, beneficiaryName: e.target.value }))} />
            <Input type="number" placeholder="Amount (₦)" value={form.amountKobo} onChange={e => setForm(f => ({ ...f, amountKobo: e.target.value }))} />
            <Input placeholder="Narration" value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} />
            <Button className="w-full" disabled={initiateMutation.isPending || !form.beneficiaryBank || !form.amountKobo}
              onClick={() => initiateMutation.mutate({ beneficiaryBank: form.beneficiaryBank, beneficiaryAccount: form.beneficiaryAccount, beneficiaryName: form.beneficiaryName, amountKobo: Math.round(parseFloat(form.amountKobo) * 100), narration: form.narration, valueDate: new Date().toISOString().slice(0, 10) })}>
              {initiateMutation.isPending ? "Processing..." : "Initiate RTGS"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4" />Recent RTGS Transfers</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {history?.transactions.map((t: any) => (
                <div key={t.id} className="p-3 border rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-medium text-sm">{t.beneficiaryName}</p>
                    <p className="text-xs text-muted-foreground">{t.beneficiaryBank} · {t.beneficiaryAccount}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">₦{(t.amountKobo / 100).toLocaleString()}</p>
                    <Badge variant={statusColor(t.status)}>{t.status}</Badge>
                  </div>
                </div>
              ))}
              {!history?.transactions.length && <p className="text-center text-muted-foreground py-8">No RTGS transfers yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
