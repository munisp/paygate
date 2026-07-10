/**
 * Wave 227 — NDC Breach Events
 *
 * Displays all NDC breach events recorded by the ndcBreachRouter.
 * Supports filtering to unresolved-only, severity badges, and inline resolve action.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const SEVERITY_CFG: Record<
  string,
  { label: string; cls: string; badgeCls: string }
> = {
  medium: {
    label: "Medium",
    cls: "bg-amber-50 border-amber-200",
    badgeCls: "text-amber-700 border-amber-300 bg-amber-50",
  },
  high: {
    label: "High",
    cls: "bg-orange-50 border-orange-200",
    badgeCls: "text-orange-700 border-orange-300 bg-orange-50",
  },
  critical: {
    label: "Critical",
    cls: "bg-red-50 border-red-200",
    badgeCls: "text-red-700 border-red-300 bg-red-50",
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function NdcBreachEvents() {
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<{
    id: string;
    dfspName: string;
  } | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolving, setResolving] = useState(false);

  const utils = trpc.useUtils();

  const {
    data: breaches,
    isLoading,
    refetch,
  } = trpc.ndcBreach.getBreaches.useQuery(
    { limit: 100, unresolved: unresolvedOnly },
    { staleTime: 15_000 }
  );

  const resolveMutation = trpc.ndcBreach.resolve.useMutation({
    onSuccess: () => {
      toast.success("Breach marked as resolved");
      utils.ndcBreach.getBreaches.invalidate();
      setResolveTarget(null);
      setResolutionNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleResolve = async () => {
    if (!resolveTarget) return;
    setResolving(true);
    try {
      await resolveMutation.mutateAsync({
        eventId: resolveTarget.id,
        resolution: resolutionNote || "Manually resolved",
      });
    } finally {
      setResolving(false);
    }
  };

  const totalBreaches = breaches?.length ?? 0;
  const criticalCount =
    breaches?.filter((b: any) => b.severity === "critical").length ?? 0;
  const unresolvedCount =
    breaches?.filter((b: any) => !b.resolvedAt).length ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-red-600" />
            NDC Breach Events
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Net Debit Cap breach notifications triggered by the NextHub bridge
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="unresolved-toggle"
              checked={unresolvedOnly}
              onCheckedChange={setUnresolvedOnly}
            />
            <Label htmlFor="unresolved-toggle" className="text-sm cursor-pointer">
              Unresolved only
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Critical Alert Banner */}
      {criticalCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {criticalCount} Critical Breach{criticalCount > 1 ? "es" : ""} Active
          </AlertTitle>
          <AlertDescription>
            One or more DFSPs have exceeded 100% of their Net Debit Cap.
            Immediate action may be required to prevent settlement failure.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Events",
            value: totalBreaches,
            color: "text-blue-600 bg-blue-50",
          },
          {
            label: "Unresolved",
            value: unresolvedCount,
            color:
              unresolvedCount > 0
                ? "text-red-600 bg-red-50"
                : "text-green-600 bg-green-50",
          },
          {
            label: "Critical",
            value: criticalCount,
            color:
              criticalCount > 0
                ? "text-red-600 bg-red-50"
                : "text-green-600 bg-green-50",
          },
          {
            label: "Resolved",
            value: totalBreaches - unresolvedCount,
            color: "text-green-600 bg-green-50",
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-0.5">{s.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${s.color}`}>
                  <Activity className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Breach Events Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Breach Events
            {unresolvedOnly && (
              <Badge variant="outline" className="ml-2 text-xs text-amber-700 border-amber-300 bg-amber-50">
                Unresolved only
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3">DFSP</th>
                    <th className="text-left py-2 pr-3">Severity</th>
                    <th className="text-right py-2 pr-3">Position</th>
                    <th className="text-right py-2 pr-3">NDC Limit</th>
                    <th className="text-right py-2 pr-3">Breach %</th>
                    <th className="text-left py-2 pr-3">Window</th>
                    <th className="text-left py-2 pr-3">Triggered</th>
                    <th className="text-left py-2 pr-3">Status</th>
                    <th className="text-left py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {breaches?.map((b: any) => {
                    const sev = SEVERITY_CFG[b.severity ?? "medium"] ?? SEVERITY_CFG.medium;
                    const resolved = !!b.resolvedAt;
                    return (
                      <tr
                        key={b.id}
                        className={`border-b hover:bg-muted/30 ${
                          !resolved && b.severity === "critical"
                            ? "bg-red-50/60"
                            : !resolved && b.severity === "high"
                            ? "bg-orange-50/40"
                            : ""
                        }`}
                      >
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-xs">{b.dfspName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{b.dfspId}</p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge variant="outline" className={`text-xs ${sev.badgeCls}`}>
                            {sev.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs">
                          {naira(b.currentPositionKobo)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs">
                          {naira(b.ndcLimitKobo)}
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <span
                            className={`font-bold text-xs ${
                              b.breachPercentage >= 100
                                ? "text-red-600"
                                : b.breachPercentage >= 90
                                ? "text-orange-600"
                                : "text-amber-600"
                            }`}
                          >
                            {b.breachPercentage.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-muted-foreground font-mono">
                          {b.windowId ?? "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                          {b.createdAt
                            ? new Date(b.createdAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="py-2.5 pr-3">
                          {resolved ? (
                            <Badge
                              variant="outline"
                              className="text-xs text-green-700 border-green-300 bg-green-50 flex items-center gap-1 w-fit"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Resolved
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs text-red-700 border-red-300 bg-red-50 flex items-center gap-1 w-fit"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Open
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5">
                          {!resolved && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() =>
                                setResolveTarget({ id: b.id, dfspName: b.dfspName })
                              }
                            >
                              Resolve
                            </Button>
                          )}
                          {resolved && b.resolution && (
                            <span
                              className="text-xs text-muted-foreground italic max-w-[120px] block truncate"
                              title={b.resolution}
                            >
                              {b.resolution}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!breaches?.length && (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-10 text-center text-muted-foreground"
                      >
                        {unresolvedOnly
                          ? "No unresolved NDC breach events"
                          : "No NDC breach events recorded"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null);
            setResolutionNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve NDC Breach</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Mark the breach event for{" "}
              <span className="font-semibold text-foreground">
                {resolveTarget?.dfspName}
              </span>{" "}
              as resolved. Optionally add a resolution note.
            </p>
            <div className="space-y-1">
              <Label htmlFor="resolution-note">Resolution Note (optional)</Label>
              <Textarea
                id="resolution-note"
                placeholder="e.g. DFSP topped up liquidity cover; position normalised"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {resolutionNote.length}/500
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResolveTarget(null);
                setResolutionNote("");
              }}
              disabled={resolving}
            >
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={resolving}>
              {resolving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
