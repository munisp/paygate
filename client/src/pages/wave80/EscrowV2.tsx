import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Shield, Clock, CheckCircle, AlertTriangle, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function EscrowV2() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", buyerId: "", sellerId: "", amount: "", currency: "NGN", description: "", releaseConditions: "" });

  const { data, isLoading, refetch } = trpc.wave80.escrowV2.listContracts.useQuery({}, { staleTime: 30_000 });
  const { data: stats } = trpc.wave80.escrowV2.getStats.useQuery();

  const createContract = trpc.wave80.escrowV2.createContract.useMutation({
    onSuccess: () => { toast.success("Escrow contract created"); setCreateOpen(false); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const releaseContract = trpc.wave80.escrowV2.releaseContract.useMutation({
    onSuccess: () => { toast.success("Funds released"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const contracts = data?.contracts ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Escrow V2</h1><p className="text-muted-foreground">Secure escrow contracts with conditional release</p></div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" />New Contract</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Shield className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{stats?.total ?? 0}</p><p className="text-sm text-muted-foreground">Total Contracts</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{stats?.active ?? 0}</p><p className="text-sm text-muted-foreground">Active</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{stats?.released ?? 0}</p><p className="text-sm text-muted-foreground">Released</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertTriangle className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold">{stats?.disputed ?? 0}</p><p className="text-sm text-muted-foreground">Disputed</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Contracts</CardTitle></CardHeader><CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        contracts.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No escrow contracts yet.</p></div> : (
          <div className="space-y-3">{contracts.map(c => (
            <div key={c.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div><p className="font-medium">{c.title}</p><p className="text-sm text-muted-foreground">Buyer: {c.buyerId ?? "N/A"} | Seller: {c.sellerId ?? "N/A"}</p></div>
              <div className="flex items-center gap-3">
                <p className="font-bold">{c.currency} {(c.amount / 100).toLocaleString()}</p>
                <Badge variant={c.status === "released" ? "default" : c.status === "disputed" ? "destructive" : "secondary"}>{c.status}</Badge>
                {/* Contracts are born 'funded' (not 'pending') — release is only valid from 'funded'. */}
                {(c.status === "funded" || c.status === "active") && <Button size="sm" onClick={() => releaseContract.mutate({ contractId: c.id })}>Release</Button>}
              </div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Escrow Contract</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Buyer ID (optional)</Label><Input value={form.buyerId} onChange={e => setForm(p => ({ ...p, buyerId: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Seller ID (optional)</Label><Input value={form.sellerId} onChange={e => setForm(p => ({ ...p, sellerId: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Amount (kobo)</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Release Conditions</Label><Input value={form.releaseConditions} onChange={e => setForm(p => ({ ...p, releaseConditions: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createContract.mutate({ title: form.title, buyerId: form.buyerId, sellerId: form.sellerId, amount: parseInt(form.amount), currency: form.currency, description: form.description, releaseConditions: form.releaseConditions, idempotencyKey: crypto.randomUUID() })} disabled={createContract.isPending}>{createContract.isPending ? "Creating..." : "Create Contract"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
