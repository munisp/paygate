// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  BanknoteIcon,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useAdaptiveInterval } from "@/lib/networkQuality";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SettlementStatus = "pending" | "processing" | "completed" | "failed" | "sla_breached";

interface Settlement {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: SettlementStatus;
  bankCode?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  slaDeadlineAt?: Date | string | null;
  slaBreachedAt?: Date | string | null;
  workflowId?: string | null;
  failureReason?: string | null;
  severity?: string | null;
  initiatedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
}

function formatNgn(kobo: number) {
  return (kobo / 100).toLocaleString("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  });
}

function StatusBadge({ status, severity }: { status: SettlementStatus; severity?: string | null }) {
  const map: Record<SettlementStatus, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    processing: { label: "Processing", className: "bg-blue-100 text-blue-800 border-blue-200" },
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
    sla_breached: {
      label: severity === "critical" ? "SLA Breached — Critical" : "SLA Breached",
      className: severity === "critical"
        ? "bg-red-200 text-red-900 border-red-400 font-semibold"
        : "bg-orange-100 text-orange-800 border-orange-200",
    },
  };
  const { label, className } = map[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      {label}
    </Badge>
  );
}

function StatusIcon({ status }: { status: SettlementStatus }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "sla_breached") return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  if (status === "processing") return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  return <Clock className="h-4 w-4 text-yellow-500" />;
}

/** Live countdown to SLA deadline or time since breach */
function SlaCountdown({ slaDeadlineAt, slaBreachedAt, status }: {
  slaDeadlineAt?: Date | string | null;
  slaBreachedAt?: Date | string | null;
  status: SettlementStatus;
}) {
  const settlementsInterval = useAdaptiveInterval(15000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (status === "completed") return <span className="text-xs text-muted-foreground">—</span>;

  if (status === "sla_breached" && slaBreachedAt) {
    const breachedMs = new Date(slaBreachedAt).getTime();
    const overdueSec = Math.floor((now - breachedMs) / 1000);
    const h = Math.floor(overdueSec / 3600);
    const m = Math.floor((overdueSec % 3600) / 60);
    return (
      <span className="text-xs font-medium text-red-600">
        {h > 0 ? `${h}h ` : ""}{m}m overdue
      </span>
    );
  }

  if (slaDeadlineAt) {
    const deadlineMs = new Date(slaDeadlineAt).getTime();
    const remainSec = Math.max(0, Math.floor((deadlineMs - now) / 1000));
    const h = Math.floor(remainSec / 3600);
    const m = Math.floor((remainSec % 3600) / 60);
    const s = remainSec % 60;
    const isUrgent = remainSec < 1800; // < 30 min
    return (
      <span className={`text-xs font-mono font-medium ${isUrgent ? "text-orange-600" : "text-muted-foreground"}`}>
        {h > 0 ? `${h}h ` : ""}{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </span>
    );
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function Settlements() {
  const { isAuthenticated } = useAuth();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Settlement | null>(null);

  const exportQuery = trpc.settlements.export.useQuery(undefined, { enabled: false }, { staleTime: 30_000 });
  const handleExport = async () => {
    const result = await exportQuery.refetch();
    if (result.data) {
      downloadCsv(result.data.csv, result.data.filename);
    }
  };
  const { data, isLoading, refetch } = trpc.settlements.list.useQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      status: statusFilter !== "all" ? statusFilter : undefined,
    },
    { enabled: isAuthenticated, refetchInterval: settlementsInterval }, staleTime: 30_000})

  const rows: Settlement[] = (data?.rows ?? []) as Settlement[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const utils = trpc.useUtils();
  const retryMutation = trpc.settlements.retry.useMutation({
    onSuccess: () => {
      toast.success("Settlement retry triggered");
      utils.settlements.list.invalidate();
      utils.settlements.listBreached.invalidate();
      setSelected(null);
    },
    onError: (err) => toast.error("Retry failed", { description: err.message }),
  });

  const handleRetry = useCallback((id: string) => {
    retryMutation.mutate({ id });
  }, [retryMutation]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settlements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            CBN NIP settlement batches — 2-hour SLA monitored
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exportQuery.isFetching} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />{exportQuery.isFetching ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()} className="gap-1.5"><RefreshCw/>Refresh
          </Button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder="Search by reference…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 pr-3 py-2 h-9 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-56"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="sla_breached">SLA Breached</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total.toLocaleString()} settlement{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <BanknoteIcon className="h-8 w-8 opacity-30" />
              <p className="text-sm">No settlements found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA Countdown</TableHead>
                  <TableHead>Initiated</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.filter((s: any) => !search || s.reference?.toLowerCase().includes(search.toLowerCase()) || s.accountName?.toLowerCase().includes(search.toLowerCase()) || s.accountNumber?.includes(search)).map((s: any) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelected(s)}
                  >
                    <TableCell>
                      <StatusIcon status={s.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium">{s.reference}</TableCell>
                    <TableCell className="font-semibold">{formatNgn(s.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.accountName ? (
                        <span>{s.accountName}<br />{s.accountNumber} · {s.bankCode}</span>
                      ) : (
                        <span className="italic">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} severity={s.severity} />
                    </TableCell>
                    <TableCell>
                      <SlaCountdown
                        slaDeadlineAt={s.slaDeadlineAt}
                        slaBreachedAt={s.slaBreachedAt}
                        status={s.status}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell onClick={(e: any) => e.stopPropagation()}>
                      {(s.status === "failed" || s.status === "sla_breached") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={retryMutation.isPending}
                          onClick={() => handleRetry(s.id)}
                        >
                          {retryMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <StatusIcon status={selected.status} />
                Settlement Detail
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">{selected.reference}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {/* Audit Trail Timeline */}
              <div className="mb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Audit Trail</p>
                <ol className="relative border-l-2 border-border ml-2 space-y-3 pb-1">
                  {[
                    {
                      label: "Initiated",
                      ts: selected.initiatedAt ?? selected.createdAt,
                      dot: "bg-blue-500",
                      done: true,
                    },
                    {
                      label: "Processing",
                      ts: selected.status !== "pending" ? (selected.initiatedAt ?? selected.createdAt) : null,
                      dot: selected.status !== "pending" ? "bg-yellow-500" : "bg-muted",
                      done: selected.status !== "pending",
                    },
                    {
                      label: selected.status === "completed" ? "Completed"
                        : selected.status === "failed" ? "Failed"
                        : selected.status === "sla_breached" ? "SLA Breached"
                        : "Awaiting completion",
                      ts: selected.completedAt ?? selected.slaBreachedAt ?? null,
                      dot: selected.status === "completed" ? "bg-emerald-500"
                        : selected.status === "failed" ? "bg-red-500"
                        : selected.status === "sla_breached" ? "bg-orange-500"
                        : "bg-muted",
                      done: ["completed", "failed", "sla_breached"].includes(selected.status),
                    },
                  ].map((step, idx) => (
                    <li key={idx} className="ml-4">
                      <span className={`absolute -left-[7px] mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${step.dot}`} />
                      <p className={`text-xs font-medium ${step.done ? "" : "text-muted-foreground"}`}>{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.ts ? new Date(step.ts).toLocaleString() : "—"}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-semibold">{formatNgn(selected.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Currency</p>
                  <p className="font-semibold">{selected.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge status={selected.status} severity={selected.severity} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Severity</p>
                  <p className="capitalize">{selected.severity ?? "normal"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bank Code</p>
                  <p>{selected.bankCode ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account Number</p>
                  <p className="font-mono">{selected.accountNumber ?? "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Account Name</p>
                  <p>{selected.accountName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">SLA Deadline</p>
                  <p>{selected.slaDeadlineAt ? new Date(selected.slaDeadlineAt).toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">SLA Breached At</p>
                  <p className={selected.slaBreachedAt ? "text-red-600" : ""}>
                    {selected.slaBreachedAt ? new Date(selected.slaBreachedAt).toLocaleString() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Initiated At</p>
                  <p>{selected.initiatedAt ? new Date(selected.initiatedAt).toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed At</p>
                  <p>{selected.completedAt ? new Date(selected.completedAt).toLocaleString() : "—"}</p>
                </div>
                {selected.workflowId && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Temporal Workflow ID</p>
                    <p className="font-mono text-xs break-all">{selected.workflowId}</p>
                  </div>
                )}
                {selected.failureReason && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Failure Reason</p>
                    <p className="text-red-600 text-xs">{selected.failureReason}</p>
                  </div>
                )}
              </div>
              {(selected.status === "failed" || selected.status === "sla_breached") && (
                <div className="pt-2 border-t border-border">
                  <Button
                    className="w-full gap-2"
                    disabled={retryMutation.isPending}
                    onClick={() => handleRetry(selected.id)}
                  >
                    {retryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Retry Settlement
                    <ArrowRight className="h-4 w-4 ml-auto" />
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-1.5">
                    Re-triggers the Temporal SettlementWorkflow via the middleware bridge
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
