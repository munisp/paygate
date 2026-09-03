// @ts-nocheck
/**
 * Refunds Center — list/create refunds, stats cards, retry-with-customer-details
 * dialog for failed refunds, status/date filters.
 */
import { useState } from "react";
import {
  Undo2, Plus, RefreshCw, Search, AlertTriangle, CheckCircle2, Clock, XCircle, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  return new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  processed: { label: "Processed", className: "text-green-400 border-green-500/30", icon: CheckCircle2 },
  pending:   { label: "Pending",   className: "text-amber-400 border-amber-500/30", icon: Clock },
  processing:{ label: "Processing",className: "text-blue-400 border-blue-500/30", icon: Clock },
  failed:    { label: "Failed",    className: "text-red-400 border-red-500/30", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status ?? "unknown", className: "text-muted-foreground border-border", icon: Clock };
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`text-xs gap-1 ${meta.className}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </Badge>
  );
}

export default function RefundsCenter() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ transactionRef: "", amount: "", merchantNote: "", customerNote: "" });
  const [retryTarget, setRetryTarget] = useState<any | null>(null);
  const [retryForm, setRetryForm] = useState({ currency: "NGN", accountNumber: "", bankCode: "" });

  const listInput = {
    status: status === "all" ? undefined : status,
    from: from || undefined,
    to: to || undefined,
  };
  const { data, isLoading, refetch } = trpc.refunds.list.useQuery(listInput, { staleTime: 15_000 });
  const refunds: any[] = data?.refunds ?? data?.items ?? (Array.isArray(data) ? data : []);

  const { data: stats } = trpc.refunds.stats.useQuery({}, { staleTime: 30_000 });

  const invalidate = () => {
    utils.refunds.list.invalidate();
    utils.refunds.stats.invalidate();
  };

  const createRefund = trpc.refunds.create.useMutation({
    onSuccess: () => {
      toast.success("Refund created");
      setCreateOpen(false);
      setForm({ transactionRef: "", amount: "", merchantNote: "", customerNote: "" });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const retry = trpc.refunds.retryWithCustomerDetails.useMutation({
    onSuccess: () => {
      toast.success("Refund retry submitted with customer account details");
      setRetryTarget(null);
      setRetryForm({ currency: "NGN", accountNumber: "", bankCode: "" });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitCreate = () => {
    if (!form.transactionRef.trim()) { toast.error("Transaction reference is required"); return; }
    const amountKobo = form.amount.trim() ? nairaToKobo(form.amount) : undefined;
    if (form.amount.trim() && (!amountKobo || amountKobo <= 0)) { toast.error("Enter a valid amount"); return; }
    createRefund.mutate({
      transactionRef: form.transactionRef.trim(),
      amountKobo,
      merchantNote: form.merchantNote.trim() || undefined,
      customerNote: form.customerNote.trim() || undefined,
    });
  };

  const submitRetry = () => {
    if (!retryForm.accountNumber.trim() || !retryForm.bankCode.trim()) {
      toast.error("Account number and bank code are required");
      return;
    }
    if (!/^\d{10}$/.test(retryForm.accountNumber.trim())) { toast.error("Account number must be 10 digits"); return; }
    retry.mutate({
      id: retryTarget.id ?? retryTarget.refundId,
      currency: retryForm.currency.trim() || "NGN",
      accountNumber: retryForm.accountNumber.trim(),
      bankCode: retryForm.bankCode.trim(),
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Refunds Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Initiate, track and retry refunds to customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Refund
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Refunded", value: formatNGN(stats?.totalRefundedKobo ?? 0), icon: Undo2, tint: "text-blue-400" },
          { label: "Pending", value: String(stats?.pendingCount ?? 0), icon: Clock, tint: "text-amber-400" },
          { label: "Processed", value: String(stats?.processedCount ?? 0), icon: CheckCircle2, tint: "text-green-400" },
          { label: "Failed", value: String(stats?.failedCount ?? 0), icon: AlertTriangle, tint: "text-red-400" },
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
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
            ))}
          </div>
        ) : refunds.length === 0 ? (
          <div className="p-12 text-center">
            <Undo2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No refunds found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create your first refund from a settled transaction</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transaction Ref</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {refunds.map((r: any) => (
                  <tr key={r.id ?? r.refundId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{r.transactionRef ?? r.transactionReference ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatNGN(r.amountKobo ?? r.amount ?? 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.customerEmail ?? r.customer?.email ?? "—"}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "failed" && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => setRetryTarget(r)}>
                          <RotateCcw className="w-3 h-3" /> Retry with account
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create refund dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Refund</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transaction Reference *</Label>
              <Input value={form.transactionRef} onChange={(e) => setForm({ ...form, transactionRef: e.target.value })} placeholder="e.g. txn_abc123" />
            </div>
            <div className="space-y-2">
              <Label>Amount (₦) — leave blank for full refund</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Merchant Note</Label>
              <Textarea value={form.merchantNote} onChange={(e) => setForm({ ...form, merchantNote: e.target.value })} placeholder="Internal note" />
            </div>
            <div className="space-y-2">
              <Label>Customer Note</Label>
              <Textarea value={form.customerNote} onChange={(e) => setForm({ ...form, customerNote: e.target.value })} placeholder="Reason shown to customer" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={createRefund.isPending}>
              {createRefund.isPending ? "Creating…" : "Create Refund"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retry with customer details dialog */}
      <Dialog open={!!retryTarget} onOpenChange={(o) => { if (!o) setRetryTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Retry Refund with Customer Account</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Refund <span className="font-mono">{retryTarget?.transactionRef ?? retryTarget?.id}</span> failed. Provide the customer's account details to retry.
          </p>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={retryForm.currency} onValueChange={(v) => setRetryForm({ ...retryForm, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["NGN", "USD", "GHS", "KES", "ZAR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Number *</Label>
              <Input inputMode="numeric" maxLength={10} value={retryForm.accountNumber} onChange={(e) => setRetryForm({ ...retryForm, accountNumber: e.target.value.replace(/\D/g, "") })} placeholder="10-digit NUBAN" />
            </div>
            <div className="space-y-2">
              <Label>Bank Code *</Label>
              <Input value={retryForm.bankCode} onChange={(e) => setRetryForm({ ...retryForm, bankCode: e.target.value })} placeholder="e.g. 058" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setRetryTarget(null)}>Cancel</Button>
            <Button onClick={submitRetry} disabled={retry.isPending}>
              {retry.isPending ? "Retrying…" : "Retry Refund"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
