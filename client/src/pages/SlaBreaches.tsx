import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Clock, CheckCircle, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-800",
  acknowledged: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
};

export default function SlaBreaches() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"open" | "acknowledged" | "resolved" | "all">("open");
  const [severityFilter, setSeverityFilter] = useState<"low" | "medium" | "high" | "critical" | "all">("all");

  const limit = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.slaBreaches.list.useQuery({
    status: statusFilter,
    severity: severityFilter,
    page: page + 1,
    limit,
  });

  const acknowledgeMutation = trpc.slaBreaches.acknowledge.useMutation({
    onSuccess: () => {
      toast.success("Breach acknowledged");
      utils.slaBreaches.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const openCount = data?.breaches?.filter((b: any) => b.status === "open").length ?? 0;
  const criticalCount = data?.breaches?.filter((b: any) => b.severity === "critical").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settlement SLA Breaches</h1>
          <p className="text-muted-foreground text-sm mt-1">Transactions that exceeded their settlement SLA window</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Alert Banner */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-800">{criticalCount} Critical SLA Breach{criticalCount > 1 ? "es" : ""}</p>
            <p className="text-sm text-red-600">Immediate attention required. These transactions are significantly overdue.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Open Breaches", value: data?.stats?.open ?? 0, icon: XCircle, color: "text-red-600" },
          { label: "Acknowledged", value: data?.stats?.acknowledged ?? 0, icon: Clock, color: "text-yellow-600" },
          { label: "Resolved", value: data?.stats?.resolved ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Total", value: data?.stats?.total ?? 0, icon: AlertTriangle, color: "text-blue-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v: any) => { setSeverityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center ml-auto">
          {data?.total ?? 0} breaches
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load SLA breaches.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>SLA Window</TableHead>
                  <TableHead>Actual Hours</TableHead>
                  <TableHead>Breach</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data?.breaches || data.breaches.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No SLA breaches found
                    </TableCell>
                  </TableRow>
                )}
                {data?.breaches?.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.transactionId}</TableCell>
                    <TableCell className="text-sm">{b.merchantName ?? b.merchantId}</TableCell>
                    <TableCell className="font-semibold">{formatKobo(b.amountKobo)}</TableCell>
                    <TableCell>{b.slaWindowHours}h</TableCell>
                    <TableCell className="font-semibold text-orange-600">{b.actualHours}h</TableCell>
                    <TableCell className="font-bold text-red-600">+{b.breachHours}h</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[b.severity] ?? "bg-gray-100 text-gray-600"}`}>
                        {b.severity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {b.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {b.status === "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => acknowledgeMutation.mutate({ id: b.id })}
                          disabled={acknowledgeMutation.isPending}
                        >
                          Acknowledge
                        </Button>
                      )}
                      {b.status === "acknowledged" && (
                        <span className="text-xs text-muted-foreground">
                          By {b.acknowledgedBy ?? "unknown"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(data.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
