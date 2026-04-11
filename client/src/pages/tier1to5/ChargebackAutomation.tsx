import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Shield, Zap, AlertTriangle } from "lucide-react";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function ChargebackAutomation() {
  const { data: chargebacks, isLoading, refetch } = trpc.tier1to5.chargeback.getChargebacks.useQuery({ status: "open" });

  const autoEvidenceMutation = trpc.tier1to5.chargeback.autoCollectEvidence.useMutation({
    onSuccess: () => { toast.success("Evidence auto-collected and submitted."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const submitMutation = trpc.tier1to5.chargeback.submitEvidence.useMutation({
    onSuccess: () => { toast.success("Evidence submitted to card network."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColor: Record<string, string> = {
    open: "bg-red-100 text-red-800",
    under_review: "bg-yellow-100 text-yellow-800",
    won: "bg-green-100 text-green-800",
    lost: "bg-gray-100 text-gray-800",
    withdrawn: "bg-blue-100 text-blue-800",
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Chargeback Automation</h1>
            <p className="text-muted-foreground text-sm mt-1">AI-powered evidence collection and dispute management</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{chargebacks?.filter((c: any) => c.status === "open").length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Open Disputes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Shield className="w-8 h-8 text-green-500 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{chargebacks?.filter((c: any) => c.status === "won").length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Won</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Zap className="w-8 h-8 text-primary opacity-70" />
              <div>
                <p className="text-2xl font-bold">{chargebacks?.filter((c: any) => c.autoEvidenceCollected).length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Auto-Defended</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chargebacks */}
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i} className="animate-pulse h-24" />)}</div>
        ) : !chargebacks?.length ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 text-green-500 opacity-50" />
              <p>No open chargebacks. Your dispute rate is healthy.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {chargebacks.map((cb: any) => (
              <Card key={cb.id} className="border-red-100">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={statusColor[cb.status] ?? "bg-gray-100 text-gray-800"}>{cb.status}</Badge>
                        <span className="font-mono text-sm">{cb.reference}</span>
                        <span className="font-bold">{formatNGN(cb.amountKobo)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Reason: {cb.reason} · Network: {cb.cardNetwork} · Due: {cb.responseDueDate ? new Date(cb.responseDueDate).toLocaleDateString() : "—"}
                      </p>
                      {cb.autoEvidenceCollected && (
                        <Badge variant="outline" className="text-xs">
                          <Zap className="w-3 h-3 mr-1" />Evidence Auto-Collected
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!cb.autoEvidenceCollected && (
                        <Button size="sm" variant="outline" onClick={() => autoEvidenceMutation.mutate({ chargebackId: cb.id })} disabled={autoEvidenceMutation.isPending}>
                          <Zap className="w-3 h-3 mr-1" />Auto-Collect
                        </Button>
                      )}
                      <Button size="sm" onClick={() => submitMutation.mutate({ chargebackId: cb.id, evidenceType: "receipt", evidenceUrl: "", description: "Transaction was authorized by cardholder. Delivery confirmed." })} disabled={submitMutation.isPending}>
                        <Shield className="w-3 h-3 mr-1" />Submit Evidence
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
