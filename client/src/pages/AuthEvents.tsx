import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, RefreshCw, AlertTriangle, CheckCircle, LogIn, LogOut, Search } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

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

export default function AuthEvents() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [eventTypeFilter, setEventTypeFilter] = useState("ALL");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [limit, setLimit] = useState(100);

  const { data, isLoading, refetch, isFetching } = trpc.keycloak.getAuthEvents.useQuery({
    limit,
    eventType: eventTypeFilter === "ALL" ? undefined : eventTypeFilter,
    userId: isAdmin && userIdFilter.trim() ? userIdFilter.trim() : undefined,
  });

  const events = data?.events ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Auth Events
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Keycloak login, logout, and security events for compliance and anomaly detection
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: events.length, icon: <CheckCircle className="w-4 h-4 text-emerald-500" /> },
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
          <CardDescription>Narrow down events by type, user, or result count</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="w-48">
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(et => (
                    <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isAdmin && (
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Filter by Keycloak user ID…"
                  value={userIdFilter}
                  onChange={e => setUserIdFilter(e.target.value)}
                />
              </div>
            )}

            <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[50, 100, 200, 500].map(n => (
                  <SelectItem key={n} value={String(n)}>Last {n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Event Log</CardTitle>
          <CardDescription>
            {isLoading ? "Loading…" : `${events.length} event${events.length !== 1 ? "s" : ""} shown`}
          </CardDescription>
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
                  <TableHead>Session</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No auth events found. Events will appear here once users log in via Keycloak.
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
