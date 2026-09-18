// @ts-nocheck
/**
 * Payment Requests — invoice-style payment requests with totals cards,
 * create/edit dialogs, notify/finalize/archive actions, record offline payment.
 */
import { useState } from "react";
import {
  FileText, Plus, RefreshCw, Bell, CheckCircle2, Archive, Banknote, Clock, XCircle, Send, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format((kobo ?? 0) / 100);
}
function nairaToKobo(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  paid:    { label: "Paid",    className: "text-green-400 border-green-500/30", icon: CheckCircle2 },
  success: { label: "Paid",    className: "text-green-400 border-green-500/30", icon: CheckCircle2 },
  pending: { label: "Pending", className: "text-amber-400 border-amber-500/30", icon: Clock },
  draft:   { label: "Draft",   className: "text-blue-400 border-blue-500/30", icon: FileText },
  archived:{ label: "Archived",className: "text-muted-foreground border-border", icon: Archive },
  failed:  { label: "Failed",  className: "text-red-400 border-red-500/30", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status ?? "unknown", className: "text-muted-foreground border-border", icon: Clock };
  const Icon = meta.icon;
  return <Badge variant="outline" className={`text-xs gap-1 ${meta.className}`}><Icon className="w-3 h-3" /> {meta.label}</Badge>;
}

type LineItem = { name: string; amount: string; quantity: string };
const EMPTY_FORM = {
  customer: "", amount: "", dueDate: "", description: "", invoiceNumber: "",
  splitCode: "", tax: "", sendNotification: true, draft: false,
};

export default function PaymentRequests() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("");
  const [includeArchive, setIncludeArchive] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; req: any } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [offlineForm, setOfflineForm] = useState({ offlineReference: "", amount: "" });

  const listInput = {
    status: status === "all" ? undefined : status,
    customer: customerFilter.trim() || undefined,
    includeArchive: includeArchive || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const { data, isLoading, refetch } = trpc.paymentRequests.list.useQuery(listInput, { staleTime: 15_000 });
  const requests: any[] = data?.requests ?? data?.items ?? (Array.isArray(data) ? data : []);

  const { data: totals } = trpc.paymentRequests.totals.useQuery({}, { staleTime: 30_000 });

  const invalidate = () => {
    utils.paymentRequests.list.invalidate();
    utils.paymentRequests.totals.invalidate();
  };

  const create = trpc.paymentRequests.create.useMutation({
    onSuccess: () => { toast.success("Payment request created"); closeDialog(); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.paymentRequests.update.useMutation({
    onSuccess: () => { toast.success("Payment request updated"); closeDialog(); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const notify = trpc.paymentRequests.notify.useMutation({
    onSuccess: () => { toast.success("Reminder sent to customer"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const finalize = trpc.paymentRequests.finalize.useMutation({
    onSuccess: () => { toast.success("Request finalized and sent"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const archive = trpc.paymentRequests.archive.useMutation({
    onSuccess: () => { toast.success("Request archived"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const recordOffline = trpc.paymentRequests.recordOfflinePayment.useMutation({
    onSuccess: () => {
      toast.success("Offline payment recorded");
      setOfflineOpen(false);
      setOfflineForm({ offlineReference: "", amount: "" });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const closeDialog = () => { setDialog(null); setForm({ ...EMPTY_FORM }); setLineItems([]); };

  const openEdit = (r: any) => {
    setForm({
      customer: r.customer ?? r.customerEmail ?? "",
      amount: r.amountKobo != null ? String(r.amountKobo / 100) : "",
      dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : "",
      description: r.description ?? "",
      invoiceNumber: r.invoiceNumber ?? "",
      splitCode: r.splitCode ?? "",
      tax: r.taxKobo != null ? String(r.taxKobo / 100) : "",
      sendNotification: false,
      draft: false,
    });
    setLineItems([]);
    setDialog({ mode: "edit", req: r });
  };

  const submit = () => {
    if (!form.customer.trim()) { toast.error("Customer (email or code) is required"); return; }
    const items = lineItems
      .filter((l) => l.name.trim())
      .map((l) => ({ name: l.name.trim(), amountKobo: nairaToKobo(l.amount), quantity: parseInt(l.quantity, 10) || 1 }));
    const amountKobo = form.amount.trim() ? nairaToKobo(form.amount) : undefined;
    if (!amountKobo && items.length === 0) { toast.error("Provide an amount or at least one line item"); return; }
    if (amountKobo != null && amountKobo <= 0) { toast.error("Amount must be greater than zero"); return; }
    const taxKobo = form.tax.trim() ? nairaToKobo(form.tax) : undefined;
    const payload: any = {
      customer: form.customer.trim(),
      amountKobo,
      lineItems: items.length ? items : undefined,
      tax: taxKobo,
      dueDate: form.dueDate || undefined,
      description: form.description.trim() || undefined,
      invoiceNumber: form.invoiceNumber.trim() || undefined,
      splitCode: form.splitCode.trim() || undefined,
    };
    if (dialog?.mode === "create") {
      create.mutate({ ...payload, sendNotification: form.sendNotification, draft: form.draft });
    } else if (dialog?.mode === "edit") {
      const idOrCode = dialog.req.id ?? dialog.req.requestCode ?? dialog.req.code;
      update.mutate({ idOrCode, ...payload });
    }
  };

  const submitOffline = () => {
    const amountKobo = nairaToKobo(offlineForm.amount);
    if (!offlineForm.offlineReference.trim() || amountKobo <= 0) {
      toast.error("Offline reference and a valid amount are required");
      return;
    }
    recordOffline.mutate({ offlineReference: offlineForm.offlineReference.trim(), amountKobo });
  };

  const idOf = (r: any) => r.id ?? r.requestCode ?? r.code;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Payment Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Invoice-style requests you email to customers for payment</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOfflineOpen(true)} className="gap-2">
            <Banknote className="w-4 h-4" /> Record Offline Payment
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setDialog({ mode: "create" })} className="gap-2">
            <Plus className="w-4 h-4" /> New Request
          </Button>
        </div>
      </div>

      {/* Totals cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Pending", value: formatNGN(totals?.pendingKobo ?? 0), icon: Clock, tint: "text-amber-400" },
          { label: "Collected", value: formatNGN(totals?.paidKobo ?? totals?.successfulKobo ?? 0), icon: CheckCircle2, tint: "text-green-400" },
          { label: "Drafts", value: formatNGN(totals?.draftKobo ?? 0), icon: FileText, tint: "text-blue-400" },
          { label: "Overdue", value: formatNGN(totals?.overdueKobo ?? 0), icon: XCircle, tint: "text-red-400" },
        ].map((c) => (
          <div key={c.label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
            <c.icon className={`w-8 h-8 ${c.tint}`} />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</p>
              <p className="text-xl font-bold text-foreground">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Customer</Label>
          <Input className="w-48" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder="email or code" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch checked={includeArchive} onCheckedChange={setIncludeArchive} id="incl-arch" />
          <Label htmlFor="incl-arch" className="text-xs">Include archived</Label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No payment requests found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create a request and we'll email the customer a payment link</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Request</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((r: any) => {
                  const id = idOf(r);
                  const paid = ["paid", "success"].includes(r.status);
                  const archived = r.status === "archived";
                  return (
                    <tr key={id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{r.description ?? r.invoiceNumber ?? `Request ${id}`}</p>
                        <p className="text-xs text-muted-foreground font-mono">{r.requestCode ?? r.invoiceNumber ?? id}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.customerEmail ?? r.customer ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatNGN(r.amountKobo ?? r.amount ?? 0)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(r.dueDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {r.status === "draft" && (
                            <>
                              <Button variant="outline" size="sm" className="gap-1" onClick={() => finalize.mutate({ idOrCode: id, sendNotification: true })}>
                                <Send className="w-3 h-3" /> Finalize
                              </Button>
                              <Button variant="ghost" size="sm" title="Edit" onClick={() => openEdit(r)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {r.status === "pending" && (
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => notify.mutate({ idOrCode: id })}>
                              <Bell className="w-3 h-3" /> Remind
                            </Button>
                          )}
                          {!paid && !archived && (
                            <Button
                              variant="ghost" size="sm" title="Archive"
                              onClick={() => { if (window.confirm("Archive this payment request?")) archive.mutate({ idOrCode: id }); }}
                            >
                              <Archive className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New Payment Request" : "Edit Payment Request"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Customer (email or code) *</Label>
              <Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Amount (₦)</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Leave blank to use line items" />
            </div>
            <div className="space-y-2">
              <Label>Tax (₦)</Label>
              <Input inputMode="decimal" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Split Code</Label>
              <Input value={form.splitCode} onChange={(e) => setForm({ ...form, splitCode: e.target.value })} placeholder="SPL_xxxx (optional)" />
            </div>
            {dialog?.mode === "create" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Switch checked={form.sendNotification} onCheckedChange={(v) => setForm({ ...form, sendNotification: v })} id="send-notif" />
                  <Label htmlFor="send-notif" className="text-xs">Email customer immediately</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.draft} onCheckedChange={(v) => setForm({ ...form, draft: v })} id="draft-sw" />
                  <Label htmlFor="draft-sw" className="text-xs">Save as draft</Label>
                </div>
              </div>
            )}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setLineItems([...lineItems, { name: "", amount: "", quantity: "1" }])}>
                  <Plus className="w-3 h-3" /> Add item
                </Button>
              </div>
              {lineItems.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input className="flex-1" placeholder="Item name" value={l.name}
                    onChange={(e) => setLineItems(lineItems.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input className="w-28" placeholder="Amount ₦" inputMode="decimal" value={l.amount}
                    onChange={(e) => setLineItems(lineItems.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <Input className="w-20" placeholder="Qty" inputMode="numeric" value={l.quantity}
                    onChange={(e) => setLineItems(lineItems.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                  <Button variant="ghost" size="icon" onClick={() => setLineItems(lineItems.filter((_, j) => j !== i))}>
                    <XCircle className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {dialog?.mode === "create" ? (form.draft ? "Save Draft" : "Create Request") : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record offline payment dialog */}
      <Dialog open={offlineOpen} onOpenChange={setOfflineOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Offline Payment</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Mark a payment request as paid via an offline channel (cash, bank deposit, POS).</p>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Offline Reference *</Label>
              <Input value={offlineForm.offlineReference} onChange={(e) => setOfflineForm({ ...offlineForm, offlineReference: e.target.value })} placeholder="Receipt / teller number" />
            </div>
            <div className="space-y-2">
              <Label>Amount (₦) *</Label>
              <Input inputMode="decimal" value={offlineForm.amount} onChange={(e) => setOfflineForm({ ...offlineForm, amount: e.target.value })} placeholder="0.00" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setOfflineOpen(false)}>Cancel</Button>
            <Button onClick={submitOffline} disabled={recordOffline.isPending}>
              {recordOffline.isPending ? "Recording…" : "Record Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
