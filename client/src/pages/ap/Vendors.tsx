// @ts-nocheck
/**
 * AP Vendor Directory — vendor table (TIN, open balance, credit), 360° drawer
 * (bills, payments, credits, WHT profile, TIN validation), create/edit dialog
 * and apply-credit dialog.
 */
import { useState } from "react";
import {
  Users, Plus, RefreshCw, Search, Pencil, ShieldCheck, AlertTriangle,
  CheckCircle2, XCircle, CreditCard, FileText, Banknote, Wallet, Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const TIN_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  valid:      { label: "TIN Valid",      color: "text-green-400", bg: "bg-green-500/15", icon: CheckCircle2 },
  invalid:    { label: "TIN Invalid",    color: "text-red-400",   bg: "bg-red-500/15",   icon: XCircle },
  unverified: { label: "TIN Unverified", color: "text-amber-400", bg: "bg-amber-500/15", icon: AlertTriangle },
};

const CREDITABLE = ["draft", "extracted", "pending_approval", "approved", "scheduled", "partially_paid"];

type VendorForm = {
  name: string; contactName: string; email: string; phone: string;
  tin: string; paymentTerms: string; bankCode: string; accountNumber: string;
  accountName: string; whtRatePct: string; notes: string;
};
const EMPTY_VENDOR: VendorForm = {
  name: "", contactName: "", email: "", phone: "", tin: "", paymentTerms: "net30",
  bankCode: "", accountNumber: "", accountName: "", whtRatePct: "", notes: "",
};

export default function Vendors() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [vendorDialog, setVendorDialog] = useState<{ mode: "create" } | { mode: "edit"; vendorId: string } | null>(null);
  const [vendorForm, setVendorForm] = useState<VendorForm>(EMPTY_VENDOR);
  const [creditDialog, setCreditDialog] = useState(false);
  const [creditForm, setCreditForm] = useState({ creditId: "", billId: "", amount: "" });
  const [whtEdit, setWhtEdit] = useState<{ applicable: boolean; rate: string } | null>(null);

  // ── queries ──
  const { data, isLoading, refetch } = trpc.apVendorDirectory.listVendors.useQuery(
    { search: search.trim() || undefined, limit: 100 },
    { staleTime: 15_000 },
  );
  const vendors: any[] = data?.vendors ?? [];

  const { data: v360, refetch: refetch360 } = trpc.apVendorDirectory.getVendor360.useQuery(
    { vendorId: selectedVendorId! },
    { enabled: !!selectedVendorId },
  );

  const invalidate = () => {
    utils.apVendorDirectory.listVendors.invalidate();
    if (selectedVendorId) refetch360();
  };

  // ── mutations ──
  const createVendor = trpc.apVendorDirectory.createVendor.useMutation({
    onSuccess: () => { toast.success("Vendor created"); setVendorDialog(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateVendor = trpc.apVendorDirectory.updateVendor.useMutation({
    onSuccess: () => { toast.success("Vendor updated"); setVendorDialog(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const validateTin = trpc.taxCompliance.validateVendorTin.useMutation({
    onSuccess: (r: any) => {
      const meta = TIN_META[r?.status] ?? TIN_META.unverified;
      if (r?.status === "valid") toast.success(`TIN valid${r.vendorUpdated ? " — WHT profile updated from registry" : ""}`);
      else if (r?.status === "invalid") toast.error("TIN is invalid according to the tax registry");
      else toast.warning(`TIN could not be verified (${r?.reason ?? "service unreachable"})`);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setWhtProfile = trpc.taxCompliance.setVendorWhtProfile.useMutation({
    onSuccess: () => { toast.success("WHT profile updated"); setWhtEdit(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const applyCredit = trpc.apVendorDirectory.applyCreditToBill.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Applied ${formatNGN(r?.appliedKobo ?? 0)} credit to bill`);
      setCreditDialog(false);
      setCreditForm({ creditId: "", billId: "", amount: "" });
      invalidate();
      utils.apBillPay.listBills.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── vendor form ──
  const openCreate = () => { setVendorForm(EMPTY_VENDOR); setVendorDialog({ mode: "create" }); };
  const openEdit = () => {
    const v = v360?.vendor;
    if (!v) return;
    setVendorForm({
      name: v.name ?? "", contactName: v.contactName ?? "", email: v.email ?? "",
      phone: v.phone ?? "", tin: v.tin ?? "", paymentTerms: v.paymentTerms ?? "net30",
      bankCode: v.bankCode ?? "", accountNumber: v.accountNumber ?? "",
      accountName: v.accountName ?? "", whtRatePct: v.whtRatePct != null ? String(v.whtRatePct) : "",
      notes: v.notes ?? "",
    });
    setVendorDialog({ mode: "edit", vendorId: v.id });
  };

  const submitVendor = () => {
    if (!vendorForm.name.trim()) { toast.error("Vendor name is required"); return; }
    if (vendorForm.tin.trim() && !/^[0-9A-Za-z-]{8,32}$/.test(vendorForm.tin.trim())) {
      toast.error("TIN must be 8–32 alphanumeric characters (dashes allowed)");
      return;
    }
    const base = {
      name: vendorForm.name.trim(),
      contactName: vendorForm.contactName.trim() || undefined,
      email: vendorForm.email.trim() || undefined,
      phone: vendorForm.phone.trim() || undefined,
      tin: vendorForm.tin.trim() || undefined,
      paymentTerms: vendorForm.paymentTerms.trim() || undefined,
      bankCode: vendorForm.bankCode.trim() || undefined,
      accountNumber: vendorForm.accountNumber.trim() || undefined,
      accountName: vendorForm.accountName.trim() || undefined,
      whtRatePct: vendorForm.whtRatePct.trim() ? parseFloat(vendorForm.whtRatePct) : undefined,
      notes: vendorForm.notes.trim() || undefined,
    };
    if (vendorDialog?.mode === "create") createVendor.mutate(base);
    else if (vendorDialog?.mode === "edit") updateVendor.mutate({ vendorId: vendorDialog.vendorId, ...base });
  };

  const submitCredit = () => {
    const creditId = parseInt(creditForm.creditId, 10);
    const amountKobo = nairaToKobo(creditForm.amount);
    if (!creditId || !creditForm.billId || amountKobo <= 0) {
      toast.error("Pick a credit, a bill and an amount greater than zero");
      return;
    }
    applyCredit.mutate({
      creditId,
      billId: creditForm.billId,
      amountKobo,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const vendor = v360?.vendor;
  const whtProfile = v360?.whtProfile;
  const tinValidation = v360?.tinValidation;
  const tinMeta = tinValidation ? (TIN_META[tinValidation.status] ?? TIN_META.unverified) : null;
  const openCredits: any[] = v360?.openCredits ?? [];
  const creditableBills: any[] = (v360?.recentBills ?? []).filter(
    (b: any) => CREDITABLE.includes(b.status) && (b.totalKobo - (b.amountPaidKobo ?? 0)) > 0,
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Vendor Directory
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Suppliers, balances, credits, TIN & WHT profiles</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> New Vendor
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors…" className="pl-9" />
      </div>

      {/* Vendor table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading vendors…</div>
        ) : vendors.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No vendors found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add your first supplier to start paying bills</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">TIN</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open Balance</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lifetime Spend</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">WHT</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Terms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelectedVendorId(v.id)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.email ?? v.contactName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{v.tin ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{(v.openBalanceKobo ?? 0) > 0 ? formatNGN(v.openBalanceKobo) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {(v.openCreditKobo ?? 0) > 0 ? (
                        <span className="text-green-400 font-medium">{formatNGN(v.openCreditKobo)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatNGN(v.totalSpendKobo ?? 0)}</td>
                    <td className="px-4 py-3 text-center">
                      {v.isWhtApplicable ? (
                        <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
                          {v.whtRatePct != null ? `${v.whtRatePct}%` : "WHT"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{v.paymentTerms ?? "net30"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create / Edit vendor dialog ── */}
      <Dialog open={!!vendorDialog} onOpenChange={(o) => { if (!o) setVendorDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{vendorDialog?.mode === "create" ? "New Vendor" : "Edit Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Vendor Name *</Label>
              <Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={vendorForm.contactName} onChange={(e) => setVendorForm({ ...vendorForm, contactName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>TIN (Tax ID)</Label>
              <Input value={vendorForm.tin} onChange={(e) => setVendorForm({ ...vendorForm, tin: e.target.value })} placeholder="8–32 characters" />
            </div>
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Select value={vendorForm.paymentTerms} onValueChange={(v) => setVendorForm({ ...vendorForm, paymentTerms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["due_on_receipt", "net7", "net14", "net30", "net45", "net60"].map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>WHT Rate (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" value={vendorForm.whtRatePct} onChange={(e) => setVendorForm({ ...vendorForm, whtRatePct: e.target.value })} placeholder="e.g. 5" />
            </div>
            <div className="space-y-2">
              <Label>Bank Code</Label>
              <Input value={vendorForm.bankCode} onChange={(e) => setVendorForm({ ...vendorForm, bankCode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input value={vendorForm.accountNumber} onChange={(e) => setVendorForm({ ...vendorForm, accountNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input value={vendorForm.accountName} onChange={(e) => setVendorForm({ ...vendorForm, accountName: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Input value={vendorForm.notes} onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setVendorDialog(null)}>Cancel</Button>
            <Button onClick={submitVendor} disabled={createVendor.isPending || updateVendor.isPending}>
              {vendorDialog?.mode === "create" ? "Create Vendor" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Apply credit dialog ── */}
      <Dialog open={creditDialog} onOpenChange={setCreditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Vendor Credit to Bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Open Credit</Label>
              <Select value={creditForm.creditId} onValueChange={(v) => setCreditForm({ ...creditForm, creditId: v })}>
                <SelectTrigger><SelectValue placeholder="Select credit" /></SelectTrigger>
                <SelectContent>
                  {openCredits.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {formatNGN(c.remainingKobo)} remaining · {fmtDate(c.createdAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bill (outstanding, same vendor)</Label>
              <Select value={creditForm.billId} onValueChange={(v) => setCreditForm({ ...creditForm, billId: v })}>
                <SelectTrigger><SelectValue placeholder="Select bill" /></SelectTrigger>
                <SelectContent>
                  {creditableBills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.billNumber ?? `#${b.id.slice(0, 8)}`} — {formatNGN(b.totalKobo - (b.amountPaidKobo ?? 0))} due
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₦)</Label>
              <Input type="number" min="0" step="0.01" value={creditForm.amount} onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreditDialog(false)}>Cancel</Button>
              <Button onClick={submitCredit} disabled={applyCredit.isPending}>
                {applyCredit.isPending ? "Applying…" : "Apply Credit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Vendor 360 drawer ── */}
      {selectedVendorId && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => { setSelectedVendorId(null); setWhtEdit(null); }} />
          <div className="w-full max-w-xl bg-background border-l border-border overflow-y-auto">
            <div className="p-6 space-y-6">
              {!vendor ? (
                <p className="text-sm text-muted-foreground">Loading vendor…</p>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{vendor.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {vendor.contactName ?? ""}{vendor.email ? ` · ${vendor.email}` : ""}{vendor.phone ? ` · ${vendor.phone}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1" onClick={openEdit}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                  </div>

                  {/* balances */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Open Balance", value: formatNGN(vendor.openBalanceKobo ?? 0), icon: Banknote },
                      { label: "Credit Balance", value: formatNGN(vendor.creditBalanceKobo ?? 0), icon: Wallet },
                      { label: "Open Credits", value: String(openCredits.length), icon: CreditCard },
                    ].map((kpi) => (
                      <div key={kpi.label} className="bg-card rounded-xl border border-border p-3">
                        <div className="flex items-center gap-2">
                          <kpi.icon className="w-4 h-4 text-primary" />
                          <div>
                            <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                            <p className="text-sm font-bold text-foreground">{kpi.value}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* TIN & WHT */}
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" /> TIN & WHT Profile
                      </h3>
                      {vendor.tin && (
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                          onClick={() => validateTin.mutate({ vendorId: vendor.id })} disabled={validateTin.isPending}>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {validateTin.isPending ? "Validating…" : "Validate TIN"}
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">TIN:</span>
                      <span className="font-mono">{vendor.tin ?? "—"}</span>
                      {tinMeta && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tinMeta.bg} ${tinMeta.color}`}>
                          <tinMeta.icon className="w-3 h-3" /> {tinMeta.label}
                        </span>
                      )}
                    </div>
                    {whtEdit ? (
                      <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="wht-applicable" className="cursor-pointer text-sm">WHT applicable</Label>
                          <Switch id="wht-applicable" checked={whtEdit.applicable} onCheckedChange={(v) => setWhtEdit({ ...whtEdit, applicable: v })} />
                        </div>
                        {whtEdit.applicable && (
                          <div className="space-y-1">
                            <Label className="text-sm">Rate (%)</Label>
                            <Input type="number" min="0" max="100" step="0.01" value={whtEdit.rate} onChange={(e) => setWhtEdit({ ...whtEdit, rate: e.target.value })} />
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setWhtEdit(null)}>Cancel</Button>
                          <Button size="sm"
                            onClick={() => setWhtProfile.mutate({
                              vendorId: vendor.id,
                              isWhtApplicable: whtEdit.applicable,
                              whtRatePct: whtEdit.applicable && whtEdit.rate.trim() ? parseFloat(whtEdit.rate) : null,
                            })}
                            disabled={setWhtProfile.isPending}>
                            Save WHT Profile
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Percent className="w-3.5 h-3.5" />
                          {whtProfile?.isWhtApplicable
                            ? `WHT applicable at ${whtProfile.whtRatePct ?? "—"}%`
                            : "WHT not applicable"}
                        </span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => setWhtEdit({ applicable: Boolean(whtProfile?.isWhtApplicable), rate: whtProfile?.whtRatePct != null ? String(whtProfile.whtRatePct) : "" })}>
                          Change
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* actions */}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-2" disabled={openCredits.length === 0 || creditableBills.length === 0}
                      onClick={() => setCreditDialog(true)}>
                      <Wallet className="w-4 h-4" /> Apply Credit to Bill
                    </Button>
                  </div>

                  {/* open credits */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Open Credits</h3>
                    {openCredits.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No open credits</p>
                    ) : (
                      <div className="space-y-2">
                        {openCredits.map((c) => (
                          <div key={c.id} className="rounded-xl border border-border px-4 py-2.5 text-sm flex justify-between">
                            <span className="text-muted-foreground">Credit #{c.id} · {fmtDate(c.createdAt)}</span>
                            <span className="font-medium text-green-400">{formatNGN(c.remainingKobo)} remaining</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* recent bills */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><FileText className="w-4 h-4" /> Recent Bills</h3>
                    {(v360?.recentBills ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No bills yet</p>
                    ) : (
                      <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Bill</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Due</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(v360?.recentBills ?? []).slice(0, 10).map((b: any) => (
                              <tr key={b.id}>
                                <td className="px-3 py-2">{b.billNumber ?? `#${b.id.slice(0, 8)}`}</td>
                                <td className="px-3 py-2 text-right font-medium">{formatNGN(b.totalKobo)}</td>
                                <td className="px-3 py-2 text-center">
                                  <Badge variant="outline" className="text-xs">{b.status.replace(/_/g, " ")}</Badge>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground text-xs">{fmtDate(b.dueDate)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* recent payments */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Recent Payments</h3>
                    {(v360?.recentPayments ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No payments yet</p>
                    ) : (
                      <div className="space-y-2">
                        {(v360?.recentPayments ?? []).slice(0, 10).map((r: any) => (
                          <div key={r.payment.id} className="rounded-xl border border-border px-4 py-2.5 text-sm flex justify-between">
                            <span className="text-muted-foreground">
                              {r.billNumber ?? `#${r.billId.slice(0, 8)}`} · {r.payment.fundingMethod} · {fmtDate(r.payment.createdAt)}
                            </span>
                            <span className="font-medium">{formatNGN(r.payment.amountKobo)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <Button variant="outline" className="w-full" onClick={() => { setSelectedVendorId(null); setWhtEdit(null); }}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
