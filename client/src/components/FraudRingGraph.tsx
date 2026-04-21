import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  label: string;
  type: "account" | "transaction" | "device" | "ip";
  riskScore: number;
  isFrozen?: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  edgeType: "transfer" | "shared_device" | "shared_ip" | "same_account";
}

interface FraudRingGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ringId: string;
  width?: number;
  height?: number;
  onNodeClick?: (node: GraphNode) => void;
}

const NODE_COLORS: Record<GraphNode["type"], string> = {
  account: "#6366f1",
  transaction: "#f59e0b",
  device: "#10b981",
  ip: "#ef4444",
};

const EDGE_COLORS: Record<GraphEdge["edgeType"], string> = {
  transfer: "#94a3b8",
  shared_device: "#10b981",
  shared_ip: "#ef4444",
  same_account: "#6366f1",
};

export default function FraudRingGraph({
  nodes,
  edges,
  ringId,
  width = 700,
  height = 450,
  onNodeClick,
}: FraudRingGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Stable simulation data — memoized to avoid re-running on every render
  const simNodes = useMemo(
    () => nodes.map((n) => ({ ...n, x: width / 2, y: height / 2 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ringId]
  );

  const simLinks = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        source: e.source,
        target: e.target,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ringId]
  );

  useEffect(() => {
    if (!svgRef.current || simNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Zoom + pan
    const g = svg.append("g");
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // Arrow markers
    const defs = svg.append("defs");
    ["transfer", "shared_device", "shared_ip", "same_account"].forEach((type) => {
      defs
        .append("marker")
        .attr("id", `arrow-${type}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", EDGE_COLORS[type as GraphEdge["edgeType"]]);
    });

    // Force simulation
    const simulation = d3
      .forceSimulation(simNodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(simLinks)
          .id((d: any) => d.id)
          .distance(80)
          .strength(0.5)
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(28));

    // Edges
    const link = g
      .append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d) => EDGE_COLORS[d.edgeType])
      .attr("stroke-width", (d) => Math.max(1, d.weight * 2))
      .attr("stroke-opacity", 0.7)
      .attr("marker-end", (d) => `url(#arrow-${d.edgeType})`);

    // Edge labels
    const edgeLabel = g
      .append("g")
      .selectAll("text")
      .data(simLinks)
      .join("text")
      .attr("font-size", 9)
      .attr("fill", "#94a3b8")
      .attr("text-anchor", "middle")
      .text((d) => d.edgeType.replace("_", " "));

    // Nodes
    const node = g
      .append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, (typeof simNodes)[number]>()
          .on("start", (event, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d: any) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on("click", (_event, d) => onNodeClick?.(d));

    // Node circle
    node
      .append("circle")
      .attr("r", (d) => 12 + d.riskScore / 20)
      .attr("fill", (d) => (d.isFrozen ? "#475569" : NODE_COLORS[d.type]))
      .attr("stroke", (d) => (d.riskScore > 70 ? "#ef4444" : "#1e293b"))
      .attr("stroke-width", (d) => (d.riskScore > 70 ? 3 : 1.5))
      .attr("opacity", (d) => (d.isFrozen ? 0.5 : 1));

    // Frozen indicator
    node
      .filter((d) => !!d.isFrozen)
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", 12)
      .attr("fill", "#94a3b8")
      .text("🔒");

    // Node label
    node
      .append("text")
      .attr("dy", (d) => 18 + d.riskScore / 20)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#e2e8f0")
      .text((d) => d.label.slice(0, 12));

    // Risk score badge
    node
      .filter((d) => d.riskScore > 50)
      .append("text")
      .attr("dy", -14)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", "#ef4444")
      .attr("font-weight", "bold")
      .text((d) => `${d.riskScore}`);

    // Tooltip
    node.append("title").text(
      (d) =>
        `${d.label}\nType: ${d.type}\nRisk: ${d.riskScore}/100${d.isFrozen ? "\n[FROZEN]" : ""}`
    );

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      edgeLabel
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [simNodes, simLinks, width, height, onNodeClick]);

  return (
    <div className="relative w-full bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-slate-800/80 rounded-lg p-2 text-xs">
        <span className="text-slate-400 font-semibold mb-1">Node Types</span>
        {(Object.entries(NODE_COLORS) as [GraphNode["type"], string][]).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: color }} />
            <span className="text-slate-300 capitalize">{type}</span>
          </div>
        ))}
      </div>
      {/* Edge legend */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 bg-slate-800/80 rounded-lg p-2 text-xs">
        <span className="text-slate-400 font-semibold mb-1">Edge Types</span>
        {(Object.entries(EDGE_COLORS) as [GraphEdge["edgeType"], string][]).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 inline-block" style={{ background: color }} />
            <span className="text-slate-300 capitalize">{type.replace("_", " ")}</span>
          </div>
        ))}
      </div>
      <svg ref={svgRef} width={width} height={height} className="w-full" />
      {simNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
          No graph data available for ring {ringId}
        </div>
      )}
    </div>
  );
}
