import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, CheckCircle2, XCircle, Clock, Loader2, Zap, Activity, Wifi, WifiOff, RefreshCw } from "lucide-react";

type StepStatus = "pending" | "running" | "completed" | "failed";

const FHIR_STEPS = [
  { step: 1, name: "Coverage Eligibility", description: "Verify patient insurance coverage via FHIR R4 CoverageEligibilityRequest", icon: "🏥" },
  { step: 2, name: "Prior Authorization", description: "Submit ClaimResponse for procedure pre-auth via NHIA gateway", icon: "📋" },
  { step: 3, name: "Claim Submission", description: "POST FHIR Claim resource to adjudication engine", icon: "📤" },
  { step: 4, name: "Adjudication", description: "Process ClaimResponse — approve, deny, or pend", icon: "⚖️" },
  { step: 5, name: "ERA Payment", description: "Disburse 835 ERA payment to provider via NIBSS", icon: "💳" },
];

const CBDC_STEPS = [
  { step: 1, name: "Lock Source Ledger", description: "Acquire TigerBeetle transfer lock on source CBDC account", icon: "🔒" },
  { step: 2, name: "Validate CBDC Token", description: "Verify eNaira/ECB TIPS token authenticity and denomination", icon: "🔍" },
  { step: 3, name: "Atomic Debit", description: "Two-phase commit debit from source CBDC account", icon: "➖" },
  { step: 4, name: "Cross-Chain Bridge", description: "Relay via mBridge / OpenCBDC interop protocol", icon: "🌉" },
  { step: 5, name: "Atomic Credit", description: "Two-phase commit credit to destination CBDC account", icon: "➕" },
  { step: 6, name: "Unlock & Confirm", description: "Release TigerBeetle lock, emit ISO 20022 pacs.008", icon: "✅" },
];

function StepNode({ stepDef, status, isLast }: { stepDef: typeof FHIR_STEPS[0]; status: StepStatus; isLast: boolean }) {
  const cfg = {
    pending: { icon: <Clock className="h-4 w-4 text-muted-foreground" />, ring: "border-muted", bg: "bg-muted/30", label: "Pending" },
    running: { icon: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />, ring: "border-blue-500", bg: "bg-blue-500/10", label: "Running" },
    completed: { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, ring: "border-green-500", bg: "bg-green-500/10", label: "Done" },
    failed: { icon: <XCircle className="h-4 w-4 text-destructive" />, ring: "border-destructive", bg: "bg-destructive/10", label: "Failed" },
  }[status];
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-10 h-10 rounded-full border-2 ${cfg.ring} ${cfg.bg} flex items-center justify-center text-lg transition-all duration-500 ${status === "running" ? "scale-110 shadow-md" : ""}`}>
          {status === "running" ? cfg.icon : <span>{stepDef.icon}</span>}
        </div>
        {!isLast && <div className={`w-0.5 h-8 mt-1 transition-colors duration-500 ${status === "completed" ? "bg-green-500" : "bg-border"}`} />}
      </div>
      <div className={`flex-1 pb-6 transition-opacity duration-300 ${status === "pending" ? "opacity-50" : "opacity-100"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{stepDef.name}</span>
          <Badge variant="outline" className="text-xs">{cfg.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{stepDef.description}</p>
      </div>
    </div>
  );
}

function SagaCard({ title, sagaType, steps: stepDefs, icon }: { title: string; sagaType: "fhir_payment" | "cbdc_atomic_swap"; steps: typeof FHIR_STEPS; icon: string }) {
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(stepDefs.map(() => "pending"));
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const simulate = trpc.wave221.sagas.simulateSaga.useMutation({
    onSuccess: () => {
      setStepStatuses(stepDefs.map(() => "pending"));
      setIsRunning(true);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!isRunning) return;
    let currentStep = 0;
    const totalSteps = stepDefs.length;
    const advance = () => {
      if (currentStep >= totalSteps) {
        setIsRunning(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      setStepStatuses((prev) => {
        const next = [...prev];
        if (currentStep > 0) next[currentStep - 1] = "completed";
        next[currentStep] = "running";
        return next;
      });
      setTimeout(() => {
        setStepStatuses((prev) => {
          const next = [...prev];
          next[currentStep] = "completed";
          return next;
        });
        currentStep++;
        if (currentStep >= totalSteps) {
          setIsRunning(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 800 + Math.random() * 600);
    };
    intervalRef.current = setInterval(advance, 1500);
    advance();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, stepDefs.length]);

  const completedCount = stepStatuses.filter((s) => s === "completed").length;
  const progress = (completedCount / stepDefs.length) * 100;

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{stepDefs.length}-step orchestration</p>
            </div>
          </div>
          <Button size="sm" onClick={() => simulate.mutate({ sagaType })} disabled={isRunning || simulate.isPending} variant={isRunning ? "outline" : "default"}>
            {isRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running</> : <><Play className="h-4 w-4 mr-2" /> Simulate</>}
          </Button>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Step {completedCount} of {stepDefs.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stepDefs.map((stepDef, idx) => (
          <StepNode key={stepDef.step} stepDef={stepDef} status={stepStatuses[idx]} isLast={idx === stepDefs.length - 1} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function SagaVisualizer() {
  const { data: metrics } = trpc.wave221.sagas.getMetrics.useQuery();
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Transaction Saga Visualizer</h2>
          <Badge variant="outline" className="text-xs">Real-time</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Graphically track FHIR payment orchestration (5 steps) and CBDC atomic swap (6 steps) in real-time. Click <strong>Simulate</strong> to run a live demonstration.
        </p>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <SagaCard title="FHIR Payment Orchestration" sagaType="fhir_payment" steps={FHIR_STEPS} icon="🏥" />
        <SagaCard title="CBDC Atomic Swap" sagaType="cbdc_atomic_swap" steps={CBDC_STEPS} icon="⚡" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Saga Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          {(!metrics || metrics.length === 0) ? (
            <p className="text-xs text-muted-foreground text-center py-4">Run a simulation to see metrics</p>
          ) : (
            <div className="space-y-3">
              {metrics.map((m, i) => (
                <div key={i} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{m.sagaType?.replace(/_/g, " ")}</span>
                    <Badge variant={m.status === "completed" ? "default" : "secondary"} className="text-xs">{m.status}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-1 text-xs text-muted-foreground">
                    <span>Count: <strong className="text-foreground">{m.count}</strong></span>
                    <span>P50: <strong className="text-foreground">{m.p50 ?? "—"}ms</strong></span>
                    <span>P99: <strong className="text-foreground">{m.p99 ?? "—"}ms</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── LiveSagaVisualizer — SSE-powered real-time variant ───────────────────────
// When sagaId is provided, connects to /api/saga-stream/:sagaId for live updates.
// Falls back to simulation mode when sagaId is absent.

type LiveStepStatus = "pending" | "active" | "completed" | "failed";

interface LiveSagaStep {
  index: number;
  name: string;
  status: LiveStepStatus;
  durationMs?: number;
}

interface LiveSagaState {
  sagaId: string;
  sagaType: "fhir_payment" | "cbdc_atomic_swap";
  currentStep: number;
  totalSteps: number;
  steps: LiveSagaStep[];
  overallStatus: "running" | "completed" | "failed" | "compensating";
  startedAt: string;
}

interface LiveSagaVisualizerProps {
  sagaId: string;
  sagaType?: "fhir_payment" | "cbdc_atomic_swap";
  className?: string;
}

export function LiveSagaVisualizer({ sagaId, sagaType = "fhir_payment", className }: LiveSagaVisualizerProps) {
  const [liveState, setLiveState] = useState<LiveSagaState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    esRef.current?.close();
    setError(null);
    const es = new EventSource(`/api/saga-stream/${sagaId}`, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as LiveSagaState;
        setLiveState(data);
      } catch { /* ignore */ }
    };

    es.addEventListener("done", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        setLiveState((prev) => prev ? { ...prev, overallStatus: data.status } : prev);
      } catch { /* ignore */ }
      es.close();
      setConnected(false);
    });

    es.onerror = () => {
      setConnected(false);
      setError("Connection lost. Reconnecting…");
      setTimeout(connect, 5000);
    };
  }, [sagaId]);

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, [connect]);

  const steps = liveState?.steps ?? [];
  const progress = liveState
    ? liveState.overallStatus === "completed"
      ? 100
      : Math.round((liveState.currentStep / liveState.totalSteps) * 100)
    : 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            {sagaType === "cbdc_atomic_swap" ? "CBDC Atomic Swap" : "FHIR Payment Orchestration"} — Live
          </CardTitle>
          <div className="flex items-center gap-2">
            {connected
              ? <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs"><Wifi className="w-3 h-3" />Live</Badge>
              : <Badge variant="secondary" className="gap-1 text-xs"><WifiOff className="w-3 h-3" />Offline</Badge>
            }
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={connect}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-amber-500 mt-1">{error}</p>}
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{liveState ? `Step ${liveState.currentStep + 1} / ${liveState.totalSteps}` : "Waiting…"}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 bg-blue-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {steps.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting to saga stream…
          </div>
        ) : (
          <div className="space-y-1">
            {steps.map((step) => (
              <div
                key={step.index}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-300 ${
                  step.status === "active" ? "bg-blue-500/5 border border-blue-500/20" :
                  step.status === "failed" ? "bg-red-500/5 border border-red-500/20" : ""
                }`}
              >
                <div className="shrink-0">
                  {step.status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {step.status === "active" && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                  {step.status === "failed" && <XCircle className="w-4 h-4 text-red-500" />}
                  {step.status === "pending" && <Clock className="w-4 h-4 text-muted-foreground/40" />}
                </div>
                <span className={`text-sm flex-1 ${
                  step.status === "active" ? "text-blue-600 dark:text-blue-400 font-medium" :
                  step.status === "pending" ? "text-muted-foreground/60" : ""
                }`}>{step.name}</span>
                {step.durationMs != null && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {sagaId && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground font-mono truncate">{sagaId}</div>
        )}
      </CardContent>
    </Card>
  );
}
