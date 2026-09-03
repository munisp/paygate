// @ts-nocheck
/**
 * Direct Debit Mandates — list mandates, initiate email authorization,
 * activation charge, debit, pause/resume/deactivate, expiring list.
 */
import { useState } from "react";
import {
  Landmark, Plus, RefreshCw, PauseCircle, PlayCircle, Ban, Zap, CreditCard, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const STATUS_META: Record<string, { label: string; className: string }> = {
  active:     { label: "Active",     className: "text-green-400 border-green-500/30" },
  paused:     { label: "Paused",     className: "text-amber-400 border-amber-500/30" },
  deactivated:{ label: "Deactivated",className: "text-red-400 border-red-500/30" },
  pending:    { label: "Pending",    className: "text-blue-400 border-blue-500/30" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status ?? "unknown", className: "text-muted-foreground border-border" };
  return <Badge variant="outline" className={`text-xs ${meta.className}`}>{meta.label}</Badge>;
}

export default function DirectDebitMandates() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState("all");
  const [initOpen, setInitOpen] = useState(false);
  const [initForm, setInitForm] = useState({ email: "", callbackUrl: "", accountNumber: "", bankCode: "", address: "" });
  const [debitTarget, setDebitTarget] = useState<any | null>(null);
  const [debitForm, setDebitForm] = useState({ amount: "", reference: "" });

  const listInput = { status: status === "all" ? undefined : status };
  const { data, isLoading, refetch } = trpc.directDebit.listMandates.useQuery(listInput, { staleTime: 15_000 });
  const mandates: any[] = data?.mandates ?? data?.items ?? (Array.isArray(data) ? data : []);

  const { data: expiringData } = trpc.directDebit.listExpiring.useQuery({}, { staleTime: 60_000 });
  const expiring: any[] = expiringData?.mandates ?? expiringData?.items ?? (Array.isArray(expiringData) ? expiringData : []);

  const invalidate = () => {
    utils.directDebit.listMandates.invalidate();
    utils.directDebit.listExpiring.invalidate();
  };

  const mk = (msg: string, close?: () => void) => ({
    onSuccess: () => { toast.success(msg); close?.(); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const initiate = trpc.directDebit.initiateAuthorization.useMutation({
    onSuccess: (r: any) => {
      toast.success("Authorization email sent to customer");
      if (r?.redirectUrl) toast.info(`Redirect URL: ${r.redirectUrl}`);
      setInitOpen(false);
      setInitForm({ email: "", callbackUrl: "", accountNumber: "", bankCode: "", address: "" });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const activationCharge = trpc.directDebit.activationCharge.useMutation(mk("Activation charge triggered"));
  const debit = trpc.directDebit.debit.useMutation({
    onSuccess: () => {
      toast.success("Debit initiated");
      setDebitTarget(null);
      setDebitForm({ amount: "", reference: "" });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const pause = trpc.directDebit.pause.useMutation(mk("Mandate paused"));
  const resume = trpc.directDebit.resume.useMutation(mk("Mandate resumed"));
  const deactivate = trpc.directDebit.deactivate.useMutation(mk("Mandate deactivated"));

  const submitInitiate = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(initForm.email.trim())) { toast.error("Valid customer email is required"); return; }
    if (!initForm.callbackUrl.trim()) { toast.error("Callback URL is required"); return; }
    initiate.mutate({
      email: initForm.email.trim(),
      callbackUrl: initForm.callbackUrl.trim(),
      account: initForm.accountNumber.trim()
        ? { accountNumber: initForm.accountNumber.trim(), bankCode: initForm.bankCode.trim() || undefined }
        : undefined,
      address: initForm.address.trim() || undefined,
    });
  };

  const submitDebit = () => {
    const amountKobo = nairaToKobo(debitForm.amount);
    if (amountKobo <= 0) { toast.error("Enter a valid amount"); return; }
    const authCode = debitTarget.authorizationCode ?? debitTarget.authorization?.authorizationCode;
    if (!authCode) { toast.error("Mandate has no authorization code"); return; }
    debit.mutate({
      authorizationCode: authCode,
      email: debitTarget.email ?? debitTarget.customer?.email ?? "",
      amountKobo,
      reference: debitForm.reference.trim() || undefined,
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Direct Debit Mandates
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Recurring account debits authorized by your customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setInitOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Initiate Authorization
          </Button>
        </div>
      </div>

      {/* Expiring soon */}
      {expiring.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-amber-300">{expiring.length} mandate{expiring.length > 1 ? "s" : ""} expiring soon</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {expiring.slice(0, 6).map((m: any) => (
              <Badge key={m.id} variant="outline" className="text-xs text-amber-300 border-amber-500/30">
                {m.email ?? m.customer?.email ?? m.authorizationCode} — expires {fmtDate(m.expiresAt ?? m.expiryDate)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="deactivated">Deactivated</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
          </div>
        ) : mandates.length === 0 ? (
          <div className="p-12 text-center">
            <Landmark className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No mandates found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Initiate an authorization to email a customer a debit consent link</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expires</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mandates.map((m: any) => {
                  const id = m.id ?? m.mandateId;
                  const authCode = m.authorizationCode ?? m.authorization?.authorizationCode;
                  const isActive = m.status === "active";
                  return (
                    <tr key={id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{m.email ?? m.customer?.email ?? "—"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{authCode ?? ""}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {m.accountNumber ? `${m.accountNumber} · ${m.bankCode ?? m.bank ?? ""}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(m.expiresAt ?? m.expiryDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {isActive && (
                            <>
                              <Button variant="outline" size="sm" className="gap-1" onClick={() => { setDebitTarget(m); setDebitForm({ amount: "", reference: "" }); }}>
                                <CreditCard className="w-3 h-3" /> Debit
                              </Button>
                              <Button variant="ghost" size="sm" title="Pause" onClick={() => pause.mutate({ id })}>
                                <PauseCircle className="w-4 h-4 text-amber-400" />
                              </Button>
                            </>
                          )}
                          {m.status === "paused" && (
                            <Button variant="ghost" size="sm" title="Resume" onClick={() => resume.mutate({ id })}>
                              <PlayCircle className="w-4 h-4 text-green-400" />
                            </Button>
                          )}
                          {(m.status === "pending" || m.status === "paused") && (
                            <Button variant="ghost" size="sm" title="Trigger activation charge" onClick={() => activationCharge.mutate({ authorizationId: id })}>
                              <Zap className="w-4 h-4 text-blue-400" />
                            </Button>
                          )}
                          {m.status !== "deactivated" && (
                            <Button
                              variant="ghost" size="sm" title="Deactivate"
                              onClick={() => {
                                if (!authCode) { toast.error("Mandate has no authorization code"); return; }
                                if (window.confirm("Deactivate this mandate? This cannot be undone.")) deactivate.mutate({ authorizationCode: authCode });
                              }}
                            >
                              <Ban className="w-4 h-4 text-red-400" />
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

      {/* Initiate authorization dialog */}
      <Dialog open={initOpen} onOpenChange={setInitOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Initiate Mandate Authorization</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Paystack emails the customer a link to authorize direct debits from their account.</p>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Customer Email *</Label>
              <Input type="email" value={initForm.email} onChange={(e) => setInitForm({ ...initForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Callback URL *</Label>
              <Input value={initForm.callbackUrl} onChange={(e) => setInitForm({ ...initForm, callbackUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account Number (optional)</Label>
                <Input inputMode="numeric" maxLength={10} value={initForm.accountNumber} onChange={(e) => setInitForm({ ...initForm, accountNumber: e.target.value.replace(/\D/g, "") })} />
              </div>
              <div className="space-y-2">
                <Label>Bank Code</Label>
                <Input value={initForm.bankCode} onChange={(e) => setInitForm({ ...initForm, bankCode: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address (optional)</Label>
              <Input value={initForm.address} onChange={(e) => setInitForm({ ...initForm, address: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setInitOpen(false)}>Cancel</Button>
            <Button onClick={submitInitiate} disabled={initiate.isPending}>
              {initiate.isPending ? "Sending…" : "Send Authorization Email"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Debit dialog */}
      <Dialog open={!!debitTarget} onOpenChange={(o) => { if (!o) setDebitTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Debit Mandate</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Charge <span className="font-medium text-foreground">{debitTarget?.email ?? debitTarget?.customer?.email}</span> via their authorized mandate.</p>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Amount (₦) *</Label>
              <Input inputMode="decimal" value={debitForm.amount} onChange={(e) => setDebitForm({ ...debitForm, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Reference (optional)</Label>
              <Input value={debitForm.reference} onChange={(e) => setDebitForm({ ...debitForm, reference: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDebitTarget(null)}>Cancel</Button>
            <Button onClick={submitDebit} disabled={debit.isPending}>
              {debit.isPending ? "Charging…" : "Debit Now"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
