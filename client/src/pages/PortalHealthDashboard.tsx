import { useState, ReactElement } from "react";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw, Server, Shield, Zap, Database, Globe } from "lucide-react";

const STATUS_ICON: Record<string, ReactElement> = {
  ok: <CheckCircle className="w-4 h-4 text-green-600" />,
  degraded: <AlertTriangle className="w-4 h-4 text-yellow-600" />,
  down: <XCircle className="w-4 h-4 text-red-600" />,
};

const STATUS_COLOR: Record<string, string> = {
  ok: "text-green-600",
  degraded: "text-yellow-600",
  down: "text-red-600",
};

const CATEGORY_ICON: Record<string, ReactElement> = {
  infrastructure: <Server className="w-4 h-4" />,
  security: <Shield className="w-4 h-4" />,
  messaging: <Zap className="w-4 h-4" />,
  notifications: <Globe className="w-4 h-4" />,
  integration: <Activity className="w-4 h-4" />,
  payments: <Database className="w-4 h-4" />,
  auth: <Shield className="w-4 h-4" />,
  observability: <Activity className="w-4 h-4" />,
  business: <CheckCircle className="w-4 h-4" />,
};

export default function PortalHealthDashboard() {
  const [activeTab, setActiveTab] = useState<"health" | "golive" | "ratelimit" | "deps">("health");

  const healthInterval = useAdaptiveInterval(30_000);
  const rateLimitInterval = useAdaptiveInterval(60_000);

  const healthQuery = trpc.portalHealth.getSystemHealth.useQuery(undefined, {
    refetchInterval: healthInterval,
  });
  const goLiveQuery = trpc.portalHealth.getGoLiveStatus.useQuery();
  const rateLimitQuery = trpc.portalHealth.getRateLimitStats.useQuery(undefined, {
    refetchInterval: rateLimitInterval,
  });
  const depsQuery = trpc.portalHealth.getDependencyMap.useQuery();

  const health = healthQuery.data;
  const goLive = goLiveQuery.data;
  const rateLimit = rateLimitQuery.data;
  const deps = depsQuery.data;

  const overallStatusColor = health?.status === "ok" ? "text-green-600" : health?.status === "degraded" ? "text-yellow-600" : "text-red-600";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            Portal Health Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            System health, go-live readiness, rate limits, and service dependencies
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            healthQuery.refetch();
            goLiveQuery.refetch();
            rateLimitQuery.refetch();
            depsQuery.refetch();
            toast.success("Refreshed");
          }}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${healthQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh All
        </Button>
      </div>

      {/* Quick Status Bar */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className={`text-xl font-bold uppercase ${overallStatusColor}`}>{health.status}</div>
              <div className="text-xs text-muted-foreground">Overall Status</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xl font-bold">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</div>
              <div className="text-xs text-muted-foreground">Uptime</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xl font-bold">{health.memoryMB} MB</div>
              <div className="text-xs text-muted-foreground">Heap Memory</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xl font-bold text-blue-600">{health.nodeVersion}</div>
              <div className="text-xs text-muted-foreground">Node.js Version</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["health", "golive", "ratelimit", "deps"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "health" ? "System Checks" : tab === "golive" ? "Go-Live Checklist" : tab === "ratelimit" ? "Rate Limits" : "Dependencies"}
          </button>
        ))}
      </div>

      {/* System Health Tab */}
      {activeTab === "health" && (
        <div className="space-y-3">
          {healthQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Running health checks...</div>
          ) : health ? (
            Object.entries(health.checks).map(([key, check]) => (
              <Card key={key}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {STATUS_ICON[check.status]}
                      <div>
                        <div className="font-medium text-sm capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</div>
                        {check.message && (
                          <div className="text-xs text-muted-foreground">{check.message}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {check.latencyMs > 0 && (
                        <span className="text-xs text-muted-foreground">{check.latencyMs}ms</span>
                      )}
                      <span className={`text-sm font-medium uppercase ${STATUS_COLOR[check.status]}`}>
                        {check.status}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">Failed to load health data.</div>
          )}
        </div>
      )}

      {/* Go-Live Checklist Tab */}
      {activeTab === "golive" && (
        <div className="space-y-4">
          {goLiveQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading checklist...</div>
          ) : goLive ? (
            <>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-lg font-bold">
                        Readiness Score: {goLive.readinessScore}%
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {goLive.passedCount}/{goLive.totalCount} checks passed
                      </div>
                    </div>
                    <Badge variant={goLive.isReadyForLaunch ? "default" : "secondary"} className="text-sm">
                      {goLive.isReadyForLaunch ? "Ready to Launch" : "Not Ready"}
                    </Badge>
                  </div>
                  <Progress value={goLive.readinessScore} className="h-3" />
                </CardContent>
              </Card>

              {/* Group by category */}
              {Array.from(new Set(goLive.checks.map(c => c.category))).map(category => (
                <div key={category} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {CATEGORY_ICON[category]}
                    {category}
                  </div>
                  {goLive.checks.filter(c => c.category === category).map(check => (
                    <Card key={check.id}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {check.passed
                              ? <CheckCircle className="w-4 h-4 text-green-600" />
                              : <XCircle className="w-4 h-4 text-red-500" />}
                            <span className="text-sm">{check.label}</span>
                          </div>
                          <Badge variant={check.passed ? "default" : "destructive"} className="text-xs">
                            {check.passed ? "Pass" : "Fail"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ))}
            </>
          ) : null}
        </div>
      )}

      {/* Rate Limits Tab */}
      {activeTab === "ratelimit" && (
        <div className="space-y-4">
          {rateLimit && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{rateLimit.totalRequestsLastHour.toLocaleString()}</div><div className="text-xs text-muted-foreground">Requests (Last Hour)</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-600">{rateLimit.blockedRequestsLastHour}</div><div className="text-xs text-muted-foreground">Blocked (Last Hour)</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{rateLimit.topIPs.length}</div><div className="text-xs text-muted-foreground">Active IPs</div></CardContent></Card>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Endpoint Rate Limits</h3>
                {rateLimit.endpoints.map(ep => (
                  <Card key={ep.path}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs">{ep.path}</span>
                        <div className="flex items-center gap-2">
                          {ep.blocked > 0 && (
                            <Badge variant="destructive" className="text-xs">{ep.blocked} blocked</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{ep.currentUsage}/{ep.limit} per {ep.window}</span>
                        </div>
                      </div>
                      <Progress value={(ep.currentUsage / ep.limit) * 100} className="h-1.5" />
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Top IPs</h3>
                {rateLimit.topIPs.map(ip => (
                  <div key={ip.ip} className="flex items-center justify-between text-sm px-3 py-2 bg-muted/30 rounded-lg">
                    <span className="font-mono">{ip.ip}</span>
                    <div className="flex gap-4 text-muted-foreground">
                      <span>{ip.requests} requests</span>
                      {ip.blocked > 0 && <span className="text-red-600">{ip.blocked} blocked</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Dependencies Tab */}
      {activeTab === "deps" && (
        <div className="space-y-3">
          {depsQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading dependencies...</div>
          ) : deps ? (
            deps.services.map(svc => (
              <Card key={svc.name}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {svc.configured
                        ? <CheckCircle className="w-4 h-4 text-green-600" />
                        : <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{svc.name}</span>
                          {svc.critical && <Badge variant="destructive" className="text-xs">Critical</Badge>}
                        </div>
                        {svc.url && (
                          <div className="text-xs text-muted-foreground font-mono">{svc.url}</div>
                        )}
                      </div>
                    </div>
                    <Badge variant={svc.configured ? "default" : "secondary"} className="text-xs">
                      {svc.configured ? "Configured" : "Not Configured"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : null}
        </div>
      )}
    </div>
  );
}
