import { useState } from "react";
import { trpc2 } from "@/lib/trpc2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, FileText, Zap } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function DisputeAutomation() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"open" | "evidence_submitted" | "won" | "lost" | "all">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceType, setEvidenceType] = useState<"receipt" | "delivery_proof" | "customer_communication" | "refund_proof" | "other">("receipt");

  const chargebacksQuery = trpc2.chargeback.getChargebacks.useQuery({ status: statusFilter }, { enabled: !!user });

  const submitMutation = trpc2.chargeback.submitEvidence.useMutation({
    onSuccess: () => {
      toast("Evidence submitted successfully");
      chargebacksQuery.refetch();
      setSelectedId(null);
      setEvidenceUrl("");
      setDescription("");
    },
    onError: (e: any) => toast("Failed to submit evidence", { description: e.message }),
  });

  const autoMutation = trpc2.chargeback.autoCollectEvidence.useMutation({
    onSuccess: () => {
      toast("Auto-collection initiated — evidence will be gathered automatically");
      chargebacksQuery.refetch();
    },
    onError: (e: any) => toast("Auto-collection failed", { description: e.message }),
  });

  const chargebacks = (chargebacksQuery.data as any)?.chargebacks ?? (Array.isArray(chargebacksQuery.data) ? chargebacksQuery.data : []);

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    open: "destructive",
    evidence_submitted: "secondary",
    won: "default",
    lost: "destructive",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dispute Automation</h1>
          <p className="text-muted-foreground">AI-powered chargeback management and dispute resolution</p>
        </div>
        <Button onClick={() => chargebacksQuery.refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "open", "evidence_submitted", "won", "lost"] as const).map(s => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
            {s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {/* Evidence Submission Form */}
      {selectedId && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Submit Evidence for {selectedId.slice(0, 12)}...</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Evidence Type</label>
                <select
                  className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                  value={evidenceType}
                  onChange={(e) => setEvidenceType(e.target.value as any)}
                >
                  <option value="receipt">Receipt</option>
                  <option value="delivery_proof">Delivery Proof</option>
                  <option value="customer_communication">Customer Communication</option>
                  <option value="refund_proof">Refund Proof</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Evidence URL</label>
                <Input placeholder="https://..." value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background min-h-[80px]"
                placeholder="Describe the evidence..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => submitMutation.mutate({ chargebackId: selectedId, evidenceType, evidenceUrl, description })}
                disabled={!evidenceUrl || !description || submitMutation.isPending}
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Evidence"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { autoMutation.mutate({ chargebackId: selectedId }); setSelectedId(null); }}
                disabled={autoMutation.isPending}
              >
                <Zap className="h-4 w-4 mr-1" /> Auto-Collect
              </Button>
              <Button variant="ghost" onClick={() => setSelectedId(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chargebacks List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" /> Chargebacks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chargebacksQuery.isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading chargebacks...</p>
          ) : chargebacks.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <p className="text-muted-foreground">No chargebacks found for this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Chargeback ID</th>
                    <th className="text-left py-2 px-3">Transaction</th>
                    <th className="text-right py-2 px-3">Amount</th>
                    <th className="text-left py-2 px-3">Reason</th>
                    <th className="text-left py-2 px-3">Due Date</th>
                    <th className="text-center py-2 px-3">Status</th>
                    <th className="text-center py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {chargebacks.map((c: any) => (
                    <tr key={c.id ?? c.chargebackId} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs">{(c.id ?? c.chargebackId)?.slice(0, 10)}...</td>
                      <td className="py-2 px-3 font-mono text-xs">{c.transactionId?.slice(0, 10)}...</td>
                      <td className="py-2 px-3 text-right font-mono">₦{((c.amountKobo ?? c.amount ?? 0) / 100).toLocaleString()}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.reason}</td>
                      <td className="py-2 px-3">
                        <span className={c.dueDate && new Date(c.dueDate) < new Date() ? "text-red-500 font-medium" : "text-muted-foreground"}>
                          {c.dueDate ? new Date(c.dueDate).toLocaleDateString() : "—"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant={statusColors[c.status] ?? "outline"}>{c.status}</Badge>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {(c.status === "open") && (
                          <Button size="sm" variant="outline" onClick={() => setSelectedId(c.id ?? c.chargebackId)}>
                            Respond
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
