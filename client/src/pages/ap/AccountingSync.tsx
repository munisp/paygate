// @ts-nocheck
/**
 * AP Accounting Sync — connect QuickBooks / Xero / Odoo, manage connections,
 * trigger sync runs and inspect run history. Handles the OAuth redirect
 * (?code=&provider= or ?code=&state=<provider>) on this route.
 */
import { useEffect, useRef, useState } from "react";
import {
  RefreshCw, Link2, Unlink, Play, Globe, CheckCircle2, XCircle,
  Loader2, ArrowDownToLine, ArrowUpFromLine, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function fmtDateTime(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const PROVIDERS = [
  { key: "quickbooks", name: "QuickBooks", desc: "Sync bills, invoices and payments with QuickBooks Online" },
  { key: "xero", name: "Xero", desc: "Two-way sync of AP/AR records with your Xero organisation" },
  { key: "odoo", name: "Odoo", desc: "Connect a self-hosted or Odoo.sh instance with per-connection credentials" },
] as const;

const RUN_STATUS: Record<string, { color: string; bg: string; icon: any }> = {
  running:   { color: "text-blue-400",   bg: "bg-blue-500/15",   icon: Loader2 },
  succeeded: { color: "text-green-400",  bg: "bg-green-500/15",  icon: CheckCircle2 },
  failed:    { color: "text-red-400",    bg: "bg-red-500/15",    icon: XCircle },
};

export default function AccountingSync() {
  const utils = trpc.useUtils();
  const [odooDialog, setOdooDialog] = useState(false);
  const [odooForm, setOdooForm] = useState({ baseUrl: "", db: "", login: "", apiKey: "" });
  const [syncDialog, setSyncDialog] = useState<string | null>(null); // connectionId
  const [syncForm, setSyncForm] = useState({ direction: "pull", entity: "bill" });
  const [runsFor, setRunsFor] = useState<string | null>(null); // connectionId
  const callbackHandled = useRef(false);

  // ── queries ──
  const { data: connections, isLoading, refetch } = trpc.accountingSync.listConnections.useQuery(
    undefined,
    { staleTime: 15_000 },
  );
  const conns: any[] = connections ?? [];
  const connByProvider = new Map(conns.map((c) => [c.provider, c]));

  const { data: runs, isLoading: runsLoading } = trpc.accountingSync.listSyncRuns.useQuery(
    { connectionId: runsFor!, limit: 25 },
    { enabled: !!runsFor, refetchInterval: (q) => (q.state.data ?? []).some((r: any) => r.status === "running") ? 5_000 : false },
  );
  const runRows: any[] = runs ?? [];

  // ── mutations ──
  const connect = trpc.accountingSync.connect.useMutation({
    onSuccess: (r: any) => {
      if (r?.url) window.location.href = r.url;
      else toast.error("Provider did not return a consent URL");
    },
    onError: (e) => toast.error(e.message),
  });
  const handleCallback = trpc.accountingSync.handleCallback.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const disconnect = trpc.accountingSync.disconnect.useMutation({
    onSuccess: () => { toast.success("Connection removed"); utils.accountingSync.listConnections.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const syncNow = trpc.accountingSync.syncNow.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Sync completed — ${r?.recordsIn ?? 0} in / ${r?.recordsOut ?? 0} out`);
      setSyncDialog(null);
      utils.accountingSync.listConnections.invalidate();
      if (runsFor) utils.accountingSync.listSyncRuns.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── OAuth callback detection on this route ──
  useEffect(() => {
    if (callbackHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    const rawProvider = params.get("provider") ?? params.get("state") ?? "";
    const provider = ["quickbooks", "xero", "odoo"].includes(rawProvider) ? rawProvider : null;
    if (!provider) {
      toast.error("OAuth callback missing a recognizable provider — connect again");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    callbackHandled.current = true;
    handleCallback.mutate(
      { provider: provider as any, code, realmId: params.get("realmId") ?? undefined },
      {
        onSuccess: () => {
          toast.success(`${PROVIDERS.find((p) => p.key === provider)?.name ?? provider} connected`);
          utils.accountingSync.listConnections.invalidate();
        },
        onSettled: () => {
          // Clean the OAuth params from the URL.
          window.history.replaceState({}, "", window.location.pathname);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startConnect = (provider: string) => {
    if (provider === "odoo") {
      setOdooDialog(true);
      return;
    }
    connect.mutate({ provider: provider as any, state: provider });
  };

  const submitOdoo = () => {
    if (!odooForm.baseUrl.trim() || !odooForm.db.trim()) {
      toast.error("Odoo base URL and database are required");
      return;
    }
    let baseUrl = odooForm.baseUrl.trim();
    if (!/^https?:\/\//.test(baseUrl)) baseUrl = `https://${baseUrl}`;
    // Odoo exchanges per-connection credentials directly (no redirect).
    handleCallback.mutate(
      {
        provider: "odoo",
        odooBaseUrl: baseUrl,
        odooDb: odooForm.db.trim(),
        odooLogin: odooForm.login.trim() || undefined,
        odooApiKey: odooForm.apiKey.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Odoo connected");
          setOdooDialog(false);
          setOdooForm({ baseUrl: "", db: "", login: "", apiKey: "" });
          utils.accountingSync.listConnections.invalidate();
        },
      },
    );
  };

  const submitSync = () => {
    if (!syncDialog) return;
    syncNow.mutate({
      connectionId: syncDialog,
      direction: syncForm.direction as any,
      entity: syncForm.entity as any,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Accounting Sync
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Keep QuickBooks, Xero or Odoo in lockstep with your AP/AR ledger</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROVIDERS.map((p) => {
          const conn = connByProvider.get(p.key);
          const active = conn && conn.status !== "revoked";
          return (
            <div key={p.key} className="bg-card rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                {active ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    Not connected
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{p.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
              </div>
              {active && (
                <p className="text-xs text-muted-foreground">
                  Last sync: {fmtDateTime(conn.lastSyncAt)}
                </p>
              )}
              <Button
                size="sm"
                variant={active ? "outline" : "default"}
                className="w-full gap-2"
                onClick={() => startConnect(p.key)}
                disabled={connect.isPending || handleCallback.isPending}
              >
                <Link2 className="w-4 h-4" />
                {active ? "Reconnect" : "Connect"}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Connections */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Connections</h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading connections…</div>
          ) : conns.length === 0 ? (
            <div className="p-12 text-center">
              <Link2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No accounting connections</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Connect a provider above to start syncing</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Realm / Org</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Sync</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {conns.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground capitalize">{c.provider}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          c.status === "active" ? "bg-green-500/15 text-green-400"
                          : c.status === "revoked" ? "bg-red-500/15 text-red-400"
                          : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.realmId ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDateTime(c.lastSyncAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 justify-end">
                          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                            onClick={() => { setSyncForm({ direction: "pull", entity: "bill" }); setSyncDialog(c.id); }}>
                            <Play className="w-3.5 h-3.5" /> Sync Now
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs"
                            onClick={() => setRunsFor(runsFor === c.id ? null : c.id)}>
                            <History className="w-3.5 h-3.5" /> Runs
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-red-400"
                            onClick={() => { if (confirm(`Disconnect ${c.provider}?`)) disconnect.mutate({ connectionId: c.id }); }}
                            disabled={disconnect.isPending}>
                            <Unlink className="w-3.5 h-3.5" /> Disconnect
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sync runs */}
      {runsFor && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-2">
            Sync Runs — <span className="capitalize">{conns.find((c) => c.id === runsFor)?.provider ?? ""}</span>
          </h2>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {runsLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading runs…</div>
            ) : runRows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No sync runs yet — use Sync Now</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Started</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direction</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entity</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">In</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Out</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {runRows.map((r) => {
                      const meta = RUN_STATUS[r.status] ?? RUN_STATUS.running;
                      return (
                        <tr key={r.id}>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDateTime(r.startedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                {r.direction === "pull" ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                                {r.direction}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-muted-foreground capitalize">{r.entity}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                                <meta.icon className={`w-3 h-3 ${r.status === "running" ? "animate-spin" : ""}`} />
                                {r.status}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{r.recordsIn ?? 0}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{r.recordsOut ?? 0}</td>
                          <td className="px-4 py-3 text-xs text-red-400 max-w-[220px] truncate" title={r.error ?? ""}>{r.error ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Odoo connect dialog ── */}
      <Dialog open={odooDialog} onOpenChange={setOdooDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Odoo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Base URL *</Label>
              <Input value={odooForm.baseUrl} onChange={(e) => setOdooForm({ ...odooForm, baseUrl: e.target.value })} placeholder="https://mycompany.odoo.com" />
            </div>
            <div className="space-y-2">
              <Label>Database *</Label>
              <Input value={odooForm.db} onChange={(e) => setOdooForm({ ...odooForm, db: e.target.value })} placeholder="mycompany" />
            </div>
            <div className="space-y-2">
              <Label>Login</Label>
              <Input value={odooForm.login} onChange={(e) => setOdooForm({ ...odooForm, login: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" value={odooForm.apiKey} onChange={(e) => setOdooForm({ ...odooForm, apiKey: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOdooDialog(false)}>Cancel</Button>
              <Button onClick={submitOdoo} disabled={handleCallback.isPending}>
                {handleCallback.isPending ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Sync now dialog ── */}
      <Dialog open={!!syncDialog} onOpenChange={(o) => { if (!o) setSyncDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run Sync</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={syncForm.direction} onValueChange={(v) => setSyncForm({ ...syncForm, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pull">Pull — import from provider</SelectItem>
                  <SelectItem value="push">Push — export to provider</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Entity</Label>
              <Select value={syncForm.entity} onValueChange={(v) => setSyncForm({ ...syncForm, entity: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bill">Bills (AP)</SelectItem>
                  <SelectItem value="invoice">Invoices (AR)</SelectItem>
                  <SelectItem value="payment">Payments</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSyncDialog(null)}>Cancel</Button>
              <Button onClick={submitSync} disabled={syncNow.isPending} className="gap-2">
                <Play className="w-4 h-4" />
                {syncNow.isPending ? "Syncing…" : "Start Sync"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
