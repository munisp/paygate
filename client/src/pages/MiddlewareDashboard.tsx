import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Activity, Database, Zap, Clock, Shield, Lock, Server,
  Search, BarChart3, Layers, RefreshCw, CheckCircle2,
  AlertCircle, HelpCircle, ArrowRight, TrendingUp, Globe
} from "lucide-react";

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    ok: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
    green: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
    healthy: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
    degraded: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <AlertCircle className="w-3 h-3" /> },
    unknown: { color: "bg-slate-500/15 text-slate-400 border-slate-500/30", icon: <HelpCircle className="w-3 h-3" /> },
    error: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <AlertCircle className="w-3 h-3" /> },
  };
  const cfg = map[status?.toLowerCase()] ?? map.unknown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}
      {status ?? "unknown"}
    </span>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({ name, icon, status, description, details }: {
  name: string; icon: React.ReactNode; status: string; description: string; details?: any;
}) {
  return (
    <Card className="bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-slate-700/50 text-slate-300">{icon}</div>
            <div>
              <p className="text-sm font-semibold text-white">{name}</p>
              <p className="text-xs text-slate-400">{description}</p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
        {details && (
          <div className="text-xs text-slate-500 mt-2 space-y-1">
            {Object.entries(details).slice(0, 3).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-500">{k.replace(/_/g, " ")}</span>
                <span className="text-slate-300 font-mono">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Kafka Panel ──────────────────────────────────────────────────────────────

function KafkaPanel() {
  const { data, isLoading, refetch } = trpc.middlewareDashboard.kafka.topics.useQuery();
  const topics = data?.topics ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Kafka Topics</h3>
        <Button size="sm" variant="outline" aria-label="Refresh" onClick={() => refetch()} className="h-7 text-xs"><RefreshCw/> Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="text-slate-400 text-sm">Loading topics...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700">
              <TableHead className="text-slate-400 text-xs">Topic</TableHead>
              <TableHead className="text-slate-400 text-xs">Partitions</TableHead>
              <TableHead className="text-slate-400 text-xs">Replication</TableHead>
              <TableHead className="text-slate-400 text-xs">Messages</TableHead>
              <TableHead className="text-slate-400 text-xs">Lag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topics.map((t: any) => (
              <TableRow key={t.name} className="border-slate-700/50">
                <TableCell className="text-xs font-mono text-slate-300">{t.name}</TableCell>
                <TableCell className="text-xs text-slate-400">{t.partitions}</TableCell>
                <TableCell className="text-xs text-slate-400">{t.replication}</TableCell>
                <TableCell className="text-xs text-slate-300">{t.messages?.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={t.lag > 0 ? "destructive" : "secondary"} className="text-xs">
                    {t.lag}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {data?.source === "demo" && (
        <p className="text-xs text-amber-400/70">Demo data — connect Kafka broker to see live topics</p>
      )}
    </div>
  );
}

// ─── Temporal Workflows Panel ─────────────────────────────────────────────────

function TemporalPanel() {
  const { data, isLoading, refetch } = trpc.middlewareDashboard.temporal.workflows.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const workflows = data?.workflows ?? [];

  const statusColor: Record<string, string> = {
    Running: "bg-blue-500/15 text-blue-400",
    Completed: "bg-emerald-500/15 text-emerald-400",
    Failed: "bg-red-500/15 text-red-400",
    TimedOut: "bg-amber-500/15 text-amber-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Temporal Workflows</h3>
        <Button size="sm" variant="outline" aria-label="Refresh" onClick={() => refetch()} className="h-7 text-xs"><RefreshCw/> Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="text-slate-400 text-sm">Loading workflows...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700">
              <TableHead className="text-slate-400 text-xs">Workflow ID</TableHead>
              <TableHead className="text-slate-400 text-xs">Type</TableHead>
              <TableHead className="text-slate-400 text-xs">Status</TableHead>
              <TableHead className="text-slate-400 text-xs">Duration</TableHead>
              <TableHead className="text-slate-400 text-xs">Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.map((wf: any) => (
              <TableRow key={wf.workflow_id} className="border-slate-700/50">
                <TableCell className="text-xs font-mono text-slate-300">{wf.workflow_id.slice(0, 20)}...</TableCell>
                <TableCell className="text-xs text-slate-300">{wf.workflow_type}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[wf.status] ?? "bg-slate-700 text-slate-400"}`}>
                    {wf.status}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-slate-400">{(wf.duration_ms / 1000).toFixed(1)}s</TableCell>
                <TableCell className="text-xs text-slate-500">
                  {new Date(wf.started_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {data?.source === "demo" && (
        <p className="text-xs text-amber-400/70">Demo data — connect Temporal server to see live workflows</p>
      )}
    </div>
  );
}

// ─── TigerBeetle Ledger Panel ─────────────────────────────────────────────────

function LedgerPanel() {
  const { data: stats } = trpc.middlewareDashboard.ledger.stats.useQuery();

  const railColors: Record<string, string> = {
    cips: "text-red-400",
    upi: "text-orange-400",
    pix: "text-green-400",
    mojaloop: "text-blue-400",
    brics: "text-purple-400",
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">TigerBeetle Double-Entry Ledger</h3>
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-700/30 rounded-lg p-3">
              <p className="text-xs text-slate-400">Total Accounts</p>
              <p className="text-xl font-bold text-white">{stats.total_accounts}</p>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <p className="text-xs text-slate-400">Total Transfers</p>
              <p className="text-xl font-bold text-white">{stats.total_transfers?.toLocaleString()}</p>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <p className="text-xs text-slate-400">Fees Collected</p>
              <p className="text-xl font-bold text-emerald-400">
                ₦{(stats.total_fees_collected / 100).toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <p className="text-xs text-slate-400">Currencies</p>
              <p className="text-xl font-bold text-white">{stats.active_currencies?.length}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2">Volume by Rail (kobo)</p>
            <div className="space-y-2">
              {Object.entries(stats.total_volume_by_rail ?? {}).map(([rail, vol]) => (
                <div key={rail} className="flex items-center gap-3">
                  <span className={`text-xs font-semibold uppercase w-16 ${railColors[rail] ?? "text-slate-300"}`}>{rail}</span>
                  <div className="flex-1 bg-slate-700/50 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${rail === "cips" ? "bg-red-500" : rail === "upi" ? "bg-orange-500" : rail === "pix" ? "bg-green-500" : rail === "mojaloop" ? "bg-blue-500" : "bg-purple-500"}`}
                      style={{ width: `${Math.min(100, ((vol as number) / 200000000) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-300 w-24 text-right font-mono">
                    ₦{((vol as number) / 100).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2">Active Currencies</p>
            <div className="flex flex-wrap gap-1">
              {stats.active_currencies?.map((c: string) => (
                <Badge key={c} variant="outline" className="text-xs border-slate-600 text-slate-300">{c}</Badge>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── OpenSearch Panel ─────────────────────────────────────────────────────────

function SearchPanel() {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState("paygate-transactions");
  const [searchQuery, setSearchQuery] = useState<{ index: string; query: string } | null>(null);

  const { data: indices } = trpc.middlewareDashboard.search.indices.useQuery();
  const { data: results, isLoading: searching } = trpc.middlewareDashboard.search.query.useQuery(
    { index: searchQuery?.index ?? "paygate-transactions", query: searchQuery?.query ?? "" },
    { enabled: !!searchQuery , staleTime: 30_000 })

  const handleSearch = () => {
    if (!query.trim()) return;
    setSearchQuery({ index, query });
  };

  const indexList = Object.keys(indices?.indices ?? {});

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">OpenSearch Console</h3>
      <div className="flex gap-2">
        <Select value={index} onValueChange={setIndex}>
          <SelectTrigger className="w-56 bg-slate-700/50 border-slate-600 text-slate-300 text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {indexList.map(idx => (
              <SelectItem key={idx} value={idx} className="text-xs text-slate-300">{idx}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search query..."
          className="flex-1 bg-slate-700/50 border-slate-600 text-slate-300 text-xs h-8"
          onKeyDown={e => e.key === "Enter" && handleSearch()}
        />
        <Button size="sm" onClick={handleSearch} className="h-8 text-xs">
          <Search className="w-3 h-3 mr-1" /> Search
        </Button>
      </div>
      {/* Index Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Object.entries(indices?.indices ?? {}).map(([idx, info]: [string, any]) => (
          <div key={idx} className="bg-slate-700/30 rounded-lg p-2 cursor-pointer hover:bg-slate-700/50"
            onClick={() => setIndex(idx)}>
            <p className="text-xs font-mono text-slate-300 truncate">{idx}</p>
            <p className="text-sm font-bold text-white">{info.doc_count?.toLocaleString()}</p>
            <p className="text-xs text-slate-500">documents</p>
          </div>
        ))}
      </div>
      {/* Results */}
      {searching && <div className="text-slate-400 text-sm">Searching...</div>}
      {results && (
        <div>
          <p className="text-xs text-slate-400 mb-2">
            {results.total} results {results.source === "demo" ? "(demo)" : ""}
          </p>
          {results.hits?.length === 0 && (
            <p className="text-sm text-slate-500">No results found</p>
          )}
        </div>
      )}
      {indices?.source === "demo" && (
        <p className="text-xs text-amber-400/70">Demo data — connect OpenSearch to see live indices</p>
      )}
    </div>
  );
}

// ─── Lakehouse Panel ──────────────────────────────────────────────────────────

function LakehousePanel() {
  const { data: tables } = trpc.middlewareDashboard.lakehouse.tables.useQuery();
  const { data: corridors } = trpc.middlewareDashboard.lakehouse.corridorAnalytics.useQuery({ days: 7 }, { staleTime: 30_000 });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Lakehouse (Delta/Iceberg)</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Object.entries(tables?.tables ?? {}).map(([tbl, info]: [string, any]) => (
          <div key={tbl} className="bg-slate-700/30 rounded-lg p-3">
            <p className="text-xs font-mono text-slate-300 truncate">{tbl}</p>
            <p className="text-lg font-bold text-white">{info.record_count?.toLocaleString()}</p>
            <p className="text-xs text-slate-500">records</p>
          </div>
        ))}
      </div>
      {/* Corridor Analytics */}
      <div>
        <p className="text-xs text-slate-400 mb-2 font-semibold">Cross-Border Corridor Analytics (7d)</p>
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700">
              <TableHead className="text-slate-400 text-xs">Corridor</TableHead>
              <TableHead className="text-slate-400 text-xs">Rail</TableHead>
              <TableHead className="text-slate-400 text-xs">Transfers</TableHead>
              <TableHead className="text-slate-400 text-xs">Volume</TableHead>
              <TableHead className="text-slate-400 text-xs">Avg Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(corridors?.corridors ?? []).map((c: any) => (
              <TableRow key={`${c.corridor}-${c.rail}`} className="border-slate-700/50">
                <TableCell className="text-xs font-mono text-slate-300">{c.corridor}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs border-slate-600 uppercase">{c.rail}</Badge>
                </TableCell>
                <TableCell className="text-xs text-slate-300">{c.count}</TableCell>
                <TableCell className="text-xs text-slate-300">₦{(c.total_source_amount / 100).toLocaleString()}</TableCell>
                <TableCell className="text-xs font-mono text-slate-300">{c.avg_exchange_rate}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {tables?.source === "demo" && (
        <p className="text-xs text-amber-400/70">Demo data — connect Lakehouse service to see live tables</p>
      )}
    </div>
  );
}

// ─── Fluvio Panel ─────────────────────────────────────────────────────────────

function FluvioPanel() {
  const { data, refetch } = trpc.middlewareDashboard.fluvio.streams.useQuery();
  const streams = data?.streams ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Fluvio Streams</h3>
        <Button size="sm" variant="outline" aria-label="Refresh" onClick={() => refetch()} className="h-7 text-xs"><RefreshCw/> Refresh
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {streams.map((s: any) => (
          <div key={s.topic} className="bg-slate-700/30 rounded-lg p-3">
            <p className="text-sm font-mono text-slate-300">{s.topic}</p>
            <div className="flex gap-4 mt-2 text-xs text-slate-400">
              <span>{s.partitions} partitions</span>
              <span>{s.consumer_groups} consumers</span>
              <span className="text-emerald-400">{s.throughput_per_sec?.toLocaleString()} msg/s</span>
            </div>
          </div>
        ))}
      </div>
      {data?.source === "demo" && (
        <p className="text-xs text-amber-400/70">Demo data — connect Fluvio cluster to see live streams</p>
      )}
    </div>
  );
}

// ─── Redis Panel ──────────────────────────────────────────────────────────────

function RedisPanel() {
  const { data: stats } = trpc.middlewareDashboard.redis.stats.useQuery();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Redis Cache</h3>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Total Keys", value: stats.total_keys?.toLocaleString(), color: "text-white" },
            { label: "FX Rates", value: stats.fx_rates, color: "text-blue-400" },
            { label: "Idempotency Keys", value: stats.idempotency_keys?.toLocaleString(), color: "text-purple-400" },
            { label: "Sessions", value: stats.sessions, color: "text-emerald-400" },
            { label: "Transfer States", value: stats.transfer_states?.toLocaleString(), color: "text-orange-400" },
            { label: "Hit Rate", value: `${stats.hit_rate_pct}%`, color: "text-emerald-400" },
          ].map(item => (
            <div key={item.label} className="bg-slate-700/30 rounded-lg p-3">
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}
      {stats?.memory_used_mb && (
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-slate-400">Memory Used</span>
            <span className="text-xs text-slate-300">{stats.memory_used_mb} MB</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, (stats.memory_used_mb / 512) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── APISIX Routes Panel ──────────────────────────────────────────────────────

function APISIXPanel() {
  const { data } = trpc.middlewareDashboard.apisix.routes.useQuery();
  const routes = data?.routes ?? [];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">APISIX Gateway Routes</h3>
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700">
            <TableHead className="text-slate-400 text-xs">Route ID</TableHead>
            <TableHead className="text-slate-400 text-xs">URI</TableHead>
            <TableHead className="text-slate-400 text-xs">Methods</TableHead>
            <TableHead className="text-slate-400 text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {routes.map((r: any) => (
            <TableRow key={r.id} className="border-slate-700/50">
              <TableCell className="text-xs font-mono text-slate-300">{r.id}</TableCell>
              <TableCell className="text-xs font-mono text-slate-400">{r.uri}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {r.methods?.map((m: string) => (
                    <Badge key={m} variant="outline" className="text-xs border-slate-600 text-slate-300">{m}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-slate-500">Source: {data?.source}</p>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function MiddlewareDashboard() {
  // Error notification helper
  const showError = (msg: string) => toast.error(msg);
  void showError; // eslint-disable-line

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = trpc.middlewareDashboard.health.useQuery();
  const { data: summary } = trpc.middlewareDashboard.summary.useQuery();

  const serviceIcons: Record<string, React.ReactNode> = {
    "go-bridge": <Server className="w-4 h-4" />,
    kafka: <Activity className="w-4 h-4" />,
    dapr: <Zap className="w-4 h-4" />,
    fluvio: <TrendingUp className="w-4 h-4" />,
    temporal: <Clock className="w-4 h-4" />,
    keycloak: <Shield className="w-4 h-4" />,
    permify: <Lock className="w-4 h-4" />,
    redis: <Database className="w-4 h-4" />,
    opensearch: <Search className="w-4 h-4" />,
    apisix: <Globe className="w-4 h-4" />,
    tigerbeetle: <BarChart3 className="w-4 h-4" />,
    lakehouse: <Layers className="w-4 h-4" />,
    postgres: <Database className="w-4 h-4" />,
  };

  const serviceDescriptions: Record<string, string> = {
    "go-bridge": "Go middleware bridge",
    kafka: "Event streaming",
    dapr: "Distributed runtime",
    fluvio: "Real-time streams",
    temporal: "Workflow engine",
    keycloak: "OIDC / SSO",
    permify: "RBAC engine",
    redis: "Cache / pub-sub",
    opensearch: "Search & analytics",
    apisix: "API gateway",
    tigerbeetle: "Double-entry ledger",
    lakehouse: "Delta / Iceberg",
    postgres: "Primary database",
  };

  const services = health?.services ?? {};

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Middleware Dashboard</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Kafka · Dapr · Fluvio · Temporal · Keycloak · Permify · Redis · OpenSearch · APISIX · TigerBeetle · Lakehouse
            </p>
          </div>
          <div className="flex items-center gap-3">
            {summary && (
              <div className="text-right">
                <p className="text-xs text-slate-400">Services Healthy</p>
                <p className="text-lg font-bold text-emerald-400">
                  {summary.services_healthy}/{summary.services_total}
                </p>
              </div>
            )}
            <Button size="sm" variant="outline" aria-label="Refresh" onClick={() => refetchHealth()} className="border-slate-600 text-slate-300 h-8"><RefreshCw/> Refresh All
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-slate-800/50 border-slate-700/50 col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Health Score</p>
                <p className={`text-3xl font-bold ${summary.health_pct >= 80 ? "text-emerald-400" : summary.health_pct >= 50 ? "text-amber-400" : "text-red-400"}`}>
                  {summary.health_pct}%
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Active Rails</p>
                <p className="text-3xl font-bold text-blue-400">{summary.rails_active?.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Corridors</p>
                <p className="text-3xl font-bold text-purple-400">{summary.corridors_active}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Kafka Topics</p>
                <p className="text-3xl font-bold text-orange-400">
                  {summary.kafka?.topics?.length ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Ledger Transfers</p>
                <p className="text-3xl font-bold text-emerald-400">
                  {summary.ledger?.total_transfers?.toLocaleString() ?? 0}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Service Health Grid */}
        <Card className="bg-slate-800/30 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Service Health
              {healthLoading && <span className="text-xs text-slate-400 font-normal">Checking...</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {Object.entries(services).map(([name, info]: [string, any]) => (
                <ServiceCard
                  key={name}
                  name={name}
                  icon={serviceIcons[name] ?? <Server className="w-4 h-4" />}
                  status={info.status}
                  description={serviceDescriptions[name] ?? ""}
                  details={info.details}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Panels */}
        <Tabs defaultValue="kafka" className="space-y-4">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 h-9">
            {[
              { value: "kafka", label: "Kafka", icon: <Activity className="w-3 h-3" /> },
              { value: "temporal", label: "Temporal", icon: <Clock className="w-3 h-3" /> },
              { value: "ledger", label: "TigerBeetle", icon: <BarChart3 className="w-3 h-3" /> },
              { value: "fluvio", label: "Fluvio", icon: <TrendingUp className="w-3 h-3" /> },
              { value: "redis", label: "Redis", icon: <Database className="w-3 h-3" /> },
              { value: "search", label: "OpenSearch", icon: <Search className="w-3 h-3" /> },
              { value: "lakehouse", label: "Lakehouse", icon: <Layers className="w-3 h-3" /> },
              { value: "apisix", label: "APISIX", icon: <Globe className="w-3 h-3" /> },
            ].map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}
                className="text-xs flex items-center gap-1 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
                {tab.icon}{tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="p-6">
              <TabsContent value="kafka"><KafkaPanel /></TabsContent>
              <TabsContent value="temporal"><TemporalPanel /></TabsContent>
              <TabsContent value="ledger"><LedgerPanel /></TabsContent>
              <TabsContent value="fluvio"><FluvioPanel /></TabsContent>
              <TabsContent value="redis"><RedisPanel /></TabsContent>
              <TabsContent value="search"><SearchPanel /></TabsContent>
              <TabsContent value="lakehouse"><LakehousePanel /></TabsContent>
              <TabsContent value="apisix"><APISIXPanel /></TabsContent>
            </CardContent>
          </Card>
        </Tabs>

        {/* Active Rails */}
        {summary?.rails_active && (
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                Active Cross-Border Rails
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {summary.rails_active.map((rail: string) => {
                  const railInfo: Record<string, { label: string; color: string; desc: string }> = {
                    cips: { label: "CIPS", color: "border-red-500/50 text-red-400 bg-red-500/10", desc: "China Cross-Border Interbank Payment System" },
                    upi: { label: "UPI", color: "border-orange-500/50 text-orange-400 bg-orange-500/10", desc: "India Unified Payments Interface" },
                    pix: { label: "PIX", color: "border-green-500/50 text-green-400 bg-green-500/10", desc: "Brazil Instant Payment System" },
                    mojaloop: { label: "Mojaloop", color: "border-blue-500/50 text-blue-400 bg-blue-500/10", desc: "Africa Open-Source Payment Switch" },
                    brics: { label: "BRICS Pay", color: "border-purple-500/50 text-purple-400 bg-purple-500/10", desc: "BRICS Multi-Rail Payment Network" },
                  };
                  const info = railInfo[rail] ?? { label: rail.toUpperCase(), color: "border-slate-500/50 text-slate-400 bg-slate-500/10", desc: "" };
                  return (
                    <div key={rail} className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${info.color}`}>
                      <CheckCircle2 className="w-4 h-4" />
                      <div>
                        <p className="text-sm font-semibold">{info.label}</p>
                        <p className="text-xs opacity-70">{info.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
