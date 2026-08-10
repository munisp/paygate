import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert, ShieldCheck, AlertTriangle, Key, FileWarning, CheckCircle2 } from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  JWS_FAILURE: "🔐",
  CERT_EXPIRY: "📜",
  CIRCUIT_OPEN: "⚡",
  AML_FLAG: "🚩",
  FRAUD_BLOCK: "🛡️",
  RATE_LIMIT: "⏱️",
  CERT_REVOKED: "❌",
  SUSPICIOUS_PATTERN: "🔍",
  STR_FILED: "📋",
  SANCTIONS_HIT: "⛔",
  REPLAY_ATTACK: "🔄",
  BRUTE_FORCE: "💥",
};

export default function SecurityDashboard() {
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [acknowledgedFilter, setAcknowledgedFilter] = useState<string>("unack");
  const [page, setPage] = useState(1);

  const { data: stats, refetch: refetchStats } = trpc.nexthubSecurity.getDashboardStats.useQuery();
  const { data: expiring } = trpc.nexthubSecurity.getExpiringCertificates.useQuery({ withinDays: 30 });
  const { data: amlRules, refetch: refetchAml } = trpc.nexthubSecurity.listAmlRules.useQuery();

  const { data, isLoading, refetch } = trpc.nexthubSecurity.listEvents.useQuery({
    page,
    pageSize: 20,
    severity: severityFilter as any,
    acknowledged: acknowledgedFilter === "unack" ? false : acknowledgedFilter === "ack" ? true : undefined,
  });

  const ackMutation = trpc.nexthubSecurity.acknowledgeEvent.useMutation({
    onSuccess: () => { toast.success("Event acknowledged"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const bulkAckMutation = trpc.nexthubSecurity.bulkAcknowledge.useMutation({
    onSuccess: (r) => { toast.success(`Acknowledged ${r.acknowledged} events`); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const toggleAmlMutation = trpc.nexthubSecurity.toggleAmlRule.useMutation({
    onSuccess: () => { toast.success("AML rule updated"); refetchAml(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Security Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Zero-trust event monitoring, AML rules, and certificate lifecycle</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="text-amber-600 border-amber-300"
            onClick={() => bulkAckMutation.mutate({ maxSeverity: "LOW", acknowledgedBy: "operator" })}
            disabled={bulkAckMutation.isPending}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Ack All Low
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={stats?.criticalUnacknowledged ? "border-red-300 bg-red-50" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><ShieldAlert className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Critical Unacked</p>
                <p className="text-xl font-bold text-red-700">{stats?.criticalUnacknowledged ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><AlertTriangle className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Events Today</p>
                <p className="text-xl font-bold text-slate-900">{stats?.eventsToday ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg"><ShieldCheck className="w-4 h-4 text-indigo-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Fraud Blocks (24h)</p>
                <p className="text-xl font-bold text-slate-900">{stats?.fraudBlocksToday ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg"><FileWarning className="w-4 h-4 text-orange-600" /></div>
              <div>
                <p className="text-xs text-slate-500">STR Filed (month)</p>
                <p className="text-xl font-bold text-slate-900">{stats?.strFiledThisMonth ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Certificate expiry warning */}
      {(expiring?.length ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">{expiring!.length} DFSP certificate(s) expiring within 30 days</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {expiring!.map((d) => (
              <Badge key={d.dfspId} variant="outline" className="text-xs border-amber-300 text-amber-700">
                {d.dfspName} — {d.certificateExpiresAt ? new Date(d.certificateExpiresAt).toLocaleDateString() : "unknown"}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="aml">AML Rules ({stats?.enabledRules ?? 0}/{stats?.totalRules ?? 0} active)</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <div className="flex gap-3">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                {["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={acknowledgedFilter} onValueChange={setAcknowledgedFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unack">Unacknowledged</SelectItem>
                <SelectItem value="ack">Acknowledged</SelectItem>
                <SelectItem value="all">All Events</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-slate-400">Loading events...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>DFSP</TableHead>
                      <TableHead>Source IP</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.events ?? []).map((ev) => (
                      <TableRow key={ev.id} className={ev.severity === "CRITICAL" && !ev.acknowledged ? "bg-red-50" : ""}>
                        <TableCell>
                          <span className="text-sm">{EVENT_TYPE_ICONS[ev.eventType] ?? "🔔"} {ev.eventType.replace(/_/g, " ")}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_COLORS[ev.severity] ?? ""}`}>
                            {ev.severity}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{ev.dfspId ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{ev.sourceIp ?? "—"}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{ev.description}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(ev.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {!ev.acknowledged && (
                            <Button size="sm" variant="outline" className="text-xs h-7"
                              onClick={() => ackMutation.mutate({ eventId: ev.id, acknowledgedBy: "operator" })}
                              disabled={ackMutation.isPending}>
                              Ack
                            </Button>
                          )}
                          {ev.acknowledged && (
                            <span className="text-xs text-slate-400">✓ {ev.acknowledgedBy}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(data?.events ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-slate-400 py-8">No security events found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {(data?.total ?? 0) > 20 && (
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data?.total ?? 0)} of {data?.total ?? 0}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page * 20 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="aml">
          <Card>
            <CardHeader><CardTitle className="text-base">AML Rules Engine</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(amlRules ?? []).map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium text-sm">{rule.ruleName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{rule.ruleCategory}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          rule.action === "BLOCK" ? "bg-red-100 text-red-700 border-red-200" :
                          rule.action === "STR" ? "bg-orange-100 text-orange-700 border-orange-200" :
                          rule.action === "REVIEW" ? "bg-amber-100 text-amber-700 border-amber-200" :
                          "bg-slate-100 text-slate-600 border-slate-200"
                        }`}>
                          {rule.action}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={rule.isEnabled}
                          onCheckedChange={(checked) => toggleAmlMutation.mutate({ ruleId: rule.id, isEnabled: checked })}
                          disabled={toggleAmlMutation.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {(amlRules ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-400 py-8">No AML rules configured</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
