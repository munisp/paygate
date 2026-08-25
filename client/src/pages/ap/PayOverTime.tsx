// @ts-nocheck
/**
 * AP Pay Over Time — finance approved bills (Melio-style B2B AP financing).
 * Quote offers for an approved bill (net-30 / 3 / 6 / 12 instalments), create
 * a plan (vendor is paid in full via the canonical payout path), then track
 * plans and repay instalments from the merchant wallet.
 */
import { useMemo, useState } from "react";
import {
  CalendarClock, RefreshCw, Sparkles, CheckCircle2, XCircle, Clock,
  Loader2, ChevronRight, Wallet, History, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const SCHEDULE_STATUS: Record<string, { color: string; bg: string }> = {
  pending: { color: "text-amber-400", bg: "bg-amber-500/15" },
  overdue: { color: "text-red-400", bg: "bg-red-500/15" },
  paid: { color: "text-green-400", bg: "bg-green-500/15" },
};

const OFFER_LABELS: Record<string, { title: string; desc: string }> = {
  net30: { title: "Net-30", desc: "One payment in 30 days" },
  inst3: { title: "3 instalments", desc: "3 monthly payments" },
  inst6: { title: "6 instalments", desc: "6 monthly payments" },
  inst12: { title: "12 instalments", desc: "12 monthly payments" },
};

export default function PayOverTime() {
  const utils = trpc.useUtils();
  const [offersFor, setOffersFor] = useState<string | null>(null); // billId
  const [scheduleFor, setScheduleFor] = useState<string | null>(null); // planId
  const [confirmOffer, setConfirmOffer] = useState<any | null>(null); // selected offer

  // ── queries ──
  const { data: billsData, isLoading: billsLoading, refetch: refetchBills } = trpc.apBillPay.listBills.useQuery(
    { status: "approved", limit: 100 },
    { staleTime: 15_000 },
  );
  const financeableBills: any[] = useMemo(
    () => (billsData?.bills ?? []).filter((b: any) => (b.totalKobo ?? 0) - (b.amountPaidKobo ?? 0) > 0),
    [billsData],
  );

  const { data: vendorsData } = trpc.apVendorDirectory.listVendors.useQuery({ limit: 200 }, { staleTime: 60_000 });
  const vendorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendorsData?.vendors ?? []) m.set(v.id, v.name);
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [vendorsData]);

  const { data: plansData, isLoading: plansLoading, refetch: refetchPlans } = trpc.apPayOverTime.listPlans.useQuery(
    { page: 1, limit: 50 },
    { staleTime: 15_000 },
  );
  const planRows: any[] = plansData ?? [];

  const { data: offersData, isLoading: offersLoading, error: offersError } = trpc.apPayOverTime.getOffers.useQuery(
    { billId: offersFor! },
    { enabled: !!offersFor, retry: false },
  );

  const { data: scheduleData, isLoading: scheduleLoading, refetch: refetchSchedule } = trpc.apPayOverTime.getSchedule.useQuery(
    { planId: scheduleFor! },
    { enabled: !!scheduleFor },
  );

  // ── mutations ──
  const createPlan = trpc.apPayOverTime.createPlan.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Plan created — vendor paid in full. First instalment due ${fmtDate(r.firstDueDate)}`);
      setOffersFor(null);
      setConfirmOffer(null);
      utils.apPayOverTime.listPlans.invalidate();
      utils.apBillPay.listBills.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const repay = trpc.apPayOverTime.repayInstallment.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.loanCompleted ? "Final instalment paid — plan completed" : `Instalment paid (${formatNGN(r.amountKobo)})`);
      refetchSchedule();
      utils.apPayOverTime.listPlans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitPlan = () => {
    if (!offersFor || !confirmOffer) return;
    createPlan.mutate({
      billId: offersFor,
      offerId: confirmOffer.offerId,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Pay Over Time
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Finance approved bills — your vendor is paid in full today, you repay in instalments</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchBills(); refetchPlans(); }} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Financeable bills */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Financeable Bills</h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {billsLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading bills…</div>
          ) : financeableBills.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarClock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No approved bills to finance</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Approve a bill first, then come back to finance it over time</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bill</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outstanding</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {financeableBills.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground font-mono text-xs">{b.billNumber ?? b.id.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{vendorName(b.vendorId)}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatNGN((b.totalKobo ?? 0) - (b.amountPaidKobo ?? 0))}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(b.dueDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => { setOffersFor(b.id); setConfirmOffer(null); }}>
                            <Sparkles className="w-3.5 h-3.5" /> Get Offers
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
      </div>

      {/* Existing plans */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Your Plans</h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {plansLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading plans…</div>
          ) : planRows.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No pay-over-time plans yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Finance an approved bill above to create your first plan</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bill</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instalments</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Financed</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {planRows.map((row: any) => {
                    const meta = row.payment?.metadata ?? {};
                    return (
                      <tr key={row.payment?.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground text-xs max-w-[220px] truncate" title={row.plan?.name}>
                          {row.plan?.name ?? meta.planId}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{row.bill?.billNumber ?? row.bill?.id?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{meta.installments ?? row.plan?.installments ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">{formatNGN(row.payment?.amountKobo ?? 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            row.payment?.status === "completed" ? "bg-green-500/15 text-green-400"
                            : row.payment?.status === "failed" ? "bg-red-500/15 text-red-400"
                            : "bg-amber-500/15 text-amber-400"
                          }`}>
                            {row.payment?.status ?? "pending"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(row.payment?.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                              onClick={() => setScheduleFor(scheduleFor === meta.planId ? null : meta.planId)}>
                              <ChevronRight className="w-3.5 h-3.5" /> Schedule
                            </Button>
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

      {/* Repayment schedule */}
      {scheduleFor && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-2">Repayment Schedule</h2>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {scheduleLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading schedule…</div>
            ) : !scheduleData ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Schedule unavailable</div>
            ) : (
              <>
                {scheduleData.loan && (
                  <div className="px-4 py-3 border-b border-border bg-muted/20 flex flex-wrap gap-x-8 gap-y-1 text-xs text-muted-foreground">
                    <span>Loan status: <span className="font-medium text-foreground capitalize">{scheduleData.loan.status}</span></span>
                    <span>Repaid: <span className="font-medium text-foreground">{formatNGN(scheduleData.loan.paidAmount ?? 0)}</span></span>
                    <span>Principal: <span className="font-medium text-foreground">{formatNGN(scheduleData.loan.principalAmount ?? 0)}</span></span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Principal</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interest</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(scheduleData.installments ?? []).map((s: any) => {
                        const meta = SCHEDULE_STATUS[s.status] ?? SCHEDULE_STATUS.pending;
                        const payable = s.status === "pending" || s.status === "overdue";
                        return (
                          <tr key={s.id}>
                            <td className="px-4 py-3 text-center text-muted-foreground">{s.instalmentNumber}/{s.totalInstalments}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(s.dueDate)}</td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">
                              {formatNGN(Math.round(((s.totalDueNgn ?? 0) + (s.lateFeeNgn ?? 0)) * 100))}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{formatNGN(Math.round((s.principalAmountNgn ?? 0) * 100))}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{formatNGN(Math.round((s.interestAmountNgn ?? 0) * 100))}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                                  {s.status}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                {payable && (
                                  <Button size="sm" className="h-8 gap-1 text-xs"
                                    disabled={repay.isPending}
                                    onClick={() => {
                                      if (confirm(`Pay instalment ${s.instalmentNumber} (${formatNGN(Math.round(((s.totalDueNgn ?? 0) + (s.lateFeeNgn ?? 0)) * 100))}) from your wallet?`)) {
                                        repay.mutate({ scheduleId: s.id, idempotencyKey: crypto.randomUUID() });
                                      }
                                    }}>
                                    <Wallet className="w-3.5 h-3.5" /> Pay
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
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Offers dialog ── */}
      <Dialog open={!!offersFor} onOpenChange={(o) => { if (!o) { setOffersFor(null); setConfirmOffer(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pay-Over-Time Offers</DialogTitle>
          </DialogHeader>
          {offersLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Quoting terms from credit scoring…
            </div>
          ) : offersError ? (
            <div className="p-6 text-center">
              <Ban className="w-8 h-8 text-red-400/50 mx-auto mb-2" />
              <p className="text-sm text-red-400">{offersError.message}</p>
            </div>
          ) : offersData ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-8 gap-y-1 text-xs text-muted-foreground">
                <span>Financing: <span className="font-medium text-foreground">{formatNGN(offersData.principalKobo)}</span></span>
                <span>Credit score: <span className="font-medium text-foreground">{offersData.score}</span></span>
                <span>Risk band: <span className="font-medium text-foreground capitalize">{offersData.riskBand}</span></span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(offersData.offers ?? []).map((o: any) => {
                  const label = OFFER_LABELS[o.offerId] ?? { title: o.offerId, desc: "" };
                  const selected = confirmOffer?.offerId === o.offerId;
                  return (
                    <button
                      key={o.offerId}
                      onClick={() => setConfirmOffer(o)}
                      className={`text-left rounded-xl border p-4 space-y-2 transition-colors ${
                        selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground text-sm">{label.title}</span>
                        {selected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{label.desc}</p>
                      <div className="text-sm">
                        <span className="font-semibold text-foreground">{formatNGN(o.installmentAmountKobo)}</span>
                        <span className="text-muted-foreground text-xs"> / instalment</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Total: {formatNGN(o.totalRepayableKobo)}</span>
                        <span>{o.aprBps != null ? `${(o.aprBps / 100).toFixed(1)}% APR` : o.feeBps != null && o.feeBps > 0 ? `${(o.feeBps / 100).toFixed(1)}% fee` : "No fee"}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">First due {fmtDate(o.firstDueDate)}</p>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                Creating a plan pays your vendor in full immediately and moves the bill to paid. You repay PayGate on the schedule above.
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setOffersFor(null); setConfirmOffer(null); }}>Cancel</Button>
                <Button onClick={submitPlan} disabled={!confirmOffer || createPlan.isPending} className="gap-2">
                  <CalendarClock className="w-4 h-4" />
                  {createPlan.isPending ? "Creating…" : "Create Plan & Pay Vendor"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
