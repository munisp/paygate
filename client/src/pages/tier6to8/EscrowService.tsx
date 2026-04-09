import { useState } from "react";
import { trpc3 } from "@/lib/trpc3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield } from "lucide-react";

export default function EscrowService() {
  const [form, setForm] = useState({ buyerId: "", sellerId: "", amountKobo: "", description: "", releaseDays: 7 });
  const { data: escrows } = trpc3.escrow.getEscrows.useQuery({ status: "all" });
  const createMutation = trpc3.escrow.createEscrow.useMutation({
    onSuccess: (d) => toast.success(`Escrow created: ${d.escrowId}`),
    onError: (e: any) => toast.error(e.message),
  });
  const releaseMutation = trpc3.escrow.releaseEscrow.useMutation({
    onSuccess: () => toast.success("Escrow released to seller"),
    onError: (e: any) => toast.error(e.message),
  });
  const disputeMutation = trpc3.escrow.disputeEscrow.useMutation({
    onSuccess: () => toast.success("Dispute raised"),
    onError: (e: any) => toast.error(e.message),
  });

  const statusColor = (s: string): "default" | "destructive" | "secondary" =>
    s === "released" ? "default" : s === "disputed" ? "destructive" : "secondary";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-green-600" />
        <div><h1 className="text-2xl font-bold">Escrow Service</h1><p className="text-muted-foreground">Secure buyer-seller payment protection</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Create Escrow</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Buyer ID" value={form.buyerId} onChange={e => setForm(f => ({ ...f, buyerId: e.target.value }))} />
            <Input placeholder="Seller ID" value={form.sellerId} onChange={e => setForm(f => ({ ...f, sellerId: e.target.value }))} />
            <Input type="number" placeholder="Amount (₦)" value={form.amountKobo} onChange={e => setForm(f => ({ ...f, amountKobo: e.target.value }))} />
            <Input placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Auto-release after</label>
              <Input type="number" className="w-20" value={form.releaseDays} onChange={e => setForm(f => ({ ...f, releaseDays: parseInt(e.target.value) }))} />
              <span className="text-sm">days</span>
            </div>
            <Button className="w-full" disabled={createMutation.isPending}
              onClick={() => createMutation.mutate({ buyerId: form.buyerId, sellerId: form.sellerId, amountKobo: Math.round(parseFloat(form.amountKobo || "0") * 100), description: form.description, releaseConditions: `Auto-release after ${form.releaseDays} days`, expiryDays: form.releaseDays })}>
              {createMutation.isPending ? "Creating..." : "Create Escrow"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Active Escrows</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {escrows?.escrows.map((e: any) => (
                <div key={e.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm">{e.description}</p>
                      <p className="text-xs text-muted-foreground">₦{(e.amountKobo / 100).toLocaleString()} — {e.buyerId} → {e.sellerId}</p>
                    </div>
                    <Badge variant={statusColor(e.status)}>{e.status}</Badge>
                  </div>
                  {e.status === "funded" && (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" className="flex-1" onClick={() => releaseMutation.mutate({ escrowId: e.id })}>Release</Button>
                      <Button size="sm" variant="destructive" className="flex-1" onClick={() => disputeMutation.mutate({ escrowId: e.id, reason: "Dispute raised" })}>Dispute</Button>
                    </div>
                  )}
                </div>
              ))}
              {!escrows?.escrows.length && <p className="text-center text-muted-foreground py-8">No escrows yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
