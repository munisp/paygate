import { useState } from "react";
import { trpc } from "@/lib/trpc";
import SagaVisualizer, { LiveSagaVisualizer } from "@/components/SagaVisualizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Play, Zap, Activity, Clock, CheckCircle2, XCircle } from "lucide-react";

type SagaType = "fhir_payment" | "cbdc_atomic_swap";

export default function DomainSagas() {
  const [sagaType, setSagaType] = useState<SagaType>("fhir_payment");
  const [liveSagaId, setLiveSagaId] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState("");

  const launchMutation = trpc.wave223.sagas.launch.useMutation({
    onSuccess: (data) => {
      setLiveSagaId(data.sagaId);
      toast.success(`Saga launched — ID: ${data.sagaId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: recentSagas, refetch } = trpc.wave223.sagas.listRecent.useQuery({ limit: 10 });

  const handleLaunch = () => {
    launchMutation.mutate({
      sagaType,
      referenceId: referenceId || `REF-${Date.now()}`,
    });
  };

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
    return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transaction Saga Visualizer</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time visualization of FHIR payment orchestration and CBDC atomic swap workflows
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Activity className="h-3.5 w-3.5" /> Live SSE
        </Badge>
      </div>

      {/* Launch controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4 text-primary" /> Launch New Saga</CardTitle>
          <CardDescription>Initiate a saga workflow to observe real-time step progression</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 min-w-[200px]">
              <Label>Saga Type</Label>
              <Select value={sagaType} onValueChange={(v) => setSagaType(v as SagaType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fhir_payment">FHIR Payment Orchestration (5 steps)</SelectItem>
                  <SelectItem value="cbdc_atomic_swap">CBDC Atomic Swap (6 steps)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 min-w-[200px]">
              <Label>Reference ID (optional)</Label>
              <Input
                placeholder={`REF-${Date.now()}`}
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
              />
            </div>
            <Button onClick={handleLaunch} disabled={launchMutation.isPending} className="gap-2">
              <Zap className="h-4 w-4" />
              {launchMutation.isPending ? "Launching…" : "Launch Saga"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live visualizer */}
      {liveSagaId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Live Saga</h2>
            <Badge className="font-mono text-xs">{liveSagaId}</Badge>
            <Button variant="ghost" size="sm" onClick={() => setLiveSagaId(null)} className="ml-auto text-muted-foreground">
              Close
            </Button>
          </div>
          <LiveSagaVisualizer sagaId={liveSagaId} sagaType={sagaType} />
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Workflow Preview</h2>
          <SagaVisualizer />
        </div>
      )}

      {/* Recent sagas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Recent Sagas</CardTitle>
            <CardDescription>Last 10 saga instances</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>Refresh</Button>
        </CardHeader>
        <CardContent>
          {!recentSagas?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No sagas launched yet. Use the controls above to start one.</p>
          ) : (
            <div className="space-y-2">
              {recentSagas.map((saga) => (
                <div
                  key={saga.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setLiveSagaId(saga.id)}
                >
                  {statusIcon(saga.status ?? "running")}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-mono truncate">{saga.id}</p>
                    <p className="text-xs text-muted-foreground">{saga.sagaType?.replace(/_/g, ' ')} · Step {saga.currentStep ?? 0}</p>
                  </div>
                  <Badge variant={saga.status === "completed" ? "default" : saga.status === "failed" ? "destructive" : "secondary"}>
                    {saga.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {saga.createdAt ? new Date(saga.createdAt).toLocaleTimeString() : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
