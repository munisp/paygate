// @ts-nocheck
/**
 * AP Tax Compliance — WHT exposure dashboard. Summary aggregates, monthly
 * WHT remittance generation (files with the tax-engine), recent remittance
 * batches and the per-bill withholding record ledger. Vendor TIN validation
 * and WHT profile management live on the Vendors page.
 */
import { useMemo, useState } from "react";
import {
  Scale, RefreshCw, FileCheck, Send, Clock, CheckCircle2, XCircle,
  Loader2, Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── helpers ─────────────────────────────────────────────────────────────────
function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format((kobo ?? 0) / 100);
}
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
function currentPeriod() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

const RECORD_STATUS: Record<string, { color: string; bg: string }> = {
  pending: { color: "text-amber-400", bg: "bg-amber-500/15" },
  filed: { color: "text-blue-400", bg: "bg-blue-500/15" },
  remitted: { color: "text-green-400", bg: "bg-green-500/15" },
};

const REMITTANCE_STATUS: Record<string, { color: string; bg: string; icon: any }> = {
  draft: { color: "text-amber-400", bg: "bg-amber-500/15", icon: Clock },
  filed: { color: "text-blue-400", bg: "bg-blue-500/15", icon: FileCheck },
  remitted: { color: "text-green-400", bg: "bg-green-500/15", icon: CheckCircle2 },
};

export default function TaxCompliance() {
  const utils = trpc.useUtils();
  const [periodFilter, setPeriodFilter] = useState<string>("");
  const [remitPeriod, setRemitPeriod] = useState<string>(currentPeriod());

  // ── queries ──
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = trpc.taxCompliance.whtSummary.useQuery(
    undefined,
    { staleTime: 15_000 },
  );
  const { data: recordsData, isLoading: recordsLoading, refetch: refetchRecords } = trpc.taxCompliance.listWhtRecords.useQuery(
    { period: periodFilter || undefined, limit: 100, offset: 0 },
    { staleTime: 15_000 },
  );
  const recordRows: any[] = recordsData?.records ?? [];

  const { data: vendorsData } = trpc.apVendorDirectory.listVendors.useQuery({ limit: 200 }, { staleTime: 60_000 });
  const vendorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendorsData?.vendors ?? []) m.set(v.id, v.name);
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [vendorsData]);

  // ── mutations ──
  const generateRemittance = trpc.taxCompliance.generateWhtRemittance.useMutation({
    onSuccess: (r: any) => {
      if (r?.warning) {
        toast.warning(`Remittance drafted for ${r.period} — ${r.warning}`);
      } else {
        toast.success(`Remittance filed for ${r.period} — ${r.recordCount} records, ${formatNGN(r.totalWhtKobo)}`);
      }
      utils.taxCompliance.whtSummary.invalidate();
      utils.taxCompliance.listWhtRecords.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const refresh = () => { refetchSummary(); refetchRecords(); };

  const summaryCards = [
    { label: "Pending Withholding", kobo: summary?.pendingKobo ?? 0, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Filed With FIRS", kobo: summary?.filedKobo ?? 0, icon: FileCheck, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Remitted", kobo: summary?.remittedKobo ?? 0, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
  ];

  const remittances: any[] = summary?.recentRemittances ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Tax Compliance
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Withholding tax records, monthly remittance filing and WHT exposure</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCards.map((c) => (
          <div key={c.label} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground mt-3">{summaryLoading ? "…" : formatNGN(c.kobo)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Generate remittance */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="remit-period">Remittance Period</Label>
            <Input
              id="remit-period"
              type="month"
              value={remitPeriod}
              onChange={(e) => setRemitPeriod(e.target.value)}
              className="w-48"
            />
          </div>
          <Button
            className="gap-2"
            disabled={generateRemittance.isPending || !/^\d{4}-(0[1-9]|1[0-2])$/.test(remitPeriod)}
            onClick={() => {
              if (confirm(`Aggregate all unremitted WHT records for ${remitPeriod} and file with the tax authority?`)) {
                generateRemittance.mutate({ period: remitPeriod, idempotencyKey: crypto.randomUUID() });
              }
            }}
          >
            {generateRemittance.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {generateRemittance.isPending ? "Filing…" : "Generate & File Remittance"}
          </Button>
          <p className="text-xs text-muted-foreground max-w-md">
            Aggregates every pending WHT line for the month into a remittance batch and files it with the tax engine.
            If filing fails the batch stays in draft so you can retry.
          </p>
        </div>
      </div>

      {/* Recent remittances */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Recent Remittances</h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {summaryLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading remittances…</div>
          ) : remittances.length === 0 ? (
            <div className="p-12 text-center">
              <Landmark className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No remittances yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Generate your first monthly remittance above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total WHT</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Records</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filed</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Remitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {remittances.map((r) => {
                    const meta = REMITTANCE_STATUS[r.status] ?? REMITTANCE_STATUS.draft;
                    return (
                      <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground font-mono text-xs">{r.period}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">{formatNGN(r.totalWhtKobo ?? 0)}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{r.recordCount ?? 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                              <meta.icon className="w-3 h-3" />
                              {r.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs max-w-[180px] truncate" title={r.reference ?? ""}>{r.reference ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(r.filedAt)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(r.remittedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* WHT records ledger */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Withholding Records</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="period-filter" className="text-xs text-muted-foreground">Period</Label>
            <Input
              id="period-filter"
              type="month"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="w-40 h-8 text-xs"
            />
            {periodFilter && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPeriodFilter("")}>Clear</Button>
            )}
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {recordsLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading records…</div>
          ) : recordRows.length === 0 ? (
            <div className="p-12 text-center">
              <Scale className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No withholding records{periodFilter ? ` for ${periodFilter}` : ""}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">WHT lines are created automatically when bills from WHT-applicable vendors are recorded</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bill</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gross</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rate</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">WHT</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Paid</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recordRows.map((row) => {
                    const r = row.record;
                    const meta = RECORD_STATUS[r.status] ?? RECORD_STATUS.pending;
                    return (
                      <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground font-mono text-xs">{row.billNumber ?? r.billId?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{vendorName(r.vendorId)}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.period}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatNGN(r.grossAmountKobo ?? 0)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{Number(r.taxRatePct ?? 0).toFixed(2)}%</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">{formatNGN(r.taxAmountKobo ?? 0)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatNGN(r.netAmountKobo ?? 0)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                              {r.status}
                            </span>
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
      </div>
    </div>
  );
}
