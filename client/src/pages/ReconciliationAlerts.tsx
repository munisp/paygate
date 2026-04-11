import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Search,
  TrendingDown,
} from "lucide-react";

type AlertStatus = "open" | "investigating" | "resolved" | "dismissed";

const STATUS_CONFIG: Record<
  AlertStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  open: { label: "Open", color: "bg-red-100 text-red-800 border-red-200", icon: AlertTriangle },
  investigating: { label: "Investigating", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  dismissed: { label: "Dismissed", color: "bg-gray-100 text-gray-600 border-gray-200", icon: XCircle },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency === "NGN" ? "NGN" : currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

export default function ReconciliationAlerts() {
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<AlertStatus>("investigating");
  const [updateNotes, setUpdateNotes] = useState("");
  const PAGE_SIZE = 25;

  const utils = trpc.useUtils();

  const { data: stats, isLoading: statsLoading } = trpc.wave80.reconciliation.getStats.useQuery({});

  const { data, isLoading, refetch } = trpc.wave80.reconciliation.listAlerts.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const updateMutation = trpc.wave80.reconciliation.updateAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert status updated");
      utils.wave80.reconciliation.listAlerts.invalidate();
      utils.wave80.reconciliation.getStats.invalidate();
      setUpdateDialogOpen(false);
      setSelectedAlert(null);
      setUpdateNotes("");
    },
    onError: (err) => toast.error(err.message),
  });

  const dismissMutation = trpc.wave80.reconciliation.dismissAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert dismissed");
      utils.wave80.reconciliation.listAlerts.invalidate();
      utils.wave80.reconciliation.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const alerts = (data as any)?.alerts ?? [];
  const total = (data as any)?.total ?? 0;

  const filteredAlerts = search
    ? alerts.filter(
        (a: any) =>
          a.merchantId.toLowerCase().includes(search.toLowerCase()) ||
          a.currency.toLowerCase().includes(search.toLowerCase()),
      )
    : alerts;

  const openUpdateDialog = (alertId: string, currentStatus: AlertStatus) => {
    setSelectedAlert(alertId);
    setUpdateStatus(currentStatus === "open" ? "investigating" : currentStatus);
    setUpdateNotes("");
    setUpdateDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reconciliation Alerts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Balance mismatches detected between TigerBeetle ledger and PostgreSQL records
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {(["open", "investigating", "resolved", "dismissed"] as AlertStatus[]).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            const count = statsLoading ? "—" : (stats as any)?.[s] ?? 0;
            return (
              <Card
                key={s}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setStatusFilter(s)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${s === "open" ? "text-red-500" : s === "investigating" ? "text-amber-500" : s === "resolved" ? "text-green-500" : "text-gray-400"}`} />
                  <div>
                    <p className="text-xs text-muted-foreground capitalize">{s}</p>
                    <p className="text-xl font-bold">{count}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingDown className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Delta</p>
                <p className="text-xl font-bold text-purple-600">
                  {statsLoading ? "—" : stats?.totalDelta != null ? `₦${(stats.totalDelta / 100).toLocaleString()}` : "₦0"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by merchant ID or currency..."
                  value={search}
                  onChange={(e: any) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v: any) => {
                  setStatusFilter(v as AlertStatus | "all");
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                Loading alerts…
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
                <p className="text-sm">No reconciliation alerts found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Merchant</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Currency</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">PG Balance</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">TB Balance</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Delta</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Detected</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((alert: any) => {
                      const cfg = STATUS_CONFIG[alert.status as AlertStatus] ?? STATUS_CONFIG.open;
                      const Icon = cfg.icon;
                      return (
                        <tr key={alert.id} className="border-b hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs">{alert.merchantId.slice(0, 12)}…</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">{alert.currency}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {formatCurrency(alert.pgBalance, alert.currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {formatCurrency(alert.tbBalance, alert.currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-red-600">
                            {alert.delta > 0 ? "+" : ""}{formatCurrency(alert.delta, alert.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${cfg.color}`}>
                              <Icon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(alert.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {alert.status !== "resolved" && alert.status !== "dismissed" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => openUpdateDialog(alert.id, alert.status as AlertStatus)}
                                >
                                  Update
                                </Button>
                              )}
                              {alert.status === "open" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-muted-foreground"
                                  onClick={() =>
                                    dismissMutation.mutate({ alertId: alert.id })
                                  }
                                  disabled={dismissMutation.isPending}
                                >
                                  Dismiss
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p: any) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p: any) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Update Status Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Alert Status</DialogTitle>
            <DialogDescription>
              Change the investigation status and add notes for this reconciliation alert.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New Status</label>
              <Select
                value={updateStatus}
                onValueChange={(v: any) => setUpdateStatus(v as AlertStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Add investigation notes or resolution details…"
                value={updateNotes}
                onChange={(e: any) => setUpdateNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedAlert) return;
                updateMutation.mutate({
                  alertId: selectedAlert,
                  status: updateStatus,
                });
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
