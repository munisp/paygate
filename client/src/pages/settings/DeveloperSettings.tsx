// @ts-nocheck
import { useState, createContext, useContext } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Key, Webhook, Activity, Plus, Trash2, Eye, EyeOff, Copy, RefreshCw,
  CheckCircle2, XCircle, Clock, AlertTriangle, Code2, FlaskConical, Globe, Server
} from "lucide-react";
import { format } from "date-fns";

// ── Environment Context ────────────────────────────────────────────────────────
type DevEnvironment = "sandbox" | "staging" | "production";

const EnvironmentContext = createContext<{
  env: DevEnvironment;
  setEnv: (e: DevEnvironment) => void;
}>({ env: "sandbox", setEnv: () => {} });

function useDevEnvironment() {
  return useContext(EnvironmentContext);
}

const ENV_CONFIG: Record<DevEnvironment, {
  label: string;
  badgeClass: string;
  description: string;
  icon: React.ReactNode;
  baseUrl: string;
  keyPrefix: string;
  warningBanner?: string;
}> = {
  sandbox: {
    label: "Sandbox",
    badgeClass: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    description: "Isolated test environment. No real money moves. Safe to experiment.",
    icon: <FlaskConical className="h-4 w-4" />,
    baseUrl: "https://sandbox-api.paygate.io/v1",
    keyPrefix: "sk_test_",
  },
  staging: {
    label: "Staging",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    description: "Pre-production environment. Mirrors production data structure. Limited real transactions.",
    icon: <Server className="h-4 w-4" />,
    baseUrl: "https://staging-api.paygate.io/v1",
    keyPrefix: "sk_staging_",
    warningBanner: "Staging keys may process limited real transactions. Handle with care.",
  },
  production: {
    label: "Production",
    badgeClass: "bg-red-500/10 text-red-600 border-red-500/20",
    description: "Live environment. Real money. All changes are permanent.",
    icon: <Globe className="h-4 w-4" />,
    baseUrl: "https://api.paygate.io/v1",
    keyPrefix: "sk_live_",
    warningBanner: "You are viewing LIVE production keys. Treat them as passwords.",
  },
};

function EnvironmentSwitcher() {
  const { env, setEnv } = useDevEnvironment();
  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium shrink-0">Environment:</span>
        <div className="flex gap-1">
          {(Object.keys(ENV_CONFIG) as DevEnvironment[]).map((e) => (
            <button
              key={e}
              onClick={() => setEnv(e)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                env === e
                  ? `${ENV_CONFIG[e].badgeClass} border`
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {ENV_CONFIG[e].icon}
              {ENV_CONFIG[e].label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{ENV_CONFIG[env].baseUrl}</code>
        </div>
      </div>
      {ENV_CONFIG[env].warningBanner && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {ENV_CONFIG[env].warningBanner}
        </div>
      )}
    </div>
  );
}

// ── API Keys Tab ──────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const { env } = useDevEnvironment();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyEnv, setNewKeyEnv] = useState<"test" | "live">(env === "production" ? "live" : "test");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const { data: keys, refetch, isLoading } = trpc.wave221.apiKeys.list.useQuery();
  const createKey = trpc.wave221.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setRevealedKey(data.raw);
      setShowCreate(false);
      setNewKeyName("");
      refetch();
      toast.success("API key created — copy it now, it won't be shown again");
    },
    onError: (e) => toast.error(e.message),
  });
  const revokeKey = trpc.wave221.apiKeys.revoke.useMutation({
    onSuccess: () => { refetch(); toast.success("Key revoked"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteKey = trpc.wave221.apiKeys.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Key deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleVisible = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // Filter keys by current environment
  const filteredKeys = (keys ?? []).filter((k) => {
    if (env === "production") return k.environment === "live";
    if (env === "staging") return k.environment === "live" || k.environment === "test";
    return k.environment === "test";
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">API Keys</h3>
          <p className="text-sm text-muted-foreground">
            Manage {ENV_CONFIG[env].label} authentication keys · prefix: <code className="bg-muted px-1 rounded text-xs">{ENV_CONFIG[env].keyPrefix}</code>
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Create Key
        </Button>
      </div>

      {revealedKey && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">New API key created — copy it now</p>
                <p className="text-xs text-muted-foreground mt-1">This key will not be shown again after you close this banner.</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all flex-1">{revealedKey}</code>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(revealedKey)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRevealedKey(null)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filteredKeys.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Key className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No {ENV_CONFIG[env].label} API keys yet. Create one to get started.</p>
          </div>
        )}
        {filteredKeys.map((key) => (
          <Card key={key.id} className={!key.isActive ? "opacity-60" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{key.name}</span>
                    <Badge variant={key.environment === "live" ? "destructive" : "secondary"} className="text-xs">{key.environment}</Badge>
                    <Badge variant={key.isActive ? "default" : "outline"} className="text-xs">{key.isActive ? "Active" : "Revoked"}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="text-xs text-muted-foreground font-mono">
                      {visibleKeys.has(key.id) ? key.keyPrefix + "••••••••••••••••••••••••" : "••••••••••••••••••••••••••••••••"}
                    </code>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleVisible(key.id)}>
                      {visibleKeys.has(key.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(key.keyPrefix)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {key.createdAt ? format(new Date(key.createdAt), "MMM d, yyyy") : "—"}
                    {key.lastUsedAt && ` · Last used ${format(new Date(key.lastUsedAt), "MMM d, yyyy")}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {key.isActive && (
                    <Button variant="outline" size="sm" onClick={() => revokeKey.mutate({ id: key.id })} disabled={revokeKey.isPending}>Revoke</Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteKey.mutate({ id: key.id })} disabled={deleteKey.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create API Key</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Key Name</Label>
              <Input placeholder="e.g. Production Backend" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Select value={newKeyEnv} onValueChange={(v) => setNewKeyEnv(v as "test" | "live")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test (Sandbox / Staging)</SelectItem>
                  <SelectItem value="live">Live (Production)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createKey.mutate({ name: newKeyName, environment: newKeyEnv })} disabled={!newKeyName.trim() || createKey.isPending}>
              {createKey.isPending ? "Creating…" : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Webhooks Tab ──────────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = [
  "payment.created", "payment.completed", "payment.failed",
  "payout.initiated", "payout.completed", "payout.failed",
  "dispute.opened", "dispute.resolved",
  "kyc.submitted", "kyc.approved", "kyc.rejected",
  "subscription.created", "subscription.cancelled",
  "fraud.alert.raised",
];

function WebhooksTab() {
  const { env } = useDevEnvironment();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ url: "", description: "", events: [] as string[], retryPolicy: "exponential" as const });

  const { data: webhooks, refetch, isLoading } = trpc.wave221.webhooks.list.useQuery();
  const createWh = trpc.wave221.webhooks.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); setForm({ url: "", description: "", events: [], retryPolicy: "exponential" }); toast.success("Webhook created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateWh = trpc.wave221.webhooks.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Webhook updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteWh = trpc.wave221.webhooks.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Webhook deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const rotateSecret = trpc.wave221.webhooks.rotateSecret.useMutation({
    onSuccess: (data) => { navigator.clipboard.writeText(data.signingSecret); toast.success("Signing secret rotated and copied"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleEvent = (event: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((e) => e !== event) : [...prev.events, event],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Webhook Endpoints</h3>
          <p className="text-sm text-muted-foreground">
            Configure {ENV_CONFIG[env].label} URLs to receive real-time event notifications
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Add Endpoint
        </Button>
      </div>

      <div className="space-y-3">
        {(webhooks ?? []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Webhook className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No webhook endpoints configured.</p>
          </div>
        )}
        {(webhooks ?? []).map((wh) => {
          const events = JSON.parse(wh.events ?? "[]") as string[];
          return (
            <Card key={wh.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`h-2 w-2 rounded-full ${wh.isActive ? "bg-green-500" : "bg-muted-foreground"}`} />
                      <code className="text-sm font-mono truncate max-w-xs">{wh.url}</code>
                      {wh.description && <span className="text-xs text-muted-foreground">— {wh.description}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {events.slice(0, 5).map((ev) => <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>)}
                      {events.length > 5 && <Badge variant="outline" className="text-xs">+{events.length - 5} more</Badge>}
                      {events.length === 0 && <span className="text-xs text-muted-foreground">No events selected</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Retry: {wh.retryPolicy} · Max {wh.maxRetries} retries</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={wh.isActive ?? false} onCheckedChange={(v) => updateWh.mutate({ id: wh.id, isActive: v })} />
                    <Button variant="ghost" size="sm" onClick={() => rotateSecret.mutate({ id: wh.id })}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteWh.mutate({ id: wh.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Webhook Endpoint</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Endpoint URL</Label>
              <Input placeholder="https://your-server.com/webhooks/paygate" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input placeholder="e.g. Production payment events" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Retry Policy</Label>
              <Select value={form.retryPolicy} onValueChange={(v) => setForm((p) => ({ ...p, retryPolicy: v as "exponential" | "linear" | "none" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exponential">Exponential backoff</SelectItem>
                  <SelectItem value="linear">Linear</SelectItem>
                  <SelectItem value="none">No retries</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Events to subscribe</Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                    <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} className="rounded" />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createWh.mutate(form)} disabled={!form.url.trim() || createWh.isPending}>
              {createWh.isPending ? "Creating…" : "Create Endpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Delivery Logs Tab ─────────────────────────────────────────────────────────
function DeliveryLogsTab() {
  const { env } = useDevEnvironment();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: logs, refetch, isLoading } = trpc.wave221.deliveryLogs.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  });
  const { data: stats, isLoading } = trpc.wave221.deliveryLogs.stats.useQuery({});
  const retry = trpc.wave221.deliveryLogs.retry.useMutation({
    onSuccess: () => { refetch(); toast.success("Retry queued"); },
    onError: (e) => toast.error(e.message),
  });

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
    if (status === "pending" || status === "retrying") return <Clock className="h-4 w-4 text-yellow-500" />;
    return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  };

  const statusCounts = Object.fromEntries((stats ?? []).map((s) => [s.status, s.count]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Delivery Logs</h3>
          <p className="text-sm text-muted-foreground">
            Monitor {ENV_CONFIG[env].label} webhook delivery attempts and retry failures
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Successful", key: "success", color: "text-green-600" },
          { label: "Failed", key: "failed", color: "text-destructive" },
          { label: "Pending", key: "pending", color: "text-yellow-600" },
          { label: "Retrying", key: "retrying", color: "text-blue-600" },
        ].map(({ label, key, color }) => (
          <Card key={key} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter(key)}>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{statusCounts[key] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "success", "failed", "pending", "retrying"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)} className="capitalize">{s}</Button>
        ))}
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">HTTP</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duration</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Attempt</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(logs ?? []).length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No delivery logs found</td></tr>
            )}
            {(logs ?? []).map((log) => (
              <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">{statusIcon(log.status)}<span className="capitalize text-xs">{log.status}</span></div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{log.eventType}</td>
                <td className="px-3 py-2">
                  {log.responseStatus ? <Badge variant={log.responseStatus < 300 ? "default" : "destructive"} className="text-xs">{log.responseStatus}</Badge> : "—"}
                </td>
                <td className="px-3 py-2 text-xs">{log.durationMs ? `${log.durationMs}ms` : "—"}</td>
                <td className="px-3 py-2 text-xs">{log.attempt}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{log.createdAt ? format(new Date(log.createdAt), "MMM d HH:mm:ss") : "—"}</td>
                <td className="px-3 py-2">
                  {log.status === "failed" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => retry.mutate({ deliveryId: log.id })} disabled={retry.isPending}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Retry
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeveloperSettings() {
  const [activeEnv, setActiveEnv] = useState<DevEnvironment>("sandbox");

  return (
    <EnvironmentContext.Provider value={{ env: activeEnv, setEnv: setActiveEnv }}>
      <div className="p-6 space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Developer Settings</h1>
            <p className="text-muted-foreground text-sm">Manage API keys, webhook endpoints, and monitor delivery logs for third-party integrations</p>
          </div>
        </div>

        <EnvironmentSwitcher />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="pt-4 flex items-start gap-3">
              <Key className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">API Keys</p>
                <p className="text-xs text-muted-foreground mt-0.5">Bearer tokens for server-to-server authentication. Never expose live keys in client code.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardContent className="pt-4 flex items-start gap-3">
              <Webhook className="h-5 w-5 text-purple-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Webhooks</p>
                <p className="text-xs text-muted-foreground mt-0.5">HTTPS endpoints that receive signed event payloads. Verify with HMAC-SHA256.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="pt-4 flex items-start gap-3">
              <Activity className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Delivery Logs</p>
                <p className="text-xs text-muted-foreground mt-0.5">Full audit trail of every webhook attempt with response codes and retry history.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="api-keys">
          <TabsList>
            <TabsTrigger value="api-keys"><Key className="h-4 w-4 mr-2" /> API Keys</TabsTrigger>
            <TabsTrigger value="webhooks"><Webhook className="h-4 w-4 mr-2" /> Webhooks</TabsTrigger>
            <TabsTrigger value="delivery-logs"><Activity className="h-4 w-4 mr-2" /> Delivery Logs</TabsTrigger>
          </TabsList>
          <TabsContent value="api-keys" className="mt-4"><ApiKeysTab /></TabsContent>
          <TabsContent value="webhooks" className="mt-4"><WebhooksTab /></TabsContent>
          <TabsContent value="delivery-logs" className="mt-4"><DeliveryLogsTab /></TabsContent>
        </Tabs>
      </div>
    </EnvironmentContext.Provider>
  );
}
