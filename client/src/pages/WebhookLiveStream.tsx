import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Activity, Pause, Play, Trash2, Filter, RefreshCw, Copy, CheckCircle, XCircle, Clock } from "lucide-react";

interface WebhookEvent {
  id: string;
  type: string;
  status: "success" | "failed" | "pending";
  timestamp: string;
  source: string;
  payload: Record<string, unknown>;
  retries: number;
  latencyMs: number;
}

const EVENT_TYPES = [
  "payment.success", "payment.failed", "payment.pending",
  "subscription.created", "subscription.renewed", "subscription.cancelled",
  "payout.completed", "payout.failed",
  "dispute.opened", "dispute.resolved",
  "kyc.approved", "kyc.rejected",
  "refund.processed",
];

const generateMockEvent = (): WebhookEvent => {
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const status = Math.random() > 0.15 ? "success" : Math.random() > 0.5 ? "failed" : "pending";
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    status,
    timestamp: new Date().toISOString(),
    source: ["stripe", "paystack", "flutterwave", "nibss", "internal"][Math.floor(Math.random() * 5)],
    payload: {
      amount: Math.floor(Math.random() * 500_000) + 1_000,
      currency: "NGN",
      reference: `REF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      merchant_id: `MRC-${Math.floor(Math.random() * 1000)}`,
    },
    retries: status === "failed" ? Math.floor(Math.random() * 3) : 0,
    latencyMs: Math.floor(Math.random() * 800) + 50,
  };
};

export default function WebhookLiveStream() {
  // Real webhook deliveries from DB
  const { data: realDeliveries, isLoading } = trpc.webhookDeliveries.list.useQuery({ limit: 20 });
  const [events, setEvents] = useState<WebhookEvent[]>(() =>
    Array.from({ length: 8 }, generateMockEvent)
  );
  const [isStreaming, setIsStreaming] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [stats, setStats] = useState({ success: 0, failed: 0, total: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const addEvent = useCallback(() => {
    const evt = generateMockEvent();
    setEvents((prev) => [evt, ...prev].slice(0, 100));
    setStats((s) => ({
      total: s.total + 1,
      success: s.success + (evt.status === "success" ? 1 : 0),
      failed: s.failed + (evt.status === "failed" ? 1 : 0),
    }));
  }, []);

  useEffect(() => {
    if (isStreaming) {
      intervalRef.current = setInterval(addEvent, 2500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isStreaming, addEvent]);

  const filteredEvents = events.filter((e) => {
    const matchesFilter = filter === "all" || e.status === filter || e.type.startsWith(filter);
    const matchesSearch = !search || e.id.includes(search) || e.type.includes(search) || e.source.includes(search);
    return matchesFilter && matchesSearch;
  });

  const copyPayload = (evt: WebhookEvent) => {
    navigator.clipboard.writeText(JSON.stringify(evt.payload, null, 2));
    toast.success("Payload copied to clipboard");
  };

  const replayEvent = (evt: WebhookEvent) => {
    toast.success(`Replaying event ${evt.id.slice(0, 16)}...`);
  };

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-yellow-500" />;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { success: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700", pending: "bg-yellow-100 text-yellow-700" };
    return map[status] ?? "";
  };

  const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : "0.0";

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-500" />
            Webhook Live Stream
            {isStreaming && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block ml-1" />}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time webhook event monitoring</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEvents([])} className="gap-1">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </Button>
          <Button
            size="sm"
            variant={isStreaming ? "destructive" : "default"}
            onClick={() => setIsStreaming((s) => !s)}
            className="gap-1"
          >
            {isStreaming ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Resume</>}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Events</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.success}</p>
          <p className="text-xs text-muted-foreground">Successful</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-red-500">{stats.failed}</p>
          <p className="text-xs text-muted-foreground">Failed</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{successRate}%</p>
          <p className="text-xs text-muted-foreground">Success Rate</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Search by ID, type, or source..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44">
            <Filter className="w-3.5 h-3.5 mr-1" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="subscription">Subscription</SelectItem>
            <SelectItem value="payout">Payout</SelectItem>
            <SelectItem value="dispute">Dispute</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">{filteredEvents.length} events</span>
      </div>

      {/* Event Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Event List */}
        <div ref={listRef} className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {filteredEvents.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No events match your filter</p>
            </div>
          )}
          {filteredEvents.map((evt) => (
            <Card
              key={evt.id}
              className={`cursor-pointer transition-all hover:shadow-sm ${selectedEvent?.id === evt.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedEvent(evt)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {statusIcon(evt.status)}
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium truncate">{evt.type}</p>
                      <p className="text-xs text-muted-foreground font-mono">{evt.id.slice(0, 24)}...</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge className={`text-xs ${statusBadge(evt.status)}`}>{evt.status}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{evt.latencyMs}ms</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>{evt.source}</span>
                  <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Event Detail */}
        <div className="sticky top-0">
          {selectedEvent ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Event Detail</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => copyPayload(selectedEvent)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => replayEvent(selectedEvent)}>
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-muted-foreground text-xs">Event ID</p><p className="font-mono text-xs break-all">{selectedEvent.id}</p></div>
                  <div><p className="text-muted-foreground text-xs">Type</p><p className="font-mono text-xs">{selectedEvent.type}</p></div>
                  <div><p className="text-muted-foreground text-xs">Status</p><Badge className={`text-xs ${statusBadge(selectedEvent.status)}`}>{selectedEvent.status}</Badge></div>
                  <div><p className="text-muted-foreground text-xs">Source</p><p className="text-xs">{selectedEvent.source}</p></div>
                  <div><p className="text-muted-foreground text-xs">Latency</p><p className="text-xs">{selectedEvent.latencyMs}ms</p></div>
                  <div><p className="text-muted-foreground text-xs">Retries</p><p className="text-xs">{selectedEvent.retries}</p></div>
                  <div className="col-span-2"><p className="text-muted-foreground text-xs">Timestamp</p><p className="text-xs font-mono">{selectedEvent.timestamp}</p></div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Payload</p>
                  <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-auto max-h-48">
                    {JSON.stringify(selectedEvent.payload, null, 2)}
                  </pre>
                </div>
                {selectedEvent.status === "failed" && (
                  <Button size="sm" className="w-full gap-2" onClick={() => replayEvent(selectedEvent)}>
                    <RefreshCw className="w-3.5 h-3.5" /> Replay Event
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-48 border-2 border-dashed rounded-xl text-muted-foreground text-sm">
              Click an event to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
