// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Webhook, RefreshCw, Search, RotateCcw, CheckCircle, XCircle, Clock } from "lucide-react";

export default function WebhookEventsPage() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading, refetch } = trpc.webhookEvents.list.useQuery({
    status: status === "all" ? undefined : status,
    limit,
    offset: page * limit,
  }, { staleTime: 30_000 });

  const retry = trpc.webhookEvents.retry.useMutation({
    onSuccess: () => { toast.success("Webhook retry queued"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const events = (data?.events ?? []).filter(e =>
    !search || e.eventType.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase())
  );

  const statusIcon = (s: string) => {
    if (s === "delivered") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (s === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-yellow-500" />;
  };

  const statusBadge = (s: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
      delivered: "default",
      failed: "destructive",
      pending: "secondary",
      retrying: "outline",
    };
    return <Badge variant={variants[s] ?? "secondary"}>{s}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="w-6 h-6 text-blue-600" />
            Webhook Events
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor and retry webhook deliveries to your endpoints
          </p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: data?.total ?? 0, color: "" },
          { label: "Delivered", value: data?.stats?.delivered ?? 0, color: "text-green-600" },
          { label: "Failed", value: data?.stats?.failed ?? 0, color: "text-red-600" },
          { label: "Pending", value: data?.stats?.pending ?? 0, color: "text-yellow-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search event type or ID..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="retrying">Retrying</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Events Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3">Event</th>
                  <th className="text-left p-3">Endpoint</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Attempts</th>
                  <th className="text-left p-3">Response</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                ) : events.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No webhook events found</td></tr>
                ) : (
                  events.map(event => (
                    <tr key={event.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {statusIcon(event.status)}
                          <div>
                            <div className="font-medium">{event.eventType}</div>
                            <div className="text-xs text-muted-foreground font-mono">{event.id.slice(0, 16)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-xs font-mono truncate max-w-[200px]">{event.endpointUrl}</div>
                      </td>
                      <td className="p-3">{statusBadge(event.status)}</td>
                      <td className="p-3 text-center">{event.attemptCount}</td>
                      <td className="p-3">
                        <span className={`font-mono text-xs ${event.responseCode && event.responseCode >= 200 && event.responseCode < 300 ? "text-green-600" : "text-red-600"}`}>
                          {event.responseCode ?? "—"}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3">
                        {(event.status === "failed" || event.status === "pending") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={retry.isPending}
                            aria-label="Refresh" onClick={() => retry.mutate({ eventId: event.id })}
                          ><RotateCcw/> Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {page * limit + 1}–{Math.min((page + 1) * limit, data?.total ?? 0)} of {data?.total ?? 0}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
