// @ts-nocheck
/**
 * SettlementSLA.tsx
 *
 * Settlement SLA monitoring — view SLA breaches and acknowledge them.
 * Complements the SlaBreaches page with the settlement-specific SLA router.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, CheckCircle, RefreshCw, AlertCircle, AlertTriangle } from "lucide-react";

export default function SettlementSLA() {
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading, isError, refetch } = trpc.settlementSLA.breaches.useQuery({ limit, offset: page * limit }, { staleTime: 30_000 });

  const acknowledge = trpc.settlementSLA.acknowledge.useMutation({
    onSuccess: () => { toast.success("Breach acknowledged"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const severityColor = (s: string) => {
    if (s === "critical") return "bg-red-100 text-red-800";
    if (s === "high") return "bg-orange-100 text-orange-800";
    if (s === "medium") return "bg-yellow-100 text-yellow-800";
    return "bg-blue-100 text-blue-800";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="w-6 h-6 text-orange-500" /> Settlement SLA
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor and acknowledge settlement SLA breaches</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" /> Failed to load SLA data. Please refresh.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" /> SLA Breaches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground text-sm py-8 text-center">Loading breaches…</div>
          ) : !data?.breaches?.length ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No SLA breaches — all settlements on time!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase">
                    <th className="text-left py-2 px-3">Settlement ID</th>
                    <th className="text-left py-2 px-3">Breach Type</th>
                    <th className="text-right py-2 px-3">Delay (hrs)</th>
                    <th className="text-center py-2 px-3">Severity</th>
                    <th className="text-left py-2 px-3">Occurred At</th>
                    <th className="text-center py-2 px-3">Acknowledged</th>
                    <th className="text-right py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breaches.map((breach: any) => (
                    <tr key={breach.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-mono text-xs">{breach.settlementId?.slice(0, 12) ?? "—"}…</td>
                      <td className="py-2 px-3">{breach.breachType ?? "—"}</td>
                      <td className="py-2 px-3 text-right font-medium">{breach.delayHours?.toFixed(1) ?? "—"}</td>
                      <td className="py-2 px-3 text-center">
                        <Badge className={severityColor(breach.severity ?? "low")}>{breach.severity ?? "low"}</Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {breach.occurredAt ? new Date(breach.occurredAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {breach.acknowledgedAt ? (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground text-xs">Pending</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {!breach.acknowledgedAt && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledge.mutate({ id: breach.id })}
                            disabled={acknowledge.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Acknowledge
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between mt-4">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {page + 1}</span>
                <Button variant="outline" size="sm" disabled={!data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
