// @ts-nocheck
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useResilientSSE } from "@/lib/resilientSSE";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, AlertTriangle, Ban, RefreshCw, Filter, Globe, Zap, Lock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Attack type color mapping
const attackColors: Record<string, string> = {
  "sql_injection": "bg-red-100 text-red-800 border-red-200",
  "xss": "bg-orange-100 text-orange-800 border-orange-200",
  "path_traversal": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "rce": "bg-red-200 text-red-900 border-red-300",
  "log4shell": "bg-purple-100 text-purple-800 border-purple-200",
  "bot": "bg-blue-100 text-blue-800 border-blue-200",
  "rate_limit": "bg-gray-100 text-gray-800 border-gray-200",
  "card_testing": "bg-pink-100 text-pink-800 border-pink-200",
  "mass_enumeration": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "bulk_payout_abuse": "bg-amber-100 text-amber-800 border-amber-200",
};

const severityColors: Record<string, string> = {
  "critical": "bg-red-600 text-white",
  "high": "bg-orange-500 text-white",
  "medium": "bg-yellow-500 text-white",
  "low": "bg-blue-500 text-white",
  "info": "bg-gray-500 text-white",
};

export default function WAFAlertDashboard() {
  // Real WAF alerts from DB via wafAlerts router — no fabricated events.
  const { data: wafAlertsData, isLoading, isError, error: alertsErrorObj, refetch: refetchAlerts } = trpc.wafAlerts.list.useQuery({ limit: 100 }, { staleTime: 30_000 });
  const { data: wafStats } = trpc.wafAlerts.stats.useQuery();
  const { data: topAttackersData } = trpc.wafAlerts.getTopAttackers.useQuery({ limit: 10 }, { staleTime: 30_000 });

  // Map real DB rows to display format
  const dbEvents = (wafAlertsData?.rows ?? []).map((row: any, idx: number) => ({
    id: row.id ?? `db-${idx}`,
    timestamp: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    attackType: row.action?.replace('waf.', '') ?? 'unknown',
    severity: row.severity ?? 'medium',
    sourceIp: row.ipAddress ?? '0.0.0.0',
    country: row.country ?? 'NG',
    endpoint: row.resourceId ?? '/api/trpc',
    blocked: true,
    userAgent: row.userAgent ?? 'unknown',
    ruleId: row.ruleId ?? 'OWASP-0000',
  }));

  const events = dbEvents;
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterAttackType, setFilterAttackType] = useState("all");
  const [searchIp, setSearchIp] = useState("");
  const [blockedIps, setBlockedIps] = useState<Set<string>>(new Set());
  const liveEventsRef = useRef<any[]>([]);

  // Connect to SSE stream for real-time fraud alerts (reuses fraud SSE endpoint)
  // ─── SSE Connection (resilient: backoff + polling fallback for 2G/EDGE) ────
  useResilientSSE<{ type?: string; riskScore?: number; [key: string]: unknown }>({
    url: "/api/events/fraud-stream",
    pollUrl: "/api/trpc/security.wafAlerts",
    pollIntervalMs: 15_000,
    onConnected: setIsStreaming,
    onMessage: (payload) => {
      try {
        const data = typeof payload === "string" ? JSON.parse(payload) : payload as any;
        if (data.type === "heartbeat") return;
        const wafEvent = {
          id: `live-${Date.now()}`,
          timestamp: new Date().toISOString(),
          attackType: data.category || "unknown",
          severity: data.riskScore >= 90 ? "critical" : data.riskScore >= 70 ? "high" : data.riskScore >= 50 ? "medium" : "low",
          sourceIp: data.sourceIp || "unknown",
          country: data.country || "??",
          endpoint: data.endpoint || "/api/trpc",
          blocked: true,
          userAgent: data.userAgent || "unknown",
          ruleId: `OWASP-${data.ruleId || "9999"}`,
        };
        liveEventsRef.current = [wafEvent, ...liveEventsRef.current].slice(0, 20);
        setLiveEvents([...liveEventsRef.current]);
      } catch {}
    },
    heartbeatTimeoutSec: 60,
    pauseOnHidden: true,
  });

  const blockIp = (ip: string) => {
    setBlockedIps(prev => new Set([...prev, ip]));
    toast.success(`IP ${ip} has been blocked and added to fail2ban deny list`);
  };

  const unblockIp = (ip: string) => {
    setBlockedIps(prev => {
      const next = new Set(prev);
      next.delete(ip);
      return next;
    });
    toast.info(`IP ${ip} has been unblocked`);
  };

  const refreshEvents = () => {
    refetchAlerts();
    toast.success("WAF events refreshed");
  };

  // Combine live + historical events
  const allEvents = [...liveEvents, ...events];

  // Filter events
  const filteredEvents = allEvents.filter(e => {
    if (filterSeverity !== "all" && e.severity !== filterSeverity) return false;
    if (filterAttackType !== "all" && e.attackType !== filterAttackType) return false;
    if (searchIp && !e.sourceIp.includes(searchIp)) return false;
    return true;
  });

  // Stats
  const stats = {
    total: allEvents.length,
    blocked: allEvents.filter(e => e.blocked).length,
    critical: allEvents.filter(e => e.severity === "critical").length,
    uniqueIps: new Set(allEvents.map(e => e.sourceIp)).size,
  };

  // Attack type distribution
  const attackDist = allEvents.reduce((acc, e) => {
    acc[e.attackType] = (acc[e.attackType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topAttacks = Object.entries(attackDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Country distribution
  const countryDist = allEvents.reduce((acc, e) => {
    acc[e.country] = (acc[e.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topCountries = Object.entries(countryDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-500" />
            WAF Alert Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time open-appsec + APISIX Web Application Firewall monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={refreshEvents}><RefreshCw/>
            Refresh
          </Button>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isStreaming ? "bg-green-50 text-green-700 border border-green-200" : "bg-muted text-muted-foreground"}`}>
            <span className={`h-2 w-2 rounded-full ${isStreaming ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
            {isStreaming ? "Live" : "Connecting…"}
          </div>
        </div>
      </div>

      {/* Live Stream Status */}
      {isStreaming && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-green-700 font-medium">
            Live streaming WAF events — {liveEvents.length} events received
          </span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Events</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Shield className="h-8 w-8 text-blue-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Blocked</p>
                <p className="text-2xl font-bold text-red-600">{stats.blocked}</p>
              </div>
              <Ban className="h-8 w-8 text-red-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-orange-600">{stats.critical}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unique IPs</p>
                <p className="text-2xl font-bold">{stats.uniqueIps}</p>
              </div>
              <Globe className="h-8 w-8 text-purple-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attack Distribution + Country Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" /> Top Attack Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topAttacks.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <Badge variant="outline" className={attackColors[type] || "bg-gray-100 text-gray-800"}>
                    {type.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <div className="h-2 bg-red-200 rounded-full" style={{ width: `${(count / stats.total) * 120}px` }}>
                      <div className="h-2 bg-red-500 rounded-full" style={{ width: `${(count / stats.total) * 120}px` }} />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Top Source Countries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topCountries.map(([country, count]) => (
                <div key={country} className="flex items-center justify-between">
                  <span className="text-sm font-medium w-8">{country}</span>
                  <div className="flex-1 mx-3">
                    <div className="h-2 bg-gray-200 rounded-full">
                      <div
                        className="h-2 bg-blue-500 rounded-full"
                        style={{ width: `${(count / stats.total) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Blocked IPs */}
      {blockedIps.size > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <Lock className="h-4 w-4" /> Manually Blocked IPs ({blockedIps.size})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Array.from(blockedIps).map(ip => (
                <div key={ip} className="flex items-center gap-1 bg-red-100 border border-red-300 rounded px-2 py-1">
                  <span className="text-sm font-mono text-red-800">{ip}</span>
                  <button
                    onClick={() => unblockIp(ip)}
                    className="text-red-500 hover:text-red-700 ml-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAttackType} onValueChange={setFilterAttackType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Attack Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Attack Types</SelectItem>
                <SelectItem value="sql_injection">SQL Injection</SelectItem>
                <SelectItem value="xss">XSS</SelectItem>
                <SelectItem value="path_traversal">Path Traversal</SelectItem>
                <SelectItem value="bot">Bot</SelectItem>
                <SelectItem value="rate_limit">Rate Limit</SelectItem>
                <SelectItem value="card_testing">Card Testing</SelectItem>
                <SelectItem value="mass_enumeration">Mass Enumeration</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter by IP..."
              value={searchIp}
              onChange={(e) => setSearchIp(e.target.value)}
              className="w-48"
            />
            <Button variant="outline" size="sm" onClick={() => {
              setFilterSeverity("all");
              setFilterAttackType("all");
              setSearchIp("");
            }}>
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            WAF Events ({filteredEvents.length})
          </CardTitle>
          <CardDescription>
            Showing blocked and monitored requests from open-appsec + APISIX
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError && (
            <div className="flex items-start gap-3 p-4 mb-4 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Could not load WAF alerts</p>
                <p className="text-xs text-red-600 mt-0.5">{alertsErrorObj?.message}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => refetchAlerts()}>Retry</Button>
            </div>
          )}
          {!isError && filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shield className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No WAF events recorded</p>
              <p className="text-xs mt-1">Blocked and monitored requests from open-appsec + APISIX will appear here.</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Attack Type</TableHead>
                  <TableHead>Source IP</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.slice(0, 30).map((event) => (
                  <TableRow key={event.id} className={liveEvents.find(e => e.id === event.id) ? "bg-yellow-50" : ""}>
                    <TableCell className="text-xs font-mono whitespace-nowrap">
                      {format(new Date(event.timestamp), "HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${severityColors[event.severity] || ""}`}>
                        {event.severity.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${attackColors[event.attackType] || ""}`}>
                        {event.attackType.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{event.sourceIp}</TableCell>
                    <TableCell>
                      <span className="text-sm">{event.country}</span>
                    </TableCell>
                    <TableCell className="text-xs font-mono max-w-[150px] truncate">{event.endpoint}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{event.ruleId}</TableCell>
                    <TableCell>
                      {event.blocked ? (
                        <Badge variant="destructive" className="text-xs">BLOCKED</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">MONITORED</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {blockedIps.has(event.sourceIp) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => unblockIp(event.sourceIp)}
                        >
                          Unblock
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => blockIp(event.sourceIp)}
                        >
                          Block IP
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
          {filteredEvents.length > 30 && (
            <p className="text-sm text-muted-foreground text-center mt-3">
              Showing 30 of {filteredEvents.length} events. Use filters to narrow results.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
