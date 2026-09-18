// @ts-nocheck
/**
 * AP Bill Pay — bill list with status chips/filters, create-bill dialog,
 * bill detail drawer (line items, WHT, payments) and the pay flow with a
 * funding-method picker (wallet / card / bank_transfer / pay_over_time).
 * All mutations that create money movement plumb a fresh idempotencyKey.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Receipt, Plus, Filter, ChevronRight, Clock, CheckCircle2, XCircle,
  AlertTriangle, FileText, CreditCard, Wallet, Building2, CalendarClock,
  Ban, Send, Trash2, RefreshCw, ThumbsUp, ThumbsDown, Calendar,
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

// ─── helpers ─────────────────────────────────────────────────────────────────
function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format((kobo ?? 0) / 100);
}
function nairaToKobo(v: string | number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:              { label: "Draft",              color: "text-muted-foreground", bg: "bg-muted" },
  pending_extraction: { label: "Extracting",         color: "text-violet-400",       bg: "bg-violet-500/15" },
  extracted:          { label: "Extracted",          color: "text-violet-400",       bg: "bg-violet-500/15" },
  pending_approval:   { label: "Pending Approval",   color: "text-amber-400",        bg: "bg-amber-500/15" },
  approved:           { label: "Approved",           color: "text-blue-400",         bg: "bg-blue-500/15" },
  scheduled:          { label: "Scheduled",          color: "text-cyan-400",         bg: "bg-cyan-500/15" },
  paid:               { label: "Paid",               color: "text-green-400",        bg: "bg-green-500/15" },
  partially_paid:     { label: "Partially Paid",     color: "text-teal-400",         bg: "bg-teal-500/15" },
  rejected:           { label: "Rejected",           color: "text-red-400",          bg: "bg-red-500/15" },
  void:               { label: "Void",               color: "text-muted-foreground", bg: "bg-muted" },
};

const FILTERS = ["all", "draft", "pending_approval", "approved", "partially_paid", "paid", "scheduled", "rejected", "void"] as const;

const FUNDING_METHODS = [
  { key: "wallet", label: "Wallet Balance", desc: "Debit your PayGate wallet instantly", icon: Wallet },
  { key: "bank_transfer", label: "Bank Transfer", desc: "Fund via the bank transfer rail", icon: Building2 },
  { key: "card", label: "Card", desc: "Card funding — 2.9% fee disclosed at checkout", icon: CreditCard },
  { key: "pay_over_time", label: "Pay Over Time", desc: "Finance this bill in instalments", icon: CalendarClock },
] as const;

type LineItemDraft = { description: string; quantity: string; unitPrice: string };

export default function BillPay() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [payBillId, setPayBillId] = useState<string | null>(null);
  const [cardPending, setCardPending] = useState<any | null>(null); // awaiting_card_payment payload
  const [decision, setDecision] = useState<{ billId: string; action: "approve" | "reject" } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  // create form
  const [vendorId, setVendorId] = useState<string>("none");
  const [billNumber, setBillNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxNaira, setTaxNaira] = useState("0");
  const [items, setItems] = useState<LineItemDraft[]>([{ description: "", quantity: "1", unitPrice: "" }]);

  // ── queries ──
  const { data, isLoading, refetch } = trpc.apBillPay.listBills.useQuery(
    { status: statusFilter === "all" ? undefined : (statusFilter as any), limit: 100 },
    { staleTime: 15_000 },
  );
  const bills: any[] = data?.bills ?? [];

  const { data: vendorsData } = trpc.apVendorDirectory.listVendors.useQuery({ limit: 200 }, { staleTime: 60_000 });
  const vendors: any[] = vendorsData?.vendors ?? [];
  const vendorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendors) m.set(v.id, v.name);
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [vendors]);

  const { data: detail, refetch: refetchDetail } = trpc.apBillPay.getBill.useQuery(
    { billId: selectedBillId! },
    { enabled: !!selectedBillId },
  );

  const invalidate = () => {
    utils.apBillPay.listBills.invalidate();
    if (selectedBillId) refetchDetail();
  };

  // ── mutations ──
  const createBill = trpc.apBillPay.createBill.useMutation({
    onSuccess: () => {
      toast.success("Bill created as draft");
      setCreateOpen(false);
      setVendorId("none"); setBillNumber(""); setDueDate(""); setTaxNaira("0");
      setItems([{ description: "", quantity: "1", unitPrice: "" }]);
      utils.apBillPay.listBills.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const voidBill = trpc.apBillPay.voidBill.useMutation({
    onSuccess: () => { toast.success("Bill voided"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const approveBill = trpc.apBillPay.approveBill.useMutation({
    onSuccess: () => { toast.success("Bill approved"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const submitForApproval = trpc.apApprovals.submitForApproval.useMutation({
    onSuccess: () => { toast.success("Submitted for approval"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const approveStep = trpc.apApprovals.approveStep.useMutation({
    onSuccess: (r: any) => {
      toast.success(r?.billApproved ? "Bill approved" : "Approval step recorded");
      setDecision(null); setDecisionNotes(""); invalidate();
      utils.apApprovals.approvalQueue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectStep = trpc.apApprovals.rejectStep.useMutation({
    onSuccess: () => {
      toast.success("Bill rejected");
      setDecision(null); setDecisionNotes(""); invalidate();
      utils.apApprovals.approvalQueue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const payBill = trpc.apBillPay.payBill.useMutation({
    onSuccess: (r: any) => {
      if (r?.status === "awaiting_card_payment") {
        setCardPending(r);
        toast.info("Card payment initiated — confirm to complete");
      } else {
        toast.success(r?.status === "paid" ? "Bill paid" : "Payment initiated");
        setPayBillId(null);
      }
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const payBillConfirm = trpc.apBillPay.payBillConfirm.useMutation({
    onSuccess: () => {
      toast.success("Card payment confirmed — bill paid");
      setCardPending(null); setPayBillId(null); invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const sendAdvice = trpc.remittanceAdvice.sendAdvice.useMutation({
    onSuccess: () => { toast.success("Remittance advice sent"); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });
  const resendAdvice = trpc.remittanceAdvice.resendAdvice.useMutation({
    onSuccess: () => toast.success("Remittance advice re-sent"),
    onError: (e) => toast.error(e.message),
  });

  // ── create helpers ──
  const addItem = () => setItems((xs) => [...xs, { description: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (i: number) => setItems((xs) => xs.filter((_, idx) => idx !== i));
  const subtotalKobo = items.reduce((s, li) => s + Math.round((parseFloat(li.quantity) || 0) * nairaToKobo(li.unitPrice)), 0);

  const submitCreate = () => {
    const lineItems = items
      .filter((li) => li.description.trim() && nairaToKobo(li.unitPrice) > 0 && parseFloat(li.quantity) > 0)
      .map((li) => ({
        description: li.description.trim(),
        quantity: parseFloat(li.quantity),
        unitPriceKobo: nairaToKobo(li.unitPrice),
      }));
    if (lineItems.length === 0) { toast.error("Add at least one line item"); return; }
    createBill.mutate({
      vendorId: vendorId === "none" ? null : vendorId,
      billNumber: billNumber.trim() || null,
      taxKobo: nairaToKobo(taxNaira),
      dueDate: dueDate ? new Date(dueDate) : null,
      lineItems,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const chooseFunding = (method: string) => {
    if (!payBillId) return;
    if (method === "pay_over_time") {
      setPayBillId(null);
      setLocation(`/ap/pay-over-time?billId=${payBillId}`);
      return;
    }
    payBill.mutate({ billId: payBillId, fundingMethod: method as any, idempotencyKey: crypto.randomUUID() });
  };

  const submitDecision = () => {
    if (!decision) return;
    if (decision.action === "approve") {
      approveStep.mutate({ billId: decision.billId, notes: decisionNotes.trim() || undefined });
    } else {
      if (decisionNotes.trim().length < 3) { toast.error("Rejection notes are required (min 3 characters)"); return; }
      rejectStep.mutate({ billId: decision.billId, notes: decisionNotes.trim() });
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of bills) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [bills]);

  const detailBill = detail?.bill;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Bill Pay
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Accounts payable — capture, approve and pay vendor bills</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Bill
          </Button>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              statusFilter === f
                ? "bg-primary text-primary-foreground shadow"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : STATUS_META[f]?.label ?? f}
            {f !== "all" && (counts[f] ?? 0) > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === f ? "bg-white/20" : "bg-muted"}`}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bill table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading bills…</div>
        ) : bills.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No bills found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create a bill or upload one via the Bill Inbox</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bill</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">WHT</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bills.map((b) => {
                  const meta = STATUS_META[b.status] ?? STATUS_META.draft;
                  const overdue = b.dueDate && new Date(b.dueDate) < new Date() && !["paid", "void", "rejected"].includes(b.status);
                  return (
                    <tr key={b.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelectedBillId(b.id)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{b.billNumber ?? `#${b.id.slice(0, 8)}`}</p>
                        <p className="text-xs text-muted-foreground">{b.source ?? "manual"}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{vendorName(b.vendorId)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatNGN(b.totalKobo)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{(b.whtKobo ?? 0) > 0 ? formatNGN(b.whtKobo) : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={overdue ? "text-red-400 font-medium" : "text-muted-foreground"}>
                          {fmtDate(b.dueDate)}{overdue ? " (overdue)" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                            {meta.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Bill dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor</SelectItem>
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bill Number (optional)</Label>
                <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="INV-001" />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tax / VAT (₦)</Label>
                <Input type="number" min="0" step="0.01" value={taxNaira} onChange={(e) => setTaxNaira(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add item
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((li, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_130px_36px] gap-2 items-center">
                    <Input placeholder="Description" value={li.description}
                      onChange={(e) => setItems((xs) => xs.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} />
                    <Input type="number" min="0" step="any" placeholder="Qty" value={li.quantity}
                      onChange={(e) => setItems((xs) => xs.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))} />
                    <Input type="number" min="0" step="0.01" placeholder="Unit ₦" value={li.unitPrice}
                      onChange={(e) => setItems((xs) => xs.map((x, idx) => idx === i ? { ...x, unitPrice: e.target.value } : x))} />
                    <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">{formatNGN(subtotalKobo)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              WHT (if applicable to the vendor) is computed automatically on creation.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={submitCreate} disabled={createBill.isPending}>
                {createBill.isPending ? "Creating…" : "Create Bill"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Pay dialog: funding method picker ── */}
      <Dialog open={!!payBillId} onOpenChange={(o) => { if (!o) { setPayBillId(null); setCardPending(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{cardPending ? "Confirm Card Payment" : "Choose Funding Method"}</DialogTitle>
          </DialogHeader>
          {cardPending ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Funded amount</span><span className="font-semibold">{formatNGN(cardPending.fundedKobo)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Card fee</span><span>{formatNGN(cardPending.feeKobo)}</span></div>
                {(cardPending.creditAppliedKobo ?? 0) > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Vendor credit applied</span><span className="text-green-400">-{formatNGN(cardPending.creditAppliedKobo)}</span></div>
                )}
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span className="text-muted-foreground">Charged to card</span>
                  <span className="font-bold">{formatNGN((cardPending.fundedKobo ?? 0) + (cardPending.feeKobo ?? 0))}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{cardPending.feeDisclosure}</p>
              {/* In production the Stripe.js confirmCardPayment(cardPending.clientSecret) runs here first;
                  we then confirm server-side, matching the HostedPaymentPage convention. */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setCardPending(null); setPayBillId(null); }}>Cancel</Button>
                <Button onClick={() => payBillConfirm.mutate({ paymentIntentId: cardPending.paymentIntentId })} disabled={payBillConfirm.isPending}>
                  {payBillConfirm.isPending ? "Confirming…" : "Confirm Card Payment"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {FUNDING_METHODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => chooseFunding(m.key)}
                  disabled={payBill.isPending}
                  className="w-full flex items-center gap-3 rounded-xl border border-border p-4 text-left hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <m.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Approve / Reject notes dialog ── */}
      <Dialog open={!!decision} onOpenChange={(o) => { if (!o) { setDecision(null); setDecisionNotes(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{decision?.action === "approve" ? "Approve Bill" : "Reject Bill"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Notes {decision?.action === "reject" ? "(required)" : "(optional)"}</Label>
              <Textarea value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} rows={3}
                placeholder={decision?.action === "reject" ? "Why is this bill being rejected?" : "Optional approval notes"} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setDecision(null); setDecisionNotes(""); }}>Cancel</Button>
              <Button
                variant={decision?.action === "reject" ? "destructive" : "default"}
                onClick={submitDecision}
                disabled={approveStep.isPending || rejectStep.isPending}
              >
                {decision?.action === "approve" ? "Approve" : "Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bill detail drawer ── */}
      {selectedBillId && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedBillId(null)} />
          <div className="w-full max-w-lg bg-background border-l border-border overflow-y-auto">
            <div className="p-6 space-y-6">
              {!detailBill ? (
                <p className="text-sm text-muted-foreground">Loading bill…</p>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{detailBill.billNumber ?? `#${detailBill.id.slice(0, 8)}`}</h2>
                      <p className="text-sm text-muted-foreground">{vendorName(detailBill.vendorId)}</p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${(STATUS_META[detailBill.status] ?? STATUS_META.draft).bg} ${(STATUS_META[detailBill.status] ?? STATUS_META.draft).color}`}>
                      {(STATUS_META[detailBill.status] ?? STATUS_META.draft).label}
                    </span>
                  </div>

                  {/* amounts */}
                  <div className="rounded-xl border border-border divide-y divide-border text-sm">
                    <div className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">Subtotal</span><span>{formatNGN(detailBill.subtotalKobo ?? 0)}</span></div>
                    <div className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">Tax</span><span>{formatNGN(detailBill.taxKobo ?? 0)}</span></div>
                    <div className="flex justify-between px-4 py-2.5">
                      <span className="text-muted-foreground">WHT withheld</span>
                      <span className={(detailBill.whtKobo ?? 0) > 0 ? "text-amber-400" : ""}>{(detailBill.whtKobo ?? 0) > 0 ? `-${formatNGN(detailBill.whtKobo)}` : "—"}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2.5 font-semibold"><span>Total</span><span>{formatNGN(detailBill.totalKobo)}</span></div>
                    <div className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">Paid so far</span><span className="text-green-400">{formatNGN(detailBill.amountPaidKobo ?? 0)}</span></div>
                    <div className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">Due date</span><span>{fmtDate(detailBill.dueDate)}</span></div>
                  </div>

                  {/* actions */}
                  <div className="flex flex-wrap gap-2">
                    {["approved", "partially_paid"].includes(detailBill.status) && (
                      <Button size="sm" className="gap-2" onClick={() => setPayBillId(detailBill.id)}>
                        <Wallet className="w-4 h-4" /> Pay Bill
                      </Button>
                    )}
                    {detailBill.status === "pending_approval" && (
                      <>
                        <Button size="sm" variant="outline" className="gap-2 text-green-400" onClick={() => setDecision({ billId: detailBill.id, action: "approve" })}>
                          <ThumbsUp className="w-4 h-4" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-2 text-red-400" onClick={() => setDecision({ billId: detailBill.id, action: "reject" })}>
                          <ThumbsDown className="w-4 h-4" /> Reject
                        </Button>
                      </>
                    )}
                    {["draft", "extracted"].includes(detailBill.status) && (
                      <>
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => submitForApproval.mutate({ billId: detailBill.id })} disabled={submitForApproval.isPending}>
                          <Send className="w-4 h-4" /> Submit for Approval
                        </Button>
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => approveBill.mutate({ billId: detailBill.id })} disabled={approveBill.isPending}>
                          <CheckCircle2 className="w-4 h-4" /> Approve Directly
                        </Button>
                      </>
                    )}
                    {!["paid", "void", "rejected"].includes(detailBill.status) && (
                      <Button size="sm" variant="ghost" className="gap-2 text-muted-foreground"
                        onClick={() => { if (confirm("Void this bill? This cannot be undone.")) voidBill.mutate({ billId: detailBill.id }); }}
                        disabled={voidBill.isPending}>
                        <Ban className="w-4 h-4" /> Void
                      </Button>
                    )}
                  </div>

                  {/* line items */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><FileText className="w-4 h-4" /> Line Items</h3>
                    <div className="rounded-xl border border-border overflow-hidden">
                      {(detail?.lineItems ?? []).length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">No line items</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(detail?.lineItems ?? []).map((li: any) => (
                              <tr key={li.id}>
                                <td className="px-3 py-2">{li.description ?? "—"}</td>
                                <td className="px-3 py-2 text-right text-muted-foreground">{li.quantity ?? "—"}</td>
                                <td className="px-3 py-2 text-right text-muted-foreground">{li.unitPriceKobo != null ? formatNGN(li.unitPriceKobo) : "—"}</td>
                                <td className="px-3 py-2 text-right font-medium">{li.amountKobo != null ? formatNGN(li.amountKobo) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* payments */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payments</h3>
                    {(detail?.payments ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No payments yet</p>
                    ) : (
                      <div className="space-y-2">
                        {(detail?.payments ?? []).map((p: any) => (
                          <div key={p.id} className="rounded-xl border border-border p-3 text-sm flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">{formatNGN(p.amountKobo)} <span className="text-xs text-muted-foreground">via {p.fundingMethod}</span></p>
                              <p className="text-xs text-muted-foreground">
                                {p.status} · {fmtDate(p.createdAt)}{(p.feeKobo ?? 0) > 0 ? ` · fee ${formatNGN(p.feeKobo)}` : ""}
                              </p>
                            </div>
                            {p.status === "completed" && (
                              p.remittanceSentAt ? (
                                <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => resendAdvice.mutate({ apPaymentId: p.id })} disabled={resendAdvice.isPending}>
                                  <Send className="w-3 h-3" /> Resend advice
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => sendAdvice.mutate({ apPaymentId: p.id, idempotencyKey: crypto.randomUUID() })} disabled={sendAdvice.isPending}>
                                  <Send className="w-3 h-3" /> Send advice
                                </Button>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <Button variant="outline" className="w-full" onClick={() => setSelectedBillId(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
