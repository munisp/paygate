import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, Play, Copy, RefreshCw, CheckCircle, XCircle, Terminal } from "lucide-react";
import { toast } from "sonner";

const SAMPLE_PAYLOADS: Record<string, object> = {
  "payment.initiated": {
    event: "payment.initiated",
    data: {
      transactionId: "txn_test_001",
      amount: 5000,
      currency: "NGN",
      customerId: "cust_test_001",
      reference: "REF-TEST-001",
      metadata: { orderId: "ORD-001" },
    },
    timestamp: new Date().toISOString(),
  },
  "payment.completed": {
    event: "payment.completed",
    data: {
      transactionId: "txn_test_001",
      amount: 5000,
      currency: "NGN",
      status: "success",
      reference: "REF-TEST-001",
      paidAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  },
  "payout.created": {
    event: "payout.created",
    data: {
      payoutId: "payout_test_001",
      amount: 100000,
      currency: "NGN",
      accountNumber: "0123456789",
      bankCode: "058",
      status: "pending",
    },
    timestamp: new Date().toISOString(),
  },
  "customer.created": {
    event: "customer.created",
    data: {
      customerId: "cust_test_001",
      email: "test@example.com",
      name: "Test Customer",
      phone: "+2348012345678",
    },
    timestamp: new Date().toISOString(),
  },
};

interface TestResult {
  status: number;
  latencyMs: number;
  body: string;
  success: boolean;
  timestamp: string;
}

export default function DeveloperSandbox() {
  const [tab, setTab] = useState("webhook-tester");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [eventType, setEventType] = useState("payment.initiated");
  const [payload, setPayload] = useState(JSON.stringify(SAMPLE_PAYLOADS["payment.initiated"], null, 2));
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const {isLoading, data: apiKeys} = trpc.apiKeys.list.useQuery();
  const { data: webhooks } = trpc.webhooks.list.useQuery();

  function handleEventTypeChange(type: string) {
    setEventType(type);
    if (SAMPLE_PAYLOADS[type]) {
      setPayload(JSON.stringify(SAMPLE_PAYLOADS[type], null, 2));
    }
  }

  async function handleSendWebhook() {
    if (!webhookUrl) { toast.error("Please enter a webhook URL"); return; }
    let parsedPayload: object;
    try { parsedPayload = JSON.parse(payload); } catch { toast.error("Invalid JSON payload"); return; }

    setIsRunning(true);
    const startMs = Date.now();
    try {
      const res = await fetch("/api/dev/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: webhookUrl, eventType, payload: parsedPayload }),
      });
      const latencyMs = Date.now() - startMs;
      const body = await res.text();
      const result: TestResult = {
        status: res.status,
        latencyMs,
        body: body.slice(0, 2000),
        success: res.ok,
        timestamp: new Date().toISOString(),
      };
      setResults((prev) => [result, ...prev.slice(0, 9)]);
      if (res.ok) toast.success(`Webhook delivered — ${res.status} in ${latencyMs}ms`);
      else toast.error(`Webhook failed — ${res.status}`);
    } catch (err: any) {
      const latencyMs = Date.now() - startMs;
      const result: TestResult = { status: 0, latencyMs, body: err.message, success: false, timestamp: new Date().toISOString() };
      setResults((prev) => [result, ...prev.slice(0, 9)]);
      toast.error("Network error: " + err.message);
    } finally {
      setIsRunning(false);
    }
  }

  function handleCopyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast.success("API key copied");
  }

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Developer Sandbox</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Test webhooks, inspect API keys, and simulate payment events
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="webhook-tester">Webhook Tester</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="event-log">Event Log</TabsTrigger>
        </TabsList>

        <TabsContent value="webhook-tester" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configure Test</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Target URL</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://your-server.com/webhook"
                      value={webhookUrl}
                      onChange={(e: any) => setWebhookUrl(e.target.value)}
                    />
                    {webhooks && (webhooks as any[]).length > 0 && (
                      <Select onValueChange={setWebhookUrl}>
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Load" />
                        </SelectTrigger>
                        <SelectContent>
                          {(webhooks as any[]).map((w: any) => (
                            <SelectItem key={w.id} value={w.url}>
                              {w.url.slice(0, 30)}...
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Event Type</Label>
                  <Select value={eventType} onValueChange={handleEventTypeChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(SAMPLE_PAYLOADS).map((e: any) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Payload (JSON)</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPayload(JSON.stringify(SAMPLE_PAYLOADS[eventType] ?? {}, null, 2))}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  </div>
                  <Textarea
                    value={payload}
                    onChange={(e: any) => setPayload(e.target.value)}
                    className="font-mono text-xs h-48"
                  />
                </div>

                <Button className="w-full" onClick={handleSendWebhook} disabled={isRunning}>
                  <Play className="h-4 w-4 mr-2" />
                  {isRunning ? "Sending..." : "Send Test Event"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Results</CardTitle>
                <CardDescription>{results.length} requests sent</CardDescription>
              </CardHeader>
              <CardContent>
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <Terminal className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground text-sm">Send a test event to see results here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {results.map((r: any, i: any) => (
                      <div key={i} className={`rounded-lg border p-3 ${r.success ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-red-200 bg-red-50 dark:bg-red-950/20"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {r.success ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            <Badge variant={r.success ? "default" : "destructive"}>{r.status || "ERR"}</Badge>
                            <span className="text-xs text-muted-foreground">{r.latencyMs}ms</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{new Date(r.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <pre className="text-xs font-mono text-muted-foreground overflow-auto max-h-24 bg-background/50 rounded p-2">
                          {r.body || "(empty response)"}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="api-keys" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Use these keys to authenticate API requests</CardDescription>
            </CardHeader>
            <CardContent>
              {!apiKeys || (apiKeys as any[]).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No API keys yet. Create one in the API Keys page.
                </div>
              ) : (
                <div className="space-y-3">
                  {(apiKeys as any[]).map((key: any) => (
                    <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{key.name}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {key.keyPrefix}••••••••••••••••
                        </p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant={key.environment === "live" ? "default" : "secondary"} className="text-xs">
                            {key.environment}
                          </Badge>
                          <Badge variant={key.isActive ? "default" : "outline"} className="text-xs">
                            {key.isActive ? "active" : "inactive"}
                          </Badge>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleCopyKey(key.keyPrefix + "...")}>
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="event-log" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Event Log</CardTitle>
              <CardDescription>Recent webhook deliveries from your registered endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Code className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>View detailed delivery logs in the Webhooks page</p>
                <Button variant="link" className="mt-2" onClick={() => window.location.href = "/webhooks"}>
                  Go to Webhooks →
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
