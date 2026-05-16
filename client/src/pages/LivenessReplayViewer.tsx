import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Eye, Shield, AlertTriangle, CheckCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, Cpu, Server, Brain, BarChart3, Filter,
  Play, Pause, Info, User, Loader2, X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// ─── Decision badge helper ────────────────────────────────────────────────────
function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20">Pending</Badge>;
  const map: Record<string, string> = {
    real:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    spoof:     "bg-red-500/10 text-red-400 border-red-500/20",
    uncertain: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return <Badge className={`border ${map[decision] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>{decision}</Badge>;
}

// ─── Ensemble Score Bar ───────────────────────────────────────────────────────
function EnsembleBar({ label, score, weight, icon }: { label: string; score: number | null; weight: number; icon: React.ReactNode }) {
  const pct = score !== null ? Math.round(score * 100) : null;
  const color = pct === null ? "bg-zinc-700" : pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-zinc-400">
          {icon}
          <span>{label}</span>
          <span className="text-zinc-600">({Math.round(weight * 100)}% weight)</span>
        </div>
        <span className={`font-mono font-semibold ${pct === null ? "text-zinc-600" : pct >= 75 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400"}`}>
          {pct !== null ? `${pct}%` : "N/A"}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: pct !== null ? `${pct}%` : "0%" }} />
      </div>
    </div>
  );
}

// ─── Session Detail Dialog ────────────────────────────────────────────────────
function SessionDetailDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { data: session, isLoading } = trpc.livenessReplay.getSession.useQuery({ id: sessionId }, { staleTime: 30_000 });
  const utils = trpc.useUtils();
  const [overrideDecision, setOverrideDecision] = useState<string>("");
  const [overrideNote, setOverrideNote] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  const overrideMutation = trpc.livenessReplay.overrideDecision.useMutation({
    onSuccess: () => {
      toast.success("Decision overridden successfully");
      utils.livenessReplay.listSessions.invalidate();
      utils.livenessReplay.getSession.invalidate({ id: sessionId });
      setShowOverride(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
    </div>
  );

  if (!session) return (
    <div className="text-center text-zinc-500 py-12">Session not found</div>
  );

  const s = session as any;
  const ensemblePct = s.ensembleScore !== null ? Math.round(s.ensembleScore * 100) : null;

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 font-mono">{s.id}</p>
          <div className="flex items-center gap-2 mt-1">
            <DecisionBadge decision={s.overrideDecision ?? s.decision} />
            {s.overrideDecision && (
              <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">Overridden</Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold font-mono text-white">
            {ensemblePct !== null ? `${ensemblePct}%` : "—"}
          </p>
          <p className="text-xs text-zinc-500">Ensemble Score</p>
        </div>
      </div>

      {/* Ensemble Breakdown */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-400" />
            Ensemble Score Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <EnsembleBar
            label="Rust Signal Processor"
            score={s.rustSignalScore}
            weight={0.3}
            icon={<Cpu className="w-3 h-3" />}
          />
          <EnsembleBar
            label="Go API Gateway"
            score={s.goGatewayScore}
            weight={0.3}
            icon={<Server className="w-3 h-3" />}
          />
          <EnsembleBar
            label="Python ML (InsightFace)"
            score={s.pythonMlScore}
            weight={0.4}
            icon={<Brain className="w-3 h-3" />}
          />
          <div className="border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400 font-medium">Weighted Ensemble</span>
              <span className={`font-mono font-bold ${ensemblePct === null ? "text-zinc-500" : ensemblePct >= 75 ? "text-emerald-400" : ensemblePct >= 50 ? "text-amber-400" : "text-red-400"}`}>
                {ensemblePct !== null ? `${ensemblePct}%` : "N/A"}
              </span>
            </div>
            <Progress value={ensemblePct ?? 0} className="mt-2 h-2 bg-zinc-800" />
          </div>
        </CardContent>
      </Card>

      {/* Session Metadata */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: "Mode", value: s.mode },
          { label: "Challenge", value: s.challengeType ?? "—" },
          { label: "Spoof Type", value: s.spoofType ?? "—" },
          { label: "Frame Count", value: s.frameCount },
          { label: "Duration", value: s.durationMs ? `${s.durationMs}ms` : "—" },
          { label: "Device", value: s.deviceType ?? "—" },
          { label: "IP", value: s.ipAddress ?? "—" },
          { label: "Created", value: new Date(s.createdAt).toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
            <p className="text-zinc-500 text-xs">{label}</p>
            <p className="text-white font-mono text-xs mt-0.5 truncate">{String(value)}</p>
          </div>
        ))}
      </div>

      {/* Override */}
      {!showOverride ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          onClick={() => setShowOverride(true)}
        >
          <Shield className="w-4 h-4 mr-2" />
          Override Decision
        </Button>
      ) : (
        <Card className="bg-zinc-900 border-amber-500/30">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-amber-400">Override Decision</p>
            <Select value={overrideDecision} onValueChange={setOverrideDecision}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                <SelectValue placeholder="Select new decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="real">Real</SelectItem>
                <SelectItem value="spoof">Spoof</SelectItem>
                <SelectItem value="uncertain">Uncertain</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Override note (optional)"
              value={overrideNote}
              onChange={e => setOverrideNote(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white text-sm resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                disabled={!overrideDecision || overrideMutation.isPending}
                onClick={() => overrideMutation.mutate({
                  id: sessionId,
                  decision: overrideDecision as any,
                  note: overrideNote || undefined,
                })}
              >
                {overrideMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply Override"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowOverride(false)} className="text-zinc-400">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LivenessReplayViewer() {
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const { data, isLoading, refetch } = trpc.livenessReplay.listSessions.useQuery({
    decision: decisionFilter !== "all" ? (decisionFilter as any, { staleTime: 30_000 }) : undefined,
    limit: LIMIT,
    offset: page * LIMIT,
  }, { staleTime: 30_000 });

  const { data: stats } = trpc.livenessReplay.stats.useQuery({ days: 30 }, { staleTime: 60_000 });

  const rows = (data as any)?.rows ?? [];
  const total = (data as any)?.total ?? 0;
  const s = stats as any;

  const passRate = s?.total > 0 ? Math.round((s.real / s.total) * 100) : 0;
  const spoofRate = s?.total > 0 ? Math.round((s.spoof / s.total) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Liveness Replay Viewer</h1>
          <p className="text-zinc-400 mt-1">Review liveness sessions with 3-service ensemble scoring</p>
        </div>
        <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sessions (30d)", value: s?.total ?? 0, icon: <Eye className="w-5 h-5 text-blue-400" />, color: "text-white" },
          { label: "Real (Pass)", value: s?.real ?? 0, icon: <CheckCircle className="w-5 h-5 text-emerald-400" />, color: "text-emerald-400", sub: `${passRate}%` },
          { label: "Spoof (Fail)", value: s?.spoof ?? 0, icon: <AlertTriangle className="w-5 h-5 text-red-400" />, color: "text-red-400", sub: `${spoofRate}%` },
          { label: "Uncertain", value: s?.uncertain ?? 0, icon: <Clock className="w-5 h-5 text-amber-400" />, color: "text-amber-400" },
        ].map(({ label, value, icon, color, sub }) => (
          <Card key={label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-zinc-400 text-xs">{label}</p>
                {icon}
              </div>
              <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
              {sub && <p className="text-xs text-zinc-500 mt-1">{sub} of total</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ensemble Architecture Info */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-medium text-white">3-Service Ensemble Architecture</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <Cpu className="w-4 h-4 text-blue-400" />, label: "Rust Signal Processor", desc: "Fourier FFT, LBP texture, colour depth — 6 spoof types", weight: "30%" },
              { icon: <Server className="w-4 h-4 text-green-400" />, label: "Go API Gateway", desc: "Face detection, landmarks, face-match routing", weight: "30%" },
              { icon: <Brain className="w-4 h-4 text-purple-400" />, label: "Python ML Service", desc: "InsightFace, MediaPipe, SilentFace, active challenge", weight: "40%" },
            ].map(({ icon, label, desc, weight }) => (
              <div key={label} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                <div className="flex items-center gap-2 mb-1">
                  {icon}
                  <span className="text-xs font-medium text-white">{label}</span>
                  <Badge className="ml-auto bg-zinc-700 text-zinc-300 text-xs border-0">{weight}</Badge>
                </div>
                <p className="text-xs text-zinc-500">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-zinc-500" />
        <Select value={decisionFilter} onValueChange={v => { setDecisionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40 bg-zinc-900 border-zinc-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Decisions</SelectItem>
            <SelectItem value="real">Real</SelectItem>
            <SelectItem value="spoof">Spoof</SelectItem>
            <SelectItem value="uncertain">Uncertain</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-zinc-500 ml-auto">{total} sessions</span>
      </div>

      {/* Sessions Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <Eye className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">No liveness sessions found</p>
              <p className="text-zinc-600 text-sm mt-1">Sessions appear here when liveness checks are performed</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Session ID</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Decision</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Ensemble</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Rust</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Go</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Python ML</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Mode</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Created</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const ens = row.ensembleScore !== null && row.ensembleScore !== undefined
                      ? Math.round(row.ensembleScore * 100) : null;
                    return (
                      <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-xs font-mono text-zinc-300 truncate max-w-[120px]">{row.id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <DecisionBadge decision={row.overrideDecision ?? row.decision} />
                          {row.overrideDecision && (
                            <Badge className="ml-1 bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">OVR</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-mono text-sm font-semibold ${ens === null ? "text-zinc-600" : ens >= 75 ? "text-emerald-400" : ens >= 50 ? "text-amber-400" : "text-red-400"}`}>
                            {ens !== null ? `${ens}%` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-zinc-400">
                          {row.rustSignalScore !== null ? `${Math.round(row.rustSignalScore * 100)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-zinc-400">
                          {row.goGatewayScore !== null ? `${Math.round(row.goGatewayScore * 100)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-zinc-400">
                          {row.pythonMlScore !== null ? `${Math.round(row.pythonMlScore * 100)}%` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className="bg-zinc-700 text-zinc-300 border-0 text-xs">{row.mode}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500 font-mono">
                          {new Date(row.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                            onClick={() => setSelectedSessionId(row.id)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-zinc-500">
            Page {page + 1} of {Math.ceil(total / LIMIT)}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            disabled={(page + 1) * LIMIT >= total}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Session Detail Dialog */}
      <Dialog open={!!selectedSessionId} onOpenChange={open => !open && setSelectedSessionId(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-400" />
              Liveness Session Detail
            </DialogTitle>
          </DialogHeader>
          {selectedSessionId && (
            <SessionDetailDialog
              sessionId={selectedSessionId}
              onClose={() => setSelectedSessionId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
