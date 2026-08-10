// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  CreditCard,
  Download,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  User,
  Webhook,
  Zap,
} from "lucide-react";
import { useMemo, useState, useCallback, useRef } from "react";
import { toast } from "sonner";

// ─── Action icon map ─────────────────────────────────────────────────────────
function getActionIcon(action: string) {
  if (action.startsWith("purchase_order")) return ShoppingCart;
  if (action.startsWith("payment") || action.startsWith("transaction")) return CreditCard;
  if (action.startsWith("fraud") || action.startsWith("dispute")) return AlertTriangle;
  if (action.startsWith("user") || action.startsWith("admin")) return User;
  if (action.startsWith("webhook")) return Webhook;
  if (action.startsWith("settings") || action.startsWith("api_key")) return Settings;
  if (action.startsWith("kyc") || action.startsWith("compliance")) return Shield;
  if (action.startsWith("inventory")) return ShoppingCart;
  if (action.startsWith("payout") || action.startsWith("settlement")) return CheckCircle2;
  return Activity;
}

function getActionColor(action: string) {
  if (action.startsWith("fraud") || action.startsWith("dispute")) return "text-red-600 bg-red-50";
  if (action.startsWith("payment") || action.startsWith("payout")) return "text-emerald-600 bg-emerald-50";
  if (action.startsWith("admin") || action.startsWith("settings")) return "text-violet-600 bg-violet-50";
  if (action.startsWith("purchase_order") || action.startsWith("inventory")) return "text-amber-600 bg-amber-50";
  return "text-blue-600 bg-blue-50";
}

function formatAction(action: string) {
  return action
    .split(".")
    .map((s: any) => s.replace(/_/g, " "))
    .map((s: any) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" → ");
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 25;

export default function AuditLog() {
  const auditInterval = useAdaptiveInterval(30_000);
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Date range filter (ISO date strings YYYY-MM-DD, empty = no filter)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Convert date strings to epoch ms for the tRPC input
  const fromMs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : undefined;
  const toMs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : undefined;

  const { data: filtersData } = trpc.auditLog.getActions.useQuery(undefined, {
    enabled: isAuthenticated,
  }, { staleTime: 30_000 });

  const { data, isLoading, refetch } = trpc.auditLog.list.useQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      action: actionFilter !== "all" ? actionFilter : undefined,
      resource: resourceFilter !== "all" ? resourceFilter : undefined,
      from: fromMs,
      to: toMs,
    },
    { enabled: isAuthenticated, refetchInterval: auditInterval , staleTime: 30_000 })

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e: any) =>
        e.action?.toLowerCase().includes(q) ||
        e.resource?.toLowerCase().includes(q) ||
        e.actorName?.toLowerCase().includes(q) ||
        e.actorEmail?.toLowerCase().includes(q) ||
        e.resourceId?.toLowerCase().includes(q)
    );
  }, [events, search]);

  const [isExporting, setIsExporting] = useState(false);
  const utils = trpc.useUtils();

  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await utils.auditLog.exportCsv.fetch({
        action: actionFilter !== "all" ? actionFilter : undefined,
        resource: resourceFilter !== "all" ? resourceFilter : undefined,
        from: fromMs,
        to: toMs,
      });
      if (!result.count) { toast.error("No events to export"); return; }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count.toLocaleString()} audit events`);
    } catch (err: any) {
      toast.error("Export failed", { description: err.message });
    } finally {
      setIsExporting(false);
    }
  }, [actionFilter, resourceFilter, fromMs, toMs, utils]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-violet-600" />
            Audit Log
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Tamper-evident trail of all actions taken by your team — for compliance and security.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()} disabled={isLoading}><RefreshCw/>
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isExporting ? "Exporting…" : "Download CSV"}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Events", value: total, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "This Page", value: filtered.length, icon: FileText, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Page", value: `${page + 1} / ${Math.max(1, totalPages)}`, icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-lg font-bold leading-none">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by actor, action, resource…"
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={(v: any) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-full sm:w-48 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {(filtersData?.actions ?? []).map((a: string) => (
              <SelectItem key={a} value={a}>{formatAction(a)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resourceFilter} onValueChange={(v: any) => { setResourceFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-full sm:w-44 text-sm">
            <SelectValue placeholder="All resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            {(filtersData?.resources ?? []).map((r: string) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e: any) => { setDateFrom(e.target.value); setPage(0); }}
            className="h-9 w-36 text-sm"
            title="From date"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e: any) => { setDateTo(e.target.value); setPage(0); }}
            className="h-9 w-36 text-sm"
            title="To date"
          />
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setDateFrom(""); setDateTo(""); setPage(0); }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Event timeline */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Events — Last 30 days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-semibold text-muted-foreground">No audit events yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Events will appear here as your team takes actions in the portal.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b mb-1">
                <div className="col-span-3">Actor</div>
                <div className="col-span-4">Action</div>
                <div className="col-span-3">Resource</div>
                <div className="col-span-2 text-right">Time</div>
              </div>
              {filtered.map((event: any) => {
                const ActionIcon = getActionIcon(event.action);
                const colorClass = getActionColor(event.action);
                const isExpanded = expandedId === event.id;
                return (
                  <div key={event.id}>
                    <div
                      className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg border border-transparent hover:bg-muted/30 hover:border-border cursor-pointer transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    >
                      {/* Actor */}
                      <div className="col-span-12 sm:col-span-3 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {(event.actorName ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{event.actorName ?? "System"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{event.actorEmail ?? ""}</p>
                        </div>
                      </div>

                      {/* Action */}
                      <div className="col-span-8 sm:col-span-4 flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                          <ActionIcon className="h-3 w-3" />
                        </div>
                        <p className="text-xs font-medium truncate">{formatAction(event.action)}</p>
                      </div>

                      {/* Resource */}
                      <div className="col-span-4 sm:col-span-3">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          {event.resource}
                        </Badge>
                        {event.resourceId && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">
                            {event.resourceId.slice(0, 12)}…
                          </p>
                        )}
                      </div>

                      {/* Time */}
                      <div className="col-span-12 sm:col-span-2 text-right">
                        <p className="text-[11px] text-muted-foreground">{formatTime(event.createdAt)}</p>
                      </div>
                    </div>

                    {/* Expanded metadata */}
                    {isExpanded && (
                      <div className="mx-3 mb-2 p-3 rounded-lg bg-muted/40 border border-border text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Event Details</span>
                          <button
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(event, null, 2));
                              toast.success("Event JSON copied");
                            }}
                          >
                            <ClipboardCopy className="h-3 w-3" />
                            Copy JSON
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Event ID</p>
                            <p className="font-mono">{event.id}</p>
                          </div>
                          {event.resourceId && (
                            <div>
                              <p className="text-[10px] text-muted-foreground">Resource ID</p>
                              <p className="font-mono">{event.resourceId}</p>
                            </div>
                          )}
                          {event.ipAddress && (
                            <div>
                              <p className="text-[10px] text-muted-foreground">IP Address</p>
                              <p className="font-mono">{event.ipAddress}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] text-muted-foreground">Timestamp</p>
                            <p className="font-mono">{formatTime(event.createdAt)}</p>
                          </div>
                        </div>
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">Metadata</p>
                            <pre className="bg-background rounded p-2 text-[10px] overflow-auto max-h-32 font-mono">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} events
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p: any) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p: any) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
