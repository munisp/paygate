import { useState } from "react";
import { ArrowUpRight, Plus, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending:   "bg-amber-50 text-amber-700 border-amber-200",
    processing:"bg-blue-50 text-blue-700 border-blue-200",
    failed:    "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.pending}`}>{status}</span>;
}

export default function Payouts() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ bankCode: "", accountNumber: "", amount: "", narration: "", currency: "NGN" });
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.payouts.list.useQuery({ limit: 20, offset: 0 }, { staleTime: 30_000 });
  const createPayout = trpc.payouts.create.useMutation({
    onSuccess: () => {
      toast.success("Payout initiated successfully");
      setShowForm(false);
      setForm({ bankCode: "", accountNumber: "", amount: "", narration: "", currency: "NGN" });
      utils.payouts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bankCode || !form.accountNumber || !form.amount) return toast.error("Fill all required fields");
    createPayout.mutate({
      bankCode: form.bankCode,
      accountNumber: form.accountNumber,
      amount: parseFloat(form.amount),
      narration: form.narration || "Payout",
      currency: form.currency,
    });
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
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1.5" />New Payout</Button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-4">Initiate Payout</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Code *</label>
              <input value={form.bankCode} onChange={(e) => setForm(f => ({ ...f, bankCode: e.target.value }))}
                placeholder="e.g. 044" className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Number *</label>
              <input value={form.accountNumber} onChange={(e) => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                placeholder="10-digit account number" className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
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
              <Button type="submit" disabled={createPayout.isPending}>
                {createPayout.isPending ? "Processing..." : "Initiate Payout"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

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
