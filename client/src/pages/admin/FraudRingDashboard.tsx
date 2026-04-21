import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, AlertTriangle, Network, Eye, Lock, CheckCircle, Search, RefreshCw, ShieldAlert } from "lucide-react";
import FraudRingGraph from "@/components/FraudRingGraph";

export default function FraudRingDashboard() {
  const [status, setStatus] = useState<"all" | "active" | "frozen" | "cleared">("all");
  const [search, setSearch] = useState("");
  const [selectedRing, setSelectedRing] = useState<string | null>(null);
  const [actionRing, setActionRing] = useState<{ ringId: string; action: "freeze" | "clear" } | null>(null);
  const [reason, setReason] = useState("");
  const [activeTab, setActiveTab] = useState("rings");

  // Wave 34 tRPC router: trpc.fraudRings.*
  const { data: listData, isLoading, refetch } = trpc.fraudRings.list.useQuery({ status, limit: 50, offset: 0 });
  const { data: graphData } = trpc.fraudRings.getTopology.useQuery(
    { ringId: selectedRing! },
    { enabled: !!selectedRing }
  );
  const { data: ringDetail } = trpc.fraudRings.getDetail.useQuery(
    { ringId: selectedRing! },
    { enabled: !!selectedRing }
  );
  const detail = ringDetail;

  const freezeRing = trpc.fraudRings.freezeRing.useMutation({
    onSuccess: () => { toast.success("Fraud ring frozen — all accounts suspended"); refetch(); setActionRing(null); setReason(""); },
    onError: (e) => toast.error(e.message),
  });

  const clearRing = trpc.fraudRings.clearRing.useMutation({
    onSuccess: () => { toast.success("Fraud ring cleared as false positive"); refetch(); setActionRing(null); setReason(""); },
    onError: (e) => toast.error(e.message),
  });

  const rings = ((listData?.rings ?? []) as any[]).filter((r: any) =>
    !search || r.ringId.toLowerCase().includes(search.toLowerCase())
  );
  const statsData = {
    activeRings: rings.filter((r: any) => r.status === "active" || r.ring_status === "open").length,
    frozenRings: rings.filter((r: any) => r.status === "frozen").length,
    clearedRings: rings.filter((r: any) => r.status === "cleared").length,
    avgRiskScore: rings.length > 0 ? Math.round(rings.reduce((s: number, r: any) => s + (r.maxRiskScore ?? 0), 0) / rings.length) : 0,
  };

  const riskColor = (score: number) => {
    if (score >= 80) return "text-red-600 bg-red-50";
    if (score >= 60) return "text-orange-600 bg-orange-50";
    if (score >= 40) return "text-yellow-600 bg-yellow-50";
    return "text-green-600 bg-green-50";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="w-6 h-6 text-red-600" />
            Fraud Ring Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            GNN-detected fraud rings — graph-based detection of coordinated fraud networks
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{statsData?.activeRings ?? rings.filter((r: any) => r.status === "active").length}</div>
            <div className="text-sm text-muted-foreground">Active Rings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{statsData?.frozenRings ?? rings.filter((r: any) => r.status === "frozen").length}</div>
            <div className="text-sm text-muted-foreground">Frozen Rings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{statsData?.clearedRings ?? rings.filter((r: any) => r.status === "cleared").length}</div>
            <div className="text-sm text-muted-foreground">Cleared Rings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-600">
              {statsData?.avgRiskScore ?? (rings.length > 0 ? Math.round(rings.reduce((s: number, r: any) => s + (r.totalRiskScore ?? 0), 0) / rings.length) : 0)}/100
            </div>
            <div className="text-sm text-muted-foreground">Avg Risk Score</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search ring ID..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v: any) => setStatus(v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="frozen">Frozen</SelectItem>
            <SelectItem value="cleared">Cleared</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rings">Ring List</TabsTrigger>
          <TabsTrigger value="graph" disabled={!selectedRing}>
            <Network className="w-4 h-4 mr-1" />
            {selectedRing ? `Graph (${selectedRing.slice(-6)})` : "Graph View"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="graph">
          {selectedRing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Network className="w-5 h-5 text-indigo-400" />
                  Ring Topology: <span className="font-mono text-sm">{selectedRing}</span>
                </h2>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("rings")}>← Back to List</Button>
              </div>
              {graphData ? (
                <>
                  <FraudRingGraph
                    nodes={(graphData?.nodes ?? []).map((n: any) => ({ ...n, label: n.id?.slice(-8) ?? n.id, type: n.type === 'merchant' ? 'account' : (n.type ?? 'account'), riskScore: n.riskScore ?? 50 }))}
                    edges={(graphData?.edges ?? []).map((e: any) => ({ ...e, edgeType: e.edgeType ?? 'transfer', weight: (e.weight ?? 50) / 100 }))}
                    ringId={selectedRing}
                    width={700}
                    height={480}
                    onNodeClick={(node) => toast.info(`${node.label} — Risk: ${node.riskScore}/100`)}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <Card><CardContent className="p-4"><p className="text-muted-foreground text-sm">Nodes</p><p className="text-2xl font-bold">{graphData?.nodes?.length ?? 0}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-muted-foreground text-sm">Edges</p><p className="text-2xl font-bold">{graphData?.edges?.length ?? 0}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-muted-foreground text-sm">Avg Risk</p>
                      <p className="text-2xl font-bold text-red-500">
                        {graphData?.nodes?.length ? Math.round(graphData.nodes.reduce((s: number, n: any) => s + (n.riskScore ?? 0), 0) / graphData.nodes.length) : 0}/100
                      </p>
                    </CardContent></Card>
                  </div>
                </>
              ) : (
                <div className="bg-slate-900 rounded-xl border border-slate-700 h-64 flex items-center justify-center text-slate-500">
                  Loading graph data...
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rings">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ring List */}
        <div className="lg:col-span-1 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading rings...</div>
          ) : rings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No fraud rings detected
              </CardContent>
            </Card>
          ) : (
            rings.map(ring => (
              <Card
                key={ring.ringId}
                className={`cursor-pointer transition-all border-2 ${selectedRing === ring.ringId ? "border-primary" : "border-transparent hover:border-muted"}`}
                onClick={() => setSelectedRing(ring.ringId)}
              >
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-mono text-xs text-muted-foreground truncate max-w-[140px]">{ring.ringId}</div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${riskColor(ring.maxRiskScore)}`}>
                      {ring.maxRiskScore}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                    <div><span className="font-semibold text-foreground">{ring.alertCount}</span> alerts</div>
                    <div><span className="font-semibold text-foreground">{ring.merchantCount}</span> merchants</div>
                    <div><span className="font-semibold text-foreground">{ring.openAlerts}</span> open</div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 h-7 text-xs"
                      onClick={e => { e.stopPropagation(); setActionRing({ ringId: ring.ringId, action: "freeze" }); }}
                    >
                      <Lock className="w-3 h-3 mr-1" /> Freeze
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      onClick={e => { e.stopPropagation(); setActionRing({ ringId: ring.ringId, action: "clear" }); }}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" /> Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Ring Detail */}
        <div className="lg:col-span-2">
          {!selectedRing ? (
            <Card className="h-full">
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                  <Eye className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Select a fraud ring to view details
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    Ring Summary
                    <span className="font-mono text-xs text-muted-foreground ml-2">{selectedRing}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {detail && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-2xl font-bold">{detail.summary.totalAlerts}</div>
                        <div className="text-xs text-muted-foreground">Total Alerts</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{detail.summary.uniqueMerchants}</div>
                        <div className="text-xs text-muted-foreground">Unique Merchants</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-orange-600">{detail.summary.avgRiskScore}</div>
                        <div className="text-xs text-muted-foreground">Avg Risk Score</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-600">{detail.summary.highestRisk}</div>
                        <div className="text-xs text-muted-foreground">Highest Risk</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Graph Topology */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Graph Topology</CardTitle>
                </CardHeader>
                <CardContent>
                  {topology ? (
                    <div className="space-y-3">
                      <div className="flex gap-4 text-sm">
                        <span className="text-muted-foreground">Nodes: <strong>{topology.nodes.length}</strong></span>
                        <span className="text-muted-foreground">Edges: <strong>{topology.edges.length}</strong></span>
                      </div>
                      {/* Simple topology table */}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2">Node ID</th>
                              <th className="text-left p-2">Type</th>
                              <th className="text-left p-2">Risk Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topology.nodes.slice(0, 10).map((node, i) => (
                              <tr key={i} className="border-t">
                                <td className="p-2 font-mono truncate max-w-[160px]">{node.id}</td>
                                <td className="p-2">
                                  <Badge variant={node.type === "merchant" ? "default" : "secondary"} className="text-xs">
                                    {node.type}
                                  </Badge>
                                </td>
                                <td className="p-2">
                                  <span className={`font-bold ${node.riskScore >= 70 ? "text-red-600" : node.riskScore >= 40 ? "text-orange-600" : "text-green-600"}`}>
                                    {node.riskScore}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Loading topology...</div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Alerts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Alerts in Ring</CardTitle>
                </CardHeader>
                <CardContent>
                  {detail?.alerts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No alerts found</div>
                  ) : (
                    <div className="space-y-2">
                      {(detail?.alerts ?? []).slice(0, 8).map(alert => (
                        <div key={alert.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <div className="text-sm font-medium">{alert.alertType}</div>
                            <div className="text-xs text-muted-foreground">{alert.merchantId}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${riskColor(alert.riskScore ?? 0)}`}>
                              {alert.riskScore}
                            </span>
                            <Badge variant={alert.status === "open" ? "destructive" : "secondary"} className="text-xs">
                              {alert.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={!!actionRing} onOpenChange={() => { setActionRing(null); setReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionRing?.action === "freeze" ? "Freeze Fraud Ring" : "Clear Fraud Ring"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {actionRing?.action === "freeze"
                ? "This will suspend all accounts associated with this fraud ring. This action is logged and auditable."
                : "This will mark the ring as a false positive and clear all associated alerts."}
            </p>
            <Textarea
              placeholder="Provide a reason (minimum 10 characters)..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionRing(null); setReason(""); }}>Cancel</Button>
            <Button
              variant={actionRing?.action === "freeze" ? "destructive" : "default"}
              disabled={reason.length < 10 || freezeRing.isPending || clearRing.isPending}
              onClick={() => {
                if (!actionRing) return;
                if (actionRing.action === "freeze") {
                  freezeRing.mutate({ ringId: actionRing.ringId, reason });
                } else {
                  clearRing.mutate({ ringId: actionRing.ringId, reason });
                }
              }}
            >
              {actionRing?.action === "freeze" ? "Freeze Ring" : "Clear Ring"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
