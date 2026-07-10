import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link2, Copy, Plus, Trash2, RefreshCw, ExternalLink, QrCode } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function PaymentLinkBuilder() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({
    currency: "NGN",
    allowCustomAmount: false,
    expiresInDays: 7,
  });

  const { data: links, refetch, isLoading } = trpc.paymentLinks.list.useQuery();
  const createMutation = trpc.paymentLinks.create.useMutation({
    onSuccess: () => { toast.success("Payment link created."); setOpen(false); setForm({ currency: "NGN", allowCustomAmount: false, expiresInDays: 7 }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.paymentLinks.delete.useMutation({
    onSuccess: () => { toast.success("Link deactivated."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard.");
  };

  const statusColor = (status: string) => {
    if (status === "active") return "default";
    if (status === "expired") return "secondary";
    return "destructive";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Link2 className="h-6 w-6 text-blue-500" /> Payment Link Builder</h1>
          <p className="text-muted-foreground text-sm mt-1">Create shareable payment links for invoices, subscriptions, and one-time collections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Create Link</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Collected</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !links?.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payment links yet. Create your first one.</TableCell></TableRow>}
              {links?.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{l.title}</p>
                      {l.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{l.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {l.allowCustomAmount ? <span className="text-muted-foreground italic">Custom</span> : (l.amount ? (l.amount / 100).toLocaleString() : "—")}
                  </TableCell>
                  <TableCell><Badge variant="outline">{l.currency}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{l.collectedCount ?? 0} payments</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell><Badge variant={statusColor(l.status ?? "active")}>{l.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {l.url && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => copyLink(l.url!)}><Copy className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" asChild><a href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: l.id })} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Payment Link</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Title <span className="text-destructive">*</span></Label><Input placeholder="e.g. Invoice #1234" value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Optional description shown to payer" rows={2} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["NGN", "USD", "GBP", "EUR", "GHS", "KES"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount (in kobo/cents)</Label>
                <Input type="number" placeholder="e.g. 500000" disabled={form.allowCustomAmount} value={form.amount ?? ""} onChange={(e) => set("amount", parseInt(e.target.value))} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.allowCustomAmount} onCheckedChange={(v) => set("allowCustomAmount", v)} />
              <Label>Allow customer to enter custom amount</Label>
            </div>
            <div className="space-y-2">
              <Label>Expires in (days)</Label>
              <Select value={String(form.expiresInDays)} onValueChange={(v) => set("expiresInDays", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="0">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ title: form.title, description: form.description, currency: form.currency, amount: form.allowCustomAmount ? undefined : form.amount, allowCustomAmount: form.allowCustomAmount, expiresInDays: form.expiresInDays || undefined })} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
