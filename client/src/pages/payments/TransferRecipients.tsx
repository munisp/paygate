// @ts-nocheck
/**
 * Transfer Recipients — recipient CRUD + CSV bulk create, transfer balances,
 * balance ledger, and OTP (transfer confirmation) settings card.
 */
import { useState } from "react";
import {
  Users, Plus, RefreshCw, Trash2, Pencil, Upload, Wallet, ShieldCheck, ShieldOff, KeyRound, ListOrdered,
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

function formatMoney(kobo: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format((kobo ?? 0) / 100);
}
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const RECIPIENT_TYPES = ["nuban", "mobile_money", "basa", "authorization"];
const EMPTY_FORM = {
  type: "nuban", name: "", accountNumber: "", bankCode: "", currency: "NGN", email: "", description: "", authorizationCode: "",
};

export default function TransferRecipients() {
  const utils = trpc.useUtils();
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; rec: any } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendCode, setResendCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const listInput = { from: from || undefined, to: to || undefined };
  const { data, isLoading, refetch } = trpc.transferRecipients.list.useQuery(listInput, { staleTime: 15_000 });
  const recipients: any[] = data?.recipients ?? data?.items ?? (Array.isArray(data) ? data : []);

  const { data: balancesData } = trpc.transferRecipients.getBalances.useQuery({}, { staleTime: 30_000 });
  const balances: any[] = balancesData?.balances ?? (Array.isArray(balancesData) ? balancesData : []);

  const { data: ledgerData, refetch: refetchLedger } = trpc.transferRecipients.getBalanceLedger.useQuery({}, { staleTime: 30_000 });
  const ledger: any[] = ledgerData?.entries ?? ledgerData?.items ?? (Array.isArray(ledgerData) ? ledgerData : []);

  const { data: settings } = trpc.transferRecipients.getTransferSettings.useQuery({}, { staleTime: 30_000 });
  const otpDisabled: boolean = !!(settings?.otpDisabled ?? settings?.disableOtp ?? false);

  const invalidate = () => {
    utils.transferRecipients.list.invalidate();
    utils.transferRecipients.getBalances.invalidate();
    utils.transferRecipients.getBalanceLedger.invalidate();
    utils.transferRecipients.getTransferSettings.invalidate();
  };

  const create = trpc.transferRecipients.create.useMutation({
    onSuccess: () => { toast.success("Recipient created"); closeDialog(); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const bulkCreate = trpc.transferRecipients.bulkCreate.useMutation({
    onSuccess: (r: any) => {
      const ok = r?.successCount ?? r?.created ?? 0;
      const errs: any[] = r?.errors ?? [];
      toast.success(`Bulk create finished — ${ok} recipient(s) created${errs.length ? `, ${errs.length} failed` : ""}`);
      if (errs.length) toast.warning(`First error: ${errs[0]?.message ?? JSON.stringify(errs[0])}`);
      setBulkOpen(false);
      setBulkCsv("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.transferRecipients.update.useMutation({
    onSuccess: () => { toast.success("Recipient updated"); closeDialog(); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.transferRecipients.delete.useMutation({
    onSuccess: () => { toast.success("Recipient deleted"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const resendOtp = trpc.transferRecipients.resendOtp.useMutation({
    onSuccess: () => toast.success("OTP resent for transfer"),
    onError: (e) => toast.error(e.message),
  });
  const disableOtp = trpc.transferRecipients.disableOtp.useMutation({
    onSuccess: () => { toast.success("OTP sent to confirm disabling transfer OTP"); setOtpOpen(true); },
    onError: (e) => toast.error(e.message),
  });
  const finalizeDisableOtp = trpc.transferRecipients.finalizeDisableOtp.useMutation({
    onSuccess: () => { toast.success("Transfer OTP disabled"); setOtpOpen(false); setOtpCode(""); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const enableOtp = trpc.transferRecipients.enableOtp.useMutation({
    onSuccess: () => { toast.success("Transfer OTP enabled"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const closeDialog = () => { setDialog(null); setForm({ ...EMPTY_FORM }); };

  const openEdit = (r: any) => {
    setForm({
      type: r.type ?? "nuban",
      name: r.name ?? "",
      accountNumber: r.details?.accountNumber ?? r.accountNumber ?? "",
      bankCode: r.details?.bankCode ?? r.bankCode ?? "",
      currency: r.currency ?? "NGN",
      email: r.email ?? "",
      description: r.description ?? "",
      authorizationCode: "",
    });
    setDialog({ mode: "edit", rec: r });
  };

  const submit = () => {
    if (!form.name.trim()) { toast.error("Recipient name is required"); return; }
    if (dialog?.mode === "create") {
      if (form.type === "nuban") {
        if (!/^\d{10}$/.test(form.accountNumber.trim())) { toast.error("Account number must be 10 digits"); return; }
        if (!form.bankCode.trim()) { toast.error("Bank code is required for NUBAN recipients"); return; }
      }
      create.mutate({
        type: form.type,
        name: form.name.trim(),
        accountNumber: form.accountNumber.trim() || undefined,
        bankCode: form.bankCode.trim() || undefined,
        currency: form.currency || undefined,
        email: form.email.trim() || undefined,
        description: form.description.trim() || undefined,
        authorizationCode: form.authorizationCode.trim() || undefined,
      });
    } else if (dialog?.mode === "edit") {
      update.mutate({
        idOrCode: dialog.rec.id ?? dialog.rec.recipientCode,
        name: form.name.trim(),
        email: form.email.trim() || undefined,
      });
    }
  };

  const submitBulk = () => {
    const rows = bulkCsv.split("\n").map((l) => l.trim()).filter(Boolean);
    const batch: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const [type, name, accountNumber, bankCode] = rows[i].split(",").map((s) => (s ?? "").trim());
      if (!type || !name) { toast.error(`Row ${i + 1}: type and name are required`); return; }
      if (!RECIPIENT_TYPES.includes(type)) { toast.error(`Row ${i + 1}: unknown type "${type}" (${RECIPIENT_TYPES.join(" / ")})`); return; }
      if (type === "nuban" && (!/^\d{10}$/.test(accountNumber) || !bankCode)) {
        toast.error(`Row ${i + 1}: NUBAN rows need a 10-digit account and bank code`);
        return;
      }
      batch.push({ type, name, accountNumber: accountNumber || undefined, bankCode: bankCode || undefined, currency: "NGN" });
    }
    if (batch.length === 0) { toast.error("Paste at least one CSV row"); return; }
    bulkCreate.mutate({ batch });
  };

  const idOf = (r: any) => r.id ?? r.recipientCode;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Transfer Recipients
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Beneficiaries for payouts, balances and transfer OTP settings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} className="gap-2">
            <Upload className="w-4 h-4" /> Bulk Create
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchLedger(); }} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setDialog({ mode: "create" })} className="gap-2">
            <Plus className="w-4 h-4" /> New Recipient
          </Button>
        </div>
      </div>

      {/* Balances + OTP settings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Transfer Balances</h2>
          </div>
          {balances.length === 0 ? (
            <p className="text-xs text-muted-foreground">No balance information available.</p>
          ) : (
            <div className="flex flex-wrap gap-6">
              {balances.map((b: any, i: number) => (
                <div key={i}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{b.currency ?? "NGN"}</p>
                  <p className="text-xl font-bold text-foreground">{formatMoney(b.balanceKobo ?? b.balance ?? 0, b.currency ?? "NGN")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            {otpDisabled ? <ShieldOff className="w-4 h-4 text-amber-400" /> : <ShieldCheck className="w-4 h-4 text-green-400" />}
            <h2 className="font-semibold text-foreground text-sm">Transfer OTP</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {otpDisabled
              ? "Transfers are finalized WITHOUT an OTP. Not recommended for production."
              : "Transfers require an OTP before finalization."}
          </p>
          <div className="flex gap-2">
            {otpDisabled ? (
              <Button variant="outline" size="sm" onClick={() => enableOtp.mutate({})} disabled={enableOtp.isPending}>Enable OTP</Button>
            ) : (
              <Button variant="outline" size="sm" className="text-amber-400 border-amber-500/30" onClick={() => disableOtp.mutate({})} disabled={disableOtp.isPending}>
                Disable OTP
              </Button>
            )}
          </div>
          {!otpDisabled && (
            <div className="space-y-2 pt-1">
              <Label className="text-xs">Resend OTP for a pending transfer</Label>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="TRF_xxx transfer code"
                  value={resendCode}
                  onChange={(e) => setResendCode(e.target.value)}
                />
                <Button
                  variant="outline" size="sm" className="shrink-0"
                  disabled={resendOtp.isPending || !resendCode.trim()}
                  onClick={() => resendOtp.mutate({ transferCode: resendCode.trim() })}
                >
                  Resend
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {/* Recipients table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
          </div>
        ) : recipients.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No recipients yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add a recipient to start making transfers</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipient</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Currency</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recipients.map((r: any) => (
                  <tr key={idOf(r)} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{r.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{r.recipientCode ?? r.id}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="text-xs">{r.type ?? "nuban"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {(r.details?.accountNumber ?? r.accountNumber)
                        ? `${r.details?.accountNumber ?? r.accountNumber} · ${r.details?.bankName ?? r.details?.bankCode ?? r.bankCode ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.currency ?? "NGN"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" title="Edit" onClick={() => openEdit(r)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" title="Delete"
                          onClick={() => { if (window.confirm(`Delete recipient "${r.name}"?`)) del.mutate({ idOrCode: idOf(r) }); }}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Balance ledger */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
          <ListOrdered className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Balance Ledger</h2>
        </div>
        {ledger.length === 0 ? (
          <p className="p-6 text-xs text-muted-foreground text-center">No ledger entries.</p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledger.map((e: any, i: number) => (
                  <tr key={e.id ?? i}>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(e.createdAt)}</td>
                    <td className="px-4 py-2 text-xs">{e.description ?? e.reason ?? "—"}</td>
                    <td className={`px-4 py-2 text-right text-xs font-semibold ${(e.amountKobo ?? e.amount ?? 0) < 0 ? "text-red-400" : "text-green-400"}`}>
                      {formatMoney(e.amountKobo ?? e.amount ?? 0, e.currency ?? "NGN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit recipient dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New Recipient" : "Edit Recipient"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {dialog?.mode === "create" && (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECIPIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {dialog?.mode === "create" && form.type === "nuban" && (
              <>
                <div className="space-y-2">
                  <Label>Account Number *</Label>
                  <Input inputMode="numeric" maxLength={10} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, "") })} />
                </div>
                <div className="space-y-2">
                  <Label>Bank Code *</Label>
                  <Input value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} placeholder="e.g. 058" />
                </div>
              </>
            )}
            {dialog?.mode === "create" && form.type === "authorization" && (
              <div className="space-y-2 col-span-2">
                <Label>Authorization Code *</Label>
                <Input value={form.authorizationCode} onChange={(e) => setForm({ ...form, authorizationCode: e.target.value })} placeholder="AUTH_xxx" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            {dialog?.mode === "create" && (
              <>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["NGN", "USD", "GHS", "KES"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {dialog?.mode === "create" ? "Create Recipient" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk create dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Bulk Create Recipients</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            One recipient per line: <code className="bg-muted px-1 rounded">type,name,account_number,bank_code</code>
          </p>
          <Textarea
            className="min-h-[180px] font-mono text-xs"
            value={bulkCsv}
            onChange={(e) => setBulkCsv(e.target.value)}
            placeholder={"nuban,Ada Lovelace,0123456789,058\nnuban,John Doe,0987654321,044"}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={submitBulk} disabled={bulkCreate.isPending}>
              {bulkCreate.isPending ? "Creating…" : "Create Recipients"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm disable OTP dialog */}
      <Dialog open={otpOpen} onOpenChange={(o) => { if (!o) { setOtpOpen(false); setOtpCode(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Confirm Disable OTP</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Enter the OTP we sent to confirm disabling transfer OTP.</p>
          <Input inputMode="numeric" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit OTP" maxLength={8} />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setOtpOpen(false); setOtpCode(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={finalizeDisableOtp.isPending || otpCode.length < 4}
              onClick={() => finalizeDisableOtp.mutate({ otp: otpCode })}
            >
              Disable OTP
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
