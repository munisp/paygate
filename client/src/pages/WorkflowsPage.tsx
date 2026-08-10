// Temporal Workflow monitoring page
import { useState } from "react";
import { GitBranch, Play, Square, AlertTriangle, CheckCircle, Clock, XCircle, Loader2, Send } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import MetricCard from "@/components/MetricCard";
import { mockWorkflows, type WorkflowRun } from "@/lib/mockData";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const STATUS_CONFIG: Record<WorkflowRun["status"], { icon: React.ElementType; color: string; bg: string }> = {
  running:    { icon: Loader2,      color: "text-primary",    bg: "bg-primary/10" },
  completed:  { icon: CheckCircle,  color: "text-emerald-400", bg: "bg-emerald-400/10" },
  failed:     { icon: XCircle,      color: "text-red-400",    bg: "bg-red-400/10" },
  terminated: { icon: Square,       color: "text-slate-400",  bg: "bg-slate-400/10" },
  cancelled:  { icon: XCircle,      color: "text-amber-400",  bg: "bg-amber-400/10" },
  timed_out:  { icon: Clock,        color: "text-amber-400",  bg: "bg-amber-400/10" },
};

function WorkflowStatusBadge({ status }: { status: WorkflowRun["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon size={11} className={status === "running" ? "animate-spin" : ""} />
      {status.replace("_", " ")}
    </span>
  );
}

export default function WorkflowsPage() {
  const [filter, setFilter] = useState<WorkflowRun["status"] | "all">("all");
  const [confirmAction, setConfirmAction] = useState<{ wf: WorkflowRun; action: "terminate" | "cancel" | "signal" } | null>(null);

  const running = mockWorkflows.filter(w => w.status === "running").length;
  const failed = mockWorkflows.filter(w => w.status === "failed" || w.status === "timed_out").length;
  const completed = mockWorkflows.filter(w => w.status === "completed").length;

  const filtered = filter === "all" ? mockWorkflows : mockWorkflows.filter(w => w.status === filter);

  const handleAction = (wf: WorkflowRun, action: "terminate" | "cancel" | "signal") => {
    if (action === "signal") {
      toast.success(`Signal sent to workflow ${wf.id.slice(0, 20)}...`);
      return;
    }
    setConfirmAction({ wf, action });
  };

  const confirmAndExecute = () => {
    if (!confirmAction) return;
    toast.success(`Workflow ${confirmAction.action}d: ${confirmAction.wf.id.slice(0, 30)}...`);
    setConfirmAction(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-foreground font-mono tracking-tight flex items-center gap-2">
          <GitBranch size={16} className="text-primary" />
          TEMPORAL EXECUTION LOG
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5 font-mono">Live workflow executions · Incident history · Signal &amp; termination controls</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Running" value={running} icon={Loader2} accentColor="text-primary" style={{ animationDelay: "0ms" }} />
        <MetricCard label="Completed" value={completed} icon={CheckCircle} accentColor="text-emerald-400" style={{ animationDelay: "40ms" }} />
        <MetricCard label="Failed / Timed Out" value={failed} icon={AlertTriangle} accentColor={failed > 0 ? "text-red-400" : "text-emerald-400"} style={{ animationDelay: "80ms" }} />
        <MetricCard label="Total (24h)" value={mockWorkflows.length} icon={GitBranch} accentColor="text-muted-foreground" style={{ animationDelay: "120ms" }} />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "running", "completed", "failed", "timed_out"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Workflow table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Workflow</th>
              <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden md:table-cell">Task Queue</th>
              <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden sm:table-cell">Started</th>
              <th className="text-center px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((wf, i) => (
              <tr key={wf.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors card-enter" style={{ animationDelay: `${i * 25}ms` }}>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground text-sm">{wf.workflowType}</div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px]">{wf.runId}</div>
                  {wf.merchantId && <div className="text-[10px] text-primary font-mono mt-0.5">{wf.merchantId}</div>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="font-mono text-xs text-muted-foreground">{wf.taskQueue}</span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="text-xs text-muted-foreground font-mono">{new Date(wf.startTime).toLocaleTimeString()}</div>
                  {wf.closeTime && <div className="text-[10px] text-muted-foreground/60 font-mono">→ {new Date(wf.closeTime).toLocaleTimeString()}</div>}
                </td>
                <td className="px-4 py-3 text-center">
                  <WorkflowStatusBadge status={wf.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {wf.status === "running" && (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleAction(wf, "signal")} className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors" title="Send Signal">
                        <Send size={13} />
                      </button>
                      <button onClick={() => handleAction(wf, "cancel")} className="p-1.5 rounded hover:bg-amber-400/10 text-amber-400 transition-colors" title="Cancel">
                        <Square size={13} />
                      </button>
                      <button onClick={() => handleAction(wf, "terminate")} className="p-1.5 rounded hover:bg-red-400/10 text-red-400 transition-colors" title="Force Terminate">
                        <XCircle size={13} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">No workflows match the selected filter.</div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-semibold text-foreground mb-2">
              Confirm {confirmAction.action.charAt(0).toUpperCase() + confirmAction.action.slice(1)}
            </h3>
            <p className="text-sm text-muted-foreground mb-1">
              Are you sure you want to <strong className={confirmAction.action === "terminate" ? "text-red-400" : "text-amber-400"}>{confirmAction.action}</strong> this workflow?
            </p>
            <p className="text-xs font-mono text-muted-foreground/70 mb-4 break-all">{confirmAction.wf.id}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAction(null)} className="px-4 py-2 rounded-md bg-secondary text-foreground text-sm hover:bg-secondary/80 transition-colors">Cancel</button>
              <button
                onClick={confirmAndExecute}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${confirmAction.action === "terminate" ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"}`}
              >
                Confirm {confirmAction.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
