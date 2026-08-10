import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, Search, Eye, CheckCircle, XCircle } from "lucide-react";

export default function ChargebackCases() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading, refetch } = trpc.chargebackMgmt.list.useQuery({ page, limit: 20, status, search: search || undefined }, { staleTime: 30_000 });
  const submitEvidenceMutation = trpc.chargebackMgmt.submitEvidence.useMutation({
    onSuccess: () => { toast.success("Evidence submitted"); setSelected(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateStatusMutation = trpc.chargebackMgmt.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const cases = data?.chargebacks ?? [];
  const total = data?.total ?? 0;
  const statusColors: Record<string, string> = { open: "destructive", pending_evidence: "outline", won: "default", lost: "secondary", escalated: "outline" };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chargeback Cases</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and respond to chargeback disputes from card networks</p>
        </div>
        <Button variant="outline" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: total, color: "blue" },
          { label: "Open", value: cases.filter((c: any) => c.status === "open").length, color: "red" },
          { label: "Won", value: cases.filter((c: any) => c.status === "won").length, color: "green" },
          { label: "Lost", value: cases.filter((c: any) => c.status === "lost").length, color: "orange" },
        ].map(s => (
          <Card key={s.label}><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="pt-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by case ID, transaction…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={status ?? "all"} onValueChange={v => { setStatus(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["open", "pending_evidence", "won", "lost", "escalated"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle>Chargeback Cases ({total})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : cases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No chargeback cases found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">Case ID</th>
                    <th className="text-left py-3 px-2">Transaction</th>
                    <th className="text-right py-3 px-2">Amount</th>
                    <th className="text-left py-3 px-2">Reason</th>
                    <th className="text-left py-3 px-2">Network</th>
                    <th className="text-left py-3 px-2">Deadline</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c: any) => (
                    <tr key={c.caseId} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-mono text-xs">{c.caseId?.slice(0, 12)}…</td>
                      <td className="py-3 px-2 font-mono text-xs">{c.transactionId?.slice(0, 12)}…</td>
                      <td className="py-3 px-2 text-right font-medium">₦{((c.amount ?? 0) / 100).toLocaleString()}</td>
                      <td className="py-3 px-2">{c.reason ?? "—"}</td>
                      <td className="py-3 px-2">{c.cardNetwork ?? "—"}</td>
                      <td className="py-3 px-2 text-sm">{c.responseDeadline ? new Date(c.responseDeadline).toLocaleDateString() : "—"}</td>
                      <td className="py-3 px-2"><Badge variant={(statusColors[c.status] as any) ?? "outline"}>{c.status?.replace(/_/g, " ")}</Badge></td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(c)}><Eye className="w-3 h-3" /></Button>
                          {c.status === "open" && (
                            <Button size="sm" variant="ghost" className="text-orange-600" onClick={() => updateStatusMutation.mutate({ id: c.id, status: "under_review" })}>
                              <AlertTriangle className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 20 && (
            <div className="flex justify-between items-center mt-4">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</span>
              <Button variant="outline" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Chargeback Case Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Case ID</p><p className="font-mono">{selected.caseId}</p></div>
                <div><p className="text-muted-foreground">Status</p><Badge variant={(statusColors[selected.status] as any) ?? "outline"}>{selected.status}</Badge></div>
                <div><p className="text-muted-foreground">Amount</p><p className="font-bold">₦{((selected.amount ?? 0) / 100).toLocaleString()}</p></div>
                <div><p className="text-muted-foreground">Currency</p><p>{selected.currency}</p></div>
                <div><p className="text-muted-foreground">Reason</p><p>{selected.reason}</p></div>
                <div><p className="text-muted-foreground">Card Network</p><p>{selected.cardNetwork}</p></div>
              </div>
              {selected.merchantEvidence && (
                <div><p className="text-muted-foreground text-sm">Evidence</p><p className="text-sm mt-1 p-2 bg-muted rounded">{selected.merchantEvidence}</p></div>
              )}
              {selected.status === "open" || selected.status === "pending_evidence" ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Submit Response</p>
                  <textarea
                    className="w-full border rounded p-2 text-sm h-24 resize-none"
                    placeholder="Describe your evidence and response…"
                    id="evidence-text"
                  />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => {
                      const ev = (document.getElementById("evidence-text") as HTMLTextAreaElement)?.value;
                      submitEvidenceMutation.mutate({ id: selected.id, evidence: ev });
                    }} disabled={submitEvidenceMutation.isPending}>
                      <CheckCircle className="w-4 h-4 mr-2" />Submit Evidence
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => {
                      updateStatusMutation.mutate({ id: selected.id, status: "lost" });
                    }} disabled={updateStatusMutation.isPending}>
                      <XCircle className="w-4 h-4 mr-2" />Accept Loss
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
