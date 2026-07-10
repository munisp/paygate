import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, Edit2, Save, X, RefreshCw, AlertTriangle, Shield, Bell, BellOff, Activity } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface LimitRow {
  id: string;
  dfspId: string;
  dfspName: string;
  currency: string;
  positionLimit: number;
  ndcCap: number;
  currentPosition: number;
  currentNDC: number;
  status: string;
}

interface BreachEvent {
  participantId: string;
  dfspName: string;
  currency: string;
  ndcUtilisation: number;
  currentValue: number;
  netDebitCap: number;
  alertThreshold: number;
  severity: "warning" | "critical";
  timestamp: string;
}

function UtilisationBar({ value }: { value: number }) {
  const pct = Math.min(value, 100);
  const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono w-10 text-right ${pct >= 90 ? "text-red-500 font-bold" : pct >= 75 ? "text-amber-500" : "text-emerald-600"}`}>{pct}%</span>
    </div>
  );
}

export default function NDCPositionLimitEditor() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ positionLimit: string; ndcCap: string }>({ positionLimit: "", ndcCap: "" });
  const [breaches, setBreaches] = useState<BreachEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [sseEnabled, setSseEnabled] = useState(true);
  const esRef = useRef<EventSource | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const { data: limits, refetch, isLoading } = trpc.wave223.ndcPositionLimits.list.useQuery();

  const updateMutation = trpc.wave223.ndcPositionLimits.update.useMutation({
    onSuccess: () => { toast.success("Limits updated."); setEditingId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Real-time NDC breach SSE subscription
  useEffect(() => {
    if (!sseEnabled) {
      esRef.current?.close();
      esRef.current = null;
      setSseConnected(false);
      return;
    }

    const es = new EventSource("/api/ndc-stream");
    esRef.current = es;

    es.addEventListener("connected", () => setSseConnected(true));

    es.addEventListener("breaches", (e: MessageEvent) => {
      const data: BreachEvent[] = JSON.parse(e.data);
      setBreaches(data);
      data.filter(b => b.severity === "critical").forEach(b => {
        const key = `${b.participantId}-${b.currency}`;
        if (!notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          setTimeout(() => notifiedRef.current.delete(key), 3600_000);
          toast.error(
            `🚨 Critical NDC Breach: ${b.dfspName} (${b.currency}) at ${(b.ndcUtilisation * 100).toFixed(1)}%`,
            { duration: 10_000, id: `breach-${key}` }
          );
        }
      });
    });

    es.addEventListener("heartbeat", () => setBreaches([]));
    es.addEventListener("error", () => setSseConnected(false));

    return () => { es.close(); setSseConnected(false); };
  }, [sseEnabled]);

  const startEdit = (row: LimitRow) => {
    setEditingId(row.id);
    setEditValues({ positionLimit: String(row.positionLimit ?? 0), ndcCap: String(row.ndcCap ?? 0) });
  };

  const handleSave = (id: string) => {
    const posLimit = parseFloat(editValues.positionLimit);
    const ndc = parseFloat(editValues.ndcCap);
    if (isNaN(posLimit) || isNaN(ndc) || posLimit <= 0 || ndc <= 0) {
      toast.error("Enter valid positive numbers."); return;
    }
    updateMutation.mutate({ id, positionLimit: posLimit, ndcCap: ndc });
  };

  const utilizationPct = (current: number, limit: number) =>
    limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;

  const criticalBreaches = breaches.filter(b => b.severity === "critical");
  const warningBreaches = breaches.filter(b => b.severity === "warning");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-500" />
            NDC & Position Limit Editor
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage Net Debit Cap and position limits for all DFSP participants with real-time breach monitoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${sseConnected ? "border-emerald-500 text-emerald-600 bg-emerald-50" : "border-muted text-muted-foreground"}`}>
            <Activity className="h-3 w-3" />
            {sseConnected ? "Live" : "Offline"}
          </div>
          <Button variant="outline" size="sm" onClick={() => setSseEnabled(v => !v)}>
            {sseEnabled ? <Bell className="h-4 w-4 mr-1" /> : <BellOff className="h-4 w-4 mr-1" />}
            {sseEnabled ? "Alerts On" : "Alerts Off"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Caution banner */}
      <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Caution: Limit changes take effect immediately</p>
          <p>Reducing a DFSP's position limit below their current position will block new transfers until the position is settled. Coordinate with the DFSP before reducing limits.</p>
        </div>
      </div>

      {/* Critical breach alerts */}
      {criticalBreaches.map(b => (
        <Alert key={`${b.participantId}-${b.currency}`} variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical NDC Breach — {b.dfspName} ({b.currency})</AlertTitle>
          <AlertDescription>
            NDC utilisation has reached <strong>{(b.ndcUtilisation * 100).toFixed(1)}%</strong> of the{" "}
            {b.netDebitCap.toLocaleString()} cap. Current position: {b.currentValue.toLocaleString()}.{" "}
            Immediate action required — settlement suspension may be triggered.
          </AlertDescription>
        </Alert>
      ))}

      {/* Warning alerts */}
      {warningBreaches.map(b => (
        <Alert key={`${b.participantId}-${b.currency}`} className="border-amber-500 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">NDC Warning — {b.dfspName} ({b.currency})</AlertTitle>
          <AlertDescription className="text-amber-700">
            NDC utilisation at <strong>{(b.ndcUtilisation * 100).toFixed(1)}%</strong> — approaching the{" "}
            {(b.alertThreshold * 100).toFixed(0)}% alert threshold.
          </AlertDescription>
        </Alert>
      ))}

      {/* Limits table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Participant Limits
          </CardTitle>
          <CardDescription>Click the edit icon to modify position limits and NDC caps</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DFSP</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Position Limit</TableHead>
                <TableHead>Current Position</TableHead>
                <TableHead>Pos. Utilisation</TableHead>
                <TableHead>NDC Cap</TableHead>
                <TableHead>Current NDC</TableHead>
                <TableHead>NDC Utilisation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && !limits?.length && (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No participants found.</TableCell></TableRow>
              )}
              {limits?.map((row) => {
                const isEditing = editingId === row.id;
                const posPct = utilizationPct(row.currentPosition ?? 0, row.positionLimit ?? 1);
                const ndcPct = utilizationPct(row.currentNDC ?? 0, row.ndcCap ?? 1);
                return (
                  <TableRow key={row.id} className={ndcPct >= 90 ? "bg-red-50/50" : ndcPct >= 75 ? "bg-amber-50/50" : ""}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{row.dfspName ?? row.dfspId}</p>
                        <p className="text-xs text-muted-foreground font-mono">{row.dfspId}</p>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{row.currency}</Badge></TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input className="w-28 h-8 text-sm" type="number" value={editValues.positionLimit}
                          onChange={(e) => setEditValues(p => ({ ...p, positionLimit: e.target.value }))} />
                      ) : (
                        <span className="font-mono text-sm">{(row.positionLimit ?? 0).toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{(row.currentPosition ?? 0).toLocaleString()}</TableCell>
                    <TableCell><UtilisationBar value={posPct} /></TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input className="w-28 h-8 text-sm" type="number" value={editValues.ndcCap}
                          onChange={(e) => setEditValues(p => ({ ...p, ndcCap: e.target.value }))} />
                      ) : (
                        <span className="font-mono text-sm">{(row.ndcCap ?? 0).toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{(row.currentNDC ?? 0).toLocaleString()}</TableCell>
                    <TableCell><UtilisationBar value={ndcPct} /></TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" onClick={() => handleSave(row.id)} disabled={updateMutation.isPending}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(row as LimitRow)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Normal (&lt; 75%)</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-500" /> Warning (75–90%)</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /> Critical (&gt; 90%)</div>
      </div>
    </div>
  );
}
