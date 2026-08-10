import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { AlertTriangle, Clock, Upload, CheckCircle, XCircle } from "lucide-react";

const STATE_COLORS: Record<string, string> = {
  open: "bg-yellow-500",
  evidence_submitted: "bg-blue-500",
  under_review: "bg-purple-500",
  arbitration: "bg-orange-500",
  resolved_won: "bg-green-500",
  resolved_lost: "bg-red-500",
  closed: "bg-gray-500",
};

function CountdownTimer({ deadlineIso }: { deadlineIso: string }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(deadlineIso).getTime() - Date.now();
      if (ms <= 0) { setRemaining("EXPIRED"); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);
  const isUrgent = new Date(deadlineIso).getTime() - Date.now() < 24 * 3600 * 1000;
  return (
    <span className={`font-mono text-sm ${isUrgent ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
      <Clock className="w-3 h-3 inline mr-1" />{remaining}
    </span>
  );
}

export default function DisputeLifecycle() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const { data, isLoading, refetch } = trpc.chargebackLifecycle.list.useQuery({ page: 1, pageSize: 50 });
  const { data: detail } = trpc.chargebackLifecycle.get.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const submitEvidence = trpc.chargebackLifecycle.submitEvidence.useMutation({
    onSuccess: () => { toast.success("Evidence submitted"); refetch(); setEvidenceFile(null); },
    onError: (e) => toast.error(e.message),
  });

  const escalate = trpc.chargebackLifecycle.escalate.useMutation({
    onSuccess: () => { toast.success("Escalated to arbitration"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleEvidenceUpload = async () => {
    if (!evidenceFile || !selectedId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      submitEvidence.mutate({
        chargebackId: selectedId,
        evidenceBase64: base64,
        evidenceType: evidenceFile.type,
        filename: evidenceFile.name,
        description: "Evidence uploaded via portal",
      });
    };
    reader.readAsDataURL(evidenceFile);
  };

  const chargebacks = data?.chargebacks ?? [];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dispute Lifecycle</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage chargebacks end-to-end: evidence submission, arbitration, and resolution
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Chargeback list */}
          <div className="lg:col-span-1 space-y-2">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Active Disputes</h2>
            {chargebacks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                No active disputes
              </div>
            )}
            {chargebacks.map((cb: any) => (
              <Card
                key={cb.id}
                className={`cursor-pointer transition-colors ${selectedId === cb.id ? "border-primary" : ""}`}
                onClick={() => setSelectedId(cb.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs">{cb.id.slice(0, 8).toUpperCase()}</span>
                    <Badge className={`${STATE_COLORS[cb.lifecycleState] ?? "bg-gray-500"} text-white text-xs`}>
                      {cb.lifecycleState.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">₦{((cb.amountKobo ?? 0) / 100).toLocaleString()}</p>
                  {cb.responseDeadline && (
                    <CountdownTimer deadlineIso={cb.responseDeadline} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Right: Detail panel */}
          <div className="lg:col-span-2">
            {!selectedId && (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Select a dispute to view details
              </div>
            )}
            {detail && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Dispute {detail.id.slice(0, 8).toUpperCase()}</span>
                      <Badge className={`${STATE_COLORS[detail.lifecycleState] ?? "bg-gray-500"} text-white`}>
                        {detail.lifecycleState.replace(/_/g, " ")}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Amount:</span> ₦{((detail.amountKobo ?? 0) / 100).toLocaleString()}</div>
                      <div><span className="text-muted-foreground">Reason:</span> {detail.reason}</div>
                      <div><span className="text-muted-foreground">Network:</span> {detail.cardNetwork ?? "N/A"}</div>
                      <div><span className="text-muted-foreground">ARN:</span> {detail.acquirerReferenceNumber ?? "N/A"}</div>
                    </div>
                    {detail.responseDeadline && (
                      <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        <span className="text-sm">Response deadline: </span>
                        <CountdownTimer deadlineIso={detail.responseDeadline} />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                  <CardHeader><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(detail.timeline ?? []).map((event: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                          <div>
                            <span className="font-medium">{event.action}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{new Date(event.timestamp).toLocaleString()}</span>
                            {event.note && <p className="text-xs text-muted-foreground">{event.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Evidence upload */}
                {["open", "evidence_submitted"].includes(detail.lifecycleState) && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">Submit Evidence</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={e => setEvidenceFile(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                      {evidenceFile && (
                        <p className="text-xs text-muted-foreground">{evidenceFile.name} ({(evidenceFile.size / 1024).toFixed(1)} KB)</p>
                      )}
                      <Button
                        size="sm"
                        onClick={handleEvidenceUpload}
                        disabled={!evidenceFile || submitEvidence.isPending}
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        {submitEvidence.isPending ? "Uploading..." : "Upload Evidence"}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Escalate to arbitration */}
                {detail.lifecycleState === "evidence_submitted" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => escalate.mutate({ chargebackId: detail.id })}
                    disabled={escalate.isPending}
                  >
                    {escalate.isPending ? "Escalating..." : "Escalate to Arbitration"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
