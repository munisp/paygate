import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, RefreshCw, Eye, Download, Filter, Activity, Shield, Database, User } from "lucide-react";

const ACTION_TYPES = [
  "create", "update", "delete", "login", "logout", "approve", "reject",
  "transfer", "payout", "refund", "dispute", "kyc_submit", "kyb_submit",
  "api_key_create", "webhook_create", "settings_change", "role_change",
];

const RESOURCE_TYPES = [
  "transaction", "user", "merchant", "payout", "dispute", "api_key",
  "webhook", "customer", "virtual_card", "payment_link", "fraud_rule",
  "kyb_verification", "invoice_financing", "tenant", "billing_config",
];

export default function AuditLogViewer() {
  const [search, setSearch] = useState("");
  const [actorId, setActorId] = useState("");
  const [actionType, setActionType] = useState<string | undefined>(undefined);
  const [resourceType, setResourceType] = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [useOpenSearch, setUseOpenSearch] = useState(true);

  const queryParams = useMemo(() => ({
    page,
    limit: 50,
    search: search || undefined,
    actorId: actorId || undefined,
    actionType,
    resourceType,
    dateFrom: dateFrom ? new Date(dateFrom).getTime() : undefined,
    dateTo: dateTo ? new Date(dateTo).getTime() : undefined,
    useOpenSearch,
  }), [page, search, actorId, actionType, resourceType, dateFrom, dateTo, useOpenSearch]);

  const { data, isLoading, isError, refetch } = trpc.auditLog.search.useQuery(queryParams);

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets ?? {};

  const actionColors: Record<string, any> = {
    create: "default", update: "secondary", delete: "destructive",
    login: "outline", logout: "outline", approve: "default",
    reject: "destructive", transfer: "secondary", payout: "secondary",
    refund: "outline", dispute: "destructive",
  };

  const handleExport = () => {
    const csv = [
      ["Timestamp", "Actor", "Action", "Resource Type", "Resource ID", "IP Address", "Status"].join(","),
      ...logs.map((l: any) => [
        new Date(l.createdAt).toISOString(),
        l.actorId ?? "",
        l.actionType ?? "",
        l.resourceType ?? "",
        l.resourceId ?? "",
        l.ipAddress ?? "",
        l.status ?? "",
      ].join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit log exported");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Log Viewer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full-text search across all audit events powered by OpenSearch
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={logs.length === 0}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Activity className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-sm text-muted-foreground">Total Events</p><p className="text-2xl font-bold">{total.toLocaleString()}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg"><Shield className="w-5 h-5 text-red-600" /></div>
            <div><p className="text-sm text-muted-foreground">Security Events</p>
              <p className="text-2xl font-bold">{logs.filter((l: any) => ["login", "logout", "role_change", "api_key_create"].includes(l.actionType)).length}</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg"><Database className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-sm text-muted-foreground">Data Changes</p>
              <p className="text-2xl font-bold">{logs.filter((l: any) => ["create", "update", "delete"].includes(l.actionType)).length}</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><User className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-sm text-muted-foreground">Unique Actors</p>
              <p className="text-2xl font-bold">{new Set(logs.map((l: any) => l.actorId)).size}</p>
            </div>
          </div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" />Filters
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs">Source:</span>
              <Button size="sm" variant={useOpenSearch ? "default" : "outline"} onClick={() => setUseOpenSearch(true)} className="h-7 text-xs">OpenSearch</Button>
              <Button size="sm" variant={!useOpenSearch ? "default" : "outline"} onClick={() => setUseOpenSearch(false)} className="h-7 text-xs">Database</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Full-text search…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Input placeholder="Filter by Actor ID…" value={actorId} onChange={e => { setActorId(e.target.value); setPage(1); }} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Select value={actionType ?? "all"} onValueChange={v => { setActionType(v === "all" ? undefined : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Action Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {ACTION_TYPES.map(a => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={resourceType ?? "all"} onValueChange={v => { setResourceType(v === "all" ? undefined : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Resource Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {RESOURCE_TYPES.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} title="From date" />
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} title="To date" />
          </div>
          {(search || actorId || actionType || resourceType || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => {
              setSearch(""); setActorId(""); setActionType(undefined);
              setResourceType(undefined); setDateFrom(""); setDateTo(""); setPage(1);
            }}>Clear all filters</Button>
          )}
        </CardContent>
      </Card>

      {/* Facets */}
      {Object.keys(facets).length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(facets).map(([facetKey, facetValues]: [string, any]) => (
            <Card key={facetKey}>
              <CardHeader className="pb-2"><CardTitle className="text-sm capitalize">{facetKey.replace(/_/g, " ")} Distribution</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {(facetValues as any[]).slice(0, 8).map((fv: any) => (
                    <div key={fv.key} className="flex items-center justify-between text-sm">
                      <button className="text-left hover:text-primary transition-colors" onClick={() => {
                        if (facetKey === "actionType") setActionType(fv.key);
                        if (facetKey === "resourceType") setResourceType(fv.key);
                        setPage(1);
                      }}>
                        {fv.key.replace(/_/g, " ")}
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-muted rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(100, (fv.count / (facetValues[0]?.count || 1)) * 100)}%` }} />
                        </div>
                        <span className="text-muted-foreground w-8 text-right">{fv.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Audit Events ({total.toLocaleString()})</CardTitle>
            {useOpenSearch && <Badge variant="outline" className="text-xs">OpenSearch</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No audit events found</p>
              <p className="text-sm mt-1">Try adjusting your filters or date range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">Timestamp</th>
                    <th className="text-left py-3 px-2">Actor</th>
                    <th className="text-left py-3 px-2">Action</th>
                    <th className="text-left py-3 px-2">Resource</th>
                    <th className="text-left py-3 px-2">Resource ID</th>
                    <th className="text-left py-3 px-2">IP Address</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any, idx: number) => (
                    <tr key={log.id ?? idx} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-2 text-xs whitespace-nowrap">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                            {(log.actorId ?? "?").slice(0, 1).toUpperCase()}
                          </div>
                          <span className="font-mono text-xs">{log.actorId ? `${log.actorId.slice(0, 12)}…` : "system"}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant={actionColors[log.actionType] ?? "outline"} className="text-xs">
                          {log.actionType?.replace(/_/g, " ") ?? "—"}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-xs">{log.resourceType?.replace(/_/g, " ") ?? "—"}</td>
                      <td className="py-2 px-2 font-mono text-xs">{log.resourceId ? `${log.resourceId.slice(0, 16)}…` : "—"}</td>
                      <td className="py-2 px-2 text-xs font-mono">{log.ipAddress ?? "—"}</td>
                      <td className="py-2 px-2">
                        <Badge variant={log.status === "success" ? "default" : log.status === "failure" ? "destructive" : "outline"} className="text-xs">
                          {log.status ?? "—"}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(log)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 50 && (
            <div className="flex justify-between items-center mt-4">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 50)}</span>
              <Button variant="outline" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Audit Event Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Event ID</p><p className="font-mono text-xs break-all">{selected.id}</p></div>
                <div><p className="text-muted-foreground">Timestamp</p><p>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}</p></div>
                <div><p className="text-muted-foreground">Actor ID</p><p className="font-mono text-xs break-all">{selected.actorId ?? "system"}</p></div>
                <div><p className="text-muted-foreground">Actor Type</p><p className="capitalize">{selected.actorType ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Action</p><Badge variant={actionColors[selected.actionType] ?? "outline"}>{selected.actionType}</Badge></div>
                <div><p className="text-muted-foreground">Status</p><Badge variant={selected.status === "success" ? "default" : "destructive"}>{selected.status}</Badge></div>
                <div><p className="text-muted-foreground">Resource Type</p><p>{selected.resourceType}</p></div>
                <div><p className="text-muted-foreground">Resource ID</p><p className="font-mono text-xs break-all">{selected.resourceId ?? "—"}</p></div>
                <div><p className="text-muted-foreground">IP Address</p><p className="font-mono">{selected.ipAddress ?? "—"}</p></div>
                <div><p className="text-muted-foreground">User Agent</p><p className="text-xs truncate">{selected.userAgent ?? "—"}</p></div>
              </div>
              {selected.metadata && (
                <div>
                  <p className="text-sm font-medium mb-2">Metadata</p>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-48">
                    {JSON.stringify(typeof selected.metadata === "string" ? JSON.parse(selected.metadata) : selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
              {selected.changes && (
                <div>
                  <p className="text-sm font-medium mb-2">Changes</p>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-48">
                    {JSON.stringify(typeof selected.changes === "string" ? JSON.parse(selected.changes) : selected.changes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
