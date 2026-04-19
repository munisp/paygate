import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Play, CheckCircle, XCircle, Clock, Code, Zap } from "lucide-react";
import { format } from "date-fns";
import Layout from "@/components/Layout";

export default function WebhookSimulator({ merchantId }: { merchantId: string }) {
  const [eventType, setEventType] = useState("transaction.completed");
  const [customPayload, setCustomPayload] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data: eventTypes } = trpc.wave24.webhookSimulator.getEventTypes.useQuery();
  const { data: logs, refetch: refetchLogs } = trpc.wave24.webhookSimulator.getLogs.useQuery({
    merchantId,
    limit,
    offset: page * limit,
  });

  const simulateMutation = trpc.wave24.webhookSimulator.simulate.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Webhook delivered successfully (${result.durationMs}ms, HTTP ${result.responseStatus})`);
      } else {
        toast.error(`Webhook delivery failed: ${result.error ?? `HTTP ${result.responseStatus}`}`);
      }
      refetchLogs();
    },
    onError: (e) => toast.error(e.message),
  });

  const items = logs?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5" />Webhook Simulator</h2>
        <p className="text-muted-foreground text-sm mt-1">Send test webhook events to your endpoint to verify integration</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Simulator Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send Test Event</CardTitle>
            <CardDescription>Choose an event type and fire a test delivery</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Event Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(eventTypes ?? []).map(et => (
                    <SelectItem key={et} value={et}>{et}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Custom Payload (optional)</Label>
                <button
                  className="text-xs text-primary underline"
                  onClick={() => setUseCustom(v => !v)}
                >
                  {useCustom ? "Use default" : "Customize"}
                </button>
              </div>
              {useCustom && (
                <Textarea
                  placeholder='{"event":"transaction.completed","data":{...}}'
                  value={customPayload}
                  onChange={e => setCustomPayload(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
              )}
            </div>

            <Button
              className="w-full"
              onClick={() => simulateMutation.mutate({
                merchantId,
                eventType,
                customPayload: useCustom && customPayload ? customPayload : undefined,
              })}
              disabled={simulateMutation.isPending}
            >
              <Play className="w-4 h-4 mr-2" />
              {simulateMutation.isPending ? "Sending..." : "Send Test Event"}
            </Button>

            {simulateMutation.data && (
              <div className={`p-3 rounded-lg text-sm border ${simulateMutation.data.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <div className="flex items-center gap-2 font-medium mb-1">
                  {simulateMutation.data.success
                    ? <CheckCircle className="w-4 h-4 text-green-600" />
                    : <XCircle className="w-4 h-4 text-red-600" />}
                  {simulateMutation.data.success ? "Delivery Successful" : "Delivery Failed"}
                </div>
                <div className="text-xs space-y-0.5 text-muted-foreground">
                  {simulateMutation.data.responseStatus && <div>HTTP Status: {simulateMutation.data.responseStatus}</div>}
                  {simulateMutation.data.durationMs && <div>Duration: {simulateMutation.data.durationMs}ms</div>}
                  {simulateMutation.data.error && <div className="text-red-600">Error: {simulateMutation.data.error}</div>}
                  {simulateMutation.data.responseBody && (
                    <div className="mt-1">
                      <div className="font-medium text-foreground mb-0.5">Response:</div>
                      <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-20">{simulateMutation.data.responseBody}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Event Type Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available Event Types</CardTitle>
            <CardDescription>All events your webhook endpoint can receive</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(eventTypes ?? []).map(et => (
                <div
                  key={et}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${eventType === et ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
                  onClick={() => setEventType(et)}
                >
                  <div className="font-mono text-xs font-medium">{et}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {et.split(".")[0].charAt(0).toUpperCase() + et.split(".")[0].slice(1)} lifecycle event
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delivery Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="w-4 h-4" />Simulation Logs
          </CardTitle>
          <CardDescription>History of test webhook deliveries</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No simulation logs yet. Send a test event above.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Event Type</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">HTTP</th>
                  <th className="text-left p-3 font-medium">Duration</th>
                  <th className="text-left p-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {items.map(log => (
                  <tr key={log.id} className="border-b hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs">{log.eventType}</td>
                    <td className="p-3">
                      {log.success ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3.5 h-3.5" />Success
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="w-3.5 h-3.5" />Failed
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {log.responseStatus ? (
                        <Badge variant={log.responseStatus < 300 ? "default" : "destructive"} className="text-xs">
                          {log.responseStatus}
                        </Badge>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {log.durationMs ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{log.durationMs}ms
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
