// @ts-nocheck
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Globe, Shield, RefreshCw, AlertTriangle, CheckCircle, LogIn, LogOut, Search, Download, ChevronLeft, ChevronRight, CalendarIcon, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

/** Typed shape returned by trpc.middleware.keycloak.getAuthEvents */
interface AuthEvent {
  id: number;
  event_type: string;
  realm_id: string | null;
  client_id: string | null;
  user_id: string | null;
  session_id: string | null;
  ip_address: string | null;
  geo_country: string | null;
  geo_city: string | null;
  geo_anomaly_acknowledged: boolean | null;
  error: string | null;
  details: Record<string, unknown> | null;
  received_at: Date | string;
}

const EVENT_TYPES = [
  { value: "ALL", label: "All Events" },
  { value: "LOGIN", label: "Login" },
  { value: "LOGOUT", label: "Logout" },
  { value: "LOGIN_ERROR", label: "Login Failed" },
  { value: "TOKEN_REFRESH", label: "Token Refresh" },
  { value: "REGISTER", label: "Registration" },
  { value: "UPDATE_PASSWORD", label: "Password Change" },
  { value: "UPDATE_PROFILE", label: "Profile Update" },
  { value: "VERIFY_EMAIL", label: "Email Verified" },
  { value: "RESET_PASSWORD", label: "Password Reset" },
  { value: "SEND_VERIFY_EMAIL", label: "Verification Email Sent" },
  { value: "CONFIGURE_TOTP", label: "TOTP Configured" },
  { value: "REMOVE_TOTP", label: "TOTP Removed" },
  { value: "CODE_TO_TOKEN", label: "Code Exchange" },
  { value: "INTROSPECT_TOKEN", label: "Token Introspection" },
];

const DATE_PRESETS = [
  { label: "Today", from: () => startOfDay(new Date()), to: () => endOfDay(new Date()) },
  { label: "Last 7 days", from: () => startOfDay(subDays(new Date(), 6)), to: () => endOfDay(new Date()) },
  { label: "Last 30 days", from: () => startOfDay(subDays(new Date(), 29)), to: () => endOfDay(new Date()) },
  { label: "Last 90 days", from: () => startOfDay(subDays(new Date(), 89)), to: () => endOfDay(new Date()) },
];

const PAGE_SIZE = 50;

function eventBadge(eventType: string) {
  if (eventType.endsWith("_ERROR")) {
    return <Badge variant="destructive" className="gap-1 text-xs"><AlertTriangle className="w-3 h-3" />{eventType}</Badge>;
  }
  if (eventType === "LOGIN") {
    return <Badge variant="default" className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"><LogIn className="w-3 h-3" />{eventType}</Badge>;
  }
  if (eventType === "LOGOUT") {
    return <Badge variant="secondary" className="gap-1 text-xs"><LogOut className="w-3 h-3" />{eventType}</Badge>;
  }
  if (eventType === "CONFIGURE_TOTP") {
    return <Badge variant="default" className="gap-1 text-xs bg-blue-600 hover:bg-blue-700"><Shield className="w-3 h-3" />{eventType}</Badge>;
  }
  return <Badge variant="outline" className="text-xs">{eventType}</Badge>;
}

function formatTimestamp(ts: Date | string) {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AuthEvents() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Filter state
  const [eventTypeFilter, setEventTypeFilter] = useState("ALL");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [newCountryOnly, setNewCountryOnly] = useState(false);

  // Read URL params on mount (deep-link from Active Sessions geo badge)
  const [urlParamsRead] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      userId: params.get("userId") ?? "",
      newCountryOnly: params.get("newCountryOnly") === "true",
    };
  });
  // Apply URL params once on mount
  const [urlParamsApplied, setUrlParamsApplied] = useState(false);
  if (!urlParamsApplied && (urlParamsRead.userId || urlParamsRead.newCountryOnly)) {
    if (urlParamsRead.userId) setUserIdFilter(urlParamsRead.userId);
    if (urlParamsRead.newCountryOnly) setNewCountryOnly(true);
    setUrlParamsApplied(true);
  }

  // Pagination
  const [page, setPage] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Stable query input — reset page when filters change
  const queryInput = useMemo(() => ({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    eventType: eventTypeFilter === "ALL" ? undefined : eventTypeFilter,
    userId: isAdmin && userIdFilter.trim() ? userIdFilter.trim() : undefined,
    fromDate: fromDate ? startOfDay(fromDate) : undefined,
    toDate: toDate ? endOfDay(toDate) : undefined,
    newCountryOnly: newCountryOnly || undefined,
  }), [page, eventTypeFilter, userIdFilter, fromDate, toDate, isAdmin, newCountryOnly]);

  const { data, isLoading, refetch, isFetching } = trpc.middleware.keycloak.getAuthEvents.useQuery(queryInput, { staleTime: 30_000 });

  const exportQueryInput = useMemo(() => ({
    format: "csv" as const,
    userId: isAdmin && userIdFilter.trim() ? userIdFilter.trim() : undefined,
    eventType: eventTypeFilter === "ALL" ? undefined : eventTypeFilter,
    fromDate: fromDate ? startOfDay(fromDate) : undefined,
    toDate: toDate ? endOfDay(toDate) : undefined,
    limit: 5000,
  }), [eventTypeFilter, userIdFilter, fromDate, toDate, isAdmin]);

  const exportJsonQueryInput = useMemo(() => ({
    ...exportQueryInput,
    format: "json" as const,
  }), [exportQueryInput]);

  const exportQuery = trpc.middleware.keycloak.exportAuthEvents.useQuery(exportQueryInput, { enabled: false }, { staleTime: 30_000 });
  const exportJsonQuery = trpc.middleware.keycloak.exportAuthEvents.useQuery(exportJsonQueryInput, { enabled: false }, { staleTime: 30_000 });

  const handleExportCsv = async () => {
    if (!isAdmin) { toast.error("Admin access required"); return; }
    setIsExporting(true);
    try {
      const result = await exportQuery.refetch();
      if (result.data?.data) {
        const timestamp = new Date().toISOString().slice(0, 10);
        downloadFile(result.data.data, `auth-events-${timestamp}.csv`, "text/csv;charset=utf-8;");
        toast.success(`Exported ${result.data.count} events as CSV`);
      }
    } catch { toast.error("Export failed"); }
    finally { setIsExporting(false); }
  };

  const handleExportJson = async () => {
    if (!isAdmin) { toast.error("Admin access required"); return; }
    setIsExporting(true);
    try {
      const result = await exportJsonQuery.refetch();
      if (result.data?.data) {
        const timestamp = new Date().toISOString().slice(0, 10);
        downloadFile(result.data.data, `auth-events-${timestamp}.json`, "application/json");
        toast.success(`Exported ${result.data.count} events as JSON`);
      }
    } catch { toast.error("Export failed"); }
    finally { setIsExporting(false); }
  };

  const applyPreset = (preset: typeof DATE_PRESETS[0]) => {
    setFromDate(preset.from());
    setToDate(preset.to());
    setPage(0);
  };

  const clearDates = () => {
    setFromDate(undefined);
    setToDate(undefined);
    setPage(0);
  };

  const events = (data?.events ?? []) as AuthEvent[];

  const acknowledgeGeoAnomaly = trpc.middleware.keycloak.acknowledgeGeoAnomaly.useMutation({
    onSuccess: () => {
      toast.success("Geo anomaly alert dismissed");
      refetch();
    },
    onError: (err) => toast.error(`Failed to dismiss: ${err.message}`),
  });
  const hasNextPage = events.length === PAGE_SIZE;
  const hasPrevPage = page > 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Auth Events
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Keycloak login, logout, and security events for compliance and anomaly detection
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isExporting || isLoading} className="gap-2">
                <Download className="w-4 h-4" />Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJson} disabled={isExporting || isLoading} className="gap-2">
                <Download className="w-4 h-4" />Export JSON
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()} disabled={isFetching} className="gap-2"><RefreshCw/>
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Shown", value: events.length, icon: <CheckCircle className="w-4 h-4 text-emerald-500" /> },
          { label: "Logins", value: events.filter(e => e.event_type === "LOGIN").length, icon: <LogIn className="w-4 h-4 text-blue-500" /> },
          { label: "Logouts", value: events.filter(e => e.event_type === "LOGOUT").length, icon: <LogOut className="w-4 h-4 text-slate-500" /> },
          { label: "Failures", value: events.filter(e => e.event_type.endsWith("_ERROR")).length, icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                {card.icon}
              </div>
              <p className="text-2xl font-bold mt-1">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Narrow down events by type, user, or date range</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date presets */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium">Quick range:</span>
            {DATE_PRESETS.map(p => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
            {(fromDate || toDate) && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={clearDates}>
                <X className="w-3 h-3" />Clear dates
              </Button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-3 items-end">
            {/* Event type */}
            <div className="space-y-1">
              <Label className="text-xs">Event Type</Label>
              <Select value={eventTypeFilter} onValueChange={v => { setEventTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(et => (
                    <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* From date */}
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-40 justify-start gap-2 text-sm font-normal">
                    <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    {fromDate ? format(fromDate, "MMM d, yyyy") : <span className="text-muted-foreground">Pick date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={d => { setFromDate(d); setFromOpen(false); setPage(0); }}
                    disabled={date => toDate ? date > toDate : false}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* To date */}
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Popover open={toOpen} onOpenChange={setToOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-40 justify-start gap-2 text-sm font-normal">
                    <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    {toDate ? format(toDate, "MMM d, yyyy") : <span className="text-muted-foreground">Pick date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={d => { setToDate(d); setToOpen(false); setPage(0); }}
                    disabled={date => fromDate ? date < fromDate : false}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* User ID search (admin only) */}
            {isAdmin && (
              <div className="space-y-1">
                <Label className="text-xs">User ID</Label>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Filter by Keycloak user ID…"
                    value={userIdFilter}
                    onChange={e => { setUserIdFilter(e.target.value); setPage(0); }}
                  />
                </div>
              </div>
            )}

            {/* New Country Only toggle */}
            {isAdmin && (
              <div className="space-y-1">
                <Label className="text-xs">Geo Alerts</Label>
                <Button
                  variant={newCountryOnly ? "default" : "outline"}
                  size="sm"
                  className={`gap-2 h-10 ${newCountryOnly ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" : ""}`}
                  onClick={() => { setNewCountryOnly(v => !v); setPage(0); }}
                  title="Show only unacknowledged new-country LOGIN events"
                >
                  <Globe className="w-4 h-4" />
                  New Country Only
                  {newCountryOnly && <X className="w-3 h-3 ml-1" />}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Event Log</CardTitle>
              <CardDescription>
                {isLoading ? "Loading…" : `${events.length} event${events.length !== 1 ? "s" : ""} on page ${page + 1}`}
                {(fromDate || toDate) && (
                  <span className="ml-2 text-xs text-primary">
                    {fromDate && `from ${format(fromDate, "MMM d")}`}
                    {fromDate && toDate && " – "}
                    {toDate && `to ${format(toDate, "MMM d")}`}
                  </span>
                )}
                {isAdmin && <span className="ml-2 text-muted-foreground">· Export buttons download up to 5,000 events</span>}
              </CardDescription>
            </div>
            {/* Pagination controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={!hasPrevPage || isFetching}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">Page {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={!hasNextPage || isFetching}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No auth events found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map(event => (
                    <TableRow key={event.id} className={event.event_type.endsWith("_ERROR") ? "bg-red-50/40 dark:bg-red-950/20" : ""}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(event.received_at)}
                      </TableCell>
                      <TableCell>{eventBadge(event.event_type)}</TableCell>
                      <TableCell className="text-xs font-mono max-w-[140px] truncate" title={event.user_id ?? ""}>
                        {event.user_id ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {event.client_id ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {event.ip_address ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          {event.geo_city || event.geo_country
                            ? <span>{[event.geo_city, event.geo_country].filter(Boolean).join(", ")}</span>
                            : <span className="text-muted-foreground">—</span>}
                          {/* Show dismiss button for unacknowledged new-country LOGIN events */}
                          {event.event_type === "LOGIN" && event.geo_country && !event.geo_anomaly_acknowledged && isAdmin && (
                            <button
                              title="Dismiss new-country alert"
                              className="ml-1 text-amber-500 hover:text-amber-700"
                              onClick={() => acknowledgeGeoAnomaly.mutate({ eventId: event.id })}
                            >
                              <Globe className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[120px] truncate" title={event.session_id ?? ""}>
                        {event.session_id ? event.session_id.slice(0, 12) + "…" : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-red-600 dark:text-red-400 max-w-[160px] truncate" title={event.error ?? ""}>
                        {event.error ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
