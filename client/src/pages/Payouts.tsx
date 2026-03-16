import { useState, useRef, useMemo } from "react";
import { ArrowUpRight, Plus, RefreshCw, Upload, Download, CheckCircle, XCircle, FileText, Clock, ShieldAlert, Settings2, UserCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed:        "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending:          "bg-amber-50 text-amber-700 border-amber-200",
    pending_approval: "bg-purple-50 text-purple-700 border-purple-200",
    processing:       "bg-blue-50 text-blue-700 border-blue-200",
    failed:           "bg-red-50 text-red-700 border-red-200",
    rejected:         "bg-red-50 text-red-700 border-red-200",
    cancelled:        "bg-gray-50 text-gray-600 border-gray-200",
  };
  const label = status === "pending_approval" ? "awaiting approval" : status;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.pending}`}>{label}</span>;
}

type BulkRow = { amount: number; currency: string; bankCode?: string; accountNumber?: string; accountName?: string; narration?: string };
type BulkResult = { index: number; success: boolean; id?: string; error?: string };

function parseCsv(text: string): { rows: BulkRow[]; errors: string[] } {
  const lines = text.trim().split("\n");
  const errors: string[] = [];
  const rows: BulkRow[] = [];
  // Skip header row if present
  const start = lines[0]?.toLowerCase().includes("amount") ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const [amountStr, currency = "NGN", bankCode, accountNumber, accountName, narration] = cols;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < 100) {
      errors.push(`Row ${i + 1}: invalid amount "${amountStr}" (minimum 100)`);
      continue;
    }
    rows.push({ amount, currency: currency || "NGN", bankCode, accountNumber, accountName, narration });
  }
  return { rows, errors };
}

function downloadTemplate() {
  const csv = "amount,currency,bankCode,accountNumber,accountName,narration\n5000,NGN,044,0123456789,John Doe,Salary payment\n10000,GHS,030,9876543210,Jane Smith,Vendor payment";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "paygate-bulk-payout-template.csv";
  a.click(); URL.revokeObjectURL(url);
}

export default function Payouts() {
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showApprovalSettings, setShowApprovalSettings] = useState(false);
  const [form, setForm] = useState({ bankCode: "", accountNumber: "", amount: "", narration: "", currency: "NGN" });
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [nameFromCache, setNameFromCache] = useState(false);
  const { data: banksData } = trpc.nip.listBanks.useQuery(undefined, { staleTime: 5 * 60_000 });
  const bankOptions = useMemo(() => banksData?.banks ?? [], [banksData]);
  const selectedBank = useMemo(() => bankOptions.find(b => b.bankCode === form.bankCode), [bankOptions, form.bankCode]);
  const resolveAccount = trpc.nip.resolveAccount.useMutation({
    onSuccess: (data) => {
      setResolvedName(data.accountName);
      setNameFromCache(data.fromCache);
      toast.success(`Account verified: ${data.accountName}${data.fromCache ? " (cached)" : ""}`);
    },
    onError: (e) => {
      setResolvedName(null);
      toast.error(`Account verification failed: ${e.message}`);
    },
  });
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.payouts.list.useQuery({ limit: 20, offset: 0 }, { staleTime: 30_000 });

  const createPayout = trpc.payouts.create.useMutation({
    onSuccess: () => {
      toast.success("Payout initiated successfully");
      setShowForm(false);
      setForm({ bankCode: "", accountNumber: "", amount: "", narration: "", currency: "NGN" });
      setResolvedName(null);
      setNameFromCache(false);
      utils.payouts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createBulk = trpc.payouts.createBulk.useMutation({
    onSuccess: (result) => {
      setBulkResults(result.results);
      setBulkSummary({ total: result.total, succeeded: result.succeeded, failed: result.failed });
      utils.payouts.list.invalidate();
      if (result.failed === 0) {
        toast.success(`All ${result.succeeded} payouts initiated successfully`);
      } else {
        toast.warning(`${result.succeeded} succeeded, ${result.failed} failed`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const approveMutation = trpc.payouts.approve.useMutation({
    onSuccess: () => { toast.success("Payout approved and queued for processing"); utils.payouts.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMutation = trpc.payouts.reject.useMutation({
    onSuccess: () => { toast.success("Payout rejected"); utils.payouts.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateApprovalSettings = trpc.payouts.updateApprovalSettings.useMutation({
    onSuccess: () => { toast.success("Approval settings saved"); utils.payouts.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const settingsQuery = trpc.settings.get.useQuery(undefined, { staleTime: 60_000 });
  const merchant = settingsQuery.data?.merchant;
  const approvalEnabled = merchant?.payoutApprovalEnabled ?? false;
  const approvalThreshold = merchant?.payoutApprovalThreshold ?? 500000;
  const [thresholdInput, setThresholdInput] = useState("");

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pendingApprovalRows = rows.filter(r => r.status === "pending_approval");

  const handleVerifyAccount = () => {
    if (!form.bankCode || form.accountNumber.length !== 10) {
      return toast.error("Enter a valid 3-digit bank code and 10-digit account number first");
    }
    setResolvedName(null);
    resolveAccount.mutate({ bankCode: form.bankCode, accountNumber: form.accountNumber });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bankCode || !form.accountNumber || !form.amount) return toast.error("Fill all required fields");
    if (!resolvedName) return toast.error("Please verify the account holder name before initiating the payout");
    createPayout.mutate({
      bankCode: form.bankCode,
      accountNumber: form.accountNumber,
      amount: parseFloat(form.amount),
      narration: form.narration || "Payout",
      currency: form.currency,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows: parsed, errors } = parseCsv(text);
      setBulkRows(parsed);
      setBulkErrors(errors);
      setBulkResults(null);
      setBulkSummary(null);
      if (parsed.length > 0) {
        toast.info(`Parsed ${parsed.length} rows${errors.length > 0 ? `, ${errors.length} skipped` : ""}`);
      } else {
        toast.error("No valid rows found in CSV");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Payouts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} total payouts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-1.5" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => { setShowApprovalSettings(s => !s); setShowForm(false); setShowBulk(false); }}>
            <Settings2 className="w-4 h-4 mr-1.5" />Approval
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowBulk(b => !b); setShowForm(false); setShowApprovalSettings(false); }}>
            <Upload className="w-4 h-4 mr-1.5" />Bulk Upload
          </Button>
          <Button size="sm" onClick={() => { setShowForm(f => !f); setShowBulk(false); setShowApprovalSettings(false); }}>
            <Plus className="w-4 h-4 mr-1.5" />New Payout
          </Button>
        </div>
      </div>

      {/* Approval Settings Panel */}
      {showApprovalSettings && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Payout Approval Workflow</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Require approval for large payouts</p>
                <p className="text-xs text-muted-foreground mt-0.5">Payouts above the threshold will be held for manual review before processing</p>
              </div>
              <Switch
                checked={approvalEnabled}
                onCheckedChange={(v) => updateApprovalSettings.mutate({ payoutApprovalEnabled: v, payoutApprovalThreshold: approvalThreshold })}
                disabled={updateApprovalSettings.isPending}
              />
            </div>
            {approvalEnabled && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Approval Threshold (NGN)</label>
                  <input
                    type="number"
                    value={thresholdInput || approvalThreshold}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none"
                    placeholder="500000"
                    min={100}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const t = parseFloat(thresholdInput);
                    if (isNaN(t) || t < 100) return toast.error("Threshold must be at least 100");
                    updateApprovalSettings.mutate({ payoutApprovalEnabled: true, payoutApprovalThreshold: t });
                    setThresholdInput("");
                  }}
                  disabled={updateApprovalSettings.isPending}
                >
                  Save Threshold
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Approval Queue */}
      {pendingApprovalRows.length > 0 && (
        <div className="bg-card rounded-xl border border-purple-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-purple-50/50 border-b border-purple-100">
            <Clock className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-800">Awaiting Approval ({pendingApprovalRows.length})</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["ID", "Account", "Amount", "Narration", "Date", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendingApprovalRows.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3">{p.bankCode ?? "—"} · {p.accountNumber ?? "—"}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{p.currency} {Number(p.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">{p.narration ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 h-7 px-2 text-xs"
                        onClick={() => approveMutation.mutate({ id: p.id })} disabled={approveMutation.isPending}>
                        <CheckCircle className="w-3 h-3 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 h-7 px-2 text-xs"
                        onClick={() => rejectMutation.mutate({ id: p.id })} disabled={rejectMutation.isPending}>
                        <XCircle className="w-3 h-3 mr-1" />Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Single Payout Form */}
      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-4">Initiate Payout</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank *</label>
              <select
                value={form.bankCode}
                onChange={(e) => { setForm(f => ({ ...f, bankCode: e.target.value })); setResolvedName(null); }}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
                <option value="">— Select bank —</option>
                {bankOptions.map(b => (
                  <option key={b.bankCode} value={b.bankCode}>{b.bankName} ({b.bankCode})</option>
                ))}
              </select>
              {selectedBank && (
                <p className="mt-1 text-xs text-muted-foreground">{selectedBank.shortName} · {selectedBank.bankCode}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Number *</label>
              <div className="flex gap-2">
                <input value={form.accountNumber}
                  onChange={(e) => { setForm(f => ({ ...f, accountNumber: e.target.value })); setResolvedName(null); }}
                  placeholder="10-digit account number" className="flex-1 px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
                <Button type="button" variant="outline" size="sm" onClick={handleVerifyAccount}
                  disabled={resolveAccount.isPending || form.accountNumber.length !== 10 || !form.bankCode}
                  className="shrink-0 gap-1.5">
                  {resolveAccount.isPending
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <UserCheck className="w-3.5 h-3.5" />}
                  {resolveAccount.isPending ? "Verifying..." : "Verify"}
                </Button>
              </div>
              {resolvedName && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="font-medium">{resolvedName}</span>
                  {nameFromCache && <span className="text-muted-foreground">(cached)</span>}
                </div>
              )}
              {!resolvedName && form.accountNumber.length === 10 && form.bankCode && !resolveAccount.isPending && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Account not verified — click Verify before submitting</span>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount *</label>
              <input type="number" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Amount" className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
              <select value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
                {["NGN","GHS","KES","ZAR","USD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Narration</label>
              <input value={form.narration} onChange={(e) => setForm(f => ({ ...f, narration: e.target.value }))}
                placeholder="Payment description" className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div className="sm:col-span-2 flex gap-3">
              <Button type="submit" disabled={createPayout.isPending || !resolvedName}>
                {createPayout.isPending ? "Processing..." : "Initiate Payout"}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setResolvedName(null); }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk CSV Upload Panel */}
      {showBulk && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Bulk Payout Upload</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Upload a CSV file with up to 500 payout rows</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-1.5" />Download Template
            </Button>
          </div>

          {/* CSV format hint */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground font-mono">
            amount, currency, bankCode, accountNumber, accountName, narration
          </div>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Click to select CSV file</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .csv files up to 16 MB</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />

          {/* Parse errors */}
          {bulkErrors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-red-700">Parse warnings ({bulkErrors.length} rows skipped):</p>
              {bulkErrors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
              {bulkErrors.length > 5 && <p className="text-xs text-red-500">…and {bulkErrors.length - 5} more</p>}
            </div>
          )}

          {/* Preview table */}
          {bulkRows.length > 0 && !bulkResults && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{bulkRows.length} rows ready to submit</p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>{["#","Amount","Currency","Bank Code","Account","Name","Narration"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bulkRows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{r.amount.toLocaleString()}</td>
                        <td className="px-3 py-2">{r.currency}</td>
                        <td className="px-3 py-2">{r.bankCode ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{r.accountNumber ?? "—"}</td>
                        <td className="px-3 py-2">{r.accountName ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{r.narration ?? "—"}</td>
                      </tr>
                    ))}
                    {bulkRows.length > 10 && (
                      <tr><td colSpan={7} className="px-3 py-2 text-center text-muted-foreground">…and {bulkRows.length - 10} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => createBulk.mutate({ rows: bulkRows })}
                  disabled={createBulk.isPending}
                >
                  <ArrowUpRight className="w-4 h-4 mr-1.5" />
                  {createBulk.isPending ? `Processing ${bulkRows.length} payouts…` : `Submit ${bulkRows.length} Payouts`}
                </Button>
                <Button variant="outline" onClick={() => { setBulkRows([]); setBulkErrors([]); }}>Clear</Button>
              </div>
            </div>
          )}

          {/* Results */}
          {bulkResults && bulkSummary && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />{bulkSummary.succeeded} succeeded
                </div>
                {bulkSummary.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-red-600 text-sm font-medium">
                    <XCircle className="w-4 h-4" />{bulkSummary.failed} failed
                  </div>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-border max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>{["Row","Status","Payout ID","Error"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bulkResults.map((r) => (
                      <tr key={r.index} className={r.success ? "" : "bg-red-50/50"}>
                        <td className="px-3 py-2 text-muted-foreground">{r.index + 1}</td>
                        <td className="px-3 py-2">
                          {r.success
                            ? <span className="text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" />OK</span>
                            : <span className="text-red-600 font-medium flex items-center gap-1"><XCircle className="w-3 h-3" />Failed</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.id ?? "—"}</td>
                        <td className="px-3 py-2 text-red-600">{r.error ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setBulkRows([]); setBulkErrors([]); setBulkResults(null); setBulkSummary(null); }}>
                Upload Another File
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Payouts Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["ID", "Account", "Amount", "Status", "Narration", "Date"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? Array(6).fill(0).map((_, i) => (
              <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
            )) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No payouts yet</td></tr>
            ) : rows.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}...</td>
                <td className="px-4 py-3">{p.bankCode} · {p.accountNumber}</td>
                <td className="px-4 py-3 font-mono font-semibold">{p.currency} {Number(p.amount).toLocaleString()}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{p.narration ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
