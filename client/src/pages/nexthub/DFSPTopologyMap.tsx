import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Network, Activity, Globe, Zap } from "lucide-react";

type DFSPNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  latencyMs?: number;
  transferCount?: number;
  x?: number;
  y?: number;
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  suspended: "#f59e0b",
  inactive: "#ef4444",
  pending: "#6366f1",
};

function TopologyCanvas({ nodes, edges }: { nodes: DFSPNode[]; edges: Array<{ from: string; to: string; volume: number }> }) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Arrange nodes in a circle around a central hub
  const cx = 400, cy = 280, radius = 200;
  const positioned = nodes.map((n, i) => {
    if (n.type === "hub") return { ...n, x: cx, y: cy };
    const angle = (i / (nodes.length - 1)) * 2 * Math.PI;
    return { ...n, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });

  const nodeMap = Object.fromEntries(positioned.map((n) => [n.id, n]));

  return (
    <div className="relative w-full overflow-auto">
      <svg viewBox="0 0 800 560" className="w-full h-auto min-h-[320px]">
        {/* Edges */}
        {edges.map((e, i) => {
          const from = nodeMap[e.from];
          const to = nodeMap[e.to];
          if (!from || !to) return null;
          const strokeWidth = Math.max(1, Math.min(4, e.volume / 100));
          return (
            <line
              key={i}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke="#6366f1"
              strokeWidth={strokeWidth}
              strokeOpacity={0.3}
              strokeDasharray={e.volume < 10 ? "4 4" : undefined}
            />
          );
        })}
        {/* Nodes */}
        {positioned.map((n) => {
          const isHub = n.type === "hub";
          const r = isHub ? 36 : 24;
          const fill = STATUS_COLORS[n.status ?? "inactive"] ?? "#94a3b8";
          const isHovered = hovered === n.id;
          return (
            <g key={n.id} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
              <circle cx={n.x} cy={n.y} r={r + (isHovered ? 4 : 0)} fill={fill} fillOpacity={0.15} stroke={fill} strokeWidth={isHovered ? 2.5 : 1.5} />
              {isHub && <circle cx={n.x} cy={n.y} r={r - 8} fill={fill} fillOpacity={0.4} />}
              <text x={n.x} y={(n.y ?? 0) + 4} textAnchor="middle" fontSize={isHub ? 11 : 9} fill="currentColor" className="select-none font-medium">
                {n.name?.length > 12 ? n.name.slice(0, 12) + "…" : n.name}
              </text>
              {n.latencyMs !== undefined && (
                <text x={n.x} y={(n.y ?? 0) + r + 14} textAnchor="middle" fontSize={8} fill="#94a3b8" className="select-none">
                  {n.latencyMs}ms
                </text>
              )}
              {isHovered && (
                <g>
                  <rect x={(n.x ?? 0) + r + 4} y={(n.y ?? 0) - 28} width={120} height={52} rx={4} fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth={1} />
                  <text x={(n.x ?? 0) + r + 10} y={(n.y ?? 0) - 14} fontSize={9} fill="currentColor">{n.name}</text>
                  <text x={(n.x ?? 0) + r + 10} y={(n.y ?? 0) - 2} fontSize={8} fill="#94a3b8">Type: {n.type}</text>
                  <text x={(n.x ?? 0) + r + 10} y={(n.y ?? 0) + 10} fontSize={8} fill="#94a3b8">Transfers: {n.transferCount ?? 0}</text>
                  <text x={(n.x ?? 0) + r + 10} y={(n.y ?? 0) + 22} fontSize={8} fill={STATUS_COLORS[n.status ?? "inactive"]}>● {n.status}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function DFSPTopologyMap() {
  const { data: topology, refetch, isLoading } = trpc.wave223.dfspTopology.get.useQuery();

  const nodes: DFSPNode[] = topology?.nodes ?? [];
  const edges = topology?.edges ?? [];

  const statusCounts = nodes.reduce((acc, n) => {
    acc[n.status ?? "unknown"] = (acc[n.status ?? "unknown"] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Network className="h-6 w-6 text-indigo-500" /> DFSP Network Topology</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time view of all DFSPs connected to the NextHub switch</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Status summary */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] ?? "#94a3b8" }} />
            <span className="capitalize">{status}</span>
            <Badge variant="secondary" className="text-xs">{count}</Badge>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Network Graph</CardTitle>
          <CardDescription>Hover over a node to see DFSP details. Edge thickness reflects transfer volume.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">Loading topology…</div>
          ) : nodes.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">No DFSP nodes registered.</div>
          ) : (
            <TopologyCanvas nodes={nodes} edges={edges} />
          )}
        </CardContent>
      </Card>

      {/* DFSP list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {nodes.filter((n) => n.type !== "hub").map((n) => (
          <Card key={n.id} className="border-0 bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{n.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{n.type}</p>
                </div>
                <Badge variant={n.status === "active" ? "default" : "secondary"} className="capitalize">{n.status}</Badge>
              </div>
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><Zap className="h-3 w-3" />{n.latencyMs ?? "—"}ms</div>
                <div className="flex items-center gap-1"><Activity className="h-3 w-3" />{n.transferCount?.toLocaleString() ?? 0} transfers</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
