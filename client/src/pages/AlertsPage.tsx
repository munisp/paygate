import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Filter,
  RefreshCw,
  CalendarIcon,
  CheckCheck,
  X,
} from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

const PAGE_SIZE = 25;

type SortField = "detectedAt" | "severity" | "metric" | "value";
type SortDir = "asc" | "desc";

function SortIcon({ field, active, dir }: { field: string; active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50 ml-1 inline" />;
  return dir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-primary ml-1 inline" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary ml-1 inline" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "critical") {
    return (
      <Badge variant="destructive" className="text-[11px] font-mono uppercase tracking-wider gap-1">
        <AlertTriangle className="h-3 w-3" />
        Critical
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[11px] font-mono uppercase tracking-wider text-amber-500 border-amber-500/40 gap-1">
      <AlertTriangle className="h-3 w-3" />
      Warning
    </Badge>
  );
}

function MetricLabel({ metric }: { metric: string }) {
  const labels: Record<string, string> = {
    kafka_lag: "Kafka Lag",
    redis_memory: "Redis Memory",
  };
  return <span className="font-mono text-xs text-muted-foreground">{labels[metric] ?? metric}</span>;
}

export default function AlertsPage() {
  const [sortBy, setSortBy] = useState<SortField>("detectedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterMetric, setFilterMetric] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterAcknowledged, setFilterAcknowledged] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const queryInput = useMemo(() => ({
    metric: filterMetric !== "all" ? filterMetric : undefined,
    severity: filterSeverity !== "all" ? (filterSeverity as "warn" | "critical") : undefined,
    acknowledged: filterAcknowledged !== "all" ? filterAcknowledged === "true" : undefined,
    from: dateRange?.from ? dateRange.from.toISOString() : undefined,
    to: dateRange?.to ? dateRange.to.toISOString() : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sortBy,
    sortDir,
  }), [filterMetric, filterSeverity, filterAcknowledged, dateRange, page, sortBy, sortDir]);

  const { data, isLoading, refetch } = trpc.paygate.listBreaches.useQuery(queryInput, {
    refetchInterval: 30_000,
  });

  const acknowledgeMutation = trpc.paygate.acknowledgeBreaches.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.acknowledged} event${result.acknowledged !== 1 ? "s" : ""} acknowledged`, {
        description: "Breach events marked as reviewed",
        duration: 3000,
      });
      setSelectedIds(new Set());
      refetch();
    },
    onError: () => {
      toast.error("Failed to acknowledge events");
    },
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Client-side text search on top of server-side filters
  const filteredEvents = useMemo(() => {
    if (!searchText.trim()) return events;
    const q = searchText.toLowerCase();
    return events.filter(e => e.message.toLowerCase().includes(q) || e.metric.toLowerCase().includes(q));
  }, [events, searchText]);

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(0);
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const unacknowledgedIds = filteredEvents.filter(e => !e.acknowledged).map(e => e.id);
    if (unacknowledgedIds.every(id => selectedIds.has(id)) && unacknowledgedIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unacknowledgedIds));
    }
  }

  function clearFilters() {
    setFilterMetric("all");
    setFilterSeverity("all");
    setFilterAcknowledged("all");
    setDateRange(undefined);
    setSearchText("");
    setPage(0);
  }

  const hasActiveFilters = filterMetric !== "all" || filterSeverity !== "all" || filterAcknowledged !== "all" || dateRange !== undefined || searchText !== "";
  const unacknowledgedSelected = Array.from(selectedIds).filter(id => {
    const ev = filteredEvents.find(e => e.id === id);
    return ev && !ev.acknowledged;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold font-mono tracking-tight text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            BREACH HISTORY
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} event{total !== 1 ? "s" : ""} total · auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unacknowledgedSelected.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-mono"
              onClick={() => acknowledgeMutation.mutate({ ids: unacknowledgedSelected })}
              disabled={acknowledgeMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              ACK {unacknowledgedSelected.length} SELECTED
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs font-mono"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            REFRESH
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-card/50">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <Input
          placeholder="Search messages..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="h-8 w-48 text-xs font-mono"
        />

        <Select value={filterMetric} onValueChange={v => { setFilterMetric(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-xs font-mono">
            <SelectValue placeholder="All metrics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All metrics</SelectItem>
            <SelectItem value="kafka_lag">Kafka Lag</SelectItem>
            <SelectItem value="redis_memory">Redis Memory</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterSeverity} onValueChange={v => { setFilterSeverity(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-32 text-xs font-mono">
            <SelectValue placeholder="All severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterAcknowledged} onValueChange={v => { setFilterAcknowledged(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-xs font-mono">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="false">Unacknowledged</SelectItem>
            <SelectItem value="true">Acknowledged</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs font-mono gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateRange?.from
                ? dateRange.to
                  ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d")}`
                  : format(dateRange.from, "MMM d")
                : "Date range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={range => { setDateRange(range); setPage(0); }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs font-mono gap-1 text-muted-foreground" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={
                    filteredEvents.filter(e => !e.acknowledged).length > 0 &&
                    filteredEvents.filter(e => !e.acknowledged).every(e => selectedIds.has(e.id))
                  }
                  onChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-xs font-mono uppercase tracking-wider"
                onClick={() => toggleSort("detectedAt")}
              >
                Detected <SortIcon field="detectedAt" active={sortBy === "detectedAt"} dir={sortDir} />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-xs font-mono uppercase tracking-wider"
                onClick={() => toggleSort("severity")}
              >
                Severity <SortIcon field="severity" active={sortBy === "severity"} dir={sortDir} />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-xs font-mono uppercase tracking-wider"
                onClick={() => toggleSort("metric")}
              >
                Metric <SortIcon field="metric" active={sortBy === "metric"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-xs font-mono uppercase tracking-wider">Message</TableHead>
              <TableHead
                className="cursor-pointer select-none text-xs font-mono uppercase tracking-wider text-right"
                onClick={() => toggleSort("value")}
              >
                Value <SortIcon field="value" active={sortBy === "value"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-xs font-mono uppercase tracking-wider text-center">Status</TableHead>
              <TableHead className="text-xs font-mono uppercase tracking-wider text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
                  Loading breach events...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filteredEvents.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
                    <p className="text-sm font-medium">No breach events found</p>
                    <p className="text-xs">
                      {hasActiveFilters ? "Try adjusting your filters" : "Trigger a data refresh to check for threshold breaches"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {filteredEvents.map(event => (
              <TableRow
                key={event.id}
                className={`
                  transition-colors
                  ${event.acknowledged ? "opacity-50" : ""}
                  ${selectedIds.has(event.id) ? "bg-primary/5" : ""}
                  ${event.severity === "critical" && !event.acknowledged ? "border-l-2 border-l-destructive" : ""}
                `}
              >
                <TableCell>
                  {!event.acknowledged && (
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={selectedIds.has(event.id)}
                      onChange={() => toggleSelect(event.id)}
                    />
                  )}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  <div>{format(new Date(event.detectedAt), "MMM d, HH:mm:ss")}</div>
                  <div className="text-[10px] opacity-60">{format(new Date(event.detectedAt), "yyyy")}</div>
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={event.severity} />
                </TableCell>
                <TableCell>
                  <MetricLabel metric={event.metric} />
                </TableCell>
                <TableCell className="text-xs max-w-xs">
                  <span className="line-clamp-2">{event.message}</span>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  <span className={event.severity === "critical" ? "text-destructive font-semibold" : "text-amber-500"}>
                    {event.value}
                  </span>
                  <span className="text-muted-foreground text-[10px] ml-0.5">
                    /{event.threshold}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {event.acknowledged ? (
                    <Badge variant="outline" className="text-[10px] font-mono gap-1 text-emerald-500 border-emerald-500/40">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      ACK
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                      OPEN
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!event.acknowledged && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] font-mono px-2"
                      onClick={() => acknowledgeMutation.mutate({ ids: [event.id] })}
                      disabled={acknowledgeMutation.isPending}
                    >
                      <CheckCheck className="h-3 w-3 mr-1" />
                      ACK
                    </Button>
                  )}
                  {event.acknowledged && event.acknowledgedAt && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {format(new Date(event.acknowledgedAt), "HH:mm")}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs font-mono"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              ← Prev
            </Button>
            <span className="px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs font-mono"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
