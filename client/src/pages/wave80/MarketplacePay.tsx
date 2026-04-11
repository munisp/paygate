import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShoppingBag, Split, Clock, CheckCircle, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function MarketplacePay() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ buyerEmail: "", itemName: "", itemPrice: "", itemQty: "1" });

  const { data, isLoading, refetch } = trpc.wave80.marketplacePay.listOrders.useQuery({});
  const { data: stats } = trpc.wave80.marketplacePay.getStats.useQuery();

  const createOrder = trpc.wave80.marketplacePay.createOrder.useMutation({
    onSuccess: () => { toast.success("Order created"); setCreateOpen(false); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const updateStatus = trpc.wave80.marketplacePay.updateOrderStatus.useMutation({
    onSuccess: () => { toast.success("Order updated"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const orders = data?.orders ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Marketplace Payments</h1><p className="text-muted-foreground">Split payments, holds, and vendor disbursements</p></div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" />Create Order</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><ShoppingBag className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{stats?.total ?? 0}</p><p className="text-sm text-muted-foreground">Total Orders</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{stats?.pending ?? 0}</p><p className="text-sm text-muted-foreground">Pending</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Split className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">&#8358;{((stats?.totalFees ?? 0) / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Platform Fees</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">&#8358;{((stats?.totalRevenue ?? 0) / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Revenue</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Orders</CardTitle></CardHeader><CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        orders.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No orders yet.</p></div> : (
          <div className="space-y-3">{orders.map(o => (
            <div key={o.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div><p className="font-medium">{o.buyerEmail}</p><p className="text-sm text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</p></div>
              <div className="flex items-center gap-3">
                <p className="font-bold">&#8358;{(o.totalAmount / 100).toLocaleString()}</p>
                <Badge variant={o.status === "completed" ? "default" : o.status === "pending" ? "secondary" : "outline"}>{o.status}</Badge>
                {o.status === "pending" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ orderId: o.id, status: "completed" })}>Release</Button>}
              </div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Marketplace Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Buyer Email</Label><Input value={form.buyerEmail} onChange={e => setForm(p => ({ ...p, buyerEmail: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Item Name</Label><Input value={form.itemName} onChange={e => setForm(p => ({ ...p, itemName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Price (kobo)</Label><Input type="number" value={form.itemPrice} onChange={e => setForm(p => ({ ...p, itemPrice: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Qty</Label><Input type="number" value={form.itemQty} onChange={e => setForm(p => ({ ...p, itemQty: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createOrder.mutate({ buyerEmail: form.buyerEmail, items: [{ name: form.itemName, price: parseInt(form.itemPrice), qty: parseInt(form.itemQty) }] })} disabled={createOrder.isPending}>{createOrder.isPending ? "Creating..." : "Create Order"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
