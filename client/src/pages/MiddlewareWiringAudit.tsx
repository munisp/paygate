import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Loader2, Server, Database, Zap, Shield, Lock, Radio,
  BarChart3, Globe, Key, Network, Cpu, HelpCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    green:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    degraded:"bg-amber-500/10 text-amber-400 border-amber-500/20",
    down:    "bg-red-500/10 text-red-400 border-red-500/20",
    unknown: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  const icon = status === "ok" || status === "healthy" || status === "green"
    ? <CheckCircle className="w-3 h-3" />
    : status === "degraded"
    ? <AlertTriangle className="w-3 h-3" />
    : status === "down"
    ? <XCircle className="w-3 h-3" />
    : <HelpCircle className="w-3 h-3" />;

  return (
    <Badge className={`border text-xs flex items-center gap-1 ${map[status] ?? map.unknown}`}>
      {icon}{status}
    </Badge>
  );
}

// ─── Service icon map ─────────────────────────────────────────────────────────
const SERVICE_ICONS: Record<string, React.ReactNode> = {
  "go-bridge":   <Network className="w-4 h-4" />,
  kafka:         <Radio className="w-4 h-4" />,
  fluvio:        <Zap className="w-4 h-4" />,
  redis:         <Database className="w-4 h-4" />,
  temporal:      <Activity className="w-4 h-4" />,
  keycloak:      <Key className="w-4 h-4" />,
  permify:       <Lock className="w-4 h-4" />,
  dapr:          <Cpu className="w-4 h-4" />,
  nibss:         <Globe className="w-4 h-4" />,
  tigerbeetle:   <BarChart3 className="w-4 h-4" />,
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MiddlewareWiringAudit() {
  const [nibssAccount, setNibssAccount] = useState("");
  const [nibssBankCode, setNibssBankCode] = useState("044");
  const [permifyChecks, setPermifyChecks] = useState([
    { subject: "admin", permission: "read", resource: "transaction" },
    { subject: "viewer", permission: "write", resource: "payout" },
    { subject: "merchant", permission: "read", resource: "customer" },
  ]);

  const utils = trpc.useUtils();

  const { data: auditData, isLoading: auditLoading, refetch: refetchAudit } =
    trpc.middlewareWiringAudit.wiringAudit.useQuery(undefined, { staleTime: 30_000 });

  const { data: daprHealth } = trpc.middlewareWiringAudit.dapr.health.useQuery(undefined, { staleTime: 30_000 });
  const { data: daprPubSub } = trpc.middlewareWiringAudit.dapr.pubsub.useQuery(undefined, { staleTime: 30_000 });
  const { data: nibssHealth } = trpc.middlewareWiringAudit.nibss.health.useQuery(undefined, { staleTime: 30_000 });
  const { data: nipStats } = trpc.middlewareWiringAudit.nibss.nipStats.useQuery({}, { staleTime: 30_000 });
  const { data: bankList } = trpc.middlewareWiringAudit.nibss.bankList.useQuery(undefined, { staleTime: 60_000 });
  const { data: fluvioLag } = trpc.middlewareWiringAudit.fluvio.consumerLag.useQuery(undefined, { staleTime: 30_000 });
  const { data: redisPipeline } = trpc.middlewareWiringAudit.redis.pipeline.useQuery(undefined, { staleTime: 30_000 });
  const { data: tbAudit } = trpc.middlewareWiringAudit.tigerbeetle.balanceAudit.useQuery(undefined, { staleTime: 60_000 });
  const { data: keycloakStats } = trpc.middlewareWiringAudit.keycloak.realmStats.useQuery(undefined, { staleTime: 60_000 });
  const { data: permifyHealth } = trpc.middlewareWiringAudit.permify.health.useQuery(undefined, { staleTime: 30_000 });

  const nameEnquiryMutation = trpc.middlewareWiringAudit.nibss.nameEnquiry.useMutation({
    onSuccess: (data) => toast.success(`Account: ${data.accountName}`),
    onError: (e: any) => toast.error(e.message),
  });

  const bulkCheckMutation = trpc.middlewareWiringAudit.permify.bulkCheck.useMutation({
    onSuccess: (data) => toast.success(`${data.results.filter((r: any) => r.allowed).length}/${data.results.length} allowed`),
    onError: (e: any) => toast.error(e.message),
  });

  const audit = auditData as any;
  const dp = daprHealth as any;
  const ps = daprPubSub as any;
  const nh = nibssHealth as any;
  const ns = nipStats as any;
  const bl = bankList as any;
  const fl = fluvioLag as any;
  const rp = redisPipeline as any;
  const tb = tbAudit as any;
  const ks = keycloakStats as any;
  const ph = permifyHealth as any;

  const healthPct = audit?.summary?.healthPct ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Middleware Wiring Audit</h1>
          <p className="text-zinc-400 mt-1">Kafka, Dapr, Fluvio, Temporal, Keycloak, Permify, Redis, NIBSS, TigerBeetle</p>
        </div>
        <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" aria-label="Refresh" onClick={() => refetchAudit()}><RefreshCw/>
          Refresh All
        </Button>
      </div>

      {/* Summary */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold font-mono ${healthPct >= 80 ? "text-emerald-400" : healthPct >= 60 ? "text-amber-400" : "text-red-400"}`}>
                {auditLoading ? "—" : `${healthPct}%`}
              </div>
              <div>
                <p className="text-sm text-white font-medium">Middleware Health</p>
                <p className="text-xs text-zinc-500">
                  {audit?.summary?.healthy ?? 0} healthy · {audit?.summary?.degraded ?? 0} degraded · {audit?.summary?.down ?? 0} down · {audit?.summary?.unknown ?? 0} unknown
                </p>
              </div>
            </div>
            {audit?.auditedAt && (
              <p className="text-xs text-zinc-600">Last checked: {new Date(audit.auditedAt).toLocaleTimeString()}</p>
            )}
          </div>
          <Progress value={healthPct} className="h-2 bg-zinc-800" />
          {auditLoading ? (
            <div className="flex items-center justify-center h-16 mt-4">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              {(audit?.services ?? []).map((svc: any) => (
                <div key={svc.service} className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <div className="text-zinc-400 shrink-0">
                    {SERVICE_ICONS[svc.service] ?? <Server className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-300 truncate">{svc.service}</p>
                    <StatusBadge status={svc.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="dapr" className="space-y-4">
        <TabsList className="bg-zinc-900 border border-zinc-800 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="dapr" className="data-[state=active]:bg-zinc-800">Dapr</TabsTrigger>
          <TabsTrigger value="nibss" className="data-[state=active]:bg-zinc-800">NIBSS</TabsTrigger>
          <TabsTrigger value="fluvio" className="data-[state=active]:bg-zinc-800">Fluvio Lag</TabsTrigger>
          <TabsTrigger value="keycloak" className="data-[state=active]:bg-zinc-800">Keycloak</TabsTrigger>
          <TabsTrigger value="permify" className="data-[state=active]:bg-zinc-800">Permify</TabsTrigger>
          <TabsTrigger value="redis" className="data-[state=active]:bg-zinc-800">Redis</TabsTrigger>
          <TabsTrigger value="tigerbeetle" className="data-[state=active]:bg-zinc-800">TigerBeetle</TabsTrigger>
        </TabsList>

        {/* Dapr Tab */}
        <TabsContent value="dapr">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  Dapr Sidecar Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dp ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 text-sm">Status</span>
                      <StatusBadge status={dp.status ?? "unknown"} />
                    </div>
                    {dp.version && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-sm">Version</span>
                        <span className="text-sm font-mono text-zinc-300">{dp.version}</span>
                      </div>
                    )}
                    {dp.components && (
                      <div>
                        <span className="text-zinc-400 text-xs">Components</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dp.components.map((c: string) => (
                            <Badge key={c} className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : <p className="text-zinc-500 text-sm">Loading...</p>}
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Pub/Sub Topics</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(ps?.topics ?? []).map((t: any) => (
                  <div key={t.name} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <div>
                      <p className="text-xs font-mono text-zinc-300">{t.name}</p>
                      <p className="text-xs text-zinc-600">{t.component}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-400">{t.subscriptions} subscribers</p>
                      <p className="text-xs text-zinc-600">{t.messagesPerSec} msg/s</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* NIBSS Tab */}
        <TabsContent value="nibss">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-green-400" />
                  NIP Gateway Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {nh && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 text-sm">Status</span>
                      <StatusBadge status={nh.status ?? "unknown"} />
                    </div>
                    {nh.latencyMs != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-sm">Latency</span>
                        <span className={`text-sm font-mono ${nh.latencyMs > 500 ? "text-red-400" : "text-emerald-400"}`}>{nh.latencyMs}ms</span>
                      </div>
                    )}
                    {bl && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-sm">Bank List</span>
                        <span className="text-sm text-zinc-300">{bl.count} banks ({bl.source})</span>
                      </div>
                    )}
                  </>
                )}
                {ns && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Today's NIP Stats</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded bg-zinc-800/50">
                        <p className="text-xs text-zinc-500">Total</p>
                        <p className="text-lg font-bold font-mono text-white">{ns.totalToday?.toLocaleString()}</p>
                      </div>
                      <div className="p-2 rounded bg-zinc-800/50">
                        <p className="text-xs text-zinc-500">Success Rate</p>
                        <p className="text-lg font-bold font-mono text-emerald-400">{ns.successRate}%</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Name Enquiry (NIP)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Account Number</label>
                  <Input
                    value={nibssAccount}
                    onChange={e => setNibssAccount(e.target.value)}
                    placeholder="0123456789"
                    maxLength={10}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Bank Code</label>
                  <Input
                    value={nibssBankCode}
                    onChange={e => setNibssBankCode(e.target.value)}
                    placeholder="044"
                    maxLength={6}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={nibssAccount.length !== 10 || nameEnquiryMutation.isPending}
                  onClick={() => nameEnquiryMutation.mutate({ accountNumber: nibssAccount, bankCode: nibssBankCode })}
                >
                  {nameEnquiryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Enquire Name
                </Button>
                {nameEnquiryMutation.data && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-sm font-semibold text-emerald-400">{(nameEnquiryMutation.data as any).accountName}</p>
                    <p className="text-xs text-zinc-500 mt-1">Session: {(nameEnquiryMutation.data as any).sessionId}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Fluvio Lag Tab */}
        <TabsContent value="fluvio">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Consumer Group Lag
                {fl?.totalLag != null && (
                  <Badge className={`ml-2 border text-xs ${fl.totalLag > 100 ? "bg-red-500/10 text-red-400 border-red-500/20" : fl.totalLag > 20 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                    Total lag: {fl.totalLag}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(fl?.groups ?? []).map((g: any) => (
                <div key={g.group} className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <div>
                    <p className="text-sm font-mono text-zinc-300">{g.group}</p>
                    <p className="text-xs text-zinc-600">{g.topic} · {g.members} members</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-lg font-bold font-mono ${g.lag > 50 ? "text-red-400" : g.lag > 10 ? "text-amber-400" : "text-emerald-400"}`}>{g.lag}</p>
                      <p className="text-xs text-zinc-600">messages behind</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keycloak Tab */}
        <TabsContent value="keycloak">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                Keycloak Realm Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ks ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Realm", value: ks.realm },
                    { label: "Active Users", value: ks.activeUsers },
                    { label: "Sessions", value: ks.sessions },
                    { label: "Clients", value: ks.clients },
                  ].map(item => (
                    <div key={item.label} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                      <p className="text-xs text-zinc-500">{item.label}</p>
                      <p className="text-xl font-bold font-mono text-white mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-zinc-500 text-sm">Loading Keycloak stats...</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Permify Tab */}
        <TabsContent value="permify">
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-400" />
                  Permify Health
                  {ph && <StatusBadge status={ph.status} />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={bulkCheckMutation.isPending}
                  onClick={() => bulkCheckMutation.mutate({ checks: permifyChecks })}
                >
                  {bulkCheckMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Run Bulk Permission Check ({permifyChecks.length} checks)
                </Button>
                {bulkCheckMutation.data && (
                  <div className="mt-3 space-y-2">
                    {(bulkCheckMutation.data as any).results.map((r: any, i: number) => (
                      <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${r.allowed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                        <span className="text-xs font-mono text-zinc-300">{r.subject} → {r.permission} → {r.resource}</span>
                        <Badge className={`border text-xs ${r.allowed ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                          {r.allowed ? "ALLOW" : "DENY"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Redis Tab */}
        <TabsContent value="redis">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-red-400" />
                Redis Pipeline Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rp ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Memory", value: `${rp.usedMemoryMb}MB`, color: "text-white" },
                    { label: "Keys", value: rp.keyCount?.toLocaleString(), color: "text-white" },
                    { label: "Hit Rate", value: `${(rp.hitRate * 100).toFixed(1)}%`, color: rp.hitRate > 0.9 ? "text-emerald-400" : "text-amber-400" },
                    { label: "Latency", value: `${rp.latencyMicros}μs`, color: rp.latencyMicros < 500 ? "text-emerald-400" : "text-amber-400" },
                  ].map(item => (
                    <div key={item.label} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                      <p className="text-xs text-zinc-500">{item.label}</p>
                      <p className={`text-xl font-bold font-mono mt-1 ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-zinc-500 text-sm">Loading Redis stats...</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TigerBeetle Tab */}
        <TabsContent value="tigerbeetle">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                TigerBeetle Balance Audit
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tb ? (
                <div className="space-y-4">
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${tb.balanced ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                    {tb.balanced
                      ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                      : <XCircle className="w-5 h-5 text-red-400" />}
                    <div>
                      <p className={`font-semibold ${tb.balanced ? "text-emerald-400" : "text-red-400"}`}>
                        {tb.balanced ? "Ledger is balanced" : "Discrepancy detected!"}
                      </p>
                      <p className="text-xs text-zinc-500">{tb.discrepancies} discrepancies · {tb.totalAccounts?.toLocaleString()} accounts</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                      <p className="text-xs text-zinc-500">Audit Duration</p>
                      <p className="text-lg font-bold font-mono text-white">{tb.auditDurationMs}ms</p>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                      <p className="text-xs text-zinc-500">Last Audit</p>
                      <p className="text-sm font-mono text-zinc-300">{tb.lastAuditAt ? new Date(tb.lastAuditAt).toLocaleTimeString() : "—"}</p>
                    </div>
                  </div>
                </div>
              ) : <p className="text-zinc-500 text-sm">Loading TigerBeetle audit...</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
