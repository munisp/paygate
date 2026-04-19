import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code2, Play, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = typeof HTTP_METHODS[number];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PUT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  PATCH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function AdminApiPlayground() {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [endpoint, setEndpoint] = useState("/api/health");
  const [body, setBody] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [response, setResponse] = useState<{
    status: number; statusText: string; body: unknown; durationMs: number; headers: Record<string, string>;
  } | null>(null);

  const { data: samples } = trpc.wave25.apiPlayground.getSampleRequests.useQuery();

  const execute = trpc.wave25.apiPlayground.execute.useMutation({
    onSuccess: (data) => {
      setResponse(data);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleRun = () => {
    if (!endpoint) { toast.error("Enter an endpoint"); return; }
    execute.mutate({ endpoint, method, body: body || undefined, apiKey: apiKey || undefined });
  };

  const loadSample = (sample: { method: string; endpoint: string; body: string }) => {
    setMethod(sample.method as HttpMethod);
    setEndpoint(sample.endpoint);
    setBody(sample.body);
  };

  const statusColor = (status: number) => {
    if (status >= 200 && status < 300) return "text-green-500";
    if (status >= 400) return "text-red-500";
    return "text-yellow-500";
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Code2 className="h-6 w-6 text-primary" />
            API Playground
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Test API endpoints interactively — only relative paths allowed
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Request Panel */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Request</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Method + Endpoint */}
                <div className="flex gap-2">
                  <Select value={method} onValueChange={v => setMethod(v as HttpMethod)}>
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HTTP_METHODS.map(m => (
                        <SelectItem key={m} value={m}>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${METHOD_COLORS[m]}`}>{m}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="/api/health"
                    value={endpoint}
                    onChange={e => setEndpoint(e.target.value)}
                    className="font-mono text-sm flex-1"
                    onKeyDown={e => e.key === "Enter" && handleRun()}
                  />
                </div>

                {/* API Key */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">API Key (optional)</label>
                  <Input
                    placeholder="sk_live_..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="font-mono text-sm"
                    type="password"
                  />
                </div>

                {/* Body */}
                {method !== "GET" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Request Body (JSON)</label>
                    <Textarea
                      placeholder='{"key": "value"}'
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      className="font-mono text-sm min-h-[120px]"
                    />
                  </div>
                )}

                <Button onClick={handleRun} disabled={execute.isPending} className="w-full">
                  <Play className="h-4 w-4 mr-2" />
                  {execute.isPending ? "Running..." : "Send Request"}
                </Button>
              </CardContent>
            </Card>

            {/* Response */}
            {response && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Response</CardTitle>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${statusColor(response.status)}`}>
                        {response.status === 0 ? (
                          <XCircle className="h-5 w-5 text-red-500" />
                        ) : response.status < 300 ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </span>
                      <Badge variant={response.status >= 200 && response.status < 300 ? "secondary" : "destructive"}>
                        {response.status} {response.statusText}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {response.durationMs}ms
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="body">
                    <TabsList className="mb-3">
                      <TabsTrigger value="body">Body</TabsTrigger>
                      <TabsTrigger value="headers">Headers</TabsTrigger>
                    </TabsList>
                    <TabsContent value="body">
                      <pre className="bg-muted rounded p-3 text-xs font-mono overflow-auto max-h-[400px] whitespace-pre-wrap">
                        {typeof response.body === "string"
                          ? response.body
                          : JSON.stringify(response.body, null, 2)}
                      </pre>
                    </TabsContent>
                    <TabsContent value="headers">
                      <div className="space-y-1">
                        {Object.entries(response.headers).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs font-mono">
                            <span className="text-muted-foreground min-w-[200px]">{k}:</span>
                            <span className="break-all">{v}</span>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sample Requests */}
          <div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sample Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {samples?.map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => loadSample(sample)}
                    className="w-full text-left p-2.5 rounded border hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${METHOD_COLORS[sample.method as HttpMethod]}`}>
                        {sample.method}
                      </span>
                    </div>
                    <div className="text-xs font-medium">{sample.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{sample.endpoint}</div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Security Note</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Only relative paths (e.g. <code>/api/health</code>) are allowed. External URLs are blocked to prevent SSRF attacks.
                  All requests are authenticated with your current session cookie.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
