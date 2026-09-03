// @ts-nocheck
/**
 * Dedicated Virtual Accounts — list/assign DVAs, provider availability,
 * assign wizard, requery, deactivate, split attach/detach.
 */
import { useState } from "react";
import {
  Building2, Plus, RefreshCw, Search, Ban, Link2, Unlink2, Landmark, UserPlus,
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

function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_ASSIGN = {
  email: "", firstName: "", lastName: "", phone: "", preferredBank: "", country: "NG",
  accountNumber: "", bvn: "", bankCode: "",
};
const EMPTY_CREATE = { customer: "", preferredBank: "", splitCode: "" };

export default function DedicatedAccounts() {
  const utils = trpc.useUtils();
  const [activeOnly, setActiveOnly] = useState(false);
  const [currency, setCurrency] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignStep, setAssignStep] = useState(0);
  const [assignForm, setAssignForm] = useState({ ...EMPTY_ASSIGN });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE });
  const [requeryOpen, setRequeryOpen] = useState(false);
  const [requeryForm, setRequeryForm] = useState({ accountNumber: "", providerSlug: "", date: "" });
  const [splitTarget, setSplitTarget] = useState<any | null>(null);
  const [splitCode, setSplitCode] = useState("");

  const listInput = {
    active: activeOnly ? true : undefined,
    currency: currency === "all" ? undefined : currency,
    providerSlug: providerFilter === "all" ? undefined : providerFilter,
    customer: customerFilter.trim() || undefined,
  };
  const { data, isLoading, refetch } = trpc.dva.list.useQuery(listInput, { staleTime: 15_000 });
  const accounts: any[] = data?.accounts ?? data?.items ?? (Array.isArray(data) ? data : []);

  const { data: providersData } = trpc.dva.availableProviders.useQuery({}, { staleTime: 60_000 });
  const providers: any[] = providersData?.providers ?? (Array.isArray(providersData) ? providersData : []);

  const invalidate = () => {
    utils.dva.list.invalidate();
    utils.dva.availableProviders.invalidate();
  };

  const assign = trpc.dva.assign.useMutation({
    onSuccess: () => {
      toast.success("Dedicated account assigned to customer");
      setAssignOpen(false);
      setAssignStep(0);
      setAssignForm({ ...EMPTY_ASSIGN });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const create = trpc.dva.create.useMutation({
    onSuccess: () => {
      toast.success("Dedicated account created");
      setCreateOpen(false);
      setCreateForm({ ...EMPTY_CREATE });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deactivate = trpc.dva.deactivate.useMutation({
    onSuccess: () => { toast.success("Account deactivated"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const requery = trpc.dva.requery.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Requery complete — ${r?.newTransactions ?? r?.matched ?? 0} new transaction(s) found`);
      setRequeryOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const addSplit = trpc.dva.addSplit.useMutation({
    onSuccess: () => {
      toast.success("Split attached to account");
      setSplitTarget(null);
      setSplitCode("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeSplit = trpc.dva.removeSplit.useMutation({
    onSuccess: () => { toast.success("Split removed"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const submitAssign = () => {
    if (assignStep === 0) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(assignForm.email.trim())) { toast.error("Valid email is required"); return; }
      if (!assignForm.firstName.trim() || !assignForm.lastName.trim()) { toast.error("First and last name are required"); return; }
      if (!/^\+?\d{7,15}$/.test(assignForm.phone.trim())) { toast.error("Valid phone number is required (e.g. +234…)" ); return; }
      setAssignStep(1);
      return;
    }
    if (!assignForm.preferredBank) { toast.error("Choose a preferred bank/provider"); return; }
    if (assignForm.accountNumber.trim() && !/^\d{10}$/.test(assignForm.accountNumber.trim())) {
      toast.error("Account number must be 10 digits");
      return;
    }
    if (assignForm.bvn.trim() && !/^\d{11}$/.test(assignForm.bvn.trim())) { toast.error("BVN must be 11 digits"); return; }
    assign.mutate({
      email: assignForm.email.trim(),
      firstName: assignForm.firstName.trim(),
      lastName: assignForm.lastName.trim(),
      phone: assignForm.phone.trim(),
      preferredBank: assignForm.preferredBank,
      country: assignForm.country,
      accountNumber: assignForm.accountNumber.trim() || undefined,
      bvn: assignForm.bvn.trim() || undefined,
      bankCode: assignForm.bankCode.trim() || undefined,
    });
  };

  const submitCreate = () => {
    if (!createForm.customer.trim()) { toast.error("Customer (email or code) is required"); return; }
    if (!createForm.preferredBank) { toast.error("Choose a preferred bank/provider"); return; }
    create.mutate({
      customer: createForm.customer.trim(),
      preferredBank: createForm.preferredBank,
      splitCode: createForm.splitCode.trim() || undefined,
    });
  };

  const submitRequery = () => {
    if (!/^\d{10}$/.test(requeryForm.accountNumber.trim())) { toast.error("Account number must be 10 digits"); return; }
    if (!requeryForm.providerSlug.trim()) { toast.error("Provider slug is required"); return; }
    if (!requeryForm.date) { toast.error("Date is required"); return; }
    requery.mutate({
      accountNumber: requeryForm.accountNumber.trim(),
      providerSlug: requeryForm.providerSlug.trim(),
      date: requeryForm.date,
    });
  };

  const submitAddSplit = () => {
    const acct = splitTarget?.accountNumber ?? splitTarget?.account?.accountNumber;
    if (!acct) { toast.error("Account number not found on this row"); return; }
    if (!splitCode.trim()) { toast.error("Split code is required"); return; }
    addSplit.mutate({ accountNumber: acct, splitCode: splitCode.trim() });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Dedicated Virtual Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Persistent bank account numbers assigned to your customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRequeryOpen(true)} className="gap-2">
            <Search className="w-4 h-4" /> Requery
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Create for Customer
          </Button>
          <Button size="sm" onClick={() => setAssignOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" /> Assign Account
          </Button>
        </div>
      </div>

      {/* Providers */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Landmark className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground text-sm">Available Providers</h2>
        </div>
        {providers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No provider information available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {providers.map((p: any) => {
              const slug = p.providerSlug ?? p.slug ?? p.id;
              const available = p.available ?? p.active ?? true;
              return (
                <Badge
                  key={slug}
                  variant="outline"
                  className={`text-xs ${available ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"}`}
                >
                  {p.name ?? slug} {available ? "" : "(unavailable)"}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {["NGN", "USD", "GHS", "KES"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((p: any) => {
                const slug = p.providerSlug ?? p.slug ?? p.id;
                return <SelectItem key={slug} value={slug}>{p.name ?? slug}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Customer</Label>
          <Input className="w-48" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder="email or code" />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} id="active-only" />
          <Label htmlFor="active-only" className="text-xs">Active only</Label>
        </div>
      </div>

      {/* Accounts table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No dedicated accounts</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Assign account numbers so customers can pay you by bank transfer</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Split</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((a: any) => {
                  const id = a.id ?? a.accountId;
                  const acctNum = a.accountNumber ?? a.account?.accountNumber;
                  const isActive = a.active ?? a.status === "active";
                  return (
                    <tr key={id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-sm font-semibold text-foreground">{acctNum ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{a.accountName ?? a.account?.accountName ?? ""} · {a.bankName ?? a.bank?.name ?? ""}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{a.customerEmail ?? a.customer?.email ?? a.customer ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{a.providerSlug ?? a.provider ?? "—"}</td>
                      <td className="px-4 py-3">
                        {a.splitCode ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs font-mono">{a.splitCode}</Badge>
                            <button
                              className="text-red-400/70 hover:text-red-400" title="Remove split"
                              onClick={() => { if (acctNum && window.confirm("Remove split from this account?")) removeSplit.mutate({ accountNumber: acctNum }); }}
                            >
                              <Unlink2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => { setSplitTarget(a); setSplitCode(""); }}>
                            <Link2 className="w-3 h-3" /> Attach
                          </Button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`text-xs ${isActive ? "text-green-400 border-green-500/30" : "text-muted-foreground border-border"}`}>
                          {isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isActive && (
                          <Button
                            variant="ghost" size="sm" title="Deactivate"
                            onClick={() => { if (window.confirm(`Deactivate account ${acctNum}?`)) deactivate.mutate({ id }); }}
                          >
                            <Ban className="w-4 h-4 text-red-400" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign wizard */}
      <Dialog open={assignOpen} onOpenChange={(o) => { if (!o) { setAssignOpen(false); setAssignStep(0); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Dedicated Account — Step {assignStep + 1} of 2</DialogTitle>
          </DialogHeader>
          {assignStep === 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Customer Email *</Label>
                <Input type="email" value={assignForm.email} onChange={(e) => setAssignForm({ ...assignForm, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input value={assignForm.firstName} onChange={(e) => setAssignForm({ ...assignForm, firstName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input value={assignForm.lastName} onChange={(e) => setAssignForm({ ...assignForm, lastName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone *</Label>
                  <Input value={assignForm.phone} onChange={(e) => setAssignForm({ ...assignForm, phone: e.target.value })} placeholder="+234…" />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={assignForm.country} onValueChange={(v) => setAssignForm({ ...assignForm, country: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["NG", "GH", "KE", "ZA"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Preferred Bank / Provider *</Label>
                <Select value={assignForm.preferredBank} onValueChange={(v) => setAssignForm({ ...assignForm, preferredBank: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose provider…" /></SelectTrigger>
                  <SelectContent>
                    {providers.map((p: any) => {
                      const slug = p.providerSlug ?? p.slug ?? p.id;
                      return <SelectItem key={slug} value={slug}>{p.name ?? slug}</SelectItem>;
                    })}
                    {providers.length === 0 && <SelectItem value="wema-bank">Wema Bank</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Number (optional)</Label>
                  <Input inputMode="numeric" maxLength={10} value={assignForm.accountNumber} onChange={(e) => setAssignForm({ ...assignForm, accountNumber: e.target.value.replace(/\D/g, "") })} />
                </div>
                <div className="space-y-2">
                  <Label>Bank Code</Label>
                  <Input value={assignForm.bankCode} onChange={(e) => setAssignForm({ ...assignForm, bankCode: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>BVN (optional)</Label>
                <Input inputMode="numeric" maxLength={11} value={assignForm.bvn} onChange={(e) => setAssignForm({ ...assignForm, bvn: e.target.value.replace(/\D/g, "") })} />
              </div>
            </div>
          )}
          <div className="flex justify-between mt-4">
            <Button variant="outline" onClick={() => (assignStep === 0 ? setAssignOpen(false) : setAssignStep(0))}>
              {assignStep === 0 ? "Cancel" : "Back"}
            </Button>
            <Button onClick={submitAssign} disabled={assign.isPending}>
              {assignStep === 0 ? "Next" : assign.isPending ? "Assigning…" : "Assign Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create for existing customer */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Dedicated Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer (email or code) *</Label>
              <Input value={createForm.customer} onChange={(e) => setCreateForm({ ...createForm, customer: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Preferred Bank / Provider *</Label>
              <Select value={createForm.preferredBank} onValueChange={(v) => setCreateForm({ ...createForm, preferredBank: v })}>
                <SelectTrigger><SelectValue placeholder="Choose provider…" /></SelectTrigger>
                <SelectContent>
                  {providers.map((p: any) => {
                    const slug = p.providerSlug ?? p.slug ?? p.id;
                    return <SelectItem key={slug} value={slug}>{p.name ?? slug}</SelectItem>;
                  })}
                  {providers.length === 0 && <SelectItem value="wema-bank">Wema Bank</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Split Code (optional)</Label>
              <Input value={createForm.splitCode} onChange={(e) => setCreateForm({ ...createForm, splitCode: e.target.value })} placeholder="SPL_xxxx" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Requery dialog */}
      <Dialog open={requeryOpen} onOpenChange={setRequeryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Requery Account Transactions</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Pull any missed bank transfer notifications for an account on a given date.</p>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Account Number *</Label>
              <Input inputMode="numeric" maxLength={10} value={requeryForm.accountNumber} onChange={(e) => setRequeryForm({ ...requeryForm, accountNumber: e.target.value.replace(/\D/g, "") })} />
            </div>
            <div className="space-y-2">
              <Label>Provider Slug *</Label>
              <Input value={requeryForm.providerSlug} onChange={(e) => setRequeryForm({ ...requeryForm, providerSlug: e.target.value })} placeholder="e.g. wema-bank" />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={requeryForm.date} onChange={(e) => setRequeryForm({ ...requeryForm, date: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setRequeryOpen(false)}>Cancel</Button>
            <Button onClick={submitRequery} disabled={requery.isPending}>
              {requery.isPending ? "Requerying…" : "Requery"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attach split dialog */}
      <Dialog open={!!splitTarget} onOpenChange={(o) => { if (!o) setSplitTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Attach Split</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Split incoming transfers to <span className="font-mono">{splitTarget?.accountNumber ?? splitTarget?.account?.accountNumber}</span> across a split group.
          </p>
          <div className="space-y-2 mt-2">
            <Label>Split Code *</Label>
            <Input value={splitCode} onChange={(e) => setSplitCode(e.target.value)} placeholder="SPL_xxxx" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setSplitTarget(null)}>Cancel</Button>
            <Button onClick={submitAddSplit} disabled={addSplit.isPending}>Attach Split</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
