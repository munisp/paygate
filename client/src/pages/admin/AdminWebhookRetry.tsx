// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Clock, CheckCircle, XCircle, Search, AlertTriangle, Zap } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  retrying: "bg-blue-100 text-blue-800",
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  abandoned: "bg-gray-100 text-gray-700",
};

export default function AdminWebhookRetry() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Server exposes getFailedDeliveries (no args; returns failed deliveries only),
  // scheduleRetry({deliveryId, retryAfterMinutes?}) and getRetryStats. There is no
  // bulk-retry or abandon endpoint.
  const { data, isLoading, refetch } = trpc.wave27.webhookRetry.getFailedDeliveries.useQuery(undefined, { staleTime: 30_000 });
  const { data: retryStats, refetch: refetchStats } = trpc.wave27.webhookRetry.getRetryStats.useQuery(undefined, { staleTime: 30_000 });

  const retryMutation = trpc.wave27.webhookRetry.scheduleRetry.useMutation({
    onSuccess: () => { toast.success("Webhook retry scheduled"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const [retryingAll, setRetryingAll] = useState(false);
  const retryAll = async () => {
    if (!failedOnly.length) { toast.info("No failed deliveries to retry"); return; }
    setRetryingAll(true);
    try {
      await Promise.all(failedOnly.map((d: any) => retryMutation.mutateAsync({ deliveryId: String(d.id) })));
      toast.success(`${failedOnly.length} webhooks queued for retry`);
    } catch { /* per-item errors already toasted by onError */ }
    setRetryingAll(false);
  };

  const abandonNotAvailable = () =>
    toast.error("Abandoning a webhook delivery is not available: the server does not expose this endpoint.");

  const allDeliveries: any[] = Array.isArray(data) ? data : (data?.deliveries ?? []);
  const failedOnly = allDeliveries.filter((d: any) => d.status === "failed");
  const deliveries = allDeliveries.filter((d: any) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return String(d.webhook_url ?? d.endpoint_url ?? "").toLowerCase().includes(q) ||
        String(d.event_types ?? d.event_type ?? "").toLowerCase().includes(q);
    }
    return true;
  });
  const stats = {
    pendingCount: Number(retryStats?.scheduled_retry ?? 0),
    failedCount: Number(retryStats?.failed ?? allDeliveries.length),
    succeededToday: Number(retryStats?.delivered ?? 0),
    abandonedCount: 0,
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Webhook Retry Scheduler</h1>
            <p className="text-gray-500 text-sm mt-1">Manage failed webhook deliveries and retry schedules</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh</Button>
            <Button size="sm" onClick={retryAll} disabled={retryingAll}>
              <Zap className="w-4 h-4 mr-2" />
              {retryingAll ? "Queuing..." : "Retry All Failed"}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="text-sm text-yellow-700">Pending Retry</div>
              <div className="text-2xl font-bold text-yellow-800 mt-1">{stats.pendingCount}</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="text-sm text-red-700">Failed</div>
              <div className="text-2xl font-bold text-red-800 mt-1">{stats.failedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Succeeded Today</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{stats.succeededToday}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Abandoned</div>
              <div className="text-2xl font-bold text-gray-600 mt-1">{stats.abandonedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search by endpoint or event type..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1">
            {["all", "pending", "failed", "succeeded", "abandoned"].map((s) => (
              <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)} className="capitalize">{s}</Button>
            ))}
          </div>
        </div>

        {/* Deliveries Table */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5" />Webhook Deliveries ({deliveries.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading deliveries...</div>
            ) : deliveries.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No webhook deliveries found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-3 px-2">Event Type</th>
                      <th className="text-left py-3 px-2">Endpoint</th>
                      <th className="text-center py-3 px-2">Attempts</th>
                      <th className="text-center py-3 px-2">HTTP Status</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-left py-3 px-2">Next Retry</th>
                      <th className="text-left py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d: any) => (
                      <tr key={d.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2 font-mono text-xs">{d.event_types ?? d.event_type}</td>
                        <td className="py-3 px-2 text-xs max-w-[200px] truncate" title={d.webhook_url ?? d.endpoint_url}>{d.webhook_url ?? d.endpoint_url}</td>
                        <td className="py-3 px-2 text-center">
                          <span className={d.attempt_count >= 3 ? "text-red-600 font-medium" : ""}>{d.attempt_count}/{d.max_attempts ?? 5}</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={d.response_status >= 400 ? "text-red-600 font-mono" : "text-green-600 font-mono"}>
                            {d.response_status ?? "—"}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <Badge className={STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-700"}>{d.status}</Badge>
                        </td>
                        <td className="py-3 px-2 text-xs text-gray-500">
                          {d.next_retry_at ? new Date(d.next_retry_at).toLocaleString() : "—"}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex gap-1">
                            {(d.status === "failed" || d.status === "pending") && (
                              <Button size="sm" variant="outline" className="text-blue-600 border-blue-200"
                                aria-label="Refresh" onClick={() => retryMutation.mutate({ deliveryId: String(d.id) })}
                                disabled={retryMutation.isPending}><RotateCcw/>
                              </Button>
                            )}
                            {d.status !== "abandoned" && d.status !== "succeeded" && (
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200"
                                onClick={abandonNotAvailable}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
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
    </AdminLayout>
  );
}
