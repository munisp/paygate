import { useState, useCallback, useMemo } from "react";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import {
  Search, Download, RefreshCw, ChevronLeft, ChevronRight, Eye, Copy,
  Package, Star, SlidersHorizontal, X, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortBy = "createdAt" | "amount" | "status" | "channel";
type SortOrder = "asc" | "desc";
type Channel = "card" | "bank_transfer" | "mobile_money" | "ussd" | "qr" | "bnpl";

interface Filters {
  status: string;
  channel: Channel | "";
  currency: string;
  amountMin: string;
  amountMax: string;
  dateFrom: string;
  dateTo: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

const DEFAULT_FILTERS: Filters = {
  status: "",
  channel: "",
  currency: "",
  amountMin: "",
  amountMax: "",
  dateFrom: "",
  dateTo: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  card: "Card",
  bank_transfer: "Bank Transfer",
  mobile_money: "Mobile Money",
  ussd: "USSD",
  qr: "QR Code",
  bnpl: "BNPL",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    success:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending:   "bg-amber-50 text-amber-700 border-amber-200",
    processing:"bg-blue-50 text-blue-700 border-blue-200",
    failed:    "bg-red-50 text-red-700 border-red-200",
    reversed:  "bg-purple-50 text-purple-700 border-purple-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
}

function SortIcon({ col, active, order }: { col: string; active: boolean; order: SortOrder }) {
  if (!active) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
  return order === "asc"
    ? <ArrowUp className="w-3.5 h-3.5 text-primary" />
    : <ArrowDown className="w-3.5 h-3.5 text-primary" />;
}

// ─── Transaction Detail Dialog ────────────────────────────────────────────────

function TransactionDetailDialog({ txId, onClose }: { txId: string; onClose: () => void }) {
  const { data: tx, isLoading, refetch } = trpc.transactions.get.useQuery(
    { id: txId }, { enabled: !!txId, staleTime: 30_000 }
  );
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const utils = trpc.useUtils();

  const retryMutation = trpc.transactions.createTest.useMutation({
    onSuccess: () => {
      toast.success("Transaction retried — new transaction created");
      utils.transactions.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(`Retry failed: ${err.message}`),
  });

  const refundMutation = trpc.transactions.refund.useMutation({
    onSuccess: () => {
      toast.success("Refund initiated successfully");
      setShowRefund(false);
      refetch();
      utils.transactions.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref).then(() => toast.success("Copied to clipboard"));
  };

  return (
    <Dialog open={!!txId} onOpenChange={(o: any) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-4">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : tx ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Reference</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{tx.reference}</span>
                <button onClick={() => copyRef(tx.reference)} className="text-muted-foreground hover:text-foreground">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {[
              { label: "Amount", value: `${tx.currency} ${Number(tx.amount).toLocaleString()}` },
              { label: "Fee", value: tx.feeAmount ? `${tx.currency} ${Number(tx.feeAmount).toLocaleString()}` : "—" },
              { label: "Net Amount", value: tx.netAmount ? `${tx.currency} ${Number(tx.netAmount).toLocaleString()}` : "—" },
              { label: "Channel", value: tx.channel?.replace(/_/g, " ") ?? "—" },
              { label: "Customer", value: tx.customerName ?? tx.customerEmail ?? "—" },
              { label: "Description", value: tx.description ?? "—" },
              { label: "Created", value: new Date(tx.createdAt).toLocaleString() },
              { label: "Completed", value: tx.completedAt ? new Date(tx.completedAt).toLocaleString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium capitalize">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge status={tx.status} />
            </div>

            {/* Inventory Reservation Badge */}
            {(() => {
              const meta = (tx.metadata ?? {}) as Record<string, any>;
              const reservationId = meta.inventoryReservationId as string | undefined;
              const reservationStatus = meta.inventoryReservationStatus as string | undefined;
              if (!reservationId) return null;
              const isReleased = reservationStatus === "released";
              const isExpired = reservationStatus === "expired";
              const badgeClass = isExpired
                ? "bg-orange-50 text-orange-700 border-orange-200"
                : isReleased
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-blue-50 text-blue-700 border-blue-200";
              const badgeLabel = isExpired ? "Expired" : isReleased ? "Released" : "Reserved";
              return (
                <div className="flex items-center justify-between py-1.5 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Package className="w-3.5 h-3.5" />
                    Inventory Reservation
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`}>
                      {badgeLabel}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground" title={reservationId}>
                      {reservationId.slice(0, 12)}…
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Loyalty Earned Badge */}
            {(() => {
              const meta = (tx.metadata ?? {}) as Record<string, any>;
              const earnedPoints = typeof meta.earnedPoints === "number" ? meta.earnedPoints : null;
              if (!earnedPoints || earnedPoints <= 0) return null;
              return (
                <div className="flex items-center justify-between py-1.5 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Star className="w-3.5 h-3.5 text-emerald-500" />
                    Loyalty Earned
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                    +{earnedPoints.toLocaleString()} pts
                  </span>
                </div>
              );
            })()}

            {/* Loyalty Redemption Info */}
            {(() => {
              const meta = (tx.metadata ?? {}) as Record<string, any>;
              const redeemedPoints = typeof meta.redeemedPoints === "number" ? meta.redeemedPoints : null;
              const pointsValue = typeof meta.pointsValue === "number" ? meta.pointsValue : null;
              if (redeemedPoints === null || redeemedPoints === 0) return null;
              return (
                <div className="flex items-center justify-between py-1.5 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    Loyalty Redeemed
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
                      {redeemedPoints.toLocaleString()} pts
                    </span>
                    {pointsValue !== null && (
                      <span className="text-xs text-muted-foreground">= {tx.currency} {pointsValue.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Retry history */}
            {(() => {
              const meta = (tx.metadata ?? {}) as Record<string, any>;
              const retryCount = typeof meta.retryCount === "number" ? meta.retryCount : 0;
              const retryHistory: Array<{ attempt: number; timestamp: string; status: string }> = Array.isArray(meta.retryHistory) ? meta.retryHistory : [];
              if (retryCount < 1) return null;
              return (
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                      Retry History
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
                      Retried ×{retryCount}
                    </span>
                  </div>
                  {retryHistory.length > 0 ? (
                    <div className="space-y-1 pl-2 border-l-2 border-amber-200 ml-1.5">
                      {retryHistory.map((r: any, i: any) => (
                        <div key={i} className="flex items-center justify-between text-xs text-muted-foreground pl-2">
                          <span className="font-medium">Attempt #{r.attempt}</span>
                          <span className={r.status === "completed" ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>{r.status}</span>
                          <span>{new Date(r.timestamp).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground pl-5">Retried {retryCount} time{retryCount !== 1 ? "s" : ""} — no detailed history recorded</p>
                  )}
                </div>
              );
            })()}

            {/* Retry button */}
            {tx.status === "failed" && (
              <Button
                variant="outline" size="sm"
                className="w-full mt-2 border-blue-200 text-blue-600 hover:bg-blue-50"
                disabled={retryMutation.isPending}
                onClick={() => {
                  const meta = (tx.metadata ?? {}) as Record<string, any>;
                  const currentRetryCount = typeof meta.retryCount === "number" ? meta.retryCount : 0;
                  retryMutation.mutate({
                    amount: Number(tx.amount),
                    currency: tx.currency ?? "NGN",
                    customerEmail: tx.customerEmail ?? undefined,
                    customerName: tx.customerName ?? undefined,
                    description: tx.description ?? undefined,
                    channel: tx.channel ?? "card",
                    retryCount: currentRetryCount + 1,
                  });
                }}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                {retryMutation.isPending ? "Retrying…" : "Retry Transaction"}
              </Button>
            )}

            {/* Refund section */}
            {tx.status === "completed" && !showRefund && (
              <Button
                variant="outline" size="sm"
                className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => { setRefundAmount(String(tx.amount)); setShowRefund(true); }}
              >
                Initiate Refund
              </Button>
            )}
            {tx.status === "reversed" && (
              <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 text-center font-medium">
                This transaction has been refunded
              </div>
            )}
            {showRefund && (
              <div className="mt-3 p-3 rounded-lg border border-red-200 bg-red-50 space-y-3">
                <p className="text-xs font-semibold text-red-700">Refund Details</p>
                <div>
                  <label className="text-xs text-muted-foreground">Refund Amount ({tx.currency})</label>
                  <input
                    type="number"
                    value={refundAmount}
                    onChange={(e: any) => setRefundAmount(e.target.value)}
                    max={tx.amount}
                    min={1}
                    className="w-full mt-1 px-3 py-1.5 text-sm border border-border rounded-md bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reason (optional)</label>
                  <input
                    type="text"
                    value={refundReason}
                    onChange={(e: any) => setRefundReason(e.target.value)}
                    placeholder="e.g. Customer request"
                    className="w-full mt-1 px-3 py-1.5 text-sm border border-border rounded-md bg-background"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="destructive" className="flex-1"
                    disabled={refundMutation.isPending || !refundAmount}
                    onClick={() => refundMutation.mutate({ id: tx.id, amount: Number(refundAmount), reason: refundReason || undefined })}
                  >
                    {refundMutation.isPending ? "Processing..." : "Confirm Refund"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowRefund(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">Transaction not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Active Filter Chip ───────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
      {label}
      <button onClick={onRemove} className="hover:text-primary/60 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ─── Main Transactions Page ───────────────────────────────────────────────────

export default function Transactions() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingStatement, setExportingStatement] = useState(false);
  const limit = 20;

  const utils = trpc.useUtils();
  const now = new Date();

  // Build query input from active filters
  const queryInput = useMemo(() => ({
    limit,
    offset: page * limit,
    search: search || undefined,
    status: filters.status || undefined,
    channel: (filters.channel || undefined) as any,
    currency: filters.currency || undefined,
    amountMin: filters.amountMin ? Number(filters.amountMin) * 100 : undefined, // kobo
    amountMax: filters.amountMax ? Number(filters.amountMax) * 100 : undefined,
    from: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
    to: filters.dateTo ? new Date(filters.dateTo + "T23:59:59") : undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  }), [page, search, filters]);

  const txInterval = useAdaptiveInterval(60_000);
  const { data, isLoading, refetch, isFetching } = trpc.transactions.list.useQuery(
    queryInput,
    { staleTime: 30_000, refetchInterval: txInterval }
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Count active (non-default) filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status) count++;
    if (filters.channel) count++;
    if (filters.currency) count++;
    if (filters.amountMin) count++;
    if (filters.amountMax) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    return count;
  }, [filters]);

  // Column sort toggle
  const handleSort = useCallback((col: SortBy) => {
    setFilters(f => ({
      ...f,
      sortBy: col,
      sortOrder: f.sortBy === col && f.sortOrder === "desc" ? "asc" : "desc",
    }));
    setPage(0);
  }, []);

  // Apply draft filters
  const applyFilters = () => {
    setFilters(draftFilters);
    setPage(0);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    const reset = { ...DEFAULT_FILTERS };
    setDraftFilters(reset);
    setFilters(reset);
    setPage(0);
    setFilterOpen(false);
  };

  const openFilterPanel = () => {
    setDraftFilters(filters); // sync draft to current
    setFilterOpen(true);
  };

  const handleMonthlyStatement = async () => {
    setExportingStatement(true);
    try {
      const result = await utils.export.monthlyStatement.fetch({ year: now.getFullYear(), month: now.getMonth() + 1 });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement-${result.summary.period.replace(/\s/g, "-")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${result.summary.period}: ${result.summary.totalTransactions} txns · ₦${result.summary.totalVolumeNgn.toLocaleString()}`);
    } catch {
      toast.error("Statement export failed");
    } finally {
      setExportingStatement(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await utils.export.transactions.fetch({ status: filters.status || undefined });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count.toLocaleString()} transactions`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total.toLocaleString()} result{total !== 1 ? "s" : ""}
            {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} active`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleMonthlyStatement} disabled={exportingStatement}>
            <Download className={`w-4 h-4 mr-1.5 ${exportingStatement ? "animate-spin" : ""}`} />
            {exportingStatement ? "Generating..." : "Monthly Statement"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className={`w-4 h-4 mr-1.5 ${exporting ? "animate-spin" : ""}`} />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by reference, customer…"
            className="pl-9"
          />
        </div>

        {/* Quick status filter */}
        <Select
          value={filters.status || "all"}
          onValueChange={(v) => { setFilters(f => ({ ...f, status: v === "all" ? "" : v })); setPage(0); }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>

        {/* Advanced filters popover */}
        <Popover open={filterOpen} onOpenChange={(o) => { if (o) openFilterPanel(); else setFilterOpen(false); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="default" className="h-4 px-1.5 text-xs rounded-full">
                  {activeFilterCount}
                </Badge>
              )}
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 space-y-4" align="start">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Advanced Filters</p>
              <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                Reset all
              </button>
            </div>
            <Separator />

            {/* Channel */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Channel</label>
              <Select
                value={draftFilters.channel || "all"}
                onValueChange={(v) => setDraftFilters(f => ({ ...f, channel: v === "all" ? "" : v as Channel }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  {(Object.keys(CHANNEL_LABELS) as Channel[]).map(ch => (
                    <SelectItem key={ch} value={ch}>{CHANNEL_LABELS[ch]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Currency</label>
              <Select
                value={draftFilters.currency || "all"}
                onValueChange={(v) => setDraftFilters(f => ({ ...f, currency: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All currencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All currencies</SelectItem>
                  <SelectItem value="NGN">NGN — Nigerian Naira</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="GHS">GHS — Ghanaian Cedi</SelectItem>
                  <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount range */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount Range (₦)</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={draftFilters.amountMin}
                  onChange={(e) => setDraftFilters(f => ({ ...f, amountMin: e.target.value }))}
                  className="h-8 text-sm"
                  min={0}
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={draftFilters.amountMax}
                  onChange={(e) => setDraftFilters(f => ({ ...f, amountMax: e.target.value }))}
                  className="h-8 text-sm"
                  min={0}
                />
              </div>
            </div>

            {/* Date range */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Range</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={draftFilters.dateFrom}
                  onChange={(e) => setDraftFilters(f => ({ ...f, dateFrom: e.target.value }))}
                  className="h-8 text-sm flex-1"
                />
                <Input
                  type="date"
                  value={draftFilters.dateTo}
                  onChange={(e) => setDraftFilters(f => ({ ...f, dateTo: e.target.value }))}
                  className="h-8 text-sm flex-1"
                />
              </div>
            </div>

            {/* Sort */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sort By</label>
              <div className="flex gap-2">
                <Select
                  value={draftFilters.sortBy}
                  onValueChange={(v) => setDraftFilters(f => ({ ...f, sortBy: v as SortBy }))}
                >
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Date</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="channel">Channel</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={draftFilters.sortOrder}
                  onValueChange={(v) => setDraftFilters(f => ({ ...f, sortOrder: v as SortOrder }))}
                >
                  <SelectTrigger className="h-8 text-sm w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest first</SelectItem>
                    <SelectItem value="asc">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full" size="sm" onClick={applyFilters}>
              Apply Filters
            </Button>
          </PopoverContent>
        </Popover>

        {/* Clear all */}
        {(activeFilterCount > 0 || search) && (
          <Button
            variant="ghost" size="sm"
            className="text-muted-foreground gap-1"
            onClick={() => { resetFilters(); setSearch(""); }}
          >
            <X className="w-3.5 h-3.5" />
            Clear all
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.status && (
            <FilterChip
              label={`Status: ${filters.status}`}
              onRemove={() => { setFilters(f => ({ ...f, status: "" })); setPage(0); }}
            />
          )}
          {filters.channel && (
            <FilterChip
              label={`Channel: ${CHANNEL_LABELS[filters.channel as Channel]}`}
              onRemove={() => { setFilters(f => ({ ...f, channel: "" })); setPage(0); }}
            />
          )}
          {filters.currency && (
            <FilterChip
              label={`Currency: ${filters.currency}`}
              onRemove={() => { setFilters(f => ({ ...f, currency: "" })); setPage(0); }}
            />
          )}
          {(filters.amountMin || filters.amountMax) && (
            <FilterChip
              label={`Amount: ${filters.amountMin ? `₦${Number(filters.amountMin).toLocaleString()}` : "0"} – ${filters.amountMax ? `₦${Number(filters.amountMax).toLocaleString()}` : "∞"}`}
              onRemove={() => { setFilters(f => ({ ...f, amountMin: "", amountMax: "" })); setPage(0); }}
            />
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <FilterChip
              label={`Date: ${filters.dateFrom || "…"} → ${filters.dateTo || "…"}`}
              onRemove={() => { setFilters(f => ({ ...f, dateFrom: "", dateTo: "" })); setPage(0); }}
            />
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Reference
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Customer
                </th>
                {/* Sortable columns */}
                {(["amount", "channel", "status", "createdAt"] as const).map((col) => {
                  const labels: Record<string, string> = { amount: "Amount", channel: "Channel", status: "Status", createdAt: "Date" };
                  return (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort(col)}
                    >
                      <div className="flex items-center gap-1.5">
                        {labels[col]}
                        <SortIcon col={col} active={filters.sortBy === col} order={filters.sortOrder} />
                      </div>
                    </th>
                  );
                })}
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array(8).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Search className="w-8 h-8 opacity-30" />
                          <p className="font-medium">No transactions found</p>
                          {(activeFilterCount > 0 || search) && (
                            <p className="text-xs">Try adjusting your filters or search term</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                  : rows.map((txn) => (
                    <tr key={txn.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{txn.reference}</td>
                      <td className="px-4 py-3 font-medium">{txn.customerName ?? txn.customerEmail ?? "—"}</td>
                      <td className="px-4 py-3 font-mono font-semibold">{txn.currency} {Number(txn.amount / 100).toLocaleString()}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{txn.channel.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3"><StatusBadge status={txn.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(txn.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedTxId(txn.id)}
                          className="p-1.5 rounded hover:bg-muted transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} · {total.toLocaleString()} results
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedTxId && (
        <TransactionDetailDialog txId={selectedTxId} onClose={() => setSelectedTxId(null)} />
      )}
    </div>
  );
}
