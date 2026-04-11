import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Code, Webhook, Activity, Copy, Plus, RefreshCw } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

const WEBHOOK_EVENTS = [
  "payment.completed", "payment.failed", "payment.pending",
  "refund.completed", "dispute.opened", "payout.completed",
  "subscription.created", "subscription.cancelled"
];

export default function EmbeddedFinance() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["payment.completed", "payment.failed"]);

  const { data: webhooks, isLoading, refetch: refetchWebhooks } = trpc.tier1to5.embeddedFinance.getWebhooks.useQuery();

  const registerWebhookMutation = trpc.tier1to5.embeddedFinance.registerWebhook.useMutation({
    onSuccess: () => { toast.success("Webhook registered."); refetchWebhooks(); setWebhookUrl(""); },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteWebhookMutation = trpc.tier1to5.embeddedFinance.deleteWebhook.useMutation({
    onSuccess: () => { toast.success("Webhook deleted."); refetchWebhooks(); },
    onError: (err: any) => toast.error(err.message),
  });

  const retryMutation = trpc.tier1to5.embeddedFinance.retryWebhookDelivery.useMutation({
    onSuccess: () => toast.success("Delivery retried."),
    onError: (err: any) => toast.error(err.message),
  });

  const toggleEvent = (evt: string) => {
    setWebhookEvents(s => s.includes(evt) ? s.filter(x => x !== evt) : [...s, evt]);
  };

  const sdkSnippet = `import PayGate from '@paygate/sdk';

const pg = new PayGate({ environment: 'production' });

// Accept a payment
pg.checkout({
  amount: 5000_00, // kobo
  currency: 'NGN',
  email: 'customer@example.com',
  onSuccess: (ref) => console.log('Paid:', ref),
  onClose: () => console.log('Closed'),
});`;

  if (!isLoading && !webhooks) {
    return (
      <DashboardLayout>
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Embedded Finance SDK</h1>
            <p className="text-muted-foreground text-sm mt-1">Drop-in JS/React Native SDK with Go webhook relay and APISIX routing</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchWebhooks()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        {/* SDK Quick Start */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Code className="w-5 h-5 text-primary" />SDK Quick Start</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Install: <code className="bg-muted px-1 rounded">npm install @paygate/sdk</code></p>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(sdkSnippet); toast.success("Copied!"); }}>
                <Copy className="w-3 h-3 mr-1" />Copy
              </Button>
            </div>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto">{sdkSnippet}</pre>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Register Webhook */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Webhook className="w-5 h-5 text-primary" />Register Webhook</CardTitle>
              <CardDescription>Receive real-time event notifications via HTTPS POST</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Endpoint URL</Label>
                <Input placeholder="https://api.yourapp.com/paygate/webhook" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="mb-2 block">Events</Label>
                <div className="flex flex-wrap gap-1">
                  {WEBHOOK_EVENTS.map(evt => (
                    <button key={evt} onClick={() => toggleEvent(evt)}
                      className={`px-2 py-0.5 rounded text-xs border transition-all ${webhookEvents.includes(evt) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                      {evt}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={() => registerWebhookMutation.mutate({ endpointUrl: webhookUrl, events: webhookEvents, signingSecret: crypto.randomUUID() })} disabled={registerWebhookMutation.isPending || !webhookUrl || !webhookEvents.length} className="w-full">
                <Plus className="w-4 h-4 mr-2" />{registerWebhookMutation.isPending ? "Registering..." : "Register Webhook"}
              </Button>
            </CardContent>
          </Card>

          {/* Registered Webhooks */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" />Active Webhooks</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{[1,2].map(i => <div key={i} className="animate-pulse h-12 bg-muted rounded" />)}</div>
              ) : !webhooks?.length ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No webhooks registered yet.</div>
              ) : (
                <div className="space-y-2">
                  {webhooks.map((wh: any) => (
                    <div key={wh.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                      <div>
                        <p className="text-xs font-mono truncate max-w-[200px]">{wh.endpointUrl ?? wh.url}</p>
                        <p className="text-xs text-muted-foreground">{wh.events?.length} events · {wh.deliveryCount ?? 0} deliveries</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={wh.active ? "default" : "secondary"} className="text-xs">{wh.active ? "Active" : "Inactive"}</Badge>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => deleteWebhookMutation.mutate({ endpointId: wh.id })}>×</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
