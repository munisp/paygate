import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Webhook, CheckCircle2, XCircle, Copy, Trash2, ChevronDown, ChevronRight, Clock, AlertCircle } from "lucide-react";

const ALL_EVENTS = [
  "payment.completed", "payment.failed", "payment.pending",
  "payout.completed", "payout.failed",
  "dispute.opened", "dispute.resolved",
  "customer.created", "refund.processed",
];

function statusBadge(status: string) {
  if (status === "success") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Success</span>;
  if (status === "failed") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Failed</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pending</span>;
}

export default function Webhooks() {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.webhooks.list.useQuery(undefined, { staleTime: 30_000 });
  const { data: deliveries, isLoading: deliveriesLoading } = trpc.webhookDeliveries.list.useQuery(
    { webhookId: expandedWebhook ?? undefined, limit: 20 },
    { enabled: !!expandedWebhook, staleTime: 15_000 }
  );

  const createWebhook = trpc.webhooks.create.useMutation({
    onSuccess: () => { toast.success("Webhook endpoint created"); setShowForm(false); setUrl(""); setSelectedEvents([]); utils.webhooks.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteWebhook = trpc.webhooks.delete.useMutation({
    onSuccess: () => { toast.success("Webhook deleted"); utils.webhooks.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const webhooks = data ?? [];
  const toggleEvent = (e: string) =>
    setSelectedEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);

  const toggleExpand = (id: string) =>
    setExpandedWebhook(prev => prev === id ? null : id);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Receive real-time event notifications</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1.5" />Add Endpoint</Button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold">New Webhook Endpoint</h3>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Endpoint URL *</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.com/webhooks/paygate"
              className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Events to subscribe *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedEvents.includes(ev)} onChange={() => toggleEvent(ev)}
                    className="rounded border-border text-primary" />
                  <span className="text-xs text-muted-foreground font-mono">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => createWebhook.mutate({ url, events: selectedEvents })}
              disabled={!url || selectedEvents.length === 0 || createWebhook.isPending}>
              {createWebhook.isPending ? "Creating..." : "Create Endpoint"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {isLoading ? Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />) :
        webhooks.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <Webhook className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No webhook endpoints yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add an endpoint to receive real-time payment events</p>
          </div>
        ) : webhooks.map((wh) => (
          <div key={wh.id} className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${wh.isActive ? "bg-emerald-50" : "bg-muted"}`}>
                    {wh.isActive ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="font-medium text-sm break-all">{wh.url}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {wh.failureCount > 0 ? `${wh.failureCount} failures` : "No failures"} ·
                      {wh.lastDeliveredAt ? ` Last delivered ${new Date(wh.lastDeliveredAt).toLocaleDateString()}` : " Never delivered"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(wh.secret); toast.success("Secret copied"); }}
                    className="p-1.5 rounded hover:bg-muted transition-colors" title="Copy secret">
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => deleteWebhook.mutate({ id: wh.id })}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(wh.events as string[]).map((ev) => (
                  <span key={ev} className="px-2 py-0.5 rounded-full text-xs font-mono bg-primary/10 text-primary">{ev}</span>
                ))}
              </div>
              <button
                onClick={() => toggleExpand(wh.id)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {expandedWebhook === wh.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Delivery log
              </button>
            </div>

            {expandedWebhook === wh.id && (
              <div className="border-t border-border bg-muted/30">
                <div className="px-5 py-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Deliveries</h4>
                  {deliveriesLoading ? (
                    <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
                  ) : !deliveries || deliveries.length === 0 ? (
                    <div className="text-center py-6">
                      <AlertCircle className="w-5 h-5 mx-auto mb-2 text-muted-foreground opacity-40" />
                      <p className="text-xs text-muted-foreground">No deliveries yet</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {deliveries.map((d) => (
                        <div key={d.id} className="flex items-center justify-between bg-card rounded-lg px-3 py-2.5 text-xs">
                          <div className="flex items-center gap-3">
                            {statusBadge(d.status)}
                            <span className="font-mono text-muted-foreground">{d.eventType}</span>
                          </div>
                          <div className="flex items-center gap-4 text-muted-foreground">
                            {d.responseStatus && (
                              <span className={`font-mono font-medium ${d.responseStatus >= 200 && d.responseStatus < 300 ? "text-emerald-600" : "text-red-500"}`}>
                                HTTP {d.responseStatus}
                              </span>
                            )}
                            {d.latencyMs && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />{d.latencyMs}ms
                              </span>
                            )}
                            <span>{new Date(d.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
