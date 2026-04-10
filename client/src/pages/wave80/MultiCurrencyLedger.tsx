import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TrendingUp, Shield } from "lucide-react";
import { trpc5 } from "@/lib/trpc5";
import { toast } from "sonner";

export default function MultiCurrencyLedger() {
  const [postOpen, setPostOpen] = useState(false);
  const [form, setForm] = useState({ currency: "NGN", type: "credit" as "credit" | "debit", amount: "", description: "" });

  const { data: accountsData, isLoading: loadingAccounts, refetch } = trpc5.multiCurrencyLedger.listAccounts.useQuery();
  const { data: entriesData, isLoading: loadingEntries, refetch: refetchEntries } = trpc5.multiCurrencyLedger.listEntries.useQuery({});
  const { data: fxData } = trpc5.multiCurrencyLedger.getFxRates.useQuery();

  const postEntry = trpc5.multiCurrencyLedger.postEntry.useMutation({
    onSuccess: () => { toast.success("Entry posted"); setPostOpen(false); refetch(); refetchEntries(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const accounts = accountsData?.accounts ?? [];
  const entries = entriesData?.entries ?? [];
  const rates = fxData?.rates ?? {};

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Multi-Currency Ledger</h1><p className="text-muted-foreground">Real-time FX, hedging, and multi-currency balances</p></div>
        <Button variant="outline" onClick={() => setPostOpen(true)}><Shield className="w-4 h-4 mr-2" />Post Entry</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loadingAccounts ? <p className="text-sm text-muted-foreground col-span-4 py-4">Loading accounts...</p> :
        accounts.map(a => (
          <Card key={a.id}><CardContent className="pt-6">
            <p className="text-xl font-bold">{(a.balance / 100).toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{a.currency}</p>
            <Badge variant="outline" className="mt-1 text-xs">{a.status}</Badge>
          </CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Live FX Rates (vs NGN)</CardTitle></CardHeader><CardContent>
          <div className="space-y-3">{Object.entries(rates).map(([currency, rate]) => (
            <div key={currency} className="flex items-center justify-between p-3 border rounded-lg">
              <p className="font-medium">{currency}/NGN</p>
              <div className="flex items-center gap-2"><p className="font-bold">{(1 / (rate as number)).toFixed(2)}</p><Badge variant="outline"><TrendingUp className="w-3 h-3 mr-1" />Live</Badge></div>
            </div>
          ))}</div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recent Entries</CardTitle></CardHeader><CardContent>
          {loadingEntries ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
          entries.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No entries yet.</p></div> : (
            <div className="space-y-3">{entries.slice(0, 10).map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div><p className="font-medium">{e.description}</p><p className="text-sm text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</p></div>
                <p className={"font-bold " + (e.type === "credit" ? "text-green-600" : "text-red-600")}>{e.type === "credit" ? "+" : "-"}{(e.amount / 100).toLocaleString()} {e.currency}</p>
              </div>
            ))}</div>
          )}
        </CardContent></Card>
      </div>
      <Dialog open={postOpen} onOpenChange={setPostOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post Ledger Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["NGN","USD","GBP","EUR","KES","GHS","ZAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as "credit" | "debit" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="credit">Credit</SelectItem><SelectItem value="debit">Debit</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Amount (minor units)</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostOpen(false)}>Cancel</Button>
            <Button onClick={() => postEntry.mutate({ currency: form.currency, type: form.type, amount: parseInt(form.amount), description: form.description })} disabled={postEntry.isPending}>{postEntry.isPending ? "Posting..." : "Post Entry"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
