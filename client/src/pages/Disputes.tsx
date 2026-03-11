import { useState } from "react";
import { RefreshCw, AlertTriangle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:             "bg-red-50 text-red-700 border-red-200",
    under_review:     "bg-amber-50 text-amber-700 border-amber-200",
    resolved_merchant:"bg-emerald-50 text-emerald-700 border-emerald-200",
    resolved_customer:"bg-blue-50 text-blue-700 border-blue-200",
    closed:           "bg-muted text-muted-foreground border-border",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.open}`}>{status.replace(/_/g, " ")}</span>;
}

export default function Disputes() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.disputes.list.useQuery(
    { limit: 20, offset: 0, status: statusFilter },
    { staleTime: 30_000 }
  );
  const respondMutation = trpc.disputes.respond.useMutation({
    onSuccess: () => {
      toast.success("Response submitted");
      setRespondingId(null);
      setResponse("");
      utils.disputes.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Disputes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} total disputes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-1.5" />Refresh</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["", "open", "under_review", "resolved_merchant", "resolved_customer", "closed"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s || undefined)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${statusFilter === (s || undefined) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {s ? s.replace(/_/g, " ") : "All"}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["Reference", "Amount", "Status", "Reason", "Due Date", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? Array(6).fill(0).map((_, i) => (
              <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
            )) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-40" />
                No disputes found
              </td></tr>
            ) : rows.map((d) => (
              <>
                <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.reference}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{d.currency} {Number(d.amount).toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">{d.reason ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{d.dueDate ? new Date(d.dueDate).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    {(d.status === "open" || d.status === "under_review") && (
                      <button onClick={() => setRespondingId(respondingId === d.id ? null : d.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                        <MessageSquare className="w-3 h-3" />Respond
                      </button>
                    )}
                  </td>
                </tr>
                {respondingId === d.id && (
                  <tr key={`${d.id}-form`} className="bg-muted/20">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="space-y-3">
                        <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={3}
                          placeholder="Provide your response (minimum 10 characters)..."
                          className="w-full px-3 py-2 text-sm bg-card rounded-lg border border-border focus:ring-2 focus:ring-primary outline-none resize-none" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => respondMutation.mutate({ id: d.id, merchantResponse: response })}
                            disabled={response.length < 10 || respondMutation.isPending}>
                            {respondMutation.isPending ? "Submitting..." : "Submit Response"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setRespondingId(null); setResponse(""); }}>Cancel</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
