import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Play, RotateCcw, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";

const SAMPLE_EVENTS = [
  "payment.success",
  "payment.failed",
  "payout.completed",
  "kyc.approved",
  "kyc.rejected",
  "dispute.opened",
  "refund.processed",
  "subscription.renewed",
  "transfer.initiated",
  "transfer.completed",
];

export default function WebhookSimulatorV2() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [eventType, setEventType] = useState("payment.success");
  const [targetUrl, setTargetUrl] = useState("");
  const [payload, setPayload] = useState(JSON.stringify({ event: "payment.success", data: { amount: 5000, currency: "NGN" } }, null, 2));

  const { data, isLoading } = trpc.webhookSimV2.list.useQuery({ page: 1 });

  const simulate = trpc.webhookSimV2.simulate.useMutation({
    onSuccess: (result) => {
      utils.webhookSimV2.list.invalidate();
      toast({
        title: result.success ? "Webhook delivered" : "Webhook failed",
        description: `Status: ${result.responseStatus ?? "N/A"} · ${result.durationMs ?? 0}ms`,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const retry = trpc.webhookSimV2.retry.useMutation({
    onSuccess: () => { utils.webhookSimV2.list.invalidate(); toast({ title: "Retried" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const clear = trpc.webhookSimV2.clear.useMutation({
    onSuccess: () => { utils.webhookSimV2.list.invalidate(); toast({ title: "Logs cleared" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const logs = data?.logs ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6" /> Webhook Simulator V2</h1>
          <p className="text-muted-foreground text-sm mt-1">Test webhook delivery with custom payloads</p>
        </div>
        {logs.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => clear.mutate()}>
            <Trash2 className="w-4 h-4 mr-2" />Clear Logs
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Simulator */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Configure & Fire</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Event Type</Label>
              <Select value={eventType} onValueChange={v => {
                setEventType(v);
                setPayload(JSON.stringify({ event: v, data: { amount: 5000, currency: "NGN", timestamp: Date.now() } }, null, 2));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SAMPLE_EVENTS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target URL (optional)</Label>
              <Input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="https://your-server.com/webhook" />
            </div>
            <div>
              <Label>Payload (JSON)</Label>
              <Textarea
                className="font-mono text-xs h-40"
                value={payload}
                onChange={e => setPayload(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={simulate.isPending}
              onClick={() => {
                let parsedPayload: any;
                try { parsedPayload = JSON.parse(payload); } catch { toast({ title: "Invalid JSON payload", variant: "destructive" }); return; }
                simulate.mutate({ webhookId: targetUrl || "sim-default", eventType, targetUrl: targetUrl || "", payload: parsedPayload });
              }}
            >
              {simulate.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Fire Webhook
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Fired</p><p className="text-2xl font-bold">{data?.total ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold text-green-600">
                {logs.length > 0 ? Math.round((logs.filter((l: any) => l.success).length / logs.length) * 100) : 0}%
              </p>
            </CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Avg Latency</p>
              <p className="text-2xl font-bold">
                {logs.length > 0 ? Math.round(logs.reduce((s: number, l: any) => s + (l.durationMs ?? 0), 0) / logs.length) : 0}ms
              </p>
            </CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold text-red-600">{logs.filter((l: any) => !l.success).length}</p>
            </CardContent></Card>
          </div>
        </div>
      </div>

      {/* Logs */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Delivery Logs</h2>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : logs.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No webhook logs yet. Fire a test webhook above.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {logs.map((log: any) => (
              <Card key={log.id}>
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {log.success
                      ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    }
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{log.eventType}</Badge>
                        <span className="text-xs text-muted-foreground">HTTP {log.responseStatus ?? "N/A"} · {log.durationMs ?? 0}ms</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{log.targetUrl ?? "default endpoint"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    {!log.success && (
                      <Button size="sm" variant="outline" onClick={() => retry.mutate({ id: log.id })}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />Retry
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
