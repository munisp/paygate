// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CreditCard, Plus, RefreshCw, Pause, Play, Trash2, Calendar } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  cancelled: "destructive",
  past_due: "destructive",
  trialing: "outline",
};

export default function SubscriptionBilling() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({ currency: "NGN", billingInterval: "monthly" });

  const { data, refetch, isLoading } = trpc.subscriptions.list.useQuery({ limit: 100, offset: 0 });
  const { data: statsData } = trpc.subscriptions.stats.useQuery();

  const createMutation = trpc.subscriptions.create.useMutation({
    onSuccess: () => { toast.success("Subscription created."); setCreateOpen(false); setForm({ currency: "NGN", billingInterval: "monthly" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const pauseMutation = trpc.subscriptions.pause.useMutation({
    onSuccess: () => { toast.success("Subscription paused."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const resumeMutation = trpc.subscriptions.resume.useMutation({
    onSuccess: () => { toast.success("Subscription resumed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMutation = trpc.subscriptions.cancel.useMutation({
    onSuccess: () => { toast.success("Subscription cancelled."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const setF = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const fmt = (amount: number, currency = "NGN") => {
    try { return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount / 100); }
    catch { return `${currency} ${(amount / 100).toLocaleString()}`; }
  };

  const subscriptions = data?.rows ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6 text-emerald-500" /> Subscription Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage recurring billing subscriptions and billing intervals</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Create Subscription</Button>
        </div>
      </div>

      {/* Stats */}
      {statsData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold">{statsData.total ?? 0}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
          <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold text-green-600">{statsData.active ?? 0}</p><p className="text-xs text-muted-foreground">Active</p></CardContent></Card>
          <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold text-amber-500">{statsData.paused ?? 0}</p><p className="text-xs text-muted-foreground">Paused</p></CardContent></Card>
          <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold text-red-500">{statsData.cancelled ?? 0}</p><p className="text-xs text-muted-foreground">Cancelled</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Next Billing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !subscriptions.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No subscriptions found.</TableCell></TableRow>}
              {subscriptions.map((sub: any) => (
                <TableRow key={sub.id}>
                  <TableCell className="text-sm font-medium">{sub.merchantId}</TableCell>
                  <TableCell className="text-sm">{sub.customerEmail ?? sub.tenantId ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{sub.planName ?? sub.billingInterval ?? "—"}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{fmt(sub.amountKobo ?? 0, sub.currency ?? "NGN")}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString() : "—"}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[sub.status ?? "active"]} className="capitalize">{sub.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {sub.status === "active" ? (
                        <Button variant="ghost" size="sm" onClick={() => pauseMutation.mutate({ id: sub.id })} title="Pause"><Pause className="h-3.5 w-3.5" /></Button>
                      ) : sub.status === "paused" ? (
                        <Button variant="ghost" size="sm" onClick={() => resumeMutation.mutate({ id: sub.id })} title="Resume"><Play className="h-3.5 w-3.5" /></Button>
                      ) : null}
                      {sub.status !== "cancelled" && (
                        <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate({ id: sub.id })} className="text-destructive hover:text-destructive" title="Cancel"><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Subscription</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Merchant ID <span className="text-destructive">*</span></Label><Input placeholder="Merchant ID" value={form.merchantId ?? ""} onChange={(e) => setF("merchantId", e.target.value)} /></div>
            <div className="space-y-2"><Label>Tenant ID <span className="text-destructive">*</span></Label><Input placeholder="Tenant ID" value={form.tenantId ?? ""} onChange={(e) => setF("tenantId", e.target.value)} /></div>
            <div className="space-y-2"><Label>Customer Email</Label><Input type="email" placeholder="customer@example.com" value={form.customerEmail ?? ""} onChange={(e) => setF("customerEmail", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Amount (kobo) <span className="text-destructive">*</span></Label><Input type="number" placeholder="e.g. 500000" value={form.amountKobo ?? ""} onChange={(e) => setF("amountKobo", e.target.value)} /></div>
              <div className="space-y-2"><Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setF("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["NGN", "USD", "GBP", "EUR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Billing Interval</Label>
                <Select value={form.billingInterval} onValueChange={(v) => setF("billingInterval", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Plan Name</Label><Input placeholder="e.g. Starter" value={form.planName ?? ""} onChange={(e) => setF("planName", e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ merchantId: form.merchantId, tenantId: form.tenantId, customerEmail: form.customerEmail, amountKobo: parseInt(form.amountKobo), currency: form.currency, billingInterval: form.billingInterval as any, planName: form.planName })} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
