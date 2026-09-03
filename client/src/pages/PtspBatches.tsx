import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { useAdaptiveInterval } from "@/lib/networkQuality";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  submitted: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  partial: "bg-orange-100 text-orange-800",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3 h-3" />,
  submitted: <RefreshCw className="w-3 h-3 animate-spin" />,
  confirmed: <CheckCircle2 className="w-3 h-3" />,
  failed: <XCircle className="w-3 h-3" />,
  partial: <AlertCircle className="w-3 h-3" />,
};

export default function PtspBatches() {
  const ptspInterval = useAdaptiveInterval(30000);
  const { isAuthenticated } = useAuth();

  const { data, isLoading, isError, error, refetch } = trpc.pos.listBatches.useQuery(
    { limit: 100 },
    { enabled: isAuthenticated, refetchInterval: ptspInterval , staleTime: 30_000 })

  // NOTE: pos.confirmBatch is now internalKey-gated (middleware-only). A
  // merchant browser session receives UNAUTHORIZED, so the "Re-confirm"
  // action is intentionally not offered here — batches are confirmed
  // exclusively by the NIBSS/middleware confirmation path.

  const batches: any[] = Array.isArray(data) ? data : [];

  type Batch = any;
  const totalConfirmed = batches.filter((b: Batch) => b.status === "confirmed").length;
  const totalPending = batches.filter((b: Batch) => b.status === "pending" || b.status === "submitted").length;
  const totalFailed = batches.filter((b: Batch) => b.status === "failed").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">PTSP Settlement Batches</h1>
          <p className="text-muted-foreground text-sm mt-1">
            NIBSS batch settlement lifecycle — track, re-confirm, and audit
          </p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{totalConfirmed}</div>
            <div className="text-sm text-muted-foreground">Confirmed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{totalPending}</div>
            <div className="text-sm text-muted-foreground">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{totalFailed}</div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
      </div>

      {/* Batch table */}
      <Card>
        <CardHeader>
          <CardTitle>All Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Settlement batches unavailable</p>
                <p className="text-xs text-red-600 mt-0.5">{error?.message}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading batches…</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No settlement batches found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Settlement Date</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2 pr-4">NIBSS Reference</th>
                    <th className="text-right py-2 pr-4">Amount (₦)</th>
                    <th className="text-right py-2 pr-4">Transactions</th>
                    <th className="text-left py-2 pr-4">Submitted</th>
                    <th className="text-left py-2 pr-4">Confirmed</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch: Batch) => (
                    <tr key={batch.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-mono">{batch.settlementDate}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[batch.status] ?? ""}`}>
                          {statusIcons[batch.status]}
                          {batch.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                        {batch.nibssReference ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {(batch.totalAmountKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 pr-4 text-right">{batch.transactionCount}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {batch.submittedAt ? new Date(batch.submittedAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {batch.confirmedAt ? new Date(batch.confirmedAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {(batch.status === "failed" || batch.status === "pending") && (
                          <span title="Batch confirmation is performed by the settlement middleware only (internal-key gated); merchant re-confirmation is no longer available.">
                            Awaiting middleware confirmation
                          </span>
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
